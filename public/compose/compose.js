import {
  defaultPlacement,
  isStripLayout,
  projectCanvas,
  resolvePlacement
} from '/public/shared/canvas-layout.js'

const ACCEPTED_IMAGE_TYPES = new Set(['image/png', 'image/webp'])

function isAcceptedImage(file) {
  return file && ACCEPTED_IMAGE_TYPES.has(file.type)
}

const WIDGET_TYPES = {
  matchScoreboard: {
    label: 'Match score',
    editor: (id) => `/editor?graphic=${encodeURIComponent(id)}`,
    needsRegions: true
  },
  customTicker: {
    label: 'Ticker',
    editor: () => '/control',
    needsRegions: false
  },
  streamCountdown: {
    label: 'Stream countdown',
    editor: () => '/control',
    needsRegions: false
  },
  lowerThird: {
    label: 'Lower third',
    editor: () => '/control',
    needsRegions: true
  },
  message: {
    label: 'Message',
    editor: () => '/control',
    needsRegions: true
  }
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
  ['awayName', 'Away name']
]

const LOWER_BINDS = [
  ['name', 'Name'],
  ['title', 'Title'],
  ['company', 'Organization'],
  ['custom', 'Static text']
]

const uploadForm = document.getElementById('upload-form')
const composeType = document.getElementById('compose-type')
const composeName = document.getElementById('compose-name')
const composeFile = document.getElementById('compose-file')
const composeDropzone = document.getElementById('compose-dropzone')
const composeFileHint = document.getElementById('compose-file-hint')
const phaseUpload = document.getElementById('phase-upload')
const phaseReview = document.getElementById('phase-review')
const phaseCreate = document.getElementById('phase-create')
const phaseIndicators = document.querySelectorAll('.compose-phase')
const composeCanvas = document.getElementById('compose-canvas')
const composeFrame = document.getElementById('compose-frame')
const composeStrip = document.getElementById('compose-strip')
const composeStage = document.getElementById('compose-stage')
const composeRegionsRoot = document.getElementById('compose-regions')
const composeRegionList = document.getElementById('compose-region-list')
const composeDimensions = document.getElementById('compose-dimensions')
const composeStatus = document.getElementById('compose-status')
const composeOcrHint = document.getElementById('compose-ocr-hint')
const composeSummary = document.getElementById('compose-summary')
const composeSummaryList = document.getElementById('compose-summary-list')
const composeAddRegion = document.getElementById('compose-add-region')
const composeBack = document.getElementById('compose-back')
const composeContinue = document.getElementById('compose-continue')
const composeBackReview = document.getElementById('compose-back-review')
const composeCreateBtn = document.getElementById('compose-create-btn')

let state = null
let phase = 'upload'
let uploadedFile = null
let uploadedFilename = ''
let analysis = null
let regions = []
let selectedRegionId = null
let regionDrag = null
let layout = {
  refWidth: 1920,
  refHeight: 1080,
  background: '',
  placement: { x: 50, y: 5.5, width: 83.25 }
}

function setPhase(next) {
  phase = next
  phaseUpload.hidden = next !== 'upload'
  phaseReview.hidden = next !== 'review'
  phaseCreate.hidden = next !== 'create'
  phaseIndicators.forEach((node) => {
    const p = node.dataset.phase
    node.classList.toggle('is-active', p === next)
    node.classList.toggle('is-done', ['upload', 'review', 'create'].indexOf(p) < ['upload', 'review', 'create'].indexOf(next))
  })
  if (next === 'review') {
    requestAnimationFrame(() => sizeComposeCanvas())
  }
}

function setStatus(message, type = '') {
  if (!composeStatus) return
  composeStatus.textContent = message
  composeStatus.classList.remove('is-success', 'is-error')
  if (type === 'success') composeStatus.classList.add('is-success')
  if (type === 'error') composeStatus.classList.add('is-error')
}

function assetUrl(filename) {
  if (!filename || !state?.projectId) return ''
  return `/projects/${state.projectId}/assets/${encodeURIComponent(filename)}`
}

function bindOptionsForType(type) {
  if (type === 'matchScoreboard') return MATCH_BINDS
  if (type === 'lowerThird') return LOWER_BINDS
  return [['custom', 'Static text'], ['text', 'Message text']]
}

