/**
 * F1 live timing connector — reads standings from a running MultiViewer
 * instance (https://multiviewer.app) and broadcasts them to render/control
 * clients over a dedicated socket event.
 *
 * Design notes:
 * - Live rows are NEVER persisted to project.json (would cause a disk write
 *   per poll). They live in memory here; only config (source, focusDriver,
 *   delayMs, …) is part of graphic.data.
 * - A ring buffer of timestamped snapshots supports an operator-adjustable
 *   delay so the tower can be lined up with the video frames in the stream.
 * - MultiViewer itself already syncs live timing to its video playhead, so
 *   the delay is a fine-tune (capture/encode offset), not stream latency.
 */

import dns from 'dns/promises'
import net from 'net'
import { getState, onStateChange, patchGraphic } from './state.js'
import { isPrivateIp, isTrustedHostname } from './netSecurity.js'

const POLL_MS_DEFAULT = 1000
const POLL_MS_MIN = 250
const BUFFER_MAX_MS = 5 * 60 * 1000
const FETCH_TIMEOUT_MS = 3000

// graphicId -> { timer, buffer: [{at, rows, session}], status, cfgKey }
const pollers = new Map()
let ioRef = null
let unsubscribe = null

/** 2026 grid fallback so manual mode is usable straight away. */
export function defaultF1Drivers() {
  return [
    { pos: 1, num: '1', code: 'VER', name: 'Max Verstappen', teamColor: '#3671C6', gap: 'LEADER', interval: '' },
    { pos: 2, num: '4', code: 'NOR', name: 'Lando Norris', teamColor: '#FF8000', gap: '+1.234', interval: '+1.234' },
    { pos: 3, num: '81', code: 'PIA', name: 'Oscar Piastri', teamColor: '#FF8000', gap: '+3.456', interval: '+2.222' },
    { pos: 4, num: '16', code: 'LEC', name: 'Charles Leclerc', teamColor: '#E80020', gap: '+5.678', interval: '+2.222' },
    { pos: 5, num: '44', code: 'HAM', name: 'Lewis Hamilton', teamColor: '#E80020', gap: '+7.890', interval: '+2.212' },
    { pos: 6, num: '63', code: 'RUS', name: 'George Russell', teamColor: '#27F4D2', gap: '+9.012', interval: '+1.122' },
    { pos: 7, num: '12', code: 'ANT', name: 'Kimi Antonelli', teamColor: '#27F4D2', gap: '+11.345', interval: '+2.333' },
    { pos: 8, num: '14', code: 'ALO', name: 'Fernando Alonso', teamColor: '#229971', gap: '+13.456', interval: '+2.111' },
    { pos: 9, num: '18', code: 'STR', name: 'Lance Stroll', teamColor: '#229971', gap: '+15.567', interval: '+2.111' },
    { pos: 10, num: '10', code: 'GAS', name: 'Pierre Gasly', teamColor: '#0093CC', gap: '+17.678', interval: '+2.111' }
  ]
}

function f1Config(graphic) {
  const mv = graphic.data?.multiviewer || {}
  return {
    host: (mv.host || '127.0.0.1').trim() || '127.0.0.1',
    port: Number(mv.port) || 10101,
    pollMs: Math.max(POLL_MS_MIN, Number(mv.pollMs) || POLL_MS_DEFAULT),
    delayMs: Math.max(0, Number(mv.delayMs) || 0)
  }
}

function baseUrl(cfg) {
  const host = String(cfg.host || '127.0.0.1')
  // IPv6 literals need brackets: http://[::1]:10101/...
  const hostPart = host.includes(':') && !host.startsWith('[') ? `[${host}]` : host
  return `http://${hostPart}:${cfg.port}/api/v1/live-timing`
}

/**
 * MultiViewer runs on the operator's machine or LAN. Refuse anything else so
 * a widget setting can not turn the server into a proxy to arbitrary hosts.
 */
export async function assertLocalMultiViewerHost(host) {
  const name = String(host || '').trim().replace(/^\[|\]$/g, '')
  if (!isTrustedHostname(name)) {
    throw new Error('MultiViewer host must be localhost or a private-network address')
  }
  if (net.isIP(name)) return
  const addresses = await dns.lookup(name, { all: true }).catch(() => [])
  if (!addresses.length) throw new Error(`MultiViewer host "${name}" not found`)
  if (!addresses.every((a) => isPrivateIp(a.address))) {
    throw new Error('MultiViewer host must resolve to a private-network address')
  }
}

async function fetchTopic(cfg, topic) {
  const res = await fetch(`${baseUrl(cfg)}/${topic}`, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS)
  })
  if (!res.ok) throw new Error(`${topic} → HTTP ${res.status}`)
  return res.json()
}

