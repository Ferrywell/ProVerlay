import { toggleGraphic, toggleGraphicSolo, patchGraphic } from '/public/shared/client.js'
import { createTickerMessage, migrateTickerMessages, enabledTickerTexts } from '/public/shared/ticker-messages.js'
import { buildTickerBoardHtml } from '/public/shared/ticker-board.js'
import { mountCustomTicker, stopCustomTicker } from '/public/shared/ticker-engine.js'
import {
  renderUrl,
  isFullFrameBackground,
  layoutFromTickerImage,
  readImageDimensions
} from '/public/shared/canvas-layout.js'
import {
  fetchProjectFontAssets,
  injectBrandFontFace,
  injectProjectFontFaces,
  projectFontOptions,
  fillFontSelect
} from '/public/shared/project-fonts.js'
import { freezeClock, startRunningClock, resolveLiveClock, penaltiesFeatureEnabled } from '/public/shared/match-utils.js'
import { applyServerTimeFromState } from '/public/shared/server-time.js'
import { adjustMatchClock } from '/public/shared/operate-match.js'
import { wireRenderPreviewLinks } from '/public/shared/render-preview.js'
import {
  formatCountdown,
  msUntilTarget,
  countdownDigitHtml,
  countdownTargetFromDuration,
  countdownShouldTick
} from '/public/shared/countdown-utils.js'
import {
  operateShellHtml,
  refreshOperateSection,
  wireOperateSection
} from '/public/shared/operate-handlers.js'

const TYPE_LABELS = {
  matchScoreboard: 'Match score',
  customTicker: 'Ticker',
  streamCountdown: 'Stream countdown',
  lowerThird: 'Lower third',
  lowerThirdShow: 'Lower thirds',
  quizShow: 'Quiz',
  message: 'Message',
}

const COPY_ALL_RENDER_LABEL = 'All overlays (render)'

const STANDALONE_LINK_ICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>`

const SOLO_TOGGLE_ICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="7"/></svg>`

async function copyToClipboard(text) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text)
    return
  }
  const ta = document.createElement('textarea')
  ta.value = text
  ta.setAttribute('readonly', '')
  ta.style.position = 'fixed'
  ta.style.left = '-9999px'
  document.body.appendChild(ta)
  ta.select()
  document.execCommand('copy')
  document.body.removeChild(ta)
}

function wireGraphicsListActions() {
  if (!graphicsList || graphicsList.dataset.urlActionsWired === '1') return
  graphicsList.dataset.urlActionsWired = '1'

  graphicsList.addEventListener('click', async (event) => {
    const standaloneLink = event.target.closest('.overlay-standalone-link')
    if (standaloneLink) {
      event.stopPropagation()
      event.preventDefault()
      const graphicId = standaloneLink.closest('[data-graphic-id]')?.dataset.graphicId
      if (!graphicId) return
      try {
        await copyToClipboard(renderUrl(graphicId))
        standaloneLink.classList.add('is-copied')
        standaloneLink.title = 'URL copied'
        setTimeout(() => {
          standaloneLink.classList.remove('is-copied')
          standaloneLink.title = 'Copy solo URL (?graphic=…)'
        }, 1500)
      } catch (err) {
        console.error('Copy solo URL failed:', err)
      }
      return
    }

    const soloToggle = event.target.closest('.overlay-solo-toggle')
    if (!soloToggle) return
    event.stopPropagation()
    event.preventDefault()
    if (soloToggle.disabled) return
    const graphicId = soloToggle.closest('[data-graphic-id]')?.dataset.graphicId
    if (!graphicId) return
    const live = currentState?.graphics.find((g) => g.id === graphicId)
    const next = !Boolean(live?.soloVisible)
    soloToggle.disabled = true
    try {
      const updated = await toggleGraphicSolo(graphicId, next)
      applyState({
        ...currentState,
        graphics: currentState.graphics.map((g) =>
          g.id === graphicId ? { ...g, soloVisible: updated.soloVisible } : g
        )
      })
    } catch (err) {
      console.error(err)
      soloToggle.disabled = false
    }
  })
}

const graphicsList = document.getElementById('graphics-list')
const copyBtn = document.getElementById('copy-render-url')
const connectionStatus = document.getElementById('connection-status')
const projectSwitcher = document.getElementById('project-switcher')
const projectActivate = document.getElementById('project-activate')
const projectActiveName = document.getElementById('project-active-name')
const projectNew = document.getElementById('project-new')
const projectExport = document.getElementById('project-export')
const projectImport = document.getElementById('project-import')
const projectStatus = document.getElementById('project-status')
const networkUrls = document.getElementById('network-urls')
const widgetPanel = document.getElementById('widget-panel')
const widgetForm = document.getElementById('widget-form')
const clockStart = document.getElementById('clock-start')
const clockPause = document.getElementById('clock-pause')
const clockSync = document.getElementById('clock-sync')
const clockSecMinus = document.getElementById('clock-sec-minus')
const clockSecPlus = document.getElementById('clock-sec-plus')
const clockMinMinus = document.getElementById('clock-min-minus')
const clockMinPlus = document.getElementById('clock-min-plus')
const tickerPanel = document.getElementById('ticker-panel')
const tickerForm = document.getElementById('ticker-form')
const countdownPanel = document.getElementById('countdown-panel')
const countdownForm = document.getElementById('countdown-form')
const countdownPreview = document.getElementById('countdown-preview')
const countdownPreviewTime = document.getElementById('countdown-preview-time')
const inspectorEmpty = document.getElementById('inspector-empty')
const inspectorEmptyText = document.getElementById('inspector-empty-text')
const widgetTypeAdd = document.getElementById('widget-type-add')
const widgetAdd = document.getElementById('widget-add')
const widgetRemove = document.getElementById('widget-remove')
const rosterPanel = document.getElementById('roster-panel')
const rosterList = document.getElementById('roster-list')
const rosterSearch = document.getElementById('roster-search')
const rosterAdd = document.getElementById('roster-add')
const rosterEntryForm = document.getElementById('roster-entry-form')
const rosterFormTitle = document.getElementById('roster-form-title')
const rosterEntryId = document.getElementById('roster-entry-id')
const rosterName = document.getElementById('roster-name')
const rosterTitle = document.getElementById('roster-title')
const rosterCompany = document.getElementById('roster-company')
const rosterCancel = document.getElementById('roster-cancel')
const rosterBackground = document.getElementById('roster-background')
const rosterSaveTemplate = document.getElementById('roster-save-template')
const quizPanel = document.getElementById('quiz-panel')
const quizList = document.getElementById('quiz-list')
const quizAdd = document.getElementById('quiz-add')
const quizReveal = document.getElementById('quiz-reveal')
const quizEntryForm = document.getElementById('quiz-entry-form')
const quizFormTitle = document.getElementById('quiz-form-title')
const quizEntryId = document.getElementById('quiz-entry-id')
const quizQuestionInput = document.getElementById('quiz-question')
const quizOptInputs = [0, 1, 2, 3].map((i) => document.getElementById(`quiz-opt-${i}`))
const quizCorrect = document.getElementById('quiz-correct')
const quizCancel = document.getElementById('quiz-cancel')
const transitionPanel = document.getElementById('transition-panel')
const transitionIn = document.getElementById('transition-in')
const transitionOut = document.getElementById('transition-out')
const transitionDuration = document.getElementById('transition-duration')
const dashboardOperatePanel = document.getElementById('dashboard-operate-panel')
const dashboardOperateRoot = document.getElementById('dashboard-operate-root')
const operatePanelTitle = document.getElementById('operate-panel-title')
const sideStack = document.getElementById('side-stack')
const projectSetupDetails = document.getElementById('project-setup-details')
const configureGraphicId = () => new URLSearchParams(window.location.search).get('configure')

