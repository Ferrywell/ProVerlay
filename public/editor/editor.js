import { hexFromColor, patchGraphic } from '/public/shared/client.js'
import { resolveEditorGraphicId } from '/public/shared/device.js'
import { resolveBindText, penaltiesFeatureEnabled } from '/public/shared/match-utils.js'
import {
  canvasAspectRatio,
  elementBoxStyle,
  isStripLayout,
  layoutBackgroundVisible,
  projectCanvas,
  resolvePlacement,
  defaultPlacement,
  defaultStripSlots,
  readImageDimensions,
  renderUrl
} from '/public/shared/canvas-layout.js'
import { wireRenderPreviewLinks } from '/public/shared/render-preview.js'
import {
  fetchProjectFontAssets,
  injectProjectFontFaces,
  injectBrandFontFace,
  projectFontOptions,
  fillFontSelect,
  resolveElementFontFamily
} from '/public/shared/project-fonts.js'
import {
  arrowKeyDeltas,
  isTypingTarget,
  nudgePercent,
  nudgeStepPx
} from '/public/shared/wysiwyg-nudge.js'
import { createHistory } from '/public/shared/wysiwyg-history.js'
import { bindRangeNumber, setRangeNumberPair } from '/public/shared/range-number-sync.js'
import {
  alignCodeRow,
  alignElementsX,
  alignElementsY,
  alignScoreRow,
  matchFontSize
} from '/public/shared/wysiwyg-align.js'

const DEFAULT_ELEMENTS = [
  { id: 'el-home-team', bind: 'homeTeam', label: 'Home team', text: 'Home', x: 22, y: 45, fontSize: 36, color: '#ffffff' },
  { id: 'el-home-score', bind: 'homeScore', label: 'Home score', text: '0', x: 22, y: 58, fontSize: 56, color: '#007aff' },
  { id: 'el-away-team', bind: 'awayTeam', label: 'Away team', text: 'Away', x: 78, y: 45, fontSize: 36, color: '#ffffff' },
  { id: 'el-away-score', bind: 'awayScore', label: 'Away score', text: '0', x: 78, y: 58, fontSize: 56, color: '#007aff' },
  { id: 'el-period', bind: 'period', label: 'Period', text: '1st half', x: 50, y: 42, fontSize: 24, color: '#ffffff' },
  { id: 'el-minute', bind: 'minute', label: 'Minute', text: "0'", x: 50, y: 55, fontSize: 28, color: '#ffffff' }
]

const BIND_PREVIEW = {
  homeTeam: (d) => d.homeTeam ?? 'Home',
  homeScore: (d) => String(d.homeScore ?? 0),
  awayTeam: (d) => d.awayTeam ?? 'Away',
  awayScore: (d) => String(d.awayScore ?? 0),
  period: (d) => d.period ?? '1st half',
  minute: (d) => (d.showClock === false ? '' : `${d.minute ?? 0}'`)
}

const graphicSelect = document.getElementById('editor-graphic-select')
const saveBtn = document.getElementById('editor-save')
const addBtn = document.getElementById('editor-add-element')
const statusEl = document.getElementById('editor-status')
const stage = document.getElementById('editor-stage')
const editorFrame = document.getElementById('editor-frame')
const editorStrip = document.getElementById('editor-strip')
const elementsRoot = document.getElementById('editor-elements')
const canvas = document.getElementById('editor-canvas')
const uploadZone = document.getElementById('editor-upload-zone')
const bgUpload = document.getElementById('editor-bg-upload')
const bgVisibleToggle = document.getElementById('bg-visible-toggle')
const inspectorForm = document.getElementById('inspector-form')
const inspectorEmpty = document.getElementById('inspector-empty')
const inspectorTitle = document.getElementById('inspector-title')
const propText = document.getElementById('prop-text')
const propFont = document.getElementById('prop-font')
const propSize = document.getElementById('prop-size')
const propSizeNum = document.getElementById('prop-size-num')
const propColor = document.getElementById('prop-color')
const propBind = document.getElementById('prop-bind')
const propX = document.getElementById('prop-x')
const propY = document.getElementById('prop-y')
const propDelete = document.getElementById('prop-delete')
const autoSlotsBtn = document.getElementById('editor-auto-slots')
const selectStripBtn = document.getElementById('editor-select-strip')
const stripHandle = document.getElementById('editor-strip-handle')
const layoutInfo = document.getElementById('editor-layout-info')
const editorReference = document.getElementById('editor-reference')
const refVisible = document.getElementById('ref-visible')
const refOpacity = document.getElementById('ref-opacity')
const refOpacityOut = document.getElementById('ref-opacity-out')
const layoutForm = document.getElementById('layout-form')
const layoutReference = document.getElementById('layout-reference')
const layoutRefUpload = document.getElementById('layout-ref-upload')
const layoutRefUploadBtn = document.getElementById('layout-ref-upload-btn')
const placementFieldset = document.getElementById('placement-fieldset')
const placementX = document.getElementById('placement-x')
const placementY = document.getElementById('placement-y')
const placementW = document.getElementById('placement-w')
const placementXNum = document.getElementById('placement-x-num')
const placementYNum = document.getElementById('placement-y-num')
const placementWNum = document.getElementById('placement-w-num')
const alignYBtn = document.getElementById('align-y')
const alignXBtn = document.getElementById('align-x')
const alignFontBtn = document.getElementById('align-font')
const alignScoresBtn = document.getElementById('align-scores')

