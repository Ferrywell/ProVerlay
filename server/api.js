import express from 'express'
import multer from 'multer'
import fs from 'fs/promises'
import os from 'os'
import path from 'path'
import crypto from 'crypto'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import {
  getState,
  patchState,
  getGraphic,
  patchGraphic,
  setGraphicVisibility,
  setGraphicSoloVisibility,
  addGraphic,
  removeGraphic,
  listBrands,
  applyBrand,
  activateProject,
  renameProject,
  saveCustomCss,
  applyScore,
  applyClock
} from './state.js'
import { detectDevice } from './device.js'
import { buildNetworkUrls } from './network.js'
import {
  listProjects,
  createProject,
  getActiveProjectId,
  exportProjectToZip,
  importProjectFromZip,
  saveAsset,
  listAssets,
  duplicateProject,
  deleteProject,
  projectExists,
  readCustomCss
} from './projects.js'
import { CUSTOM_CSS_MAX_BYTES, customCssVersion } from './customCss.js'
import { analyzeImageBuffer, buildGraphicDataFromCompose } from './composeAnalyze.js'
import { createGraphicFromType } from './graphicDefaults.js'
import { getLiveSnapshot, importDriversOnce } from './f1Timing.js'
import {
  addLowerThirdEntry,
  updateLowerThirdEntry,
  deleteLowerThirdEntry,
  showLowerThirdEntry,
  hideLowerThirdShow
} from './lowerThirdEntries.js'
import { HttpError, badRequest, isPlainObject, isValidProjectId } from './validation.js'

const execFileAsync = promisify(execFile)
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } })

/**
 * Express 4 does not catch rejected promises from async handlers; an
 * unhandled rejection used to take the whole server down. Every handler
 * registered on the router is wrapped so errors reach the error middleware.
 */
export function wrapAsync(fn) {
  if (typeof fn !== 'function' || fn.length === 4) return fn
  return function asyncHandler(req, res, next) {
    try {
      const result = fn(req, res, next)
      if (result && typeof result.then === 'function') result.catch(next)
    } catch (err) {
      next(err)
    }
  }
}

function asyncRouter() {
  const router = express.Router()
  for (const method of ['get', 'post', 'put', 'patch', 'delete']) {
    const original = router[method].bind(router)
    router[method] = (routePath, ...handlers) => original(routePath, ...handlers.flat().map(wrapAsync))
  }
  return router
}

/** Optional trimmed string field from a JSON body. */
function optionalString(body, key, { max = 200 } = {}) {
  const value = body?.[key]
  if (value === undefined || value === null) return ''
  if (typeof value !== 'string') throw badRequest(`${key}: expected a string`)
  return value.trim().slice(0, max)
}

function jsonBody(req) {
  const body = req.body === undefined ? {} : req.body
  if (!isPlainObject(body)) throw badRequest('Body must be a JSON object')
  return body
}

function requireProjectId(id) {
  if (!isValidProjectId(id)) throw new HttpError(404, 'Project not found')
  return id
}

function requireGraphic(id) {
  const graphic = getGraphic(id)
  if (!graphic) throw new HttpError(404, 'Graphic not found')
  return graphic
}

