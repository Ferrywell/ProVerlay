import fs from 'fs/promises'
import { createWriteStream } from 'fs'
import { Transform } from 'stream'
import { pipeline } from 'stream/promises'
import path from 'path'
import crypto from 'crypto'
import { BLANK_PROJECT, SEED_REGISTRY } from './projectSeed.js'
import { getDataDir } from './paths.js'
import { enqueueWrite, writeJsonAtomic, writeFileAtomic, renameWithRetry } from './writeQueue.js'
import {
  CUSTOM_CSS_FILENAME,
  CUSTOM_CSS_MAX_BYTES,
  customCssVersion,
  sanitizeCustomCss
} from './customCss.js'
import {
  HttpError,
  badRequest,
  isPlainObject,
  isValidProjectId,
  validateProjectState
} from './validation.js'

async function createZipArchive() {
  const { ZipArchive } = await import('archiver')
  return new ZipArchive()
}

async function openZip(filePath) {
  const unzipper = await import('unzipper')
  return unzipper.Open.file(filePath)
}

/** Asset types that may be uploaded, imported and served. No SVG/HTML: they can carry script. */
export const ASSET_EXT_RE = /\.(png|jpe?g|webp|gif|ttf|otf|woff2?)$/i

/** Zip import limits (zip-bomb protection). */
export const IMPORT_LIMITS = {
  maxEntries: 2000,
  maxProjectJsonBytes: 20 * 1024 * 1024,
  maxTotalBytes: 300 * 1024 * 1024
}

const TOUCH_DEBOUNCE_MS = 5000

/** Maximum length of a project's display name. */
export const PROJECT_NAME_MAX = 120

const registryPath = () => path.join(getDataDir(), 'registry.json')
const projectsDir = () => path.join(getDataDir(), 'projects')
const trashDir = () => path.join(getDataDir(), 'trash')

/* Listeners for registry changes that clients care about (create, rename,
 * duplicate, delete, import, activate). Not fired for updatedAt bumps. */
const projectListeners = new Set()

/** Subscribe to project list changes. Returns an unsubscribe function. */
export function onProjectsChange(fn) {
  projectListeners.add(fn)
  return () => projectListeners.delete(fn)
}

function emitProjectsChanged() {
  for (const fn of projectListeners) {
    try {
      fn()
    } catch (err) {
      console.error('[projects] listener failed:', err)
    }
  }
}

const BLANK_TEMPLATE = structuredClone(BLANK_PROJECT)

// In-memory copy of registry.json. Every write goes through writeRegistry(),
// so the cache stays coherent; it is keyed by path so tests can switch dirs.
let registryCache = null
let registryCachePath = null

function slugify(name) {
  const base = String(name || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40) || 'project'
  return base
}

async function pathExists(p) {
  try {
    await fs.access(p)
    return true
  } catch {
    return false
  }
}

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, '-')
}

/** Move a corrupt file aside (never delete user data). */
export async function quarantineFile(file) {
  const target = `${file}.corrupt-${timestamp()}`
  await renameWithRetry(file, target).catch(() => {})
  return target
}

export async function ensureProjectsLayout() {
  await fs.mkdir(path.join(projectsDir(), 'blank', 'assets'), { recursive: true })
  const projectPath = path.join(projectsDir(), 'blank', 'project.json')
  if (!(await pathExists(projectPath))) {
    await writeJsonAtomic(projectPath, BLANK_TEMPLATE)
  }
  if (!(await pathExists(registryPath()))) {
    const seed = structuredClone(SEED_REGISTRY)
    seed.projects[0].createdAt = new Date().toISOString()
    seed.projects[0].updatedAt = seed.projects[0].createdAt
    await writeRegistry(seed)
  }
}

