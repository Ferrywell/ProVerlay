/** Shared layout math — editor and render must use the same formulas (WYSIWYG). */

export function projectCanvas(settings = {}) {
  return {
    width: Number(settings.canvasWidth) || 1920,
    height: Number(settings.canvasHeight) || 1080
  }
}

export function resolveFrameSize(layout = {}, settings = {}) {
  const project = projectCanvas(settings)
  return {
    width: Number(layout.frameWidth) || project.width,
    height: Number(layout.frameHeight) || project.height
  }
}

export function isStripLayout(layout = {}) {
  const h = layout.refHeight || 1080
  const w = layout.refWidth || 1920
  // Horizontal scorebar PNG (e.g. ODIDO 3197×335) — aspect ratio, not absolute height cap
  return h / w < 0.25
}

/** Min visible strip height (px) for full-frame ticker PNGs at 2160p — ODIDO reference bar */
export const TICKER_FULLFRAME_BAR_MIN = 230
const TICKER_FULLFRAME_BAR_RATIO = TICKER_FULLFRAME_BAR_MIN / 2160

export function isFullFrameTickerSource(width, height) {
  return height >= 1000 && width >= 2000
}

export function defaultTickerBarHeight(width, height) {
  if (height < 400) return height
  if (isFullFrameTickerSource(width, height)) {
    return Math.max(TICKER_FULLFRAME_BAR_MIN, Math.round(height * TICKER_FULLFRAME_BAR_RATIO))
  }
  return height
}

export function layoutFromTickerImage({ width, height }, existing = {}) {
  const layout = { ...existing, refWidth: width }
  if (isFullFrameTickerSource(width, height)) {
    layout.sourceHeight = height
    layout.barHeight = Math.max(
      Number(existing.barHeight) || 0,
      defaultTickerBarHeight(width, height)
    )
    delete layout.refHeight
  } else {
    layout.refHeight = height
    delete layout.sourceHeight
    delete layout.barHeight
  }
  return layout
}

export function isFullFrameBackground(layout = {}) {
  const sourceH = layout.sourceHeight || layout.refHeight || 1080
  const barH = layout.barHeight || 0
  return barH > 0 && sourceH > barH * 1.5
}

export function canvasAspectRatio(layout = {}) {
  const w = layout.refWidth || 1920
  const h = layout.refHeight || 1080
  return `${w} / ${h}`
}

export function defaultPlacement(layout = {}, settings = {}) {
  const frame = resolveFrameSize(layout, settings)
  const rw = Number(layout.refWidth) || frame.width
  const designFw = Number(layout.designFrameWidth) || frame.width
  const width = Math.min(100, (rw / designFw) * 100)
  return { x: 50, y: 5.5, width, anchor: 'top-center' }
}

export function resolvePlacement(layout = {}, settings = {}) {
  return { ...defaultPlacement(layout, settings), ...(layout.placement || {}) }
}

export function stripWidthPercent(layout = {}, settings = {}) {
  return resolvePlacement(layout, settings).width
}

export function stripDisplayWidth(layout = {}, settings = {}) {
  return `${stripWidthPercent(layout, settings)}%`
}

export function placementStyle(layout = {}, settings = {}) {
  const p = resolvePlacement(layout, settings)
  return `left:${p.x}%;top:${p.y}%;width:${p.width}%;transform:translate(-50%, 0);`
}

export function supportsContainerQueries() {
  try {
    return typeof CSS !== 'undefined' && CSS.supports?.('width', '1cqw')
  } catch {
    return false
  }
}

export function scaledSizePx(designPx, refWidth, containerWidthPx) {
  const px = Number(designPx) || 0
  const rw = Number(refWidth) || 1920
  const cw = Number(containerWidthPx) || rw
  return (px / rw) * cw
}

export function scaledCqwPx(cqwValue, containerWidthPx) {
  return (Number(cqwValue) / 100) * Number(containerWidthPx)
}

export function fontSizeCqw(fontSize, refWidth = 1920) {
  const px = Number(fontSize) || 36
  const rw = Number(refWidth) || 1920
  return `${(px / rw) * 100}cqw`
}

export function fontSizeStyle(fontSize, refWidth, containerWidthPx, { useCqw = supportsContainerQueries() } = {}) {
  if (useCqw) return fontSizeCqw(fontSize, refWidth)
  return `${scaledSizePx(fontSize, refWidth, containerWidthPx)}px`
}

export function layoutDimStyle(px, refWidth, containerWidthPx, { useCqw = supportsContainerQueries() } = {}) {
  if (useCqw) return fontSizeCqw(px, refWidth)
  return `${scaledSizePx(px, refWidth, containerWidthPx)}px`
}

export function layoutBackgroundVisible(layout = {}) {
  return Boolean(layout.background) && layout.backgroundVisible !== false
}

