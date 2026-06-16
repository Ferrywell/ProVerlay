import { enabledTickerTexts } from '/public/shared/ticker-messages.js'
import {
  isFullFrameBackground,
  fontSizeStyle,
  supportsContainerQueries
} from '/public/shared/canvas-layout.js'

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function tickerAssetUrl(projectId, filename) {
  if (!filename) return ''
  return `/projects/${projectId || 'blank'}/assets/${encodeURIComponent(filename)}`
}

/** Shared ticker bar markup — used by render output and dashboard live preview */
export function buildTickerBoardHtml(
  data,
  { graphicId = 'ticker', projectId, canvasWidth, useCqw = supportsContainerQueries() } = {}
) {
  const layout = data.layout || { refWidth: 1920, refHeight: 108, background: '' }
  const bg = layout.background ? tickerAssetUrl(projectId, layout.background) : ''
  const insetL = data.textInsetLeft ?? 16
  const insetR = data.textInsetRight ?? 1
  const fadeW = data.fadeWidth ?? 4
  const ff = data.fontFamily || 'var(--brand-font)'
  const messages = enabledTickerTexts(data.messages)
  const sepHtml = `<span class="ticker-sep">${escapeHtml((data.separator || '•').trim() || '•')}</span>`
  const joined = messages.map((m) => `${escapeHtml(m)}${sepHtml}`).join('')
  const fullFrame = isFullFrameBackground(layout)
  const srcW = layout.refWidth || 3840
  const srcH = layout.sourceHeight || layout.refHeight || 2160
  const barH = layout.barHeight || Math.round(srcH * 0.176)
  const boardClass = fullFrame ? 'ticker-board ticker-board--fullframe' : 'ticker-board ticker-board--strip'
  const boardStyle = fullFrame
    ? `--src-w:${srcW};--bar-h:${barH};${bg ? `background-image:url('${bg}')` : ''}`
    : `--ticker-ar:${srcW} / ${layout.refHeight || 108};${bg ? `background-image:url('${bg}')` : ''}`
  const containerWidthPx = canvasWidth || srcW
  const fontSize = fontSizeStyle(data.fontSize || 30, srcW, containerWidthPx, { useCqw })

  return `
    <div class="${boardClass}" data-ticker-id="${graphicId}" style="${boardStyle}">
      <div class="ticker-window" style="left:${insetL}%;right:${insetR}%;--ticker-fade:${fadeW}%">
        <div class="ticker-track" style="font-size:${fontSize};color:${data.color || '#fff'};font-family:${ff}">
          <div class="ticker-content">${joined || ' '}</div>
        </div>
      </div>
    </div>`
}
