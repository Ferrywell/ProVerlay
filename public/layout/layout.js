import { isStripLayout, resolvePlacement, projectCanvas } from '/public/shared/canvas-layout.js'
import { wireRenderPreviewLinks } from '/public/shared/render-preview.js'

const els = {
  canvas: document.getElementById('layout-canvas'),
  stage: document.getElementById('layout-stage'),
  frame: document.getElementById('layout-frame'),
  hit: document.getElementById('layout-hit'),
  selection: document.getElementById('layout-selection'),
  selectionLabel: document.getElementById('layout-selection-label'),
  layers: document.getElementById('layout-layers'),
  status: document.getElementById('layout-status'),
  inspector: document.getElementById('layout-inspector'),
  inspectorTitle: document.getElementById('layout-inspector-title'),
  inspectorNote: document.getElementById('layout-inspector-note'),
  posField: document.getElementById('layout-pos-field'),
  posSelect: document.getElementById('layout-pos-select'),
  xyFields: document.getElementById('layout-xy-fields'),
  xInput: document.getElementById('layout-x'),
  yInput: document.getElementById('layout-y'),
  wField: document.getElementById('layout-w-field'),
  wInput: document.getElementById('layout-w')
}

const TYPE_LABELS = {
  matchScoreboard: 'Match score',
  customScoreboard: 'Scoreboard',
  composedScore: 'Scoreboard',
  customTicker: 'Ticker',
  streamCountdown: 'Countdown',
  lowerThird: 'Lower third',
  lowerThirdShow: 'Lower thirds',
  quizShow: 'Quiz',
  message: 'Message',
  image: 'Image',
  clock: 'Clock',
  f1Timing: 'F1 timing',
  hockeyScorebug: 'Hockey scorebug'
}

let state = { graphics: [], settings: {} }
let selectedId = null
let scale = 1
let canvasW = 1920
let canvasH = 1080
const previewLayers = {}
let drag = null
let statusTimer = null

function setStatus(text) {
  els.status.textContent = text
  clearTimeout(statusTimer)
  if (text) statusTimer = setTimeout(() => { els.status.textContent = '' }, 2500)
}

function frameDoc() {
  try {
    return els.frame.contentDocument
  } catch {
    return null
  }
}

function getGraphic(id) {
  return state.graphics.find((g) => g.id === id) || null
}

/* Bepaalt hoe een widget gepositioneerd wordt — en dus welk veld in de
   widget-instellingen de waarheid is. */
function dragMeta(graphic) {
  const d = graphic.data || {}
  if (
    ['matchScoreboard', 'customScoreboard', 'composedScore'].includes(graphic.type) &&
    isStripLayout(d.layout || {})
  ) {
    return { mode: 'placement' }
  }
  if (graphic.type === 'quizShow') return { mode: 'panel' }
  if (graphic.type === 'lowerThirdShow') {
    if (d.template?.layout?.background) return { mode: 'template' }
    return {
      mode: 'locked',
      note: 'The default lower third has a fixed spot. Upload a background PNG to place it freely.'
    }
  }
  if (graphic.type === 'customTicker') return { mode: 'locked' }
  if (graphic.position === 'bottom-full') return { mode: 'free', note: 'Position is "Bottom full width" — drag to switch to free placement.' }
  return { mode: 'free' }
}

function layerElementFor(id) {
  return frameDoc()?.querySelector(`.graphic-layer[data-id="${CSS.escape(id)}"]`) || null
}

/* Het zichtbare element waarop selectie/drag aangrijpt. */
function boxElementFor(id) {
  const layer = layerElementFor(id)
  if (!layer) return null
  const graphic = getGraphic(id)
  if (!graphic) return null
  const { mode } = dragMeta(graphic)
  if (mode === 'placement') return layer.querySelector('.match-board') || layer
  if (mode === 'panel') return layer.querySelector('.quiz-board') || layer
  if (graphic.type === 'lowerThirdShow') return layer.querySelector('.lt-board') || layer
  const inner = layer.querySelector('.graphic')
  return inner && inner.firstElementChild ? inner : layer
}

/* ---------- stage scaling ---------- */

function applyCanvasSize() {
  const { width, height } = projectCanvas(state.settings)
  canvasW = width
  canvasH = height
  fitStage()
}