function clockBindBoxCenterLeft(clockEl, layout = {}, options = {}) {
  const minW = Number(clockEl.minWidthCqw) || 0
  if (!minW) return null

  const useCqw = options.useCqw ?? supportsContainerQueries()
  const containerWidthPx = options.containerWidthPx ?? resolveContainerWidthPx(layout, options.settings)
  const half = useCqw ? `${minW / 2}cqw` : `${scaledCqwPx(minW / 2, containerWidthPx)}px`
  const anchor = clockEl.anchor || 'center'

  if (anchor === 'center-right') return `calc(${clockEl.x}% - ${half})`
  if (anchor === 'center-left') return `calc(${clockEl.x}% + ${half})`
  return `${clockEl.x}%`
}

/** Couple pill box metrics to clock fontSize so height and text scale together. */
export function resolveClockPillMetrics(pillCfg = {}, clockEl = {}) {
  const fontDesignPx = Number(clockEl.fontSize) || 36
  const padXDesign = Number(pillCfg.paddingXPx) ?? 24
  const configuredHeight = Number(pillCfg.heightPx) || 0
  const padYDesign =
    Number(pillCfg.paddingYPx) ||
    Math.max(6, Math.round((configuredHeight || fontDesignPx) * 0.14))
  const minHeightFromFont = fontDesignPx + padYDesign * 2
  const effectiveHeightPx = Math.max(configuredHeight, minHeightFromFont)
  const borderRadiusPx = Math.min(
    Number(pillCfg.borderRadiusPx) || effectiveHeightPx / 2,
    effectiveHeightPx / 2
  )
  return { fontDesignPx, padXDesign, padYDesign, effectiveHeightPx, borderRadiusPx }
}

export function clockPillTextStyle(el, layout = {}, options = {}, pillCfg = {}) {
  const rw = layout.refWidth || 1920
  const containerWidthPx = options.containerWidthPx ?? resolveContainerWidthPx(layout, options.settings)
  const useCqw = options.useCqw ?? supportsContainerQueries()
  const metrics = resolveClockPillMetrics(pillCfg, el)
  const ff = el.fontFamily || 'var(--brand-font)'
  const parts = [
    `font-size:${fontSizeStyle(metrics.fontDesignPx, rw, containerWidthPx, { useCqw })}`,
    `color:${el.color || '#ffffff'}`,
    `font-family:${ff}`,
    'line-height:1',
    'white-space:nowrap',
    'font-variant-numeric:tabular-nums',
    'text-align:center'
  ]
  if (el.letterSpacing) parts.push(`letter-spacing:${el.letterSpacing}`)
  return parts.join(';')
}

function clockZoneWidth(clockEl, pillCfg, layout = {}, options = {}) {
  const rw = layout.refWidth || 1920
  const containerWidthPx = options.containerWidthPx ?? resolveContainerWidthPx(layout, options.settings)
  const useCqw = options.useCqw ?? supportsContainerQueries()
  const dim = (px) => layoutDimStyle(px, rw, containerWidthPx, { useCqw })

  if (clockEl.minWidthCqw) {
    return useCqw
      ? `${clockEl.minWidthCqw}cqw`
      : `${scaledCqwPx(clockEl.minWidthCqw, containerWidthPx)}px`
  }
  if (pillCfg.minWidthPx) return dim(pillCfg.minWidthPx)
  return '0px'
}

export function clockPillBoxStyle(pillCfg, clockEl, layout = {}, options = {}) {
  const rw = layout.refWidth || 1920
  const containerWidthPx = options.containerWidthPx ?? resolveContainerWidthPx(layout, options.settings)
  const useCqw = options.useCqw ?? supportsContainerQueries()
  const dim = (px) => layoutDimStyle(px, rw, containerWidthPx, { useCqw })
  const metrics = resolveClockPillMetrics(pillCfg, clockEl)
  const anchor = pillCfg.anchor || 'right'
  let left
  let transform

  if (anchor === 'center') {
    const centerLeft = clockBindBoxCenterLeft(clockEl, layout, options)
    left = centerLeft || `${clockEl.x}%`
    transform = 'translate(-50%, -50%)'
  } else if (anchor === 'right') {
    // Left edge fixed (gap to score bar stays); pill grows wider to the right.
    const zoneW = clockZoneWidth(clockEl, pillCfg, layout, options)
    left = `calc(${clockEl.x}% - ${zoneW})`
    transform = 'translate(0, -50%)'
  } else {
    // anchor 'left': right edge fixed; pill grows wider to the left.
    const gap = pillCfg.gapPx ? dim(pillCfg.gapPx) : '0'
    left = gap ? `calc(${clockEl.x}% - ${gap})` : `${clockEl.x}%`
    transform = 'translate(-100%, -50%)'
  }

  const parts = [
    `left:${left}`,
    `top:${clockEl.y}%`,
    `transform:${transform}`,
    `height:${dim(metrics.effectiveHeightPx)}`,
    `padding:${dim(metrics.padYDesign)} ${dim(metrics.padXDesign)}`,
    `border-radius:${dim(metrics.borderRadiusPx)}`,
    `background:${pillCfg.background}`,
    'box-sizing:border-box',
    'width:max-content'
  ]
  if (pillCfg.minWidthPx) parts.push(`min-width:${dim(pillCfg.minWidthPx)}`)
  return parts.join(';')
}

