/** PNG/WebP analysis for /compose — dimensions now; OCR regions in a later phase. */

function pngDimensions(buffer) {
  if (!buffer || buffer.length < 24) throw new Error('Invalid PNG file')
  const signature = buffer.subarray(0, 8)
  const pngSig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
  if (!signature.equals(pngSig)) throw new Error('Invalid PNG file')
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20)
  }
}

function webpDimensions(buffer) {
  if (!buffer || buffer.length < 30) throw new Error('Invalid WebP file')
  if (buffer.toString('ascii', 0, 4) !== 'RIFF' || buffer.toString('ascii', 8, 12) !== 'WEBP') {
    throw new Error('Invalid WebP file')
  }

  let offset = 12
  while (offset + 8 <= buffer.length) {
    const chunkType = buffer.toString('ascii', offset, offset + 4)
    const chunkSize = buffer.readUInt32LE(offset + 4)
    const dataStart = offset + 8

    if (chunkType === 'VP8X' && chunkSize >= 10 && dataStart + 9 < buffer.length) {
      return {
        width: 1 + buffer.readUIntLE(dataStart + 4, 3),
        height: 1 + buffer.readUIntLE(dataStart + 7, 3)
      }
    }

    if (chunkType === 'VP8 ' && chunkSize >= 10 && dataStart + 9 < buffer.length) {
      const width = buffer.readUInt16LE(dataStart + 6) & 0x3fff
      const height = buffer.readUInt16LE(dataStart + 8) & 0x3fff
      return { width, height }
    }

    if (chunkType === 'VP8L' && chunkSize >= 5 && dataStart + 4 < buffer.length) {
      const bits = buffer.readUInt32LE(dataStart + 1)
      return {
        width: (bits & 0x3fff) + 1,
        height: ((bits >> 14) & 0x3fff) + 1
      }
    }

    offset += 8 + chunkSize + (chunkSize % 2)
  }

  throw new Error('Could not read WebP dimensions')
}

function imageDimensions(buffer) {
  if (!buffer || buffer.length < 12) throw new Error('Invalid image file')
  const pngSig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
  if (buffer.subarray(0, 8).equals(pngSig)) return pngDimensions(buffer)
  if (buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') {
    return webpDimensions(buffer)
  }
  throw new Error('Only PNG and WebP are supported')
}

function suggestBind(text, index, total, widgetType) {
  const t = String(text || '').trim()
  if (widgetType === 'matchScoreboard') {
    if (/^\d+\s*[-–—]\s*\d+$/.test(t)) return 'custom'
    if (/^\d{1,3}:\d{2}$/.test(t) || /^\d+\+\d+/.test(t)) return 'clock'
    if (/^[A-Z]{2,4}$/.test(t)) return index === 0 ? 'homeCode' : index === total - 1 ? 'awayCode' : 'custom'
    if (/^\d+$/.test(t)) return index <= 1 ? 'homeScore' : 'awayScore'
  }
  if (widgetType === 'lowerThird') {
    if (index === 0) return 'name'
    if (index === 1) return 'title'
  }
  if (widgetType === 'message') return 'text'
  return 'custom'
}

function bboxToElement(bbox, refWidth, refHeight, text, widgetType, index, total) {
  const bind = suggestBind(text, index, total, widgetType)
  return {
    id: `el-${Date.now()}-${index}`,
    bind,
    label: text || 'Veld',
    text: text || '',
    x: ((bbox.x + bbox.w / 2) / refWidth) * 100,
    y: ((bbox.y + bbox.h / 2) / refHeight) * 100,
    fontSize: Math.round(bbox.h * 0.55),
    color: '#ffffff',
    fontFamily: '',
    anchor: 'center'
  }
}

/**
 * Phase 1: return dimensions + empty regions (manual fields in compose UI).
 * Phase 2: plug Tesseract OCR here.
 */
export async function analyzeImageBuffer(buffer, { widgetType = 'matchScoreboard' } = {}) {
  const { width, height } = imageDimensions(buffer)
  const regions = []

  return {
    width,
    height,
    widgetType,
    regions,
    ocrAvailable: false,
    hint: regions.length
      ? null
      : 'Automatische tekstdetectie volgt in een volgende update. Voeg velden handmatig toe of open daarna de editor.'
  }
}

export function buildGraphicDataFromCompose({
  widgetType,
  name,
  filename,
  width,
  height,
  regions = [],
  placement,
  designFrameWidth
}) {
  const layout = {
    refWidth: width,
    refHeight: height,
    background: filename,
    designFrameWidth: designFrameWidth || 3840,
    placement: placement || { x: 50, y: 5.5, width: Math.min(100, (width / (designFrameWidth || 3840)) * 100) }
  }

  switch (widgetType) {
    case 'matchScoreboard':
      return {
        layout,
        elements: regions
          .filter((r) => r.enabled !== false)
          .map((r, i, arr) => {
            const el = bboxToElement(r.bbox, width, height, r.text, widgetType, i, arr.length)
            if (r.bind) el.bind = r.bind
            if (r.text != null) el.text = r.text
            return el
          })
      }
    case 'customTicker':
      return {
        messages: [],
        speed: 90,
        textInsetLeft: 16,
        textInsetRight: 1,
        fadeWidth: 4,
        fontSize: 30,
        color: '#ffffff',
        fontFamily: '',
        layout: {
          refWidth: width >= 3000 ? width : 3840,
          sourceHeight: height >= 1000 ? height : 2160,
          barHeight: height < 400 ? height : Math.max(230, Math.round(height * (230 / 2160))),
          background: filename
        }
      }
    case 'streamCountdown':
      return {
        targetDateTime: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
        format: 'mm:ss',
        fontSize: 96,
        color: '#1d1d1f',
        fontFamily: '',
        hideWhenExpired: false,
        layout: { refWidth: width, refHeight: height, background: filename }
      }
    case 'lowerThird': {
      const enabled = regions.filter((r) => r.enabled !== false)
      const byBind = Object.fromEntries(enabled.filter((r) => r.bind).map((r) => [r.bind, r.text]))
      return {
        name: byBind.name || enabled[0]?.text || 'Name',
        title: byBind.title || enabled[1]?.text || 'Title',
        company: byBind.company || enabled[2]?.text || '',
        layout,
        elements: enabled.map((r, i, arr) => {
          const el = bboxToElement(r.bbox, width, height, r.text, widgetType, i, arr.length)
          if (r.bind) el.bind = r.bind
          if (r.text != null) el.text = r.text
          return el
        })
      }
    }
    case 'message':
      return {
        text:
          regions.find((r) => r.enabled !== false && r.bind === 'text')?.text ||
          regions.find((r) => r.enabled !== false)?.text ||
          'Message',
        layout,
        elements: regions
          .filter((r) => r.enabled !== false)
          .map((r, i, arr) => {
            const el = bboxToElement(r.bbox, width, height, r.text, widgetType, i, arr.length)
            if (r.bind) el.bind = r.bind
            if (r.text != null) el.text = r.text
            return el
          })
      }
    default:
      throw new Error(`Unknown widget type: ${widgetType}`)
  }
}
