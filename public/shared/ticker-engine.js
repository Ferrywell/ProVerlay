import { enabledTickerTexts } from '/public/shared/ticker-messages.js'

const engines = new Map()

/**
 * Bouwt één segment: elk bericht gevolgd door een divider, óók na het
 * laatste bericht. Zo is de overgang van laatste → eerste bericht in de
 * loop identiek aan de spacing tussen berichten.
 */
function buildSegment(messages, separator) {
  const items = enabledTickerTexts(messages)
  if (!items.length) return null
  const span = document.createElement('span')
  span.className = 'ticker-content'
  for (const item of items) {
    span.appendChild(document.createTextNode(item))
    const sep = document.createElement('span')
    sep.className = 'ticker-sep'
    sep.textContent = (separator || '•').trim() || '•'
    span.appendChild(sep)
  }
  return span
}

export function mountCustomTicker(layer, graphic) {
  stopCustomTicker(graphic.id)
  const board = layer.querySelector(`[data-ticker-id="${graphic.id}"]`)
  if (!board) return

  const data = graphic.data || {}
  const track = board.querySelector('.ticker-track')
  const windowEl = board.querySelector('.ticker-window')
  const span = buildSegment(data.messages, data.separator)
  if (!track || !windowEl) return
  if (!span) {
    track.innerHTML = ''
    track.style.transform = 'translate3d(0, -50%, 0)'
    return
  }

  track.innerHTML = ''
  track.appendChild(span)
  track.style.transform = 'translate3d(0, -50%, 0)'

  const speed = Number(data.speed) || 90
  let offset = 0
  let last = performance.now()
  let segmentWidth = 0
  let clones = 1
  let measureAttempts = 0

  const ensureClones = () => {
    segmentWidth = span.offsetWidth
    if (!segmentWidth) return false
    const need = Math.ceil((windowEl.clientWidth * 2) / segmentWidth) + 1
    while (clones < need) {
      const copy = span.cloneNode(true)
      copy.setAttribute('aria-hidden', 'true')
      track.appendChild(copy)
      clones += 1
    }
    return true
  }

  const tick = (now) => {
    if (!segmentWidth) {
      if (ensureClones()) {
        last = now
      } else if (measureAttempts++ < 120) {
        engines.set(graphic.id, { frame: requestAnimationFrame(tick), track })
        return
      }
    }
    const dt = Math.min(0.1, (now - last) / 1000)
    last = now
    offset -= speed * dt
    if (segmentWidth > 0 && offset <= -segmentWidth) {
      offset += segmentWidth
    }
    track.style.transform = `translate3d(${offset}px, -50%, 0)`
    engines.set(graphic.id, { frame: requestAnimationFrame(tick), track })
  }

  ensureClones()
  engines.set(graphic.id, { frame: requestAnimationFrame(tick), track })
}

export function stopCustomTicker(id) {
  const entry = engines.get(id)
  if (!entry) return
  if (entry.frame) cancelAnimationFrame(entry.frame)
  if (entry.track) entry.track.style.transform = 'translate3d(0, -50%, 0)'
  engines.delete(id)
}

export function stopAllTickers() {
  for (const id of [...engines.keys()]) stopCustomTicker(id)
}
