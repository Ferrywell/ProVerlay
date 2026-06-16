import { resolveOperateWidgetId } from '/public/shared/device.js'
import {
  operateShellHtml,
  refreshOperateSection,
  wireOperateSection
} from '/public/shared/operate-handlers.js'
import { wireRenderPreviewLinks } from '/public/shared/render-preview.js'
import { applyServerTimeFromState } from '/public/shared/server-time.js'

const widgetId = resolveOperateWidgetId()
const root = document.getElementById('operate-root')
const title = document.getElementById('operate-title')
const subtitle = document.getElementById('operate-subtitle')
const connectionStatus = document.getElementById('connection-status')

let currentState = null

function setConnectionStatus(connected) {
  connectionStatus?.classList.toggle('is-connected', connected)
  connectionStatus?.classList.toggle('is-offline', !connected)
}

function getGraphic(id) {
  return currentState?.graphics?.find((g) => g.id === id) || null
}

function renderMissing(message) {
  root.innerHTML = `<section class="empty-state">${message}</section>`
  if (title) title.textContent = 'Operate'
  if (subtitle) subtitle.hidden = true
}

function render() {
  if (!widgetId) {
    renderMissing('No widget id. Open <code>/operate?graphic=&lt;id&gt;</code> or <code>/operate/&lt;id&gt;</code>.')
    return
  }

  const graphic = getGraphic(widgetId)
  if (!graphic) {
    renderMissing(`Widget <code>${widgetId}</code> not found in the active project.`)
    return
  }

  const operatorFocusTypes = new Set(['lowerThirdShow', 'quizShow'])
  if (operatorFocusTypes.has(graphic.type)) {
    window.location.replace(`/operator?focus=${encodeURIComponent(widgetId)}`)
    return
  }

  if (title) title.textContent = graphic.name || 'Operate'
  if (subtitle) {
    subtitle.hidden = false
    subtitle.textContent = graphic.type
  }

  let section = root.querySelector(`[data-graphic-id="${graphic.id}"]`)
  if (!section) {
    root.innerHTML = operateShellHtml(graphic)
    section = root.querySelector(`[data-graphic-id="${graphic.id}"]`)
    wireOperateSection(root, getGraphic)
  }

  refreshOperateSection(section, graphic)

  if (!graphic.operator) {
    const mount = section.querySelector('[data-operate-mount]')
    if (mount && !mount.innerHTML.trim()) {
      mount.innerHTML =
        '<p class="op-status">This widget is not marked for operator control. Use Go live above or open the dashboard.</p>'
    }
  }
}

function applyState(state) {
  applyServerTimeFromState(state)
  currentState = state
  render()
}

wireRenderPreviewLinks(document, () => currentState?.settings)

const socket = io()
socket.on('connect', () => setConnectionStatus(true))
socket.on('disconnect', () => setConnectionStatus(false))
socket.on('stateChanged', applyState)

fetch('/api/state')
  .then((r) => r.json())
  .then(applyState)
  .catch(() => renderMissing('Could not load show state.'))
