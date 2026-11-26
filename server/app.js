/**
 * ProVerlay server factory. `node server/index.js` (and the Electron app)
 * use startServer(); tests use it too, with port 0 and a temp data dir.
 *
 * The state/project modules are process-wide singletons, so only one
 * server should be running per process at a time.
 */
import express from 'express'
import http from 'http'
import path from 'path'
import { fileURLToPath } from 'url'
import { Server } from 'socket.io'
import multer from 'multer'
import { createApiRouter } from './api.js'
import { loadState, getState, onStateChange, resetState } from './state.js'
import { initF1Timing, shutdownF1Timing } from './f1Timing.js'
import { initNowPlaying, shutdownNowPlaying } from './nowPlaying.js'
import { initImageTimers, shutdownImageTimers } from './imageWidget.js'
import { initDataSources, shutdownDataSources } from './dataSources.js'
import { detectDevice, preferredDashboard } from './device.js'
import {
  ASSET_EXT_RE,
  assetsDir,
  projectExists,
  flushTouchProject,
  resetProjectsCache,
  readCustomCss,
  listProjects,
  onProjectsChange
} from './projects.js'
import { setDataDir } from './paths.js'
import { drainWrites } from './writeQueue.js'
import { originGuard, socketAllowRequest } from './netSecurity.js'
import { isValidProjectId } from './validation.js'
import { debugLog, describeClient, describeStateChange, onDebugLog, debugEntries } from './debugLog.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')

/**
 * Asset response headers. SVG files can carry scripts: opened directly (not
 * through <img>) they would run on ProVerlay's origin, and there is no login.
 * The sandbox CSP keeps them inert; as <img> they render as usual.
 */
function assetHeaders(res, filePath) {
  res.setHeader('X-Content-Type-Options', 'nosniff')
  if (/\.svg$/i.test(filePath)) {
    res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; img-src data:; sandbox")
  }
}

function sendPage(file) {
  return (_req, res) => res.sendFile(path.join(ROOT, 'public', file, 'index.html'))
}

function errorHandler(err, req, res, next) {
  if (res.headersSent) return next(err)
  const isApi = req.originalUrl?.startsWith('/api')
  let status = Number(err.status || err.statusCode) || 500
  let message = err.expose || status < 500 ? err.message : 'Internal server error'

  if (err instanceof SyntaxError && 'body' in err) {
    status = 400
    message = 'Invalid JSON body'
  } else if (err instanceof multer.MulterError) {
    status = err.code === 'LIMIT_FILE_SIZE' ? 413 : 400
    message = err.code === 'LIMIT_FILE_SIZE' ? 'File too large' : `Upload error: ${err.code}`
  } else if (err.type === 'entity.too.large') {
    status = 413
    message = 'Request body too large'
  }

  if (status >= 500) console.error(`[http] ${req.method} ${req.originalUrl} failed:`, err)
  if (isApi) return res.status(status).json({ error: message || 'Request failed' })
  res.status(status).type('text/plain').send(message || 'Request failed')
}

function isLoopback(address) {
  const addr = String(address || '').replace(/^::ffff:/, '')
  return addr === '127.0.0.1' || addr === '::1' || addr.startsWith('127.')
}

const cleanText = (value, max = 200) => String(value ?? '').slice(0, max)

/** Log every API write (who, what, result); reads are not logged. */
function logApiWrites(req, res, next) {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return next()
  const started = Date.now()
  res.on('finish', () => {
    const status = res.statusCode
    debugLog('api', `${req.method} ${req.originalUrl.split('?')[0]} → ${status} (${Date.now() - started} ms) from ${describeClient(req)}`, {
      level: status >= 500 ? 'error' : status >= 400 ? 'warn' : 'info'
    })
  })
  next()
}

/**
 * Build (but do not start) the server.
 * @param {{ dataDir?: string, port?: number, host?: string }} [options]
 */