/** Rebuild registry.json from the project folders on disk. */
async function rebuildRegistry() {
  const entries = await fs.readdir(projectsDir(), { withFileTypes: true }).catch(() => [])
  const projects = []
  const now = new Date().toISOString()
  for (const entry of entries) {
    if (!entry.isDirectory() || !isValidProjectId(entry.name)) continue
    const file = path.join(projectsDir(), entry.name, 'project.json')
    if (!(await pathExists(file))) continue
    let name = entry.name
    try {
      const data = JSON.parse(await fs.readFile(file, 'utf8'))
      if (typeof data?.client?.name === 'string' && data.client.name.trim()) name = data.client.name.trim()
    } catch {
      // keep folder name
    }
    projects.push({ id: entry.name, name, createdAt: now, updatedAt: now })
  }
  if (!projects.some((p) => p.id === 'blank')) {
    projects.unshift({ id: 'blank', name: 'New client', createdAt: now, updatedAt: now })
  }
  return { activeProjectId: 'blank', projects }
}

function isValidRegistry(reg) {
  return isPlainObject(reg) && Array.isArray(reg.projects)
}

export async function readRegistry() {
  const file = registryPath()
  if (registryCache && registryCachePath === file) return structuredClone(registryCache)
  await ensureProjectsLayout()
  let registry
  try {
    registry = JSON.parse(await fs.readFile(file, 'utf8'))
    if (!isValidRegistry(registry)) throw new Error('unexpected shape')
  } catch (err) {
    const moved = await quarantineFile(file)
    console.error(
      `[projects] registry.json is unreadable (${err.message}); moved to ${path.basename(moved)} and rebuilt from project folders`
    )
    registry = await rebuildRegistry()
    await writeJsonAtomic(file, registry)
  }
  const valid = registry.projects.filter((p) => isPlainObject(p) && isValidProjectId(p.id))
  if (valid.length !== registry.projects.length) {
    console.warn(`[projects] ignoring ${registry.projects.length - valid.length} registry entries with an invalid id`)
    registry.projects = valid
  }
  registryCache = registry
  registryCachePath = file
  return structuredClone(registry)
}

async function writeRegistry(registry) {
  await writeJsonAtomic(registryPath(), registry)
  registryCache = structuredClone(registry)
  registryCachePath = registryPath()
}

/** Forget cached registry (tests / data dir switch). */
export function resetProjectsCache() {
  registryCache = null
  registryCachePath = null
  if (touchTimer) clearTimeout(touchTimer)
  touchTimer = null
  touchPendingId = null
}

/**
 * Absolute path of a project folder. Throws on ids that are not plain slugs,
 * and double-checks the resolved path stays inside the projects directory.
 */
export function projectDir(id) {
  if (!isValidProjectId(id)) throw new HttpError(404, 'Project not found')
  const root = path.resolve(projectsDir())
  const dir = path.resolve(root, id)
  if (path.dirname(dir) !== root) throw new HttpError(404, 'Project not found')
  return dir
}

export function projectFile(id) {
  return path.join(projectDir(id), 'project.json')
}

export function assetsDir(id) {
  return path.join(projectDir(id), 'assets')
}

/** True when the project id is a valid slug, exists in the registry and on disk. */
export async function projectExists(id) {
  if (!isValidProjectId(id)) return false
  const registry = await readRegistry()
  if (!registry.projects.some((p) => p.id === id)) return false
  return pathExists(projectFile(id))
}

export async function getActiveProjectId() {
  const registry = await readRegistry()
  return isValidProjectId(registry.activeProjectId) ? registry.activeProjectId : 'blank'
}

export async function getProjectMeta(id) {
  const registry = await readRegistry()
  return registry.projects.find((p) => p.id === id) || null
}

/** Caller must hold the write queue. */
export async function setActiveProjectId(id) {
  const registry = await readRegistry()
  const project = registry.projects.find((p) => p.id === id)
  if (!project) {
    registry.projects.push({
      id,
      name: id === 'blank' ? 'New client' : id,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    })
  } else {
    project.updatedAt = new Date().toISOString()
  }
  registry.activeProjectId = id
  await writeRegistry(registry)
  emitProjectsChanged()
  return registry.projects.find((p) => p.id === id)
}

