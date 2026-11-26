/**
 * Now playing: the track the Spotify desktop app on this computer is playing.
 *
 * No Spotify account, API key or internet connection is involved: ProVerlay asks
 * the app itself.
 *   macOS    AppleScript (`osascript`): title, artist, album, cover art, play state.
 *            The first time, macOS asks whether ProVerlay may control Spotify.
 *   Windows  the Spotify window title ("Artist - Title"). No album or cover art,
 *            and a paused player cannot be told apart from an idle one.
 *   other    not supported; the widget then shows its manual text.
 *
 * One poller serves every `nowPlaying` widget (the source is the computer, not the
 * widget). It only runs while the active project has a widget with source
 * `spotify`, and broadcasts `nowPlayingUpdate` when something changes.
 */
import { execFile } from 'node:child_process'
import { getState, onStateChange } from './state.js'
import { debugLog } from './debugLog.js'

export const NOW_PLAYING_POLL_MIN_MS = 1000
export const NOW_PLAYING_POLL_MAX_MS = 60000
export const NOW_PLAYING_POLL_DEFAULT_MS = 2000
const READ_TIMEOUT_MS = 4000
const MAX_TEXT = 300

const SEP = '\u001f'

/* Spotify must already be running: `application "Spotify" is running` never starts it. */
const MAC_SCRIPT = `
if application "Spotify" is running then
  tell application "Spotify"
    set sep to (ASCII character 31)
    set st to (player state as text)
    if st is "stopped" then return "stopped"
    set t to current track
    return st & sep & (name of t) & sep & (artist of t) & sep & (album of t) & sep & (artwork url of t) & sep & (duration of t) & sep & (player position as text)
  end tell
else
  return "not-running"
end if`

const WINDOWS_COMMAND =
  "[Console]::OutputEncoding=[System.Text.Encoding]::UTF8; $p=@(Get-Process -Name Spotify -ErrorAction SilentlyContinue); if($p.Count -eq 0){'not-running'}else{'running'; $p | Where-Object {$_.MainWindowTitle} | ForEach-Object {$_.MainWindowTitle}}"

/* Window titles Spotify shows when nothing is playing. */
const WINDOWS_IDLE_TITLES = new Set(['spotify', 'spotify premium', 'spotify free', 'advertisement'])