let state = null
let graphic = null
let layout = {
  refWidth: 1920,
  refHeight: 1080,
  background: '',
  placement: { x: 50, y: 5.5, width: 83.25 },
  referenceImage: '',
  referenceOpacity: 0.45,
  referenceVisible: true,
  backgroundVisible: true
}
let designAssets = []
let fontOptions = []
let elements = []
let selectedId = null
let selectedIds = new Set()
let drag = null
let stripDrag = null
let stripMode = false
let localBgUrl = null
let historySuspended = false

const history = createHistory({ limit: 60 })

function captureEditorState() {
  return {
    elements: structuredClone(elements),
    layout: structuredClone(layout),
    selectedId,
    selectedIds: [...selectedIds],
    stripMode
  }
}

function applyEditorState(snapshot) {
  if (!snapshot) return
  elements = snapshot.elements
  layout = snapshot.layout
  selectedId = snapshot.selectedId
  selectedIds = new Set(snapshot.selectedIds || (snapshot.selectedId ? [snapshot.selectedId] : []))
  setStripMode(snapshot.stripMode)
  applyBackground()
  applyCanvasAspect()
  applyReference()
  fillPlacementForm()
  if (selectedId && elements.some((item) => item.id === selectedId)) {
    selectElement(selectedId, { skipHistory: true })
  } else {
    selectedId = null
    selectedIds = new Set()
    updateAlignToolbar()
    showTextInspector(false)
    renderElements()
  }
}

function pushHistory() {
  if (historySuspended) return
  history.push(captureEditorState())
}

function withHistory(fn) {
  pushHistory()
  fn()
}

function undoEdit() {
  const snapshot = history.undo(captureEditorState())
  if (!snapshot) return
  historySuspended = true
  applyEditorState(snapshot)
  historySuspended = false
  setStatus('Undone', '')
  setTimeout(() => setStatus(''), 1500)
}

function redoEdit() {
  const snapshot = history.redo(captureEditorState())
  if (!snapshot) return
  historySuspended = true
  applyEditorState(snapshot)
  historySuspended = false
  setStatus('Redone', '')
  setTimeout(() => setStatus(''), 1500)
}

function setStatus(message, type = '') {
  if (!statusEl) return
  statusEl.textContent = message
  statusEl.classList.remove('is-success', 'is-error')
  if (type === 'success') statusEl.classList.add('is-success')
  if (type === 'error') statusEl.classList.add('is-error')
}

function editableGraphics() {
  return (state?.graphics || []).filter((g) =>
    ['footballScore', 'customScoreboard', 'composedScore', 'matchScoreboard', 'lowerThirdShow'].includes(g.type)
  )
}

function isLowerThird(g = graphic) {
  return g?.type === 'lowerThirdShow'
}

// lowerThirdShow bewaart layout/elements genest onder data.template
function editableData(g) {
  return isLowerThird(g) ? g.data?.template || {} : g.data || {}
}

function lowerThirdPreviewEntry() {
  return (
    (graphic?.data?.entries || [])[0] || { name: 'Full Name', title: 'Title', company: 'Company' }
  )
}

function resolveGraphicId() {
  const fromQuery = resolveEditorGraphicId()
  const list = editableGraphics()
  if (fromQuery && list.some((g) => g.id === fromQuery)) return fromQuery
  return list[0]?.id || null
}

function previewText(el) {
  if (!el.bind || el.bind === 'custom') return el.text || 'Text'
  if (isLowerThird()) {
    return resolveBindText(el.bind, lowerThirdPreviewEntry()) || el.text || ''
  }
  if (graphic?.type === 'matchScoreboard') {
    return resolveBindText(el.bind, graphic.data || {}) || el.text || ''
  }
  const resolver = BIND_PREVIEW[el.bind]
  return resolver ? resolver(graphic?.data || {}) : el.text || ''
}

function applyCanvasAspect() {
  if (!canvas) return
  const frame = projectCanvas(state?.settings)
  const strip = isStripLayout(layout)
  canvas.classList.toggle('editor-canvas--strip', strip)
  canvas.classList.toggle('editor-canvas--full', !strip)
  canvas.style.setProperty('--frame-aspect', `${frame.width} / ${frame.height}`)
  canvas.style.setProperty('--strip-aspect', canvasAspectRatio(layout))

  if (strip && editorStrip) {
    syncPlacementFromLayout()
  }

  if (layoutInfo) {
    const placement = resolvePlacement(layout, state?.settings)
    layoutInfo.textContent = layout.background
      ? `Project ${frame.width}×${frame.height}px · asset ${layout.refWidth}×${layout.refHeight}px · overlay ${placement.width.toFixed(1)}% wide`
      : `Project canvas ${frame.width}×${frame.height}px`
  }
}

