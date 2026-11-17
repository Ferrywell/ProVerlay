/**
 * Edit settings panel for the Image widget (`/control?configure=<id>`):
 * upload several images at once (file picker or drag-and-drop), reorder,
 * rename and remove them, and set placement, size, auto-hide and carousel.
 * Settings save on change; list edits go through /api/graphics/:id/images.
 */
import { patchGraphic } from '/public/shared/client.js'
import { enqueue } from '/public/shared/operate-ui.js'
import { showErrorToast, showToast } from '/public/shared/toast.js'
import { projectAssetUrl } from '/public/shared/active-project.js'
import {
  IMAGE_FILE_RE,
  IMAGE_ROTATION_DEFAULT_MS,
  IMAGE_ROTATION_MIN_MS,
  imageItems,
  imageSize,
  imageVariant
} from '/public/shared/image-list.js'

const escapeHtml = (value = '') =>
  String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;')

async function api(method, url, body) {
  let res
  try {
    res = await fetch(url, {
      method,
      headers: body === undefined || body instanceof FormData ? {} : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : body instanceof FormData ? body : JSON.stringify(body)
    })
  } catch {
    throw new Error('ProVerlay server unreachable')
  }
  const json = await res.json().catch(() => null)
  if (!res.ok) throw new Error(json?.error || `Request failed (HTTP ${res.status})`)
  return json
}

/**
 * @param {HTMLElement} panel  the #image-panel section
 * @param {{ getProjectId: () => string, promptName: Function }} deps
 */
