import fs from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'
import {
  ensureProjectsLayout,
  getActiveProjectId,
  getProjectMeta,
  projectFile,
  quarantineFile,
  readCustomCssVersion,
  readProjectData,
  renameProjectEntry,
  setActiveProjectId,
  writeCustomCss,
  writeProjectData,
  scheduleTouchProject
} from './projects.js'
import { BLANK_PROJECT } from './projectSeed.js'
import { getDataDir } from './paths.js'
import {
  migrateStateTickers,
  normalizeTickerMessagesInput
} from './tickerMessages.js'
import { penaltiesFeatureEnabled } from '../public/shared/match-utils.js'
import { migrateLegacyImages } from './imageMigration.js'
import { experimentalFeatures } from './experimental.js'
import { enqueueWrite, writeJsonAtomic } from './writeQueue.js'
import {
  HttpError,
  badRequest,
  deepMerge,
  isValidProjectId,
  normalizeStatePatch,
  validateGraphic,
  validateGraphicPatch,
  validateProjectState
} from './validation.js'
import { applyClockOp, applyScoreOp } from './clockOps.js'

export { deepMerge }

/** User brand presets (data dir) override the presets bundled in templates/brands. */
const brandsDir = () => path.join(getDataDir(), 'brands')
const BUNDLED_BRANDS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'templates', 'brands')
const BRAND_ID = /^[a-z0-9][a-z0-9-]*$/

let state = null
let activeProjectId = 'blank'
let activeProjectName = ''
let activeCustomCssVersion = ''
const listeners = new Set()

/* ------------------------------------------------------------- loading */

function applyMigrations(data) {
  let migrated = migrateStateTickers(data)
  migrated = migrateGraphicsSolo(migrated)
  migrated = migratePenaltiesDisabled(migrated)
  migrated = migrateLegacyImages(migrated)
  migrated = stripEphemeralFields(migrated)
  return migrated
}

function stripStored(data) {
  const { projectId: _drop, ...payload } = data
  return payload
}

/** Read, validate and migrate a project. Restores project.json from .bak if needed. */
async function loadProject(id) {
  const loaded = await readProjectData(id)
  let data = loaded.data
  if (loaded.source === 'backup') {
    const moved = await quarantineFile(projectFile(id))
    console.warn(
      `[state] project "${id}": project.json unreadable (${loaded.error?.message}); ` +
        `restored from project.json.bak (damaged file kept as ${path.basename(moved)})`
    )
    await writeJsonAtomic(projectFile(id), stripStored(data))
  }
  const migrated = applyMigrations(data)
  if (migrated !== data) {
    data = migrated
    await writeProjectData(id, stripStored(data))
  }
  return stripStored(data)
}

function describeLoadError(err) {
  if (err?.code === 'ENOENT') return 'project.json is missing'
  if (err?.code) return `project.json could not be read (${err.code})`
  return err?.message || 'unknown error'
}

/** Make `id` the in-memory active project (plus its display name and custom CSS version). */
async function adopt(id, data) {
  const meta = await getProjectMeta(id).catch(() => null)
  activeProjectId = id
  activeProjectName = meta?.name || id
  activeCustomCssVersion = await readCustomCssVersion(id)
  state = { ...data, projectId: id }
}

/**
 * Startup load. Never throws because of a damaged project: falls back to the
 * project's backup, then to the "blank" project (recreated if needed), so a
 * bad file can not keep the server from starting during a show.
 */
async function loadStateUnlocked() {
  await ensureProjectsLayout()
  const wanted = await getActiveProjectId()
  try {
    await adopt(wanted, await loadProject(wanted))
    return state
  } catch (err) {
    console.error(`[state] active project "${wanted}" could not be loaded: ${describeLoadError(err)}`)
  }

  if (wanted !== 'blank') {
    try {
      const data = await loadProject('blank')
      await setActiveProjectId('blank')
      await adopt('blank', data)
      console.error('[state] fell back to the "blank" project; the damaged project was left untouched on disk')
      return state
    } catch (err) {
      console.error(`[state] "blank" project could not be loaded either: ${describeLoadError(err)}`)
    }
  }

  // Last resort: recreate the blank project (keeping the damaged file aside).
  const blankFile = projectFile('blank')
  await quarantineFile(blankFile)
  await fs.mkdir(path.dirname(blankFile), { recursive: true })
  const fresh = structuredClone(BLANK_PROJECT)
  await writeJsonAtomic(blankFile, fresh)
  await setActiveProjectId('blank')
  await adopt('blank', fresh)
  console.error('[state] recreated an empty "blank" project')
  return state
}

export async function loadState() {
  return enqueueWrite(() => loadStateUnlocked())
}

