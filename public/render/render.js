import {
  resolveBindText,
  buildPenaltyDots,
  ensurePenaltySlots,
  formatClock,
  widgetVisible,
  clockPlateUsesPill,
  resolveClockPlate
} from '/public/shared/match-utils.js'
import {
  msUntilTarget,
  formatCountdown,
  countdownDigitHtml,
  countdownShouldTick
} from '/public/shared/countdown-utils.js'
import { mountCustomTicker, stopCustomTicker } from '/public/shared/ticker-engine.js'
import { buildTickerBoardHtml, tickerAssetUrl } from '/public/shared/ticker-board.js'
import { applyServerTimeFromState } from '/public/shared/server-time.js'
import { persistAutoStoppageIfNeeded } from '/public/shared/operate-match.js'
import { canvasAspectRatio, elementBoxStyle, isStripLayout, isFullFrameBackground, layoutBackgroundVisible, placementStyle, fontSizeStyle, resolveContainerWidthPx, projectCanvas, supportsContainerQueries, clockPillBoxStyle, clockPillTextStyle } from '/public/shared/canvas-layout.js'
import { injectProjectFontFaces, fetchProjectFontAssets, injectBrandFontFace, resolveRenderFontFamily } from '/public/shared/project-fonts.js'

const stage = document.getElementById('stage')
const layers = new Map()
const removalTimers = new Map()
const skipEnterAnimation = new Set()
const scoreMemory = new Map()
const urlParams = new URLSearchParams(window.location.search)
const isolateGraphicId = urlParams.get('graphic')
const previewWindow = urlParams.get('previewWindow') === '1'

// Preview-modus voor de overlay layout-editor: alle widgets tonen ongeacht
// live-status; de editor schakelt lagen lokaal via postMessage.
const previewMode = urlParams.get('preview') === '1'
let previewLayers = {}
let lastGraphics = []

if (previewMode) {
  document.documentElement.dataset.preview = '1'
  window.addEventListener('message', (event) => {
    const msg = event.data
    if (msg?.type === 'pv-preview-layers') {
      previewLayers = msg.layers || {}
      syncGraphics(lastGraphics)
    }
  })
}

function graphicShown(graphic) {
  if (previewMode) return previewLayers[graphic.id] !== false
  if (isolateGraphicId) return Boolean(graphic.soloVisible)
  return Boolean(graphic.visible)
}

const POSITION_CLASS = {
  center: 'pos-center',
  'bottom-left': 'pos-bottom-left',
  'bottom-center': 'pos-bottom-center',
  'bottom-full': 'pos-bottom-full',
  'top-left': 'pos-top-left',
  'top-center': 'pos-top-center',
  'top-right': 'pos-top-right'
}

let projectId = 'blank'
let projectSettings = { canvasWidth: 1920, canvasHeight: 1080 }
let matchClockTimer = null
let countdownTimer = null
let cachedGraphics = []

function useRenderCqw() {
  return !document.documentElement.dataset.renderCompat
}

function initRenderCompat() {
  const vmix = /vmix/i.test(navigator.userAgent)
  const noCqw = !supportsContainerQueries()
  if (vmix || noCqw) {
    document.documentElement.dataset.renderCompat = 'px'
  } else {
    delete document.documentElement.dataset.renderCompat
  }
}

function layoutStyleOptions(layout) {
  return {
    settings: projectSettings,
    containerWidthPx: resolveContainerWidthPx(layout, projectSettings),
    useCqw: useRenderCqw()
  }
}

let previewAspectLock = false

function updatePreviewWindowScale() {
  if (!previewWindow) return
  const { width, height } = projectCanvas(projectSettings)
  const scale = Math.min(window.innerWidth / width, window.innerHeight / height)
  document.documentElement.style.setProperty('--preview-scale', String(scale))
}

function enforcePreviewWindowAspect() {
  if (!previewWindow || previewAspectLock) return
  const { width: cw, height: ch } = projectCanvas(projectSettings)
  if (!cw || !ch) return

  const aspect = cw / ch
  const innerW = window.innerWidth
  const innerH = window.innerHeight
  const idealH = Math.round(innerW / aspect)
  const deltaH = idealH - innerH

  if (Math.abs(deltaH) > 2) {
    previewAspectLock = true
    try {
      window.resizeTo(window.outerWidth, window.outerHeight + deltaH)
    } catch {
      // Browser may block resize; letterbox on dark background still shows canvas bounds.
    }
    previewAspectLock = false
  }
  updatePreviewWindowScale()
}

