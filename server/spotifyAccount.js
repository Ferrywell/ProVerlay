/**
 * Spotify account link for the now-playing widget: the Spotify Web API with the
 * Authorization Code flow with PKCE (no client secret).
 *
 * The user creates their own app in the Spotify developer dashboard, pastes its
 * Client ID into ProVerlay and logs in once. ProVerlay keeps the refresh token
 * and asks Spotify what the account is playing, on whatever device it plays.
 *
 * Storage is per computer, not per project: <dataDir>/spotify.json, never part
 * of a project export. Tokens never leave the server; the API only reports
 * whether an account is linked and its display name.
 *
 * Spotify rules (2026): the app owner needs Premium, one Client ID per developer,
 * at most five accounts per Client ID (added under User Management), and the
 * redirect URI must be a loopback IP (http://127.0.0.1:<port>/…), not localhost.
 */
import fs from 'fs/promises'
import path from 'path'
import crypto from 'crypto'
import { getDataDir } from './paths.js'
import { writeJsonAtomic } from './writeQueue.js'
import { debugLog } from './debugLog.js'
import { cleanArtworkUrl } from './artworkUrl.js'

const AUTHORIZE_URL = 'https://accounts.spotify.com/authorize'
const TOKEN_URL = 'https://accounts.spotify.com/api/token'
const API_URL = 'https://api.spotify.com/v1'
const SCOPES = 'user-read-currently-playing user-read-playback-state'
const CLIENT_ID_RE = /^[0-9a-f]{32}$/i
const PENDING_TTL_MS = 10 * 60 * 1000
const REQUEST_TIMEOUT_MS = 5000
const ACCESS_MARGIN_MS = 60 * 1000
const MAX_TEXT = 300
export const SPOTIFY_CALLBACK_PATH = '/api/spotify/callback'

let fetchImpl = (...args) => globalThis.fetch(...args)
let loadedFor = null
let account = emptyAccount()
let access = { token: '', expiresAt: 0 }
let refreshing = null
let pending = null
let retryAfterUntil = 0
let lastError = ''
const listeners = new Set()

function emptyAccount() {
  return { clientId: '', refreshToken: '', user: { id: '', name: '' } }
}

