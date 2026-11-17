import {
  resolveBindText,
  buildPenaltyDots,
  ensurePenaltySlots,
  formatClock,
  widgetVisible,
  clockPlateUsesPill,
  resolveClockPlate,
  PERIOD_OPTIONS
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
import { canvasAspectRatio, elementBoxStyle, isStripLayout, layoutBackgroundVisible, placementStyle, fontSizeStyle, resolveContainerWidthPx, projectCanvas, supportsContainerQueries, clockPillStyles } from '/public/shared/canvas-layout.js'
import { DEFAULT_BRAND_FONT, injectProjectFontFaces, fetchProjectFontAssets, injectBrandFontFace, resolveRenderFontFamily } from '/public/shared/project-fonts.js'
import { buildTowerRows, f1RowGapText, isFocusRow, dedupeRows, resolveF1Animation, resolveF1Decimals, f1TyreInfo, f1TrackFlag } from '/public/shared/f1-timing.js'
import {
  formatHockeyClock,
  hockeyPeriodLabel,
  hockeyTypographyCssVars,
  resolveHockeyTypography,
  resolveLiveHockeyClock
} from '/public/shared/hockey-utils.js'
import { reconnectAfterServerDisconnect } from '/public/shared/reconnect.js'
import { activeImage, imageItems, imageSize, imageVariant } from '/public/shared/image-list.js'
import { graphicUsesLiveVariables, resolveGraphicVariables, variableContext } from '/public/shared/variables.js'

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
let brandName = ''
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
  const brand = asObject(state.brand)
  const colors = asObject(brand.colors)
  brandName = textOf(brand.name).trim()
  document.documentElement.style.setProperty('--primary', colors.primary || '#007AFF')
  document.documentElement.style.setProperty('--secondary', colors.secondary || '#5856D6')
  document.documentElement.style.setProperty('--text', colors.text || '#1D1D1F')
  document.documentElement.style.setProperty('--background', colors.background || 'rgba(255,255,255,0.78)')
  document.documentElement.style.setProperty('--font-size', `${state.settings?.fontSize ?? 2.2}vmin`)
  document.documentElement.style.setProperty('--padding', `${state.settings?.padding ?? 2.5}vmin`)
  document.documentElement.style.setProperty('--brand-font', brand.fontFamily || DEFAULT_BRAND_FONT)
  document.body.style.background = state.settings?.canvasBackground || 'transparent'

  injectBrandFontFace(brand)
  document.getElementById('brand-font')?.remove()
}

/**
 * Per-project custom CSS (/project → Custom CSS), loaded after the built-in
 * stylesheets so it can override them. `customCssVersion` changes on every
 * save, which swaps in the new sheet (old one removed once the new one loads,
 * so there is no unstyled flash on air). Served next to assets/, so
 * `url(assets/foo.png)` in the sheet resolves to the project's assets.
 */
