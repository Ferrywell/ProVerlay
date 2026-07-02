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
import { buildTowerRows, f1RowGapText, isFocusRow, dedupeRows, resolveF1Animation } from '/public/shared/f1-timing.js'

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
  if (graphic.type === 'f1Timing') {
    mountF1Timing(layer, graphic)
  }
  if (graphic.type === 'clock') {
    startClock(inner.querySelector('.time'), graphic.data?.format)
  }
}

// ---------------------------------------------------------------------------
// F1 timing tower
// Live rijen komen via het 'f1TimingUpdate' socket-event (niet via state, om
// een schrijfactie per poll te vermijden). Rijen zijn keyed op rijderscode en
// verschuiven via transform, zodat positiewissels vloeiend animeren.
// ---------------------------------------------------------------------------

const f1Live = new Map() // graphicId -> { rows, session, status }

function safeCssColor(value, fallback = '#888888') {
  const v = String(value || '').trim()
  return /^#[0-9a-fA-F]{3,8}$/.test(v) ? v : fallback
}

function f1Style(data = {}) {
  const s = data.style || {}
  return {
    widthPx: Number(s.widthPx) || 440,
    rowHeightPx: Number(s.rowHeightPx) || 62,
    rowGapPx: Number(s.rowGapPx) >= 0 ? Number(s.rowGapPx) : 8,
    borderRadiusPx: Number(s.borderRadiusPx) || 31,
    fontSize: Number(s.fontSize) || 30,
    background: s.background || 'rgba(0, 0, 0, 0.85)',
    color: s.color || '#ffffff',
    focusBackground: s.focusBackground || '',
    focusColor: s.focusColor || ''
  }
}

function buildF1Timing(data, graphicId) {
  const s = f1Style(data)
  const vars = [
    `--f1-w:${s.widthPx}px`,
    `--f1-row-h:${s.rowHeightPx}px`,
    `--f1-row-gap:${s.rowGapPx}px`,
    `--f1-radius:${s.borderRadiusPx}px`,
    `--f1-font:${s.fontSize}px`,
    `--f1-bg:${s.background}`,
    `--f1-color:${s.color}`
  ]
  if (s.focusBackground) vars.push(`--f1-focus-bg:${s.focusBackground}`)
  if (s.focusColor) vars.push(`--f1-focus-color:${s.focusColor}`)
  return `<div class="f1-tower" data-f1-id="${graphicId}" style="${vars.join(';')}"></div>`
}

function f1CurrentRows(graphic) {
  const d = graphic.data || {}
  if (d.source === 'multiviewer') {
    return f1Live.get(graphic.id)?.rows || []
  }
  return d.drivers || []
}

function f1SessionInfo(graphic) {
  const d = graphic.data || {}
  if (d.source === 'multiviewer') {
    return f1Live.get(graphic.id)?.session || {}
  }
  return d.session || {}
}

function f1RowHtml(row, gapMode) {
  const gapText = f1RowGapText(row, gapMode)
  return `
    <span class="f1-row__pos">${row.pos || ''}</span>
    <span class="f1-row__team" style="--team:${safeCssColor(row.teamColor)}"></span>
    <span class="f1-row__code">${escape(row.code || '')}</span>
    <span class="f1-row__gap">${escape(gapText)}</span>
  `
}

