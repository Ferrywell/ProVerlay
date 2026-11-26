import test from 'node:test'
import assert from 'node:assert/strict'
import { startTestServer } from './helpers.js'
import {
  cleanArtworkUrl,
  clampPollMs,
  getNowPlayingSnapshot,
  mergeReading,
  parseMacOutput,
  parseWindowsOutput,
  pollNowPlayingOnce,
  setNowPlayingReader,
  splitWindowTitle,
  wantedPollMs
} from '../server/nowPlaying.js'
import { nowPlayingLine, nowPlayingStatusText, nowPlayingView, nowPlayingWidth } from '../public/shared/now-playing.js'

const SEP = '\u001f'
const mac = (...parts) => parts.join(SEP) + '\n'

test('macOS: a playing track is parsed with cover art, duration and position', () => {
  const out = mac('playing', 'Blue Monday', 'New Order', 'Substance', 'https://i.scdn.co/image/ab67616d0000b273abc', '447000', '12,5')
  assert.deepEqual(parseMacOutput(out), {
    status: 'playing',
    title: 'Blue Monday',
    artist: 'New Order',
    album: 'Substance',
    artworkUrl: 'https://i.scdn.co/image/ab67616d0000b273abc',
    durationMs: 447000,
    positionMs: 12500
  })
})

test('macOS: paused, stopped, not running and garbage', () => {
  assert.equal(parseMacOutput(mac('paused', 'T', 'A', 'Al', '', '1000', '0.5')).status, 'paused')
  assert.deepEqual(parseMacOutput('stopped\n'), { status: 'stopped' })
  assert.deepEqual(parseMacOutput('not-running\n'), { status: 'not-running' })
  assert.equal(parseMacOutput('something else').status, 'error')
})

test('macOS: titles keep their punctuation, control characters are dropped', () => {
  const r = parseMacOutput(mac('playing', 'Song - Live (2019) "Remaster"', 'A & B', '', '', '0', '0'))
  assert.equal(r.title, 'Song - Live (2019) "Remaster"')
  assert.equal(r.artist, 'A & B')
  assert.equal(parseMacOutput(mac('playing', 'Line\tone', 'A', '', '', '0', '0')).title, 'Line one')
})

test('cover art is only accepted from Spotify over https', () => {
  assert.equal(cleanArtworkUrl('https://i.scdn.co/image/abc'), 'https://i.scdn.co/image/abc')
  assert.equal(cleanArtworkUrl('http://i.scdn.co/image/abc'), '')
  assert.equal(cleanArtworkUrl('https://evil.example/i.scdn.co/abc'), '')
  assert.equal(cleanArtworkUrl('https://i.scdn.co.evil.example/abc'), '')
  assert.equal(cleanArtworkUrl('javascript:alert(1)'), '')
  assert.equal(cleanArtworkUrl(''), '')
})

test('Windows: window title is split on the first " - "', () => {
  assert.deepEqual(splitWindowTitle('New Order - Blue Monday - 2011 Remaster'), {
    artist: 'New Order',
    title: 'Blue Monday - 2011 Remaster'
  })
  assert.deepEqual(splitWindowTitle('Just a title'), { artist: '', title: 'Just a title' })
})

test('Windows: not running, idle and playing', () => {
  assert.deepEqual(parseWindowsOutput('not-running\r\n'), { status: 'not-running' })
  assert.deepEqual(parseWindowsOutput(''), { status: 'not-running' })
  assert.deepEqual(parseWindowsOutput('running\r\nSpotify Premium\r\n'), { status: 'paused' })
  assert.deepEqual(parseWindowsOutput('running\r\n'), { status: 'paused' })
  const r = parseWindowsOutput('running\r\nBeyoncé - Halo\r\n')
  assert.equal(r.status, 'playing')
  assert.equal(r.artist, 'Beyoncé')
  assert.equal(r.title, 'Halo')
  assert.equal(r.artworkUrl, '')
})

test('the last track stays known while paused or closed', () => {
  const start = { status: 'idle', playing: false, title: '', artist: '', album: '', artworkUrl: '', durationMs: 0, error: '', updatedAt: null }
  const a = mergeReading(start, { status: 'playing', title: 'T', artist: 'A' }, 't1')
  assert.equal(a.changed, true)
  assert.equal(a.next.playing, true)
  assert.equal(a.next.updatedAt, 't1')

  const same = mergeReading(a.next, { status: 'playing', title: 'T', artist: 'A' }, 't2')
  assert.equal(same.changed, false)
  assert.equal(same.next.updatedAt, 't1')

  const paused = mergeReading(a.next, { status: 'paused' }, 't3')
  assert.equal(paused.changed, true)
  assert.equal(paused.next.playing, false)
  assert.equal(paused.next.title, 'T')

  const failed = mergeReading(paused.next, { status: 'error', error: 'nope' }, 't4')
  assert.equal(failed.next.error, 'nope')
  assert.equal(failed.next.title, 'T')
})

