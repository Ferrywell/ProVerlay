/**
 * Image widget (`image`): list operations and the auto-hide / carousel timers.
 * Data model and pure helpers: public/shared/image-list.js; migration of old
 * single-image widgets: server/imageMigration.js.
 */
import crypto from 'crypto'
import { getGraphic, getState, onStateChange, updateGraphic } from './state.js'
import { badRequest, cleanImageSrc } from './validation.js'
import {
  MAX_IMAGES,
  activeImage,
  imageAutoHideMs,
  imageItems,
  imageNameFromFile,
  imageRotationMs,
  stepImageId
} from '../public/shared/image-list.js'

function imageId() {
  return `img-${crypto.randomUUID().slice(0, 8)}`
}

function cleanText(value, max = 200) {
  return String(value ?? '').trim().slice(0, max)
}

/* ------------------------------------------------------------ list edits */

export function getImageGraphic(graphicId) {
  const graphic = getGraphic(graphicId)
  return graphic && graphic.type === 'image' ? graphic : null
}

/** Runs inside the state write queue, so concurrent edits never overwrite each other. */
function updateImageGraphic(graphicId, fn) {
  return updateGraphic(graphicId, (graphic) => {
    if (graphic.type !== 'image') return null
    return fn(graphic, imageItems(graphic.data))
  })
}

/** Add one image ({ src, name?, alt? }) or several ({ images: [...] }). Returns the added items. */
export async function addImages(graphicId, body = {}) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw badRequest('Body must be a JSON object')
  const incoming = Array.isArray(body.images) ? body.images : [body]
  if (!incoming.length) throw badRequest('No images given')
  const cleaned = incoming.map((item, i) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) throw badRequest(`images[${i}]: expected an object`)
    const src = cleanImageSrc(item.src, Array.isArray(body.images) ? `images[${i}].src` : 'src')
    return { src, name: cleanText(item.name) || imageNameFromFile(src) || src, alt: cleanText(item.alt) }
  })

  let added = null
  const result = await updateImageGraphic(graphicId, (graphic, images) => {
    if (images.length + cleaned.length > MAX_IMAGES) throw badRequest(`At most ${MAX_IMAGES} images per widget`)
    added = cleaned.map((item) => ({ id: imageId(), ...item }))
    return { ...graphic, data: { ...graphic.data, images: [...images, ...added] } }
  })
  return result ? added : null
}

export async function updateImage(graphicId, imageIdParam, patch = {}) {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) throw badRequest('Body must be a JSON object')
  let updated = null
  await updateImageGraphic(graphicId, (graphic, images) => {
    if (!images.some((img) => img.id === imageIdParam)) return null
    const next = images.map((img) => {
      if (img.id !== imageIdParam) return img
      updated = {
        ...img,
        ...(patch.name !== undefined ? { name: cleanText(patch.name) } : {}),
        ...(patch.alt !== undefined ? { alt: cleanText(patch.alt) } : {}),
        ...(patch.src !== undefined ? { src: cleanImageSrc(patch.src) } : {})
      }
      return updated
    })
    return { ...graphic, data: { ...graphic.data, images: next } }
  })
  return updated
}

/** Remove an image from the list (the file stays in the project assets). */
export async function deleteImage(graphicId, imageIdParam) {
  let deleted = false
  await updateImageGraphic(graphicId, (graphic, images) => {
    const next = images.filter((img) => img.id !== imageIdParam)
    if (next.length === images.length) return null
    deleted = true
    const data = { ...graphic.data, images: next }
    if (graphic.data?.activeImageId !== imageIdParam) return { ...graphic, data }
    // The image on air is gone: take the widget off air.
    return { ...graphic, visible: false, data: { ...data, activeImageId: null } }
  })
  return deleted
}

/** Reorder: `ids` must list every image exactly once. */
export async function reorderImages(graphicId, ids) {
  if (!Array.isArray(ids) || ids.some((id) => typeof id !== 'string')) throw badRequest('ids: expected an array of image ids')
  return updateImageGraphic(graphicId, (graphic, images) => {
    const byId = new Map(images.map((img) => [img.id, img]))
    if (ids.length !== images.length || new Set(ids).size !== ids.length || ids.some((id) => !byId.has(id))) {
      throw badRequest('ids: must list every image of the widget exactly once')
    }
    return { ...graphic, data: { ...graphic.data, images: ids.map((id) => byId.get(id)) } }
  })
}

