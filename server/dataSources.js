/**
 * Data sources per project: CSV / Excel files (uploaded or linked on this
 * computer) and Google Sheets (polled). Each new copy is parsed, cached in the
 * project folder (`data-sources/<id>.cache.json`, so the show keeps working
 * offline and the cache travels with an export), and pushed into the widgets
 * and variables that use it.
 *
 * project.json keeps the definitions:
 *   dataSources: [{ id, name, kind: 'csv'|'xlsx', origin: 'upload'|'file'|'url',
 *                   file?, path?, url?, sheet?, pollMs, holdWhileOnAir }]
 *   variableSource: { sourceId, keyColumn, valueColumn } | null
 *   dataSettings: { allowedHosts: [] }
 * Runtime status (last update, rows, last error) lives here and goes to the
 * pages as the `dataSourcesStatus` socket event.
 */
import crypto from 'crypto'
import fs from 'fs/promises'
import { watchFile, unwatchFile } from 'fs'
import path from 'path'
import { getState, onStateChange, updateState } from './state.js'
import { projectDir } from './projects.js'
import { writeJsonAtomic, writeFileAtomic } from './writeQueue.js'
import { HttpError, badRequest } from './validation.js'
import { parseDataFile } from './dataParse.js'
import { fetchDataUrl, normalizeHostPattern, sheetCsvUrl } from './dataFetch.js'
import { BINDABLE_TYPES, applyTableToGraphic, isBindableType, variablesFromTable } from './dataBindings.js'
import { DATA_DIR_NAME } from './dataFiles.js'
import { debugLog } from './debugLog.js'

export const POLL_DEFAULT_MS = 30_000
export const POLL_MIN_MS = 5_000
export const POLL_MAX_MS = 3_600_000
export const LOCAL_FILE_MAX_BYTES = 20 * 1024 * 1024
const MAX_SOURCES = 50
const FILE_EXT_KIND = { '.csv': 'csv', '.tsv': 'csv', '.txt': 'csv', '.xlsx': 'xlsx' }

const dataDir = (id) => path.join(projectDir(id), DATA_DIR_NAME)
const cachePath = (pid, id) => path.join(dataDir(pid), `${id}.cache.json`)
/** Active project id (from the state, so edits work before the first reconcile). */
const activeProject = () => getState().projectId

function fail(status, message) {
  return new HttpError(status, message)
}

export function kindForFilename(name) {
  return FILE_EXT_KIND[path.extname(String(name || '')).toLowerCase()] || null
}

function sourcesOf(state) {
  return Array.isArray(state?.dataSources) ? state.dataSources.filter((s) => s && typeof s.id === 'string') : []
}

function clampPoll(ms) {
  const n = Number(ms)
  return Number.isFinite(n) ? Math.min(POLL_MAX_MS, Math.max(POLL_MIN_MS, Math.round(n))) : POLL_DEFAULT_MS
}

function cleanName(value, fallback) {
  const name = String(value ?? '').trim().slice(0, 120)
  return name || fallback
}

/* ---------------------------------------------------------------- runtime */

let io = null
let unsubscribe = null
let projectId = null
const tables = new Map() // sourceId -> { headers, rows, sheets, sheet, fetchedAt }
const status = new Map() // sourceId -> { state, lastUpdated, rowCount, error, headers, sheets }
const pollers = new Map() // sourceId -> interval
const watched = new Map() // sourceId -> absolute path
const inFlight = new Map() // sourceId -> Promise
const held = new Map() // graphicId -> sourceId (changes held back while on air)
let knownSignature = ''

function setStatus(id, patch) {
  status.set(id, { ...(status.get(id) || {}), ...patch })
  emitStatus()
}

let emitTimer = null
function emitStatus() {
  clearTimeout(emitTimer)
  emitTimer = setTimeout(() => io?.emit('dataSourcesStatus', listDataSources()), 50)
}

/** Sources of the active project with their status (GET /api/data-sources). */
export function listDataSources() {
  const state = getState()
  return {
    projectId: state.projectId,
    sources: sourcesOf(state).map((s) => ({
      ...s,
      status: {
        state: 'idle',
        rowCount: 0,
        headers: [],
        sheets: [],
        ...(status.get(s.id) || {}),
        held: [...held.entries()].filter(([, sid]) => sid === s.id).map(([gid]) => gid)
      }
    })),
    variableSource: state.variableSource || null,
    dataSettings: { allowedHosts: [], ...(state.dataSettings || {}) }
  }
}

export function getSourceTable(id) {
  return tables.get(id) || null
}