async function refreshProjectFonts() {
  injectBrandFontFace(state?.brand)
  const fonts = await fetchProjectFontAssets(state?.projectId)
  injectProjectFontFaces(fonts, state?.brand)
  fontOptions = projectFontOptions(fonts, { brandFamily: state?.brand?.fontFamily })
  fillFontSelect(propFont, fontOptions, propFont?.value)
}

async function loadDesignAssets() {
  if (!state?.projectId) {
    designAssets = []
    fillReferenceSelect()
    return
  }
  try {
    const res = await fetch(`/api/projects/${state.projectId}/assets`)
    if (!res.ok) throw new Error('Failed to load assets')
    const assets = await res.json()
    designAssets = assets.filter((a) => /^design-/i.test(a.filename))
  } catch {
    designAssets = []
  }
  fillReferenceSelect()
}

function fillReferenceSelect() {
  if (!layoutReference) return
  const current = layout.referenceImage || ''
  const options = ['<option value="">No reference</option>']
  for (const asset of designAssets) {
    options.push(`<option value="${asset.filename}">${asset.filename}</option>`)
  }
  layoutReference.innerHTML = options.join('')
  if (current && designAssets.some((a) => a.filename === current)) {
    layoutReference.value = current
  } else if (current) {
    layoutReference.innerHTML += `<option value="${current}" selected>${current}</option>`
  }
}

function applyReference() {
  if (!editorReference) return
  const filename = layout.referenceImage || ''
  const url = filename ? assetUrl(filename) : ''
  const visible = layout.referenceVisible !== false && refVisible?.checked !== false
  const opacity = Number(layout.referenceOpacity ?? 0.45)

  if (url && visible) {
    editorReference.hidden = false
    editorReference.style.backgroundImage = `url("${url}")`
    editorReference.style.setProperty('--ref-opacity', String(opacity))
    editorReference.classList.toggle('is-hidden', false)
    editorReference.setAttribute('aria-hidden', 'false')
  } else if (url) {
    editorReference.hidden = false
    editorReference.style.backgroundImage = `url("${url}")`
    editorReference.classList.add('is-hidden')
    editorReference.setAttribute('aria-hidden', 'true')
  } else {
    editorReference.hidden = true
    editorReference.style.backgroundImage = ''
    editorReference.setAttribute('aria-hidden', 'true')
  }

  if (refOpacity) refOpacity.value = Math.round(opacity * 100)
  if (refOpacityOut) refOpacityOut.textContent = Math.round(opacity * 100)
  if (refVisible) refVisible.checked = visible
}

function syncPlacementFromLayout() {
  const placement = resolvePlacement(layout, state?.settings)
  layout.placement = placement
  if (editorStrip && isStripLayout(layout)) {
    editorStrip.style.left = `${placement.x}%`
    editorStrip.style.top = `${placement.y}%`
    editorStrip.style.width = `${placement.width}%`
  }
  setRangeNumberPair(placementX, placementXNum, placement.x, { min: 0, max: 100 })
  setRangeNumberPair(placementY, placementYNum, placement.y, { min: 0, max: 100 })
  setRangeNumberPair(placementW, placementWNum, placement.width, { min: 0, max: 100 })
}

function fillPlacementForm() {
  const strip = isStripLayout(layout)
  if (placementFieldset) placementFieldset.hidden = !strip
  if (selectStripBtn) selectStripBtn.hidden = !strip
  if (stripHandle) stripHandle.hidden = !strip || !stripMode
  syncPlacementFromLayout()
}

function setStripMode(active) {
  stripMode = Boolean(active)
  editorStrip?.classList.toggle('is-strip-active', stripMode)
  if (stripHandle) stripHandle.hidden = !stripMode || !isStripLayout(layout)
  if (selectStripBtn) {
    selectStripBtn.classList.toggle('button--primary', stripMode)
    selectStripBtn.textContent = stripMode ? 'Done moving' : 'Move PNG'
  }
  if (stripMode) {
    selectedId = null
    inspectorForm.hidden = true
    inspectorEmpty.hidden = true
    layoutForm.hidden = false
    if (inspectorTitle) inspectorTitle.textContent = 'Overlay & reference'
    syncElementPositionInputs()
    renderElements()
  }
}

function showTextInspector(show) {
  if (show) {
    layoutForm.hidden = true
    inspectorEmpty.hidden = true
    inspectorForm.hidden = false
    if (inspectorTitle) inspectorTitle.textContent = 'Text field'
  } else {
    layoutForm.hidden = false
    inspectorEmpty.hidden = true
    inspectorForm.hidden = true
    if (inspectorTitle) inspectorTitle.textContent = 'Overlay & reference'
  }
}

function syncElementPositionInputs() {
  const el = elements.find((item) => item.id === selectedId)
  if (!el) return
  if (propX) propX.value = Number(el.x).toFixed(1)
  if (propY) propY.value = Number(el.y).toFixed(1)
}

function nudgeSelectedElement(dx, dy) {
  const el = elements.find((item) => item.id === selectedId)
  if (!el || !stage) return false
  withHistory(() => {
    const rect = stage.getBoundingClientRect()
    el.x = nudgePercent(el.x, dx, rect.width, { min: 0, max: 100 })
    el.y = nudgePercent(el.y, dy, rect.height, { min: 0, max: 100 })
    syncElementPositionInputs()
    renderElements()
  })
  return true
}