export async function listProjects() {
  const registry = await readRegistry()
  const activeId = registry.activeProjectId
  return registry.projects.map((p) => ({
    ...p,
    active: p.id === activeId
  }))
}

async function readJsonFile(file) {
  return validateProjectState(JSON.parse(await fs.readFile(file, 'utf8')))
}

/**
 * Read + validate a project's project.json, falling back to the rolling
 * backup (project.json.bak). Returns { data, source: 'main' | 'backup' }.
 */
export async function readProjectData(id) {
  const file = projectFile(id)
  try {
    return { data: await readJsonFile(file), source: 'main' }
  } catch (mainErr) {
    try {
      const data = await readJsonFile(`${file}.bak`)
      return { data, source: 'backup', error: mainErr }
    } catch {
      throw mainErr
    }
  }
}

/**
 * Persist a project's state. Keeps the previous version as project.json.bak.
 * Caller must hold the write queue.
 */
export async function writeProjectData(id, payload) {
  const file = projectFile(id)
  await fs.copyFile(file, `${file}.bak`).catch((err) => {
    if (err.code !== 'ENOENT') console.warn(`[projects] could not back up ${id}: ${err.code}`)
  })
  await writeJsonAtomic(file, payload)
}

// Registry "updatedAt" is cosmetic: write it at most once per TOUCH_DEBOUNCE_MS
// instead of rewriting registry.json on every score tap.
let touchTimer = null
let touchPendingId = null

async function touchProject(id) {
  const registry = await readRegistry()
  const project = registry.projects.find((p) => p.id === id)
  if (!project) return
  project.updatedAt = new Date().toISOString()
  await writeRegistry(registry)
}

export function scheduleTouchProject(id) {
  touchPendingId = id
  if (touchTimer) return
  touchTimer = setTimeout(() => {
    touchTimer = null
    const pending = touchPendingId
    touchPendingId = null
    if (pending) enqueueWrite(() => touchProject(pending)).catch((err) => console.warn(`[projects] touch failed: ${err.message}`))
  }, TOUCH_DEBOUNCE_MS)
  touchTimer.unref?.()
}

/** Write any pending updatedAt bump now (used on shutdown). */
export async function flushTouchProject() {
  if (touchTimer) clearTimeout(touchTimer)
  touchTimer = null
  const pending = touchPendingId
  touchPendingId = null
  if (pending) await enqueueWrite(() => touchProject(pending)).catch(() => {})
}

export async function createProject(name, clientName = '') {
  return enqueueWrite(async () => {
    const registry = await readRegistry()
    const id = await uniqueProjectId(slugify(clientName || name), registry)

    const dir = projectDir(id)
    await fs.mkdir(path.join(dir, 'assets'), { recursive: true })
    const projectData = structuredClone(BLANK_TEMPLATE)
    projectData.client.name = clientName || name
    await writeJsonAtomic(path.join(dir, 'project.json'), projectData)

    const entry = {
      id,
      name,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }
    registry.projects.push(entry)
    await writeRegistry(registry)
    emitProjectsChanged()
    return entry
  })
}

/** Validate a display name from a request body. */
export function normalizeProjectName(value, { required = true } = {}) {
  if (value === undefined || value === null) {
    if (required) throw badRequest('Name is required')
    return ''
  }
  if (typeof value !== 'string') throw badRequest('name: expected a string')
  const name = value.replace(/\s+/g, ' ').trim()
  if (!name && required) throw badRequest('Name is required')
  if (name.length > PROJECT_NAME_MAX) throw badRequest(`Name is too long (max ${PROJECT_NAME_MAX} characters)`)
  return name
}