function setupPreviewWindow() {
  if (!previewWindow) return
  document.documentElement.dataset.previewWindow = '1'
  window.addEventListener('resize', enforcePreviewWindowAspect)
  enforcePreviewWindowAspect()
}

function applyCanvas(state) {
  projectSettings = state.settings || {}
  const { width, height } = projectCanvas(projectSettings)
  document.documentElement.style.setProperty('--canvas-w', `${width}px`)
  document.documentElement.style.setProperty('--canvas-h', `${height}px`)
  document.documentElement.dataset.canvas = `${width}x${height}`
  if (isolateGraphicId) {
    document.documentElement.dataset.isolated = isolateGraphicId
  }
  updatePreviewWindowScale()
}

async function applyProjectFonts(state) {
  const fonts = await fetchProjectFontAssets(state.projectId)
  injectProjectFontFaces(fonts, state.brand)
  if (document.fonts?.ready) await document.fonts.ready
}

function applyBrand(state) {
  projectId = state.projectId || 'blank'
  const brand = state.brand || {}
  const colors = brand.colors || {}
  document.documentElement.style.setProperty('--primary', colors.primary || '#007AFF')
  document.documentElement.style.setProperty('--secondary', colors.secondary || '#5856D6')
  document.documentElement.style.setProperty('--text', colors.text || '#1D1D1F')
  document.documentElement.style.setProperty('--background', colors.background || 'rgba(255,255,255,0.78)')
  document.documentElement.style.setProperty('--font-size', `${state.settings?.fontSize ?? 2.2}vmin`)
  document.documentElement.style.setProperty('--padding', `${state.settings?.padding ?? 2.5}vmin`)
  document.documentElement.style.setProperty('--brand-font', brand.fontFamily || 'system-ui, sans-serif')
  document.body.style.background = state.settings?.canvasBackground || 'transparent'

  injectBrandFontFace(brand)
  document.getElementById('brand-font')?.remove()
}

function assetUrl(filename) {
  return tickerAssetUrl(projectId, filename)
}