/* ------------------------------------------------------------- refreshing */

async function readSourceBytes(source) {
  if (source.origin === 'upload') {
    if (!source.file) throw new Error('The uploaded file is missing')
    return fs.readFile(path.join(dataDir(projectId), path.basename(source.file)))
  }
  if (source.origin === 'file') {
    if (!source.path) throw new Error('Link the file again on the ProVerlay computer')
    const stat = await fs.stat(source.path).catch(() => null)
    if (!stat?.isFile()) throw new Error(`File not found: ${source.path}`)
    if (stat.size > LOCAL_FILE_MAX_BYTES) throw new Error('The file is larger than 20 MB')
    return fs.readFile(source.path)
  }
  if (source.origin === 'url') {
    const state = getState()
    return fetchDataUrl(sheetCsvUrl(source.url), { allowedHosts: state.dataSettings?.allowedHosts || [] })
  }
  throw new Error('Unknown source type')
}

/** Where a source reads from, for the Debug console. */
export function sourceWhere(source) {
  if (source.origin === 'url') return source.url || 'a link'
  if (source.origin === 'file') return source.path || 'a linked file'
  return `uploaded file ${source.file || ''}`.trim()
}

/** Re-read one source now. Resolves to its status. Concurrent calls share one read. */
export function refreshSource(id) {
  if (inFlight.has(id)) return inFlight.get(id)
  const run = (async () => {
    const forProject = projectId
    const source = sourcesOf(getState()).find((s) => s.id === id)
    if (!source) throw fail(404, 'Data source not found')
    const before = status.get(id) || {}
    const startedAt = Date.now()
    setStatus(id, { state: 'loading' })
    try {
      const bytes = await readSourceBytes(source)
      const parsed = await parseDataFile(source.kind, bytes, { sheet: source.sheet })
      if (forProject !== projectId) return status.get(id)
      const table = {
        headers: parsed.table.headers,
        rows: parsed.table.rows,
        sheets: parsed.sheets,
        sheet: parsed.sheet,
        fetchedAt: new Date().toISOString()
      }
      tables.set(id, table)
      await fs.mkdir(dataDir(projectId), { recursive: true })
      await writeJsonAtomic(cachePath(projectId, id), table)
      setStatus(id, {
        state: 'ok',
        lastUpdated: table.fetchedAt,
        rowCount: table.rows.length,
        headers: table.headers,
        sheets: table.sheets,
        sheet: table.sheet,
        error: ''
      })
      if (before.state !== 'ok' || before.rowCount !== table.rows.length) {
        debugLog('data', `"${source.name}": read ${table.rows.length} rows from ${sourceWhere(source)} (${Date.now() - startedAt} ms)`)
      }
      await applySource(id)
    } catch (err) {
      const message = err?.expose || err instanceof HttpError ? err.message : err?.message || 'Could not read the source'
      const cached = tables.has(id)
      setStatus(id, { state: cached ? 'cached' : 'error', error: message, lastError: new Date().toISOString() })
      if (before.error !== message) {
        debugLog('data', `"${source.name}": could not read ${sourceWhere(source)}: ${message}${cached ? ' (showing the last good copy)' : ''}`, {
          level: cached ? 'warn' : 'error'
        })
      }
    }
    return status.get(id)
  })().finally(() => inFlight.delete(id))
  inFlight.set(id, run)
  return run
}

/** Push a source's table into the widgets bound to it and into the variables. */
async function applySource(sourceId) {
  const table = tables.get(sourceId)
  if (!table) return
  const updatedNames = []
  const heldNames = []
  let sourceName = sourceId
  await updateState((current) => {
    updatedNames.length = 0
    heldNames.length = 0
    let changed = false
    const source = sourcesOf(current).find((s) => s.id === sourceId)
    sourceName = source?.name || sourceId
    const graphics = current.graphics.map((g) => {
      if (g?.data?.dataBinding?.sourceId !== sourceId) return g
      if (source?.holdWhileOnAir && g.visible) {
        const next = applyTableToGraphic(g, table)
        if (next) {
          if (held.get(g.id) !== sourceId) heldNames.push(g.name || g.id)
          held.set(g.id, sourceId)
        }
        return g
      }
      held.delete(g.id)
      const next = applyTableToGraphic(g, table)
      if (!next) return g
      changed = true
      updatedNames.push(g.name || g.id)
      return next
    })
    let sourceVariables = current.sourceVariables
    const vs = current.variableSource
    if (vs?.sourceId === sourceId) {
      const vars = variablesFromTable(table, vs.keyColumn, vs.valueColumn)
      if (JSON.stringify(vars) !== JSON.stringify(current.sourceVariables || {})) {
        sourceVariables = vars
        changed = true
      }
    }
    return changed ? { ...current, graphics, sourceVariables } : null
  })
  if (updatedNames.length) debugLog('data', `"${sourceName}" updated ${updatedNames.map((n) => `"${n}"`).join(', ')}`)
  if (heldNames.length) {
    debugLog('data', `"${sourceName}" changed, held back while on air: ${heldNames.map((n) => `"${n}"`).join(', ')}`)
  }
  emitStatus()
}