function gapValue(raw) {
  if (raw == null) return ''
  if (typeof raw === 'string') return raw
  if (typeof raw === 'object') return raw.Value || ''
  return String(raw)
}

/** Current tyre compound per car from TimingAppData (latest stint). */
function currentTyre(appLine) {
  const stints = appLine?.Stints
  if (!stints) return ''
  const list = Array.isArray(stints) ? stints : Object.values(stints)
  const last = list[list.length - 1]
  return String(last?.Compound || '').toUpperCase()
}

/** TimingData.Lines + DriverList → sorted rows for the tower. */
export function mapTimingToRows(timingLines = {}, driverList = {}, appLines = {}) {
  const rows = []
  for (const [num, line] of Object.entries(timingLines)) {
    const pos = Number(line.Position)
    if (!pos) continue
    const drv = driverList[num] || {}
    rows.push({
      pos,
      num,
      code: drv.Tla || num,
      name: drv.BroadcastName || drv.FullName || '',
      teamColor: drv.TeamColour ? `#${drv.TeamColour}` : '#888888',
      gap: gapValue(line.GapToLeader),
      interval: gapValue(line.IntervalToPositionAhead),
      tyre: currentTyre(appLines[num]),
      inPit: Boolean(line.InPit),
      retired: Boolean(line.Retired || line.Stopped),
      knockedOut: Boolean(line.KnockedOut),
      // Status bit 1024 = crossed the finish line (chequered flag), verified
      // empirically against the MultiViewer feed at the end of a race.
      finished: Boolean(Number(line.Status) & 1024)
    })
  }
  rows.sort((a, b) => a.pos - b.pos)
  return rows
}

/** TrackStatus.Status → 'clear' | 'yellow' | 'red' | 'sc' | 'vsc'. */
export function mapTrackStatus(trackStatus) {
  const code = String(trackStatus?.Status || '')
  if (code === '2' || code === '3') return 'yellow'
  if (code === '4') return 'sc'
  if (code === '5') return 'red'
  if (code === '6' || code === '7') return 'vsc'
  return 'clear'
}

async function pollOnce(graphicId, cfg) {
  const entry = pollers.get(graphicId)
  if (!entry) return
  // No overlapping polls: with a slow MultiViewer / pollMs 250 ms,
  // setInterval would otherwise start N × 5 HTTP requests at once.
  if (entry.inFlight) return
  entry.inFlight = true
  try {
    await assertLocalMultiViewerHost(cfg.host)
    const [timing, driverList, lapCount, trackStatus, appData] = await Promise.all([
      fetchTopic(cfg, 'TimingData'),
      fetchTopic(cfg, 'DriverList'),
      fetchTopic(cfg, 'LapCount').catch(() => null),
      fetchTopic(cfg, 'TrackStatus').catch(() => null),
      fetchTopic(cfg, 'TimingAppData').catch(() => null)
    ])
    // The poller may have been stopped in the meantime
    if (!pollers.has(graphicId)) return
    const rows = mapTimingToRows(timing?.Lines || {}, driverList || {}, appData?.Lines || {})
    // Keep the previous lap text when a LapCount fetch fails: otherwise the
    // header pill disappears for one poll and the whole tower jumps.
    const prevSession = entry.buffer[entry.buffer.length - 1]?.session || {}
    const lapText = lapCount?.CurrentLap
      ? `LAP ${lapCount.CurrentLap}/${lapCount.TotalLaps || '?'}`
      : prevSession.lapText || ''
    const session = {
      ...(lapText ? { lapText } : {}),
      track: trackStatus ? mapTrackStatus(trackStatus) : prevSession.track || 'clear'
    }

    const now = Date.now()
    entry.buffer.push({ at: now, rows, session })
    while (entry.buffer.length && entry.buffer[0].at < now - BUFFER_MAX_MS) {
      entry.buffer.shift()
    }
    entry.status = { connected: rows.length > 0, lastError: null, lastUpdateAt: now }
  } catch (err) {
    if (!pollers.has(graphicId)) return
    entry.status = {
      connected: false,
      lastError: err.name === 'TimeoutError' ? 'MultiViewer not reachable (timeout)' : err.message,
      lastUpdateAt: entry.status?.lastUpdateAt || null
    }
  } finally {
    entry.inFlight = false
  }
  if (pollers.has(graphicId)) broadcast(graphicId, cfg)
}

/** Snapshot at (now − delay); the newest one when the buffer is shorter than the delay. */
function delayedSnapshot(entry, delayMs) {
  const cutoff = Date.now() - delayMs
  for (let i = entry.buffer.length - 1; i >= 0; i--) {
    if (entry.buffer[i].at <= cutoff) return entry.buffer[i]
  }
  return entry.buffer[0] || null
}