export function createApp({ dataDir, port = Number(process.env.PORT || 2014), host = '0.0.0.0' } = {}) {
  if (dataDir) setDataDir(dataDir)

  let boundPort = port
  const debugClients = new Map() // socket.id -> what the page told us about itself
  const renderErrorBudget = new Map() // socket.id -> { windowStart, count }

  function registerDebugClient(socket, info) {
    if (!info || typeof info !== 'object') return
    const page = cleanText(info.page, 40).replace(/[^a-z0-9-]/gi, '') || 'page'
    const width = Math.round(Number(info.width)) || 0
    const height = Math.round(Number(info.height)) || 0
    const obs = Boolean(info.obs)
    const kind = page === 'render' ? (obs ? 'OBS browser source' : 'Render page') : `${page} page`
    const where = isLoopback(socket.handshake.address) ? 'this computer' : String(socket.handshake.address).replace(/^::ffff:/, '')
    const known = debugClients.get(socket.id)
    const client = {
      id: socket.id,
      page,
      label: `${kind} on ${where}${width && height ? ` (${width}×${height})` : ''}`,
      obs,
      obsVersion: cleanText(info.obsVersion, 40),
      filter: cleanText(info.filter, 120),
      userAgent: cleanText(socket.handshake.headers['user-agent'], 300),
      address: where,
      width,
      height,
      connectedAt: known?.connectedAt || new Date().toISOString(),
      lastError: known?.lastError || null
    }
    debugClients.set(socket.id, client)
    if (page === 'render' && !known) {
      debugLog('render', `${client.label} connected${client.filter ? ` (only graphic ${client.filter})` : ''}`, {
        detail: client.userAgent
      })
    }
  }

  function reportRenderError(socket, report) {
    if (!report || typeof report !== 'object') return
    // At most 20 reports per output per minute: a broken graphic re-renders often.
    const now = Date.now()
    const budget = renderErrorBudget.get(socket.id)
    if (!budget || now - budget.windowStart > 60_000) renderErrorBudget.set(socket.id, { windowStart: now, count: 1 })
    else if (++budget.count > 20) return
    const client = debugClients.get(socket.id)
    const graphicId = cleanText(report.graphicId, 120)
    const graphic = graphicId ? getState().graphics.find((g) => g.id === graphicId) : null
    const what = graphic ? `"${graphic.name || graphic.id}" (${graphic.type})` : graphicId || 'a graphic'
    const message = `${client?.label || 'Render output'}: ${what} ${cleanText(report.phase, 80) || 'failed'}: ${cleanText(report.message, 300)}`
    if (client) client.lastError = { at: new Date().toISOString(), message }
    debugLog('render', message, { level: 'error', graphicId: graphicId || undefined, detail: cleanText(report.stack, 2000) || undefined })
  }

  const app = express()
  app.disable('x-powered-by')
  const server = http.createServer(app)
  // No CORS: every ProVerlay page is served from this server. Origin/Host
  // checks (see netSecurity.js) apply to the socket.io handshake too.
  const io = new Server(server, { allowRequest: socketAllowRequest })

  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff')
    next()
  })
  app.use(originGuard())
  app.use(express.json({ limit: '5mb' }))
  app.use('/api', logApiWrites)
  app.use('/api', createApiRouter({ getPort: () => boundPort, getDebugClients: () => [...debugClients.values()] }))
  app.use('/public', express.static(path.join(ROOT, 'public')))
  app.use('/templates', express.static(path.join(ROOT, 'templates')))

  // Project assets: only known project ids, only allow-listed file types.
  app.use('/projects/:projectId/assets', (req, res, next) => {
    const { projectId } = req.params
    if (!isValidProjectId(projectId)) return res.status(404).end()
    let file = ''
    try {
      file = decodeURIComponent(req.path.split('/').pop() || '')
    } catch {
      return res.status(400).end()
    }
    if (!ASSET_EXT_RE.test(file)) return res.status(404).end()
    projectExists(projectId)
      .then((exists) => {
        if (!exists) return res.status(404).end()
        express.static(assetsDir(projectId), {
          dotfiles: 'deny',
          index: false,
          redirect: false,
          setHeaders: assetHeaders
        })(req, res, next)
      })
      .catch(next)
  })

  // Per-project custom CSS (trusted local content, see customCss.js). Served
  // next to assets/ so `url(assets/foo.png)` in the stylesheet resolves to
  // the project's own assets.
  app.get('/projects/:projectId/custom.css', (req, res, next) => {
    const { projectId } = req.params
    if (!isValidProjectId(projectId)) return res.status(404).end()
    projectExists(projectId)
      .then(async (exists) => {
        if (!exists) return res.status(404).end()
        const css = await readCustomCss(projectId)
        if (!css) return res.status(404).type('text/plain').send('No custom CSS')
        res.setHeader('Cache-Control', 'no-cache')
        res.type('text/css; charset=utf-8').send(css)
      })
      .catch(next)
  })

  app.get('/render', sendPage('render'))
  app.get('/render/:graphicId', (req, res) => {
    res.redirect(`/render?graphic=${encodeURIComponent(req.params.graphicId)}`)
  })

  app.get('/control', (req, res) => {
    // Decision A: tablets/phones use Operator for live control — not the dense desktop dashboard.
    const device = detectDevice(req.headers['user-agent'] || '')
    if (device === 'mobile' || device === 'tablet') {
      return res.redirect('/operator')
    }
    res.sendFile(path.join(ROOT, 'public', 'control', 'index.html'))
  })

  app.get('/design', sendPage('design'))
  app.get('/operator', sendPage('operator'))
  app.get('/operate/:widgetId', sendPage('operate'))
  app.get('/operate', sendPage('operate'))
  app.get('/layout', sendPage('layout'))
  app.get('/editor', sendPage('editor'))
  app.get('/editor/:graphicId', (req, res) => {
    res.redirect(`/editor?graphic=${encodeURIComponent(req.params.graphicId)}`)
  })
  app.get('/compose', sendPage('compose'))
  app.get('/project', sendPage('project'))
  app.get('/data', sendPage('data'))
  app.get('/debug', sendPage('debug'))

  app.get('/', (req, res) => {
    const device = detectDevice(req.headers['user-agent'] || '')
    const dashboard = preferredDashboard(device, req.query)
    res.redirect(`/${dashboard}`)
  })

  // API errors → JSON (never HTML stack traces with filesystem paths)
  app.use(errorHandler)

  // Read-only socket API: clients receive `stateChanged` and may ask for
  // `getState`. All writes go through the REST API (validated, queued).
  // Debug events: pages describe themselves (`debug:hello`), render pages
  // report graphics that failed to draw (`debug:renderError`), and the Debug
  // console (loopback only) joins the 'debug' room for live log lines.
  io.on('connection', (socket) => {
    try {
      socket.emit('stateChanged', getState())
    } catch (err) {
      console.error('[socket] initial state failed:', err.message)
    }
    socket.on('getState', (_payload, ack) => {
      if (typeof ack !== 'function') return
      try {
        ack(getState())
      } catch (err) {
        ack({ error: err.message })
      }
    })
    socket.on('debug:hello', (info) => registerDebugClient(socket, info))
    socket.on('debug:renderError', (report) => reportRenderError(socket, report))
    socket.on('debug:subscribe', (_payload, ack) => {
      if (typeof ack !== 'function') return
      if (!isLoopback(socket.handshake.address)) return ack({ error: 'The Debug console only works on the ProVerlay computer itself' })
      socket.join('debug')
      ack({ entries: debugEntries() })
    })
    socket.on('disconnect', () => {
      renderErrorBudget.delete(socket.id)
      const client = debugClients.get(socket.id)
      if (!client) return
      debugClients.delete(socket.id)
      if (client.page === 'render') debugLog('render', `${client.label} disconnected`)
    })
  })

  let unsubscribe = null
  let unsubscribeProjects = null
  let unsubscribeDebug = null
  let unsubscribeStateLog = null
  let started = false

  async function listen() {
    resetProjectsCache()
    resetState()
    await loadState()
    unsubscribe = onStateChange((state) => io.emit('stateChanged', state))
    let previous = getState()
    unsubscribeStateLog = onStateChange((state) => {
      for (const line of describeStateChange(previous, state)) {
        debugLog('state', line.message, { graphicId: line.graphicId })
      }
      previous = state
    })
    unsubscribeDebug = onDebugLog((entry) => io.to('debug').emit('debug:log', entry))
    // Project list changed (create/rename/duplicate/delete/import/activate).
    unsubscribeProjects = onProjectsChange(() => {
      listProjects()
        .then((projects) => io.emit('projectsChanged', projects))
        .catch((err) => console.error('[socket] projectsChanged failed:', err.message))
    })
    initF1Timing(io)
    initNowPlaying(io)
    initImageTimers()
    await initDataSources(io)
    started = true
    await new Promise((resolve, reject) => {
      const onError = (err) => {
        server.off('listening', onListening)
        reject(err)
      }
      const onListening = () => {
        server.off('error', onError)
        resolve()
      }
      server.once('error', onError)
      server.once('listening', onListening)
      server.listen(port, host)
    }).catch(async (err) => {
      await cleanup()
      throw err
    })
    boundPort = server.address().port
    const s = getState()
    debugLog('server', `Server started on port ${boundPort} with project "${s.projectName || s.projectId}"`)
    server.on('error', (err) => console.error('[server] error:', err))
    return { port: boundPort, url: `http://127.0.0.1:${boundPort}` }
  }

  async function cleanup() {
    if (!started) return
    started = false
    shutdownF1Timing()
    shutdownNowPlaying()
    shutdownImageTimers()
    shutdownDataSources()
    unsubscribe?.()
    unsubscribe = null
    unsubscribeProjects?.()
    unsubscribeProjects = null
    unsubscribeDebug?.()
    unsubscribeDebug = null
    unsubscribeStateLog?.()
    unsubscribeStateLog = null
    debugClients.clear()
    renderErrorBudget.clear()
    await flushTouchProject()
    await drainWrites()
  }

  async function close() {
    await new Promise((resolve) => {
      if (!server.listening) return resolve()
      server.close(() => resolve())
      io.disconnectSockets(true)
      server.closeAllConnections?.()
    })
    io.close()
    await cleanup()
  }

  return {
    app,
    server,
    io,
    listen,
    close,
    get port() {
      return boundPort
    }
  }
}

/** Create and start a server. Resolves to the handle once it is listening. */
export async function startServer(options = {}) {
  const handle = createApp(options)
  await handle.listen()
  return handle
}
