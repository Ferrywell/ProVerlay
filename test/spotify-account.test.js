import test from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { makeTempDir, startTestServer } from './helpers.js'
import { setDataDir, getDataDir } from '../server/paths.js'
import {
  completeSpotifyLogin,
  createPkcePair,
  getSpotifyAccountStatus,
  isSpotifyLinked,
  parseCurrentlyPlaying,
  readSpotifyAccount,
  resetSpotifyAccountMemory,
  setSpotifyClientId,
  setSpotifyFetch,
  spotifyRedirectUri
} from '../server/spotifyAccount.js'
import { readNowPlaying } from '../server/nowPlaying.js'
import { nowPlayingStatusText } from '../public/shared/now-playing.js'

const CLIENT_ID = '0123456789abcdef0123456789abcdef'

const json = (status, body, headers = {}) =>
  new Response(body === null ? null : JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } })

const track = {
  is_playing: true,
  progress_ms: 61000,
  currently_playing_type: 'track',
  item: {
    type: 'track',
    name: 'Blue Monday',
    duration_ms: 447000,
    artists: [{ name: 'New Order' }, { name: 'Guest' }],
    album: {
      name: 'Substance',
      images: [
        { url: 'https://i.scdn.co/image/640', width: 640 },
        { url: 'https://i.scdn.co/image/300', width: 300 },
        { url: 'https://i.scdn.co/image/64', width: 64 }
      ]
    }
  }
}

/**
 * Fake Spotify: records requests, answers the token, /me and currently-playing
 * endpoints. `player` decides the currently-playing answer.
 */
function fakeSpotify({ player = () => json(200, track) } = {}) {
  const calls = []
  let n = 0
  const fn = async (url, init = {}) => {
    const u = new URL(url)
    const body = init.body ? Object.fromEntries(new URLSearchParams(init.body)) : null
    calls.push({ path: u.pathname, body, auth: init.headers?.Authorization || '' })
    if (u.pathname === '/api/token') {
      n++
      if (body.grant_type === 'refresh_token' && fn.revoked) return json(400, { error: 'invalid_grant', error_description: 'Refresh token revoked' })
      return json(200, { access_token: `access-${n}`, expires_in: 3600, refresh_token: `refresh-${n}` })
    }
    if (u.pathname === '/v1/me') return json(200, { id: 'ferry', display_name: 'Ferry' })
    if (u.pathname === '/v1/me/player/currently-playing') return player(init)
    return json(404, {})
  }
  fn.calls = calls
  return fn
}

/** Fresh data dir and a linked account (login done through the real flow). */
async function linkedAccount(t, spotify) {
  const before = getDataDir()
  const dir = await makeTempDir()
  setDataDir(dir)
  resetSpotifyAccountMemory()
  setSpotifyFetch(spotify)
  t.after(async () => {
    setSpotifyFetch()
    resetSpotifyAccountMemory()
    setDataDir(before)
    await fs.rm(dir, { recursive: true, force: true })
  })
  await setSpotifyClientId(CLIENT_ID)
  const status = await getSpotifyAccountStatus({ port: 2014, local: true })
  const state = new URL(status.loginUrl).searchParams.get('state')
  const result = await completeSpotifyLogin({ code: 'the-code', state })
  assert.equal(result.ok, true, result.message)
  return dir
}

test('PKCE: verifier and S256 challenge', () => {
  const { verifier, challenge } = createPkcePair()
  assert.match(verifier, /^[A-Za-z0-9_-]{43,128}$/)
  assert.equal(challenge, crypto.createHash('sha256').update(verifier).digest('base64url'))
  assert.notEqual(createPkcePair().verifier, verifier)
})

test('redirect URI is a loopback IP, never localhost', () => {
  assert.equal(spotifyRedirectUri(2014), 'http://127.0.0.1:2014/api/spotify/callback')
  assert.equal(spotifyRedirectUri(3000), 'http://127.0.0.1:3000/api/spotify/callback')
})

test('currently playing: track, episode, advert, nothing', () => {
  assert.deepEqual(parseCurrentlyPlaying(200, track), {
    status: 'playing',
    title: 'Blue Monday',
    artist: 'New Order, Guest',
    album: 'Substance',
    artworkUrl: 'https://i.scdn.co/image/300',
    durationMs: 447000,
    positionMs: 61000
  })
  assert.equal(parseCurrentlyPlaying(200, { ...track, is_playing: false }).status, 'paused')
  const episode = parseCurrentlyPlaying(200, {
    is_playing: true,
    currently_playing_type: 'episode',
    item: { type: 'episode', name: 'Ep 1', duration_ms: 1000, show: { name: 'The Show' }, images: [{ url: 'https://i.scdn.co/image/ep', width: 640 }] }
  })
  assert.equal(episode.artist, 'The Show')
  assert.equal(episode.artworkUrl, 'https://i.scdn.co/image/ep')
  assert.deepEqual(parseCurrentlyPlaying(200, { is_playing: true, currently_playing_type: 'ad', item: null }), { status: 'paused' })
  assert.deepEqual(parseCurrentlyPlaying(204, null), { status: 'stopped' })
  // Cover art from anywhere else is dropped.
  const evil = structuredClone(track)
  evil.item.album.images = [{ url: 'https://evil.example/x.jpg', width: 300 }]
  assert.equal(parseCurrentlyPlaying(200, evil).artworkUrl, '')
})