function defaultMatchScoreboardRegions(w, h) {
  const layoutHint = { refWidth: w, refHeight: h }
  const slots = isStripLayout(layoutHint)
    ? [
        { text: 'HOM', bind: 'homeCode', x: 14, y: 50 },
        { text: '0', bind: 'homeScore', x: 28, y: 50 },
        { text: '0', bind: 'awayScore', x: 72, y: 50 },
        { text: 'AWY', bind: 'awayCode', x: 86, y: 50 },
        { text: '0:00', bind: 'clock', x: 96, y: 50 }
      ]
    : defaultCardScoreboardSlots(w, h)
  return slots.map((slot, index) => bboxFromCenter(slot, w, h, index))
}

/** Compact scoreboard PNG (e.g. 610×400) — content sits lower, wider spacing for flags/scores/timer. */
function defaultCardScoreboardSlots(w, h) {
  const y = h / w > 0.45 ? 67 : 52
  return [
    { text: 'FRA', bind: 'homeCode', x: 22, y, w: 0.085, h: 0.22 },
    { text: '0', bind: 'homeScore', x: 35, y, w: 0.065, h: 0.26 },
    { text: '0', bind: 'awayScore', x: 58, y, w: 0.065, h: 0.26 },
    { text: 'SEN', bind: 'awayCode', x: 71, y, w: 0.085, h: 0.22 },
    { text: '90:00', bind: 'clock', x: 90, y, w: 0.115, h: 0.2 }
  ]
}

function bboxFromCenter(slot, w, h, index = 0) {
  const strip = isStripLayout({ refWidth: w, refHeight: h })
  const boxW =
    slot.w != null ? w * slot.w : slot.bind === 'clock' ? w * 0.11 : slot.bind?.includes('Score') ? w * 0.055 : w * 0.075
  const boxH = slot.h != null ? h * slot.h : h * (strip ? 0.32 : 0.24)
  const cx = (slot.x / 100) * w
  const cy = ((slot.y ?? 50) / 100) * h
  return {
    id: `region-${Date.now()}-${index}`,
    text: slot.text,
    bind: slot.bind || 'custom',
    enabled: true,
    bbox: {
      x: cx - boxW / 2,
      y: cy - boxH / 2,
      w: boxW,
      h: boxH
    }
  }
}

function defaultRegion(index = 0) {
  const w = layout.refWidth || 1920
  const h = layout.refHeight || 1080
  const binds = bindOptionsForType(composeType.value)
  const slot = {
    text: `Field ${regions.length + 1}`,
    bind: binds[index]?.[0] || 'custom',
    x: 20 + index * 12,
    y: 50
  }
  return bboxFromCenter(slot, w, h, index)
}

function defaultRegionsForType(type) {
  const w = layout.refWidth || 1920
  const h = layout.refHeight || 1080
  if (type === 'matchScoreboard') return defaultMatchScoreboardRegions(w, h)
  if (type === 'lowerThird') {
    return [
      bboxFromCenter({ text: 'Name', bind: 'name', x: 12, y: 62 }, w, h, 0),
      bboxFromCenter({ text: 'Title', bind: 'title', x: 12, y: 78 }, w, h, 1)
    ]
  }
  if (type === 'message') {
    return [bboxFromCenter({ text: 'Message', bind: 'text', x: 50, y: 50 }, w, h, 0)]
  }
  return [defaultRegion(0), defaultRegion(1)]
}

function applyCanvasLayout() {
  const w = layout.refWidth || 1920
  const h = layout.refHeight || 1080
  const frame = projectCanvas(state?.settings)

  composeCanvas?.classList.add('compose-canvas--asset')
  composeCanvas?.classList.remove('editor-canvas--strip', 'editor-canvas--full')
  composeCanvas?.style.setProperty('--compose-aspect', `${w} / ${h}`)
  composeCanvas?.style.setProperty('--frame-aspect', `${frame.width} / ${frame.height}`)

  if (composeStrip) {
    composeStrip.style.left = '0'
    composeStrip.style.top = '0'
    composeStrip.style.width = '100%'
    composeStrip.style.height = '100%'
    composeStrip.style.transform = 'none'
  }

  if (composeStage && layout.background) {
    composeStage.style.backgroundImage = `url("${assetUrl(layout.background)}")`
    composeStage.style.backgroundSize = '100% 100%'
  }

  if (composeDimensions) {
    composeDimensions.textContent = `${WIDGET_TYPES[composeType.value]?.label || composeType.value} · ${w}×${h}px`
  }

  sizeComposeCanvas()
}