function applyCustomCss(state) {
  const version = typeof state.customCssVersion === 'string' ? state.customCssVersion : ''
  const id = typeof state.projectId === 'string' && state.projectId ? state.projectId : 'blank'
  const href = version ? `/projects/${encodeURIComponent(id)}/custom.css?v=${encodeURIComponent(version)}` : ''
  const current = [...document.querySelectorAll('link[data-pv-custom-css]')]
  if (!href) {
    current.forEach((el) => el.remove())
    return
  }
  if (current.some((el) => el.getAttribute('href') === href)) return
  const link = document.createElement('link')
  link.rel = 'stylesheet'
  link.href = href
  link.dataset.pvCustomCss = ''
  const dropOld = () => current.forEach((el) => el.remove())
  link.addEventListener('load', dropOld, { once: true })
  link.addEventListener('error', dropOld, { once: true })
  document.head.appendChild(link)
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

// Builders must survive hand-edited or half-migrated show data: a string where
// an array/object is expected may never take the whole overlay down (QA-110).
function asArray(value) {
  return Array.isArray(value) ? value : []
}

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

function asElements(value) {
  return asArray(value).filter((el) => el && typeof el === 'object')
}

function textOf(value) {
  return value === null || value === undefined ? '' : String(value)
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
  const entry = asArray(data.entries).find((e) => e && e.id === data.activeEntryId)
  if (!entry) return ''
  const template = asObject(data.template)
  const layout = { refWidth: 1920, refHeight: 1080, background: '', ...asObject(template.layout) }
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

  const elements = asElements(template.elements)
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
  const q = asArray(data.questions).find((item) => item && item.id === data.activeQuestionId)
  if (!q) return ''
  const rawPanel = asObject(data.panel)
  const panel = {
    x: Number.isFinite(Number(rawPanel.x)) ? Number(rawPanel.x) : 4,
    y: Number.isFinite(Number(rawPanel.y)) ? Number(rawPanel.y) : 50,
    width: Number(rawPanel.width) || 44
  }
  const letters = ['A', 'B', 'C', 'D', 'E', 'F']
  const revealed = Boolean(data.revealed)
  const options = asArray(q.options)
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

/** Match scoreboard has a designed PNG (strip or full frame) to position text on. */
function matchHasDesign(data) {
  return Boolean(asObject(asObject(data).layout).background)
}

const PERIOD_SHORT = {
  first_half: '1H',
  second_half: '2H',
  extra_first: 'ET1',
  extra_second: 'ET2',
  penalties: 'PEN'
}

/**
 * Built-in score bug for a match scoreboard without an uploaded PNG strip
 * (QA-106). Same visual language as the hockey scorebug: black pills, team
 * colour chips (data.homeColor/awayColor, else the brand primary/secondary),
 * brand font, tabular figures. Sized in vmin so it scales with the canvas.
 */
function buildDefaultMatchScoreboard(data, graphicId) {
  const widgets = data.widgets
  const homeCode = resolveBindText('homeCode', data)
  const awayCode = resolveBindText('awayCode', data)
  const showHomeScore = widgetVisible(widgets, 'homeScore')
  const showAwayScore = widgetVisible(widgets, 'awayScore')
  const showClock = widgetVisible(widgets, 'clock')
  const period = asObject(data.clock).period
  const periodText = PERIOD_SHORT[period] || ''
  const periodLabel = PERIOD_OPTIONS.find((p) => p.value === period)?.label || ''
  const vars = [
    `--mb-home:${data.homeColor ? safeCssColor(data.homeColor, 'var(--primary)') : 'var(--primary, #007aff)'}`,
    `--mb-away:${data.awayColor ? safeCssColor(data.awayColor, 'var(--secondary)') : 'var(--secondary, #5856d6)'}`
  ].join(';')
  const score = (bind, show) =>
    show
      ? `<span class="mb-score"><span class="score-el-text score-el-text--animated" data-score-bind="${bind}" data-graphic-id="${escape(graphicId)}">${escape(resolveBindText(bind, data))}</span></span>`
      : ''

  return `
    <div class="match-board match-board--default" style="${vars}">
      <div class="mb-bar">
        ${homeCode ? `<span class="mb-team mb-team--home">${escape(homeCode)}</span>` : ''}
        ${score('homeScore', showHomeScore)}
        ${showHomeScore && showAwayScore ? '<span class="mb-sep" aria-hidden="true"></span>' : ''}
        ${score('awayScore', showAwayScore)}
        ${awayCode ? `<span class="mb-team mb-team--away">${escape(awayCode)}</span>` : ''}
      </div>
      ${
        showClock
          ? `<div class="mb-clock">
        <span class="mb-clock__time" data-bind="clock">${escape(formatClock(data.clock))}</span>
        ${periodText ? `<span class="mb-clock__period" title="${escape(periodLabel)}">${escape(periodText)}</span>` : ''}
      </div>`
          : ''
      }
    </div>
  `
}

function buildMatchScoreboard(rawData, graphicId) {
  const data = asObject(rawData)
  if (!matchHasDesign(data)) return buildDefaultMatchScoreboard(data, graphicId)

  const layout = { refWidth: 1920, refHeight: 1080, background: '', ...asObject(data.layout) }
  const bgAttr = layoutBackgroundImageAttr(layout)
  const strip = isStripLayout(layout)
  const styleOpts = layoutStyleOptions(layout)
  const usePill = clockPlateUsesPill(layout)
  const allElements = asElements(data.elements)
  const clockEl = allElements.find((el) => el.bind === 'clock')
  const elements = allElements
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
      const boxStyle = elementBoxStyle(styledEl, layout, styleOpts)
      return `<span class="score-el score-el--${escape(el.bind || 'custom')}" data-bind="${escape(el.bind)}" style="${boxStyle}">${inner}</span>`
    })
    .join('')

  let clockPillHtml = ''
  if (usePill && clockEl) {
    const pillCfg = resolveClockPlate(layout)
    const styledClock = clockEl.fontFamily
      ? { ...clockEl, fontFamily: resolveRenderFontFamily(clockEl.fontFamily) }
      : clockEl
    const clockText = resolveBindText('clock', data)
    // Same geometry as the /editor preview (shared clockPillStyles)
    const pill = clockPillStyles(pillCfg, styledClock, layout, styleOpts)
    const hidePill = !widgetVisible(data.widgets, 'clock')
    clockPillHtml = `<div class="clock-pill${hidePill ? ' clock-pill--hidden' : ''}" style="${pill.box}"><span class="clock-pill__text" data-bind="clock" style="${pill.text}">${escape(clockText)}</span></div>`
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

  const stripClass = strip ? ' score-canvas--strip' : ' score-canvas--frame'
  // Strip PNG: placed on the stage (x/y/width). Full-frame PNG: covers the
  // whole canvas, exactly like the /editor full-frame stage.
  const boardClass = strip ? ' match-board--strip match-board--placed' : ' match-board--frame'
  const placedStyle = strip ? placementStyle(layout, projectSettings) : ''
  const aspectStyle = strip ? `aspect-ratio:${canvasAspectRatio(layout)};` : ''
  const clockPlateW = Number(layout.clockPlateWidth) || 0
  const usePngPlate = !usePill && clockPlateW > 0
  const hideClockPlate = usePngPlate && !widgetVisible(data.widgets, 'clock')
  const plateClass = hideClockPlate ? ' score-canvas--clock-plate-hidden' : ''
  const pillClass = usePill ? ' score-canvas--clock-pill' : ''
  const noBgClass = !layoutBackgroundVisible(layout) ? ' score-canvas--no-bg' : ''
  const plateStyle = usePngPlate ? `--clock-plate-w:${clockPlateW}%;` : ''
  return `
    <div class="match-board${boardClass}" style="${placedStyle}">
      <div class="score-canvas${stripClass}${plateClass}${pillClass}${noBgClass}" style="--ref-w:${Number(layout.refWidth) || 1920};--ref-h:${Number(layout.refHeight) || 1080};${aspectStyle}${plateStyle}${bgAttr}">
        ${elements}
        ${clockPillHtml}
      </div>
      ${penaltiesHtml}
    </div>
  `
}

function buildCustomTicker(rawData, graphicId) {
  const data = asObject(rawData)
  const { width } = projectCanvas(projectSettings)
  const html = buildTickerBoardHtml(data, {
    graphicId,
    projectId,
    canvasWidth: width,
    useCqw: useRenderCqw()
  })
  if (asObject(data.layout).background) return html
  // No PNG bar uploaded: built-in dark bar with a brand-colour tab in the
  // left inset (where a PNG would normally carry the logo), so the text is
  // legible over any video. Without a brand name there is no tab at all.
  const insetL = Number.isFinite(Number(data.textInsetLeft)) ? Number(data.textInsetLeft) : 16
  const label = brandName ? `<span class="ticker-default__label">${escape(brandName)}</span>` : ''
  const tabClass = brandName ? '' : ' ticker-default--no-tab'
  return `<div class="ticker-default${tabClass}" style="--ticker-tab-w:${Math.max(0, Math.min(40, insetL))}%">${html}${label}</div>`
}

/** Relative luminance (0 dark … 1 light) of a #rgb/#rrggbb colour, or null. */
function hexLuminance(value) {
  const m = String(value || '').trim().match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i)
  if (!m) return null
  const hex = m[1].length === 3 ? [...m[1]].map((c) => c + c).join('') : m[1]
  const [r, g, b] = [0, 2, 4].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function buildStreamCountdown(rawData, graphicId) {
  const data = asObject(rawData)
  const layout = { refWidth: 480, refHeight: 140, background: '', ...asObject(data.layout) }
  const rw = Number(layout.refWidth) || 480
  const rh = Number(layout.refHeight) || 140
  const bgAttr = layoutBackgroundImageAttr(layout)
  const ms = msUntilTarget(data.targetDateTime)
  const format = data.format === 'h:mm:ss' ? 'h:mm:ss' : 'mm:ss'
  const text = formatCountdown(ms, format)
  const ff = resolveRenderFontFamily(data.fontFamily) || 'var(--brand-font)'
  const useCqw = useRenderCqw()
  const fontSize = fontSizeStyle(Number(data.fontSize) || 96, rw, rw, { useCqw })
  const color = cssColorValue(data.color, '#1d1d1f')

  if (data.hideWhenExpired && ms <= 0) {
    return '<div class="countdown-board countdown-board--empty"></div>'
  }

  // The board needs an explicit width: it is a size container (cqw text) in
  // a shrink-to-fit layer, so without one it collapsed to 0×0 (QA-106).
  // refWidth is in 1080p design px → scale with the canvas height.
  const boardWidth = useCqw ? `width:calc(var(--canvas-h, 1080px) * ${rw / 1080});` : `width:${rw}px;`

  // No PNG uploaded: built-in plate. Plate tone follows the digit colour so
  // the countdown is always legible (dark digits → light glass, light → dark).
  let plateClass = ''
  if (!layoutBackgroundVisible(layout)) {
    const lum = hexLuminance(color)
    plateClass = lum !== null && lum < 0.4 ? ' countdown-board--plate countdown-board--plate-light' : ' countdown-board--plate countdown-board--plate-dark'
  }

  return `
    <div class="countdown-board${plateClass}" data-countdown-id="${escape(graphicId)}"
      style="${boardWidth}aspect-ratio:${rw}/${rh};${bgAttr}">
      <div class="countdown-time" data-format="${format}" data-text="${escape(text)}"
        style="font-size:${fontSize};color:${color};font-family:${ff}">
        ${countdownDigitHtml(text)}
      </div>
    </div>
  `
}

function applyHockeyTypographyVars(bug, style = {}) {
  if (!bug) return
  const t = resolveHockeyTypography(style)
  for (const [key, { size, weight }] of Object.entries(t)) {
    bug.style.setProperty(`--hockey-${key}-size`, String(size))
    bug.style.setProperty(`--hockey-${key}-weight`, String(weight))
  }
}

function buildHockeyScorebug(data, graphicId) {
  const scale = Number(data.style?.scale) || 1
  const live = resolveLiveHockeyClock(data.clock || {})
  const timeText = formatHockeyClock(data.clock || {})
  const periodText = hockeyPeriodLabel(live.period)
  const breakClass = live.period === 'break' ? ' hockey-bug--break' : ''
  const homeColor = safeCssColor(data.homeColor, '#E5484D')
  const awayColor = safeCssColor(data.awayColor, '#3E63DD')
  const vars = [
    `--hockey-scale:${scale}`,
    `--home-color:${homeColor}`,
    `--away-color:${awayColor}`,
    hockeyTypographyCssVars(data.style || {})
  ].join(';')

  return `
    <div class="hockey-bug${breakClass}" data-hockey-id="${graphicId}" style="${vars}">
      <div class="hockey-arm hockey-arm--home">
        <span class="hockey-code" data-bind="homeCode">${escape(data.homeCode || 'HOME')}</span>
        <span class="hockey-score"><span class="score-el-text score-el-text--animated" data-score-bind="homeScore" data-graphic-id="${graphicId}">${escape(String(data.homeScore ?? 0))}</span></span>
      </div>
      <div class="hockey-clock">
        <span class="hockey-clock__time" data-bind="clock">${escape(timeText)}</span>
        <span class="hockey-clock__period" data-bind="period">${escape(periodText)}</span>
      </div>
      <div class="hockey-arm hockey-arm--away">
        <span class="hockey-score"><span class="score-el-text score-el-text--animated" data-score-bind="awayScore" data-graphic-id="${graphicId}">${escape(String(data.awayScore ?? 0))}</span></span>
        <span class="hockey-code" data-bind="awayCode">${escape(data.awayCode || 'AWAY')}</span>
      </div>
    </div>
  `
}

function setHockeyText(node, text, { animate = false } = {}) {
  if (!node) return
  const next = String(text ?? '')
  if (node.textContent === next) return
  node.textContent = next
  if (!animate) return
  node.classList.remove('is-swap')
  void node.offsetWidth
  node.classList.add('is-swap')
}

function updateHockeyScorebug(layer, graphic) {
  const bug = layer.querySelector(`[data-hockey-id="${graphic.id}"]`)
  if (!bug) return
  const d = graphic.data || {}
  const live = resolveLiveHockeyClock(d.clock || {})
  const anim = d.animation || { enabled: true, durationMs: 420 }

  bug.style.setProperty('--hockey-scale', String(Number(d.style?.scale) || 1))
  bug.style.setProperty('--home-color', safeCssColor(d.homeColor, '#E5484D'))
  bug.style.setProperty('--away-color', safeCssColor(d.awayColor, '#3E63DD'))
  applyHockeyTypographyVars(bug, d.style)
  bug.classList.toggle('hockey-bug--break', live.period === 'break')

  setHockeyText(bug.querySelector('[data-bind="homeCode"]'), d.homeCode || 'HOME', { animate: true })
  setHockeyText(bug.querySelector('[data-bind="awayCode"]'), d.awayCode || 'AWAY', { animate: true })
  setHockeyText(bug.querySelector('[data-bind="period"]'), hockeyPeriodLabel(live.period), { animate: true })
  setHockeyText(bug.querySelector('[data-bind="clock"]'), formatHockeyClock(d.clock || {}))

  bug.querySelectorAll('[data-score-bind]').forEach((node) => {
    const bind = node.dataset.scoreBind
    const text = String(d[bind] ?? 0)
    animateScore(node, text, graphic.id, bind, anim)
  })
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
  if (graphic.type === 'image') {
    // Remember the markup so later state updates only touch the image when it changed.
    const img = inner.querySelector('.graphic-image')
    if (img) img.dataset.html = buildImage(graphic.data)
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

/** Any plain CSS colour (hex, rgb(), named…) but nothing that can break out of a style attribute. */
function cssColorValue(value, fallback) {
  const v = String(value ?? '').trim()
  return v && /^[#a-z0-9(),.%\s-]+$/i.test(v) ? v : fallback
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
    return asArray(f1Live.get(graphic.id)?.rows).filter((r) => r && typeof r === 'object')
  }
  return asArray(d.drivers).filter((r) => r && typeof r === 'object')
}

function f1SessionInfo(graphic) {
  const d = graphic.data || {}
  if (d.source === 'multiviewer') {
    return asObject(f1Live.get(graphic.id)?.session)
  }
  return asObject(d.session)
}

// Blokjesvlag als inline SVG (currentColor volgt de tekstkleur van de rij)
const F1_FLAG_SVG =
  '<svg viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M0 0h4v4H0zM8 0h4v4H8zM4 4h4v4H4zM12 4h4v4h-4zM0 8h4v4H0zM8 8h4v4H8zM4 12h4v4H4zM12 12h4v4h-4z"/></svg>'

function isF1GapLabel(text) {
  return text === 'INTERVAL' || text === 'GAP TO LEADER'
}

// Rijvolgorde als in de officiële F1-toren: pos, team, code, gap, band, vlag
function f1RowHtml(row, gapMode, decimals, showTyres) {
  const gapText = f1RowGapText(row, gapMode, decimals)
  const gapClass = isF1GapLabel(gapText) ? 'f1-row__gap f1-row__gap--label' : 'f1-row__gap'
  const tyre = showTyres ? f1TyreInfo(row) : null
  return `
    <span class="f1-row__pos">${row.pos || ''}</span>
    <span class="f1-row__team" style="--team:${safeCssColor(row.teamColor)}"></span>
    <span class="f1-row__code">${escape(row.code || '')}</span>
    <span class="${gapClass}">${escape(gapText)}</span>
    ${tyre ? `<span class="f1-row__tyre" style="--tyre:${safeCssColor(tyre.color)}">${escape(tyre.letter)}</span>` : ''}
    ${row.finished ? `<span class="f1-row__flag">${F1_FLAG_SVG}</span>` : ''}
  `
}

/** Band-indicator in een bestaande rij bijwerken (compound kan live wisselen). */
function syncF1TyreNode(node, row, showTyres, { animate = true } = {}) {
  let tyreNode = node.querySelector('.f1-row__tyre')
  const tyre = showTyres ? f1TyreInfo(row) : null
  if (!tyre) {
    if (tyreNode && !tyreNode.dataset.leaving) {
      if (animate) popOutIndicator(tyreNode)
      else tyreNode.remove()
    }
    return
  }
  if (!tyreNode) {
    tyreNode = document.createElement('span')
    tyreNode.className = 'f1-row__tyre'
    node.insertBefore(tyreNode, node.querySelector('.f1-row__flag'))
    if (animate) popInIndicator(tyreNode)
  }
  // Letter/kleur uit de live feed: zonder animatie (alleen tonen/verbergen animeert)
  tyreNode.textContent = tyre.letter
  tyreNode.style.setProperty('--tyre', safeCssColor(tyre.color))
}

/** Indicator die live verschijnt: pop-in, rest van de rij schuift vloeiend mee. */
function popInIndicator(node) {
  node.classList.remove('f1-anim-pop-out')
  node.classList.add('f1-anim-pop-in')
  node.addEventListener('animationend', () => node.classList.remove('f1-anim-pop-in'), {
    once: true
  })
}

/** Indicator die verdwijnt: pop-out, daarna DOM-remove. */
function popOutIndicator(node) {
  if (!node || node.dataset.leaving === '1') return
  node.dataset.leaving = '1'
  node.classList.remove('f1-anim-pop-in')
  node.classList.add('f1-anim-pop-out')
  const done = () => {
    if (node.parentNode) node.remove()
  }
  node.addEventListener('animationend', done, { once: true })
  setTimeout(done, 400)
}

/** Chequered flag tonen zodra de coureur over de finish is. */
function syncF1FlagNode(node, row, { animate = true } = {}) {
  let flagNode = node.querySelector('.f1-row__flag')
  if (!row.finished) {
    if (flagNode && !flagNode.dataset.leaving) {
      if (animate) popOutIndicator(flagNode)
      else flagNode.remove()
    }
    return
  }
  if (!flagNode) {
    flagNode = document.createElement('span')
    flagNode.className = 'f1-row__flag'
    flagNode.innerHTML = F1_FLAG_SVG
    node.appendChild(flagNode)
    if (animate) popInIndicator(flagNode)
  }
}

/** Gap-tekst zetten; bij configwijziging subtiele swap, bij live feed hard. */
function setF1GapText(gapNode, text, { animate = false } = {}) {
  if (!gapNode) return
  gapNode.classList.toggle('f1-row__gap--label', isF1GapLabel(text))
  if (gapNode.textContent === text) return
  if (!animate) {
    gapNode.textContent = text
    return
  }
  gapNode.classList.remove('f1-gap-swap')
  void gapNode.offsetWidth
  gapNode.textContent = text
  gapNode.classList.add('f1-gap-swap')
  gapNode.addEventListener('animationend', () => gapNode.classList.remove('f1-gap-swap'), {
    once: true
  })
}

/** Parse "LAP 21/57" → delen voor digit-rollers (spacing via CSS gap, niet via spaties). */
function parseF1LapParts(text) {
  const m = String(text || '').match(/^LAP\s*(\d+)\s*\/\s*(\d+|\?)(.*)$/i)
  if (!m) return null
  return { prefix: 'LAP', current: m[1], sep: '/', total: m[2], suffix: m[3] || '' }
}

function ensureF1LapStatic(parent, modifier, text) {
  let el = parent.querySelector(`:scope > .f1-lap-static--${modifier}`)
  if (!el) {
    el = document.createElement('span')
    el.className = `f1-lap-static f1-lap-static--${modifier}`
    parent.appendChild(el)
  }
  el.textContent = text
  return el
}

function ensureF1LapNum(parent, part) {
  let el = parent.querySelector(`:scope > .f1-lap-num[data-part="${part}"]`)
  if (!el) {
    el = document.createElement('span')
    el.className = 'f1-lap-num'
    el.dataset.part = part
    parent.appendChild(el)
  }
  return el
}

/** Één digit-slot: alleen bij wijziging een roller (nieuw van boven → omlaag). */
function syncF1LapDigit(digitEl, nextCh, animate) {
  const val = digitEl.querySelector('.f1-lap-digit__val:not(.f1-lap-digit__val--out):not(.f1-lap-digit__val--in)')
  const current = val?.textContent ?? digitEl.textContent
  if (current === nextCh && !digitEl.classList.contains('is-rolling')) {
    if (!val) digitEl.innerHTML = `<span class="f1-lap-digit__val">${escape(nextCh)}</span>`
    return
  }
  if (!animate || current === nextCh) {
    digitEl.classList.remove('is-rolling')
    digitEl.innerHTML = `<span class="f1-lap-digit__val">${escape(nextCh)}</span>`
    return
  }
  digitEl.classList.add('is-rolling')
  digitEl.innerHTML = `
    <span class="f1-lap-digit__val f1-lap-digit__val--out">${escape(current)}</span>
    <span class="f1-lap-digit__val f1-lap-digit__val--in">${escape(nextCh)}</span>
  `
  const done = () => {
    if (!digitEl.isConnected) return
    digitEl.classList.remove('is-rolling')
    digitEl.innerHTML = `<span class="f1-lap-digit__val">${escape(nextCh)}</span>`
  }
  digitEl.addEventListener('animationend', done, { once: true })
  setTimeout(done, 420)
}

function syncF1LapNumGroup(groupEl, nextStr, animate) {
  const next = [...String(nextStr)]
  let digits = [...groupEl.querySelectorAll(':scope > .f1-lap-digit')]
  if (digits.length !== next.length) {
    groupEl.innerHTML = next
      .map((ch) => `<span class="f1-lap-digit"><span class="f1-lap-digit__val">${escape(ch)}</span></span>`)
      .join('')
    digits = [...groupEl.querySelectorAll(':scope > .f1-lap-digit')]
    return
  }
  next.forEach((ch, i) => syncF1LapDigit(digits[i], ch, animate))
}

/** Lap-tekst met per-digit roller; onveranderde cijfers blijven stil. */
function syncF1LapText(lapEl, lapText, { animate = true } = {}) {
  const text = String(lapText || '')
  const prev = lapEl.dataset.lap || ''
  if (prev === text && lapEl.childElementCount) return
  const parts = parseF1LapParts(text)
  if (!parts) {
    lapEl.textContent = text
    lapEl.dataset.lap = text
    return
  }
  // Opbouw: LAP [digits] / [digits] — volgorde in DOM behouden
  if (!lapEl.querySelector('.f1-lap-num')) {
    lapEl.textContent = ''
    ensureF1LapStatic(lapEl, 'prefix', parts.prefix)
    ensureF1LapNum(lapEl, 'current')
    ensureF1LapStatic(lapEl, 'sep', parts.sep)
    ensureF1LapNum(lapEl, 'total')
  } else {
    const prefix = lapEl.querySelector('.f1-lap-static--prefix')
    const sep = lapEl.querySelector('.f1-lap-static--sep')
    if (prefix) prefix.textContent = parts.prefix
    if (sep) sep.textContent = parts.sep
  }
  const doAnim = animate && Boolean(prev)
  syncF1LapNumGroup(ensureF1LapNum(lapEl, 'current'), parts.current, doAnim)
  syncF1LapNumGroup(ensureF1LapNum(lapEl, 'total'), parts.total, doAnim)
  lapEl.dataset.lap = text
}

/** Header-pill (lap + track status); lap-digits rollen, track-wissels pulsen. */
function syncF1Header(header, session, { animateTrack = true } = {}) {
  const flag = f1TrackFlag(session)
  const prevTrack = header.dataset.track || 'clear'
  const trackChanged = prevTrack !== flag.track
  header.dataset.track = flag.track

  let lapEl = header.querySelector('.f1-tower__lap')
  if (!lapEl) {
    lapEl = document.createElement('span')
    lapEl.className = 'f1-tower__lap'
    header.appendChild(lapEl)
  }
  syncF1LapText(lapEl, session.lapText || '', { animate: true })

  let flagEl = header.querySelector('.f1-tower__flag')
  if (flag.label) {
    if (!flagEl) {
      flagEl = document.createElement('span')
      flagEl.className = 'f1-tower__flag'
      header.appendChild(flagEl)
    }
    flagEl.textContent = flag.label
  } else if (flagEl) {
    flagEl.remove()
  }

  if (animateTrack && trackChanged) {
    header.classList.remove('f1-header-track-in')
    void header.offsetWidth
    header.classList.add('f1-header-track-in')
    header.addEventListener('animationend', () => header.classList.remove('f1-header-track-in'), {
      once: true
    })
  }
}

/** Config-handtekening: handmatige UI-wijzigingen (niet de live feed). */
function f1ConfigKey(d = {}) {
  return [
    d.gapMode || 'interval',
    resolveF1Decimals(d),
    d.topCount || 5,
    d.focusDriver || '',
    Boolean(d.showTyres),
    Boolean(d.showHeader),
    resolveF1Animation(d).in
  ].join('|')
}

function updateF1Tower(layer, graphic) {
  const tower = layer.querySelector(`[data-f1-id="${graphic.id}"]`)
  if (!tower) return
  // Tijdens de uit-animatie geen updates meer toepassen: een live data-update
  // zou anders de out-classes strippen en de rijen zichtbaar terug laten
  // ploppen ("janky" exit).
  if (tower.dataset.leaving === '1') return
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
  const decimals = resolveF1Decimals(d)
  const showTyres = Boolean(d.showTyres)
  const rows = dedupeRows(f1CurrentRows(graphic))
  const { top, focus } = buildTowerRows(rows, {
    focusDriver: d.focusDriver,
    topCount: d.topCount || 5
  })

  const step = s.rowHeightPx + s.rowGapPx
  const focusGap = Math.round(s.rowHeightPx * 0.45)
  const session = f1SessionInfo(graphic)
  const headerVisible = Boolean(d.showHeader && session.lapText)
  const headerOffset = headerVisible ? Math.round(s.rowHeightPx * 0.95) + s.rowGapPx : 0

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

  // Handmatige config vs live feed: alleen config/status krijgt subtiele motion
  const nextConfig = f1ConfigKey(d)
  const configChanged = tower.dataset.configKey !== nextConfig
  const hadConfig = Boolean(tower.dataset.configKey)
  tower.dataset.configKey = nextConfig
  const animateConfig = hadConfig && configChanged

  // Header (lap-teller + track status) als apart pill-element bovenaan
  let header = tower.querySelector('.f1-tower__header')
  if (headerVisible) {
    const headerJustAdded = !header
    if (!header) {
      header = document.createElement('div')
      header.className = 'f1-tower__header'
      tower.appendChild(header)
    }
    syncF1Header(header, session, { animateTrack: true })
    if (headerJustAdded && animateConfig) {
      header.classList.add('f1-anim-in-fade')
      header.addEventListener('animationend', () => header.classList.remove('f1-anim-in-fade'), {
        once: true
      })
    }
  } else if (header && !header.dataset.leaving) {
    if (animateConfig) {
      header.dataset.leaving = '1'
      header.classList.add('f1-anim-out-fade')
      const gone = () => header.remove()
      header.addEventListener('animationend', gone, { once: true })
      setTimeout(gone, 420)
    } else {
      header.remove()
    }
  }

  // In-animatie met stagger: lege toren (live zetten) of structurele configwijziging
  const anim = resolveF1Animation(d)
  tower.dataset.animIn = anim.in
  tower.dataset.animDur = String(anim.durationMs)
  tower.dataset.animStagger = String(anim.staggerMs)
  const skipEnter = layer.dataset.skipEnter === '1'
  const isEntrance =
    !skipEnter && anim.in !== 'cut' && !tower.querySelector('.f1-row')
  const animateStructure =
    !skipEnter && anim.in !== 'cut' && (isEntrance || animateConfig)

  const setRowY = (node, y) => {
    node.style.setProperty('--f1-y', `${y}px`)
    node.style.transform = 'translateY(var(--f1-y))'
  }

  const playRowIn = (node, rowClass, index) => {
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
        node.style.animationDuration = ''
      },
      { once: true }
    )
  }

  const seen = new Set()
  let enterIndex = 0
  entries.forEach((entry) => {
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
      node.innerHTML = f1RowHtml(entry.row, gapMode, decimals, showTyres)
      if (animateStructure) {
        playRowIn(node, rowClass, enterIndex++)
      } else {
        node.className = rowClass
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
      setF1GapText(gapNode, f1RowGapText(entry.row, gapMode, decimals), {
        animate: animateConfig
      })
      if (posNode) posNode.textContent = entry.row.pos || ''
      if (teamNode) teamNode.style.setProperty('--team', safeCssColor(entry.row.teamColor))
      // Finish-vlag: wel animeren (status). Tyre letter live: geen animatie;
      // tyre show/hide via config: wel animeren.
      syncF1FlagNode(node, entry.row, { animate: true })
      syncF1TyreNode(node, entry.row, showTyres, { animate: animateConfig })
    }
  })

  if (header && isEntrance) {
    header.classList.add('f1-anim-in-fade')
    header.style.animationDuration = `${anim.durationMs}ms`
    header.addEventListener('animationend', () => header.classList.remove('f1-anim-in-fade'), {
      once: true
    })
  }

  // Uit: onderaan eerst (meer → minder rijen). In: bovenaan eerst (zie enterIndex).
  const leaving = [...tower.querySelectorAll('.f1-row')].filter(
    (node) => !seen.has(node.dataset.key) && node.dataset.leaving !== '1'
  )
  if (animateStructure) {
    leaving.sort((a, b) => {
      const ya = Number.parseFloat(a.style.getPropertyValue('--f1-y')) || 0
      const yb = Number.parseFloat(b.style.getPropertyValue('--f1-y')) || 0
      return yb - ya
    })
    leaving.forEach((node, leaveIndex) => {
      const leaveDelay = leaveIndex * anim.staggerMs
      node.dataset.leaving = '1'
      node.classList.remove(`f1-anim-in-${anim.in}`)
      node.classList.add(`f1-anim-out-${anim.in}`)
      node.style.animationDelay = `${leaveDelay}ms`
      node.style.animationDuration = `${anim.durationMs}ms`
      const gone = () => node.remove()
      node.addEventListener('animationend', gone, { once: true })
      setTimeout(gone, anim.durationMs + leaveDelay + 80)
    })
  } else {
    leaving.forEach((node) => node.remove())
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
  // Vanaf hier geen data-updates meer op deze toren (zie updateF1Tower)
  tower.dataset.leaving = '1'
  if (animIn === 'cut') {
    return 0
  }
  const rows = [...tower.querySelectorAll('.f1-row')]
  rows.forEach((node, i) => {
    delete node.dataset.entering
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
  const d = asObject(graphic.data)
  const node = layer.querySelector('[data-countdown-id] .countdown-time')
  if (!node) return
  const ms = msUntilTarget(d.targetDateTime)
  if (d.hideWhenExpired && ms <= 0) {
    layer.querySelector('.graphic').innerHTML = '<div class="countdown-board countdown-board--empty"></div>'
    return
  }
  const text = formatCountdown(ms, d.format === 'h:mm:ss' ? 'h:mm:ss' : 'mm:ss')
  // Only touch the DOM when the visible text changes (no per-tick relayout)
  if (node.dataset.text === text) return
  node.dataset.text = text
  node.innerHTML = countdownDigitHtml(text)
}

function applyScoreAnimations(layer, graphic) {
  if (graphic.type !== 'matchScoreboard' && graphic.type !== 'hockeyScorebug') return
  const anim = graphic.data?.animation || {}
  layer.querySelectorAll('[data-score-bind]').forEach((node) => {
    const bind = node.dataset.scoreBind
    const text =
      graphic.type === 'hockeyScorebug'
        ? String(graphic.data?.[bind] ?? 0)
        : resolveBindText(bind, graphic.data)
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
  const d = asObject(graphic.data)
  switch (graphic.type) {
    case 'matchScoreboard':
      return buildMatchScoreboard(d, graphic.id)
    case 'customScoreboard':
    case 'composedScore':
      return buildMatchScoreboard(d, graphic.id)
    case 'lowerThird':
      return `<p class="name">${escape(textOf(d.name))}</p>${d.title ? `<p class="meta">${escape(textOf(d.title))}</p>` : ''}`
    case 'lowerThirdShow':
      return buildLowerThirdShow(d)
    case 'quizShow':
      return buildQuizShow(d)
    case 'image':
      return buildImage(d)
    case 'message':
      return `<p class="text">${escape(textOf(d.text))}</p>`
    case 'customTicker':
      return buildCustomTicker(d, graphic.id)
    case 'streamCountdown':
      return buildStreamCountdown(d, graphic.id)
    case 'f1Timing':
      return buildF1Timing(d, graphic.id)
    case 'hockeyScorebug':
      return buildHockeyScorebug(d, graphic.id)
    case 'clock':
      return `<span class="time">--:--</span>`
    default:
      return `<span>${escape(textOf(graphic.name))}</span>`
  }
}

// ---------------------------------------------------------------------------
// Image widget: a list of pre-designed graphics, one on air at a time.
// Free placement at original size renders the same <img> as the old single
// image widget. Switching images while on air crossfades (or wipes) in place.
// ---------------------------------------------------------------------------

function imageElementHtml(img, data) {
  const { mode, percent } = imageSize(data)
  const modeClass = mode === 'original' ? '' : ` graphic-image--${mode}`
  const style = mode === 'percent' ? ` style="width:calc(var(--canvas-w, 1920px) * ${percent / 100})"` : ''
  return `<img class="graphic-image${modeClass}" src="${assetUrl(img.src)}" alt="${escape(img.alt || '')}" data-image-id="${escape(img.id)}"${style} />`
}

function buildImage(data) {
  const img = activeImage(data)
  return img ? imageElementHtml(img, data) : ''
}

function updateImageLayer(inner, graphic, tr) {
  const img = activeImage(graphic.data)
  if (!img) return
  const html = imageElementHtml(img, graphic.data)
  const current = [...inner.querySelectorAll('.graphic-image')].find((el) => !el.classList.contains('is-leaving'))
  if (current?.dataset.imageId === img.id) {
    // Same picture: only refresh when its size/alt/file changed.
    if (current.dataset.html !== html) {
      inner.innerHTML = html
      inner.firstElementChild.dataset.html = html
    }
    return
  }
  const template = document.createElement('template')
  template.innerHTML = html.trim()
  const next = template.content.firstElementChild
  next.dataset.html = html
  inner.querySelectorAll('.graphic-image.is-leaving').forEach((el) => el.remove())
  if (!current || tr.in === 'cut') {
    inner.replaceChildren(next)
    return
  }
  const kind = tr.in === 'wipe' ? 'wipe' : 'fade'
  next.style.setProperty('--tr-dur', `${tr.duration}ms`)
  next.classList.add(`tr-in-${kind}`)
  current.classList.add('is-leaving')
  current.style.setProperty('--tr-dur', `${tr.duration}ms`)
  if (kind === 'fade') current.classList.add('tr-out-fade')
  inner.appendChild(next)
  setTimeout(() => current.remove(), tr.duration + 60)
}

const imageLoads = new Map() // asset URL -> Promise (kept, so the browser keeps the decoded image)
const IMAGE_DECODE_TIMEOUT_MS = 2500

function loadImage(url) {
  if (!imageLoads.has(url)) {
    const img = new Image()
    const done = new Promise((resolve) => {
      img.onload = () => resolve(img)
      img.onerror = () => resolve(null)
    })
    img.src = url
    const decoded = done.then((loaded) => (loaded && loaded.decode ? loaded.decode().then(() => loaded, () => loaded) : loaded))
    imageLoads.set(url, decoded)
  }
  return imageLoads.get(url)
}

async function preloadImagesForState(state) {
  const urgent = []
  for (const g of asArray(state?.graphics)) {
    if (!g || g.type !== 'image') continue
    for (const img of imageItems(g.data).slice(0, 100)) {
      const pending = loadImage(assetUrl(img.src))
      if (img.id === g.data?.activeImageId && canRenderGraphic(g)) urgent.push(pending)
    }
  }
  if (!urgent.length) return
  await Promise.race([Promise.all(urgent), new Promise((r) => setTimeout(r, IMAGE_DECODE_TIMEOUT_MS))])
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
    layer.querySelector('.hockey-bug') ||
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
  if (graphic.type === 'hockeyScorebug' && inner.querySelector(`[data-hockey-id="${graphic.id}"]`)) {
    applyLayerPosition(layer, graphic)
    rememberTransition(layer, graphic)
    updateHockeyScorebug(layer, graphic)
    return
  }
  if (graphic.type === 'image' && inner.querySelector('.graphic-image')) {
    applyLayerPosition(layer, graphic)
    const tr = rememberTransition(layer, graphic)
    updateImageLayer(inner, graphic, tr)
    return
  }
  // Build first: if the builder throws, the last good frame (and its timers)
  // stays on air instead of a half-torn-down layer.
  const html = graphicHtml(graphic)
  stopCustomTicker(graphic.id)
  clearTimers(layer)
  applyLayerPosition(layer, graphic)
  inner.innerHTML = html
  rememberTransition(layer, graphic)
  applyScoreAnimations(layer, graphic)
  animateClockPlate(layer, graphic)
  mountGraphicRuntime(layer, graphic)
}

function layerPositionClass(graphic) {
  // Match scoreboard with a PNG design positions itself on the full stage
  // (strip placement or full frame); without one it is a built-in score bug
  // that follows graphic.position like the other widgets.
  const usesStage =
    (graphic.type === 'matchScoreboard' ||
      graphic.type === 'customScoreboard' ||
      graphic.type === 'composedScore') &&
    matchHasDesign(graphic.data)
  if (usesStage) return 'graphic-layer graphic-layer--stage'
  if (graphic.type === 'image') {
    const variant = imageVariant(graphic.data)
    if (variant === 'fullScreen') return 'graphic-layer graphic-layer--stage'
    if (variant === 'lowerThirdSlot') return 'graphic-layer pos-bottom-left graphic-layer--lt-slot'
  }
  if (graphic.position === 'bottom-full') return 'graphic-layer graphic-layer--bottom'
  if (graphic.position === 'custom') return 'graphic-layer pos-custom'
  return `graphic-layer ${POSITION_CLASS[graphic.position] || 'pos-top-center'}`
}

// Positie kan live wijzigen (layout-editor) — klasse + vrije plaatsing
// her-toepassen op bestaande lagen, niet alleen bij aanmaak.
function applyLayerPosition(layer, graphic) {
  layer.className = layerPositionClass(graphic)
  const freePlacement = graphic.type !== 'image' || imageVariant(graphic.data) === 'free'
  if (graphic.position === 'custom' && freePlacement) {
    const p = asObject(asObject(graphic.data).placementFree)
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
    } else if (graphic.type === 'hockeyScorebug') {
      inner.querySelector('.hockey-bug')?.classList.add('is-entering')
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
    const text =
      format === '12H'
        ? now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
        : now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })
    if (node.textContent !== text) node.textContent = text
  }
  tick()
  node.dataset.timerId = String(setInterval(tick, 1000))
}

function clearTimers(root) {
  root.querySelectorAll('[data-timer-id]').forEach((node) => {
    clearInterval(Number(node.dataset.timerId))
    delete node.dataset.timerId
  })
}

// ---------------------------------------------------------------------------
// Fault isolation (QA-110): one broken graphic must never stop the others,
// nor the clock/countdown timers. Errors are logged once per graphic + error.
// ---------------------------------------------------------------------------

const graphicErrors = new Map() // graphicId -> last logged error signature

function reportGraphicError(graphic, phase, err) {
  const id = graphic?.id || '(no id)'
  const signature = `${phase}:${err?.message || err}`
  if (graphicErrors.get(id) === signature) return
  graphicErrors.set(id, signature)
  console.error(
    `[ProVerlay render] Skipping graphic "${id}" (${graphic?.type || 'unknown type'}) — ${phase} failed:`,
    err
  )
}

function clearGraphicError(id) {
  graphicErrors.delete(id)
}

/** Run fn for one graphic; on error log once and return the fallback. */
function guardGraphic(graphic, phase, fn, fallback) {
  try {
    return fn()
  } catch (err) {
    reportGraphicError(graphic, phase, err)
    return fallback
  }
}

function isGraphicRecord(g) {
  return Boolean(g) && typeof g === 'object' && typeof g.id === 'string' && g.id !== ''
}

function canRenderGraphic(graphic) {
  if (!graphicShown(graphic)) return false
  const data = asObject(graphic.data)
  if (graphic.type === 'image' && !activeImage(data)) return false
  if (graphic.type === 'lowerThirdShow') {
    const id = data.activeEntryId
    if (!id) return false
    return asArray(data.entries).some((e) => e && e.id === id)
  }
  if (graphic.type === 'quizShow') {
    const id = data.activeQuestionId
    if (!id) return false
    return asArray(data.questions).some((q) => q && q.id === id)
  }
  return true
}

function syncGraphics(rawGraphics) {
  const graphics = asArray(rawGraphics).filter(isGraphicRecord)
  lastGraphics = graphics
  let list = graphics
  if (isolateGraphicId) {
    list = graphics.filter((g) => g.id === isolateGraphicId)
  }
  const visible = list.filter((g) => guardGraphic(g, 'visibility check', () => canRenderGraphic(g), false))
  const nextIds = new Set(visible.map((g) => g.id))

  // Forget state of graphics that no longer exist at all (deleted widgets)
  const knownIds = new Set(graphics.map((g) => g.id))
  for (const id of [...graphicErrors.keys()]) if (!knownIds.has(id)) graphicErrors.delete(id)
  for (const id of [...f1Live.keys()]) if (!knownIds.has(id)) f1Live.delete(id)

  for (const [id, layer] of layers) {
    if (!nextIds.has(id)) {
      // Uit-animatie loopt al: niet opnieuw triggeren (zou de animatie
      // herstarten en zichtbaar haperen) en de bestaande timer laten staan.
      if (removalTimers.has(id)) continue
      guardGraphic({ id, type: layer.dataset.type }, 'exit animation', () => scheduleLayerRemoval(id, layer))
    }
  }

  for (const graphic of visible) {
    guardGraphic(graphic, 'render', () => {
      upsertLayer(graphic)
      clearGraphicError(graphic.id)
    })
  }

  updateEmptyHint(visible.length, graphics)
}

function removeLayerNow(id, layer) {
  stopCustomTicker(id)
  if (layer) {
    clearTimers(layer)
    layer.remove()
  }
  layers.delete(id)
  for (const key of [...scoreMemory.keys()]) {
    if (key.startsWith(`${id}:`)) scoreMemory.delete(key)
  }
}

function scheduleLayerRemoval(id, layer) {
  stopCustomTicker(id)
  const out = layer.dataset.trOut || 'auto'
  const duration = Number(layer.dataset.trDur) || TRANSITION_DEFAULT_MS
  let wait = 0
  skipEnterAnimation.add(id)
  // Register the removal first: even if the exit animation code throws, the
  // layer (and its timers) are still cleaned up.
  const finish = () => {
    removalTimers.delete(id)
    skipEnterAnimation.delete(id)
    removeLayerNow(id, layer)
  }
  removalTimers.set(id, setTimeout(finish, TRANSITION_DEFAULT_MS * 4))
  const f1Tower = layer.querySelector('.f1-tower')
  if (out === 'auto' && f1Tower) {
    wait = animateF1TowerOut(f1Tower)
  } else if (out === 'auto') {
    const board = layer.querySelector('.match-board') || layer.querySelector('.hockey-bug')
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
  clearTimeout(removalTimers.get(id))
  removalTimers.set(id, setTimeout(finish, wait))
}

function upsertLayer(graphic) {
  // Komt de graphic terug terwijl de uit-animatie nog loopt? Annuleer de
  // geplande verwijdering en bouw de laag opnieuw op, anders verdwijnt de
  // overlay alsnog zodra de oude timeout afgaat.
  if (removalTimers.has(graphic.id)) {
    clearTimeout(removalTimers.get(graphic.id))
    removalTimers.delete(graphic.id)
    removeLayerNow(graphic.id, layers.get(graphic.id))
  }
  if (layers.has(graphic.id)) {
    updateLayerContent(layers.get(graphic.id), graphic)
    return
  }
  let layer
  try {
    layer = renderGraphic(graphic)
  } catch (err) {
    // A runtime (ticker/F1) may already have started before the throw
    stopCustomTicker(graphic.id)
    throw err
  }
  layer.dataset.type = String(graphic.type || '')
  stage.appendChild(layer)
  layers.set(graphic.id, layer)
}

// ---------------------------------------------------------------------------
// Clock / countdown ticks. Only text nodes whose text actually changes are
// written, so a running clock costs no layout work between second changes.
// ---------------------------------------------------------------------------

function setTextIfChanged(node, text) {
  if (node && node.textContent !== text) node.textContent = text
}

function tickMatchClock(graphic) {
  const layer = layers.get(graphic.id)
  try {
    const pending = persistAutoStoppageIfNeeded(graphic)
    pending?.catch?.((err) => reportGraphicError(graphic, 'auto stoppage', err))
  } catch (err) {
    reportGraphicError(graphic, 'auto stoppage', err)
  }
  if (!layer) return
  const text = resolveBindText('clock', asObject(graphic.data))
  layer.querySelectorAll('[data-bind="clock"]').forEach((node) => setTextIfChanged(node, text))
}

function tickHockeyClock(graphic) {
  const layer = layers.get(graphic.id)
  const bug = layer?.querySelector('[data-hockey-id]')
  if (!bug) return
  const clock = asObject(graphic.data).clock
  const live = resolveLiveHockeyClock(clock)
  bug.classList.toggle('hockey-bug--break', live.period === 'break')
  setTextIfChanged(bug.querySelector('[data-bind="clock"]'), formatHockeyClock(clock))
}

function tickMatchClocks() {
  for (const graphic of cachedGraphics) {
    guardGraphic(graphic, 'clock tick', () => {
      if (!graphicShown(graphic) || !asObject(asObject(graphic.data).clock).running) return
      if (graphic.type === 'matchScoreboard') tickMatchClock(graphic)
      else if (graphic.type === 'hockeyScorebug') tickHockeyClock(graphic)
    })
  }
}

function tickCountdowns() {
  for (const graphic of cachedGraphics) {
    guardGraphic(graphic, 'countdown tick', () => {
      if (!countdownShouldTick(graphic)) return
      const layer = layers.get(graphic.id)
      if (layer) tickCountdownGraphic(layer, graphic)
    })
  }
}

function ensureMatchClockTimer(rawGraphics) {
  const graphics = asArray(rawGraphics).filter(isGraphicRecord)
  cachedGraphics = graphics
  const needsMatch = graphics.some((g) =>
    guardGraphic(
      g,
      'clock check',
      () =>
        graphicShown(g) &&
        Boolean(asObject(asObject(g.data).clock).running) &&
        (g.type === 'matchScoreboard' || g.type === 'hockeyScorebug'),
      false
    )
  )
  if (needsMatch && !matchClockTimer) {
    // 250 ms keeps the displayed second within a quarter second of the
    // server; ticks only write the DOM when the text changes.
    matchClockTimer = setInterval(tickMatchClocks, 250)
  } else if (!needsMatch && matchClockTimer) {
    clearInterval(matchClockTimer)
    matchClockTimer = null
  }

  const needsCountdown = graphics.some((g) =>
    guardGraphic(g, 'countdown check', () => countdownShouldTick(g), false)
  )
  if (needsCountdown && !countdownTimer) {
    // 250 ms so the ceil-rounded countdown flips within ¼ s of the target second
    countdownTimer = setInterval(tickCountdowns, 250)
  } else if (!needsCountdown && countdownTimer) {
    clearInterval(countdownTimer)
    countdownTimer = null
  }
}

// ---------------------------------------------------------------------------
// Empty-output hint. Only when the page is opened from the dashboard preview
// (?previewWindow=1 or ?hint=1) in a normal browser — never in OBS/vMix, so
// the Browser Source render stays 100% transparent.
// ---------------------------------------------------------------------------

function hintAllowed() {
  if (previewMode) return false
  if (urlParams.get('hint') !== '1' && !previewWindow) return false
  if (typeof window.obsstudio !== 'undefined') return false
  if (/vmix|obs|xsplit|casparcg/i.test(navigator.userAgent)) return false
  return true
}

const showEmptyHint = hintAllowed()
let emptyHintEl = null

function updateEmptyHint(visibleCount, graphics) {
  if (!showEmptyHint) return
  const shouldShow = visibleCount === 0
  if (!shouldShow) {
    emptyHintEl?.remove()
    emptyHintEl = null
    return
  }
  let title = 'Nothing is on air in this output'
  let body = 'Take a graphic live in the dashboard and it appears here. In OBS or vMix this page stays fully transparent.'
  if (isolateGraphicId) {
    const g = graphics.find((item) => item.id === isolateGraphicId)
    if (!g) {
      title = 'This solo source no longer exists'
      body = 'The graphic was deleted or belongs to another project. Copy a fresh solo URL from the dashboard.'
    } else {
      title = `Solo source: ${textOf(g.name) || g.type}`
      body = g.soloVisible
        ? 'Its solo output is on, but there is nothing to show yet — pick an entry or question in the dashboard.'
        : 'Its solo output is off. Switch on “Solo source” for this graphic in the dashboard to see it here.'
    }
  } else if (graphics.some((g) => g.visible)) {
    body = 'A live graphic has nothing to show yet — pick an entry or question in the dashboard. In OBS or vMix this page stays fully transparent.'
  }
  if (!emptyHintEl) {
    emptyHintEl = document.createElement('div')
    emptyHintEl.className = 'render-empty-hint'
    emptyHintEl.setAttribute('role', 'status')
    document.getElementById('preview-shell')?.appendChild(emptyHintEl)
  }
  emptyHintEl.innerHTML = `<strong>${escape(title)}</strong><span>${escape(body)}</span>`
}

// ---------------------------------------------------------------------------
// {{variables}} in text fields (public/shared/variables.js). Text is resolved
// before the builders run, so every widget renders plain text as before.
// {{time}}, {{date}} and {{clock}} change by themselves: a 1 s check rebuilds
// only the layers whose resolved text changed. Tickers are left out of that
// check (a rebuild restarts the scroll); they pick up new values with the
// next state change.
// ---------------------------------------------------------------------------

let lastVariableState = null
const liveResolved = new Map() // graphicId -> JSON of the resolved data last rendered

function withVariables(state, graphics) {
  const ctx = variableContext(state)
  liveResolved.clear()
  return asArray(graphics).map((g) => {
    if (!isGraphicRecord(g)) return g
    const resolved = resolveGraphicVariables(g, ctx)
    if (resolved !== g && graphicUsesLiveVariables(g)) liveResolved.set(g.id, JSON.stringify(resolved.data))
    return resolved
  })
}

function refreshLiveVariables() {
  if (!lastVariableState || !liveResolved.size) return
  const ctx = variableContext(lastVariableState)
  for (const g of asArray(lastVariableState.graphics)) {
    if (!isGraphicRecord(g) || !liveResolved.has(g.id) || g.type === 'customTicker') continue
    if (!layers.has(g.id) || removalTimers.has(g.id)) continue
    const resolved = resolveGraphicVariables(g, ctx)
    const json = JSON.stringify(resolved.data)
    if (json === liveResolved.get(g.id)) continue
    liveResolved.set(g.id, json)
    guardGraphic(resolved, 'live variables', () => upsertLayer(resolved))
  }
}

async function applyState(state) {
  if (!state || typeof state !== 'object') return
  try {
    applyServerTimeFromState(state)
    applyCanvas(state)
    applyBrand(state)
    applyCustomCss(state)
  } catch (err) {
    console.error('[ProVerlay render] Could not apply canvas/brand settings:', err)
  }
  const rev = (applyState._rev = (applyState._rev || 0) + 1)
  try {
    await applyProjectFonts(state)
  } catch (err) {
    console.warn('[ProVerlay render] Project fonts unavailable, using fallbacks:', err)
  }
  // Images that are about to go (or are) on air are decoded first, so a take
  // never shows a half-loaded picture. The rest of each list loads in the background.
  await preloadImagesForState(state)
  // Skip stale apply als er intussen een nieuwere stateChanged binnenkwam
  // (fonts laden async; anders kan een oudere paint over een nieuwere heen).
  if (rev !== applyState._rev) return
  try {
    lastVariableState = state
    syncGraphics(withVariables(state, state.graphics))
  } finally {
    // Timers keep running whatever happened above (QA-110)
    ensureMatchClockTimer(state.graphics)
  }
}

initRenderCompat()
setupPreviewWindow()
setInterval(refreshLiveVariables, 1000)

const socket = reconnectAfterServerDisconnect(io())
socket.on('stateChanged', applyState)
socket.on('f1TimingUpdate', (payload) => {
  if (!payload?.graphicId) return
  f1Live.set(payload.graphicId, payload)
  const graphic = cachedGraphics.find((g) => g.id === payload.graphicId)
  const layer = layers.get(payload.graphicId)
  if (graphic && layer) guardGraphic(graphic, 'F1 live update', () => updateF1Tower(layer, graphic))
})
fetch('/api/state')
  .then((r) => r.json())
  .then(applyState)
  .catch((err) => console.error('[ProVerlay render] Initial state load failed:', err))
