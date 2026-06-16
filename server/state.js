import fs from 'fs/promises'
import path from 'path'
import {
  ensureProjectsLayout,
  getActiveProjectId,
  projectFile,
  touchActiveProject
} from './projects.js'
import { DATA_DIR } from './paths.js'
import {
  migrateStateTickers,
  normalizeTickerMessagesInput
} from './tickerMessages.js'
import { penaltiesFeatureEnabled } from '../public/shared/match-utils.js'

const BRANDS_DIR = path.join(DATA_DIR, 'brands')
const LEGACY_SHOW = path.join(DATA_DIR, 'show.json')

let state = null
let activeProjectId = 'blank'
let listeners = new Set()

export async function loadState() {
  await ensureProjectsLayout()
  activeProjectId = await getActiveProjectId()
  const file = projectFile(activeProjectId)
  const raw = await fs.readFile(file, 'utf8')
  state = JSON.parse(raw)
  state.projectId = activeProjectId
  let migrated = migrateStateTickers(state)
  migrated = migrateGraphicsSolo(migrated)
  migrated = migratePenaltiesDisabled(migrated)
  migrated = stripEphemeralFields(migrated)
  if (migrated !== state) {
    const { projectId: _drop, ...payload } = migrated
    state = { ...payload, projectId: activeProjectId }
    await fs.writeFile(file, JSON.stringify(payload, null, 2))
  }
  return state
}

export async function reloadState() {
  const next = await loadState()
  // Broadcast naar alle clients (render/operator), anders blijft bv. de
  // OBS-render het oude project tonen na een project-switch of import.
  notify()
  return next
}

export function getState() {
  if (!state) throw new Error('State not loaded')
  return { ...state, projectId: activeProjectId, serverNow: Date.now() }
}

export async function saveState(next) {
  const { projectId: _drop, ...payload } = next
  state = { ...payload, projectId: activeProjectId }
  await fs.writeFile(projectFile(activeProjectId), JSON.stringify(payload, null, 2))
  await touchActiveProject()
  notify()
  return getState()
}

export async function patchState(patch) {
  const current = getState()
  const merged = deepMerge(stripMeta(current), patch)
  return saveState(merged)
}

export function getGraphic(id) {
  return getState().graphics.find((g) => g.id === id)
}

export async function patchGraphic(id, patch) {
  const current = stripMeta(getState())
  const index = current.graphics.findIndex((g) => g.id === id)
  if (index === -1) return null

  const graphics = [...current.graphics]
  const existing = graphics[index]
  const merged = deepMerge(existing, patch)
  if (existing.type === 'customTicker' && patch.data?.messages !== undefined) {
    merged.data = {
      ...merged.data,
      messages: normalizeTickerMessagesInput(patch.data.messages, {
        existing: existing.data?.messages
      })
    }
  }
  graphics[index] = merged
  return saveState({ ...current, graphics })
}

export async function addGraphic(graphic) {
  const current = stripMeta(getState())
  if (current.graphics.some((g) => g.id === graphic.id)) {
    throw new Error('Graphic id already exists')
  }
  return saveState({ ...current, graphics: [...current.graphics, graphic] })
}

export async function removeGraphic(id) {
  const current = stripMeta(getState())
  const graphics = current.graphics.filter((g) => g.id !== id)
  if (graphics.length === current.graphics.length) return null
  return saveState({ ...current, graphics })
}

export async function setGraphicVisibility(id, visible) {
  return patchGraphic(id, { visible: Boolean(visible) })
}

export async function setGraphicSoloVisibility(id, soloVisible) {
  return patchGraphic(id, { soloVisible: Boolean(soloVisible) })
}

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

export async function listBrands() {
  try {
    const files = await fs.readdir(BRANDS_DIR)
    const brands = []
    for (const file of files.filter((f) => f.endsWith('.json'))) {
      const raw = await fs.readFile(path.join(BRANDS_DIR, file), 'utf8')
      brands.push(JSON.parse(raw))
    }
    return brands
  } catch {
    return []
  }
}

export async function applyBrand(brandId) {
  const raw = await fs.readFile(path.join(BRANDS_DIR, `${brandId}.json`), 'utf8')
  const brand = JSON.parse(raw)
  return patchState({
    brandId: brand.id,
    brand: {
      name: brand.name,
      fontFamily: brand.fontFamily,
      fontUrl: brand.fontUrl,
      colors: brand.colors
    }
  })
}

export function onStateChange(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

function notify() {
  const snapshot = getState()
  for (const fn of listeners) fn(snapshot)
}

function stripMeta(stateObj) {
  const { projectId, serverNow, ...rest } = stateObj
  return rest
}

/** Remove runtime-only fields that must never be persisted to project.json. */
export function stripEphemeralFields(state) {
  if (!state || state.serverNow == null) return state
  const { serverNow: _drop, ...rest } = state
  return rest
}

function deepMerge(target, source) {
  const out = { ...target }
  for (const [key, value] of Object.entries(source)) {
    if (Array.isArray(value)) {
      out[key] = value
    } else if (value && typeof value === 'object') {
      out[key] = deepMerge(target[key] ?? {}, value)
    } else {
      out[key] = value
    }
  }
  return out
}