function nudgeStripPlacement(dx, dy) {
  if (!stripMode || !isStripLayout(layout) || !editorFrame) return false
  withHistory(() => {
    const rect = editorFrame.getBoundingClientRect()
    const current = resolvePlacement(layout, state?.settings)
    layout.placement = {
      ...current,
      x: nudgePercent(current.x, dx, rect.width, { min: 0, max: 100 }),
      y: nudgePercent(current.y, dy, rect.height, { min: 0, max: 100 })
    }
    syncPlacementFromLayout()
  })
  return true
}

function wireKeyboardNudge() {
  window.addEventListener('keydown', (event) => {
    if (event.ctrlKey || event.metaKey) {
      const key = event.key.toLowerCase()
      if (key === 'z' && !event.shiftKey) {
        if (!isTypingTarget(event.target)) {
          event.preventDefault()
          undoEdit()
        }
        return
      }
      if ((key === 'z' && event.shiftKey) || key === 'y') {
        if (!isTypingTarget(event.target)) {
          event.preventDefault()
          redoEdit()
        }
        return
      }
    }

    if (isTypingTarget(event.target)) return
    const deltas = arrowKeyDeltas(event.key, event.shiftKey, nudgeStepPx(event.shiftKey))
    if (!deltas) return

    if (stripMode && isStripLayout(layout)) {
      if (nudgeStripPlacement(deltas.dx, deltas.dy)) event.preventDefault()
      return
    }

    if (!selectedId) return
    if (nudgeSelectedElement(deltas.dx, deltas.dy)) event.preventDefault()
  })
}

function assetUrl(filename) {
  if (!filename) return ''
  if (filename.startsWith('http') || filename.startsWith('blob:') || filename.startsWith('/')) return filename
  const projectId = state?.projectId || 'default'
  return `/projects/${projectId}/assets/${encodeURIComponent(filename)}`
}

function applyBackground() {
  const visible = layoutBackgroundVisible(layout)
  const bg = visible ? localBgUrl || assetUrl(layout.background) : ''
  if (bgVisibleToggle) {
    bgVisibleToggle.hidden = !layout.background
    bgVisibleToggle.setAttribute('aria-pressed', visible ? 'true' : 'false')
    bgVisibleToggle.title = visible
      ? 'Hide PNG background in preview and render'
      : 'Show PNG background in preview and render'
  }
  if (bg) {
    stage.style.backgroundImage = `url("${bg}")`
    stage.classList.remove('has-bg-hint')
  } else {
    stage.style.backgroundImage = ''
    stage.classList.toggle('has-bg-hint', !layout.background)
  }
}

async function persistBackgroundVisibility() {
  if (!graphic) return
  setStatus('Saving visibility…')
  try {
    const payload = isLowerThird() ? { template: buildPayload() } : buildPayload()
    await patchGraphic(graphic.id, { data: payload })
    setStatus('Background visibility saved', 'success')
    setTimeout(() => setStatus(''), 1800)
  } catch (err) {
    setStatus(err.message || 'Save failed', 'error')
  }
}

function getSelectedElements() {
  return elements.filter((item) => selectedIds.has(item.id))
}

function updateAlignToolbar() {
  const count = selectedIds.size
  const multi = count >= 2
  if (alignYBtn) alignYBtn.disabled = !multi
  if (alignXBtn) alignXBtn.disabled = !multi
  if (alignFontBtn) alignFontBtn.disabled = !multi
}

function setSelection(ids, { primaryId = null } = {}) {
  selectedIds = new Set(ids)
  selectedId = primaryId || ids[0] || null
  updateAlignToolbar()
}

function renderElements() {
  elementsRoot.innerHTML = ''
  const brandFamily = state?.brand?.fontFamily || ''

  for (const el of elements) {
    const node = document.createElement('span')
    node.className = `editor-element score-el score-el--${el.bind || 'custom'}${selectedIds.has(el.id) ? ' is-selected' : ''}`
    node.dataset.id = el.id
    node.setAttribute(
      'style',
      elementBoxStyle({ ...el, fontFamily: resolveElementFontFamily(el, brandFamily) }, layout)
    )
    const text = previewText(el)
    if (el.bind === 'homeScore' || el.bind === 'awayScore') {
      node.innerHTML = `<span class="score-el-text score-el-text--animated">${text}</span>`
    } else {
      node.textContent = text
    }
    if (!stripMode) {
      node.addEventListener('pointerdown', (event) => startDrag(event, el.id))
    }
    elementsRoot.appendChild(node)
  }
}