function fitStage() {
  const wrap = els.canvas.getBoundingClientRect()
  const pad = 28
  const next = Math.min((wrap.width - pad) / canvasW, (wrap.height - pad) / canvasH)
  scale = Math.max(0.05, Math.min(next, 1.5))
  els.stage.style.width = `${canvasW}px`
  els.stage.style.height = `${canvasH}px`
  els.stage.style.transform = `translate(-50%, -50%) scale(${scale})`
  els.stage.style.setProperty('--inv-scale', String(1 / scale))
  updateSelectionBox()
}

window.addEventListener('resize', fitStage)

/* ---------- preview layer visibility ---------- */

function pushPreviewLayers() {
  els.frame.contentWindow?.postMessage({ type: 'pv-preview-layers', layers: previewLayers }, '*')
  scheduleSelectionRefresh()
}

els.frame.addEventListener('load', () => {
  pushPreviewLayers()
  scheduleSelectionRefresh()
})

/* ---------- layers panel ---------- */

function renderLayers() {
  const items = [...state.graphics].reverse()
  els.layers.innerHTML = items
    .map((g) => {
      const visible = previewLayers[g.id] !== false
      const { mode } = dragMeta(g)
      return `
        <li class="layout-layer${g.id === selectedId ? ' is-selected' : ''}" data-id="${g.id}">
          <button type="button" class="layout-layer__eye" data-eye="${g.id}" aria-pressed="${visible}" title="Show/hide in this editor only">${visible ? '◉' : '○'}</button>
          <span class="layout-layer__name">${escapeHtml(g.name || g.id)}</span>
          <span class="layout-layer__type">${TYPE_LABELS[g.type] || g.type}</span>
          ${mode === 'locked' ? '<span class="layout-layer__lock" title="Fixed position">FIXED</span>' : ''}
          ${g.visible ? '<span class="layout-layer__live">LIVE</span>' : ''}
        </li>`
    })
    .join('')
}

els.layers.addEventListener('click', (event) => {
  const eye = event.target.closest('[data-eye]')
  if (eye) {
    const id = eye.dataset.eye
    previewLayers[id] = previewLayers[id] === false
    pushPreviewLayers()
    renderLayers()
    if (id === selectedId && previewLayers[id] === false) updateSelectionBox()
    return
  }
  const row = event.target.closest('.layout-layer')
  if (row) selectGraphic(row.dataset.id)
})

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

/* ---------- selection ---------- */

function selectGraphic(id) {
  selectedId = id
  renderLayers()
  renderInspector()
  updateSelectionBox()
}

function updateSelectionBox() {
  const graphic = selectedId ? getGraphic(selectedId) : null
  const box = graphic ? boxElementFor(graphic.id) : null
  if (!graphic || !box) {
    els.selection.hidden = true
    return
  }
  const r = box.getBoundingClientRect()
  if (r.width < 2 && r.height < 2) {
    els.selection.hidden = true
    return
  }
  els.selection.hidden = false
  els.selection.style.left = `${r.left}px`
  els.selection.style.top = `${r.top}px`
  els.selection.style.width = `${r.width}px`
  els.selection.style.height = `${r.height}px`
  els.selection.style.outlineWidth = `calc(2px * var(--inv-scale, 1))`
  els.selectionLabel.style.fontSize = `calc(13px * var(--inv-scale, 1))`
  els.selectionLabel.textContent = graphic.name || graphic.id
}

let selectionRefreshTimer = null
function scheduleSelectionRefresh() {
  clearTimeout(selectionRefreshTimer)
  selectionRefreshTimer = setTimeout(() => {
    updateSelectionBox()
    els.hit.classList.toggle('is-draggable', isSelectedDraggable())
  }, 80)
}

function isSelectedDraggable() {
  const graphic = selectedId ? getGraphic(selectedId) : null
  return Boolean(graphic && dragMeta(graphic).mode !== 'locked')
}

/* ---------- inspector ---------- */

