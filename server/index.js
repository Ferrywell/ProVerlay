/**
 * CLI / Electron entry point: `node server/index.js`.
 * Importing this module starts the server (Electron relies on that).
 * Tests and embedders should use createApp()/startServer() from ./app.js.
 */
import { startServer } from './app.js'
import { buildNetworkUrls } from './network.js'
import { getState } from './state.js'

const PORT = Number(process.env.PORT || 2014)

// A single bug must not take a live show off air: log and keep running.
process.on('unhandledRejection', (reason) => {
  console.error('[proverlay] Unhandled promise rejection (server keeps running):', reason)
})
process.on('uncaughtException', (err, origin) => {
  console.error(`[proverlay] Uncaught exception (${origin}); server keeps running:`, err)
})

function printBanner(port) {
  const net = buildNetworkUrls(port)
  console.log(`ProVerlay running on port ${port}`)
  console.log(`  Dashboard: http://localhost:${port}/control`)
  console.log(`  Operator:  http://localhost:${port}/operator`)
  console.log(`  Operate:   http://localhost:${port}/operate?graphic=<id>`)
  console.log(`  Editor:    http://localhost:${port}/editor`)
  console.log(`  Render:    http://localhost:${port}/render`)
  console.log(`  Project:   ${getState().projectId}`)
  console.log('  Network (use http, not https):')
  for (const { url } of net.urls.lan.filter((u) => u.path === 'operator')) {
    console.log(`    Operator: ${url}`)
  }
  for (const { url } of net.urls.lan.filter((u) => u.path === 'control')) {
    console.log(`    Dashboard: ${url}`)
  }
}

try {
  const handle = await startServer({ port: PORT })
  printBanner(handle.port)
} catch (err) {
  if (err.code === 'EADDRINUSE') {
    console.error(
      `ProVerlay could not bind to port ${PORT} (already in use). ` +
        'Close the other instance or set PORT to a free port.'
    )
  } else if (err.code === 'EACCES') {
    console.error(
      `ProVerlay is not allowed to bind to port ${PORT} (permission denied). ` +
        'Ports below 1024 need elevated rights; set PORT to a port above 1024.'
    )
  } else {
    console.error('ProVerlay failed to start:', err)
  }
  process.exit(1)
}