/** Registry entry for `id`, or a 404. */
function requireEntry(registry, id) {
  if (!isValidProjectId(id)) throw new HttpError(404, 'Project not found')
  const entry = registry.projects.find((p) => p.id === id)
  if (!entry) throw new HttpError(404, 'Project not found')
  return entry
}

/**
 * Rename a project (display name only; the id and folder stay).
 * Caller must hold the write queue (see state.renameProject, which also
 * notifies socket clients when the active project is renamed).
 */
export async function renameProjectEntry(id, rawName) {
  const name = normalizeProjectName(rawName)
  const registry = await readRegistry()
  const entry = requireEntry(registry, id)
  entry.name = name
  entry.updatedAt = new Date().toISOString()
  await writeRegistry(registry)
  emitProjectsChanged()
  return { ...entry, active: registry.activeProjectId === id }
}

/**
 * Copy a project (validated project.json, allow-listed assets, custom.css)
 * to a new unique id. The copy is built in a staging folder and only renamed
 * into place when complete. The new project is not activated.
 */
export async function duplicateProject(id, rawName) {
  return enqueueWrite(async () => {
    const registry = await readRegistry()
    const source = requireEntry(registry, id)
    const name = normalizeProjectName(rawName, { required: false }) || copyName(source.name, registry)
    let data
    try {
      data = (await readProjectData(id)).data
    } catch (err) {
      if (err?.code === 'ENOENT') throw new HttpError(404, 'Project not found')
      throw new HttpError(422, `Project "${source.name}" cannot be read, so it cannot be duplicated`)
    }

    let staging = path.join(projectsDir(), `.duplicate-${crypto.randomUUID()}`)
    try {
      await fs.mkdir(path.join(staging, 'assets'), { recursive: true })
      const { projectId: _id, serverNow: _now, ...payload } = data
      await writeJsonAtomic(path.join(staging, 'project.json'), payload)

      const srcAssets = assetsDir(id)
      const files = await fs.readdir(srcAssets).catch(() => [])
      for (const file of files) {
        if (!ASSET_EXT_RE.test(file) || file.startsWith('.')) continue
        const from = path.join(srcAssets, file)
        const stat = await fs.lstat(from).catch(() => null)
        if (!stat?.isFile()) continue
        await fs.copyFile(from, path.join(staging, 'assets', file))
      }
      const css = await readCustomCss(id)
      if (css) await writeFileAtomic(path.join(staging, CUSTOM_CSS_FILENAME), css)

      const newId = await uniqueProjectId(slugify(name), registry)
      await renameWithRetry(staging, projectDir(newId))
      staging = null

      const now = new Date().toISOString()
      const entry = { id: newId, name, createdAt: now, updatedAt: now }
      registry.projects.push(entry)
      await writeRegistry(registry)
      emitProjectsChanged()
      return { ...entry, active: false }
    } finally {
      if (staging) await fs.rm(staging, { recursive: true, force: true }).catch(() => {})
    }
  })
}

/** "Name copy", "Name copy 2", … (first one not used by another project). */
/**
 * Display name for an imported project: the archive's own name, or with
 * " (imported)" / " (imported 2)" … appended when a project already has that
 * name (case-insensitive), so the project menu never lists two the same.
 */
export function importedName(base, registry) {
  const key = (name) => String(name || '').replace(/\s+/g, ' ').trim().toLowerCase()
  const clean = String(base || '').replace(/\s+/g, ' ').trim().slice(0, PROJECT_NAME_MAX) || 'Imported project'
  const taken = new Set(registry.projects.map((p) => key(p.name)))
  if (!taken.has(key(clean))) return clean
  const stem = clean.slice(0, PROJECT_NAME_MAX - 16).trim()
  const first = `${stem} (imported)`
  if (!taken.has(key(first))) return first
  for (let n = 2; ; n++) {
    const candidate = `${stem} (imported ${n})`
    if (!taken.has(key(candidate))) return candidate
  }
}

