import fs from 'fs/promises'
import path from 'path'
import { BLANK_PROJECT, SEED_REGISTRY } from './projectSeed.js'
import { DATA_DIR } from './paths.js'
import { enqueueWrite, writeJsonAtomic } from './writeQueue.js'
async function createZipArchive() {
  const { ZipArchive } = await import('archiver')
  return new ZipArchive()
}

async function openZip(filePath) {
  const unzipper = await import('unzipper')
  return unzipper.Open.file(filePath)
}

const REGISTRY_PATH = path.join(DATA_DIR, 'registry.json')
const PROJECTS_DIR = path.join(DATA_DIR, 'projects')

const BLANK_TEMPLATE = structuredClone(BLANK_PROJECT)

function slugify(name) {
  const base = name
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

export async function ensureProjectsLayout() {
  await fs.mkdir(path.join(PROJECTS_DIR, 'blank', 'assets'), { recursive: true })
  const projectPath = path.join(PROJECTS_DIR, 'blank', 'project.json')
  if (!(await pathExists(projectPath))) {
    await fs.writeFile(projectPath, JSON.stringify(BLANK_TEMPLATE, null, 2))
  }
  if (!(await pathExists(REGISTRY_PATH))) {
    const seed = structuredClone(SEED_REGISTRY)
    seed.projects[0].createdAt = new Date().toISOString()
    seed.projects[0].updatedAt = seed.projects[0].createdAt
    await fs.writeFile(REGISTRY_PATH, JSON.stringify(seed, null, 2))
  }
}

export async function readRegistry() {
  await ensureProjectsLayout()
  const raw = await fs.readFile(REGISTRY_PATH, 'utf8')
  return JSON.parse(raw)
}

async function writeRegistry(registry) {
  await writeJsonAtomic(REGISTRY_PATH, registry)
}

/** True when the project id exists in the registry (and on disk). */
export async function projectExists(id) {
  const registry = await readRegistry()
  if (!registry.projects.some((p) => p.id === id)) return false
  return pathExists(projectFile(id))
}

export function projectDir(id) {
  return path.join(PROJECTS_DIR, id)
}

export function projectFile(id) {
  return path.join(projectDir(id), 'project.json')
}

export function assetsDir(id) {
  return path.join(projectDir(id), 'assets')
}

export async function getActiveProjectId() {
  const registry = await readRegistry()
  return registry.activeProjectId || 'blank'
}

export async function listProjects() {
  const registry = await readRegistry()
  const activeId = registry.activeProjectId
  return registry.projects.map((p) => ({
    ...p,
    active: p.id === activeId
  }))
}

export async function createProject(name, clientName = '') {
  return enqueueWrite(async () => {
    const registry = await readRegistry()
    let id = slugify(clientName || name)
    let suffix = 1
    while (registry.projects.some((p) => p.id === id)) {
      id = `${slugify(name)}-${suffix++}`
    }

    const dir = projectDir(id)
    await fs.mkdir(path.join(dir, 'assets'), { recursive: true })
    const projectData = structuredClone(BLANK_TEMPLATE)
    projectData.client.name = clientName || name.trim()
    await writeJsonAtomic(path.join(dir, 'project.json'), projectData)

    const entry = {
      id,
      name: name.trim(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }
    registry.projects.push(entry)
    await writeRegistry(registry)
    return entry
  })
}

export async function activateProject(id) {
  return enqueueWrite(async () => {
    const registry = await readRegistry()
    const project = registry.projects.find((p) => p.id === id)
    if (!project) return null
    if (!(await pathExists(projectFile(id)))) return null

    registry.activeProjectId = id
    project.updatedAt = new Date().toISOString()
    await writeRegistry(registry)
    return project
  })
}

export async function touchActiveProject() {
  // Caller (saveState) already holds the write queue; keep this sync with registry.
  const registry = await readRegistry()
  const project = registry.projects.find((p) => p.id === registry.activeProjectId)
  if (project) {
    project.updatedAt = new Date().toISOString()
    await writeRegistry(registry)
  }
}

export async function saveAsset(projectId, filename, buffer) {
  if (!(await projectExists(projectId))) {
    throw Object.assign(new Error('Project not found'), { status: 404 })
  }
  const safe = path.basename(filename).replace(/[^a-zA-Z0-9._-]/g, '_')
  const dir = assetsDir(projectId)
  await fs.mkdir(dir, { recursive: true })
  const dest = path.join(dir, safe)
  await fs.writeFile(dest, buffer)
  return safe
}

export async function exportProjectToZip(projectId, res) {
  const registry = await readRegistry()
  const meta = registry.projects.find((p) => p.id === projectId)
  if (!meta || !(await pathExists(projectFile(projectId)))) {
    throw new Error('Project not found')
  }

  const filename = `${slugify(meta.name)}.proverlay`
  res.setHeader('Content-Type', 'application/zip')
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)

  const archive = await createZipArchive()
  archive.on('error', (err) => {
    throw err
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
      archive.file(path.join(assets, file), { name: `assets/${file}` })
    }
  }

  await archive.finalize()
}

export async function importProjectFromZip(tempPath, originalName = 'import.proverlay') {
  return enqueueWrite(async () => {
    const registry = await readRegistry()
    const directory = await openZip(tempPath)

    const manifestEntry = directory.files.find((f) => f.path === 'manifest.json')
    const projectEntry = directory.files.find((f) => f.path === 'project.json')
    if (!projectEntry) throw new Error('Invalid file: project.json missing')

    let suggestedName = originalName.replace(/\.proverlay$/i, '').replace(/\.zip$/i, '')
    if (manifestEntry) {
      const manifest = JSON.parse((await manifestEntry.buffer()).toString('utf8'))
      if (manifest.name) suggestedName = manifest.name
    }

    const id = await uniqueProjectId(slugify(suggestedName), registry)
    const dir = projectDir(id)
    await fs.mkdir(path.join(dir, 'assets'), { recursive: true })

    const projectBuffer = await projectEntry.buffer()
    await fs.writeFile(path.join(dir, 'project.json'), projectBuffer)

    for (const file of directory.files) {
      if (file.path.startsWith('assets/') && file.type === 'File') {
        const name = path.basename(file.path)
        const buf = await file.buffer()
        await fs.writeFile(path.join(dir, 'assets', name), buf)
      }
    }

    const entry = {
      id,
      name: suggestedName,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }
    registry.projects.push(entry)
    await writeRegistry(registry)
    return entry
  })
}

async function uniqueProjectId(base, registry) {
  let id = base || 'project'
  let n = 1
  while (registry.projects.some((p) => p.id === id)) {
    id = `${base}-${n++}`
  }
  return id
}