function broadcast(graphicId, cfg) {
  const entry = pollers.get(graphicId)
  if (!entry || !ioRef) return
  const snap = delayedSnapshot(entry, cfg.delayMs)
  ioRef.emit('f1TimingUpdate', {
    graphicId,
    rows: snap?.rows || [],
    session: snap?.session || {},
    status: entry.status || { connected: false }
  })
}

/** For GET /api/f1/:id/live: initial paint without waiting for the socket. */
export function getLiveSnapshot(graphicId) {
  const state = getState()
  const graphic = (state.graphics || []).find((g) => g.id === graphicId)
  if (!graphic || graphic.type !== 'f1Timing') return null

  const cfg = f1Config(graphic)
  const entry = pollers.get(graphicId)
  if (graphic.data?.source !== 'multiviewer' || !entry) {
    return {
      graphicId,
      rows: graphic.data?.drivers || [],
      session: graphic.data?.session || {},
      status: { connected: false, source: graphic.data?.source || 'manual' }
    }
  }
  const snap = delayedSnapshot(entry, cfg.delayMs)
  return {
    graphicId,
    rows: snap?.rows || [],
    session: snap?.session || {},
    status: entry.status || { connected: false }
  }
}

function stopPoller(graphicId) {
  const entry = pollers.get(graphicId)
  if (!entry) return
  clearInterval(entry.timer)
  pollers.delete(graphicId)
}

// delayMs is not part of the key: adjusting the delay live must not drop the
// snapshot buffer, otherwise there is nothing left to play back delayed.
function pollerKey(cfg) {
  return `${cfg.host}:${cfg.port}:${cfg.pollMs}`
}

function f1ConfigLive(graphicId) {
  const graphic = (getState().graphics || []).find((g) => g.id === graphicId)
  return graphic ? f1Config(graphic) : null
}

function startPoller(graphicId, cfg) {
  const entry = {
    timer: null,
    buffer: [],
    inFlight: false,
    status: { connected: false, lastError: null, lastUpdateAt: null },
    cfgKey: pollerKey(cfg)
  }
  pollers.set(graphicId, entry)
  entry.timer = setInterval(() => {
    const live = f1ConfigLive(graphicId)
    if (live) pollOnce(graphicId, live)
  }, cfg.pollMs)
  pollOnce(graphicId, cfg)
}

/** Keep pollers in sync with the current state (start/stop/restart on config changes). */
function reconcile(state) {
  const wanted = new Map()
  for (const g of state.graphics || []) {
    if (g.type !== 'f1Timing') continue
    if (g.data?.source !== 'multiviewer') continue
    // Poll as soon as the source is enabled: the operator wants status/preview before going live.
    wanted.set(g.id, f1Config(g))
  }

  for (const id of [...pollers.keys()]) {
    if (!wanted.has(id)) stopPoller(id)
  }
  for (const [id, cfg] of wanted) {
    const existing = pollers.get(id)
    if (existing && existing.cfgKey === pollerKey(cfg)) continue
    if (existing) stopPoller(id)
    startPoller(id, cfg)
  }
}

/**
 * One-off import of the current grid from MultiViewer into data.drivers,
 * so the manual list never has to be filled in by hand.
 * Works whatever source is selected (uses the widget's MultiViewer
 * settings).
 */
export async function importDriversOnce(graphicId) {
  const graphic = (getState().graphics || []).find(
    (g) => g.id === graphicId && g.type === 'f1Timing'
  )
  if (!graphic) return { status: 404, body: { error: 'F1 timing graphic not found' } }

  const cfg = f1Config(graphic)
  try {
    await assertLocalMultiViewerHost(cfg.host)
    const [timing, driverList, appData] = await Promise.all([
      fetchTopic(cfg, 'TimingData'),
      fetchTopic(cfg, 'DriverList'),
      fetchTopic(cfg, 'TimingAppData').catch(() => null)
    ])
    const rows = mapTimingToRows(timing?.Lines || {}, driverList || {}, appData?.Lines || {})
    if (!rows.length) {
      return {
        status: 409,
        body: { error: 'No live timing data — is Live Timing running in MultiViewer?' }
      }
    }
    await patchGraphic(graphicId, { data: { drivers: rows } })
    return { status: 200, body: { imported: rows.length } }
  } catch (err) {
    return {
      status: 502,
      body: {
        error:
          err.name === 'TimeoutError'
            ? `MultiViewer not reachable on ${cfg.host}:${cfg.port}`
            : err.message
      }
    }
  }
}

export function initF1Timing(io) {
  ioRef = io
  unsubscribe?.()
  unsubscribe = onStateChange(reconcile)
  reconcile(getState())
}

/** Stop all pollers and detach from state changes (server shutdown). */
export function shutdownF1Timing() {
  unsubscribe?.()
  unsubscribe = null
  for (const id of [...pollers.keys()]) stopPoller(id)
  ioRef = null
}