function copyName(base, registry) {
  const names = new Set(registry.projects.map((p) => p.name))
  const first = `${base} copy`.slice(0, PROJECT_NAME_MAX)
  if (!names.has(first)) return first
  for (let n = 2; ; n++) {
    const candidate = `${base.slice(0, PROJECT_NAME_MAX - 12)} copy ${n}`
    if (!names.has(candidate)) return candidate
  }
}

/**
 * Delete a project by moving its folder to <dataDir>/trash/<id>-<timestamp>
 * (never a hard delete). Refuses the active project and the last project.
 */
export async function deleteProject(id) {
  return enqueueWrite(async () => {
    const registry = await readRegistry()
    const entry = requireEntry(registry, id)
    if (registry.projects.length <= 1) {
      throw new HttpError(409, 'The last project cannot be deleted.')
    }
    if (registry.activeProjectId === id) {
      throw new HttpError(
        409,
        `"${entry.name}" is the active project. Activate another project before deleting it.`
      )
    }
    const dir = projectDir(id)
    let trashedTo = null
    if (await pathExists(dir)) {
      await fs.mkdir(trashDir(), { recursive: true })
      trashedTo = path.join(trashDir(), `${id}-${timestamp()}`)
      await renameWithRetry(dir, trashedTo)
    }
    registry.projects = registry.projects.filter((p) => p.id !== id)
    try {
      await writeRegistry(registry)
    } catch (err) {
      // Put the folder back so the registry and the disk stay consistent.
      if (trashedTo) await renameWithRetry(trashedTo, dir).catch(() => {})
      throw err
    }
    emitProjectsChanged()
    return { ok: true, id, trash: trashedTo ? path.basename(trashedTo) : null }
  })
}

/* ----------------------------------------------------------- custom CSS */

export function customCssFile(id) {
  return path.join(projectDir(id), CUSTOM_CSS_FILENAME)
}

/** A project's custom CSS ('' when it has none). */
export async function readCustomCss(id) {
  try {
    return await fs.readFile(customCssFile(id), 'utf8')
  } catch (err) {
    if (err.code === 'ENOENT') return ''
    throw err
  }
}

/** Version hash of a project's custom CSS ('' when it has none or it is unreadable). */
export async function readCustomCssVersion(id) {
  return customCssVersion(await readCustomCss(id).catch(() => ''))
}

/**
 * Validate, sanitize and store a project's custom CSS. An empty stylesheet
 * removes the file. The previous version is kept as custom.css.bak.
 * Caller must hold the write queue (see state.saveCustomCss).
 * Returns { version, bytes, removedImports }.
 */
export async function writeCustomCss(id, raw) {
  if (typeof raw !== 'string') throw badRequest('css: expected a string')
  if (!(await projectExists(id))) throw new HttpError(404, 'Project not found')
  const { css, removedImports } = sanitizeCustomCss(raw)
  const bytes = Buffer.byteLength(css, 'utf8')
  if (bytes > CUSTOM_CSS_MAX_BYTES) {
    throw new HttpError(413, `Custom CSS is too large (max ${Math.round(CUSTOM_CSS_MAX_BYTES / 1024)} KB)`)
  }
  const file = customCssFile(id)
  await fs.copyFile(file, `${file}.bak`).catch((err) => {
    if (err.code !== 'ENOENT') console.warn(`[projects] could not back up custom.css of ${id}: ${err.code}`)
  })
  const empty = !css.trim()
  if (empty) {
    await fs.rm(file, { force: true })
  } else {
    await writeFileAtomic(file, css)
  }
  return { version: empty ? '' : customCssVersion(css), bytes: empty ? 0 : bytes, removedImports }
}

