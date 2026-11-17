import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { startTestServer, buildZip, fileForm } from './helpers.js'
import { IMPORT_LIMITS } from '../server/projects.js'

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64'
)

let srv

before(async () => {
  srv = await startTestServer()
})

after(async () => {
  await srv?.close()
})

async function activeId() {
  return (await srv.get('/api/state')).json.projectId
}

async function stagingLeftovers() {
  const entries = await fs.readdir(path.join(srv.dir, 'projects'))
  return entries.filter((e) => e.startsWith('.import-'))
}

test('create → activate → export → import round trip', async () => {
  const created = await srv.post('/api/projects', { name: '  Round Trip  ', clientName: 'Acme FC' })
  assert.equal(created.status, 201, created.text)
  assert.equal(created.json.id, 'acme-fc')
  assert.equal(created.json.name, 'Round Trip')

  const act = await srv.post(`/api/projects/${created.json.id}/activate`)
  assert.equal(act.status, 200, act.text)
  assert.equal(act.json.state.projectId, 'acme-fc')
  assert.equal(await activeId(), 'acme-fc')

  const g = await srv.post('/api/graphics', { type: 'matchScoreboard', name: 'Score' })
  await srv.post(`/api/graphics/${g.json.id}/score`, { side: 'home', delta: 3 })
  const up = await srv.post('/api/projects/acme-fc/assets', fileForm(PNG, 'logo.png'))
  assert.equal(up.status, 200, up.text)

  const exp = await fetch(`${srv.base}/api/projects/active/export`)
  assert.equal(exp.status, 200)
  assert.equal(exp.headers.get('content-type'), 'application/zip')
  const zip = Buffer.from(await exp.arrayBuffer())
  assert.ok(zip.length > 100)

  const imp = await srv.post('/api/projects/import', fileForm(zip, 'export.proverlay'))
  assert.equal(imp.status, 201, imp.text)
  assert.equal(imp.json.name, 'Round Trip')
  assert.equal(imp.json.id, 'round-trip')
  assert.equal(await activeId(), 'acme-fc', 'import does not activate')

  const act2 = await srv.post(`/api/projects/${imp.json.id}/activate`)
  assert.equal(act2.status, 200, act2.text)
  const graphic = act2.json.state.graphics.find((x) => x.id === g.json.id)
  assert.equal(graphic.data.homeScore, 3)
  const assets = await srv.get(`/api/projects/${imp.json.id}/assets`)
  assert.deepEqual(assets.json.map((a) => a.filename), ['logo.png'])
  const served = await fetch(`${srv.base}${assets.json[0].url}`)
  assert.equal(served.status, 200)
  assert.equal(served.headers.get('x-content-type-options'), 'nosniff')

  const list = (await srv.get('/api/projects')).json
  assert.equal(list.find((p) => p.active).id, imp.json.id)
})