function renderInspector() {
  const graphic = selectedId ? getGraphic(selectedId) : null
  if (!graphic) {
    els.inspector.hidden = true
    return
  }
  const d = graphic.data || {}
  const { mode, note } = dragMeta(graphic)
  els.inspector.hidden = false
  els.inspectorTitle.textContent = graphic.name || graphic.id

  els.posField.hidden = mode !== 'free'
  els.xyFields.hidden = false
  els.wField.hidden = mode === 'free' || mode === 'locked'

  if (mode === 'free') {
    const pos = graphic.position || 'top-center'
    els.posSelect.value = pos
    const free = d.placementFree || {}
    els.xyFields.hidden = pos !== 'custom'
    els.xInput.value = round1(free.x ?? 50)
    els.yInput.value = round1(free.y ?? 50)
    els.inspectorNote.textContent = note || 'Saved to this widget’s own settings (Overlay position).'
  } else if (mode === 'placement' || mode === 'template') {
    const layout = mode === 'placement' ? d.layout || {} : d.template?.layout || {}
    const p = resolvePlacement(layout, state.settings)
    els.xInput.value = round1(p.x)
    els.yInput.value = round1(p.y)
    els.wInput.value = round1(p.width)
    els.inspectorNote.textContent = 'Saved to this widget’s position & scale settings.'
  } else if (mode === 'panel') {
    const panel = d.panel || { x: 4, y: 50, width: 44 }
    els.xInput.value = round1(panel.x)
    els.yInput.value = round1(panel.y)
    els.wInput.value = round1(panel.width)
    els.wField.hidden = false
    els.inspectorNote.textContent = 'Saved to the quiz panel settings.'
  } else {
    els.xyFields.hidden = true
    els.inspectorNote.textContent = note || 'The ticker is fixed to the bottom edge at full width.'
  }
  els.hit.classList.toggle('is-draggable', mode !== 'locked')
}

function round1(value) {
  return Math.round((Number(value) || 0) * 10) / 10
}

