import {
  operateCardHtml,
  refreshOperateCard,
  ensureTimers,
  warnOnAirOverlap,
  wireOperateRoot
} from '/public/shared/operate-card.js'
import { escapeHtml } from '/public/shared/operate-ui.js'
import { wireRenderPreviewLinks } from '/public/shared/render-preview.js'
import { applyServerTimeFromState } from '/public/shared/server-time.js'
import { noteActiveProject } from '/public/shared/active-project.js'
import { sharedSocket, wireConnectionState } from '/public/shared/connection.js'
import { widgetTypeAvailable } from '/public/shared/experimental.js'

const root = document.getElementById('operator-root')
const switcher = document.getElementById('op-switcher')
const navBar = document.querySelector('.pv-app-header')

const VIEW_KEY = 'pv-operator-view'
const ALL = 'all'

let currentState = null

const getGraphic = (id) => (currentState?.graphics || []).find((g) => g.id === id) || null
// Experimental widget types (e.g. the F1 tower) stay off the operator unless their flag is on
const operatorGraphics = () =>
  (currentState?.graphics || []).filter((g) => g.operator && widgetTypeAvailable(currentState, g.type))

/* ---------------------------------------------------- widget switcher */

function readStoredView() {
  try {
    return localStorage.getItem(VIEW_KEY)
  } catch {
    return null
  }
}

/** ?focus=<id> (links from the dashboard) wins over the remembered view. */
let view = new URLSearchParams(window.location.search).get('focus') || readStoredView() || ALL

function setView(next) {
  view = next
  try {
    localStorage.setItem(VIEW_KEY, next)
  } catch {
    /* private mode */
  }
  const url = new URL(window.location.href)
  if (next === ALL) url.searchParams.delete('focus')
  else url.searchParams.set('focus', next)
  window.history.replaceState(null, '', url)
  render()
  window.scrollTo({ top: 0 })
}

function resolvedView(items) {
  return view !== ALL && items.some((g) => g.id === view) ? view : ALL
}

function renderSwitcher(items, active) {
  switcher.hidden = items.length < 2
  if (switcher.hidden) return
  const html = [
    `<button type="button" class="op-switcher__btn" data-view="${ALL}" aria-pressed="${active === ALL}">All</button>`,
    ...items.map(
      (g) => `<button type="button" class="op-switcher__btn" data-view="${escapeHtml(g.id)}" aria-pressed="${active === g.id}">
        <span class="op-switcher__dot${g.visible ? ' is-live' : ''}" aria-hidden="true"></span>
        <span class="op-switcher__name">${escapeHtml(g.name || g.id)}</span>
        ${g.visible ? '<span class="visually-hidden">(on air)</span>' : ''}
      </button>`
    )
  ].join('')
  if (switcher.dataset.html === html) return
  const focused = switcher.contains(document.activeElement) ? document.activeElement.dataset.view : null
  switcher.innerHTML = html
  switcher.dataset.html = html
  if (focused) switcher.querySelector(`[data-view="${CSS.escape(focused)}"]`)?.focus()
  switcher.querySelector('[aria-pressed="true"]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
}

switcher.addEventListener('click', (event) => {
  const btn = event.target.closest('[data-view]')
  if (btn) setView(btn.dataset.view)
})

// Keep the switcher just below the sticky nav bar.
new ResizeObserver(() => {
  document.documentElement.style.setProperty('--op-nav-height', `${navBar.offsetHeight}px`)
}).observe(navBar)

/* --------------------------------------------------------------- render */

function renderEmpty() {
  const hasAny = (currentState?.graphics || []).length > 0
  root.innerHTML = hasAny
    ? `<section class="empty-state">
        <p class="empty-state__title">No widgets for live control</p>
        <p>None of the widgets in this project are enabled for the operator. Enable “Operator” on a widget in the Dashboard.</p>
      </section>`
    : `<section class="empty-state">
        <p class="empty-state__title">No widgets yet — add your first graphic</p>
        <p>Open the Dashboard on a computer and choose <strong>Add widget</strong> or <strong>Create from design</strong>. New widgets appear here right away.</p>
      </section>`
  switcher.hidden = true
  document.body.classList.remove('operator--single', 'operator--multi')
}

function render() {
  const items = operatorGraphics()
  if (!items.length) {
    renderEmpty()
    ensureTimers()
    return
  }

  const active = resolvedView(items)
  renderSwitcher(items, active)
  document.body.classList.toggle('operator--single', items.length === 1 || active !== ALL)
  document.body.classList.toggle('operator--multi', items.length > 1 && active === ALL)

  const existing = [...root.querySelectorAll(':scope > [data-graphic-id]')]
  const sameCards =
    existing.length === items.length &&
    existing.every((card, i) => card.dataset.graphicId === items[i].id && card.dataset.type === items[i].type)
  if (!sameCards) root.innerHTML = items.map((g) => operateCardHtml(g)).join('')

  for (const card of root.querySelectorAll(':scope > [data-graphic-id]')) {
    card.hidden = active !== ALL && card.dataset.graphicId !== active
    refreshOperateCard(card, getGraphic(card.dataset.graphicId))
  }
  ensureTimers()
}

function applyState(state) {
  applyServerTimeFromState(state)
  noteActiveProject(state)
  currentState = state
  render()
}

wireOperateRoot(root, getGraphic, {
  confirmDecrement: true,
  onWentLive: (graphic) => warnOnAirOverlap(graphic, currentState?.graphics)
})
wireRenderPreviewLinks(document, () => currentState?.settings)

const socket = sharedSocket()
wireConnectionState(socket, {
  pill: document.getElementById('connection-status'),
  controls: [root, switcher]
})
socket.on('stateChanged', applyState)

/* Desk mode: two columns on wide screens in the "All" view. */
const DESK_KEY = 'pv-operator-desk'
const deskToggle = document.getElementById('desk-mode-toggle')

function deskOn() {
  try {
    return localStorage.getItem(DESK_KEY) === '1'
  } catch {
    return false
  }
}

function syncDeskMode() {
  const on = deskOn()
  document.body.classList.toggle('operator--desk', on)
  deskToggle?.setAttribute('aria-pressed', String(on))
  deskToggle?.classList.toggle('is-active', on)
}

deskToggle?.addEventListener('click', () => {
  try {
    localStorage.setItem(DESK_KEY, deskOn() ? '0' : '1')
  } catch {
    /* private mode */
  }
  syncDeskMode()
})
syncDeskMode()

fetch('/api/state')
  .then((r) => r.json())
  .then(applyState)