function escape(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

function animateScore(node, newText, graphicId, bind, anim) {
  if (!anim?.enabled) {
    node.textContent = newText
    return
  }
  const key = `${graphicId}:${bind}`
  const prev = scoreMemory.get(key)
  scoreMemory.set(key, newText)
  if (prev === undefined || prev === newText) {
    node.textContent = newText
    return
  }

  const dur = anim.durationMs || 420
  node.style.setProperty('--score-anim-dur', `${dur}ms`)
  node.innerHTML = `<span class="score-roll"><span class="score-roll-out">${escape(prev)}</span><span class="score-roll-in">${escape(newText)}</span></span>`
  setTimeout(() => {
    if (node.isConnected) node.textContent = newText
  }, dur)
}

function layoutBackgroundImageAttr(layout) {
  if (!layoutBackgroundVisible(layout)) return ''
  return `background-image:url('${assetUrl(layout.background)}')`
}

function buildLowerThirdShow(data) {
  const entry = (data.entries || []).find((e) => e.id === data.activeEntryId)
  if (!entry) return ''
  const template = data.template || {}
  const layout = template.layout || { refWidth: 1920, refHeight: 1080, background: '' }
  const bgAttr = layoutBackgroundImageAttr(layout)

  // Zonder achtergrond-PNG: nette standaard lower-third plate, anders is witte
  // tekst onzichtbaar boven lichte video
  if (!layout.background) {
    const meta = [entry.title, entry.company].filter(Boolean).join(' · ')
    return `
      <div class="lt-board lt-board--default">
        <div class="lt-plate">
          <span class="lt-plate__name">${escape(entry.name)}</span>
          ${meta ? `<span class="lt-plate__meta">${escape(meta)}</span>` : ''}
        </div>
      </div>
    `
  }

  const elements = (template.elements || [])
    .map((el) => {
      const bindData = el.bind === 'custom' ? { ...entry, text: el.text } : entry
      const text = el.bind === 'custom' ? (el.text || '') : resolveBindText(el.bind, bindData)
      const boxStyle = elementBoxStyle(el, layout, layoutStyleOptions(layout))
      return `<span class="score-el score-el--${el.bind || 'custom'}" data-bind="${el.bind}" style="${boxStyle}">${escape(text)}</span>`
    })
    .join('')

  const placedStyle = placementStyle(layout, projectSettings)
  return `
    <div class="lt-board" style="${placedStyle}">
      <div class="lt-canvas" style="--ref-w:${layout.refWidth};--ref-h:${layout.refHeight};aspect-ratio:${canvasAspectRatio(layout)};${bgAttr}">
        ${elements}
      </div>
    </div>
  `
}

function buildQuizShow(data) {
  const q = (data.questions || []).find((item) => item.id === data.activeQuestionId)
  if (!q) return ''
  const panel = data.panel || { x: 4, y: 50, width: 44 }
  const letters = ['A', 'B', 'C', 'D', 'E', 'F']
  const revealed = Boolean(data.revealed)
  const options = (q.options || [])
    .map((opt, i) => {
      if (!String(opt || '').trim()) return ''
      const isCorrect = revealed && i === q.correct
      const dimmed = revealed && i !== q.correct
      return `
        <div class="quiz-opt${isCorrect ? ' is-correct' : ''}${dimmed ? ' is-dimmed' : ''}">
          <span class="quiz-opt__letter">${letters[i] || i + 1}</span>
          <span class="quiz-opt__text">${escape(opt)}</span>
        </div>`
    })
    .join('')

  return `
    <div class="quiz-board" style="left:${panel.x}vw;top:${panel.y}vh;width:${panel.width}vw;">
      <div class="quiz-question">${escape(q.question || '')}</div>
      <div class="quiz-options">${options}</div>
    </div>
  `
}

function buildMatchScoreboard(data, graphicId) {
  const layout = data.layout || { refWidth: 1920, refHeight: 1080, background: '' }
  const bgAttr = layoutBackgroundImageAttr(layout)
  const anim = data.animation || { enabled: true, durationMs: 420 }
  const strip = isStripLayout(layout)
  const styleOpts = layoutStyleOptions(layout)
  const usePill = clockPlateUsesPill(layout)
  const clockEl = (data.elements || []).find((el) => el.bind === 'clock')
  const elements = (data.elements || [])
    .filter((el) => !(usePill && el.bind === 'clock'))
    .map((el) => {
      const text = el.bind === 'custom' ? (el.text || '') : resolveBindText(el.bind, data)
      const isScore = el.bind === 'homeScore' || el.bind === 'awayScore'
      const scoreAttr = isScore ? ` data-score-bind="${el.bind}" data-graphic-id="${graphicId}"` : ''
      const inner = isScore
        ? `<span class="score-el-text score-el-text--animated"${scoreAttr}>${escape(text)}</span>`
        : escape(text)
      const styledEl = el.fontFamily
        ? { ...el, fontFamily: resolveRenderFontFamily(el.fontFamily) }
        : el
      const boxStyle = elementBoxStyle(styledEl, layout, layoutStyleOptions(layout))
      return `<span class="score-el score-el--${el.bind || 'custom'}" data-bind="${el.bind}" style="${boxStyle}">${inner}</span>`
    })
    .join('')

  let clockPillHtml = ''
  if (usePill && clockEl) {
    const pillCfg = resolveClockPlate(layout)
    const styledClock = clockEl.fontFamily
      ? { ...clockEl, fontFamily: resolveRenderFontFamily(clockEl.fontFamily) }
      : clockEl
    const clockText = resolveBindText('clock', data)
    const pillStyle = clockPillBoxStyle(pillCfg, clockEl, layout, styleOpts)
    const textStyle = clockPillTextStyle(styledClock, layout, styleOpts, pillCfg)
    const hidePill = !widgetVisible(data.widgets, 'clock')
    clockPillHtml = `<div class="clock-pill${hidePill ? ' clock-pill--hidden' : ''}" style="${pillStyle}"><span class="clock-pill__text" data-bind="clock" style="${textStyle}">${escape(clockText)}</span></div>`
  }

  let penaltiesHtml = ''
  if (data.penalties?.active && widgetVisible(data.widgets, 'penalties')) {
    const homeDots = buildPenaltyDots(ensurePenaltySlots(data.penalties.homeKicks || []))
    const awayDots = buildPenaltyDots(ensurePenaltySlots(data.penalties.awayKicks || []))
    penaltiesHtml = `
      <div class="penalty-bars">
        <div class="penalty-row">
          <span class="penalty-code">${escape(data.homeCode || '')}</span>
          <div class="penalty-dots">${homeDots}</div>
          <span class="penalty-count">${data.penalties.homeScore ?? 0}</span>
        </div>
        <div class="penalty-row">
          <span class="penalty-code">${escape(data.awayCode || '')}</span>
          <div class="penalty-dots">${awayDots}</div>
          <span class="penalty-count">${data.penalties.awayScore ?? 0}</span>
        </div>
      </div>`
  }

  const stripClass = strip ? ' score-canvas--strip' : ''
  const placedClass = strip ? ' match-board--placed' : ''
  const placedStyle = strip ? placementStyle(layout, projectSettings) : ''
  const clockPlateW = Number(layout.clockPlateWidth) || 0
  const usePngPlate = !usePill && clockPlateW > 0
  const hideClockPlate = usePngPlate && !widgetVisible(data.widgets, 'clock')
  const plateClass = hideClockPlate ? ' score-canvas--clock-plate-hidden' : ''
  const pillClass = usePill ? ' score-canvas--clock-pill' : ''
  const noBgClass = !layoutBackgroundVisible(layout) ? ' score-canvas--no-bg' : ''
  const plateStyle = usePngPlate ? `--clock-plate-w:${clockPlateW}%` : ''
  return `
    <div class="match-board${strip ? ' match-board--strip' : ''}${placedClass}" style="${placedStyle}">
      <div class="score-canvas${stripClass}${plateClass}${pillClass}${noBgClass}" style="--ref-w:${layout.refWidth};--ref-h:${layout.refHeight};aspect-ratio:${canvasAspectRatio(layout)};${plateStyle};${bgAttr}">
        ${elements}
        ${clockPillHtml}
      </div>
      ${penaltiesHtml}
    </div>
  `
}

function buildCustomTicker(data, graphicId) {
  const { width } = projectCanvas(projectSettings)
  return buildTickerBoardHtml(data, {
    graphicId,
    projectId,
    canvasWidth: width,
    useCqw: useRenderCqw()
  })
}

function buildStreamCountdown(data, graphicId) {
  const layout = data.layout || { refWidth: 480, refHeight: 140, background: '' }
  const bgAttr = layoutBackgroundImageAttr(layout)
  const ms = msUntilTarget(data.targetDateTime)
  const text = formatCountdown(ms, data.format || 'mm:ss')
  const rw = layout.refWidth || 480
  const ff = resolveRenderFontFamily(data.fontFamily) || 'var(--brand-font)'
  const pxMode = !useRenderCqw()
  const fontSize = fontSizeStyle(data.fontSize || 96, rw, rw, { useCqw: useRenderCqw() })

  if (data.hideWhenExpired && ms <= 0) {
    return '<div class="countdown-board countdown-board--empty"></div>'
  }

  const boardWidth = pxMode ? `width:${rw}px;` : ''

  return `
    <div class="countdown-board" data-countdown-id="${graphicId}"
      style="${boardWidth}aspect-ratio:${layout.refWidth}/${layout.refHeight};${bgAttr}">
      <div class="countdown-time" data-format="${data.format || 'mm:ss'}"
        style="font-size:${fontSize};color:${data.color || '#1d1d1f'};font-family:${ff}">
        ${countdownDigitHtml(text)}
      </div>
    </div>
  `
}

function mountGraphicRuntime(layer, graphic) {
  const inner = layer.querySelector('.graphic')
  if (!inner) return
  if (graphic.type === 'customTicker') {
    mountCustomTicker(layer, graphic)
  }
  if (graphic.type === 'streamCountdown') {
    tickCountdownGraphic(layer, graphic)
  }
  if (graphic.type === 'clock') {
    startClock(inner.querySelector('.time'), graphic.data?.format)
  }
}

function tickCountdownGraphic(layer, graphic) {
  const d = graphic.data || {}
  const node = layer.querySelector(`[data-countdown-id="${graphic.id}"] .countdown-time`)
  if (!node) return
  const ms = msUntilTarget(d.targetDateTime)
  if (d.hideWhenExpired && ms <= 0) {
    layer.querySelector('.graphic').innerHTML = '<div class="countdown-board countdown-board--empty"></div>'
    return
  }
  const text = formatCountdown(ms, d.format || 'mm:ss')
  node.innerHTML = countdownDigitHtml(text)
}

function applyScoreAnimations(layer, graphic) {
  if (graphic.type !== 'matchScoreboard') return
  const anim = graphic.data?.animation || {}
  layer.querySelectorAll('[data-score-bind]').forEach((node) => {
    const bind = node.dataset.scoreBind
    const text = resolveBindText(bind, graphic.data)
    animateScore(node, text, graphic.id, bind, anim)
  })
}

// innerHTML wordt bij elke sync vervangen, dus de clip-path transition start hier
// expliciet vanaf de vorige staat — anders springt de crop zonder animatie.
function animateClockPlate(layer, graphic) {
  const layout = graphic.data?.layout || {}
  const usePill = clockPlateUsesPill(layout)

  if (usePill) {
    const pill = layer.querySelector('.clock-pill')
    if (!pill) return
    const next = !widgetVisible(graphic.data?.widgets, 'clock')
    const prevRecorded = layer.dataset.pillHidden
    const prev = prevRecorded === '1'
    if (prevRecorded !== undefined && prev !== next) {
      pill.classList.toggle('clock-pill--hidden', prev)
      void pill.offsetWidth
      pill.classList.toggle('clock-pill--hidden', next)
    }
    layer.dataset.pillHidden = next ? '1' : '0'
    return
  }

  const canvas = layer.querySelector('.score-canvas')
  if (!canvas) return
  const next = canvas.classList.contains('score-canvas--clock-plate-hidden')
  const prevRecorded = layer.dataset.plateHidden
  const prev = prevRecorded === '1'
  if (prevRecorded !== undefined && prev !== next) {
    canvas.classList.toggle('score-canvas--clock-plate-hidden', prev)
    void canvas.offsetWidth
    canvas.classList.toggle('score-canvas--clock-plate-hidden', next)
  }
  layer.dataset.plateHidden = next ? '1' : '0'
}

function graphicHtml(graphic) {
  const d = graphic.data || {}
  switch (graphic.type) {
    case 'matchScoreboard':
      return buildMatchScoreboard(d, graphic.id)
    case 'customScoreboard':
    case 'composedScore':
      return buildMatchScoreboard(d, graphic.id)
    case 'lowerThird':
      return `<p class="name">${escape(d.name)}</p><p class="meta">${escape(d.title)}</p>`
    case 'lowerThirdShow':
      return buildLowerThirdShow(d)
    case 'quizShow':
      return buildQuizShow(d)
    case 'image':
      if (!d.src) return ''
      return `<img class="graphic-image" src="${assetUrl(d.src)}" alt="${escape(d.alt || '')}" />`
    case 'message':
      return `<p class="text">${escape(d.text)}</p>`
    case 'customTicker':
      return buildCustomTicker(d, graphic.id)
    case 'streamCountdown':
      return buildStreamCountdown(d, graphic.id)
    case 'clock':
      return `<span class="time">--:--</span>`
    default:
      return `<span>${escape(graphic.name)}</span>`
  }
}

const TRANSITION_DEFAULT_MS = 450

function graphicTransition(graphic) {
  const t = graphic.transition || {}
  return {
    in: t.in || 'auto',
    out: t.out || 'auto',
    duration: Math.max(80, Number(t.duration) || TRANSITION_DEFAULT_MS)
  }
}

// Het element waarop enter/exit animaties landen (board indien aanwezig, anders de inner wrapper)
function transitionTarget(layer) {
  return (
    layer.querySelector('.match-board') ||
    layer.querySelector('.lt-board') ||
    layer.querySelector('.quiz-board') ||
    layer.querySelector('.graphic')
  )
}

function rememberTransition(layer, graphic) {
  const tr = graphicTransition(graphic)
  layer.dataset.trOut = tr.out
  layer.dataset.trDur = String(tr.duration)
  return tr
}

function updateLayerContent(layer, graphic) {
  const inner = layer.querySelector('.graphic')
  if (!inner) return
  stopCustomTicker(graphic.id)
  clearTimers(layer)
  applyLayerPosition(layer, graphic)
  inner.innerHTML = graphicHtml(graphic)
  rememberTransition(layer, graphic)
  applyScoreAnimations(layer, graphic)
  animateClockPlate(layer, graphic)
  mountGraphicRuntime(layer, graphic)
}

function layerPositionClass(graphic) {
  const usesStage =
    graphic.type === 'matchScoreboard' && isStripLayout(graphic.data?.layout || {})
  if (usesStage) return 'graphic-layer graphic-layer--stage'
  if (graphic.position === 'bottom-full') return 'graphic-layer graphic-layer--bottom'
  if (graphic.position === 'custom') return 'graphic-layer pos-custom'
  return `graphic-layer ${POSITION_CLASS[graphic.position] || 'pos-top-center'}`
}

// Positie kan live wijzigen (layout-editor) — klasse + vrije plaatsing
// her-toepassen op bestaande lagen, niet alleen bij aanmaak.
function applyLayerPosition(layer, graphic) {
  layer.className = layerPositionClass(graphic)
  if (graphic.position === 'custom') {
    const p = graphic.data?.placementFree || {}
    layer.style.left = `${Number(p.x) || 50}%`
    layer.style.top = `${Number(p.y) || 50}%`
  } else {
    layer.style.left = ''
    layer.style.top = ''
  }
}

function renderGraphic(graphic) {
  const layer = document.createElement('div')
  applyLayerPosition(layer, graphic)
  layer.dataset.id = graphic.id
  const inner = document.createElement('div')
  inner.className = `graphic graphic--${graphic.type}`
  inner.innerHTML = graphicHtml(graphic)
  layer.appendChild(inner)
  const tr = rememberTransition(layer, graphic)
  const skipEnter = skipEnterAnimation.has(graphic.id)
  if (skipEnter) skipEnterAnimation.delete(graphic.id)
  if (tr.in === 'auto' && !skipEnter) {
    if (graphic.type === 'matchScoreboard') {
      inner.querySelector('.match-board')?.classList.add('is-entering')
    } else if (graphic.type === 'lowerThirdShow') {
      inner.querySelector('.lt-board')?.classList.add('is-entering')
    } else if (graphic.type === 'quizShow') {
      inner.querySelector('.quiz-board')?.classList.add('is-entering')
    } else {
      inner.classList.add('is-entering')
    }
  } else if (tr.in !== 'cut') {
    const target = transitionTarget(layer)
    if (target) {
      target.style.setProperty('--tr-dur', `${tr.duration}ms`)
      target.classList.add(`tr-in-${tr.in}`)
    }
  }
  applyScoreAnimations(layer, graphic)
  animateClockPlate(layer, graphic)
  mountGraphicRuntime(layer, graphic)
  return layer
}

function startClock(node, format) {
  if (!node) return
  const tick = () => {
    const now = new Date()
    node.textContent =
      format === '12H'
        ? now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
        : now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })
  }
  tick()
  node.dataset.timerId = String(setInterval(tick, 1000))
}