let currentState = null
let projects = []
let projectBusy = false
let selectedGraphicId = null

function setProjectStatus(message, type = '') {
  if (!projectStatus) return
  projectStatus.textContent = message
  projectStatus.classList.remove('is-error', 'is-success')
  if (type) projectStatus.classList.add(type === 'error' ? 'is-error' : 'is-success')
}

function setProjectBusy(busy) {
  projectBusy = busy
  if (projectSwitcher) projectSwitcher.disabled = busy
  if (projectActivate) projectActivate.disabled = busy
  if (projectNew) projectNew.disabled = busy
  if (projectExport) projectExport.disabled = busy
}

function activeProjectId() {
  return currentState?.projectId || projects.find((p) => p.active)?.id || ''
}

// Selecteren in de dropdown wisselt NIET van project; dat gebeurt pas via de
// expliciete "Activate this project"-knop (veilig tijdens een live stream).
function syncProjectUI({ preserveSelection = true } = {}) {
  if (!projectSwitcher) return
  const activeId = activeProjectId()
  const active = projects.find((p) => p.id === activeId)
  if (projectActiveName) projectActiveName.textContent = active?.name || '—'
  const selectionPending =
    preserveSelection && projectSwitcher.value && projectSwitcher.value !== activeId
  if (!selectionPending && activeId) projectSwitcher.value = activeId
  if (projectActivate) {
    projectActivate.hidden = !projectSwitcher.value || projectSwitcher.value === activeId
  }
}

async function loadProjects({ select } = {}) {
  if (!projectSwitcher) return
  setProjectBusy(true)
  setProjectStatus('Loading projects…')
  try {
    const res = await fetch('/api/projects')
    if (!res.ok) throw new Error('Could not load projects')
    projects = await res.json()
    const activeId = activeProjectId()
    projectSwitcher.innerHTML = projects
      .map((p) => {
        const isActive = p.active || p.id === activeId
        return `<option value="${p.id}">${p.name}${isActive ? ' — active' : ''}</option>`
      })
      .join('')
    if (!projects.length) {
      projectSwitcher.innerHTML = '<option value="">No projects</option>'
    }
    if (select && projects.some((p) => p.id === select)) {
      projectSwitcher.value = select
    } else if (activeId) {
      projectSwitcher.value = activeId
    }
    syncProjectUI()
    setProjectStatus('')
  } catch (err) {
    setProjectStatus(err.message || 'Failed to load projects', 'error')
  } finally {
    setProjectBusy(false)
  }
}

projectSwitcher?.addEventListener('change', () => {
  syncProjectUI()
  const activeId = activeProjectId()
  if (projectSwitcher.value && projectSwitcher.value !== activeId) {
    const name = projects.find((p) => p.id === projectSwitcher.value)?.name || projectSwitcher.value
    setProjectStatus(`"${name}" selected — click Activate to switch`)
  } else {
    setProjectStatus('')
  }
})

projectActivate?.addEventListener('click', async () => {
  const id = projectSwitcher?.value
  if (!id || projectBusy || id === activeProjectId()) return
  setProjectBusy(true)
  setProjectStatus('Switching project…')
  try {
    const res = await fetch(`/api/projects/${id}/activate`, { method: 'POST' })
    if (!res.ok) throw new Error('Failed to switch project')
    await loadProjects()
    setProjectStatus('Project activated', 'success')
    setTimeout(() => setProjectStatus(''), 2000)
  } catch (err) {
    setProjectStatus(err.message || 'Failed to switch project', 'error')
    await loadProjects()
  } finally {
    setProjectBusy(false)
  }
})

projectNew?.addEventListener('click', async () => {
  const clientName = await promptName({
    title: 'New project',
    label: 'Client name',
    defaultValue: 'New client'
  })
  if (!clientName) return
  setProjectBusy(true)
  setProjectStatus('Creating project…')
  try {
    const res = await fetch('/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: clientName.trim(), clientName: clientName.trim() })
    })
    if (!res.ok) throw new Error('Failed to create project')
    const created = await res.json()
    await loadProjects({ select: created.id })
    setProjectStatus('Project created — click Activate to start working in it', 'success')
  } catch (err) {
    setProjectStatus(err.message || 'Failed to create project', 'error')
  } finally {
    setProjectBusy(false)
  }
})

projectExport?.addEventListener('click', async () => {
  setProjectBusy(true)
  setProjectStatus('Starting export…')
  try {
    const res = await fetch('/api/projects/active/export')
    if (!res.ok) throw new Error('Export failed')
    const blob = await res.blob()
    const disposition = res.headers.get('Content-Disposition') || ''
    const match = disposition.match(/filename="?([^";]+)"?/)
    const active = projects.find((p) => p.active) || projects.find((p) => p.id === currentState?.projectId)
    const fallback = `${(active?.name || 'project').replace(/\s+/g, '-').toLowerCase()}.proverlay`
    const filename = match?.[1] || fallback
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    link.click()
    URL.revokeObjectURL(url)
    setProjectStatus('Export complete', 'success')
    setTimeout(() => setProjectStatus(''), 2000)
  } catch (err) {
    setProjectStatus(err.message || 'Export failed', 'error')
  } finally {
    setProjectBusy(false)
  }
})

projectImport?.addEventListener('change', async () => {
  const file = projectImport.files?.[0]
  if (!file) return
  setProjectBusy(true)
  setProjectStatus('Importing…')
  try {
    const body = new FormData()
    body.append('file', file)
    const res = await fetch('/api/projects/import', { method: 'POST', body })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err.error || 'Import failed')
    }
    const imported = await res.json()
    await loadProjects({ select: imported.id })
    setProjectStatus('Import complete — click Activate to start working in it', 'success')
  } catch (err) {
    setProjectStatus(err.message || 'Import failed', 'error')
  } finally {
    projectImport.value = ''
    setProjectBusy(false)
  }
})

function setConnectionStatus(connected) {
  if (!connectionStatus) return
  connectionStatus.classList.toggle('is-connected', connected)
  connectionStatus.classList.toggle('is-offline', !connected)
  const label = connectionStatus.querySelector('.status-label')
  if (label) label.textContent = connected ? 'Live sync' : 'Offline'
}

function getSelectedGraphic() {
  return (currentState?.graphics || []).find((g) => g.id === selectedGraphicId) || null
}

function selectGraphic(id) {
  selectedGraphicId = id
  const params = new URLSearchParams(window.location.search)
  if (params.get('configure') && params.get('configure') !== id) {
    params.delete('configure')
    const qs = params.toString()
    window.history.replaceState(null, '', qs ? `${window.location.pathname}?${qs}` : window.location.pathname)
  }
  renderGraphics()
  refreshInspector()
}

function hideAllInspectorPanels() {
  stopCustomTicker(TICKER_PREVIEW_ID)
  if (widgetPanel) widgetPanel.hidden = true
  if (tickerPanel) tickerPanel.hidden = true
  if (countdownPanel) countdownPanel.hidden = true
  if (rosterPanel) rosterPanel.hidden = true
  if (quizPanel) quizPanel.hidden = true
  if (transitionPanel) transitionPanel.hidden = true
  if (dashboardOperatePanel) dashboardOperatePanel.hidden = true
}

function editSettingsUrl(graphic) {
  if (graphic.type === 'matchScoreboard' || graphic.type === 'lowerThirdShow') {
    return `/editor?graphic=${encodeURIComponent(graphic.id)}`
  }
  return `/control?configure=${encodeURIComponent(graphic.id)}`
}