const clean = (value) =>
  String(value ?? '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .trim()
    .slice(0, MAX_TEXT)

class SpotifyError extends Error {
  constructor(message, { status = 0, unlink = false } = {}) {
    super(message)
    this.status = status
    this.unlink = unlink
  }
}

/** Replace fetch (tests). Pass nothing to restore the real one. */
export function setSpotifyFetch(fn) {
  fetchImpl = typeof fn === 'function' ? fn : (...args) => globalThis.fetch(...args)
}

/** Called after the link changes (log in, log out, new Client ID). */
export function onSpotifyAccountChange(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

function notify() {
  for (const fn of listeners) {
    try {
      fn()
    } catch (err) {
      console.error('[spotify] listener failed:', err.message)
    }
  }
}

function accountFile() {
  return path.join(getDataDir(), 'spotify.json')
}

export function isValidSpotifyClientId(value) {
  return typeof value === 'string' && CLIENT_ID_RE.test(value.trim())
}

export function spotifyRedirectUri(port) {
  return `http://127.0.0.1:${Number(port) || 2014}${SPOTIFY_CALLBACK_PATH}`
}

/** Read spotify.json once per data directory. Missing or broken file = not linked. */
export async function loadSpotifyAccount() {
  const dir = getDataDir()
  if (loadedFor === dir) return
  loadedFor = dir
  account = emptyAccount()
  access = { token: '', expiresAt: 0 }
  pending = null
  lastError = ''
  try {
    const raw = JSON.parse(await fs.readFile(accountFile(), 'utf8'))
    account = {
      clientId: isValidSpotifyClientId(raw?.clientId) ? raw.clientId.trim() : '',
      refreshToken: typeof raw?.refreshToken === 'string' ? raw.refreshToken : '',
      user: { id: clean(raw?.user?.id), name: clean(raw?.user?.name) }
    }
  } catch (err) {
    if (err.code !== 'ENOENT') console.warn('[spotify] Could not read spotify.json:', err.message)
  }
}

async function saveAccount() {
  const file = accountFile()
  await fs.mkdir(path.dirname(file), { recursive: true })
  await writeJsonAtomic(file, account)
  // Only this user may read the refresh token (no effect on Windows).
  await fs.chmod(file, 0o600).catch(() => {})
}

/** True when an account is linked (after loadSpotifyAccount). */
export function isSpotifyLinked() {
  return Boolean(account.clientId && account.refreshToken)
}

/** Small public summary, safe to send to every page. */
export function spotifyAccountSummary() {
  return { linked: isSpotifyLinked(), name: account.user.name || '' }
}

/**
 * Status for the operate card. `loginUrl` only for a request from this computer
 * with a Client ID and no linked account: Spotify sends the browser back to
 * 127.0.0.1, so logging in from another device cannot work.
 */
export async function getSpotifyAccountStatus({ port, local = false } = {}) {
  await loadSpotifyAccount()
  const redirectUri = spotifyRedirectUri(port)
  const status = {
    clientId: account.clientId,
    linked: isSpotifyLinked(),
    name: account.user.name || '',
    error: lastError,
    redirectUri,
    local: Boolean(local),
    loginUrl: ''
  }
  if (local && account.clientId && !status.linked) status.loginUrl = prepareLogin(redirectUri)
  return status
}

/** New or changed Client ID: a different app, so any linked account is dropped. */
export async function setSpotifyClientId(value) {
  await loadSpotifyAccount()
  const clientId = String(value ?? '').trim()
  if (clientId && !isValidSpotifyClientId(clientId)) {
    const err = new Error('Client ID: expected the 32 characters from the Spotify developer dashboard')
    err.status = 400
    throw err
  }
  if (clientId === account.clientId) return
  account = { ...emptyAccount(), clientId }
  access = { token: '', expiresAt: 0 }
  pending = null
  lastError = ''
  await saveAccount()
  debugLog('data', clientId ? 'Spotify: Client ID saved' : 'Spotify: Client ID removed')
  notify()
}

/** Forget the linked account; the Client ID stays. */
export async function disconnectSpotify() {
  await loadSpotifyAccount()
  if (!account.refreshToken && !account.user.name) return
  account = { ...account, refreshToken: '', user: { id: '', name: '' } }
  access = { token: '', expiresAt: 0 }
  lastError = ''
  await saveAccount()
  debugLog('data', 'Spotify: logged out')
  notify()
}

function base64url(buffer) {
  return Buffer.from(buffer).toString('base64url')
}

/** PKCE pair: a random verifier and its S256 challenge. */
export function createPkcePair() {
  const verifier = base64url(crypto.randomBytes(48))
  const challenge = base64url(crypto.createHash('sha256').update(verifier).digest())
  return { verifier, challenge }
}

/* One login at a time; the same URL is reused while it is fresh, so the card's
   regular status refresh does not invalidate a login that is under way. */
function prepareLogin(redirectUri) {
  const now = Date.now()
  if (pending && pending.redirectUri === redirectUri && pending.clientId === account.clientId && now - pending.createdAt < PENDING_TTL_MS) {
    return pending.url
  }
  const { verifier, challenge } = createPkcePair()
  const state = base64url(crypto.randomBytes(16))
  const url = new URL(AUTHORIZE_URL)
  url.search = new URLSearchParams({
    client_id: account.clientId,
    response_type: 'code',
    redirect_uri: redirectUri,
    code_challenge_method: 'S256',
    code_challenge: challenge,
    scope: SCOPES,
    state
  }).toString()
  pending = { state, verifier, redirectUri, clientId: account.clientId, createdAt: now, url: url.href }
  return pending.url
}

async function request(url, init = {}) {
  try {
    return await fetchImpl(url, { ...init, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) })
  } catch (err) {
    const timedOut = err?.name === 'TimeoutError' || err?.name === 'AbortError'
    throw new SpotifyError(timedOut ? 'Spotify did not answer in time' : 'Could not reach Spotify (no internet?)')
  }
}

async function tokenRequest(params) {
  const res = await request(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params).toString()
  })
  let body = {}
  try {
    body = await res.json()
  } catch {
    /* not JSON */
  }
  if (!res.ok) {
    const code = clean(body?.error)
    const detail = clean(body?.error_description)
    // invalid_grant: the refresh token was revoked or expired; invalid_client: the app is gone.
    const unlink = code === 'invalid_grant' || code === 'invalid_client'
    throw new SpotifyError(detail || code || `Spotify answered ${res.status}`, { status: res.status, unlink })
  }
  if (typeof body?.access_token !== 'string' || !body.access_token) throw new SpotifyError('Spotify sent no access token')
  return body
}