async function patchGraphic(id, patch) {
  const res = await fetch(`/api/graphics/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch)
  })
  if (!res.ok) setStatus('Saving failed')
  else setStatus('Saved to widget settings')
}

function positionPatch(graphic, x, y, width) {
  const { mode } = dragMeta(graphic)
  const clampedX = clamp(x, 0, 100)
  const clampedY = clamp(y, 0, 100)
  if (mode === 'placement') {
    const patch = { data: { layout: { placement: { x: clampedX, y: clampedY } } } }
    if (width !== undefined) patch.data.layout.placement.width = clamp(width, 1, 100)
    return patch
  }
  if (mode === 'template') {
    const patch = { data: { template: { layout: { placement: { x: clampedX, y: clampedY } } } } }
    if (width !== undefined) patch.data.template.layout.placement.width = clamp(width, 1, 100)
    return patch
  }
  if (mode === 'panel') {
    const patch = { data: { panel: { x: clampedX, y: clampedY } } }
    if (width !== undefined) patch.data.panel.width = clamp(width, 1, 100)
    return patch
  }
  return { position: 'custom', data: { placementFree: { x: clampedX, y: clampedY } } }
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, Number(value) || 0))
}

els.posSelect.addEventListener('change', async () => {
  const graphic = selectedId ? getGraphic(selectedId) : null
  if (!graphic) return
  const pos = els.posSelect.value
  const patch = { position: pos }
  if (pos === 'custom' && !graphic.data?.placementFree) {
    patch.data = { placementFree: { x: 50, y: 50 } }
  }
  await patchGraphic(graphic.id, patch)
})

for (const input of [els.xInput, els.yInput, els.wInput]) {
  input.addEventListener('change', async () => {
    const graphic = selectedId ? getGraphic(selectedId) : null
    if (!graphic) return
    const width = els.wField.hidden ? undefined : Number(els.wInput.value)
    await patchGraphic(
      graphic.id,
      positionPatch(graphic, Number(els.xInput.value), Number(els.yInput.value), width)
    )
  })
}

/* ---------- canvas pointer interaction ---------- */

function pointerToCanvas(event) {
  const rect = els.hit.getBoundingClientRect()
  return {
    x: (event.clientX - rect.left) / scale,
    y: (event.clientY - rect.top) / scale
  }
}

function graphicAtPoint(point) {
  const doc = frameDoc()
  if (!doc) return null
  const layerNodes = [...doc.querySelectorAll('#stage .graphic-layer')]
  for (let i = layerNodes.length - 1; i >= 0; i--) {
    const id = layerNodes[i].dataset.id
    if (!id || !getGraphic(id)) continue
    const box = boxElementFor(id)
    if (!box) continue
    const r = box.getBoundingClientRect()
    if (point.x >= r.left && point.x <= r.right && point.y >= r.top && point.y <= r.bottom) {
      return id
    }
  }
  return null
}

function dragStartPosition(graphic) {
  const d = graphic.data || {}
  const { mode } = dragMeta(graphic)
  if (mode === 'placement') {
    const p = resolvePlacement(d.layout || {}, state.settings)
    return { x: p.x, y: p.y }
  }
  if (mode === 'template') {
    const p = resolvePlacement(d.template?.layout || {}, state.settings)
    return { x: p.x, y: p.y }
  }
  if (mode === 'panel') {
    const panel = d.panel || { x: 4, y: 50 }
    return { x: Number(panel.x) || 0, y: Number(panel.y) || 0 }
  }
  if (graphic.position === 'custom' && d.placementFree) {
    return { x: Number(d.placementFree.x) || 50, y: Number(d.placementFree.y) || 50 }
  }
  // Eerste keer vrij slepen: vertrek vanaf het huidige middelpunt op het canvas
  const box = boxElementFor(graphic.id)
  if (box) {
    const r = box.getBoundingClientRect()
    return { x: ((r.left + r.width / 2) / canvasW) * 100, y: ((r.top + r.height / 2) / canvasH) * 100 }
  }
  return { x: 50, y: 50 }
}

function applyLiveDrag(graphic, x, y) {
  const { mode } = dragMeta(graphic)
  const layer = layerElementFor(graphic.id)
  if (!layer) return
  if (mode === 'placement' || mode === 'template') {
    const board = layer.querySelector(mode === 'placement' ? '.match-board' : '.lt-board')
    if (board) {
      board.style.left = `${x}%`
      board.style.top = `${y}%`
    }
  } else if (mode === 'panel') {
    const board = layer.querySelector('.quiz-board')
    if (board) {
      board.style.left = `${x}vw`
      board.style.top = `${y}vh`
    }
  } else {
    layer.className = 'graphic-layer pos-custom'
    layer.style.left = `${x}%`
    layer.style.top = `${y}%`
  }
  updateSelectionBox()
}

els.hit.addEventListener('pointerdown', (event) => {
  if (event.button !== 0) return
  const point = pointerToCanvas(event)
  const id = graphicAtPoint(point)
  if (!id) {
    selectGraphic(null)
    return
  }
  if (id !== selectedId) selectGraphic(id)
  const graphic = getGraphic(id)
  const { mode } = dragMeta(graphic)
  if (mode === 'locked') return

  drag = {
    id,
    mode,
    startPoint: point,
    startPos: dragStartPosition(graphic),
    moved: false
  }
  try {
    els.hit.setPointerCapture(event.pointerId)
  } catch {
    /* synthetic events hebben geen actieve pointer */
  }
  els.hit.classList.add('is-dragging')
})

els.hit.addEventListener('pointermove', (event) => {
  if (!drag) return
  const graphic = getGraphic(drag.id)
  if (!graphic) return
  const point = pointerToCanvas(event)
  let x = drag.startPos.x + ((point.x - drag.startPoint.x) / canvasW) * 100
  let y = drag.startPos.y + ((point.y - drag.startPoint.y) / canvasH) * 100
  // Snap naar horizontaal midden
  if (Math.abs(x - 50) < 0.8) x = 50
  x = clamp(x, 0, 100)
  y = clamp(y, 0, 100)
  drag.moved = true
  drag.lastX = x
  drag.lastY = y
  applyLiveDrag(graphic, x, y)
})

async function endDrag() {
  if (!drag) return
  const { id, moved, lastX, lastY } = drag
  drag = null
  els.hit.classList.remove('is-dragging')
  if (!moved) return
  const graphic = getGraphic(id)
  if (!graphic) return
  await patchGraphic(id, positionPatch(graphic, lastX, lastY))
}

els.hit.addEventListener('pointerup', endDrag)
els.hit.addEventListener('pointercancel', () => {
  drag = null
  els.hit.classList.remove('is-dragging')
  scheduleSelectionRefresh()
})

/* ---------- keyboard nudging ---------- */

document.addEventListener('keydown', async (event) => {
  if (event.target.matches('input, select, textarea')) return
  if (event.key === 'Escape') {
    selectGraphic(null)
    return
  }
  const deltas = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }
  const delta = deltas[event.key]
  if (!delta || !selectedId) return
  const graphic = getGraphic(selectedId)
  if (!graphic || dragMeta(graphic).mode === 'locked') return
  event.preventDefault()
  const step = event.shiftKey ? 1 : 0.1
  const start = dragStartPosition(graphic)
  await patchGraphic(
    graphic.id,
    positionPatch(graphic, start.x + delta[0] * step, start.y + delta[1] * step)
  )
})

/* ---------- state sync ---------- */

function applyState(next) {
  state = next
  applyCanvasSize()
  renderLayers()
  renderInspector()
  scheduleSelectionRefresh()
}

wireRenderPreviewLinks(document, () => state?.settings)

const socket = io()
socket.on('stateChanged', (next) => {
  if (drag) return // niet hertekenen midden in een sleepactie
  applyState(next)
})

fetch('/api/state')
  .then((r) => r.json())
  .then(applyState)