function selectElement(id, { skipHistory = false, additive = false } = {}) {
  setStripMode(false)
  if (additive) {
    const next = new Set(selectedIds)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelection([...next], { primaryId: id })
  } else {
    setSelection([id], { primaryId: id })
  }
  const el = elements.find((item) => item.id === selectedId)
  if (!el || selectedIds.size !== 1) {
    layoutForm.hidden = true
    inspectorForm.hidden = true
    if (selectedIds.size > 1) {
      if (inspectorTitle) inspectorTitle.textContent = `${selectedIds.size} fields selected`
      if (inspectorEmpty) {
        inspectorEmpty.hidden = false
        inspectorEmpty.textContent =
          'Use “Align Y”, “Align X” or “Match size” in the toolbar. Shift+click to change the selection.'
      }
    } else {
      showTextInspector(false)
    }
    renderElements()
    return
  }
  showTextInspector(true)
  if (inspectorTitle) inspectorTitle.textContent = 'Text field'
  inspectorForm.hidden = false
  inspectorEmpty.hidden = true
  propText.value = el.bind === 'custom' ? (el.text || '') : previewText(el)
  propFont.value = resolveElementFontFamily(el, state?.brand?.fontFamily) || fontOptions[0]?.value || ''
  const maxSize = Math.max(280, Math.round((layout.refHeight || 120) * 0.65))
  if (propSize) propSize.max = String(maxSize)
  if (propSizeNum) {
    propSizeNum.max = String(maxSize)
    propSizeNum.min = '12'
  }
  setRangeNumberPair(propSize, propSizeNum, el.fontSize || 36, { min: 12, max: maxSize })
  propColor.value = hexFromColor(el.color || '#ffffff')
  propBind.value = el.bind || 'custom'
  syncElementPositionInputs()
  renderElements()
}

function startStripDrag(event) {
  if (!stripMode || !editorFrame) return
  event.preventDefault()
  event.stopPropagation()
  pushHistory()
  const rect = editorFrame.getBoundingClientRect()
  const target = event.currentTarget
  stripDrag = { pointerId: event.pointerId, rect }
  target.setPointerCapture?.(event.pointerId)
}

function onStripPointerMove(event) {
  if (!stripDrag || event.pointerId !== stripDrag.pointerId) return
  const x = ((event.clientX - stripDrag.rect.left) / stripDrag.rect.width) * 100
  const y = ((event.clientY - stripDrag.rect.top) / stripDrag.rect.height) * 100
  layout.placement = {
    ...resolvePlacement(layout, state?.settings),
    x: Math.min(100, Math.max(0, x)),
    y: Math.min(100, Math.max(0, y))
  }
  syncPlacementFromLayout()
}

function endStripDrag(event) {
  if (!stripDrag || event.pointerId !== stripDrag.pointerId) return
  stripDrag = null
}

function startDrag(event, id) {
  if (event.shiftKey) {
    event.preventDefault()
    selectElement(id, { additive: true })
    return
  }
  event.preventDefault()
  selectElement(id, { skipHistory: true })
  pushHistory()
  const el = elements.find((item) => item.id === id)
  if (!el || !stage) return
  const rect = stage.getBoundingClientRect()
  drag = {
    id,
    pointerId: event.pointerId,
    rect
  }
  event.currentTarget.setPointerCapture(event.pointerId)
  event.currentTarget.classList.add('is-dragging')
}

function onPointerMove(event) {
  if (!drag || event.pointerId !== drag.pointerId) return
  const el = elements.find((item) => item.id === drag.id)
  if (!el) return
  const x = ((event.clientX - drag.rect.left) / drag.rect.width) * 100
  const y = ((event.clientY - drag.rect.top) / drag.rect.height) * 100
  el.x = Math.min(100, Math.max(0, x))
  el.y = Math.min(100, Math.max(0, y))
  syncElementPositionInputs()
  renderElements()
}

function endDrag(event) {
  if (!drag || event.pointerId !== drag.pointerId) return
  const node = elementsRoot.querySelector(`[data-id="${drag.id}"]`)
  node?.classList.remove('is-dragging')
  node?.releasePointerCapture?.(event.pointerId)
  drag = null
}

const MATCH_BINDS = [
  ['custom', 'Static text'],
  ['homeCode', 'Home code'],
  ['homeScore', 'Home score'],
  ['awayCode', 'Away code'],
  ['awayScore', 'Away score'],
  ['clock', 'Match clock'],
  ['period', 'Period'],
  ['homeName', 'Home name'],
  ['awayName', 'Away name'],
  ...(penaltiesFeatureEnabled() ? [['penaltyScore', 'Penalty score']] : [])
]

const LEGACY_BINDS = [
  ['custom', 'Static text'],
  ['homeTeam', 'Home team'],
  ['homeScore', 'Home score'],
  ['awayTeam', 'Away team'],
  ['awayScore', 'Away score'],
  ['period', 'Period'],
  ['minute', 'Minute']
]

const LOWER_THIRD_BINDS = [
  ['custom', 'Static text'],
  ['name', 'Name'],
  ['title', 'Title/role'],
  ['company', 'Company']
]

function updateBindOptions() {
  if (!propBind) return
  const options = isLowerThird()
    ? LOWER_THIRD_BINDS
    : graphic?.type === 'matchScoreboard'
      ? MATCH_BINDS
      : LEGACY_BINDS
  const current = propBind.value
  propBind.innerHTML = options.map(([value, label]) => `<option value="${value}">${label}</option>`).join('')
  if (options.some(([value]) => value === current)) propBind.value = current
}