export function resolveContainerWidthPx(layout = {}, settings = {}) {
  const canvas = projectCanvas(settings)
  if (isStripLayout(layout)) {
    return (stripWidthPercent(layout, settings) / 100) * canvas.width
  }
  const placement = resolvePlacement(layout, settings)
  if (placement.width) {
    return (placement.width / 100) * canvas.width
  }
  const rw = Number(layout.refWidth) || 1920
  return Math.min(rw, canvas.width)
}

export function elementBoxStyle(el, layout = {}, options = {}) {
  const rw = layout.refWidth || 1920
  const containerWidthPx = options.containerWidthPx ?? resolveContainerWidthPx(layout, options.settings)
  const useCqw = options.useCqw ?? supportsContainerQueries()
  const anchor = el.anchor || 'center'
  const transforms = {
    center: 'translate(-50%, -50%)',
    'center-left': 'translate(0, -50%)',
    'center-right': 'translate(-100%, -50%)'
  }
  const justify = {
    center: 'center',
    'center-left': 'flex-start',
    'center-right': 'flex-end'
  }
  const ff = el.fontFamily || 'var(--brand-font)'
  const parts = [
    `left:${el.x}%`,
    `top:${el.y}%`,
    `font-size:${fontSizeStyle(el.fontSize, rw, containerWidthPx, { useCqw })}`,
    `color:${el.color || '#ffffff'}`,
    `font-family:${ff}`,
    `transform:${transforms[anchor] || transforms.center}`,
    'display:flex',
    'align-items:center',
    `justify-content:${justify[anchor] || 'center'}`,
    'line-height:1'
  ]
  if (el.letterSpacing) parts.push(`letter-spacing:${el.letterSpacing}`)
  if (el.minWidthCqw) {
    parts.push(
      useCqw
        ? `min-width:${el.minWidthCqw}cqw`
        : `min-width:${scaledCqwPx(el.minWidthCqw, containerWidthPx)}px`
    )
  }
  if (el.bind === 'homeScore' || el.bind === 'awayScore' || el.bind === 'clock') {
    parts.push('font-variant-numeric:tabular-nums')
  }
  return parts.join(';')
}

/** Default slot positions for a horizontal scorebar strip PNG */
export function defaultStripSlots(refWidth = 1920, refHeight = 120) {
  const y = 50
  return [
    { id: 'el-home-code', bind: 'homeCode', label: 'Thuis code', text: 'NED', x: 14, y, fontSize: Math.round(refHeight * 0.42), color: '#ffffff', anchor: 'center', fontFamily: '' },
    { id: 'el-home-score', bind: 'homeScore', label: 'Thuis score', text: '0', x: 28, y, fontSize: Math.round(refHeight * 0.55), color: '#ffffff', anchor: 'center', minWidthCqw: (refHeight * 0.35 / refWidth) * 100, fontFamily: '' },
    { id: 'el-away-score', bind: 'awayScore', label: 'Uit score', text: '0', x: 72, y, fontSize: Math.round(refHeight * 0.55), color: '#ffffff', anchor: 'center', minWidthCqw: (refHeight * 0.35 / refWidth) * 100, fontFamily: '' },
    { id: 'el-away-code', bind: 'awayCode', label: 'Uit code', text: 'JAP', x: 86, y, fontSize: Math.round(refHeight * 0.42), color: '#ffffff', anchor: 'center', fontFamily: '' },
    { id: 'el-clock', bind: 'clock', label: 'Speeltijd', text: '0:00', x: 96, y, fontSize: Math.round(refHeight * 0.4), color: '#ffffff', anchor: 'center-right', letterSpacing: '-0.04em', minWidthCqw: (refHeight * 0.55 / refWidth) * 100, fontFamily: '' }
  ]
}

export function renderUrl(graphicId, origin = window.location.origin) {
  return `${origin}/render?graphic=${encodeURIComponent(graphicId)}`
}

export async function readImageDimensions(fileOrUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onerror = () => reject(new Error('Kon afbeelding niet laden'))
    if (fileOrUrl instanceof File) {
      const url = URL.createObjectURL(fileOrUrl)
      img.onload = () => {
        URL.revokeObjectURL(url)
        resolve({ width: img.naturalWidth, height: img.naturalHeight })
      }
      img.src = url
    } else {
      img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight })
      img.src = fileOrUrl
    }
  })
}
