/**
 * Debug console (/debug): live server log plus a snapshot of outputs,
 * graphics (and where their content comes from) and connectors.
 * Server side: server/debugLog.js, server/debugSnapshot.js, GET /api/debug.
 * Only works on the ProVerlay computer itself (loopback).
 */

const AREAS = ['state', 'api', 'render', 'data', 'f1', 'image', 'server']
const AREA_LABELS = { state: 'State', api: 'API', render: 'Render', data: 'Data', f1: 'F1', image: 'Image', server: 'Server' }
const LEVEL_RANK = { info: 0, warn: 1, error: 2 }
const MAX_LINES = 2000
const SNAPSHOT_MS = 2000

const $ = (id) => document.getElementById(id)
const summaryEl = $('dbg-summary')
const blockedEl = $('dbg-blocked')
const mainEl = $('dbg-main')
const clientsEl = $('dbg-clients')
const graphicsEl = $('dbg-graphics')
const connectorsEl = $('dbg-connectors')
const logEl = $('dbg-log')
const logNote = $('dbg-log-note')
const areasEl = $('dbg-areas')
const levelEl = $('dbg-level')
const searchEl = $('dbg-search')
const pauseBtn = $('dbg-pause')

let entries = []
let lastSeq = 0
let paused = false
let pendingWhilePaused = 0
let snapshot = null
const shownAreas = new Set(AREAS)

const escapeHtml = (value = '') =>
  String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;')

