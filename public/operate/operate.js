import { resolveOperateWidgetId } from '/public/shared/device.js'
import {
  operateCardHtml,
  operateTypeLabel,
  refreshOperateCard,
  warnOnAirOverlap,
  wireOperateRoot
} from '/public/shared/operate-card.js'
import { escapeHtml } from '/public/shared/operate-ui.js'
import { wireRenderPreviewLinks } from '/public/shared/render-preview.js'
import { applyServerTimeFromState } from '/public/shared/server-time.js'
import { sharedSocket, wireConnectionState } from '/public/shared/connection.js'

const widgetId = resolveOperateWidgetId()
const root = document.getElementById('operate-root')
const title = document.getElementById('operate-title')
const subtitle = document.getElementById('operate-subtitle')

let currentState = null

const getGraphic = (id) => currentState?.graphics?.find((g) => g.id === id) || null

function renderMissing(message) {
  root.innerHTML = `<section class="empty-state">${message}</section>`
  title.textContent = 'Operate'
  subtitle.hidden = true
}

function render() {
  if (!widgetId) {
    renderMissing('No widget id. Open <code>/operate?graphic=&lt;id&gt;</code> or <code>/operate/&lt;id&gt;</code>.')
    return
  }
  const graphic = getGraphic(widgetId)
  if (!graphic) {
    renderMissing(`Widget <code>${escapeHtml(widgetId)}</code> not found in the active project. <a href="/control">Back to the Dashboard</a>`)
    return
  }

  title.textContent = graphic.name || 'Operate'
  subtitle.hidden = false
  subtitle.textContent = operateTypeLabel(graphic.type)

  let card = root.querySelector(`[data-graphic-id="${CSS.escape(graphic.id)}"]`)
  if (!card || card.dataset.type !== graphic.type) {
    root.innerHTML = operateCardHtml(graphic, { showTitle: false })
    card = root.firstElementChild
  }
  refreshOperateCard(card, graphic)
}

function applyState(state) {
  applyServerTimeFromState(state)
  currentState = state
  render()
}

wireOperateRoot(root, getGraphic, {
  onWentLive: (graphic) => warnOnAirOverlap(graphic, currentState?.graphics)
})
wireRenderPreviewLinks(document, () => currentState?.settings)

const socket = sharedSocket()
wireConnectionState(socket, { pill: document.getElementById('connection-status'), controls: [root] })
socket.on('stateChanged', applyState)

fetch('/api/state')
  .then((r) => r.json())
  .then(applyState)
  .catch(() => renderMissing('Could not load show state.'))