/** Put one image on air (combined output). */
export async function showImage(graphicId, imageIdParam) {
  return updateImageGraphic(graphicId, (graphic, images) => {
    if (!images.some((img) => img.id === imageIdParam)) return null
    return { ...graphic, visible: true, data: { ...graphic.data, activeImageId: imageIdParam } }
  })
}

/** Next/previous image, put on air. Returns null when the widget is missing or empty. */
export async function stepImage(graphicId, direction = 'next', { wrap = true } = {}) {
  return updateImageGraphic(graphicId, (graphic, images) => {
    const nextId = stepImageId(images, graphic.data?.activeImageId || null, direction, { wrap })
    if (!nextId) return images.length ? graphic : null
    return { ...graphic, visible: true, data: { ...graphic.data, activeImageId: nextId } }
  })
}

/* ---------------------------------------------------------------- timers */

/**
 * Auto-hide and carousel run on the server, so every output (OBS, vMix, the
 * dashboard, the operator, Companion) agrees on what is on air. Both restart
 * on every take: a new image, or the widget going on air.
 */
const timers = new Map() // graphicId -> { key, hide, rotate }
let unsubscribe = null

function clearImageTimers(id) {
  const t = timers.get(id)
  if (!t) return
  clearTimeout(t.hide)
  clearInterval(t.rotate)
  timers.delete(id)
}

function reconcile(state) {
  const seen = new Set()
  for (const g of state?.graphics || []) {
    if (g?.type !== 'image') continue
    seen.add(g.id)
    const hideMs = imageAutoHideMs(g.data)
    const rotateMs = imageRotationMs(g.data)
    const onAir = Boolean(g.visible && activeImage(g.data))
    if (!onAir || (!hideMs && !rotateMs)) {
      clearImageTimers(g.id)
      continue
    }
    const key = `${g.data.activeImageId}|${hideMs}|${rotateMs}`
    const current = timers.get(g.id)
    if (current?.key === key) continue
    // A carousel step changes the key too; the auto-hide keeps counting from the take.
    const carouselStep = Boolean(current && current.carouselTo === g.data.activeImageId && current.hideMs === hideMs)
    const keepHide = carouselStep ? current.hide : null
    if (current) {
      if (!keepHide) clearTimeout(current.hide)
      clearInterval(current.rotate)
    }
    const entry = { key, hideMs, hide: keepHide, rotate: null, carouselTo: null }
    if (hideMs && !keepHide) {
      entry.hide = setTimeout(() => {
        clearImageTimers(g.id)
        updateImageGraphic(g.id, (graphic) => (graphic.visible ? { ...graphic, visible: false } : null)).catch(
          (err) => console.warn(`[image] auto-hide of ${g.id} failed: ${err.message}`)
        )
      }, hideMs)
    }
    if (rotateMs) {
      entry.rotate = setInterval(() => {
        updateImageGraphic(g.id, (graphic, images) => {
          if (!graphic.visible) return null
          const nextId = stepImageId(images, graphic.data?.activeImageId || null, 'next')
          if (!nextId || nextId === graphic.data?.activeImageId) return null
          const t = timers.get(g.id)
          if (t) t.carouselTo = nextId
          return { ...graphic, data: { ...graphic.data, activeImageId: nextId } }
        }).catch((err) => console.warn(`[image] carousel of ${g.id} failed: ${err.message}`))
      }, rotateMs)
    }
    timers.set(g.id, entry)
  }
  for (const id of [...timers.keys()]) if (!seen.has(id)) clearImageTimers(id)
}

export function initImageTimers() {
  unsubscribe?.()
  unsubscribe = onStateChange(reconcile)
  reconcile(getState())
}

export function shutdownImageTimers() {
  unsubscribe?.()
  unsubscribe = null
  for (const id of [...timers.keys()]) clearImageTimers(id)
}