function isConfigureMode(graphic) {
  return Boolean(graphic && configureGraphicId() === graphic.id)
}

function getGraphicById(id) {
  return (currentState?.graphics || []).find((g) => g.id === id) || null
}

function showSettingsInspector(graphic) {
  if (inspectorEmpty) inspectorEmpty.hidden = true
  if (graphic.type === 'matchScoreboard') {
    if (widgetPanel) {
      widgetPanel.hidden = false
      fillWidgetForm(graphic)
    }
  } else if (graphic.type === 'customTicker') {
    if (tickerPanel) {
      tickerPanel.hidden = false
      fillTickerForm(graphic)
    }
  } else if (graphic.type === 'streamCountdown') {
    if (countdownPanel) {
      countdownPanel.hidden = false
      fillCountdownForm(graphic)
    }
  } else if (graphic.type === 'lowerThirdShow') {
    closeRosterForm()
    if (rosterPanel) {
      rosterPanel.hidden = false
      fillRosterPanel(graphic)
    }
  } else if (graphic.type === 'quizShow') {
    closeQuizForm()
    if (quizPanel) {
      quizPanel.hidden = false
      fillQuizPanel(graphic)
    }
  }
  if (transitionPanel) {
    transitionPanel.hidden = false
    fillTransitionPanel(graphic)
  }
}

function showOperateInspector(graphic) {
  if (inspectorEmpty) inspectorEmpty.hidden = true
  if (dashboardOperatePanel) dashboardOperatePanel.hidden = false
  if (operatePanelTitle) operatePanelTitle.textContent = graphic.name || 'Live controls'

  if (!dashboardOperateRoot) return

  let section = dashboardOperateRoot.querySelector(`[data-graphic-id="${graphic.id}"]`)
  if (!section || section.dataset.type !== graphic.type) {
    dashboardOperateRoot.innerHTML = operateShellHtml(graphic, { embedded: true })
    section = dashboardOperateRoot.querySelector(`[data-graphic-id="${graphic.id}"]`)
    wireOperateSection(dashboardOperateRoot, getGraphicById)
  }

  refreshOperateSection(section, graphic)
}

function fillTransitionPanel(graphic) {
  if (!transitionPanel || !graphic) return
  const t = graphic.transition || {}
  if (transitionIn && document.activeElement !== transitionIn) transitionIn.value = t.in || 'auto'
  if (transitionOut && document.activeElement !== transitionOut) transitionOut.value = t.out || 'auto'
  if (transitionDuration && document.activeElement !== transitionDuration) {
    transitionDuration.value = t.duration ?? 450
  }
}

async function saveTransition() {
  const graphic = getSelectedGraphic()
  if (!graphic) return
  await patchGraphic(graphic.id, {
    transition: {
      in: transitionIn?.value || 'auto',
      out: transitionOut?.value || 'auto',
      duration: Math.min(3000, Math.max(100, Number(transitionDuration?.value) || 450))
    }
  })
}

function quizGraphic() {
  const selected = getSelectedGraphic()
  if (selected?.type === 'quizShow') return selected
  return (currentState?.graphics || []).find((g) => g.type === 'quizShow')
}

function openQuizForm(question = null) {
  if (!quizEntryForm) return
  quizEntryForm.hidden = false
  if (quizFormTitle) quizFormTitle.textContent = question ? 'Edit question' : 'Add question'
  if (quizEntryId) quizEntryId.value = question?.id || ''
  if (quizQuestionInput) quizQuestionInput.value = question?.question || ''
  quizOptInputs.forEach((input, i) => {
    if (input) input.value = question?.options?.[i] || ''
  })
  if (quizCorrect) quizCorrect.value = String(question?.correct ?? 0)
  quizQuestionInput?.focus()
}

function closeQuizForm() {
  if (quizEntryForm) quizEntryForm.hidden = true
  if (quizEntryId) quizEntryId.value = ''
}

function fillQuizPanel(graphic = quizGraphic()) {
  if (!quizList || !graphic) return
  const questions = graphic.data?.questions || []
  const activeId = graphic.data?.activeQuestionId

  if (quizReveal) {
    quizReveal.disabled = !graphic.visible || !activeId
    quizReveal.textContent = graphic.data?.revealed ? 'Hide answer' : 'Reveal answer'
  }

  if (!questions.length) {
    quizList.innerHTML = '<li class="inspector-empty-state">No questions yet. Click “Add question”.</li>'
    return
  }

  quizList.innerHTML = questions
    .map((q) => {
      const isActive = graphic.visible && activeId === q.id
      const letters = ['A', 'B', 'C', 'D']
      const meta = `Correct: ${letters[q.correct] || 'A'} · ${(q.options || []).filter((o) => String(o).trim()).length} answers`
      return `
        <li class="roster-item${isActive ? ' is-active' : ''}" data-entry-id="${q.id}">
          <button type="button" class="roster-item__body" data-quiz-show="${q.id}">
            <span class="roster-item__name">${escapeHtml(q.question)}</span>
            <span class="roster-item__meta">${escapeHtml(meta)}</span>
          </button>
          <div class="roster-item__actions">
            <button type="button" class="button button--secondary" data-quiz-edit="${q.id}" title="Edit">✎</button>
            <button type="button" class="button button--secondary" data-quiz-delete="${q.id}" title="Delete">×</button>
          </div>
        </li>
      `
    })
    .join('')
}

function rosterGraphic() {
  const selected = getSelectedGraphic()
  if (selected?.type === 'lowerThirdShow') return selected
  return (currentState?.graphics || []).find((g) => g.type === 'lowerThirdShow')
}

function rosterFilter(entries = []) {
  const q = rosterSearch?.value?.trim().toLowerCase() || ''
  if (!q) return entries
  return entries.filter((entry) => {
    const hay = `${entry.name} ${entry.title || ''} ${entry.company || ''} ${(entry.keywords || []).join(' ')}`.toLowerCase()
    return hay.includes(q)
  })
}

function openRosterForm(entry = null) {
  if (!rosterEntryForm) return
  rosterEntryForm.hidden = false
  if (rosterFormTitle) rosterFormTitle.textContent = entry ? 'Edit person' : 'Add person'
  if (rosterEntryId) rosterEntryId.value = entry?.id || ''
  if (rosterName) rosterName.value = entry?.name || ''
  if (rosterTitle) rosterTitle.value = entry?.title || ''
  if (rosterCompany) rosterCompany.value = entry?.company || ''
  rosterName?.focus()
}

function closeRosterForm() {
  if (rosterEntryForm) rosterEntryForm.hidden = true
  if (rosterEntryId) rosterEntryId.value = ''
}

function fillRosterPanel(graphic = rosterGraphic()) {
  if (!rosterList || !graphic) return
  const entries = rosterFilter(graphic.data?.entries || [])
  const activeId = graphic.data?.activeEntryId
  const bg = graphic.data?.template?.layout?.background || ''
  if (rosterBackground) rosterBackground.value = bg

  if (!entries.length) {
    rosterList.innerHTML = '<li class="inspector-empty-state">No people yet. Click Add.</li>'
    return
  }

  rosterList.innerHTML = entries
    .map((entry) => {
      const isActive = graphic.visible && activeId === entry.id
      const meta = [entry.title, entry.company].filter(Boolean).join(' · ')
      return `
        <li class="roster-item${isActive ? ' is-active' : ''}" data-entry-id="${entry.id}">
          <button type="button" class="roster-item__body" data-roster-show="${entry.id}">
            <span class="roster-item__name">${escapeHtml(entry.name)}</span>
            ${meta ? `<span class="roster-item__meta">${escapeHtml(meta)}</span>` : ''}
          </button>
          <div class="roster-item__actions">
            <button type="button" class="button button--secondary" data-roster-edit="${entry.id}" title="Edit">✎</button>
            <button type="button" class="button button--secondary" data-roster-delete="${entry.id}" title="Delete">×</button>
          </div>
        </li>
      `
    })
    .join('')
}