function loadFromGraphic(g) {
  graphic = g
  updateBindOptions()
  const data = editableData(g)
  layout = {
    refWidth: data.layout?.refWidth || 1920,
    refHeight: data.layout?.refHeight || 1080,
    background: data.layout?.background || '',
    designFrameWidth: data.layout?.designFrameWidth,
    placement: data.layout?.placement || defaultPlacement(data.layout || {}, state?.settings),
    referenceImage: data.layout?.referenceImage || '',
    referenceOpacity: data.layout?.referenceOpacity ?? 0.45,
    referenceVisible: data.layout?.referenceVisible !== false,
    backgroundVisible: data.layout?.backgroundVisible !== false
  }
  elements = (data.elements?.length ? structuredClone(data.elements) : structuredClone(DEFAULT_ELEMENTS))
    .map((el) => ({
      ...el,
      fontFamily: resolveElementFontFamily(el, state?.brand?.fontFamily)
    }))
  selectedId = null
  selectedIds = new Set()
  updateAlignToolbar()
  setStripMode(false)
  showTextInspector(false)
  history.reset()
  pushHistory()
  applyBackground()
  applyCanvasAspect()
  applyReference()
  fillPlacementForm()
  fillReferenceSelect()
  if (autoSlotsBtn) autoSlotsBtn.hidden = !isStripLayout(layout) || graphic?.type !== 'matchScoreboard'
  renderElements()
}

function populateGraphicSelect() {
  const list = editableGraphics()
  graphicSelect.innerHTML = list.length
    ? list.map((g) => `<option value="${g.id}">${g.name}</option>`).join('')
    : '<option value="">No scoreboard overlay</option>'
  const id = resolveGraphicId()
  if (id) graphicSelect.value = id
}

function buildPayload() {
  const data = { ...editableData(graphic) }
  data.layout = {
    ...layout,
    placement: resolvePlacement(layout, state?.settings),
    referenceImage: layout.referenceImage || '',
    referenceOpacity: Number(layout.referenceOpacity ?? 0.45),
    referenceVisible: layout.referenceVisible !== false,
    backgroundVisible: layout.backgroundVisible !== false
  }
  data.elements = elements.map(({ id, bind, label, text, x, y, fontSize, color, fontFamily, anchor, minWidthCqw, letterSpacing }) => ({
    id,
    bind,
    label,
    text,
    x,
    y,
    fontSize,
    color,
    fontFamily,
    anchor,
    minWidthCqw,
    letterSpacing
  }))
  return data
}

async function saveGraphic() {
  if (!graphic) {
    setStatus('No overlay selected', 'error')
    return
  }
  saveBtn.disabled = true
  setStatus('Saving…')
  try {
    const payload = isLowerThird() ? { template: buildPayload() } : buildPayload()
    const res = await fetch(`/api/graphics/${graphic.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: payload })
    })
    if (!res.ok) throw new Error('Save failed')
    setStatus('Saved', 'success')
    setTimeout(() => setStatus(''), 2000)
  } catch (err) {
    setStatus(err.message || 'Save failed', 'error')
  } finally {
    saveBtn.disabled = false
  }
}

async function applyPngDimensions(file) {
  try {
    const dims = await readImageDimensions(file)
    layout.refWidth = dims.width
    layout.refHeight = dims.height
    layout.placement = defaultPlacement(layout, state?.settings)
    applyCanvasAspect()
    if (isStripLayout(layout) && graphic?.type === 'matchScoreboard') {
      const useAuto = window.confirm(
        `Score bar detected (${dims.width}×${dims.height}px). Auto-place text fields? You can fine-tune them afterwards.`
      )
      if (useAuto) {
        elements = defaultStripSlots(dims.width, dims.height)
        renderElements()
      }
    }
  } catch {
    /* keep default layout */
  }
}

async function tryUploadBackground(file) {
  if (!file || file.type !== 'image/png') {
    setStatus('Only PNG files are supported', 'error')
    return
  }
  localBgUrl = URL.createObjectURL(file)
  layout.background = file.name
  layout.backgroundVisible = true
  await applyPngDimensions(file)
  applyBackground()
  setStatus('Background loaded…', '')

  const projectId = state?.projectId
  if (!projectId) return

  const body = new FormData()
  body.append('file', file)
  try {
    const res = await fetch(`/api/projects/${projectId}/assets`, { method: 'POST', body })
    if (res.ok) {
      const result = await res.json()
      layout.background = result.filename || file.name
      localBgUrl = null
      applyBackground()
      setStatus(`Design uploaded (${layout.refWidth}×${layout.refHeight}px) — don't forget to save`, 'success')
      setTimeout(() => setStatus(''), 3500)
    }
  } catch {
    setStatus('Preview loaded; upload failed', 'error')
  }
}

const previewLink = document.querySelector('a[href="/render"]')
function updatePreviewLink() {
  if (previewLink && graphic?.id) {
    previewLink.href = renderUrl(graphic.id)
  }
}

