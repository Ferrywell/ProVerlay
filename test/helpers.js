import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { ZipArchive } from 'archiver'
import { startServer } from '../server/app.js'

export async function makeTempDir(prefix = 'proverlay-test-') {
  return fs.mkdtemp(path.join(os.tmpdir(), prefix))
}

/**
 * Start a ProVerlay server on a random port with a fresh data dir.
 * `prepare(dir)` runs before start (e.g. to plant corrupt files).
 */
export async function startTestServer({ dataDir, prepare } = {}) {
  const dir = dataDir || (await makeTempDir())
  if (prepare) await prepare(dir)
  const handle = await startServer({ dataDir: dir, port: 0, host: '127.0.0.1' })
  const base = `http://127.0.0.1:${handle.port}`

  async function request(method, url, body, headers = {}) {
    const init = { method, headers: { ...headers } }
    if (body !== undefined) {
      if (body instanceof FormData) {
        init.body = body
      } else {
        init.headers['content-type'] ??= 'application/json'
        init.body = typeof body === 'string' ? body : JSON.stringify(body)
      }
    }
    const res = await fetch(base + url, init)
    const text = await res.text()
    let json = null
    try {
      json = text ? JSON.parse(text) : null
    } catch {
      json = null
    }
    return { status: res.status, headers: res.headers, json, text }
  }

  return {
    handle,
    dir,
    base,
    request,
    get: (url, headers) => request('GET', url, undefined, headers),
    post: (url, body, headers) => request('POST', url, body ?? {}, headers),
    patch: (url, body, headers) => request('PATCH', url, body, headers),
    del: (url, headers) => request('DELETE', url, undefined, headers),
    async close({ keepDir = false } = {}) {
      await handle.close()
      if (!keepDir) await fs.rm(dir, { recursive: true, force: true })
    }
  }
}

/** Build a zip in memory: entries = { 'path/in/zip': string | Buffer }. */
export async function buildZip(entries) {
  const archive = new ZipArchive()
  const chunks = []
  archive.on('data', (c) => chunks.push(c))
  const done = new Promise((resolve, reject) => {
    archive.on('end', resolve)
    archive.on('error', reject)
  })
  for (const [name, content] of Object.entries(entries)) {
    archive.append(typeof content === 'string' ? Buffer.from(content) : content, { name })
  }
  await archive.finalize()
  await done
  return Buffer.concat(chunks)
}

export function fileForm(buffer, filename, field = 'file') {
  const form = new FormData()
  form.append(field, new Blob([buffer]), filename)
  return form
}

/**
 * Minimal socket.io (EIO v4) client over Node's built-in WebSocket, enough
 * to emit events at the server without adding socket.io-client as a dep.
 */
export function socketConnect(base) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`${base.replace('http', 'ws')}/socket.io/?EIO=4&transport=websocket`)
    const events = []
    const acks = new Map()
    let ackId = 0
    let connected = false
    const timer = setTimeout(() => reject(new Error('socket connect timeout')), 3000)
    ws.addEventListener('error', (e) => reject(e.error || new Error('socket error')))
    ws.addEventListener('message', ({ data }) => {
      const msg = String(data)
      if (msg.startsWith('0')) ws.send('40')
      else if (msg === '2') ws.send('3')
      else if (msg.startsWith('40') && !connected) {
        connected = true
        clearTimeout(timer)
        resolve(client)
      } else if (msg.startsWith('42')) {
        events.push(JSON.parse(msg.slice(2)))
      } else if (msg.startsWith('43')) {
        const m = msg.match(/^43(\d+)(.*)$/)
        acks.get(Number(m[1]))?.(JSON.parse(m[2])[0])
      }
    })
    const client = {
      events,
      emit(event, ...args) {
        ws.send(`42${JSON.stringify([event, ...args])}`)
      },
      emitWithAck(event, ...args) {
        const id = ackId++
        return new Promise((res, rej) => {
          const t = setTimeout(() => rej(new Error('ack timeout')), 2000)
          acks.set(id, (payload) => {
            clearTimeout(t)
            res(payload)
          })
          ws.send(`42${id}${JSON.stringify([event, ...args])}`)
        })
      },
      close() {
        ws.close()
      }
    }
  })
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