function escapeHtml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

function updateSidePanelFocus(mode) {
  sideStack?.classList.toggle('is-operate-focus', mode === 'operate')
  if (projectSetupDetails && mode === 'operate') projectSetupDetails.open = false
}

function refreshInspector() {
  hideAllInspectorPanels()
  const graphic = getSelectedGraphic()
  if (widgetRemove) widgetRemove.disabled = !graphic

  if (!graphic) {
    updateSidePanelFocus('empty')
    if (inspectorEmpty) inspectorEmpty.hidden = false
    if (inspectorEmptyText) {
      inspectorEmptyText.textContent = 'Select an overlay to operate it during the show.'
    }
    return
  }

  if (isConfigureMode(graphic)) {
    updateSidePanelFocus('configure')
    showSettingsInspector(graphic)
    return
  }

  updateSidePanelFocus('operate')
  showOperateInspector(graphic)
}

function renderGraphics() {
  graphicsList.innerHTML = ''
  for (const graphic of currentState.graphics) {
    const card = document.createElement('article')
    card.className = `overlay-card${graphic.visible ? ' is-live' : ''}${graphic.soloVisible ? ' is-solo-live' : ''}${selectedGraphicId === graphic.id ? ' is-selected' : ''}`
    card.dataset.graphicId = graphic.id

    const body = document.createElement('div')
    body.className = 'overlay-card-body'
    body.setAttribute('role', 'button')
    body.tabIndex = 0
    const typeLabel = TYPE_LABELS[graphic.type] || graphic.type
    body.innerHTML = `
      <div class="overlay-card__meta">
        <span class="pill pill--type pill--type-${graphic.type}">${typeLabel}</span>
        <div class="overlay-card__title-row">
          <div class="overlay-name">${graphic.name}</div>
          <div class="overlay-card__url-actions">
            <button type="button" class="overlay-standalone-link" title="Copy solo URL (?graphic=…)" aria-label="Copy solo URL for ${graphic.name}">
              ${STANDALONE_LINK_ICON}
            </button>
            <button type="button" class="overlay-solo-toggle${graphic.soloVisible ? ' is-live' : ''}" title="${graphic.soloVisible ? 'Solo off' : 'Solo on air'}" aria-label="${graphic.soloVisible ? 'Hide solo output' : 'Go live solo'}" aria-pressed="${graphic.soloVisible}">
              ${SOLO_TOGGLE_ICON}
            </button>
          </div>
        </div>
        ${graphic.visible ? '<span class="pill pill--live">Main</span>' : ''}
        ${graphic.soloVisible ? '<span class="pill pill--solo">Solo</span>' : ''}
      </div>
    `
    body.addEventListener('click', (event) => {
      if (event.target.closest('.overlay-standalone-link, .overlay-solo-toggle')) return
      selectGraphic(graphic.id)
    })
    body.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault()
        selectGraphic(graphic.id)
      }
    })

    const footer = document.createElement('div')
    footer.className = 'overlay-card__footer'

    const actions = document.createElement('div')
    actions.className = 'overlay-actions action-group'

    const opLink = document.createElement('a')
    opLink.className = 'button button--ghost'
    opLink.href = `/operate/${encodeURIComponent(graphic.id)}`
    opLink.textContent = 'Operate'
    actions.appendChild(opLink)

    const editLink = document.createElement('a')
    editLink.className = 'button button--ghost'
    editLink.href = editSettingsUrl(graphic)
    editLink.textContent = 'Edit settings'
    actions.appendChild(editLink)

    const liveWrap = document.createElement('div')
    liveWrap.className = 'overlay-card__live'

    const button = document.createElement('button')
    button.className = graphic.visible ? 'button button--gray' : 'button button--live'
    button.type = 'button'
    button.textContent = graphic.visible ? 'Hide' : 'Go live'
    button.setAttribute('aria-pressed', String(graphic.visible))
    button.addEventListener('click', (event) => {
      event.stopPropagation()
      toggleGraphic(graphic.id, !graphic.visible)
    })
    liveWrap.appendChild(button)

    footer.append(actions, liveWrap)
    card.append(body, footer)
    graphicsList.appendChild(card)
  }
}

function matchGraphic() {
  const selected = getSelectedGraphic()
  if (selected?.type === 'matchScoreboard') return selected
  return (currentState?.graphics || []).find((g) => g.type === 'matchScoreboard')
}

function tickerGraphic() {
  const selected = getSelectedGraphic()
  if (selected?.type === 'customTicker') return selected
  return (currentState?.graphics || []).find((g) => g.type === 'customTicker')
}

function countdownGraphic() {
  const selected = getSelectedGraphic()
  if (selected?.type === 'streamCountdown') return selected
  return (currentState?.graphics || []).find((g) => g.type === 'streamCountdown')
}