function clearTimers(root) {
  root.querySelectorAll('[data-timer-id]').forEach((node) => {
    clearInterval(Number(node.dataset.timerId))
  })
}

function canRenderGraphic(graphic) {
  if (!graphicShown(graphic)) return false
  if (graphic.type === 'image' && !graphic.data?.src) return false
  if (graphic.type === 'lowerThirdShow') {
    const id = graphic.data?.activeEntryId
    if (!id) return false
    return (graphic.data?.entries || []).some((e) => e.id === id)
  }
  if (graphic.type === 'quizShow') {
    const id = graphic.data?.activeQuestionId
    if (!id) return false
    return (graphic.data?.questions || []).some((q) => q.id === id)
  }
  return true
}

function syncGraphics(graphics) {
  lastGraphics = graphics
  let list = graphics
  if (isolateGraphicId) {
    list = graphics.filter((g) => g.id === isolateGraphicId)
  }
  const visible = list.filter(canRenderGraphic)
  const nextIds = new Set(visible.map((g) => g.id))

  for (const [id, layer] of layers) {
    if (!nextIds.has(id)) {
      stopCustomTicker(id)
      const out = layer.dataset.trOut || 'auto'
      const duration = Number(layer.dataset.trDur) || TRANSITION_DEFAULT_MS
      let wait = 0
      skipEnterAnimation.add(id)
      if (out === 'auto') {
        const board = layer.querySelector('.match-board')
        if (board) board.classList.add('is-leaving')
        else layer.querySelector('.graphic')?.classList.add('is-leaving')
        wait = board ? 360 : 220
      } else if (out !== 'cut') {
        const target = transitionTarget(layer)
        if (target) {
          target.classList.remove('is-entering', 'tr-in-fade', 'tr-in-wipe')
          target.style.setProperty('--tr-dur', `${duration}ms`)
          target.classList.add(`tr-out-${out}`)
          wait = duration + 40
        }
      }
      removalTimers.set(
        id,
        setTimeout(() => {
          removalTimers.delete(id)
          skipEnterAnimation.delete(id)
          stopCustomTicker(id)
          clearTimers(layer)
          layer.remove()
          layers.delete(id)
          for (const key of [...scoreMemory.keys()]) {
            if (key.startsWith(`${id}:`)) scoreMemory.delete(key)
          }
        }, wait)
      )
    }
  }

  for (const graphic of visible) {
    // Komt de graphic terug terwijl de uit-animatie nog loopt? Annuleer de
    // geplande verwijdering en bouw de laag opnieuw op, anders verdwijnt de
    // overlay alsnog zodra de oude timeout afgaat.
    if (removalTimers.has(graphic.id)) {
      clearTimeout(removalTimers.get(graphic.id))
      removalTimers.delete(graphic.id)
      const old = layers.get(graphic.id)
      if (old) {
        stopCustomTicker(graphic.id)
        clearTimers(old)
        old.remove()
      }
      layers.delete(graphic.id)
    }
    if (layers.has(graphic.id)) {
      updateLayerContent(layers.get(graphic.id), graphic)
      continue
    }
    const layer = renderGraphic(graphic)
    stage.appendChild(layer)
    layers.set(graphic.id, layer)
  }
}