const clean = (value) =>
  String(value ?? '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .trim()
    .slice(0, MAX_TEXT)

/** Cover art only from Spotify's own image host, over https. */
export function cleanArtworkUrl(value) {
  const text = String(value ?? '').trim()
  if (!text) return ''
  try {
    const url = new URL(text)
    if (url.protocol !== 'https:' || url.hostname !== 'i.scdn.co') return ''
    return url.href
  } catch {
    return ''
  }
}

const number = (value) => {
  const n = Number(String(value ?? '').replace(',', '.'))
  return Number.isFinite(n) && n >= 0 ? n : 0
}

/** Output of MAC_SCRIPT → reading. */
export function parseMacOutput(stdout) {
  const text = String(stdout ?? '').replace(/\r?\n$/, '')
  if (text.trim() === 'not-running') return { status: 'not-running' }
  if (text.trim() === 'stopped') return { status: 'stopped' }
  const [state, title, artist, album, artwork, duration, position] = text.split(SEP)
  if (title === undefined) return { status: 'error', error: 'Unexpected answer from Spotify' }
  return {
    status: state.trim() === 'playing' ? 'playing' : 'paused',
    title: clean(title),
    artist: clean(artist),
    album: clean(album),
    artworkUrl: cleanArtworkUrl(artwork),
    durationMs: Math.round(number(duration)),
    // AppleScript reports the position in seconds, with the system's decimal mark.
    positionMs: Math.round(number(position) * 1000)
  }
}

/** "Artist - Title" (the title may itself contain " - "). */
export function splitWindowTitle(windowTitle) {
  const text = String(windowTitle ?? '').trim()
  const at = text.indexOf(' - ')
  if (at < 0) return { artist: '', title: clean(text) }
  return { artist: clean(text.slice(0, at)), title: clean(text.slice(at + 3)) }
}

/** Output of WINDOWS_COMMAND → reading. */
export function parseWindowsOutput(stdout) {
  const lines = String(stdout ?? '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
  if (!lines.length || lines[0] === 'not-running') return { status: 'not-running' }
  const title = lines.slice(1).find((line) => !WINDOWS_IDLE_TITLES.has(line.toLowerCase()))
  if (!title) return { status: 'paused' }
  return { status: 'playing', ...splitWindowTitle(title), album: '', artworkUrl: '', durationMs: 0, positionMs: 0 }
}

function run(file, args) {
  return new Promise((resolve, reject) => {
    execFile(file, args, { timeout: READ_TIMEOUT_MS, windowsHide: true, maxBuffer: 256 * 1024 }, (err, stdout, stderr) => {
      if (err) {
        err.stderr = String(stderr || '')
        reject(err)
      } else resolve(String(stdout))
    })
  })
}

function describeReadError(err) {
  const text = `${err?.stderr || ''} ${err?.message || ''}`
  // -1743: the user has not allowed (or has denied) automation of Spotify.
  if (/-1743|not authori[sz]ed|Not allowed to send Apple events/i.test(text)) {
    return 'ProVerlay may not control Spotify. Allow it in System Settings → Privacy & Security → Automation.'
  }
  if (err?.code === 'ENOENT') return 'Could not start the helper that reads Spotify'
  if (err?.killed || err?.signal) return 'Spotify did not answer in time'
  return clean(err?.stderr || err?.message || 'Could not read Spotify').slice(0, 200)
}

export function nowPlayingSupported(platform = process.platform) {
  return platform === 'darwin' || platform === 'win32'
}

/** Ask the Spotify app once. Never throws; problems come back as status `error`. */
export async function readSpotify(platform = process.platform) {
  try {
    if (platform === 'darwin') return parseMacOutput(await run('osascript', ['-e', MAC_SCRIPT]))
    if (platform === 'win32') {
      return parseWindowsOutput(
        await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', WINDOWS_COMMAND])
      )
    }
    return { status: 'unsupported' }
  } catch (err) {
    return { status: 'error', error: describeReadError(err) }
  }
}

/* ------------------------------------------------------------------ poller */

let ioRef = null
let unsubscribe = null
let timer = null
let timerMs = 0
let inFlight = false
let reader = readSpotify

const emptySnapshot = () => ({
  status: nowPlayingSupported() ? 'idle' : 'unsupported',
  playing: false,
  title: '',
  artist: '',
  album: '',
  artworkUrl: '',
  durationMs: 0,
  error: '',
  updatedAt: null
})

let snapshot = emptySnapshot()

/** Replace the function that reads Spotify (tests). Pass nothing to restore the real one. */
export function setNowPlayingReader(fn) {
  reader = typeof fn === 'function' ? fn : readSpotify
}

/** Latest reading, for GET /api/now-playing and the first paint of a render page. */
export function getNowPlayingSnapshot() {
  return { ...snapshot, polling: Boolean(timer), supported: nowPlayingSupported() }
}

/**
 * Merge a reading into the snapshot. The last track stays known while the player
 * is paused or closed, so a widget that does not hide when idle keeps its text.
 */
export function mergeReading(previous, reading, at = new Date().toISOString()) {
  const status = reading?.status || 'error'
  const next = { ...previous, status, playing: status === 'playing', error: clean(reading?.error || '') }
  if (reading?.title) {
    next.title = reading.title
    next.artist = reading.artist || ''
    next.album = reading.album || ''
    next.artworkUrl = reading.artworkUrl || ''
    next.durationMs = reading.durationMs || 0
  }
  const changed =
    next.status !== previous.status ||
    next.title !== previous.title ||
    next.artist !== previous.artist ||
    next.album !== previous.album ||
    next.artworkUrl !== previous.artworkUrl ||
    next.error !== previous.error
  if (changed) next.updatedAt = at
  return { next, changed }
}

function describeSnapshot(s) {
  if (s.status === 'playing') return `Spotify is playing "${s.title}"${s.artist ? ` by ${s.artist}` : ''}`
  if (s.status === 'paused') return 'Spotify is paused'
  if (s.status === 'stopped') return 'Spotify has no track loaded'
  if (s.status === 'not-running') return 'Spotify is not running on this computer'
  if (s.status === 'unsupported') return 'Reading Spotify is not supported on this system'
  return `Could not read Spotify: ${s.error || 'unknown error'}`
}

/** One read; broadcasts when something changed. Exported so tests can step it. */
export async function pollNowPlayingOnce() {
  if (inFlight) return getNowPlayingSnapshot()
  inFlight = true
  try {
    const reading = await reader()
    const { next, changed } = mergeReading(snapshot, reading)
    snapshot = next
    if (changed) {
      const level = next.status === 'error' ? 'warn' : 'info'
      debugLog('data', `Now playing: ${describeSnapshot(next)}`, { level })
      ioRef?.emit('nowPlayingUpdate', getNowPlayingSnapshot())
    }
  } finally {
    inFlight = false
  }
  return getNowPlayingSnapshot()
}

export function clampPollMs(value) {
  const n = Number(value)
  if (!Number.isFinite(n)) return NOW_PLAYING_POLL_DEFAULT_MS
  return Math.min(NOW_PLAYING_POLL_MAX_MS, Math.max(NOW_PLAYING_POLL_MIN_MS, Math.round(n)))
}

/** Poll interval the current widgets ask for, or 0 when none reads Spotify. */
export function wantedPollMs(state) {
  let wanted = 0
  for (const g of state?.graphics || []) {
    if (g?.type !== 'nowPlaying' || (g.data?.source || 'spotify') !== 'spotify') continue
    const ms = clampPollMs(g.data?.pollMs)
    wanted = wanted ? Math.min(wanted, ms) : ms
  }
  return wanted
}

function stopPoller() {
  if (!timer) return
  clearInterval(timer)
  timer = null
  timerMs = 0
  debugLog('data', 'Now playing: stopped reading Spotify')
}

function reconcile(state) {
  const wanted = nowPlayingSupported() || reader !== readSpotify ? wantedPollMs(state) : 0
  if (!wanted) return stopPoller()
  if (timer && timerMs === wanted) return
  if (timer) clearInterval(timer)
  else debugLog('data', `Now playing: reading Spotify on this computer every ${wanted} ms`)
  timerMs = wanted
  timer = setInterval(() => void pollNowPlayingOnce(), wanted)
  timer.unref?.()
  void pollNowPlayingOnce()
}

/** For the Debug console. */
export function nowPlayingDebugStatus() {
  const widgets = (getState().graphics || []).filter((g) => g.type === 'nowPlaying')
  return {
    supported: nowPlayingSupported(),
    polling: Boolean(timer),
    pollMs: timerMs,
    widgets: widgets.map((g) => ({
      graphicId: g.id,
      name: g.name || g.id,
      visible: Boolean(g.visible),
      source: (g.data?.source || 'spotify') === 'manual' ? 'manual' : 'spotify'
    })),
    snapshot: { ...snapshot }
  }
}

export function initNowPlaying(io) {
  ioRef = io
  unsubscribe?.()
  unsubscribe = onStateChange(reconcile)
  reconcile(getState())
}

/** Stop the poller and detach from state changes (server shutdown). */
export function shutdownNowPlaying() {
  unsubscribe?.()
  unsubscribe = null
  stopPoller()
  ioRef = null
  snapshot = emptySnapshot()
}