export async function saveAsset(projectId, filename, buffer) {
  if (!(await projectExists(projectId))) throw new HttpError(404, 'Project not found')
  const safe = path.basename(String(filename || '')).replace(/[^a-zA-Z0-9._-]/g, '_')
  if (!ASSET_EXT_RE.test(safe) || safe.startsWith('.')) {
    throw badRequest('Unsupported file type. Allowed: png, jpg, jpeg, webp, gif, ttf, otf, woff, woff2')
  }
  const dir = assetsDir(projectId)
  await fs.mkdir(dir, { recursive: true })
  await fs.writeFile(path.join(dir, safe), buffer)
  return safe
}

export async function listAssets(projectId) {
  if (!(await projectExists(projectId))) throw new HttpError(404, 'Project not found')
  const dir = assetsDir(projectId)
  const entries = await fs.readdir(dir).catch(() => [])
  const files = entries.filter((f) => ASSET_EXT_RE.test(f) && !f.startsWith('.'))
  return Promise.all(
    files.map(async (filename) => {
      const stat = await fs.stat(path.join(dir, filename)).catch(() => null)
      return {
        filename,
        size: stat?.size || 0,
        url: `/projects/${projectId}/assets/${encodeURIComponent(filename)}`
      }
    })
  )
}

export async function exportProjectToZip(projectId, res) {
  const meta = await getProjectMeta(projectId)
  if (!meta || !(await projectExists(projectId))) {
    throw new HttpError(404, 'Project not found')
  }

  const filename = `${slugify(meta.name)}.proverlay`
  res.setHeader('Content-Type', 'application/zip')
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)

  const archive = await createZipArchive()
  archive.on('warning', (err) => console.warn(`[export] ${err.message}`))
  archive.on('error', (err) => {
    // Never throw from an emitter callback: that would crash the process.
    console.error(`[export] ${projectId} failed: ${err.message}`)
    res.destroy(err)
  })
  archive.pipe(res)

  archive.append(
    JSON.stringify({ id: meta.id, name: meta.name, exportedAt: new Date().toISOString() }, null, 2),
    { name: 'manifest.json' }
  )
  archive.file(projectFile(projectId), { name: 'project.json' })
  const css = await readCustomCss(projectId)
  if (css) archive.append(css, { name: CUSTOM_CSS_FILENAME })

  const assets = assetsDir(projectId)
  if (await pathExists(assets)) {
    const files = await fs.readdir(assets)
    for (const file of files) {
      if (!ASSET_EXT_RE.test(file) || file.startsWith('.')) continue
      archive.file(path.join(assets, file), { name: `assets/${file}` })
    }
  }

  await archive.finalize()
}

async function readEntryLimited(entry, limit, label = 'project.json') {
  const chunks = []
  let size = 0
  for await (const chunk of entry.stream()) {
    size += chunk.length
    if (size > limit) throw badRequest(`Invalid file: ${label} is too large`)
    chunks.push(chunk)
  }
  return Buffer.concat(chunks)
}

function byteLimiter(budget) {
  return new Transform({
    transform(chunk, _enc, cb) {
      budget.used += chunk.length
      if (budget.used > budget.max) {
        cb(badRequest('Invalid file: archive expands beyond the size limit'))
        return
      }
      cb(null, chunk)
    }
  })
}

/**
 * Import a .proverlay archive as a new (inactive) project. Everything is
 * validated and extracted into a staging folder first; only a complete,
 * valid project is renamed into place and added to the registry.
 */