function toDatetimeLocalValue(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function fromDatetimeLocalValue(value) {
  if (!value) return new Date().toISOString()
  return new Date(value).toISOString()
}

function formNumber(value, fallback) {
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

const namePromptDialog = document.getElementById('name-prompt-dialog')
const namePromptForm = document.getElementById('name-prompt-form')
const namePromptTitle = document.getElementById('name-prompt-title')
const namePromptLabel = document.getElementById('name-prompt-label')
const namePromptInput = document.getElementById('name-prompt-input')
const namePromptCancel = document.getElementById('name-prompt-cancel')

function promptName({ title, label, defaultValue = '' }) {
  if (!namePromptDialog || !namePromptInput) {
    return Promise.resolve(defaultValue?.trim() || null)
  }
  return new Promise((resolve) => {
    if (namePromptTitle) namePromptTitle.textContent = title
    if (namePromptLabel) namePromptLabel.textContent = label
    namePromptInput.value = defaultValue
    const finish = (value) => {
      namePromptForm?.removeEventListener('submit', onSubmit)
      namePromptCancel?.removeEventListener('click', onCancel)
      namePromptDialog.removeEventListener('cancel', onCancel)
      resolve(value)
    }
    const onSubmit = (event) => {
      event.preventDefault()
      const value = namePromptInput.value.trim()
      if (!value) return
      namePromptDialog.close()
      finish(value)
    }
    const onCancel = () => {
      namePromptDialog.close()
      finish(null)
    }
    namePromptForm?.addEventListener('submit', onSubmit)
    namePromptCancel?.addEventListener('click', onCancel)
    namePromptDialog.addEventListener('cancel', onCancel)
    namePromptDialog.showModal()
    namePromptInput.focus()
    namePromptInput.select()
  })
}

function clampInsetPercent(value, fallback = 0) {
  const n = formNumber(value, fallback)
  return Math.min(45, Math.max(0, Math.round(n * 100) / 100))
}

function syncTickerInsetPair(rangeId, numId) {
  const range = document.getElementById(rangeId)
  const num = document.getElementById(numId)
  if (!range || !num) return
  const v = clampInsetPercent(range.value, 0)
  range.value = String(v)
  num.value = String(v)
}

function wireTickerInsetPair(rangeId, numId) {
  const range = document.getElementById(rangeId)
  const num = document.getElementById(numId)
  if (!range || !num) return
  range.addEventListener('input', () => {
    num.value = String(clampInsetPercent(range.value, 0))
    scheduleTickerPreview()
  })
  num.addEventListener('input', () => {
    const v = clampInsetPercent(num.value, clampInsetPercent(range.value, 0))
    range.value = String(v)
    num.value = String(v)
    scheduleTickerPreview()
  })
}

async function syncProjectBrandFonts(state) {
  const brand = state?.brand || {}
  document.documentElement.style.setProperty(
    '--brand-font',
    brand.fontFamily || "-apple-system, BlinkMacSystemFont, 'SF Pro Display', sans-serif"
  )
  injectBrandFontFace(brand)
  if (brand.fontUrl && !brand.fontUrl.match(/\.(ttf|otf|woff2?)$/i)) {
    let link = document.getElementById('brand-font')
    if (!link) {
      link = document.createElement('link')
      link.id = 'brand-font'
      link.rel = 'stylesheet'
      document.head.appendChild(link)
    }
    link.href = brand.fontUrl
  }
  const projectId = state?.projectId
  if (projectId) {
    const fonts = await fetchProjectFontAssets(projectId)
    injectProjectFontFaces(fonts, brand)
    await refreshCountdownFontSelect(countdownGraphic()?.data?.fontFamily || '')
  }
}

async function refreshCountdownFontSelect(selected = '') {
  const select = countdownForm?.fontFamily
  if (!select) return
  const fonts = await fetchProjectFontAssets(currentState?.projectId)
  const options = [
    { value: '', label: 'Client branding (default)' },
    ...projectFontOptions(fonts, { includeBrand: false })
  ]
  fillFontSelect(select, options, selected || '')
}

const TICKER_PREVIEW_ID = '__dashboard-ticker-preview__'
let tickerPreviewRaf = null

function tickerPreviewMessages(storedMessages) {
  const lines = String(tickerForm?.messages?.value || '')
    .split('\n')
    .map((m) => m.trim())
    .filter(Boolean)
  if (lines.length) {
    return lines.map((text) => createTickerMessage(text, { enabled: true }))
  }
  return migrateTickerMessages(storedMessages || []).filter((m) => m.enabled)
}

function tickerDataFromForm(graphic) {
  const d = graphic?.data || {}
  const layout = { ...(d.layout || {}) }
  const bgName = String(tickerForm?.background?.value || '').trim()
  if (bgName) layout.background = bgName
  if (tickerForm?.barHeight && isFullFrameBackground(layout)) {
    layout.barHeight = formNumber(tickerForm.barHeight.value, layout.barHeight ?? 230)
  }
  return {
    ...d,
    messages: tickerPreviewMessages(d.messages),
    speed: formNumber(tickerForm?.speed?.value, d.speed ?? 90),
    textInsetLeft: clampInsetPercent(
      document.getElementById('tickerInsetLeftNum')?.value ?? tickerForm?.textInsetLeft?.value,
      d.textInsetLeft ?? 16
    ),
    textInsetRight: clampInsetPercent(
      document.getElementById('tickerInsetRightNum')?.value ?? tickerForm?.textInsetRight?.value,
      d.textInsetRight ?? 1
    ),
    fadeWidth: formNumber(tickerForm?.fadeWidth?.value, d.fadeWidth ?? 4),
    fontSize: formNumber(tickerForm.fontSize?.value, d.fontSize ?? 30),
    color: tickerForm?.color?.value || d.color || '#ffffff',
    layout
  }
}

function scheduleTickerPreview() {
  if (tickerPreviewRaf) cancelAnimationFrame(tickerPreviewRaf)
  tickerPreviewRaf = requestAnimationFrame(() => {
    tickerPreviewRaf = null
    updateTickerPreview()
  })
}

function updateTickerPreview() {
  const root = document.getElementById('ticker-preview-root')
  if (!root || !tickerForm || tickerPanel?.hidden) return
  const graphic = tickerGraphic()
  if (!graphic) {
    root.innerHTML = ''
    stopCustomTicker(TICKER_PREVIEW_ID)
    return
  }
  stopCustomTicker(TICKER_PREVIEW_ID)
  const data = tickerDataFromForm(graphic)
  root.innerHTML = buildTickerBoardHtml(data, {
    graphicId: TICKER_PREVIEW_ID,
    projectId: currentState?.projectId || activeProjectId()
  })
  if (enabledTickerTexts(data.messages).length) {
    mountCustomTicker(root, { id: TICKER_PREVIEW_ID, data })
  }
}

function fillTickerForm(graphic = tickerGraphic()) {
  if (!tickerForm || !graphic || graphic.type !== 'customTicker') return
  const d = graphic.data || {}
  tickerForm.background.value = d.layout?.background || ''
  tickerForm.speed.value = d.speed ?? 90
  const insetL = d.textInsetLeft ?? 16
  const insetR = d.textInsetRight ?? 1
  tickerForm.textInsetLeft.value = insetL
  if (tickerForm.textInsetRight) tickerForm.textInsetRight.value = insetR
  syncTickerInsetPair('tickerInsetLeft', 'tickerInsetLeftNum')
  syncTickerInsetPair('tickerInsetRight', 'tickerInsetRightNum')
  tickerForm.fadeWidth.value = d.fadeWidth ?? 4
  tickerForm.fontSize.value = d.fontSize ?? 30
  tickerForm.color.value = d.color || '#ffffff'
  tickerForm.messages.value = (d.messages || [])
    .map((m) => (typeof m === 'string' ? m : m?.text ?? ''))
    .filter(Boolean)
    .join('\n')
  document.getElementById('ticker-speed-out').textContent = tickerForm.speed.value
  document.getElementById('ticker-fade-out').textContent = tickerForm.fadeWidth.value
  const barHeightField = document.getElementById('ticker-bar-height-field')
  const layout = d.layout || {}
  if (barHeightField) {
    barHeightField.hidden = !isFullFrameBackground(layout)
    if (tickerForm.barHeight) {
      tickerForm.barHeight.value = layout.barHeight ?? 230
    }
  }
  scheduleTickerPreview()
}

async function fillCountdownForm(graphic = countdownGraphic()) {
  if (!countdownForm || !graphic || graphic.type !== 'streamCountdown') return
  const d = graphic.data || {}
  countdownForm.targetDateTime.value = toDatetimeLocalValue(d.targetDateTime)
  countdownForm.format.value = d.format || 'mm:ss'
  countdownForm.fontSize.value = d.fontSize ?? 96
  countdownForm.color.value = d.color || '#1d1d1f'
  countdownForm.hideWhenExpired.checked = Boolean(d.hideWhenExpired)
  if (countdownForm.position) {
    countdownForm.position.value = graphic.position || 'top-center'
  }
  await refreshCountdownFontSelect(d.fontFamily || '')
  updateCountdownPreview()
}

function countdownPreviewFontFamily() {
  const selected = countdownForm?.fontFamily?.value?.trim()
  if (selected) return selected
  return (
    getComputedStyle(document.documentElement).getPropertyValue('--brand-font').trim() ||
    "-apple-system, BlinkMacSystemFont, 'SF Pro Display', sans-serif"
  )
}

function updateCountdownPreview() {
  if (!countdownPreviewTime || !countdownForm) return
  const target = fromDatetimeLocalValue(countdownForm.targetDateTime.value)
  const format = countdownForm.format.value || 'mm:ss'
  const savedSize = Number(countdownForm.fontSize?.value) || 96
  const text = formatCountdown(msUntilTarget(target), format)
  countdownPreviewTime.innerHTML = countdownDigitHtml(text)
  countdownPreviewTime.style.fontFamily = countdownPreviewFontFamily()
  countdownPreviewTime.style.color = countdownForm.color?.value || '#1d1d1f'
  countdownPreviewTime.style.fontSize = `${savedSize}px`
}

function fillWidgetForm(graphic = matchGraphic()) {
  if (!widgetForm || !graphic || graphic.type !== 'matchScoreboard') return
  const d = graphic.data || {}
  const w = d.widgets || {}
  const clk = resolveLiveClock(d.clock || {})

  widgetForm.position.value = graphic.position || 'top-center'
  widgetForm.wHomeCode.checked = w.homeCode !== false
  widgetForm.wAwayCode.checked = w.awayCode !== false
  widgetForm.wHomeScore.checked = w.homeScore !== false
  widgetForm.wAwayScore.checked = w.awayScore !== false
  widgetForm.wClock.checked = w.clock !== false
  widgetForm.wPenalties.checked = w.penalties !== false
  widgetForm.homeCode.value = d.homeCode || ''
  widgetForm.awayCode.value = d.awayCode || ''
  widgetForm.homeName.value = d.homeName || ''
  widgetForm.awayName.value = d.awayName || ''
  widgetForm.showNames.checked = Boolean(d.showNames)
  widgetForm.clockMinute.value = clk.minute ?? 0
  widgetForm.clockSecond.value = clk.second ?? 0
  widgetForm.clockPeriod.value = clk.period || 'second_half'
  widgetForm.clockStoppage.checked = Boolean(clk.stoppageTime)
  widgetForm.animEnabled.checked = d.animation?.enabled !== false
  widgetForm.animDuration.value = d.animation?.durationMs ?? 420
  if (widgetForm.clockPlateWidth) {
    widgetForm.clockPlateWidth.value = d.layout?.clockPlateWidth ?? 0
  }
  syncClockControlButtons(graphic)
}

function syncClockControlButtons(graphic = matchGraphic()) {
  if (!clockStart || !clockPause || !graphic) return
  const running = Boolean(graphic.data?.clock?.running)
  clockStart.className = running ? 'button button--live' : 'button button--primary'
  clockPause.className = running ? 'button button--primary' : 'button button--secondary'
  clockStart.setAttribute('aria-pressed', String(running))
  clockPause.setAttribute('aria-pressed', String(!running))
}

function widgetPayloadFromForm() {
  const data = new FormData(widgetForm)
  const existingClock = matchGraphic()?.data?.clock || {}
  const formMinute = Number(data.get('clockMinute')) || 0
  const formSecond = Number(data.get('clockSecond')) || 0

  let clock = { ...existingClock }
  if (existingClock.running) {
    const live = resolveLiveClock(existingClock)
    clock = { ...clock, minute: live.minute, second: live.second }
  } else {
    clock = { ...clock, minute: formMinute, second: formSecond }
  }
  clock.period = data.get('clockPeriod')
  if (!penaltiesFeatureEnabled() && clock.period === 'penalties') {
    clock.period = 'second_half'
  }
  clock.stoppageTime = data.get('clockStoppage') === 'on'

  const graphic = matchGraphic()
  const layout = { ...(graphic?.data?.layout || {}) }
  layout.clockPlateWidth = Math.min(50, Math.max(0, Number(data.get('clockPlateWidth')) || 0))

  return {
    position: data.get('position'),
    data: {
      layout,
      homeCode: String(data.get('homeCode') || '').toUpperCase(),
      awayCode: String(data.get('awayCode') || '').toUpperCase(),
      homeName: String(data.get('homeName') || ''),
      awayName: String(data.get('awayName') || ''),
      showCodes: data.get('wHomeCode') === 'on' || data.get('wAwayCode') === 'on',
      showNames: data.get('showNames') === 'on',
      widgets: {
        homeCode: data.get('wHomeCode') === 'on',
        awayCode: data.get('wAwayCode') === 'on',
        homeScore: data.get('wHomeScore') === 'on',
        awayScore: data.get('wAwayScore') === 'on',
        clock: data.get('wClock') === 'on',
        penalties: penaltiesFeatureEnabled() ? data.get('wPenalties') === 'on' : false
      },
      clock,
      animation: {
        enabled: data.get('animEnabled') === 'on',
        durationMs: Number(data.get('animDuration')) || 420
      }
    }
  }
}

async function loadNetworkUrls() {
  if (!networkUrls) return
  try {
    const res = await fetch('/api/network')
    if (!res.ok) throw new Error('Network info unavailable')
    const net = await res.json()
    const rows = []
    const operatorLocal = `${window.location.origin}/operator`
    rows.push({ label: 'Operator (this device)', url: operatorLocal })
    for (const item of net.urls?.lan || []) {
      if (item.path === 'operator') {
        rows.push({ label: `Operator (${item.ip})`, url: item.url })
      }
    }
    networkUrls.innerHTML = rows
      .map(
        (r) => `
        <div class="network-url-row">
          <strong>${r.label}</strong>
          <a href="${r.url}">${r.url}</a>
        </div>`
      )
      .join('')
  } catch (err) {
    networkUrls.innerHTML = `<p class="project-status is-error">${err.message}</p>`
  }
}

function applyState(state) {
  applyServerTimeFromState(state)
  currentState = state
  syncProjectBrandFonts(state).then(() => {
    if (!tickerPanel?.hidden) scheduleTickerPreview()
  })
  const prevSelected = selectedGraphicId
  if (selectedGraphicId && !state.graphics.some((g) => g.id === selectedGraphicId)) {
    selectedGraphicId = null
  }
  const autoSelected = !selectedGraphicId && state.graphics?.length
  if (autoSelected) {
    selectedGraphicId = state.graphics[0].id
  }
  renderGraphics()
  refreshInspector()
  ensureWidgetClockTimer()
  ensureCountdownPreviewTimer()
  if (projectSwitcher && projects.length) {
    const knownActive = projects.find((p) => p.active)?.id
    if (state.projectId && knownActive && state.projectId !== knownActive) {
      // Actief project is elders gewisseld (bv. via import of andere client)
      loadProjects()
    } else {
      syncProjectUI()
    }
  }
}

let widgetClockTimer = null

function tickWidgetClockFields() {
  const graphic = matchGraphic()
  if (!graphic?.data?.clock?.running || !widgetForm) return
  const live = resolveLiveClock(graphic.data.clock)
  if (document.activeElement !== widgetForm.clockMinute) widgetForm.clockMinute.value = live.minute
  if (document.activeElement !== widgetForm.clockSecond) widgetForm.clockSecond.value = live.second
  syncClockControlButtons(graphic)
}

function ensureWidgetClockTimer() {
  const running = matchGraphic()?.data?.clock?.running
  if (running && !widgetClockTimer) {
    widgetClockTimer = setInterval(tickWidgetClockFields, 250)
  } else if (!running && widgetClockTimer) {
    clearInterval(widgetClockTimer)
    widgetClockTimer = null
  }
}

widgetForm?.addEventListener('submit', async (event) => {
  event.preventDefault()
  const graphic = matchGraphic()
  if (!graphic) return
  const payload = widgetPayloadFromForm()
  await patchGraphic(graphic.id, payload)
})

async function applyWidgetVisibilityInstant() {
  const graphic = matchGraphic()
  if (!graphic) return
  await patchGraphic(graphic.id, widgetPayloadFromForm())
}

;['wHomeCode', 'wAwayCode', 'wHomeScore', 'wAwayScore', 'wClock', ...(penaltiesFeatureEnabled() ? ['wPenalties'] : [])].forEach((name) => {
  widgetForm?.elements[name]?.addEventListener('change', () => {
    applyWidgetVisibilityInstant()
  })
})

clockStart?.addEventListener('click', async () => {
  const graphic = matchGraphic()
  if (!graphic) return
  const payload = widgetPayloadFromForm()
  payload.data.clock = startRunningClock(freezeClock(payload.data.clock))
  await patchGraphic(graphic.id, payload)
  syncClockControlButtons({ ...graphic, data: { ...graphic.data, clock: payload.data.clock } })
})

clockPause?.addEventListener('click', async () => {
  const graphic = matchGraphic()
  if (!graphic) return
  const payload = widgetPayloadFromForm()
  payload.data.clock = freezeClock(payload.data.clock)
  await patchGraphic(graphic.id, payload)
  syncClockControlButtons({ ...graphic, data: { ...graphic.data, clock: payload.data.clock } })
})

clockSync?.addEventListener('click', async () => {
  const graphic = matchGraphic()
  if (!graphic) return
  const payload = widgetPayloadFromForm()
  const clk = payload.data.clock
  if (clk.running) {
    payload.data.clock = startRunningClock(clk)
  }
  await patchGraphic(graphic.id, payload)
})

async function nudgeClock(seconds) {
  const graphic = matchGraphic()
  if (!graphic) return
  const nextClock = adjustMatchClock(graphic.data?.clock || {}, seconds)
  currentState = {
    ...currentState,
    graphics: currentState.graphics.map((g) =>
      g.id === graphic.id ? { ...g, data: { ...g.data, clock: nextClock } } : g
    )
  }
  tickWidgetClockFields()
  const section = dashboardOperateRoot?.querySelector(`[data-graphic-id="${graphic.id}"]`)
  if (section) {
    refreshOperateSection(section, { ...graphic, data: { ...graphic.data, clock: nextClock } })
  }
  await patchGraphic(graphic.id, { data: { clock: nextClock } })
  syncClockControlButtons({ ...graphic, data: { ...graphic.data, clock: nextClock } })
}

clockSecMinus?.addEventListener('click', () => nudgeClock(-1))
clockSecPlus?.addEventListener('click', () => nudgeClock(1))
clockMinMinus?.addEventListener('click', () => nudgeClock(-60))
clockMinPlus?.addEventListener('click', () => nudgeClock(60))

;[
  ['ticker-speed', 'ticker-speed-out'],
  ['tickerFade', 'ticker-fade-out']
].forEach(([inputId, outId]) => {
  document.getElementById(inputId)?.addEventListener('input', (e) => {
    const out = document.getElementById(outId)
    if (out) out.textContent = e.target.value
  })
})

wireTickerInsetPair('tickerInsetLeft', 'tickerInsetLeftNum')
wireTickerInsetPair('tickerInsetRight', 'tickerInsetRightNum')

const tickerBgUploadBtn = document.getElementById('ticker-bg-upload-btn')
const tickerBgUpload = document.getElementById('ticker-bg-upload')

tickerBgUploadBtn?.addEventListener('click', () => tickerBgUpload?.click())

tickerBgUpload?.addEventListener('change', async () => {
  const file = tickerBgUpload.files?.[0]
  if (!file) return
  const graphic = tickerGraphic()
  const projectId = currentState?.projectId
  if (!graphic || !projectId) return
  tickerBgUploadBtn.disabled = true
  tickerBgUploadBtn.textContent = 'Uploading…'
  try {
    const form = new FormData()
    form.append('file', file)
    const res = await fetch(`/api/projects/${projectId}/assets`, { method: 'POST', body: form })
    if (!res.ok) throw new Error('Upload failed')
    const { filename } = await res.json()
    const dims = await readImageDimensions(file)
    const layout = layoutFromTickerImage(dims, {
      ...(graphic.data?.layout || {}),
      background: filename
    })
    if (tickerForm?.background) tickerForm.background.value = filename
    if (tickerForm?.barHeight) tickerForm.barHeight.value = layout.barHeight ?? 230
    const barHeightField = document.getElementById('ticker-bar-height-field')
    if (barHeightField) barHeightField.hidden = !isFullFrameBackground(layout)
    await patchGraphic(graphic.id, { data: { layout } })
    scheduleTickerPreview()
  } catch (err) {
    alert(err.message || 'Upload failed')
  } finally {
    tickerBgUploadBtn.disabled = false
    tickerBgUploadBtn.textContent = 'Replace…'
    tickerBgUpload.value = ''
  }
})

tickerForm?.addEventListener('input', scheduleTickerPreview)
tickerForm?.addEventListener('change', scheduleTickerPreview)

tickerForm?.addEventListener('submit', async (event) => {
  event.preventDefault()
  const graphic = tickerGraphic()
  if (!graphic) return
  const data = new FormData(tickerForm)
  const lines = String(data.get('messages') || '')
    .split('\n')
    .map((m) => m.trim())
    .filter(Boolean)
  const existing = migrateTickerMessages(graphic.data?.messages || [])
  const byText = new Map(existing.map((m) => [m.text, m]))
  const messages = lines.map((text) => {
    const prev = byText.get(text)
    return prev ? { ...prev, text } : createTickerMessage(text, { enabled: false })
  })
  await patchGraphic(graphic.id, {
    data: {
      messages,
      speed: formNumber(data.get('speed'), 90),
      textInsetLeft: clampInsetPercent(
        document.getElementById('tickerInsetLeftNum')?.value ?? data.get('textInsetLeft'),
        16
      ),
      textInsetRight: clampInsetPercent(
        document.getElementById('tickerInsetRightNum')?.value ?? data.get('textInsetRight'),
        1
      ),
      fadeWidth: formNumber(data.get('fadeWidth'), 4),
      fontSize: Number(data.get('fontSize')) || 30,
      color: data.get('color'),
      layout: {
        ...(graphic.data?.layout || {}),
        background: String(data.get('background') || '').trim(),
        ...(isFullFrameBackground(graphic.data?.layout || {})
          ? { barHeight: Math.max(80, Number(data.get('barHeight')) || 230) }
          : {})
      }
    }
  })
})

countdownForm?.addEventListener('input', updateCountdownPreview)
countdownForm?.fontFamily?.addEventListener('change', updateCountdownPreview)

document.getElementById('countdown-start-duration')?.addEventListener('click', async () => {
  const graphic = countdownGraphic()
  if (!graphic || !countdownForm) return
  const data = new FormData(countdownForm)
  const targetDateTime = countdownTargetFromDuration(data.get('startMinutes'), data.get('startSeconds'))
  countdownForm.targetDateTime.value = toDatetimeLocalValue(targetDateTime)
  await patchGraphic(graphic.id, {
    data: {
      ...graphic.data,
      targetDateTime
    }
  })
  updateCountdownPreview()
})

rosterSearch?.addEventListener('input', () => fillRosterPanel())

transitionIn?.addEventListener('change', saveTransition)
transitionOut?.addEventListener('change', saveTransition)
transitionDuration?.addEventListener('change', saveTransition)

quizAdd?.addEventListener('click', () => openQuizForm())

quizCancel?.addEventListener('click', () => closeQuizForm())

quizReveal?.addEventListener('click', async () => {
  const graphic = quizGraphic()
  if (!graphic) return
  await patchGraphic(graphic.id, { data: { revealed: !graphic.data?.revealed } })
})

quizList?.addEventListener('click', async (event) => {
  const graphic = quizGraphic()
  if (!graphic) return
  const showId = event.target.closest('[data-quiz-show]')?.dataset.quizShow
  const editId = event.target.closest('[data-quiz-edit]')?.dataset.quizEdit
  const deleteId = event.target.closest('[data-quiz-delete]')?.dataset.quizDelete

  if (showId) {
    await patchGraphic(graphic.id, {
      visible: true,
      data: { activeQuestionId: showId, revealed: false }
    })
    return
  }
  if (editId) {
    openQuizForm((graphic.data?.questions || []).find((q) => q.id === editId))
    return
  }
  if (deleteId) {
    if (!confirm('Delete this question?')) return
    const questions = (graphic.data?.questions || []).filter((q) => q.id !== deleteId)
    const patch = { data: { questions } }
    if (graphic.data?.activeQuestionId === deleteId) {
      patch.visible = false
      patch.data.activeQuestionId = null
      patch.data.revealed = false
    }
    await patchGraphic(graphic.id, patch)
  }
})

quizEntryForm?.addEventListener('submit', async (event) => {
  event.preventDefault()
  const graphic = quizGraphic()
  if (!graphic) return
  const entry = {
    question: quizQuestionInput?.value?.trim() || '',
    options: quizOptInputs.map((input) => input?.value?.trim() || ''),
    correct: Number(quizCorrect?.value) || 0
  }
  if (!entry.question) return
  const id = quizEntryId?.value
  const questions = [...(graphic.data?.questions || [])]
  if (id) {
    const idx = questions.findIndex((q) => q.id === id)
    if (idx !== -1) questions[idx] = { ...questions[idx], ...entry }
  } else {
    questions.push({ id: `q-${Date.now().toString(36)}`, ...entry })
  }
  await patchGraphic(graphic.id, { data: { questions } })
  closeQuizForm()
})

rosterAdd?.addEventListener('click', () => openRosterForm())

rosterCancel?.addEventListener('click', () => closeRosterForm())

rosterList?.addEventListener('click', async (event) => {
  const graphic = rosterGraphic()
  if (!graphic) return
  const showId = event.target.closest('[data-roster-show]')?.dataset.rosterShow
  const editId = event.target.closest('[data-roster-edit]')?.dataset.rosterEdit
  const deleteId = event.target.closest('[data-roster-delete]')?.dataset.rosterDelete

  if (showId) {
    await fetch(`/api/graphics/${graphic.id}/entries/${showId}/show`, { method: 'POST' })
    return
  }
  if (editId) {
    const entry = (graphic.data?.entries || []).find((e) => e.id === editId)
    if (entry) openRosterForm(entry)
    return
  }
  if (deleteId) {
    if (!confirm('Delete this person?')) return
    await fetch(`/api/graphics/${graphic.id}/entries/${deleteId}`, { method: 'DELETE' })
  }
})

rosterEntryForm?.addEventListener('submit', async (event) => {
  event.preventDefault()
  const graphic = rosterGraphic()
  if (!graphic) return
  const payload = {
    name: rosterName?.value?.trim(),
    title: rosterTitle?.value?.trim() || '',
    company: rosterCompany?.value?.trim() || ''
  }
  const id = rosterEntryId?.value
  if (id) {
    await fetch(`/api/graphics/${graphic.id}/entries/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
  } else {
    await fetch(`/api/graphics/${graphic.id}/entries`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
  }
  closeRosterForm()
})

rosterSaveTemplate?.addEventListener('click', async () => {
  const graphic = rosterGraphic()
  if (!graphic) return
  const background = rosterBackground?.value?.trim() || ''
  await patchGraphic(graphic.id, {
    data: {
      template: {
        ...(graphic.data?.template || {}),
        layout: {
          ...(graphic.data?.template?.layout || {}),
          background
        }
      }
    }
  })
})

countdownForm?.addEventListener('submit', async (event) => {
  event.preventDefault()
  const graphic = countdownGraphic()
  if (!graphic) return
  const data = new FormData(countdownForm)
  await patchGraphic(graphic.id, {
    position: data.get('position') || graphic.position || 'top-center',
    data: {
      targetDateTime: fromDatetimeLocalValue(data.get('targetDateTime')),
      format: data.get('format') || 'mm:ss',
      fontSize: Number(data.get('fontSize')) || 96,
      fontFamily: String(data.get('fontFamily') || '').trim(),
      color: data.get('color'),
      hideWhenExpired: data.get('hideWhenExpired') === 'on',
      layout: graphic.data?.layout || { refWidth: 480, refHeight: 140, background: '' }
    }
  })
})

let countdownPreviewTimer = null
function ensureCountdownPreviewTimer() {
  const graphic = countdownGraphic()
  if (!graphic || !countdownShouldTick(graphic)) {
    if (countdownPreviewTimer) clearInterval(countdownPreviewTimer)
    countdownPreviewTimer = null
    return
  }
  if (!countdownPreviewTimer) {
    countdownPreviewTimer = setInterval(updateCountdownPreview, 1000)
  }
}

widgetAdd?.addEventListener('click', async () => {
  const type = widgetTypeAdd?.value
  if (!type) return
  const defaultNames = {
    matchScoreboard: 'Match score',
    customTicker: 'Ticker',
    streamCountdown: 'Stream countdown',
    lowerThird: 'Lower third',
    lowerThirdShow: 'Lower thirds',
    quizShow: 'Quiz',
    message: 'Message'
  }
  const defaultName = defaultNames[type] || 'New widget'
  const name = await promptName({
    title: 'Add widget',
    label: 'Widget name',
    defaultValue: defaultName
  })
  if (!name) return
  try {
    const res = await fetch('/api/graphics', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, name })
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err.error || 'Failed to add widget')
    }
    const created = await res.json()
    selectedGraphicId = created.id
  } catch (err) {
    setProjectStatus(err.message, 'error')
  }
})

widgetRemove?.addEventListener('click', async () => {
  const graphic = getSelectedGraphic()
  if (!graphic) return
  if (!window.confirm(`Remove widget "${graphic.name}"?`)) return
  try {
    const res = await fetch(`/api/graphics/${graphic.id}`, { method: 'DELETE' })
    if (!res.ok) throw new Error('Failed to remove widget')
    selectedGraphicId = null
  } catch (err) {
    setProjectStatus(err.message, 'error')
  }
})

copyBtn?.addEventListener('click', async () => {
  const url = `${window.location.origin}/render`
  try {
    await copyToClipboard(url)
    copyBtn.textContent = 'Copied'
    setTimeout(() => { copyBtn.textContent = COPY_ALL_RENDER_LABEL }, 1500)
  } catch (err) {
    console.error('Copy render URL failed:', err)
  }
})

wireGraphicsListActions()
wireRenderPreviewLinks(document, () => currentState?.settings)

const socket = io()
socket.on('connect', () => setConnectionStatus(true))
socket.on('disconnect', () => setConnectionStatus(false))
socket.on('stateChanged', applyState)

fetch('/api/state')
  .then((res) => res.json())
  .then(async (state) => {
    const cfg = configureGraphicId()
    if (cfg && state.graphics?.some((g) => g.id === cfg)) {
      selectedGraphicId = cfg
    }
    applyState(state)
    await Promise.all([loadProjects(), loadNetworkUrls()])
  })

;(function initMobileOperatorHint() {
  const hint = document.getElementById('mobile-operator-hint')
  const dismiss = document.getElementById('mobile-operator-hint-dismiss')
  if (!hint || window.matchMedia('(min-width: 768px)').matches) return
  if (sessionStorage.getItem('pv-dismiss-mobile-hint') === '1') return
  hint.hidden = false
  dismiss?.addEventListener('click', () => {
    hint.hidden = true
    sessionStorage.setItem('pv-dismiss-mobile-hint', '1')
  })
})()
