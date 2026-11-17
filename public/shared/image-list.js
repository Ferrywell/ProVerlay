/**
 * Image widget (`image`): a list of pre-designed graphics (PNG lower thirds,
 * logo bugs, sponsor boards, full-screen slides) with one active image.
 * Pure helpers shared by the server, the render and the control pages.
 *
 * data = {
 *   images: [{ id, src, name, alt }],   // src = file name in the project's assets/
 *   activeImageId: string | null,
 *   variant: 'free' | 'lowerThirdSlot' | 'fullScreen',
 *   size: { mode: 'original' | 'fitWidth' | 'fitCanvas' | 'percent', percent: 50 },
 *   autoHideMs: 0,                      // 0 = stays on air
 *   rotation: { enabled: false, intervalMs: 8000 }
 * }
 *
 * Old image widgets ({ src, alt }) are migrated on load (server/imageWidget.js).
 * Missing fields mean the defaults below, so a migrated widget renders as before.
 */

/** File types the Image widget accepts (animated GIF/APNG included). */
export const IMAGE_FILE_RE = /\.(png|apng|jpe?g|webp|gif|svg)$/i

export const IMAGE_VARIANTS = [
  { value: 'free', label: 'Free placement' },
  { value: 'lowerThirdSlot', label: 'Lower-third slot' },
  { value: 'fullScreen', label: 'Full screen' }
]

export const IMAGE_SIZE_MODES = [
  { value: 'original', label: 'Original size' },
  { value: 'fitWidth', label: 'Fit canvas width' },
  { value: 'fitCanvas', label: 'Fit canvas' },
  { value: 'percent', label: 'Percentage of canvas width' }
]

/** Most images one widget can hold. */
export const MAX_IMAGES = 200

export const IMAGE_DEFAULT_PERCENT = 50
/** Width of the lower-third slot when no percentage is set. */
export const IMAGE_SLOT_DEFAULT_PERCENT = 60
export const IMAGE_ROTATION_MIN_MS = 2000
export const IMAGE_ROTATION_DEFAULT_MS = 8000

const VARIANT_SET = new Set(IMAGE_VARIANTS.map((v) => v.value))
const SIZE_SET = new Set(IMAGE_SIZE_MODES.map((m) => m.value))

const asObject = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {})

export function imageItems(data) {
  const list = asObject(data).images
  return Array.isArray(list) ? list.filter((img) => img && typeof img.id === 'string' && img.id && img.src) : []
}

export function activeImage(data) {
  const d = asObject(data)
  return imageItems(d).find((img) => img.id === d.activeImageId) || null
}

export function imageVariant(data) {
  const v = asObject(data).variant
  return VARIANT_SET.has(v) ? v : 'free'
}

/** { mode, percent } with defaults; the lower-third slot always uses a percentage. */
export function imageSize(data) {
  const d = asObject(data)
  const size = asObject(d.size)
  const variant = imageVariant(d)
  const rawPercent = Number(size.percent)
  const percent =
    Number.isFinite(rawPercent) && rawPercent > 0
      ? Math.min(100, Math.max(1, rawPercent))
      : variant === 'lowerThirdSlot'
        ? IMAGE_SLOT_DEFAULT_PERCENT
        : IMAGE_DEFAULT_PERCENT
  if (variant === 'fullScreen') return { mode: 'fitCanvas', percent }
  if (variant === 'lowerThirdSlot') return { mode: 'percent', percent }
  return { mode: SIZE_SET.has(size.mode) ? size.mode : 'original', percent }
}

export function imageAutoHideMs(data) {
  const ms = Number(asObject(data).autoHideMs)
  return Number.isFinite(ms) && ms > 0 ? Math.round(ms) : 0
}

/** Carousel interval in ms, or 0 when rotation is off (or there is nothing to rotate). */
export function imageRotationMs(data) {
  const rotation = asObject(asObject(data).rotation)
  if (!rotation.enabled || imageItems(data).length < 2) return 0
  const ms = Number(rotation.intervalMs)
  return Math.max(IMAGE_ROTATION_MIN_MS, Number.isFinite(ms) && ms > 0 ? ms : IMAGE_ROTATION_DEFAULT_MS)
}

/** Image id after/before the active one. Without an active image, next → first, previous → last. */
export function stepImageId(images, activeId, direction = 'next', { wrap = true } = {}) {
  if (!images.length) return null
  const index = images.findIndex((img) => img.id === activeId)
  const forward = direction !== 'previous'
  if (index === -1) return forward ? images[0].id : images[images.length - 1].id
  let next = index + (forward ? 1 : -1)
  if (next < 0 || next >= images.length) {
    if (!wrap) return null
    next = (next + images.length) % images.length
  }
  return images[next].id
}

/** Display name for a file: "Sponsor board.png" → "Sponsor board". */
export function imageNameFromFile(filename) {
  return String(filename || '')
    .replace(/\.[a-z0-9]+$/i, '')
    .replace(/[_-]+/g, ' ')
    .trim()
}