export function createImagePanel(panel, { getProjectId, promptName }) {
  if (!panel) return { sync() {}, close() {} }
  const list = panel.querySelector('#image-list')
  const fileInput = panel.querySelector('#image-files')
  const drop = panel.querySelector('#image-drop')
  const status = panel.querySelector('#image-upload-status')
  const form = panel.querySelector('#image-settings')
  let graphic = null

  const graphicUrl = (path = '') => `/api/graphics/${encodeURIComponent(graphic.id)}/images${path}`

  /* ------------------------------------------------------------- list */

  function renderList() {
    const images = imageItems(graphic?.data)
    if (!images.length) {
      list.innerHTML = '<li class="inspector-empty-state">No images yet. Drop files above or choose them.</li>'
      return
    }
    const activeId = graphic.data?.activeImageId
    list.innerHTML = images
      .map((img, i) => {
        const live = graphic.visible && img.id === activeId
        return `<li class="roster-item image-item${live ? ' is-active' : ''}" data-image-id="${escapeHtml(img.id)}">
          <span class="image-item__thumb"><img src="${escapeHtml(projectAssetUrl(img.src))}" alt="" loading="lazy" decoding="async" /></span>
          <span class="roster-item__body image-item__body">
            <span class="roster-item__name">${escapeHtml(img.name || img.src)}</span>
            <span class="roster-item__meta">${escapeHtml(img.src)}${live ? ' · on air' : ''}</span>
          </span>
          <span class="roster-item__actions">
            <button type="button" class="button button--secondary" data-image-move="-1" title="Move up" aria-label="Move up"${i === 0 ? ' disabled' : ''}>↑</button>
            <button type="button" class="button button--secondary" data-image-move="1" title="Move down" aria-label="Move down"${i === images.length - 1 ? ' disabled' : ''}>↓</button>
            <button type="button" class="button button--secondary" data-image-rename title="Rename" aria-label="Rename">✎</button>
            <button type="button" class="button button--secondary" data-image-delete title="Remove from list" aria-label="Remove from list">×</button>
          </span>
        </li>`
      })
      .join('')
  }

  list?.addEventListener('click', async (event) => {
    const btn = event.target.closest('button')
    const item = event.target.closest('[data-image-id]')
    if (!btn || !item || !graphic) return
    const id = item.dataset.imageId
    const images = imageItems(graphic.data)
    const img = images.find((x) => x.id === id)
    if (!img) return
    const gid = graphic.id
    try {
      if (btn.dataset.imageMove) {
        const ids = images.map((x) => x.id)
        const from = ids.indexOf(id)
        const to = from + Number(btn.dataset.imageMove)
        if (to < 0 || to >= ids.length) return
        ids.splice(to, 0, ids.splice(from, 1)[0])
        await enqueue(gid, () => api('PUT', graphicUrl('/order'), { ids }))
      } else if (btn.hasAttribute('data-image-rename')) {
        const name = await promptName({ title: 'Rename image', label: 'Name', defaultValue: img.name || '' })
        if (name) await enqueue(gid, () => api('PATCH', graphicUrl(`/${encodeURIComponent(id)}`), { name }))
      } else if (btn.hasAttribute('data-image-delete')) {
        const onAir = graphic.visible && graphic.data?.activeImageId === id
        const question = onAir
          ? `"${img.name || img.src}" is on air. Remove it from the list and take the widget off air?`
          : `Remove "${img.name || img.src}" from the list? The file stays in the project assets.`
        if (!window.confirm(question)) return
        await enqueue(gid, () => api('DELETE', graphicUrl(`/${encodeURIComponent(id)}`)))
      }
    } catch (err) {
      showErrorToast(`Image list not changed: ${err.message}`)
    }
  })

  /* ----------------------------------------------------------- upload */

  async function uploadFiles(files) {
    if (!graphic) return
    const accepted = [...files].filter((f) => IMAGE_FILE_RE.test(f.name))
    const skipped = files.length - accepted.length
    if (!accepted.length) {
      showErrorToast('No images to add: use PNG, WebP, JPEG, SVG or GIF files')
      return
    }
    const gid = graphic.id
    const projectId = getProjectId()
    const uploaded = []
    const failed = []
    for (const [i, file] of accepted.entries()) {
      if (status) status.textContent = `Uploading ${i + 1} of ${accepted.length}…`
      try {
        const body = new FormData()
        body.append('file', file, file.name)
        const res = await api('POST', `/api/projects/${encodeURIComponent(projectId)}/assets`, body)
        uploaded.push({ src: res.filename })
      } catch (err) {
        failed.push(`${file.name} (${err.message})`)
      }
    }
    try {
      if (uploaded.length) await enqueue(gid, () => api('POST', `/api/graphics/${encodeURIComponent(gid)}/images`, { images: uploaded }))
    } catch (err) {
      failed.push(err.message)
      uploaded.length = 0
    }
    if (status) status.textContent = ''
    if (uploaded.length) showToast(`${uploaded.length} ${uploaded.length === 1 ? 'image' : 'images'} added`, { type: 'success', duration: 2500 })
    if (failed.length) showErrorToast(`Not added: ${failed.join(', ')}`)
    if (skipped) showToast(`${skipped} ${skipped === 1 ? 'file was' : 'files were'} skipped (not an image)`, { type: 'warning' })
  }

  fileInput?.addEventListener('change', async () => {
    const files = [...(fileInput.files || [])]
    fileInput.value = ''
    if (files.length) await uploadFiles(files)
  })

  if (drop) {
    const setOver = (on) => drop.classList.toggle('is-dragover', on)
    drop.addEventListener('dragover', (event) => {
      if (!event.dataTransfer?.types?.includes('Files')) return
      event.preventDefault()
      setOver(true)
    })
    drop.addEventListener('dragleave', () => setOver(false))
    drop.addEventListener('drop', async (event) => {
      event.preventDefault()
      setOver(false)
      const files = [...(event.dataTransfer?.files || [])]
      if (files.length) await uploadFiles(files)
    })
    drop.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault()
        fileInput?.click()
      }
    })
  }

  /* --------------------------------------------------------- settings */

  const field = (name) => form?.elements.namedItem(name)

  function setIfIdle(name, value) {
    const el = field(name)
    if (!el || el === document.activeElement) return
    if (el.type === 'checkbox') el.checked = Boolean(value)
    else if (el.value !== String(value)) el.value = String(value)
  }

  function fillSettings() {
    const d = graphic.data || {}
    const variant = imageVariant(d)
    const size = imageSize(d)
    setIfIdle('variant', variant)
    setIfIdle('position', graphic.position || 'center')
    setIfIdle('sizeMode', d.size?.mode || 'original')
    setIfIdle('sizePercent', size.percent)
    setIfIdle('autoHideSeconds', Math.round((Number(d.autoHideMs) || 0) / 1000))
    setIfIdle('rotationEnabled', Boolean(d.rotation?.enabled))
    setIfIdle('rotationSeconds', Math.round((Number(d.rotation?.intervalMs) || IMAGE_ROTATION_DEFAULT_MS) / 1000))
    // Only show what applies to the chosen placement.
    panel.querySelectorAll('[data-image-free-only]').forEach((el) => (el.hidden = variant !== 'free'))
    const showPercent = variant === 'lowerThirdSlot' || (variant === 'free' && field('sizeMode')?.value === 'percent')
    panel.querySelectorAll('[data-image-percent]').forEach((el) => (el.hidden = !showPercent))
    panel.querySelectorAll('[data-image-rotation]').forEach((el) => (el.hidden = !field('rotationEnabled')?.checked))
  }

  const clampInt = (value, min, max, fallback) => {
    const n = Math.round(Number(value))
    return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback
  }

  function patchFor(name) {
    const v = (n) => field(n)?.value
    switch (name) {
      case 'variant':
        return { data: { variant: v('variant') } }
      case 'position':
        return { position: v('position') }
      case 'sizeMode':
        return { data: { size: { mode: v('sizeMode') } } }
      case 'sizePercent':
        return { data: { size: { percent: clampInt(v('sizePercent'), 1, 100, 50) } } }
      case 'autoHideSeconds':
        return { data: { autoHideMs: clampInt(v('autoHideSeconds'), 0, 3600, 0) * 1000 } }
      case 'rotationEnabled':
      case 'rotationSeconds':
        return {
          data: {
            rotation: {
              enabled: Boolean(field('rotationEnabled')?.checked),
              intervalMs: Math.max(IMAGE_ROTATION_MIN_MS, clampInt(v('rotationSeconds'), 2, 600, 8) * 1000)
            }
          }
        }
      default:
        return null
    }
  }

  form?.addEventListener('submit', (event) => event.preventDefault())
  form?.addEventListener('change', async (event) => {
    if (!graphic) return
    const patch = patchFor(event.target.name)
    if (!patch) return
    fillSettings()
    const gid = graphic.id
    await enqueue(gid, () => patchGraphic(gid, patch))
  })

  return {
    sync(next) {
      graphic = next
      renderList()
      fillSettings()
    },
    close() {
      graphic = null
      if (status) status.textContent = ''
    }
  }
}