function storeAccess(body) {
  const seconds = Number(body.expires_in)
  access = {
    token: body.access_token,
    expiresAt: Date.now() + (Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : 3600 * 1000) - ACCESS_MARGIN_MS
  }
}

/**
 * Finish a login: the browser came back on /api/spotify/callback.
 * @returns {Promise<{ ok: boolean, message: string }>}
 */
export async function completeSpotifyLogin({ code, state, error } = {}) {
  await loadSpotifyAccount()
  const login = pending
  if (!login || typeof state !== 'string' || state !== login.state || Date.now() - login.createdAt > PENDING_TTL_MS) {
    return { ok: false, message: 'This login link has expired or was already used. Start the login again from ProVerlay.' }
  }
  pending = null
  if (error) {
    const message = error === 'access_denied' ? 'You did not allow ProVerlay to read Spotify.' : `Spotify refused the login (${clean(error)}).`
    return { ok: false, message }
  }
  if (typeof code !== 'string' || !code) return { ok: false, message: 'Spotify sent no login code.' }
  try {
    const body = await tokenRequest({
      grant_type: 'authorization_code',
      code,
      redirect_uri: login.redirectUri,
      client_id: login.clientId,
      code_verifier: login.verifier
    })
    if (typeof body.refresh_token !== 'string' || !body.refresh_token) throw new SpotifyError('Spotify sent no refresh token')
    storeAccess(body)
    account = { clientId: login.clientId, refreshToken: body.refresh_token, user: await fetchUser().catch(() => ({ id: '', name: '' })) }
    lastError = ''
    retryAfterUntil = 0
    await saveAccount()
    debugLog('data', `Spotify: linked${account.user.name ? ` to ${account.user.name}` : ''}`)
    notify()
    return { ok: true, message: account.user.name ? `Linked to ${account.user.name}.` : 'Spotify is linked.' }
  } catch (err) {
    debugLog('data', `Spotify: login failed: ${err.message}`, { level: 'warn' })
    return { ok: false, message: `Login failed: ${err.message}` }
  }
}

async function fetchUser() {
  const res = await request(`${API_URL}/me`, { headers: { Authorization: `Bearer ${access.token}` } })
  if (!res.ok) return { id: '', name: '' }
  const me = await res.json()
  return { id: clean(me?.id), name: clean(me?.display_name || me?.id) }
}

async function refreshAccess() {
  if (refreshing) return refreshing
  refreshing = (async () => {
    try {
      const body = await tokenRequest({
        grant_type: 'refresh_token',
        refresh_token: account.refreshToken,
        client_id: account.clientId
      })
      storeAccess(body)
      // Spotify may rotate the refresh token; the old one then stops working.
      if (typeof body.refresh_token === 'string' && body.refresh_token && body.refresh_token !== account.refreshToken) {
        account = { ...account, refreshToken: body.refresh_token }
        await saveAccount()
      }
    } catch (err) {
      if (err.unlink) {
        account = { ...account, refreshToken: '' }
        access = { token: '', expiresAt: 0 }
        await saveAccount().catch(() => {})
        lastError = 'Spotify ended the link. Log in again.'
        debugLog('data', `Spotify: link ended (${err.message})`, { level: 'warn' })
        notify()
        throw new SpotifyError(lastError)
      }
      throw err
    } finally {
      refreshing = null
    }
  })()
  return refreshing
}