function wireInspector() {
  propText?.addEventListener('input', () => {
    const el = elements.find((item) => item.id === selectedId)
    if (!el) return
    el.text = propText.value
    if (el.bind === 'custom') renderElements()
  })
  propText?.addEventListener('change', () => pushHistory())

  propFont?.addEventListener('change', () => {
    pushHistory()
    const el = elements.find((item) => item.id === selectedId)
    if (!el) return
    el.fontFamily = propFont.value
    renderElements()
  })

  const onSizeChange = (value) => {
    const el = elements.find((item) => item.id === selectedId)
    if (!el) return
    el.fontSize = Number(value)
    renderElements()
  }

  bindRangeNumber(propSize, propSizeNum, {
    min: 12,
    max: 280,
    step: 1,
    onChange: onSizeChange
  })
  propSize?.addEventListener('change', () => pushHistory())
  propSizeNum?.addEventListener('change', () => pushHistory())

  propColor?.addEventListener('input', () => {
    const el = elements.find((item) => item.id === selectedId)
    if (!el) return
    el.color = propColor.value
    renderElements()
  })
  propColor?.addEventListener('change', () => pushHistory())

  propBind?.addEventListener('change', () => {
    pushHistory()
    const el = elements.find((item) => item.id === selectedId)
    if (!el) return
    el.bind = propBind.value
    propText.value = previewText(el)
    renderElements()
  })

  const applyElementPosition = () => {
    const el = elements.find((item) => item.id === selectedId)
    if (!el) return
    el.x = Math.min(100, Math.max(0, Number(propX?.value) || 0))
    el.y = Math.min(100, Math.max(0, Number(propY?.value) || 0))
    syncElementPositionInputs()
    renderElements()
  }

  propX?.addEventListener('change', () => {
    pushHistory()
    applyElementPosition()
  })
  propY?.addEventListener('change', () => {
    pushHistory()
    applyElementPosition()
  })

  propDelete?.addEventListener('click', () => {
    if (!selectedId) return
    withHistory(() => {
      elements = elements.filter((item) => item.id !== selectedId)
      selectedId = null
      showTextInspector(false)
      renderElements()
    })
  })
}

function wireLayoutControls() {
  layoutReference?.addEventListener('change', () => {
    layout.referenceImage = layoutReference.value
    applyReference()
  })

  refVisible?.addEventListener('change', () => {
    layout.referenceVisible = refVisible.checked
    applyReference()
  })

  refOpacity?.addEventListener('input', () => {
    layout.referenceOpacity = Number(refOpacity.value) / 100
    if (refOpacityOut) refOpacityOut.textContent = refOpacity.value
    applyReference()
  })

  bgVisibleToggle?.addEventListener('click', async (event) => {
    event.preventDefault()
    event.stopPropagation()
    if (!layout.background) return
    layout.backgroundVisible = !layoutBackgroundVisible(layout)
    applyBackground()
    await persistBackgroundVisibility()
  })

  const onPlacementChange = () => {
    layout.placement = {
      ...resolvePlacement(layout, state?.settings),
      x: Number(placementX?.value) || 0,
      y: Number(placementY?.value) || 0,
      width: Number(placementW?.value) || 0
    }
    syncPlacementFromLayout()
  }

  bindRangeNumber(placementX, placementXNum, { min: 0, max: 100, step: 0.1, onChange: onPlacementChange })
  bindRangeNumber(placementY, placementYNum, { min: 0, max: 100, step: 0.1, onChange: onPlacementChange })
  bindRangeNumber(placementW, placementWNum, { min: 0, max: 100, step: 0.1, onChange: onPlacementChange })

  const pushPlacementHistory = () => pushHistory()
  placementX?.addEventListener('change', pushPlacementHistory)
  placementY?.addEventListener('change', pushPlacementHistory)
  placementW?.addEventListener('change', pushPlacementHistory)
  placementXNum?.addEventListener('change', pushPlacementHistory)
  placementYNum?.addEventListener('change', pushPlacementHistory)
  placementWNum?.addEventListener('change', pushPlacementHistory)

  layoutRefUploadBtn?.addEventListener('click', () => layoutRefUpload?.click())

  layoutRefUpload?.addEventListener('change', async () => {
    const file = layoutRefUpload.files?.[0]
    if (!file || !state?.projectId) return
    const body = new FormData()
    const filename = file.name.startsWith('design-') ? file.name : `design-${file.name}`
    body.append('file', file, filename)
    setStatus('Uploading reference…')
    try {
      const res = await fetch(`/api/projects/${state.projectId}/assets`, { method: 'POST', body })
      if (!res.ok) throw new Error('Upload failed')
      const result = await res.json()
      await loadDesignAssets()
      layout.referenceImage = result.filename || filename
      layoutReference.value = layout.referenceImage
      layout.referenceVisible = true
      applyReference()
      setStatus('Reference loaded — align your text fields', 'success')
      setTimeout(() => setStatus(''), 2500)
    } catch (err) {
      setStatus(err.message || 'Upload failed', 'error')
    } finally {
      layoutRefUpload.value = ''
    }
  })

  selectStripBtn?.addEventListener('click', () => setStripMode(!stripMode))

  stripHandle?.addEventListener('pointerdown', startStripDrag)
  editorStrip?.addEventListener('pointerdown', (event) => {
    if (!stripMode) return
    if (event.target.closest('.editor-element')) return
    startStripDrag(event)
  })
  window.addEventListener('pointermove', onStripPointerMove)
  window.addEventListener('pointerup', endStripDrag)
  window.addEventListener('pointercancel', endStripDrag)
}