test('login: Client ID check, PKCE URL, code exchange, stored refresh token', async (t) => {
  const spotify = fakeSpotify()
  const before = getDataDir()
  const dir = await makeTempDir()
  setDataDir(dir)
  resetSpotifyAccountMemory()
  setSpotifyFetch(spotify)
  t.after(async () => {
    setSpotifyFetch()
    resetSpotifyAccountMemory()
    setDataDir(before)
    await fs.rm(dir, { recursive: true, force: true })
  })

  await assert.rejects(setSpotifyClientId('not-an-id'), /32 characters/)
  await setSpotifyClientId(CLIENT_ID)

  const remote = await getSpotifyAccountStatus({ port: 2014, local: false })
  assert.equal(remote.loginUrl, '', 'no login link for another device')

  const status = await getSpotifyAccountStatus({ port: 2014, local: true })
  const url = new URL(status.loginUrl)
  assert.equal(url.origin + url.pathname, 'https://accounts.spotify.com/authorize')
  assert.equal(url.searchParams.get('client_id'), CLIENT_ID)
  assert.equal(url.searchParams.get('redirect_uri'), 'http://127.0.0.1:2014/api/spotify/callback')
  assert.equal(url.searchParams.get('code_challenge_method'), 'S256')
  assert.match(url.searchParams.get('scope'), /user-read-currently-playing/)
  // The same link while the login is under way.
  assert.equal((await getSpotifyAccountStatus({ port: 2014, local: true })).loginUrl, status.loginUrl)

  const wrong = await completeSpotifyLogin({ code: 'x', state: 'forged' })
  assert.equal(wrong.ok, false)
  assert.equal(isSpotifyLinked(), false)

  const state = url.searchParams.get('state')
  const result = await completeSpotifyLogin({ code: 'the-code', state })
  assert.equal(result.ok, true)
  assert.equal(result.message, 'Linked to Ferry.')
  const exchange = spotify.calls.find((c) => c.path === '/api/token')
  assert.equal(exchange.body.grant_type, 'authorization_code')
  assert.equal(exchange.body.code, 'the-code')
  assert.equal(exchange.body.client_id, CLIENT_ID)
  assert.equal(crypto.createHash('sha256').update(exchange.body.code_verifier).digest('base64url'), url.searchParams.get('code_challenge'))
  assert.equal(exchange.body.client_secret, undefined, 'PKCE: no client secret')

  // A used state cannot be replayed.
  assert.equal((await completeSpotifyLogin({ code: 'again', state })).ok, false)

  const saved = JSON.parse(await fs.readFile(path.join(dir, 'spotify.json'), 'utf8'))
  assert.equal(saved.clientId, CLIENT_ID)
  assert.equal(saved.refreshToken, 'refresh-1')
  assert.equal(saved.user.name, 'Ferry')
  assert.equal(saved.accessToken, undefined, 'access token stays in memory')

  // Reloaded from disk after a restart.
  resetSpotifyAccountMemory()
  const reloaded = await getSpotifyAccountStatus({ port: 2014, local: true })
  assert.equal(reloaded.linked, true)
  assert.equal(reloaded.name, 'Ferry')
  assert.equal(JSON.stringify(reloaded).includes('refresh-1'), false, 'status never contains tokens')

  // A different Client ID is a different app: the link is dropped.
  await setSpotifyClientId('fedcba9876543210fedcba9876543210')
  assert.equal(isSpotifyLinked(), false)
})

test('reading: the track, a 401 refreshes once, a revoked login unlinks', async (t) => {
  let answer = () => json(200, track)
  const spotify = fakeSpotify({ player: (init) => answer(init) })
  await linkedAccount(t, spotify)

  const r = await readSpotifyAccount()
  assert.equal(r.status, 'playing')
  assert.equal(r.title, 'Blue Monday')
  assert.equal(spotify.calls.at(-1).auth, 'Bearer access-1')

  // Expired access token: refresh once and retry.
  let first = true
  answer = () => {
    if (first) {
      first = false
      return json(401, { error: { status: 401 } })
    }
    return json(204, null)
  }
  assert.deepEqual(await readSpotifyAccount(), { status: 'stopped' })
  assert.equal(spotify.calls.filter((c) => c.body?.grant_type === 'refresh_token').length, 1)

  // Refresh token revoked: the account is unlinked and the error says so.
  answer = () => json(401, {})
  spotify.revoked = true
  const gone = await readSpotifyAccount()
  assert.equal(gone.apiFailed, true)
  assert.match(gone.error, /Log in again/)
  assert.equal(isSpotifyLinked(), false)
})