/** Held changes are applied as soon as the widget leaves the air. */
function releaseHeld(state) {
  for (const [graphicId, sourceId] of [...held]) {
    const g = state.graphics.find((x) => x.id === graphicId)
    if (!g || g.data?.dataBinding?.sourceId !== sourceId) {
      held.delete(graphicId)
      continue
    }
    if (!g.visible) {
      held.delete(graphicId)
      applySource(sourceId).catch((err) => console.warn(`[data] apply ${sourceId} failed: ${err.message}`))
    }
  }
}

/* ---------------------------------------------------- timers and watchers */

function stopSource(id) {
  clearInterval(pollers.get(id))
  pollers.delete(id)
  const file = watched.get(id)
  if (file) unwatchFile(file)
  watched.delete(id)
}

function stopAll() {
  for (const id of new Set([...pollers.keys(), ...watched.keys()])) stopSource(id)
  tables.clear()
  status.clear()
  held.clear()
  knownSignature = ''
}

async function loadCache(id) {
  try {
    const cached = JSON.parse(await fs.readFile(cachePath(projectId, id), 'utf8'))
    if (!Array.isArray(cached?.rows) || !Array.isArray(cached?.headers)) return
    tables.set(id, cached)
    setStatus(id, {
      state: 'cached',
      lastUpdated: cached.fetchedAt || '',
      rowCount: cached.rows.length,
      headers: cached.headers,
      sheets: cached.sheets || [],
      sheet: cached.sheet || ''
    })
  } catch {
    // No cache yet.
  }
}

function startSource(source) {
  stopSource(source.id)
  if (source.origin === 'url') {
    pollers.set(source.id, setInterval(() => refreshSource(source.id).catch(() => {}), clampPoll(source.pollMs)))
  } else if (source.origin === 'file' && source.path) {
    let debounce = null
    watchFile(source.path, { interval: 2000, persistent: false }, (curr, prev) => {
      if (curr.mtimeMs === prev.mtimeMs && curr.size === prev.size) return
      clearTimeout(debounce)
      debounce = setTimeout(() => refreshSource(source.id).catch(() => {}), 400)
    })
    watched.set(source.id, source.path)
  }
}

function sourceSignature(s) {
  return JSON.stringify([s.id, s.origin, s.kind, s.file, s.path, s.url, s.sheet, s.pollMs])
}

async function reconcile(state) {
  if (state.projectId !== projectId) {
    stopAll()
    projectId = state.projectId
  }
  const sources = sourcesOf(state)
  const signature = JSON.stringify(sources.map(sourceSignature))
  if (signature !== knownSignature) {
    const previous = new Set(knownSignature ? JSON.parse(knownSignature) : [])
    knownSignature = signature
    const ids = new Set(sources.map((s) => s.id))
    for (const id of [...status.keys()]) {
      if (ids.has(id)) continue
      stopSource(id)
      tables.delete(id)
      status.delete(id)
    }
    for (const source of sources) {
      const sig = sourceSignature(source)
      if (previous.has(sig)) continue
      if (!tables.has(source.id)) await loadCache(source.id)
      startSource(source)
      refreshSource(source.id).catch(() => {})
    }
    emitStatus()
  }
  releaseHeld(state)
}

export function initDataSources(socketServer) {
  io = socketServer
  unsubscribe?.()
  unsubscribe = onStateChange((state) => {
    reconcile(state).catch((err) => console.warn(`[data] ${err.message}`))
  })
  projectId = null
  return reconcile(getState())
}

export function shutdownDataSources() {
  unsubscribe?.()
  unsubscribe = null
  clearTimeout(emitTimer)
  stopAll()
  projectId = null
  io = null
}

/* -------------------------------------------------------------- editing */

function newSourceId() {
  return `src-${crypto.randomUUID().replace(/-/g, '').slice(0, 8)}`
}

