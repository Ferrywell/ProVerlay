import express from 'express'
import multer from 'multer'
import fs from 'fs/promises'
import os from 'os'
import path from 'path'
import {
  getState,
  patchState,
  getGraphic,
  patchGraphic,
  setGraphicVisibility,
  addGraphic,
  removeGraphic,
  listBrands,
  applyBrand,
  reloadState
} from './state.js'
import { detectDevice } from './device.js'
import { buildNetworkUrls } from './network.js'
import {
  listProjects,
  createProject,
  activateProject,
  getActiveProjectId,
  exportProjectToZip,
  importProjectFromZip,
  saveAsset,
  assetsDir
} from './projects.js'
import { analyzeImageBuffer, buildGraphicDataFromCompose } from './composeAnalyze.js'
import {
  addLowerThirdEntry,
  updateLowerThirdEntry,
  deleteLowerThirdEntry,
  showLowerThirdEntry,
  hideLowerThirdShow
} from './lowerThirdEntries.js'

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } })

export function createApiRouter() {
  const router = express.Router()

  router.get('/device', (req, res) => {
    const device = detectDevice(req.headers['user-agent'] || '')
    res.json({ device, userAgent: req.headers['user-agent'] || '' })
  })

  router.get('/network', (_req, res) => {
    const port = Number(process.env.PORT || 2014)
    res.json(buildNetworkUrls(port))
  })

  router.get('/projects', async (_req, res) => {
    res.json(await listProjects())
  })

  router.post('/projects', async (req, res) => {
    const name = req.body?.name?.trim()
    if (!name) return res.status(400).json({ error: 'Name is required' })
    const clientName = req.body?.clientName?.trim() || name
    const project = await createProject(name, clientName)
    res.status(201).json(project)
  })

  router.post('/projects/:id/activate', async (req, res) => {
    const project = await activateProject(req.params.id)
    if (!project) return res.status(404).json({ error: 'Project not found' })
    await reloadState()
    res.json({ ...project, state: getState() })
  })

  router.get('/projects/active/export', async (_req, res) => {
    try {
      const id = await getActiveProjectId()
      await exportProjectToZip(id, res)
    } catch (err) {
      res.status(404).json({ error: err.message || 'Export failed' })
    }
  })

  router.post('/projects/import', upload.single('file'), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file received' })
    const temp = path.join(os.tmpdir(), `proverlay-import-${Date.now()}.zip`)
    try {
      await fs.writeFile(temp, req.file.buffer)
      // Import activeert bewust niet: de operator kiest zelf wanneer hij
      // wisselt via "Activate this project" in het dashboard.
      const project = await importProjectFromZip(temp, req.file.originalname)
      res.status(201).json(project)
    } catch (err) {
      res.status(400).json({ error: err.message || 'Import failed' })
    } finally {
      await fs.unlink(temp).catch(() => {})
    }
  })

  router.get('/projects/:id/assets', async (req, res) => {
    try {
      const dir = assetsDir(req.params.id)
      const entries = await fs.readdir(dir).catch(() => [])
      const files = entries.filter((f) => /\.(png|jpe?g|webp|gif|ttf|otf|woff2?)$/i.test(f))
      const items = await Promise.all(
        files.map(async (filename) => {
          const stat = await fs.stat(path.join(dir, filename)).catch(() => null)
          return {
            filename,
            size: stat?.size || 0,
            url: `/projects/${req.params.id}/assets/${encodeURIComponent(filename)}`
          }
        })
      )
      res.json(items)
    } catch (err) {
      res.status(500).json({ error: err.message || 'Failed to load assets' })
    }
  })

  router.post('/projects/:id/assets', upload.single('file'), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file received' })
    try {
      const filename = await saveAsset(req.params.id, req.file.originalname, req.file.buffer)
      res.json({ filename, url: `/projects/${req.params.id}/assets/${encodeURIComponent(filename)}` })
    } catch (err) {
      res.status(500).json({ error: err.message || 'Upload failed' })
    }
  })

  router.post('/projects/:id/analyze-image', upload.single('file'), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No PNG received' })
    const allowedTypes = ['image/png', 'image/webp']
    if (!allowedTypes.includes(req.file.mimetype)) {
      return res.status(400).json({ error: 'Only PNG and WebP are supported' })
    }
    try {
      const widgetType = req.body?.widgetType || 'matchScoreboard'
      const result = await analyzeImageBuffer(req.file.buffer, { widgetType })
      res.json(result)
    } catch (err) {
      res.status(400).json({ error: err.message || 'Analysis failed' })
    }
  })

  router.post('/projects/:id/compose-widget', async (req, res) => {
    try {
      const { createGraphicFromType } = await import('./graphicDefaults.js')
      const type = req.body?.type
      const name = req.body?.name?.trim() || 'New widget'
      if (!type) return res.status(400).json({ error: 'Type is required' })
      if (!req.body?.filename) return res.status(400).json({ error: 'PNG file missing' })

      const graphic = createGraphicFromType(type, name)
      graphic.data = buildGraphicDataFromCompose({
        widgetType: type,
        name,
        filename: req.body.filename,
        width: Number(req.body.width) || 1920,
        height: Number(req.body.height) || 1080,
        regions: req.body.regions || [],
        placement: req.body.placement,
        designFrameWidth: Number(req.body.designFrameWidth) || 3840
      })

      await addGraphic(graphic)
      res.status(201).json({ graphic, state: getState() })
    } catch (err) {
      res.status(400).json({ error: err.message || 'Failed to create widget' })
    }
  })

  router.get('/state', (_req, res) => {
    res.json(getState())
  })

  router.patch('/state', async (req, res) => {
    const next = await patchState(req.body)
    res.json(next)
  })

  router.get('/brands', async (_req, res) => {
    res.json(await listBrands())
  })

  router.post('/brands/:id/apply', async (req, res) => {
    try {
      const next = await applyBrand(req.params.id)
      res.json(next)
    } catch {
      res.status(404).json({ error: 'Brand not found' })
    }
  })

  router.get('/graphics', (_req, res) => {
    res.json(getState().graphics)
  })

  router.get('/graphics/:id', (req, res) => {
    const graphic = getGraphic(req.params.id)
    if (!graphic) return res.status(404).json({ error: 'Graphic not found' })
    res.json(graphic)
  })

  router.patch('/graphics/:id', async (req, res) => {
    const next = await patchGraphic(req.params.id, req.body)
    if (!next) return res.status(404).json({ error: 'Graphic not found' })
    res.json(getGraphic(req.params.id))
  })

  router.get('/graphics/:id/entries', (req, res) => {
    const graphic = getGraphic(req.params.id)
    if (!graphic || graphic.type !== 'lowerThirdShow') {
      return res.status(404).json({ error: 'Lower thirds widget not found' })
    }
    res.json(graphic.data?.entries || [])
  })

  router.post('/graphics/:id/entries', async (req, res) => {
    try {
      const entry = await addLowerThirdEntry(req.params.id, req.body)
      if (!entry) return res.status(404).json({ error: 'Lower thirds widget not found' })
      res.status(201).json({ entry, graphic: getGraphic(req.params.id) })
    } catch (err) {
      res.status(400).json({ error: err.message || 'Failed to add person' })
    }
  })

  router.patch('/graphics/:id/entries/:entryId', async (req, res) => {
    const entry = await updateLowerThirdEntry(req.params.id, req.params.entryId, req.body)
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

  router.post('/graphics/:id/hide', async (req, res) => {
    const graphic = getGraphic(req.params.id)
    if (!graphic) return res.status(404).json({ error: 'Graphic not found' })
    if (graphic.type === 'lowerThirdShow') {
      const next = await hideLowerThirdShow(req.params.id)
      return res.json(next)
    }
    await setGraphicVisibility(req.params.id, false)
    res.json(getGraphic(req.params.id))
  })

  router.post('/graphics/:id/toggle', async (req, res) => {
    const graphic = getGraphic(req.params.id)
    if (!graphic) return res.status(404).json({ error: 'Graphic not found' })

    const visible =
      req.body?.visible !== undefined ? Boolean(req.body.visible) : !graphic.visible

    await setGraphicVisibility(req.params.id, visible)
    res.json(getGraphic(req.params.id))
  })

  router.post('/graphics/:id/toggle-solo', async (req, res) => {
    const graphic = getGraphic(req.params.id)
    if (!graphic) return res.status(404).json({ error: 'Graphic not found' })

    const soloVisible =
      req.body?.soloVisible !== undefined ? Boolean(req.body.soloVisible) : !graphic.soloVisible

    const { setGraphicSoloVisibility } = await import('./state.js')
    await setGraphicSoloVisibility(req.params.id, soloVisible)
    res.json(getGraphic(req.params.id))
  })

  router.get('/f1/:id/live', async (req, res) => {
    const { getLiveSnapshot } = await import('./f1Timing.js')
    const snapshot = getLiveSnapshot(req.params.id)
    if (!snapshot) return res.status(404).json({ error: 'F1 timing graphic not found' })
    res.json(snapshot)
  })

  router.post('/f1/:id/import-drivers', async (req, res) => {
    const { importDriversOnce } = await import('./f1Timing.js')
    const result = await importDriversOnce(req.params.id)
    res.status(result.status).json(result.body)
  })

  router.post('/graphics', async (req, res) => {
    try {
      const { createGraphicFromType } = await import('./graphicDefaults.js')
      const type = req.body?.type
      const name = req.body?.name?.trim() || 'New widget'
      if (!type) return res.status(400).json({ error: 'Type is required' })
      const graphic = createGraphicFromType(type, name)
      await addGraphic(graphic)
      res.status(201).json(graphic)
    } catch (err) {
      res.status(400).json({ error: err.message || 'Failed to create widget' })
    }
  })

  router.delete('/graphics/:id', async (req, res) => {
    const next = await removeGraphic(req.params.id)
    if (!next) return res.status(404).json({ error: 'Graphic not found' })
    res.json({ ok: true, state: getState() })
  })

  return router
}
