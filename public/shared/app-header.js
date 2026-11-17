/**
 * Shared app header for every ProVerlay page except /render.
 *
 * Page markup (static, so page scripts can find their elements):
 *
 *   <header class="pv-app-header" data-section="dashboard"
 *           data-back-href="/operator" data-back-label="Operator">
 *     <div class="pv-app-header__title"><h1>Dashboard</h1></div>
 *     <div class="pv-app-header__actions">…page actions…</div>
 *   </header>
 *
 * This module adds the logo, the project chip (switch project / manage
 * projects), the main navigation, the connection pill (#connection-status),
 * the Preview link and a menu with navigation + theme (System / Light / Dark).
 *
 * Load it as a module script BEFORE the page's own module so
 * #connection-status exists when the page script runs. The header uses the
 * page's Socket.io connection (sharedSocket); it subscribes once the document
 * is parsed, so the page script has registered its own listeners first.
 */
import { sharedSocket, wireConnectionState } from '/public/shared/connection.js'
import { detectClientDevice } from '/public/shared/device.js'
import { openRenderPreview } from '/public/shared/render-preview.js'
import { showToast, showErrorToast } from '/public/shared/toast.js'

const NAV = [
  { id: 'dashboard', label: 'Dashboard', href: '/control', desktopOnly: true },
  { id: 'operator', label: 'Operator', href: '/operator' },
  { id: 'layout', label: 'Layout', href: '/layout' },
  { id: 'data', label: 'Data', href: '/data', desktopOnly: true },
  { id: 'design', label: 'Design', href: '/design' }
]

const THEMES = [
  { id: 'system', label: 'System' },
  { id: 'light', label: 'Light' },
  { id: 'dark', label: 'Dark' }
]

const THEME_KEY = 'pv-theme'