function tickMatchClocks() {
  for (const graphic of cachedGraphics) {
    if (!graphicShown(graphic) || graphic.type !== 'matchScoreboard' || !graphic.data?.clock?.running) continue
    void persistAutoStoppageIfNeeded(graphic)
    const layer = layers.get(graphic.id)
    if (!layer) continue
    const text = formatClock(graphic.data.clock)
    layer.querySelectorAll('[data-bind="clock"]').forEach((node) => {
      node.textContent = text
    })
  }
}

function tickCountdowns() {
  for (const graphic of cachedGraphics) {
    if (!countdownShouldTick(graphic)) continue
    const layer = layers.get(graphic.id)
    if (layer) tickCountdownGraphic(layer, graphic)
  }
}

function ensureMatchClockTimer(graphics) {
  cachedGraphics = graphics
  const needsMatch = graphics.some(
    (g) => graphicShown(g) && g.type === 'matchScoreboard' && g.data?.clock?.running
  )
  if (needsMatch && !matchClockTimer) {
    matchClockTimer = setInterval(tickMatchClocks, 1000)
  } else if (!needsMatch && matchClockTimer) {
    clearInterval(matchClockTimer)
    matchClockTimer = null
  }

  const needsCountdown = graphics.some(countdownShouldTick)
  if (needsCountdown && !countdownTimer) {
    countdownTimer = setInterval(tickCountdowns, 1000)
  } else if (!needsCountdown && countdownTimer) {
    clearInterval(countdownTimer)
    countdownTimer = null
  }
}

async function applyState(state) {
  applyServerTimeFromState(state)
  applyCanvas(state)
  applyBrand(state)
  await applyProjectFonts(state)
  syncGraphics(state.graphics)
  ensureMatchClockTimer(state.graphics)
}

initRenderCompat()
setupPreviewWindow()

const socket = io()
socket.on('stateChanged', applyState)
fetch('/api/state')
  .then((r) => r.json())
  .then(applyState)