test('poll interval: clamped, and the fastest Spotify widget wins', () => {
  assert.equal(clampPollMs(10), 1000)
  assert.equal(clampPollMs(999999), 60000)
  assert.equal(clampPollMs('abc'), 2000)
  assert.equal(wantedPollMs({ graphics: [] }), 0)
  assert.equal(
    wantedPollMs({
      graphics: [
        { type: 'nowPlaying', data: { source: 'manual', pollMs: 1000 } },
        { type: 'nowPlaying', data: { source: 'spotify', pollMs: 5000 } },
        { type: 'nowPlaying', data: { pollMs: 3000 } },
        { type: 'message', data: {} }
      ]
    }),
    3000
  )
})

test('view: live track, hide when paused, manual fallback', () => {
  const playing = { playing: true, title: 'T', artist: 'A', artworkUrl: 'https://i.scdn.co/image/x' }
  const paused = { ...playing, playing: false }

  const v = nowPlayingView({ source: 'spotify' }, playing)
  assert.equal(v.show, true)
  assert.equal(v.from, 'spotify')
  assert.equal(v.label, 'Now playing')
  assert.equal(nowPlayingLine(v), 'T — A')
  assert.equal(v.artworkUrl, 'https://i.scdn.co/image/x')

  assert.equal(nowPlayingView({ source: 'spotify', showArtwork: false }, playing).artworkUrl, '')
  assert.equal(nowPlayingView({ source: 'spotify' }, paused).show, false)
  assert.equal(nowPlayingView({ source: 'spotify', hideWhenIdle: false }, paused).show, true)

  const fallback = nowPlayingView({ source: 'spotify', title: 'Station name' }, paused)
  assert.equal(fallback.from, 'manual')
  assert.equal(fallback.title, 'Station name')

  const manual = nowPlayingView({ source: 'manual', title: 'Mine', artist: 'Me', label: '' }, playing)
  assert.equal(manual.from, 'manual')
  assert.equal(manual.title, 'Mine')
  assert.equal(manual.label, '')

  assert.equal(nowPlayingView({ source: 'spotify' }, null).show, false)
  assert.equal(nowPlayingLine(nowPlayingView({}, null)), '')
})

test('view: width is clamped, status text covers every state', () => {
  assert.equal(nowPlayingWidth({}), 620)
  assert.equal(nowPlayingWidth({ widthPx: 10 }), 240)
  assert.equal(nowPlayingWidth({ widthPx: 99999 }), 1600)
  for (const status of ['playing', 'paused', 'stopped', 'not-running', 'unsupported', 'idle']) {
    assert.ok(nowPlayingStatusText({ status }).length > 5)
  }
  assert.equal(nowPlayingStatusText({ status: 'error', error: 'Denied' }), 'Denied')
})

test('API: create a now-playing widget, validate patches, read the live track', async (t) => {
  let reading = { status: 'playing', title: 'Blue Monday', artist: 'New Order', artworkUrl: 'https://i.scdn.co/image/abc' }
  setNowPlayingReader(async () => reading)
  const srv = await startTestServer()
  t.after(async () => {
    await srv.close()
    setNowPlayingReader()
  })

  // No widget yet: nothing is read.
  assert.equal((await srv.get('/api/now-playing')).json.polling, false)

  const created = await srv.post('/api/graphics', { type: 'nowPlaying', name: 'Now playing' })
  assert.equal(created.status, 201)
  const g = created.json
  assert.match(g.id, /^now-playing-/)
  assert.equal(g.position, 'custom')
  assert.equal(g.data.source, 'spotify')
  assert.equal(g.data.hideWhenIdle, true)

  await pollNowPlayingOnce()
  let live = (await srv.get('/api/now-playing')).json
  assert.equal(live.polling, true)
  assert.equal(live.playing, true)
  assert.equal(live.title, 'Blue Monday')
  assert.equal(live.artist, 'New Order')
  assert.equal(getNowPlayingSnapshot().artworkUrl, 'https://i.scdn.co/image/abc')

  reading = { status: 'paused' }
  await pollNowPlayingOnce()
  live = (await srv.get('/api/now-playing')).json
  assert.equal(live.playing, false)
  assert.equal(live.title, 'Blue Monday')

  const ok = await srv.patch(`/api/graphics/${g.id}`, { data: { source: 'manual', title: 'Typed', artist: 'By hand', pollMs: 5000 } })
  assert.equal(ok.status, 200)
  assert.equal(ok.json.data.title, 'Typed')
  // Manual only: the reader stops.
  assert.equal((await srv.get('/api/now-playing')).json.polling, false)

  for (const data of [
    { source: 'lastfm' },
    { title: 42 },
    { title: 'x'.repeat(301) },
    { pollMs: 10 },
    { widthPx: 99999 },
    { showArtwork: 'yes' }
  ]) {
    const bad = await srv.patch(`/api/graphics/${g.id}`, { data })
    assert.equal(bad.status, 400, JSON.stringify(data))
  }
})