function sizeComposeCanvas() {
  const wrap = document.querySelector('.compose-canvas-wrap')
  if (!wrap || !composeCanvas) return
  const w = layout.refWidth || 1
  const h = layout.refHeight || 1
  const ratio = w / h
  const pad = 24
  const availW = Math.max(320, wrap.clientWidth - pad)
  const availH = Math.max(240, wrap.clientHeight - pad)
  let width = availW
  let height = width / ratio
  if (height > availH) {
    height = availH
    width = height * ratio
  }
  composeCanvas.style.width = `${Math.floor(width)}px`
  composeCanvas.style.height = `${Math.floor(height)}px`
}

function updateBboxNode(region) {
  const w = layout.refWidth
  const h = layout.refHeight
  const box = composeRegionsRoot?.querySelector(`.compose-bbox[data-id="${region.id}"]`)
  if (!box) return
  box.style.left = `${(region.bbox.x / w) * 100}%`
  box.style.top = `${(region.bbox.y / h) * 100}%`
  box.style.width = `${(region.bbox.w / w) * 100}%`
  box.style.height = `${(region.bbox.h / h) * 100}%`
}

function startRegionDrag(event, region) {
  if (!composeStage) return
  event.preventDefault()
  event.stopPropagation()
  selectRegion(region.id)
  const rect = composeStage.getBoundingClientRect()
  const scaleX = layout.refWidth / rect.width
  const scaleY = layout.refHeight / rect.height
  regionDrag = {
    id: region.id,
    pointerId: event.pointerId,
    rect,
    scaleX,
    scaleY,
    grabDx: (event.clientX - rect.left) * scaleX - region.bbox.x,
    grabDy: (event.clientY - rect.top) * scaleY - region.bbox.y
  }
  event.currentTarget.setPointerCapture?.(event.pointerId)
  event.currentTarget.classList.add('is-dragging')
}

function onRegionPointerMove(event) {
  if (!regionDrag || event.pointerId !== regionDrag.pointerId) return
  const region = regions.find((item) => item.id === regionDrag.id)
  if (!region) return
  const x = (event.clientX - regionDrag.rect.left) * regionDrag.scaleX - regionDrag.grabDx
  const y = (event.clientY - regionDrag.rect.top) * regionDrag.scaleY - regionDrag.grabDy
  region.bbox.x = Math.max(0, Math.min(layout.refWidth - region.bbox.w, x))
  region.bbox.y = Math.max(0, Math.min(layout.refHeight - region.bbox.h, y))
  updateBboxNode(region)
}

function endRegionDrag(event) {
  if (!regionDrag || event.pointerId !== regionDrag.pointerId) return
  composeRegionsRoot?.querySelector(`.compose-bbox[data-id="${regionDrag.id}"]`)?.classList.remove('is-dragging')
  regionDrag = null
}

function selectRegion(id) {
  if (selectedRegionId === id) return
  selectedRegionId = id
  updateRegionSelection()
}

function updateRegionSelection() {
  composeRegionsRoot?.querySelectorAll('.compose-bbox').forEach((node) => {
    node.classList.toggle('is-selected', node.dataset.id === selectedRegionId)
  })
  composeRegionList?.querySelectorAll('.compose-region-card').forEach((node) => {
    node.classList.toggle('is-selected', node.dataset.id === selectedRegionId)
  })
}