function wireUpload() {
  bgUpload?.addEventListener('change', () => {
    const file = bgUpload.files?.[0]
    if (file) tryUploadBackground(file)
    bgUpload.value = ''
  })

  uploadZone?.addEventListener('click', (event) => {
    if (event.target.closest('#bg-visible-toggle')) return
    bgUpload?.click()
  })

  uploadZone?.addEventListener('dragover', (event) => {
    event.preventDefault()
    uploadZone.classList.add('is-dragover')
  })
  uploadZone?.addEventListener('dragleave', () => uploadZone.classList.remove('is-dragover'))
  uploadZone?.addEventListener('drop', (event) => {
    event.preventDefault()
    uploadZone.classList.remove('is-dragover')
    const file = event.dataTransfer?.files?.[0]
    if (file) tryUploadBackground(file)
  })
}

function wireCanvas() {
  canvas?.addEventListener('pointerdown', (event) => {
    if (event.target.closest('.editor-element') || event.target.closest('.editor-strip__handle')) return
    if (stripMode) return
    if (event.target === canvas || event.target === editorFrame || event.target === stage || event.target === elementsRoot) {
      selectedId = null
      selectedIds = new Set()
      updateAlignToolbar()
      showTextInspector(false)
      renderElements()
    }
  })
  window.addEventListener('pointermove', onPointerMove)
  window.addEventListener('pointerup', endDrag)
  window.addEventListener('pointercancel', endDrag)
  window.addEventListener('resize', () => renderElements())
}

autoSlotsBtn?.addEventListener('click', () => {
  if (!isStripLayout(layout)) return
  withHistory(() => {
    elements = defaultStripSlots(layout.refWidth, layout.refHeight)
    renderElements()
  })
  setStatus('Fields placed — drag them into position on your PNG', 'success')
  setTimeout(() => setStatus(''), 2500)
})

addBtn?.addEventListener('click', () => {
  withHistory(() => {
    const id = `el-${Date.now()}`
    elements.push({
      id,
      bind: 'custom',
      label: 'New field',
      text: 'Text',
      x: 50,
      y: 50,
      fontSize: 32,
      color: '#ffffff',
      fontFamily: state?.brand?.fontFamily
    })
    selectElement(id, { skipHistory: true })
  })
})

alignYBtn?.addEventListener('click', () => {
  const sel = getSelectedElements()
  if (sel.length < 2) return
  withHistory(() => {
    alignElementsY(sel)
    renderElements()
    if (selectedId) syncElementPositionInputs()
  })
})

alignXBtn?.addEventListener('click', () => {
  const sel = getSelectedElements()
  if (sel.length < 2) return
  withHistory(() => {
    alignElementsX(sel)
    renderElements()
    if (selectedId) syncElementPositionInputs()
  })
})

alignFontBtn?.addEventListener('click', () => {
  const sel = getSelectedElements()
  if (sel.length < 2) return
  withHistory(() => {
    matchFontSize(sel)
    renderElements()
    if (selectedId) {
      const el = elements.find((item) => item.id === selectedId)
      if (el) setRangeNumberPair(propSize, propSizeNum, el.fontSize || 36, { min: 12, max: Number(propSize?.max) || 280 })
    }
  })
})

alignScoresBtn?.addEventListener('click', () => {
  withHistory(() => {
    alignScoreRow(elements)
    alignCodeRow(elements)
    renderElements()
    setStatus('Score and code fields aligned to the same Y', 'success')
    setTimeout(() => setStatus(''), 2000)
  })
})

saveBtn?.addEventListener('click', saveGraphic)

graphicSelect?.addEventListener('change', () => {
  const g = editableGraphics().find((item) => item.id === graphicSelect.value)
  if (g) {
    loadFromGraphic(g)
    updatePreviewLink()
  }
})

wireInspector()
wireLayoutControls()
wireUpload()
wireCanvas()
wireKeyboardNudge()

wireRenderPreviewLinks(document, () => state?.settings)

const socket = io()
socket.on('stateChanged', async (next) => {
  state = next
  const currentId = graphic?.id || resolveGraphicId()
  populateGraphicSelect()
  await Promise.all([refreshProjectFonts(), loadDesignAssets()])
  const g = editableGraphics().find((item) => item.id === currentId)
  if (g) {
    loadFromGraphic(g)
    updatePreviewLink()
  }
})

fetch('/api/state')
  .then((res) => res.json())
  .then(async (next) => {
    state = next
    populateGraphicSelect()
    await Promise.all([refreshProjectFonts(), loadDesignAssets()])
    const id = resolveGraphicId()
    const g = editableGraphics().find((item) => item.id === id)
    if (g) {
      loadFromGraphic(g)
      updatePreviewLink()
    } else {
      setStatus('Add a match score overlay to this project', 'error')
    }
  })
  .catch((err) => {
    console.error('Editor init failed', err)
    setStatus(`Could not load state: ${err.message}`, 'error')
  })