/** Drop in-memory state (tests / shutdown). */
export function resetState() {
  state = null
  activeProjectId = 'blank'
  activeProjectName = ''
  activeCustomCssVersion = ''
}

/**
 * Switch the active project. The candidate is loaded and validated first;
 * the registry is only updated when that succeeds, so a damaged project can
 * never become the active one and brick the next start.
 * Returns the registry entry, or null when the project does not exist.
 */
export async function activateProject(id) {
  if (!isValidProjectId(id)) return null
  return enqueueWrite(async () => {
    const meta = await getProjectMeta(id)
    if (!meta) return null
    let data
    try {
      data = await loadProject(id)
    } catch (err) {
      if (err?.code === 'ENOENT') return null
      throw new HttpError(422, `Project "${id}" cannot be loaded: ${describeLoadError(err)}`)
    }
    const project = await setActiveProjectId(id)
    await adopt(id, data)
    notify()
    return project
  })
}

export function getState() {
  if (!state) throw new Error('State not loaded')
  return {
    ...state,
    projectId: activeProjectId,
    projectName: activeProjectName,
    customCssVersion: activeCustomCssVersion,
    // Enabled experimental flags (PROVERLAY_EXPERIMENTAL), so every client hides the same things
    experimental: experimentalFeatures(),
    serverNow: Date.now()
  }
}

/**
 * Rename a project (registry display name). When it is the active project,
 * socket clients get a stateChanged with the new `projectName`.
 */
export async function renameProject(id, name) {
  return enqueueWrite(async () => {
    const entry = await renameProjectEntry(id, name)
    if (state && id === activeProjectId) {
      activeProjectName = entry.name
      notify()
    }
    return entry
  })
}

/**
 * Save a project's custom.css. When it is the active project, socket clients
 * get a stateChanged with the new `customCssVersion` so /render reloads it.
 */
export async function saveCustomCss(id, css) {
  return enqueueWrite(async () => {
    const result = await writeCustomCss(id, css)
    if (state && id === activeProjectId && result.version !== activeCustomCssVersion) {
      activeCustomCssVersion = result.version
      notify()
    }
    return result
  })
}

export function getActiveId() {
  return activeProjectId
}

/* ------------------------------------------------------------ mutations */

/** Persist `next` as the active project's state. Caller holds the write queue. */
async function commit(next) {
  const payload = validateProjectState(stripMeta(next))
  await writeProjectData(activeProjectId, payload)
  state = { ...payload, projectId: activeProjectId }
  scheduleTouchProject(activeProjectId)
  notify()
}

/**
 * Atomic read-modify-write of the whole state. `fn` receives a private copy
 * of the current state and returns the next state (or null to abort without
 * writing). Runs inside the write queue, so concurrent updates never get lost.
 */
export function updateState(fn) {
  return enqueueWrite(async () => {
    const current = structuredClone(stripMeta(getState()))
    const next = await fn(current)
    if (next == null) return null
    await commit(next)
    return getState()
  })
}

/**
 * Atomic read-modify-write of one graphic. Resolves to the updated graphic,
 * or null when the graphic does not exist.
 */
export async function updateGraphic(id, fn) {
  let updated = null
  await updateState(async (current) => {
    const index = current.graphics.findIndex((g) => g.id === id)
    if (index === -1) return null
    const next = await fn(current.graphics[index])
    if (next == null) return null
    validateGraphic(next, 'graphic', { strictFields: false })
    if (next.id !== id) throw badRequest('id is immutable')
    const graphics = [...current.graphics]
    graphics[index] = next
    updated = next
    return { ...current, graphics }
  })
  return updated
}

export async function patchState(patch) {
  const normalized = normalizeStatePatch(patch)
  return updateState((current) => deepMerge(current, normalized))
}

export function getGraphic(id) {
  return getState().graphics.find((g) => g.id === id)
}

/** PATCH one graphic. Resolves to the updated graphic or null (not found). */
export async function patchGraphic(id, patch) {
  return updateGraphic(id, (existing) => {
    validateGraphicPatch(existing, patch)
    const merged = deepMerge(existing, patch)
    if (existing.type === 'customTicker' && patch.data?.messages !== undefined) {
      merged.data = {
        ...merged.data,
        messages: normalizeTickerMessagesInput(patch.data.messages, {
          existing: existing.data?.messages
        })
      }
    }
    return merged
  })
}

export async function addGraphic(graphic) {
  validateGraphic(graphic)
  return updateState((current) => {
    if (current.graphics.some((g) => g.id === graphic.id)) {
      throw new HttpError(409, 'Graphic id already exists')
    }
    return { ...current, graphics: [...current.graphics, graphic] }
  })
}

export async function removeGraphic(id) {
  return updateState((current) => {
    const graphics = current.graphics.filter((g) => g.id !== id)
    if (graphics.length === current.graphics.length) return null
    return { ...current, graphics }
  })
}