export async function importProjectFromZip(tempPath, originalName = 'import.proverlay') {
  return enqueueWrite(async () => {
    let staging = null
    try {
      let directory
      try {
        directory = await openZip(tempPath)
      } catch {
        throw badRequest('Invalid file: not a .proverlay archive')
      }
      const files = directory.files || []
      if (files.length > IMPORT_LIMITS.maxEntries) {
        throw badRequest(`Invalid file: too many entries (max ${IMPORT_LIMITS.maxEntries})`)
      }
      const declared = files.reduce((sum, f) => sum + (Number(f.uncompressedSize) || 0), 0)
      if (declared > IMPORT_LIMITS.maxTotalBytes) {
        throw badRequest('Invalid file: archive expands beyond the size limit')
      }

      const manifestEntry = files.find((f) => f.path === 'manifest.json')
      const projectEntry = files.find((f) => f.path === 'project.json')
      const cssEntry = files.find((f) => f.path === CUSTOM_CSS_FILENAME && f.type === 'File')
      if (!projectEntry) throw badRequest('Invalid file: project.json missing')

      let projectData
      try {
        const buf = await readEntryLimited(projectEntry, IMPORT_LIMITS.maxProjectJsonBytes)
        projectData = JSON.parse(buf.toString('utf8'))
      } catch (err) {
        if (err instanceof HttpError) throw err
        throw badRequest('Invalid file: project.json is not valid JSON')
      }
      try {
        projectData = validateProjectState(projectData)
      } catch (err) {
        throw badRequest(`Invalid file: ${err.message}`)
      }

      let suggestedName = String(originalName || 'import')
        .replace(/\.proverlay$/i, '')
        .replace(/\.zip$/i, '')
      if (manifestEntry) {
        try {
          const buf = await readEntryLimited(manifestEntry, 1024 * 1024, 'manifest.json')
          const manifest = JSON.parse(buf.toString('utf8'))
          if (typeof manifest?.name === 'string' && manifest.name.trim()) {
            suggestedName = manifest.name.trim().slice(0, 120)
          }
        } catch {
          // Manifest is optional metadata; ignore a broken one.
        }
      }

      staging = path.join(projectsDir(), `.import-${crypto.randomUUID()}`)
      await fs.mkdir(path.join(staging, 'assets'), { recursive: true })
      await writeJsonAtomic(path.join(staging, 'project.json'), projectData)

      if (cssEntry) {
        let rawCss
        try {
          rawCss = (await readEntryLimited(cssEntry, CUSTOM_CSS_MAX_BYTES, 'custom.css')).toString('utf8')
        } catch (err) {
          if (err instanceof HttpError) throw err
          throw badRequest('Invalid file: custom.css could not be read')
        }
        const { css } = sanitizeCustomCss(rawCss)
        if (css.trim()) await writeFileAtomic(path.join(staging, CUSTOM_CSS_FILENAME), css)
      }

      const budget = { used: 0, max: IMPORT_LIMITS.maxTotalBytes }
      for (const file of files) {
        if (file.type !== 'File' || !file.path.startsWith('assets/')) continue
        const name = path.basename(file.path)
        if (!ASSET_EXT_RE.test(name) || name.startsWith('.')) continue
        await pipeline(
          file.stream(),
          byteLimiter(budget),
          createWriteStream(path.join(staging, 'assets', name))
        )
      }

      const registry = await readRegistry()
      const name = importedName(suggestedName, registry)
      const id = await uniqueProjectId(slugify(name), registry)
      await renameWithRetry(staging, projectDir(id))
      staging = null

      const entry = {
        id,
        name,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
      registry.projects.push(entry)
      await writeRegistry(registry)
      emitProjectsChanged()
      return entry
    } catch (err) {
      if (err instanceof HttpError) throw err
      // Do not leak filesystem paths to the client.
      console.error(`[import] failed: ${err.message}`)
      throw badRequest('Import failed: the file is damaged or not a ProVerlay project')
    } finally {
      if (staging) await fs.rm(staging, { recursive: true, force: true }).catch(() => {})
    }
  })
}

/** First free id: not in the registry and no folder of that name on disk. */
async function uniqueProjectId(base, registry) {
  const root = isValidProjectId(base) ? base : 'project'
  let id = root
  let n = 1
  while (registry.projects.some((p) => p.id === id) || (await pathExists(projectDir(id)))) {
    id = `${root}-${n++}`
  }
  return id
}
