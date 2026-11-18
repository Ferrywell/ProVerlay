/**
 * GET /api/debug: one snapshot for the Debug console (/debug). Loopback only
 * (api.js): it shows file paths and data-source links.
 *
 * - server: version, uptime, port, project, experimental flags
 * - clients: connected pages (render outputs with OBS detection and size,
 *   dashboards, operators) as reported by the pages themselves
 * - graphics: per graphic whether it is on air and where its content comes
 *   from (typed in, a data source, MultiViewer, variables)
 * - dataSources, f1: the status the connectors keep in memory
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { getState } from './state.js'
import { getDataDir } from './paths.js'
import { experimentalFeatures } from './experimental.js'
import { f1DebugStatus } from './f1Timing.js'
import { listDataSources, sourceWhere } from './dataSources.js'
import { debugEntries } from './debugLog.js'
import { usedVariableNames } from '../public/shared/variables.js'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const startedAt = new Date()

let version = null
function appVersion() {
  if (version) return version
  try {
    version = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version || 'unknown'
  } catch {
    version = 'unknown'
  }
  return version
}

/** Where one graphic's content comes from, in words plus details. */
export function graphicOrigin(graphic, { sources = [], f1 = [] } = {}) {
  const variables = usedVariableNames({ graphics: [graphic] })
  const binding = graphic.data?.dataBinding
  if (graphic.type === 'f1Timing') {
    const tower = f1.find((t) => t.graphicId === graphic.id)
    if (tower?.source === 'multiviewer') {
      const mv = tower.multiviewer
      const s = mv?.status
      const state = s?.connected ? 'connected' : s?.lastError ? `not connected: ${s.lastError}` : 'waiting for data'
      return { kind: 'multiviewer', label: `MultiViewer live timing (${state})`, detail: mv?.url || '', variables }
    }
    return { kind: 'manual', label: `Manual driver list (${tower?.manualRows ?? 0} rows)`, detail: '', variables }
  }
  if (binding?.sourceId) {
    const source = sources.find((s) => s.id === binding.sourceId)
    if (!source) return { kind: 'data', label: 'Data source (missing)', detail: binding.sourceId, variables }
    const held = source.status?.held?.includes(graphic.id)
    const state = source.status?.state || 'idle'
    return {
      kind: 'data',
      label: `Data source "${source.name}" (${state}${held ? ', change held while on air' : ''})`,
      detail: sourceWhere(source),
      variables
    }
  }
  return { kind: 'manual', label: 'Typed in (dashboard, operator or Companion)', detail: '', variables }
}

/**
 * @param {{ port: number, clients?: object[], includeLog?: boolean }} options
 */
export function buildDebugSnapshot({ port, clients = [], includeLog = true }) {
  const state = getState()
  const data = listDataSources()
  const f1 = f1DebugStatus()
  const graphics = (state.graphics || []).map((g) => ({
    id: g.id,
    name: g.name || g.id,
    type: g.type,
    visible: Boolean(g.visible),
    origin: graphicOrigin(g, { sources: data.sources, f1 })
  }))
  const snapshot = {
    generatedAt: new Date().toISOString(),
    server: {
      version: appVersion(),
      node: process.versions.node,
      electron: process.versions.electron || null,
      platform: `${process.platform} ${process.arch}`,
      port,
      startedAt: startedAt.toISOString(),
      uptimeSeconds: Math.round(process.uptime()),
      dataDir: getDataDir(),
      experimental: experimentalFeatures()
    },
    project: { id: state.projectId, name: state.projectName || state.projectId },
    clients,
    graphics,
    dataSources: data.sources.map((s) => ({
      id: s.id,
      name: s.name,
      origin: s.origin,
      where: sourceWhere(s),
      pollMs: s.pollMs || 0,
      holdWhileOnAir: Boolean(s.holdWhileOnAir),
      status: {
        state: s.status.state,
        rowCount: s.status.rowCount || 0,
        lastUpdated: s.status.lastUpdated || null,
        error: s.status.error || '',
        held: s.status.held || []
      }
    })),
    f1
  }
  if (includeLog) snapshot.log = debugEntries()
  return snapshot
}