async function addSource(source) {
  await updateState((current) => {
    const list = sourcesOf(current)
    if (list.length >= MAX_SOURCES) throw badRequest(`At most ${MAX_SOURCES} data sources per project`)
    return { ...current, dataSources: [...list, source] }
  })
  return source
}

/** Upload a CSV or Excel file as a new source (stored in the project folder). */
export async function addUploadedSource(originalName, buffer, name) {
  const kind = kindForFilename(originalName)
  if (!kind) throw badRequest('Use a .csv or .xlsx file')
  const id = newSourceId()
  const ext = kind === 'xlsx' ? '.xlsx' : '.csv'
  const file = `${id}${ext}`
  // Parse first: a broken file is refused instead of stored.
  await parseDataFile(kind, buffer).catch((err) => {
    throw badRequest(err.message)
  })
  await fs.mkdir(dataDir(activeProject()), { recursive: true })
  await writeFileAtomic(path.join(dataDir(activeProject()), file), buffer)
  return addSource({
    id,
    name: cleanName(name, path.basename(originalName).replace(/\.[a-z0-9]+$/i, '')),
    kind,
    origin: 'upload',
    file,
    pollMs: POLL_DEFAULT_MS,
    holdWhileOnAir: false
  })
}

/** Replace the file of an uploaded source. */
export async function replaceUploadedFile(id, originalName, buffer) {
  const source = sourcesOf(getState()).find((s) => s.id === id)
  if (!source) throw fail(404, 'Data source not found')
  if (source.origin !== 'upload') throw badRequest('Only uploaded sources take a new file')
  const kind = kindForFilename(originalName)
  if (kind !== source.kind) throw badRequest(`Upload a .${source.kind} file`)
  await parseDataFile(kind, buffer).catch((err) => {
    throw badRequest(err.message)
  })
  await fs.mkdir(dataDir(activeProject()), { recursive: true })
  await writeFileAtomic(path.join(dataDir(activeProject()), path.basename(source.file)), buffer)
  return refreshSource(id)
}

/** Link a file on this computer (watched for changes). Only allowed from the ProVerlay computer itself. */
export async function addLinkedFileSource(filePath, name) {
  const abs = String(filePath || '').trim()
  if (!abs || !path.isAbsolute(abs)) throw badRequest('Give the full path of the file')
  const kind = kindForFilename(abs)
  if (!kind) throw badRequest('Link a .csv or .xlsx file')
  const stat = await fs.stat(abs).catch(() => null)
  if (!stat?.isFile()) throw badRequest('File not found')
  if (stat.size > LOCAL_FILE_MAX_BYTES) throw badRequest('The file is larger than 20 MB')
  return addSource({
    id: newSourceId(),
    name: cleanName(name, path.basename(abs).replace(/\.[a-z0-9]+$/i, '')),
    kind,
    origin: 'file',
    path: abs,
    pollMs: POLL_DEFAULT_MS,
    holdWhileOnAir: false
  })
}

export async function addUrlSource(url, name, pollMs) {
  const csvUrl = sheetCsvUrl(url)
  const parsed = new URL(csvUrl)
  if (parsed.protocol !== 'https:') throw badRequest('Only https:// links can be used')
  return addSource({
    id: newSourceId(),
    name: cleanName(name, 'Google Sheet'),
    kind: 'csv',
    origin: 'url',
    url: String(url).trim().slice(0, 2000),
    pollMs: clampPoll(pollMs ?? POLL_DEFAULT_MS),
    holdWhileOnAir: false
  })
}

export async function updateSource(id, body = {}) {
  let updated = null
  await updateState((current) => {
    const list = sourcesOf(current)
    const index = list.findIndex((s) => s.id === id)
    if (index === -1) return null
    const s = { ...list[index] }
    if (body.name !== undefined) s.name = cleanName(body.name, s.name)
    if (body.pollMs !== undefined) s.pollMs = clampPoll(body.pollMs)
    if (body.holdWhileOnAir !== undefined) s.holdWhileOnAir = Boolean(body.holdWhileOnAir)
    if (body.sheet !== undefined) s.sheet = String(body.sheet || '').slice(0, 120)
    if (body.url !== undefined) {
      if (s.origin !== 'url') throw badRequest('Only sheet sources have a link')
      sheetCsvUrl(body.url)
      s.url = String(body.url).trim().slice(0, 2000)
    }
    updated = s
    const next = [...list]
    next[index] = s
    return { ...current, dataSources: next }
  })
  if (!updated) throw fail(404, 'Data source not found')
  return updated
}