test('reading: 403 and 429 are reported, 429 waits for Retry-After', async (t) => {
  let answer = () => json(403, {})
  const spotify = fakeSpotify({ player: () => answer() })
  await linkedAccount(t, spotify)

  const refused = await readSpotifyAccount()
  assert.equal(refused.apiFailed, true)
  assert.match(refused.error, /User Management/)

  answer = () => json(429, {}, { 'retry-after': '120' })
  assert.equal((await readSpotifyAccount()).apiFailed, true)
  const before = spotify.calls.length
  assert.equal((await readSpotifyAccount()).apiFailed, true)
  assert.equal(spotify.calls.length, before, 'no request while Spotify asked to wait')
})

test('reader: account first, the app on this computer as fallback', async (t) => {
  let answer = () => json(200, track)
  const spotify = fakeSpotify({ player: () => answer() })
  await linkedAccount(t, spotify)
  const app = { status: 'playing', title: 'Local', artist: 'App', album: '', artworkUrl: '', durationMs: 0, positionMs: 0 }
  let appCalls = 0
  const readApp = async () => {
    appCalls++
    return app
  }

  const viaAccount = await readNowPlaying({ readApp, appSupported: true })
  assert.equal(viaAccount.via, 'account')
  assert.equal(viaAccount.title, 'Blue Monday')
  assert.equal(appCalls, 0, 'the app is not asked while the account answers')

  // Account says nothing plays: that is the answer, no fallback.
  answer = () => json(204, null)
  assert.equal((await readNowPlaying({ readApp, appSupported: true })).status, 'stopped')
  assert.equal(appCalls, 0)

  // API down: the app on this computer takes over.
  answer = () => json(503, {})
  const fallback = await readNowPlaying({ readApp, appSupported: true })
  assert.equal(fallback.via, 'app')
  assert.equal(fallback.title, 'Local')

  // API down and no app to read: the API error is shown.
  const failed = await readNowPlaying({ readApp: async () => ({ status: 'not-running' }), appSupported: true })
  assert.equal(failed.via, 'account')
  assert.equal(failed.status, 'error')
  assert.equal(failed.apiFailed, undefined)
})

test('status text names the account and the fallback', () => {
  const account = { linked: true, name: 'Ferry' }
  assert.equal(nowPlayingStatusText({ status: 'playing', via: 'account', account }), 'Spotify account Ferry is playing')
  assert.equal(nowPlayingStatusText({ status: 'stopped', via: 'account', account }), 'Nothing is playing on Spotify account Ferry')
  assert.match(nowPlayingStatusText({ status: 'playing', via: 'app', account }), /account not reachable/)
  assert.equal(nowPlayingStatusText({ status: 'playing', via: 'app', account: { linked: false } }), 'Spotify is playing')
})

test('API: status, Client ID, logout and callback over HTTP', async (t) => {
  const spotify = fakeSpotify()
  setSpotifyFetch(spotify)
  const srv = await startTestServer()
  t.after(async () => {
    setSpotifyFetch()
    resetSpotifyAccountMemory()
    await srv.close()
  })

  const empty = await srv.get('/api/spotify')
  assert.equal(empty.status, 200)
  assert.equal(empty.json.linked, false)
  assert.equal(empty.json.redirectUri, `http://127.0.0.1:${srv.handle.port}/api/spotify/callback`)

  const bad = await srv.request('PUT', '/api/spotify/client-id', { clientId: 'nope' })
  assert.equal(bad.status, 400)

  const set = await srv.request('PUT', '/api/spotify/client-id', { clientId: CLIENT_ID })
  assert.equal(set.status, 200)
  assert.ok(set.json.loginUrl.startsWith('https://accounts.spotify.com/authorize?'))

  const state = new URL(set.json.loginUrl).searchParams.get('state')
  const forged = await srv.get('/api/spotify/callback?code=x&state=forged')
  assert.equal(forged.status, 400)
  assert.match(forged.text, /expired or was already used/)

  const denied = await srv.get(`/api/spotify/callback?error=access_denied&state=${state}`)
  assert.equal(denied.status, 400)
  assert.match(denied.text, /did not allow/)

  const again = await srv.get('/api/spotify')
  const state2 = new URL(again.json.loginUrl).searchParams.get('state')
  const ok = await srv.get(`/api/spotify/callback?code=c&state=${state2}`)
  assert.equal(ok.status, 200)
  assert.match(ok.text, /Spotify is linked/)
  assert.match(ok.text, /Linked to Ferry/)

  const linked = await srv.get('/api/spotify')
  assert.equal(linked.json.linked, true)
  assert.equal(linked.json.name, 'Ferry')
  assert.equal(linked.json.loginUrl, '')
  assert.equal((await srv.get('/api/now-playing')).json.account.linked, true)

  const out = await srv.post('/api/spotify/logout')
  assert.equal(out.status, 200)
  assert.equal(out.json.linked, false)
  assert.equal(out.json.clientId, CLIENT_ID, 'Client ID stays after logout')
})
