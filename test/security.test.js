import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import { startTestServer } from './helpers.js'

let srv

before(async () => {
  srv = await startTestServer()
})

after(async () => {
  await srv?.close()
})

/** Raw request so we can set Host/Origin freely (fetch forbids Host). */
function raw(method, urlPath, headers = {}, body) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { host: '127.0.0.1', port: srv.handle.port, method, path: urlPath, headers },
      (res) => {
        let text = ''
        res.on('data', (c) => (text += c))
        res.on('end', () => resolve({ status: res.statusCode, text, headers: res.headers }))
      }
    )
    req.on('error', reject)
    if (body) req.write(body)
    req.end()
  })
}

test('requests without Origin (Companion, curl) are allowed', async () => {
  const res = await raw('POST', '/api/graphics', { 'content-type': 'application/json' }, JSON.stringify({ type: 'message' }))
  assert.equal(res.status, 201, res.text)
})

test('foreign Origin is rejected with 403, local origins are allowed', async () => {
  const body = JSON.stringify({ type: 'message' })
  const json = { 'content-type': 'application/json' }
  for (const origin of ['http://evil.example', 'https://attacker.com', 'null', 'http://8.8.8.8:2014', 'file://']) {
    const res = await raw('POST', '/api/graphics', { ...json, origin }, body)
    assert.equal(res.status, 403, `${origin} → ${res.status}`)
    const get = await raw('GET', '/api/state', { origin })
    assert.equal(get.status, 403, `GET ${origin} → ${get.status}`)
  }
  // Cross-origin "simple" form post (text/plain) is refused too.
  const simple = await raw('POST', '/api/graphics/x/toggle', { 'content-type': 'text/plain', origin: 'http://evil.example' }, 'x')
  assert.equal(simple.status, 403)

  for (const origin of [
    srv.base,
    'http://localhost:2014',
    'http://192.168.1.20:2014',
    'http://10.0.0.5',
    'http://[::1]:2014',
    'http://studio-mac.local:2014'
  ]) {
    const res = await raw('POST', '/api/graphics', { ...json, origin }, body)
    assert.equal(res.status, 201, `${origin} → ${res.status} ${res.text}`)
  }
})

test('DNS-rebinding Host headers are rejected', async () => {
  const res = await raw('GET', '/api/state', { host: 'evil.example.com:2014' })
  assert.equal(res.status, 403)
  const page = await raw('GET', '/control', { host: 'rebind.attacker.net' })
  assert.equal(page.status, 403)
  for (const host of ['localhost:2014', '192.168.1.5:2014', 'studio-pc:2014', '203.0.113.7:2014']) {
    const ok = await raw('GET', '/api/state', { host })
    assert.equal(ok.status, 200, `${host} → ${ok.status}`)
  }
})

test('socket.io handshake applies the same Origin rules', async () => {
  const bad = await raw('GET', '/socket.io/?EIO=4&transport=polling', { origin: 'http://evil.example' })
  assert.equal(bad.status, 403, bad.text)
  const ok = await raw('GET', '/socket.io/?EIO=4&transport=polling', {})
  assert.equal(ok.status, 200)
  const local = await raw('GET', '/socket.io/?EIO=4&transport=polling', { origin: srv.base })
  assert.equal(local.status, 200)
  assert.equal(local.headers['access-control-allow-origin'], undefined, 'no wildcard CORS')
})

test('every response carries X-Content-Type-Options: nosniff', async () => {
  for (const url of ['/api/state', '/control', '/public/shared/client.js']) {
    const res = await raw('GET', url)
    assert.equal(res.headers['x-content-type-options'], 'nosniff', url)
  }
})

test('500 errors do not leak internals', async () => {
  const res = await raw('GET', '/api/graphics/%E0%A4%A')
  assert.ok(res.status >= 400)
  assert.ok(!res.text.includes(process.cwd()))
})
