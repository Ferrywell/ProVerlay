import fs from 'fs/promises'
import { createWriteStream } from 'fs'
import { Transform } from 'stream'
import { pipeline } from 'stream/promises'
import path from 'path'
import crypto from 'crypto'
import { BLANK_PROJECT, SEED_REGISTRY } from './projectSeed.js'
import { getDataDir } from './paths.js'
import { enqueueWrite, writeJsonAtomic, renameWithRetry } from './writeQueue.js'
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

const registryPath = () => path.join(getDataDir(), 'registry.json')
const projectsDir = () => path.join(getDataDir(), 'projects')

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
    return entry
  })
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

async function readEntryLimited(entry, limit) {
  const chunks = []
  let size = 0
  for await (const chunk of entry.stream()) {
    size += chunk.length
    if (size > limit) throw badRequest('Invalid file: project.json is too large')
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
          const buf = await readEntryLimited(manifestEntry, 1024 * 1024)
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
      const id = await uniqueProjectId(slugify(suggestedName), registry)
      await renameWithRetry(staging, projectDir(id))
      staging = null

      const entry = {
        id,
        name: suggestedName,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
      registry.projects.push(entry)
      await writeRegistry(registry)
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
