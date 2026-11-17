/**
 * Parsing for data sources: CSV (own RFC 4180 parser, no dependency) and
 * Excel .xlsx (read-excel-file, MIT; deliberately not the npm `xlsx` package,
 * whose npm release is outdated and has known vulnerabilities).
 *
 * Every parser returns a table: { headers: string[], rows: object[] } where
 * each row maps header → trimmed string. Empty rows are dropped; duplicate or
 * empty header names get a suffix ("Name 2", "Column 3") so no data is lost.
 */
import readXlsxFile from 'read-excel-file/node'

export const MAX_ROWS = 5000
export const MAX_COLUMNS = 100

/** Delimiter of a CSV text: the one of `,` `;` tab that splits the first lines most consistently. */
export function detectDelimiter(text) {
  const lines = []
  let line = ''
  let quoted = false
  for (let i = 0; i < text.length && lines.length < 10; i++) {
    const ch = text[i]
    if (ch === '"') quoted = !quoted
    if (!quoted && (ch === '\n' || ch === '\r')) {
      if (line.trim()) lines.push(line)
      line = ''
      continue
    }
    if (!quoted) line += ch
  }
  if (line.trim()) lines.push(line)
  let best = ','
  let bestScore = -1
  for (const d of [',', ';', '\t']) {
    const counts = lines.map((l) => l.split(d).length - 1)
    if (!counts.length || counts[0] === 0) continue
    // Prefer delimiters that appear the same number of times on every line.
    const consistent = counts.filter((c) => c === counts[0]).length
    const score = consistent * 1000 + counts[0]
    if (score > bestScore) {
      best = d
      bestScore = score
    }
  }
  return best
}

/** RFC 4180 CSV → array of string arrays. Handles quotes, doubled quotes, newlines in quotes, CRLF. */
export function parseCsvRows(input, delimiter) {
  let text = String(input ?? '')
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1)
  const d = delimiter || detectDelimiter(text)
  const rows = []
  let row = []
  let field = ''
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i++
        } else {
          quoted = false
        }
      } else {
        field += ch
      }
      continue
    }
    if (ch === '"' && field === '') {
      quoted = true
    } else if (ch === d) {
      row.push(field)
      field = ''
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++
      row.push(field)
      rows.push(row)
      row = []
      field = ''
      if (rows.length > MAX_ROWS + 1) break
    } else {
      field += ch
    }
  }
  if (field !== '' || row.length) {
    row.push(field)
    rows.push(row)
  }
  return rows
}

function cellText(value) {
  if (value === null || value === undefined) return ''
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return ''
    const iso = value.toISOString()
    // Whole days (Excel dates without a time) as YYYY-MM-DD.
    return iso.endsWith('T00:00:00.000Z') ? iso.slice(0, 10) : iso.slice(0, 16).replace('T', ' ')
  }
  return String(value).trim()
}

/** First row = headers. Unique, non-empty header names; empty rows dropped. */
export function tableFromRows(rawRows) {
  const rows = rawRows.map((r) => (Array.isArray(r) ? r.map(cellText) : []))
  const headerIndex = rows.findIndex((r) => r.some((c) => c !== ''))
  if (headerIndex === -1) return { headers: [], rows: [] }
  const width = Math.min(
    MAX_COLUMNS,
    rows.slice(headerIndex).reduce((max, r) => Math.max(max, r.length), 0)
  )
  const seen = new Map()
  const headers = []
  for (let i = 0; i < width; i++) {
    const base = rows[headerIndex][i] || `Column ${i + 1}`
    const n = (seen.get(base.toLowerCase()) || 0) + 1
    seen.set(base.toLowerCase(), n)
    headers.push(n === 1 ? base : `${base} ${n}`)
  }
  const out = []
  for (const r of rows.slice(headerIndex + 1)) {
    if (!r.some((c) => c !== '')) continue
    const obj = {}
    headers.forEach((h, i) => {
      obj[h] = r[i] ?? ''
    })
    out.push(obj)
    if (out.length >= MAX_ROWS) break
  }
  return { headers, rows: out }
}

export function parseCsv(text, delimiter) {
  return tableFromRows(parseCsvRows(text, delimiter))
}

/** Decode a CSV buffer: UTF-8 (with or without BOM); falls back to Windows-1252 when it is not valid UTF-8. */
export function decodeText(buffer) {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer)
  } catch {
    return new TextDecoder('windows-1252').decode(buffer)
  }
}

/**
 * Read an .xlsx buffer. Returns { sheets: string[], sheet, table } for the
 * requested sheet (name), or the first one when it is missing or not found.
 */
export async function parseXlsx(buffer, sheetName) {
  let sheets
  try {
    sheets = await readXlsxFile(buffer)
  } catch (err) {
    throw Object.assign(new Error(`Not a readable Excel (.xlsx) file: ${err.message}`), { expose: true })
  }
  if (!sheets.length) throw Object.assign(new Error('The Excel file has no sheets'), { expose: true })
  const names = sheets.map((s) => s.sheet)
  const chosen = sheets.find((s) => s.sheet === sheetName) || sheets[0]
  return { sheets: names, sheet: chosen.sheet, table: tableFromRows(chosen.data) }
}

/** Table for a file by kind. */
export async function parseDataFile(kind, buffer, { sheet } = {}) {
  if (kind === 'xlsx') return parseXlsx(buffer, sheet)
  return { sheets: [], sheet: '', table: parseCsv(decodeText(buffer)) }
}