function updateF1Tower(layer, graphic) {
  const tower = layer.querySelector(`[data-f1-id="${graphic.id}"]`)
  if (!tower) return
  const d = graphic.data || {}
  const s = f1Style(d)

  // Stylevars her-toepassen: config kan live wijzigen zonder DOM-rebuild
  tower.style.setProperty('--f1-w', `${s.widthPx}px`)
  tower.style.setProperty('--f1-row-h', `${s.rowHeightPx}px`)
  tower.style.setProperty('--f1-row-gap', `${s.rowGapPx}px`)
  tower.style.setProperty('--f1-radius', `${s.borderRadiusPx}px`)
  tower.style.setProperty('--f1-font', `${s.fontSize}px`)
  tower.style.setProperty('--f1-bg', s.background)
  tower.style.setProperty('--f1-color', s.color)
  if (s.focusBackground) tower.style.setProperty('--f1-focus-bg', s.focusBackground)
  else tower.style.removeProperty('--f1-focus-bg')
  if (s.focusColor) tower.style.setProperty('--f1-focus-color', s.focusColor)
  else tower.style.removeProperty('--f1-focus-color')
  const gapMode = d.gapMode || 'interval'
  const rows = dedupeRows(f1CurrentRows(graphic))
  const { top, focus } = buildTowerRows(rows, {
    focusDriver: d.focusDriver,
    topCount: d.topCount || 5
  })

  const step = s.rowHeightPx + s.rowGapPx
  const focusGap = Math.round(s.rowHeightPx * 0.45)
  const session = f1SessionInfo(graphic)
  const headerVisible = Boolean(d.showHeader && session.lapText)
  const headerOffset = headerVisible ? Math.round(s.rowHeightPx * 0.72) + s.rowGapPx : 0

  const entries = top.map((row, i) => ({
    key: (row.code || `p${row.pos}`).toUpperCase(),
    row,
    y: headerOffset + i * step,
    focus: isFocusRow(row, d.focusDriver)
  }))
  if (focus) {
    entries.push({
      key: (focus.code || 'focus').toUpperCase(),
      row: focus,
      y: headerOffset + top.length * step + focusGap,
      focus: true
    })
  }

  // Header (lap-teller) als apart pill-element bovenaan
  let header = tower.querySelector('.f1-tower__header')
  if (headerVisible) {
    if (!header) {
      header = document.createElement('div')
      header.className = 'f1-tower__header'
      tower.appendChild(header)
    }
    header.textContent = session.lapText
  } else if (header) {
    header.remove()
  }

  // In-animatie met stagger: alleen bij een lege toren (net live gezet of
  // volledig herbouwd), niet bij reguliere data-updates.
  const anim = resolveF1Animation(d)
  tower.dataset.animIn = anim.in
  tower.dataset.animDur = String(anim.durationMs)
  tower.dataset.animStagger = String(anim.staggerMs)
  const skipEnter = layer.dataset.skipEnter === '1'
  const isEntrance =
    !skipEnter && anim.in !== 'cut' && !tower.querySelector('.f1-row')

  const setRowY = (node, y) => {
    node.style.setProperty('--f1-y', `${y}px`)
    node.style.transform = 'translateY(var(--f1-y))'
  }

  const seen = new Set()
  entries.forEach((entry, index) => {
    seen.add(entry.key)
    let node = tower.querySelector(`.f1-row[data-key="${entry.key}"]`)
    const rowClass = [
      'f1-row',
      entry.focus ? 'f1-row--focus' : '',
      entry.row.retired ? 'f1-row--retired' : ''
    ]
      .filter(Boolean)
      .join(' ')
    if (!node) {
      node = document.createElement('div')
      node.dataset.key = entry.key
      setRowY(node, entry.y)
      node.innerHTML = f1RowHtml(entry.row, gapMode)
      if (isEntrance) {
        node.dataset.entering = '1'
        node.className = `${rowClass} f1-anim-in-${anim.in}`
        node.style.animationDelay = `${index * anim.staggerMs}ms`
        node.style.animationDuration = `${anim.durationMs}ms`
        node.addEventListener(
          'animationend',
          () => {
            delete node.dataset.entering
            node.classList.remove(`f1-anim-in-${anim.in}`)
            node.style.animationDelay = ''
          },
          { once: true }
        )
      } else {
        node.className = `${rowClass} f1-row--enter`
        requestAnimationFrame(() => node.classList.remove('f1-row--enter'))
      }
      tower.appendChild(node)
    } else {
      // Behoud een lopende in-animatie tijdens live data-updates
      const entering = node.dataset.entering === '1'
      node.className = entering ? `${rowClass} f1-anim-in-${tower.dataset.animIn}` : rowClass
      setRowY(node, entry.y)
      const gapNode = node.querySelector('.f1-row__gap')
      const posNode = node.querySelector('.f1-row__pos')
      const teamNode = node.querySelector('.f1-row__team')
      if (gapNode) gapNode.textContent = f1RowGapText(entry.row, gapMode)
      if (posNode) posNode.textContent = entry.row.pos || ''
      if (teamNode) teamNode.style.setProperty('--team', safeCssColor(entry.row.teamColor))
    }
  })

  if (header && isEntrance) {
    header.classList.add('f1-anim-in-fade')
    header.style.animationDuration = `${anim.durationMs}ms`
    header.addEventListener('animationend', () => header.classList.remove('f1-anim-in-fade'), {
      once: true
    })
  }

  for (const node of [...tower.querySelectorAll('.f1-row')]) {
    if (!seen.has(node.dataset.key)) {
      node.classList.add('f1-row--enter')
      setTimeout(() => node.remove(), 320)
    }
  }

  const totalRows = entries.length
  const height =
    headerOffset + (totalRows ? (totalRows - 1) * step + s.rowHeightPx + (focus ? focusGap : 0) : 0)
  tower.style.width = `${s.widthPx}px`
  tower.style.height = `${Math.max(height, s.rowHeightPx)}px`
}