/** Remove a source and its files. Widgets keep their last list but are no longer linked. */
export async function deleteSource(id) {
  let removed = null
  await updateState((current) => {
    const list = sourcesOf(current)
    removed = list.find((s) => s.id === id) || null
    if (!removed) return null
    const graphics = current.graphics.map((g) => {
      if (g?.data?.dataBinding?.sourceId !== id) return g
      const { dataBinding: _drop, ...data } = g.data
      return { ...g, data }
    })
    const variableSource = current.variableSource?.sourceId === id ? null : current.variableSource
    return { ...current, graphics, variableSource, dataSources: list.filter((s) => s.id !== id) }
  })
  if (!removed) throw fail(404, 'Data source not found')
  for (const file of [removed.file, `${id}.cache.json`]) {
    if (file) await fs.rm(path.join(dataDir(activeProject()), path.basename(file)), { force: true }).catch(() => {})
  }
  return { ok: true }
}

/** Link a widget's list to a source: { sourceId, columns: { field: header } }, or null to unlink. */
export async function setGraphicBinding(graphicId, body) {
  let result = null
  await updateState((current) => {
    const index = current.graphics.findIndex((g) => g.id === graphicId)
    if (index === -1) return null
    const g = current.graphics[index]
    let next
    if (body === null || body?.sourceId === null || body?.sourceId === '') {
      if (!g.data?.dataBinding) {
        result = g
        return null
      }
      const { dataBinding: _drop, ...data } = g.data
      next = { ...g, data }
    } else {
      if (!isBindableType(g.type)) throw badRequest('This widget type cannot be filled from a data source')
      const sourceId = String(body?.sourceId || '')
      if (!sourcesOf(current).some((s) => s.id === sourceId)) throw badRequest('Unknown data source')
      const spec = BINDABLE_TYPES[g.type]
      const columns = {}
      for (const field of spec.fields) {
        const header = body?.columns?.[field]
        if (typeof header === 'string' && header) columns[field] = header.slice(0, 200)
      }
      if (!columns[spec.key]) throw badRequest(`Choose the column for "${spec.key}"`)
      next = { ...g, data: { ...g.data, dataBinding: { sourceId, columns } } }
      const table = tables.get(sourceId)
      if (table) next = applyTableToGraphic(next, table) || next
    }
    result = next
    const graphics = [...current.graphics]
    graphics[index] = next
    return { ...current, graphics }
  })
  if (!result) throw fail(404, 'Graphic not found')
  return result
}

/** Variables from a key/value source: { sourceId, keyColumn, valueColumn }, or null. */
export async function setVariableSource(body) {
  await updateState((current) => {
    if (body === null || !body?.sourceId) return { ...current, variableSource: null, sourceVariables: {} }
    const sourceId = String(body.sourceId)
    if (!sourcesOf(current).some((s) => s.id === sourceId)) throw badRequest('Unknown data source')
    const keyColumn = String(body.keyColumn || '')
    const valueColumn = String(body.valueColumn || '')
    if (!keyColumn || !valueColumn) throw badRequest('Choose the key and value columns')
    const table = tables.get(sourceId)
    return {
      ...current,
      variableSource: { sourceId, keyColumn, valueColumn },
      sourceVariables: table ? variablesFromTable(table, keyColumn, valueColumn) : current.sourceVariables || {}
    }
  })
  return listDataSources()
}

const VARIABLE_KEY_RE = /^[A-Za-z0-9_.-]{1,80}$/

export function cleanVariables(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw badRequest('variables: expected an object')
  const out = {}
  const entries = Object.entries(value)
  if (entries.length > 500) throw badRequest('variables: at most 500')
  for (const [key, v] of entries) {
    if (!VARIABLE_KEY_RE.test(key)) throw badRequest(`variables: "${key.slice(0, 40)}" is not a valid name (letters, digits, . _ -)`)
    if (v !== null && typeof v === 'object') throw badRequest(`variables.${key}: expected text`)
    out[key] = String(v ?? '').slice(0, 2000)
  }
  return out
}

export async function setVariables(value) {
  const variables = cleanVariables(value)
  await updateState((current) => ({ ...current, variables }))
  return variables
}

export async function setAllowedHosts(hosts) {
  if (!Array.isArray(hosts)) throw badRequest('allowedHosts: expected an array')
  const clean = [...new Set(hosts.map(normalizeHostPattern).filter(Boolean))].slice(0, 20)
  await updateState((current) => ({ ...current, dataSettings: { ...(current.dataSettings || {}), allowedHosts: clean } }))
  return clean
}