function timeOf(iso) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n, w = 2) => String(n).padStart(w, '0')
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`
}

function agoText(iso) {
  if (!iso) return 'never'
  const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000))
  if (s < 60) return `${s} s ago`
  if (s < 3600) return `${Math.round(s / 60)} min ago`
  return `${Math.round(s / 3600)} h ago`
}

function durationText(seconds) {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  return h ? `${h} h ${m} min` : `${m} min`
}

/* ---------------------------------------------------------------- log */

function matches(entry) {
  if (!shownAreas.has(entry.area)) return false
  if (LEVEL_RANK[entry.level] < LEVEL_RANK[levelEl.value]) return false
  const q = searchEl.value.trim().toLowerCase()
  if (q && !`${entry.message} ${entry.detail || ''}`.toLowerCase().includes(q)) return false
  return true
}

function lineHtml(entry) {
  const detail = entry.detail ? `<details><summary>details</summary><pre>${escapeHtml(entry.detail)}</pre></details>` : ''
  return `<li class="dbg-line is-${entry.level}" data-seq="${entry.seq}">
    <span class="dbg-line__time">${timeOf(entry.at)}</span>
    <span class="dbg-line__area">${escapeHtml(AREA_LABELS[entry.area] || entry.area)}</span>
    <span class="dbg-line__msg">${escapeHtml(entry.message)}</span>${detail}
  </li>`
}

function nearBottom() {
  return logEl.scrollHeight - logEl.scrollTop - logEl.clientHeight < 40
}

function renderLog() {
  const stick = nearBottom()
  const shown = entries.filter(matches)
  logEl.innerHTML = shown.map(lineHtml).join('')
  if (stick) logEl.scrollTop = logEl.scrollHeight
  updateLogNote(shown.length)
}

function updateLogNote(count) {
  const parts = [`${count} of ${entries.length} lines shown`]
  if (paused && pendingWhilePaused) parts.push(`${pendingWhilePaused} new while paused`)
  logNote.textContent = parts.join(' · ')
}

function addEntries(list) {
  const fresh = list.filter((e) => e && e.seq > lastSeq)
  if (!fresh.length) return
  lastSeq = fresh[fresh.length - 1].seq
  entries.push(...fresh)
  if (entries.length > MAX_LINES) entries = entries.slice(-MAX_LINES)
  if (paused) {
    pendingWhilePaused += fresh.length
    updateLogNote(logEl.children.length)
    return
  }
  const stick = nearBottom()
  const html = fresh.filter(matches).map(lineHtml).join('')
  if (html) logEl.insertAdjacentHTML('beforeend', html)
  while (logEl.children.length > MAX_LINES) logEl.firstElementChild.remove()
  if (stick) logEl.scrollTop = logEl.scrollHeight
  updateLogNote(logEl.children.length)
}

areasEl.innerHTML = AREAS.map(
  (a) => `<button type="button" class="dbg-chip" data-area="${a}" aria-pressed="true">${AREA_LABELS[a]}</button>`
).join('')
areasEl.addEventListener('click', (event) => {
  const chip = event.target.closest('[data-area]')
  if (!chip) return
  const area = chip.dataset.area
  // Alt/Option-click: show only this area.
  if (event.altKey) {
    shownAreas.clear()
    shownAreas.add(area)
  } else if (shownAreas.has(area)) shownAreas.delete(area)
  else shownAreas.add(area)
  for (const c of areasEl.querySelectorAll('[data-area]')) c.setAttribute('aria-pressed', String(shownAreas.has(c.dataset.area)))
  renderLog()
})
levelEl.addEventListener('change', renderLog)
searchEl.addEventListener('input', renderLog)
pauseBtn.addEventListener('click', () => {
  paused = !paused
  pauseBtn.setAttribute('aria-pressed', String(paused))
  pauseBtn.textContent = paused ? 'Resume' : 'Pause'
  if (!paused) {
    pendingWhilePaused = 0
    renderLog()
    logEl.scrollTop = logEl.scrollHeight
  }
})
$('dbg-clear').addEventListener('click', () => {
  entries = []
  pendingWhilePaused = 0
  renderLog()
})

/* ----------------------------------------------------------- snapshot */

function renderSnapshot(s) {
  snapshot = s
  const exp = s.server.experimental?.length ? ` · experimental: ${s.server.experimental.join(', ')}` : ''
  summaryEl.textContent = `ProVerlay ${s.server.version} · project "${s.project.name}" · port ${s.server.port} · running ${durationText(
    s.server.uptimeSeconds
  )}${exp}`

  const clients = [...s.clients].sort((a, b) => (a.page === 'render' ? -1 : 0) - (b.page === 'render' ? -1 : 0))
  clientsEl.innerHTML = clients.length
    ? clients
        .map((c) => {
          const err = c.lastError ? `<span class="dbg-sub is-error">Last error ${agoText(c.lastError.at)}: ${escapeHtml(c.lastError.message)}</span>` : ''
          const extra = [c.obsVersion ? `obs-browser ${c.obsVersion}` : '', `connected ${agoText(c.connectedAt)}`].filter(Boolean).join(' · ')
          return `<li>${escapeHtml(c.label)}<span class="dbg-sub" title="${escapeHtml(c.userAgent)}">${escapeHtml(extra)}</span>${err}</li>`
        })
        .join('')
    : '<li class="dbg-empty">No outputs connected. Add <code>/render</code> as a browser source in OBS or vMix.</li>'

  graphicsEl.innerHTML = s.graphics.length
    ? s.graphics
        .map((g) => {
          const vars = g.origin.variables?.length ? `<span class="dbg-sub">Variables: ${g.origin.variables.map((v) => `{{${escapeHtml(v)}}}`).join(' ')}</span>` : ''
          const detail = g.origin.detail ? `<span class="dbg-sub">${escapeHtml(g.origin.detail)}</span>` : ''
          const bad = /not connected|missing|error/.test(g.origin.label) ? ' class="is-error"' : ''
          return `<tr>
            <td>${escapeHtml(g.name)}</td>
            <td class="dbg-type">${escapeHtml(g.type)}</td>
            <td><span class="dbg-air${g.visible ? ' is-live' : ''}">${g.visible ? 'On air' : 'Off'}</span></td>
            <td><span${bad}>${escapeHtml(g.origin.label)}</span>${detail}${vars}</td>
          </tr>`
        })
        .join('')
    : '<tr><td colspan="4" class="dbg-empty">This project has no graphics.</td></tr>'

  const items = []
  for (const d of s.dataSources) {
    const st = d.status
    const error = st.error ? `<span class="dbg-sub is-error">${escapeHtml(st.error)}</span>` : ''
    const poll = d.pollMs ? `refresh every ${Math.round(d.pollMs / 1000)} s` : 'no auto refresh'
    items.push(`<li><strong>${escapeHtml(d.name)}</strong> · ${escapeHtml(st.state)}, ${st.rowCount} rows, updated ${agoText(st.lastUpdated)}
      <span class="dbg-sub">${escapeHtml(d.where)} · ${poll}${d.holdWhileOnAir ? ' · holds changes while on air' : ''}${st.held.length ? ` · ${st.held.length} held` : ''}</span>${error}</li>`)
  }
  const np = s.nowPlaying
  if (np?.widgets?.length) {
    const snap = np.snapshot || {}
    const track = snap.title ? [snap.title, snap.artist].filter(Boolean).join(' — ') : 'no track'
    const reading = !np.supported
      ? 'not supported on this system'
      : np.polling
        ? `reading every ${Math.round(np.pollMs / 1000)} s`
        : 'not reading (no widget uses Spotify)'
    const error = snap.error ? `<span class="dbg-sub is-error">${escapeHtml(snap.error)}</span>` : ''
    items.push(`<li><strong>Now playing</strong> · Spotify ${escapeHtml(snap.status || 'idle')}, ${escapeHtml(track)}
      <span class="dbg-sub">${reading} · ${np.widgets.length} widget${np.widgets.length === 1 ? '' : 's'}</span>${error}</li>`)
  }
  for (const t of s.f1) {
    if (t.source !== 'multiviewer') {
      items.push(`<li><strong>${escapeHtml(t.name)}</strong> · F1 manual list, ${t.manualRows} rows</li>`)
      continue
    }
    const mv = t.multiviewer
    const st = mv.status || {}
    const state = st.connected ? `connected, ${mv.rows} cars` : st.lastError ? 'not connected' : 'waiting for data'
    const session = [mv.session?.lapText, mv.session?.track && mv.session.track !== 'clear' ? `track: ${mv.session.track}` : ''].filter(Boolean).join(' · ')
    items.push(`<li><strong>${escapeHtml(t.name)}</strong> · F1 MultiViewer, ${escapeHtml(state)}, last data ${agoText(st.lastUpdateAt ? new Date(st.lastUpdateAt).toISOString() : null)}
      <span class="dbg-sub">${escapeHtml(mv.url)} · poll ${mv.pollMs} ms · delay ${mv.delayMs} ms · buffer ${mv.bufferSnapshots} snapshots (${mv.bufferSeconds} s)${session ? ` · ${escapeHtml(session)}` : ''}</span>
      ${st.lastError ? `<span class="dbg-sub is-error">${escapeHtml(st.lastError)}</span>` : ''}</li>`)
  }
  connectorsEl.innerHTML = items.length ? items.join('') : '<li class="dbg-empty">No data sources or F1 towers in this project.</li>'
}

function showBlocked(message) {
  blockedEl.textContent = message
  blockedEl.hidden = false
  mainEl.hidden = true
  summaryEl.textContent = ''
}

async function loadSnapshot() {
  try {
    const res = await fetch('/api/debug?log=0', { cache: 'no-store' })
    const body = await res.json().catch(() => null)
    if (res.status === 403) return showBlocked(body?.error || 'The Debug console only works on the ProVerlay computer itself.')
    if (!res.ok || !body) throw new Error(body?.error || `HTTP ${res.status}`)
    renderSnapshot(body)
  } catch (err) {
    summaryEl.textContent = `Server not reachable (${err.message}). Retrying…`
  }
}

/* -------------------------------------------------------------- report */

$('dbg-copy').addEventListener('click', async (event) => {
  const button = event.currentTarget
  const report = JSON.stringify({ ...snapshot, log: entries.slice(-300) }, null, 2)
  try {
    await navigator.clipboard.writeText(report)
    button.textContent = 'Copied'
  } catch {
    button.textContent = 'Copy failed'
  }
  setTimeout(() => (button.textContent = 'Copy report'), 1800)
})

/* -------------------------------------------------------------- socket */

const socket = window.io()
function subscribe() {
  socket.emit('debug:subscribe', null, (reply) => {
    if (reply?.error) return showBlocked(reply.error)
    // After a reconnect the server may have restarted: its sequence starts again.
    const list = reply?.entries || []
    if (list.length && list[list.length - 1].seq < lastSeq) lastSeq = 0
    addEntries(list)
  })
}
socket.on('connect', subscribe)
socket.on('disconnect', (reason) => {
  if (reason === 'io server disconnect') setTimeout(() => socket.connect(), 1000)
})
socket.on('debug:log', (entry) => addEntries([entry]))

loadSnapshot()
setInterval(loadSnapshot, SNAPSHOT_MS)
updateLogNote(0)
