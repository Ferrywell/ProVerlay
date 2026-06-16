import { projectCanvas } from '/public/shared/canvas-layout.js'

const PREVIEW_WINDOW = 'proverlay-render-preview'
const CHROME_HEIGHT = 48

function normalizeRenderPath(href) {
  if (!href) return '/render'
  try {
    const u = new URL(href, window.location.origin)
    if (u.origin !== window.location.origin) return null
    if (!u.pathname.startsWith('/render')) return null
    return `${u.pathname}${u.search}`
  } catch {
    return null
  }
}

async function resolveCanvasSettings(settings) {
  if (settings && (settings.canvasWidth || settings.canvasHeight)) return settings
  try {
    const res = await fetch('/api/state')
    if (!res.ok) return {}
    const state = await res.json()
    return state.settings || {}
  } catch {
    return {}
  }
}

export async function openRenderPreview(path = '/render', settings) {
  const normalized = normalizeRenderPath(path)
  if (!normalized) return null

  const resolved = await resolveCanvasSettings(settings)
  const { width: cw, height: ch } = projectCanvas(resolved)
  const aspect = cw / ch

  const url = new URL(normalized, window.location.origin)
  url.searchParams.set('previewWindow', '1')

  const maxW = Math.min(cw, Math.floor(window.screen.availWidth * 0.72), 1280)
  const outerW = Math.max(480, maxW)
  const outerH = Math.round(outerW / aspect) + CHROME_HEIGHT

  const features = [
    'popup=yes',
    `width=${outerW}`,
    `height=${outerH}`,
    'menubar=no',
    'toolbar=no',
    'location=no',
    'status=no',
    'resizable=yes',
    'scrollbars=no'
  ].join(',')

  const win = window.open(url.toString(), PREVIEW_WINDOW, features)
  win?.focus()
  return win
}

export function wireRenderPreviewLinks(root = document, getSettings) {
  root.addEventListener('click', (event) => {
    const link = event.target.closest('a[href]')
    if (!link) return
    const path = normalizeRenderPath(link.getAttribute('href'))
    if (!path) return
    event.preventDefault()
    void openRenderPreview(path, getSettings?.())
  })
}
