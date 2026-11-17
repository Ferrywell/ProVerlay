import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ApiError, ProVerlayApi } from '../src/api.js'

function fakeFetch(responder) {
  const requests = []
  const fn = async (url, init) => {
    requests.push({ url, ...init, body: init.body === undefined ? undefined : JSON.parse(init.body) })
    return responder(url, init)
  }
  fn.requests = requests
  return fn
}

const json = (status, body) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

test('requests use the right method, path and JSON body', async () => {
  const fetch = fakeFetch(() => json(200, { id: 'g1' }))
  const api = new ProVerlayApi({ baseUrl: 'http://127.0.0.1:2014/', fetch })
  assert.deepEqual(await api.score('g 1', { side: 'home', delta: 1 }), { id: 'g1' })
  await api.clock('g1', 'toggle')
  await api.clock('g1', 'adjust', -1000)
  await api.setVisible('g1')
  await api.setSoloVisible('g1', false)
  await api.showEntry('g1', 'sp-1')
  await api.getState()

  const summary = fetch.requests.map((r) => [r.method, r.url, r.body])
  assert.deepEqual(summary, [
    ['POST', 'http://127.0.0.1:2014/api/graphics/g%201/score', { side: 'home', delta: 1 }],
    ['POST', 'http://127.0.0.1:2014/api/graphics/g1/clock', { action: 'toggle' }],
    ['POST', 'http://127.0.0.1:2014/api/graphics/g1/clock', { action: 'adjust', ms: -1000 }],
    ['POST', 'http://127.0.0.1:2014/api/graphics/g1/toggle', {}],
    ['POST', 'http://127.0.0.1:2014/api/graphics/g1/toggle-solo', { soloVisible: false }],
    ['POST', 'http://127.0.0.1:2014/api/graphics/g1/entries/sp-1/show', {}],
    ['GET', 'http://127.0.0.1:2014/api/state', undefined],
  ])
  assert.equal(fetch.requests[0].headers['Content-Type'], 'application/json')
  assert.equal(fetch.requests[0].headers.Origin, undefined, 'no custom Origin header')
})

test('non-2xx responses throw with the server error message', async () => {
  const api = new ProVerlayApi({
    baseUrl: 'http://x',
    fetch: fakeFetch(() => json(400, { error: "side: expected 'home' or 'away'" })),
  })
  await assert.rejects(api.score('g1', { side: 'left' }), (err) => {
    assert.ok(err instanceof ApiError)
    assert.equal(err.status, 400)
    assert.match(err.message, /HTTP 400 – side: expected 'home' or 'away'/)
    return true
  })
})

test('non-JSON error bodies and network failures are reported', async () => {
  const html = new ProVerlayApi({
    baseUrl: 'http://x',
    fetch: fakeFetch(() => new Response('Bad gateway', { status: 502 })),
  })
  await assert.rejects(html.getState(), /HTTP 502 – Bad gateway/)

  const down = new ProVerlayApi({
    baseUrl: 'http://x',
    fetch: async () => {
      throw new TypeError('fetch failed')
    },
  })
  await assert.rejects(
    down.getState(),
    (err) => err instanceof ApiError && /GET \/api\/state: fetch failed/.test(err.message),
  )
})

test('requests time out', async () => {
  const api = new ProVerlayApi({
    baseUrl: 'http://x',
    timeoutMs: 20,
    fetch: (_url, init) =>
      new Promise((_resolve, reject) => {
        // AbortSignal.timeout timers are unref'd: keep the event loop alive like a real socket would.
        const keepAlive = setTimeout(() => {}, 5000)
        init.signal.addEventListener('abort', () => {
          clearTimeout(keepAlive)
          reject(init.signal.reason)
        })
      }),
  })
  await assert.rejects(api.getState(), /timed out after 20 ms/)
})