export function createApiRouter({ getPort = () => Number(process.env.PORT || 2014) } = {}) {
  const router = asyncRouter()

  router.get('/device', (req, res) => {
    const device = detectDevice(req.headers['user-agent'] || '')
    res.json({ device, userAgent: req.headers['user-agent'] || '' })
  })

  router.get('/network', (_req, res) => {
    res.json(buildNetworkUrls(getPort()))
  })

  /* ------------------------------------------------------------ projects */

  router.get('/projects', async (_req, res) => {
    res.json(await listProjects())
  })

  router.post('/projects', async (req, res) => {
    const body = jsonBody(req)
    const name = optionalString(body, 'name', { max: 120 })
    if (!name) return res.status(400).json({ error: 'Name is required' })
    const clientName = optionalString(body, 'clientName', { max: 120 }) || name
    const project = await createProject(name, clientName)
    res.status(201).json(project)
  })

  router.post('/projects/:id/activate', async (req, res) => {
    const project = await activateProject(req.params.id)
    if (!project) return res.status(404).json({ error: 'Project not found' })
    res.json({ ...project, state: getState() })
  })

  router.get('/projects/active/export', async (_req, res) => {
    const id = await getActiveProjectId()
    await exportProjectToZip(id, res)
  })

  router.post('/projects/import', upload.single('file'), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file received' })
    const temp = path.join(os.tmpdir(), `proverlay-import-${crypto.randomUUID()}.zip`)
    try {
      await fs.writeFile(temp, req.file.buffer)
      // Import never activates: the operator decides when to switch
      // (switching projects during a live show must be a deliberate action).
      const project = await importProjectFromZip(temp, req.file.originalname)
      res.status(201).json(project)
    } finally {
      await fs.unlink(temp).catch(() => {})
    }
  })

  /** Rename: { name } changes the display name; the id (and folder) stay. */
  router.patch('/projects/:id', async (req, res) => {
    const id = requireProjectId(req.params.id)
    const body = jsonBody(req)
    res.json(await renameProject(id, body.name))
  })

  /** Copy project.json, assets and custom.css to a new project: { name? }. */
  router.post('/projects/:id/duplicate', async (req, res) => {
    const id = requireProjectId(req.params.id)
    const body = jsonBody(req)
    res.status(201).json(await duplicateProject(id, body.name))
  })

  /** Moves the folder to <dataDir>/trash/. 409 for the active or the last project. */
  router.delete('/projects/:id', async (req, res) => {
    const id = requireProjectId(req.params.id)
    res.json(await deleteProject(id))
  })

  router.get('/projects/:id/custom-css', async (req, res) => {
    const id = requireProjectId(req.params.id)
    if (!(await projectExists(id))) throw new HttpError(404, 'Project not found')
    const css = await readCustomCss(id)
    res.json({ css, version: customCssVersion(css), maxBytes: CUSTOM_CSS_MAX_BYTES })
  })

  /** Save custom CSS: { css }. Empty string removes it. @import statements are stripped. */
  router.put('/projects/:id/custom-css', async (req, res) => {
    const id = requireProjectId(req.params.id)
    const body = jsonBody(req)
    const result = await saveCustomCss(id, body.css)
    res.json({ ...result, maxBytes: CUSTOM_CSS_MAX_BYTES })
  })

  router.get('/projects/:id/assets', async (req, res) => {
    res.json(await listAssets(requireProjectId(req.params.id)))
  })

  router.post('/projects/:id/assets', upload.single('file'), async (req, res) => {
    const id = requireProjectId(req.params.id)
    if (!req.file) return res.status(400).json({ error: 'No file received' })
    const filename = await saveAsset(id, req.file.originalname, req.file.buffer)
    res.json({ filename, url: `/projects/${id}/assets/${encodeURIComponent(filename)}` })
  })

  router.post('/projects/:id/analyze-image', upload.single('file'), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No PNG received' })
    const allowedTypes = ['image/png', 'image/webp']
    if (!allowedTypes.includes(req.file.mimetype)) {
      return res.status(400).json({ error: 'Only PNG and WebP are supported' })
    }
    try {
      const widgetType = typeof req.body?.widgetType === 'string' ? req.body.widgetType : 'matchScoreboard'
      const result = await analyzeImageBuffer(req.file.buffer, { widgetType })
      res.json(result)
    } catch (err) {
      res.status(400).json({ error: err.message || 'Analysis failed' })
    }
  })

  router.post('/projects/:id/compose-widget', async (req, res) => {
    const body = jsonBody(req)
    const type = body.type
    const name = optionalString(body, 'name') || 'New widget'
    if (!type) return res.status(400).json({ error: 'Type is required' })
    if (typeof body.filename !== 'string' || !body.filename) {
      return res.status(400).json({ error: 'PNG file missing' })
    }
    if (path.basename(body.filename) !== body.filename) throw badRequest('filename: invalid')

    const graphic = createGraphicFromType(type, name)
    try {
      graphic.data = buildGraphicDataFromCompose({
        widgetType: type,
        name,
        filename: body.filename,
        width: Number(body.width) || 1920,
        height: Number(body.height) || 1080,
        regions: Array.isArray(body.regions) ? body.regions : [],
        placement: isPlainObject(body.placement) ? body.placement : undefined,
        designFrameWidth: Number(body.designFrameWidth) || 3840
      })
    } catch (err) {
      throw badRequest(err.message || 'Failed to create widget')
    }

    await addGraphic(graphic)
    res.status(201).json({ graphic, state: getState() })
  })

  /* --------------------------------------------------------------- state */

  router.get('/state', (_req, res) => {
    res.json(getState())
  })

  router.patch('/state', async (req, res) => {
    res.json(await patchState(req.body))
  })

  router.get('/brands', async (_req, res) => {
    res.json(await listBrands())
  })

  router.post('/brands/:id/apply', async (req, res) => {
    res.json(await applyBrand(req.params.id))
  })

  /* ------------------------------------------------------------ graphics */

  router.get('/graphics', (_req, res) => {
    res.json(getState().graphics)
  })

  router.post('/graphics', async (req, res) => {
    const body = jsonBody(req)
    const type = body.type
    const name = optionalString(body, 'name') || 'New widget'
    if (!type) return res.status(400).json({ error: 'Type is required' })
    const graphic = createGraphicFromType(type, name)
    await addGraphic(graphic)
    res.status(201).json(graphic)
  })

  router.get('/graphics/:id', (req, res) => {
    res.json(requireGraphic(req.params.id))
  })

  router.patch('/graphics/:id', async (req, res) => {
    const graphic = await patchGraphic(req.params.id, req.body)
    if (!graphic) return res.status(404).json({ error: 'Graphic not found' })
    res.json(graphic)
  })

  router.delete('/graphics/:id', async (req, res) => {
    const next = await removeGraphic(req.params.id)
    if (!next) return res.status(404).json({ error: 'Graphic not found' })
    res.json({ ok: true, state: getState() })
  })

  router.post('/graphics/:id/hide', async (req, res) => {
    const graphic = requireGraphic(req.params.id)
    const next =
      graphic.type === 'lowerThirdShow'
        ? await hideLowerThirdShow(req.params.id)
        : await setGraphicVisibility(req.params.id, false)
    if (!next) return res.status(404).json({ error: 'Graphic not found' })
    res.json(next)
  })

  router.post('/graphics/:id/toggle', async (req, res) => {
    const body = jsonBody(req)
    // Without `visible` the flip is computed inside the write queue.
    const graphic = await setGraphicVisibility(
      req.params.id,
      body.visible !== undefined ? Boolean(body.visible) : undefined
    )
    if (!graphic) return res.status(404).json({ error: 'Graphic not found' })
    res.json(graphic)
  })

  router.post('/graphics/:id/toggle-solo', async (req, res) => {
    const body = jsonBody(req)
    const graphic = await setGraphicSoloVisibility(
      req.params.id,
      body.soloVisible !== undefined ? Boolean(body.soloVisible) : undefined
    )
    if (!graphic) return res.status(404).json({ error: 'Graphic not found' })
    res.json(graphic)
  })

  /** Atomic score change: { side: 'home'|'away', delta?: int (default 1) } or { side, value }. */
  router.post('/graphics/:id/score', async (req, res) => {
    const graphic = await applyScore(req.params.id, jsonBody(req))
    if (!graphic) return res.status(404).json({ error: 'Graphic not found' })
    res.json(graphic)
  })

  /** Atomic clock action: { action: start|pause|toggle|reset|adjust|set, ms? }. */
  router.post('/graphics/:id/clock', async (req, res) => {
    const graphic = await applyClock(req.params.id, jsonBody(req))
    if (!graphic) return res.status(404).json({ error: 'Graphic not found' })
    res.json(graphic)
  })

  /* ---------------------------------------------------- lower third show */

  router.get('/graphics/:id/entries', (req, res) => {
    const graphic = getGraphic(req.params.id)
    if (!graphic || graphic.type !== 'lowerThirdShow') {
      return res.status(404).json({ error: 'Lower thirds widget not found' })
    }
    res.json(graphic.data?.entries || [])
  })

  router.post('/graphics/:id/entries', async (req, res) => {
    const entry = await addLowerThirdEntry(req.params.id, jsonBody(req))
    if (!entry) return res.status(404).json({ error: 'Lower thirds widget not found' })
    res.status(201).json({ entry, graphic: getGraphic(req.params.id) })
  })

  router.patch('/graphics/:id/entries/:entryId', async (req, res) => {
    const entry = await updateLowerThirdEntry(req.params.id, req.params.entryId, jsonBody(req))
    if (!entry) return res.status(404).json({ error: 'Entry not found' })
    res.json({ entry, graphic: getGraphic(req.params.id) })
  })

  router.delete('/graphics/:id/entries/:entryId', async (req, res) => {
    const result = await deleteLowerThirdEntry(req.params.id, req.params.entryId)
    if (!result) return res.status(404).json({ error: 'Entry not found' })
    res.json({ ok: true, graphic: getGraphic(req.params.id) })
  })

  router.post('/graphics/:id/entries/:entryId/show', async (req, res) => {
    const graphic = await showLowerThirdEntry(req.params.id, req.params.entryId)
    if (!graphic) return res.status(404).json({ error: 'Entry not found' })
    res.json(graphic)
  })

  /* ------------------------------------------------------------------ F1 */

  router.get('/f1/:id/live', (req, res) => {
    const snapshot = getLiveSnapshot(req.params.id)
    if (!snapshot) return res.status(404).json({ error: 'F1 timing graphic not found' })
    res.json(snapshot)
  })

  router.post('/f1/:id/import-drivers', async (req, res) => {
    const result = await importDriversOnce(req.params.id)
    res.status(result.status).json(result.body)
  })

  /** Try to open MultiViewer locally (macOS/Windows/Linux); otherwise return the download URL. */
  router.post('/system/open-multiviewer', async (_req, res) => {
    const downloadUrl = 'https://multiviewer.app'
    try {
      if (process.platform === 'darwin') {
        await execFileAsync('open', ['-a', 'MultiViewer'])
      } else if (process.platform === 'win32') {
        await execFileAsync('cmd', ['/c', 'start', '', 'multiviewer://'], {
          windowsHide: true
        })
      } else {
        await execFileAsync('xdg-open', ['multiviewer://'])
      }
      res.json({ ok: true, opened: true })
    } catch {
      res.json({ ok: false, opened: false, url: downloadUrl })
    }
  })

  return router
}
