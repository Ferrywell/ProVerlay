export function fontFamilyFromFilename(filename = '') {
  return filename.replace(/\.(ttf|otf|woff2?)$/i, '').replace(/[-_]+/g, ' ').trim()
}

function fontFormat(filename = '') {
  if (/\.woff2$/i.test(filename)) return 'woff2'
  if (/\.woff$/i.test(filename)) return 'woff'
  if (/\.otf$/i.test(filename)) return 'opentype'
  return 'truetype'
}

const WEIGHT_NAMES = {
  thin: 100,
  hairline: 100,
  extralight: 200,
  ultralight: 200,
  light: 300,
  regular: 400,
  book: 400,
  normal: 400,
  medium: 500,
  semibold: 600,
  demibold: 600,
  bold: 700,
  extrabold: 800,
  ultrabold: 800,
  heavy: 900,
  black: 900
}
const WEIGHT_SUFFIX = new RegExp(`^(.+?)[-_ ]+(${Object.keys(WEIGHT_NAMES).join('|')})(italic)?$`, 'i')

/** "BrandHeadline" → "Brand Headline" (split CamelCase family names from font files). */
function splitCamelCase(name) {
  return name.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[-_]+/g, ' ').trim()
}

/**
 * Parse a font file name like "BrandHeadline-Bold.ttf" into
 * { family: 'Brand Headline', weight: 700, style: 'normal' }.
 */
function parseFontName(base) {
  const m = base.match(WEIGHT_SUFFIX)
  if (!m) return null
  return {
    family: splitCamelCase(m[1]),
    weight: WEIGHT_NAMES[m[2].toLowerCase()],
    style: m[3] ? 'italic' : 'normal'
  }
}

/**
 * Font family strings saved from older projects can be a file-style name
 * ("BrandHeadline Bold"); map those to the CSS family that injectProjectFontFaces registers.
 */
export function resolveRenderFontFamily(fontFamily = '') {
  const trimmed = String(fontFamily || '').trim()
  if (!trimmed) return ''
  const bare = trimmed.replace(/^['"]|['"]$/g, '')
  if (!/[,'"]/.test(bare)) {
    const parsed = parseFontName(bare)
    if (parsed) return `'${parsed.family}', sans-serif`
  }
  return trimmed
}

function resolveFontFaceMeta(filename = '', url = '') {
  const base = filename.replace(/\.(ttf|otf|woff2?)$/i, '')
  const parsed = parseFontName(base)
  if (parsed) return { ...parsed, url }
  return {
    family: fontFamilyFromFilename(filename),
    weight: /bold|heavy|black/i.test(filename) ? 700 : 400,
    style: 'normal',
    url
  }
}

function fontFaceRule({ family, url, weight = 400, style = 'normal' }) {
  const format = fontFormat(url)
  return `@font-face{font-family:'${family}';src:url('${url}') format('${format}');font-weight:${weight};font-style:${style};font-display:swap;}`
}

export async function fetchProjectFontAssets(projectId) {
  if (!projectId) return []
  const res = await fetch(`/api/projects/${projectId}/assets`)
  if (!res.ok) return []
  const assets = await res.json()
  return assets.filter((a) => /\.(ttf|otf|woff2?)$/i.test(a.filename))
}

export function injectProjectFontFaces(fonts = [], brand = {}) {
  const styleId = 'project-font-faces'
  let style = document.getElementById(styleId)
  if (!style) {
    style = document.createElement('style')
    style.id = styleId
    document.head.appendChild(style)
  }

  const rules = []
  const seen = new Set()

  for (const font of fonts) {
    const meta = resolveFontFaceMeta(font.filename, font.url)
    const key = `${meta.family}|${meta.weight}|${meta.url}`
    if (seen.has(key)) continue
    seen.add(key)
    rules.push(fontFaceRule(meta))
  }

  if (brand.fontUrl?.match(/\.(ttf|otf|woff2?)$/i)) {
    const filename = brand.fontUrl.split('/').pop() || ''
    const family =
      brand.fontFamily?.split(',')[0]?.trim().replace(/^['"]|['"]$/g, '') || 'BrandFont'
    const meta = resolveFontFaceMeta(filename, brand.fontUrl)
    const key = `${family}|${meta.weight}|${brand.fontUrl}`
    if (!seen.has(key)) {
      seen.add(key)
      rules.push(fontFaceRule({ ...meta, family }))
    }
  }

  style.textContent = rules.join('\n')
}

export function projectFontOptions(fonts = [], { includeBrand = true, brandFamily = '' } = {}) {
  const options = []
  const seen = new Set()

  if (includeBrand && brandFamily) {
    options.push({ value: brandFamily, label: 'Client branding' })
    seen.add(brandFamily)
  }

  options.push({
    value: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', sans-serif",
    label: 'System (SF Pro)'
  })

  for (const font of fonts) {
    const meta = resolveFontFaceMeta(font.filename, font.url)
    const value = `'${meta.family}', sans-serif`
    if (seen.has(value)) continue
    seen.add(value)
    options.push({ value, label: meta.family })
  }

  return options
}

export function fillFontSelect(select, options, selected = '') {
  if (!select) return
  select.innerHTML = options.map((o) => `<option value="${o.value}">${o.label}</option>`).join('')
  if (options.some((o) => o.value === selected)) {
    select.value = selected
  }
}

export function injectBrandFontFace(brand = {}) {
  const styleId = 'brand-font-face'
  let style = document.getElementById(styleId)
  if (!brand.fontUrl?.match(/\.(ttf|otf|woff2?)$/i)) {
    style?.remove()
    return
  }
  if (!style) {
    style = document.createElement('style')
    style.id = styleId
    document.head.appendChild(style)
  }
  const filename = brand.fontUrl.split('/').pop() || ''
  const family =
    brand.fontFamily?.split(',')[0]?.trim().replace(/^['"]|['"]$/g, '') || 'BrandFont'
  const meta = resolveFontFaceMeta(filename, brand.fontUrl)
  style.textContent = fontFaceRule({ ...meta, family })
}

export function resolveElementFontFamily(el, brandFamily = '') {
  if (el?.fontFamily?.trim()) return resolveRenderFontFamily(el.fontFamily.trim())
  if (brandFamily?.trim()) return brandFamily.trim()
  return "-apple-system, BlinkMacSystemFont, 'SF Pro Display', sans-serif"
}