/** Uit-animatie met omgekeerde stagger (onderste rij eerst). Geeft de wachttijd terug. */
function animateF1TowerOut(tower) {
  const animIn = tower.dataset.animIn || 'slide-left'
  const duration = Number(tower.dataset.animDur) || 380
  const stagger = Number(tower.dataset.animStagger) || 70
  if (animIn === 'cut') {
    return 0
  }
  const rows = [...tower.querySelectorAll('.f1-row')]
  rows.forEach((node, i) => {
    node.classList.remove(`f1-anim-in-${animIn}`)
    node.style.animationDelay = `${(rows.length - 1 - i) * stagger}ms`
    node.style.animationDuration = `${duration}ms`
    node.classList.add(`f1-anim-out-${animIn}`)
  })
  const header = tower.querySelector('.f1-tower__header')
  if (header) {
    header.classList.remove('f1-anim-in-fade')
    header.style.animationDelay = `${rows.length * stagger}ms`
    header.style.animationDuration = `${duration}ms`
    header.classList.add('f1-anim-out-fade')
  }
  return duration + stagger * Math.max(0, rows.length - 1) + 80
}

function mountF1Timing(layer, graphic) {
  updateF1Tower(layer, graphic)
  const d = graphic.data || {}
  if (d.source === 'multiviewer' && !f1Live.has(graphic.id)) {
    fetch(`/api/f1/${encodeURIComponent(graphic.id)}/live`)
      .then((r) => (r.ok ? r.json() : null))
      .then((snapshot) => {
        if (!snapshot) return
        f1Live.set(graphic.id, snapshot)
        const current = layers.get(graphic.id)
        if (current) updateF1Tower(current, graphic)
      })
      .catch(() => {})
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
    case 'f1Timing':
      return buildF1Timing(d, graphic.id)
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
  // F1-toren: rijen in-place bijwerken zodat lopende positie-animaties niet
  // resetten bij elke (ongerelateerde) state-wijziging.
  if (graphic.type === 'f1Timing' && inner.querySelector(`[data-f1-id="${graphic.id}"]`)) {
    applyLayerPosition(layer, graphic)
    rememberTransition(layer, graphic)
    updateF1Tower(layer, graphic)
    return
  }
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
  layer.dataset.skipEnter = skipEnter ? '1' : '0'
  if (tr.in === 'auto' && !skipEnter) {
    if (graphic.type === 'matchScoreboard') {
      inner.querySelector('.match-board')?.classList.add('is-entering')
    } else if (graphic.type === 'lowerThirdShow') {
      inner.querySelector('.lt-board')?.classList.add('is-entering')
    } else if (graphic.type === 'quizShow') {
      inner.querySelector('.quiz-board')?.classList.add('is-entering')
    } else if (graphic.type === 'f1Timing') {
      // Rijen animeren individueel met stagger (zie updateF1Tower)
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
      const f1Tower = layer.querySelector('.f1-tower')
      if (out === 'auto' && f1Tower) {
        wait = animateF1TowerOut(f1Tower)
      } else if (out === 'auto') {
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
socket.on('f1TimingUpdate', (payload) => {
  if (!payload?.graphicId) return
  f1Live.set(payload.graphicId, payload)
  const graphic = cachedGraphics.find((g) => g.id === payload.graphicId)
  const layer = layers.get(payload.graphicId)
  if (graphic && layer) updateF1Tower(layer, graphic)
})
fetch('/api/state')
  .then((r) => r.json())
  .then(applyState)