function renderRegions() {
  if (!composeRegionsRoot || !composeRegionList) return

  composeRegionsRoot.innerHTML = ''
  composeRegionList.innerHTML = ''

  const w = layout.refWidth
  const h = layout.refHeight

  for (const region of regions) {
    if (region.enabled === false) continue

    const left = (region.bbox.x / w) * 100
    const top = (region.bbox.y / h) * 100
    const bw = (region.bbox.w / w) * 100
    const bh = (region.bbox.h / h) * 100

    const box = document.createElement('button')
    box.type = 'button'
    box.className = `compose-bbox${region.id === selectedRegionId ? ' is-selected' : ''}`
    box.dataset.id = region.id
    box.dataset.label = region.text || bindLabel(region.bind) || 'Field'
    box.style.left = `${left}%`
    box.style.top = `${top}%`
    box.style.width = `${bw}%`
    box.style.height = `${bh}%`
    box.title = region.text || bindLabel(region.bind) || 'Field'
    box.addEventListener('pointerdown', (event) => startRegionDrag(event, region))
    composeRegionsRoot.appendChild(box)

    const card = document.createElement('div')
    card.className = `compose-region-card${region.id === selectedRegionId ? ' is-selected' : ''}`
    card.dataset.id = region.id
    const bindOptions = bindOptionsForType(composeType.value)
      .map(([value, label]) => `<option value="${value}"${region.bind === value ? ' selected' : ''}>${label}</option>`)
      .join('')

    card.innerHTML = `
      <div class="compose-region-card__row">
        <strong>${escapeHtml(region.text || bindLabel(region.bind) || 'Field')}</strong>
        <button type="button" class="compose-region-card__remove" data-remove="${region.id}">Remove</button>
      </div>
      <label>
        <span>Text</span>
        <input type="text" data-field="text" value="${escapeHtml(region.text || '')}" />
      </label>
      <label>
        <span>Binding</span>
        <select data-field="bind">${bindOptions}</select>
      </label>
    `

    card.addEventListener('click', (event) => {
      if (event.target.closest('input, select, button')) return
      selectRegion(region.id)
    })

    const textInput = card.querySelector('[data-field="text"]')
    const bindSelect = card.querySelector('[data-field="bind"]')

    textInput?.addEventListener('input', (event) => {
      region.text = event.target.value
      const bbox = composeRegionsRoot.querySelector(`.compose-bbox[data-id="${region.id}"]`)
      if (bbox) {
        bbox.dataset.label = region.text || bindLabel(region.bind) || 'Field'
        bbox.title = bbox.dataset.label
      }
      const title = card.querySelector('strong')
      if (title) title.textContent = region.text || bindLabel(region.bind) || 'Field'
    })

    bindSelect?.addEventListener('change', (event) => {
      region.bind = event.target.value
      const bbox = composeRegionsRoot.querySelector(`.compose-bbox[data-id="${region.id}"]`)
      if (bbox && !region.text) {
        bbox.dataset.label = bindLabel(region.bind) || 'Field'
        bbox.title = bbox.dataset.label
      }
    })

    card.querySelector('[data-remove]')?.addEventListener('click', (event) => {
      event.stopPropagation()
      regions = regions.filter((item) => item.id !== region.id)
      if (selectedRegionId === region.id) selectedRegionId = null
      renderRegions()
    })

    composeRegionList.appendChild(card)
  }

  const needsRegions = WIDGET_TYPES[composeType.value]?.needsRegions
  if (composeAddRegion) composeAddRegion.hidden = !needsRegions
}

function bindLabel(bind) {
  const options = bindOptionsForType(composeType.value)
  return options.find(([value]) => value === bind)?.[1] || ''
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/"/g, '&quot;')
}

async function uploadAsset(file) {
  const body = new FormData()
  body.append('file', file)
  const res = await fetch(`/api/projects/${state.projectId}/assets`, { method: 'POST', body })
  if (!res.ok) throw new Error('Upload failed')
  const result = await res.json()
  return result.filename || file.name
}

async function analyzeUpload(file) {
  const body = new FormData()
  body.append('file', file)
  body.append('widgetType', composeType.value)
  const res = await fetch(`/api/projects/${state.projectId}/analyze-image`, { method: 'POST', body })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || 'Analysis failed')
  }
  return res.json()
}

function buildGraphicPayload() {
  const type = composeType.value
  const placement = resolvePlacement(layout, state?.settings)
  const body = {
    type,
    name: composeName.value.trim() || WIDGET_TYPES[type].label,
    filename: uploadedFilename,
    width: layout.refWidth,
    height: layout.refHeight,
    regions: regions.filter((r) => r.enabled !== false),
    placement,
    designFrameWidth: state?.settings?.designFrameWidth || 3840
  }
  return body
}

async function createWidget() {
  composeCreateBtn.disabled = true
  setStatus('Creating widget…')
  try {
    const res = await fetch(`/api/projects/${state.projectId}/compose-widget`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(buildGraphicPayload())
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err.error || 'Creation failed')
    }
    const { graphic } = await res.json()
    const editor = WIDGET_TYPES[graphic.type]?.editor?.(graphic.id) || '/control'
    window.location.href = editor
  } catch (err) {
    setStatus(err.message || 'Creation failed', 'error')
    composeCreateBtn.disabled = false
  }
}