const CHEVRON_DOWN = `<svg class="pv-icon pv-icon--chevron" viewBox="0 0 12 12" aria-hidden="true"><path d="M3 4.5 6 7.5 9 4.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`
const FOLDER_ICON = `<svg class="pv-icon" viewBox="0 0 16 16" aria-hidden="true"><path d="M2 4.25C2 3.56 2.56 3 3.25 3h3.1l1.4 1.5h5c.69 0 1.25.56 1.25 1.25v6c0 .69-.56 1.25-1.25 1.25h-9.5C2.56 13 2 12.44 2 11.75z" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/></svg>`
const MORE_ICON = `<svg class="pv-icon" viewBox="0 0 16 16" aria-hidden="true"><circle cx="3.5" cy="8" r="1.3" fill="currentColor"/><circle cx="8" cy="8" r="1.3" fill="currentColor"/><circle cx="12.5" cy="8" r="1.3" fill="currentColor"/></svg>`
const CHECK_ICON = `<svg class="pv-icon pv-icon--check" viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 8.5 6.5 11.5 12.5 4.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function el(tag, attrs = {}, html = '') {
  const node = document.createElement(tag)
  for (const [key, value] of Object.entries(attrs)) {
    if (value === undefined || value === null || value === false) continue
    node.setAttribute(key, value === true ? '' : String(value))
  }
  if (html) node.innerHTML = html
  return node
}

/* ------------------------------------------------------------------ theme */

export function readThemePreference() {
  try {
    const value = localStorage.getItem(THEME_KEY)
    return value === 'light' || value === 'dark' ? value : 'system'
  } catch {
    return 'system'
  }
}

export function applyTheme(theme) {
  const root = document.documentElement
  if (theme === 'light' || theme === 'dark') root.setAttribute('data-theme', theme)
  else root.removeAttribute('data-theme')
  // Desktop app: keep the window chrome (caption buttons) in step.
  try {
    window.proverlayDesktop?.setTheme(theme)
  } catch {
    /* bridge unavailable: chrome follows the OS theme */
  }
}

export function setThemePreference(theme) {
  try {
    if (theme === 'light' || theme === 'dark') localStorage.setItem(THEME_KEY, theme)
    else localStorage.removeItem(THEME_KEY)
  } catch {
    /* storage blocked: the choice still applies to this page */
  }
  applyTheme(theme)
}

/* --------------------------------------------------------------- popovers */

let openPopover = null

// Desktop app: the header is a window drag area, and the OS swallows clicks
// on it (no pointer events reach the page). While a popover is open the
// header stops being draggable (tahoe.css `.pv-popover-open`), so a click on
// an empty part of it reaches the pointerdown handler below and closes it.
const POPOVER_OPEN_CLASS = 'pv-popover-open'

function closePopover({ restoreFocus = false } = {}) {
  if (!openPopover) return
  const { panel, trigger } = openPopover
  panel.hidden = true
  trigger.setAttribute('aria-expanded', 'false')
  openPopover = null
  document.documentElement.classList.remove(POPOVER_OPEN_CLASS)
  if (restoreFocus) trigger.focus()
}

function menuItems(panel) {
  return [...panel.querySelectorAll('[role="menuitem"], [role="menuitemradio"], [role="radio"]')].filter(
    (item) => !item.disabled && item.offsetParent !== null
  )
}

function togglePopover(trigger, panel, { onOpen } = {}) {
  if (openPopover?.panel === panel) {
    closePopover()
    return
  }
  closePopover()
  onOpen?.()
  panel.hidden = false
  trigger.setAttribute('aria-expanded', 'true')
  openPopover = { panel, trigger }
  document.documentElement.classList.add(POPOVER_OPEN_CLASS)
  const items = menuItems(panel)
  const current = items.find((item) => item.getAttribute('aria-checked') === 'true') || items[0]
  current?.focus()
}

function wirePopoverKeys(panel) {
  panel.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      closePopover({ restoreFocus: true })
      return
    }
    if (event.key === 'Tab') {
      closePopover()
      return
    }
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return
    const items = menuItems(panel)
    if (!items.length) return
    event.preventDefault()
    const index = items.indexOf(document.activeElement)
    let next = 0
    if (event.key === 'ArrowDown') next = index < 0 ? 0 : (index + 1) % items.length
    if (event.key === 'ArrowUp') next = index <= 0 ? items.length - 1 : index - 1
    if (event.key === 'End') next = items.length - 1
    items[next].focus()
  })
}

document.addEventListener('pointerdown', (event) => {
  if (!openPopover) return
  if (openPopover.panel.contains(event.target) || openPopover.trigger.contains(event.target)) return
  closePopover()
})

// Switching to another window (or clicking into an embedded preview) closes
// the menu too, like a native menu.
window.addEventListener('blur', () => closePopover())

/* ------------------------------------------------------- confirm dialog */

function confirmSwitch({ projectName, liveCount }) {
  let dialog = document.getElementById('pv-switch-dialog')
  if (!dialog) {
    dialog = el('dialog', { id: 'pv-switch-dialog', class: 'pv-dialog', 'aria-labelledby': 'pv-switch-dialog-title' })
    dialog.innerHTML = `
      <form method="dialog" class="pv-dialog__form">
        <h2 class="pv-dialog__title" id="pv-switch-dialog-title">Switch project while on air?</h2>
        <p class="pv-dialog__body" data-bind="body"></p>
        <div class="pv-dialog__actions">
          <button class="button button--secondary" value="cancel" autofocus>Cancel</button>
          <button class="button button--go-live" value="confirm" data-bind="confirm">Switch project</button>
        </div>
      </form>`
    document.body.appendChild(dialog)
  }
  const graphics = liveCount === 1 ? '1 graphic is' : `${liveCount} graphics are`
  dialog.querySelector('[data-bind="body"]').textContent =
    `${graphics} ON AIR. Switching to “${projectName}” changes the live output immediately.`
  dialog.returnValue = ''
  return new Promise((resolve) => {
    dialog.addEventListener('close', () => resolve(dialog.returnValue === 'confirm'), { once: true })
    dialog.showModal()
  })
}

/* ------------------------------------------------------------ the header */

function buildNav(section, isDesktop, className, { asMenu = false } = {}) {
  const items = NAV.filter((item) => isDesktop || !item.desktopOnly)
  return items
    .map((item) => {
      const current = item.id === section
      const attrs = asMenu ? ' role="menuitem"' : ''
      return `<a class="${className}${current ? ' is-current' : ''}" href="${item.href}"${attrs}${current ? ' aria-current="page"' : ''}>${escapeHtml(item.label)}</a>`
    })
    .join('')
}

function mountHeader(header) {
  if (header.dataset.pvMounted === '1') return null
  header.dataset.pvMounted = '1'

  const section = header.dataset.section || ''
  const isDesktop = detectClientDevice() === 'desktop'
  const backHref = header.dataset.backHref
  const backLabel = header.dataset.backLabel || 'Back'
  const titleBlock = header.querySelector(':scope > .pv-app-header__title') || el('div', { class: 'pv-app-header__title' })
  const actions = header.querySelector(':scope > .pv-app-header__actions')

  const start = el('div', { class: 'pv-app-header__start' })
  if (backHref) {
    start.appendChild(
      el(
        'a',
        { class: 'pv-app-header__back', href: backHref, 'aria-label': `Back to ${backLabel}` },
        `<span class="pv-app-header__chevron" aria-hidden="true"></span><span class="pv-app-header__back-label">${escapeHtml(backLabel)}</span>`
      )
    )
  }
  start.appendChild(
    el(
      'a',
      { class: 'pv-app-header__brand', href: '/', title: 'ProVerlay', 'aria-label': 'ProVerlay home' },
      '<img class="pv-app-header__mark" src="/public/shared/proverlay-logo.png" alt="" width="28" height="28" />'
    )
  )
  start.appendChild(titleBlock)

  // Project chip + popover
  const chip = el('div', { class: 'pv-project-chip' })
  chip.innerHTML = `
    <button type="button" class="pv-project-chip__button" id="pv-project-chip" aria-haspopup="menu" aria-expanded="false" aria-controls="pv-project-menu">
      ${FOLDER_ICON}
      <span class="pv-project-chip__name" data-bind="project-name">Project</span>
      ${CHEVRON_DOWN}
    </button>
    <div class="pv-popover pv-project-menu" id="pv-project-menu" role="menu" aria-label="Switch project" hidden>
      <p class="pv-popover__heading">Projects</p>
      <div class="pv-project-menu__list" data-bind="project-list"></div>
      <div class="pv-popover__separator" role="separator"></div>
      <a class="pv-popover__item" role="menuitem" href="/project">Manage projects…</a>
    </div>`
  start.appendChild(chip)

  const nav = el('nav', { class: 'pv-app-header__nav', 'aria-label': 'Main' }, buildNav(section, isDesktop, 'pv-app-header__nav-link'))

  const end = el('div', { class: 'pv-app-header__end' })
  if (actions) end.appendChild(actions)

  let pill = document.getElementById('connection-status')
  if (!pill) {
    pill = el(
      'div',
      { id: 'connection-status', class: 'pill pill--sync is-connecting pv-app-header__sync', role: 'status', 'aria-live': 'polite' },
      '<span class="status-dot" aria-hidden="true"></span><span class="status-label">Connecting…</span>'
    )
  }
  end.appendChild(pill)

  const preview = el('a', { class: 'button button--tinted button--compact pv-app-header__preview', href: '/render', title: 'Open the combined render output in a preview window' }, 'Preview')
  end.appendChild(preview)

  const menu = el('div', { class: 'pv-app-menu' })
  menu.innerHTML = `
    <button type="button" class="pv-app-header__icon-button" id="pv-app-menu-button" aria-haspopup="menu" aria-expanded="false" aria-controls="pv-app-menu" aria-label="Menu" title="Menu">${MORE_ICON}</button>
    <div class="pv-popover pv-app-menu__panel" id="pv-app-menu" role="menu" aria-label="Menu" hidden>
      <div class="pv-app-menu__nav">
        <p class="pv-popover__heading">Go to</p>
        ${buildNav(section, isDesktop, 'pv-popover__item', { asMenu: true })}
        <div class="pv-popover__separator" role="separator"></div>
      </div>
      <p class="pv-popover__heading" id="pv-theme-heading">Appearance</p>
      <div class="pv-segmented pv-segmented--cols-3 pv-theme-switch" role="radiogroup" aria-labelledby="pv-theme-heading">
        ${THEMES.map((t) => `<button type="button" class="pv-segmented__btn" role="radio" aria-checked="false" data-theme-choice="${t.id}">${t.label}</button>`).join('')}
      </div>
    </div>`
  end.appendChild(menu)

  header.replaceChildren(start, nav, end)
  header.classList.add('is-mounted')
  header.classList.toggle('has-back', Boolean(backHref))

  return { header, chip, menu, preview, pill }
}

function wireTheme(menu) {
  const buttons = [...menu.querySelectorAll('[data-theme-choice]')]
  const sync = () => {
    const current = readThemePreference()
    for (const button of buttons) {
      const on = button.dataset.themeChoice === current
      button.setAttribute('aria-checked', String(on))
      button.classList.toggle('is-active', on)
    }
  }
  for (const button of buttons) {
    button.addEventListener('click', () => {
      setThemePreference(button.dataset.themeChoice)
      sync()
    })
  }
  // Another tab on this device changed the theme.
  window.addEventListener('storage', (event) => {
    if (event.key !== THEME_KEY && event.key !== null) return
    applyTheme(readThemePreference())
    sync()
  })
  sync()
}

function wireProjects(chip) {
  const button = chip.querySelector('.pv-project-chip__button')
  const panel = chip.querySelector('.pv-project-menu')
  const nameEl = chip.querySelector('[data-bind="project-name"]')
  const listEl = chip.querySelector('[data-bind="project-list"]')

  let projects = []
  let activeId = ''
  let activeName = ''
  let onAirCount = 0
  let switching = false

  const renderChip = () => {
    const name = activeName || projects.find((p) => p.id === activeId)?.name || ''
    nameEl.textContent = name || 'Project'
    button.title = name ? `Active project: ${name} — click to switch` : 'Switch project'
    button.setAttribute('aria-label', name ? `Project: ${name}. Switch project` : 'Switch project')
  }

  const renderList = () => {
    if (!projects.length) {
      listEl.innerHTML = '<p class="pv-popover__empty">No projects</p>'
      return
    }
    listEl.innerHTML = projects
      .map((p) => {
        const active = p.id === activeId
        return `<button type="button" class="pv-popover__item pv-project-menu__item${active ? ' is-active' : ''}" role="menuitemradio" aria-checked="${active}" data-project-id="${escapeHtml(p.id)}">
          <span class="pv-project-menu__check">${active ? CHECK_ICON : ''}</span>
          <span class="pv-project-menu__name">${escapeHtml(p.name || p.id)}</span>
          ${active ? '<span class="pv-project-menu__meta">Active</span>' : ''}
        </button>`
      })
      .join('')
  }

  const applyProjects = (list) => {
    if (!Array.isArray(list)) return
    projects = list
    const active = list.find((p) => p.active)
    if (active) {
      activeId = active.id
      activeName = active.name || active.id
    }
    renderChip()
    if (!panel.hidden) renderList()
  }

  const loadProjects = async () => {
    try {
      const res = await fetch('/api/projects')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      applyProjects(await res.json())
    } catch {
      /* the chip keeps its last known name; the connection pill shows the outage */
    }
  }

  const applyState = (state) => {
    if (!state || typeof state !== 'object') return
    onAirCount = (state.graphics || []).filter((g) => g && (g.visible || g.soloVisible)).length
    const idChanged = state.projectId && state.projectId !== activeId
    const nameChanged = state.projectName && state.projectName !== activeName
    if (state.projectId) activeId = state.projectId
    if (state.projectName) activeName = state.projectName
    if (idChanged || nameChanged) {
      renderChip()
      if (!panel.hidden) renderList()
    }
    // A project we do not know yet (imported/created elsewhere): refresh the list.
    if (idChanged && !projects.some((p) => p.id === state.projectId)) loadProjects()
  }

  button.addEventListener('click', () => togglePopover(button, panel, { onOpen: renderList }))
  wirePopoverKeys(panel)

  listEl.addEventListener('click', async (event) => {
    const item = event.target.closest('[data-project-id]')
    if (!item || switching) return
    const id = item.dataset.projectId
    if (id === activeId) {
      closePopover({ restoreFocus: true })
      return
    }
    const project = projects.find((p) => p.id === id)
    const name = project?.name || id
    closePopover({ restoreFocus: true })
    if (onAirCount > 0 && !(await confirmSwitch({ projectName: name, liveCount: onAirCount }))) return
    switching = true
    button.setAttribute('aria-busy', 'true')
    button.classList.add('is-pending')
    try {
      const res = await fetch(`/api/projects/${encodeURIComponent(id)}/activate`, { method: 'POST' })
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        throw new Error(body?.error || `HTTP ${res.status}`)
      }
      const activated = await res.json().catch(() => null)
      activeId = activated?.id || id
      activeName = activated?.name || name
      projects = projects.map((p) => ({ ...p, active: p.id === activeId }))
      renderChip()
      showToast(`Switched to “${activeName}”`, { type: 'success', duration: 2500 })
    } catch (err) {
      showErrorToast(`Could not switch project: ${err.message || 'request failed'}`)
    } finally {
      switching = false
      button.removeAttribute('aria-busy')
      button.classList.remove('is-pending')
    }
  })

  renderChip()
  loadProjects()

  return { applyProjects, applyState, loadProjects }
}

/** Desktop app only: port / startup settings live in the app's Preferences window. */
function addDesktopPreferences(panel) {
  const desktop = window.proverlayDesktop
  if (!desktop || typeof desktop.openPreferences !== 'function') return
  const separator = el('div', { class: 'pv-popover__separator', role: 'separator' })
  const item = el('button', { type: 'button', class: 'pv-popover__item', role: 'menuitem' }, 'App preferences…')
  item.addEventListener('click', () => {
    closePopover()
    desktop.openPreferences()
  })
  panel.append(separator, item)
}

function wireMenu(menu) {
  const button = menu.querySelector('#pv-app-menu-button')
  const panel = menu.querySelector('.pv-app-menu__panel')
  addDesktopPreferences(panel)
  button.addEventListener('click', () => togglePopover(button, panel))
  wirePopoverKeys(panel)
  panel.addEventListener('click', (event) => {
    if (event.target.closest('a[href]')) closePopover()
  })
}

function wirePreview(preview) {
  preview.addEventListener('click', (event) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return
    event.preventDefault()
    void openRenderPreview('/render')
  })
}

function connectLive(parts, projectsApi) {
  const socket = sharedSocket()
  if (!socket) {
    parts.pill.hidden = true
    return
  }
  // Pages with live controls wire the pill themselves (with their controls).
  if (parts.pill.dataset.pvWired !== '1') wireConnectionState(socket, { pill: parts.pill })
  socket.on('projectsChanged', projectsApi.applyProjects)
  socket.on('stateChanged', projectsApi.applyState)
  socket.on('connect', () => projectsApi.loadProjects())
}

const headerEl = document.querySelector('header.pv-app-header')
const parts = headerEl ? mountHeader(headerEl) : null
if (parts) {
  wireTheme(parts.menu)
  wireMenu(parts.menu)
  wirePreview(parts.preview)
  const projectsApi = wireProjects(parts.chip)
  const start = () => connectLive(parts, projectsApi)
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true })
  else start()
}