async function accessToken() {
  if (!access.token || Date.now() >= access.expiresAt) await refreshAccess()
  return access.token
}

function pickImage(images) {
  const list = (Array.isArray(images) ? images : []).filter((i) => i && typeof i.url === 'string')
  if (!list.length) return ''
  // Smallest image that is still at least 300 px wide (the plate shows it small).
  const sorted = [...list].sort((a, b) => (Number(a.width) || 0) - (Number(b.width) || 0))
  const fit = sorted.find((i) => (Number(i.width) || 0) >= 300) || sorted[sorted.length - 1]
  return cleanArtworkUrl(fit.url)
}

/**
 * GET /me/player/currently-playing → reading (same shape as the app readers).
 * @param {number} status HTTP status
 * @param {object|null} body parsed JSON (null for 204)
 */
export function parseCurrentlyPlaying(status, body) {
  if (status === 204 || !body) return { status: 'stopped' }
  const item = body.item
  // Adverts and private sessions come without an item: treat as a pause.
  if (!item) return { status: 'paused' }
  const episode = body.currently_playing_type === 'episode' || item.type === 'episode'
  const artist = episode
    ? clean(item.show?.name)
    : clean((Array.isArray(item.artists) ? item.artists : []).map((a) => a?.name).filter(Boolean).join(', '))
  const n = (v) => (Number.isFinite(Number(v)) && Number(v) >= 0 ? Math.round(Number(v)) : 0)
  return {
    status: body.is_playing ? 'playing' : 'paused',
    title: clean(item.name),
    artist,
    album: clean(episode ? item.show?.name : item.album?.name),
    artworkUrl: pickImage(episode ? item.images || item.show?.images : item.album?.images),
    durationMs: n(item.duration_ms),
    positionMs: n(body.progress_ms)
  }
}

function describeApiError(status) {
  if (status === 401) return 'Spotify did not accept the login. Log in again.'
  if (status === 403) {
    return 'Spotify refused: add this account under User Management in your Spotify app, and check that the app owner has Premium.'
  }
  if (status === 429) return 'Spotify asks ProVerlay to slow down; using the app on this computer for now.'
  return `Spotify answered ${status}`
}

/**
 * Ask Spotify what the linked account plays. Never throws.
 * `apiFailed: true` means the API could not answer (the caller may fall back to the app).
 * @returns {Promise<object|null>} null when no account is linked
 */
export async function readSpotifyAccount() {
  await loadSpotifyAccount()
  if (!isSpotifyLinked()) return null
  if (Date.now() < retryAfterUntil) return { status: 'error', error: describeApiError(429), apiFailed: true }
  try {
    for (let attempt = 0; attempt < 2; attempt++) {
      const token = await accessToken()
      const res = await request(`${API_URL}/me/player/currently-playing?additional_types=episode`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      if (res.status === 401 && attempt === 0) {
        access = { token: '', expiresAt: 0 }
        continue
      }
      if (res.status === 429) {
        const seconds = Number(res.headers.get('retry-after'))
        retryAfterUntil = Date.now() + (Number.isFinite(seconds) && seconds > 0 ? Math.min(seconds, 600) : 30) * 1000
      }
      if (res.status !== 200 && res.status !== 204) {
        lastError = describeApiError(res.status)
        return { status: 'error', error: lastError, apiFailed: true }
      }
      const body = res.status === 204 ? null : await res.json().catch(() => null)
      lastError = ''
      return parseCurrentlyPlaying(res.status, body)
    }
    lastError = describeApiError(401)
    return { status: 'error', error: lastError, apiFailed: true }
  } catch (err) {
    lastError = clean(err.message) || 'Could not read Spotify'
    return { status: 'error', error: lastError, apiFailed: true }
  }
}

/** Forget everything in memory (tests, server shutdown). The file stays. */
export function resetSpotifyAccountMemory() {
  loadedFor = null
  account = emptyAccount()
  access = { token: '', expiresAt: 0 }
  refreshing = null
  pending = null
  retryAfterUntil = 0
  lastError = ''
}