function fillSummary() {
  const type = composeType.value
  const label = WIDGET_TYPES[type]?.label || type
  composeSummary.textContent = `You are creating a ${label.toLowerCase()} overlay based on ${uploadedFilename}.`
  composeSummaryList.innerHTML = `
    <dt>Name</dt><dd>${composeName.value.trim() || label}</dd>
    <dt>Type</dt><dd>${label}</dd>
    <dt>File</dt><dd>${uploadedFilename} (${layout.refWidth}×${layout.refHeight}px)</dd>
    <dt>Fields</dt><dd>${regions.filter((r) => r.enabled !== false).length} active</dd>
  `
}

uploadForm?.addEventListener('submit', async (event) => {
  event.preventDefault()
  if (!state?.projectId) {
    setStatus('First select an active project on the dashboard', 'error')
    return
  }
  const file = uploadedFile || composeFile.files?.[0]
  if (!file) {
    setStatus('Choose a PNG or WebP file', 'error')
    return
  }

  const btn = document.getElementById('compose-analyze-btn')
  btn.disabled = true
  setStatus('Uploading and analyzing…')

  try {
    uploadedFilename = await uploadAsset(file)
    analysis = await analyzeUpload(file)
    layout = {
      refWidth: analysis.width,
      refHeight: analysis.height,
      background: uploadedFilename,
      designFrameWidth: state?.settings?.designFrameWidth || 3840,
      placement: defaultPlacement(
        { refWidth: analysis.width, refHeight: analysis.height, designFrameWidth: state?.settings?.designFrameWidth },
        state?.settings
      )
    }
    regions = (analysis.regions || []).map((r, i) => ({
      ...r,
      id: r.id || `region-${i}-${Date.now()}`,
      enabled: r.enabled !== false
    }))
    if (!regions.length && WIDGET_TYPES[composeType.value]?.needsRegions) {
      regions = defaultRegionsForType(composeType.value)
    }
    composeOcrHint.textContent = analysis.hint || (analysis.ocrAvailable ? '' : 'Add fields manually or adjust them in the editor after creation.')
    applyCanvasLayout()
    renderRegions()
    setPhase('review')
    setStatus('')
  } catch (err) {
    setStatus(err.message || 'Analysis failed', 'error')
  } finally {
    btn.disabled = false
  }
})

composeFile?.addEventListener('change', () => {
  uploadedFile = composeFile.files?.[0] || null
  if (uploadedFile && composeFileHint) {
    composeFileHint.textContent = `${uploadedFile.name} · ${Math.round(uploadedFile.size / 1024)} KB`
  }
})

composeDropzone?.addEventListener('dragover', (event) => {
  event.preventDefault()
  composeDropzone.classList.add('is-dragover')
})
composeDropzone?.addEventListener('dragleave', () => composeDropzone.classList.remove('is-dragover'))
composeDropzone?.addEventListener('drop', (event) => {
  event.preventDefault()
  composeDropzone.classList.remove('is-dragover')
  const file = event.dataTransfer?.files?.[0]
  if (isAcceptedImage(file)) {
    uploadedFile = file
    composeFile.files = event.dataTransfer.files
    composeFileHint.textContent = `${file.name} · ${Math.round(file.size / 1024)} KB`
  } else {
    setStatus('Only PNG and WebP are supported', 'error')
  }
})

composeAddRegion?.addEventListener('click', () => {
  regions.push(defaultRegion(regions.length))
  renderRegions()
})

composeBack?.addEventListener('click', () => setPhase('upload'))
composeContinue?.addEventListener('click', () => {
  fillSummary()
  setPhase('create')
})
composeBackReview?.addEventListener('click', () => setPhase('review'))
composeCreateBtn?.addEventListener('click', createWidget)

composeType?.addEventListener('change', () => {
  const label = WIDGET_TYPES[composeType.value]?.label
  if (composeName && !composeName.value.trim()) {
    composeName.placeholder = `E.g. ${label}`
  }
})

const params = new URLSearchParams(window.location.search)
if (params.get('type') && WIDGET_TYPES[params.get('type')]) {
  composeType.value = params.get('type')
}

fetch('/api/state')
  .then((res) => res.json())
  .then((next) => {
    state = next
    if (!state?.projectId) {
      setStatus('No active project — go to the dashboard', 'error')
    }
  })
  .catch(() => setStatus('Could not load project', 'error'))

setPhase('upload')

window.addEventListener('resize', () => {
  if (phase === 'review') sizeComposeCanvas()
})

window.addEventListener('pointermove', onRegionPointerMove)
window.addEventListener('pointerup', endRegionDrag)
window.addEventListener('pointercancel', endRegionDrag)