test('hostile or malformed archives are rejected and leave the active project alone', async () => {
  const active = await activeId()
  const before = (await srv.get('/api/projects')).json.length

  const cases = {
    'not a zip': Buffer.from('definitely not a zip file'),
    'no project.json': await buildZip({ 'manifest.json': '{"name":"x"}' }),
    'invalid json': await buildZip({ 'project.json': '{oops' }),
    'graphics not an array': await buildZip({ 'project.json': JSON.stringify({ graphics: 'x' }) }),
    'graphics object': await buildZip({ 'project.json': JSON.stringify({ graphics: { a: 1 } }) }),
    'graphic without id': await buildZip({ 'project.json': JSON.stringify({ graphics: [{ type: 'message' }] }) }),
    'top-level array': await buildZip({ 'project.json': '[]' })
  }
  for (const [label, buffer] of Object.entries(cases)) {
    const res = await srv.post('/api/projects/import', fileForm(buffer, 'bad.proverlay'))
    assert.equal(res.status, 400, `${label} → ${res.status} ${res.text}`)
    assert.ok(!/\/(tmp|var|Users|home)\//.test(res.json.error), `no absolute path leaked: ${res.json.error}`)
  }

  // Too many entries.
  const saved = IMPORT_LIMITS.maxEntries
  IMPORT_LIMITS.maxEntries = 5
  try {
    const entries = { 'project.json': JSON.stringify({ graphics: [] }) }
    for (let i = 0; i < 10; i++) entries[`assets/a${i}.png`] = PNG
    const res = await srv.post('/api/projects/import', fileForm(await buildZip(entries), 'many.proverlay'))
    assert.equal(res.status, 400)
    assert.match(res.json.error, /too many entries/)
  } finally {
    IMPORT_LIMITS.maxEntries = saved
  }

  // Expands beyond the size limit (zip bomb style).
  const savedSize = IMPORT_LIMITS.maxTotalBytes
  IMPORT_LIMITS.maxTotalBytes = 50_000
  try {
    const res = await srv.post(
      '/api/projects/import',
      fileForm(
        await buildZip({ 'project.json': JSON.stringify({ graphics: [] }), 'assets/big.png': Buffer.alloc(200_000) }),
        'bomb.proverlay'
      )
    )
    assert.equal(res.status, 400)
    assert.match(res.json.error, /size limit/)
  } finally {
    IMPORT_LIMITS.maxTotalBytes = savedSize
  }

  assert.equal(await activeId(), active)
  assert.equal((await srv.get('/api/projects')).json.length, before)
  assert.deepEqual(await stagingLeftovers(), [])
})

test('import ignores path tricks and non-allow-listed asset types', async () => {
  const zip = await buildZip({
    'manifest.json': JSON.stringify({ name: 'Tricky' }),
    'project.json': JSON.stringify({ graphics: [] }),
    'assets/../../escape.png': PNG,
    'assets/page.html': '<script>alert(1)</script>',
    'assets/vector.svg': '<svg onload="alert(1)"/>',
    'assets/ok.png': PNG
  })
  const res = await srv.post('/api/projects/import', fileForm(zip, 't.proverlay'))
  assert.equal(res.status, 201, res.text)
  const files = (await fs.readdir(path.join(srv.dir, 'projects', res.json.id, 'assets'))).sort()
  assert.ok(!files.includes('page.html'))
  assert.ok(!files.includes('vector.svg'))
  assert.ok(files.includes('ok.png'))
  await assert.rejects(fs.access(path.join(srv.dir, 'escape.png')))
  await assert.rejects(fs.access(path.join(srv.dir, 'projects', 'escape.png')))
})

test('activating a damaged project fails cleanly and keeps the current one', async () => {
  const active = await activeId()
  const created = await srv.post('/api/projects', { name: 'Broken' })
  const file = path.join(srv.dir, 'projects', created.json.id, 'project.json')
  await fs.writeFile(file, '{"graphics": "nope"')

  const res = await srv.post(`/api/projects/${created.json.id}/activate`)
  assert.equal(res.status, 422, res.text)
  assert.equal(await activeId(), active)
  const registry = JSON.parse(await fs.readFile(path.join(srv.dir, 'registry.json'), 'utf8'))
  assert.equal(registry.activeProjectId, active, 'registry not committed')

  assert.equal((await srv.post('/api/projects/does-not-exist/activate')).status, 404)
  assert.equal((await srv.post('/api/projects/..%2F..%2Fetc/activate')).status, 404)
})

test('path traversal on asset routes is refused', async () => {
  const urls = [
    '/api/projects/..%2F..%2F/assets',
    '/api/projects/..%2Fblank/assets',
    '/api/projects/%2E%2E/assets',
    '/api/projects/not-registered/assets',
    '/projects/..%2F..%2Fserver/assets/index.js',
    '/projects/..%2Fblank/assets/logo.png',
    '/projects/blank/assets/..%2F..%2F..%2Fregistry.json',
    '/projects/blank/assets/..%2Fproject.json',
    '/projects/blank/assets/%E0%A4%A.png'
  ]
  for (const url of urls) {
    const res = await srv.get(url)
    assert.ok([400, 403, 404].includes(res.status), `${url} → ${res.status}`)
    assert.ok(!res.text.includes('"graphics"'), `${url} leaked project data`)
  }
  const up = await srv.post('/api/projects/..%2Fblank/assets', fileForm(PNG, 'x.png'))
  assert.equal(up.status, 404)
})

test('uploads: only allow-listed types, nosniff', async () => {
  for (const name of ['evil.html', 'vector.svg', 'script.js', '.png', 'noext']) {
    const res = await srv.post('/api/projects/blank/assets', fileForm(Buffer.from('<script>1</script>'), name))
    assert.equal(res.status, 400, `${name} → ${res.status} ${res.text}`)
  }
  const ok = await srv.post('/api/projects/blank/assets', fileForm(PNG, '../../logo two.png'))
  assert.equal(ok.status, 200, ok.text)
  assert.equal(ok.json.filename, 'logo_two.png')
  assert.equal(ok.headers.get('x-content-type-options'), 'nosniff')

  // A non-allow-listed file planted on disk is not served.
  await fs.writeFile(path.join(srv.dir, 'projects', 'blank', 'assets', 'planted.html'), '<script>1</script>')
  assert.equal((await srv.get('/projects/blank/assets/planted.html')).status, 404)
  assert.equal((await srv.get('/projects/blank/assets/logo_two.png')).status, 200)
})

test('project.json.bak is kept as a rolling backup', async () => {
  await srv.post('/api/projects/blank/activate')
  await srv.patch('/api/state', { settings: { fontSize: 3 } })
  await srv.patch('/api/state', { settings: { fontSize: 4 } })
  const bak = JSON.parse(await fs.readFile(path.join(srv.dir, 'projects', 'blank', 'project.json.bak'), 'utf8'))
  assert.equal(bak.settings.fontSize, 3)
})