/** Set (boolean) or flip (undefined) `visible`, computed inside the queue. */
export async function setGraphicVisibility(id, visible) {
  return updateGraphic(id, (g) => ({
    ...g,
    visible: visible === undefined ? !g.visible : Boolean(visible)
  }))
}

/** Set (boolean) or flip (undefined) `soloVisible`, computed inside the queue. */
export async function setGraphicSoloVisibility(id, soloVisible) {
  return updateGraphic(id, (g) => ({
    ...g,
    soloVisible: soloVisible === undefined ? !g.soloVisible : Boolean(soloVisible)
  }))
}

/** Atomic score change for matchScoreboard / hockeyScorebug. */
export async function applyScore(id, body) {
  return updateGraphic(id, (g) => applyScoreOp(g, body))
}

/** Atomic clock action for matchScoreboard / hockeyScorebug. */
export async function applyClock(id, body) {
  return updateGraphic(id, (g) => applyClockOp(g, body))
}

/* ----------------------------------------------------------- migrations */

export function migrateGraphicsSolo(state) {
  if (!state?.graphics?.length) return state
  let changed = false
  const graphics = state.graphics.map((g) => {
    if (g.soloVisible !== undefined) return g
    changed = true
    return { ...g, soloVisible: false }
  })
  return changed ? { ...state, graphics } : state
}

export function migratePenaltiesDisabled(state) {
  if (penaltiesFeatureEnabled() || !state?.graphics?.length) return state
  let changed = false
  const graphics = state.graphics.map((g) => {
    if (g.type !== 'matchScoreboard') return g
    const d = g.data || {}
    let data = d

    if (d.penalties?.active) {
      changed = true
      data = { ...data, penalties: { ...d.penalties, active: false } }
    }
    if (d.clock?.period === 'penalties') {
      changed = true
      data = { ...data, clock: { ...d.clock, period: 'second_half' } }
    }
    if (d.widgets?.penalties !== false) {
      changed = true
      data = { ...data, widgets: { ...(d.widgets || {}), penalties: false } }
    }

    return data !== d ? { ...g, data } : g
  })
  return changed ? { ...state, graphics } : state
}

/* --------------------------------------------------------------- brands */

async function readBrandDir(dir) {
  try {
    const files = await fs.readdir(dir)
    const brands = []
    for (const file of files.filter((f) => f.endsWith('.json'))) {
      try {
        brands.push(JSON.parse(await fs.readFile(path.join(dir, file), 'utf8')))
      } catch (err) {
        console.warn(`Skipping unreadable brand preset ${file}: ${err.message}`)
      }
    }
    return brands
  } catch {
    return []
  }
}

export async function listBrands() {
  const byId = new Map()
  for (const brand of await readBrandDir(BUNDLED_BRANDS_DIR)) byId.set(brand.id, brand)
  for (const brand of await readBrandDir(brandsDir())) byId.set(brand.id, brand)
  return [...byId.values()]
}

export async function applyBrand(brandId) {
  if (!BRAND_ID.test(String(brandId || ''))) throw new HttpError(404, 'Brand not found')
  let raw
  try {
    raw = await fs.readFile(path.join(brandsDir(), `${brandId}.json`), 'utf8')
  } catch {
    try {
      raw = await fs.readFile(path.join(BUNDLED_BRANDS_DIR, `${brandId}.json`), 'utf8')
    } catch {
      throw new HttpError(404, 'Brand not found')
    }
  }
  let brand
  try {
    brand = JSON.parse(raw)
  } catch {
    throw new HttpError(422, 'Brand preset is not valid JSON')
  }
  return patchState({
    brandId: typeof brand.id === 'string' ? brand.id : brandId,
    brand: {
      name: brand.name,
      fontFamily: brand.fontFamily,
      fontUrl: brand.fontUrl,
      colors: brand.colors
    }
  })
}

/* -------------------------------------------------------------- events */

export function onStateChange(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

function notify() {
  const snapshot = getState()
  for (const fn of listeners) {
    try {
      fn(snapshot)
    } catch (err) {
      console.error('[state] listener failed:', err)
    }
  }
}

function stripMeta(stateObj) {
  const { projectId, projectName, customCssVersion, experimental, serverNow, ...rest } = stateObj
  return rest
}

/** Remove runtime-only fields that must never be persisted to project.json. */
const EPHEMERAL_KEYS = ['serverNow', 'projectName', 'customCssVersion', 'experimental']

export function stripEphemeralFields(state) {
  if (!state || !EPHEMERAL_KEYS.some((key) => Object.hasOwn(state, key))) return state
  const rest = { ...state }
  for (const key of EPHEMERAL_KEYS) delete rest[key]
  return rest
}
