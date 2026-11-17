import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { startTestServer, buildZip, fileForm, socketConnect, sleep } from './helpers.js'
import { CUSTOM_CSS_MAX_BYTES, sanitizeCustomCss } from '../server/customCss.js'
import { createGraphicFromType } from '../server/graphicDefaults.js'

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

async function registry() {
  return JSON.parse(await fs.readFile(path.join(srv.dir, 'registry.json'), 'utf8'))
}

async function create(name) {
  const res = await srv.post('/api/projects', { name })
  assert.equal(res.status, 201, res.text)
  return res.json
}

async function waitFor(predicate, ms = 1500) {
  const until = Date.now() + ms
  while (Date.now() < until) {
    if (predicate()) return true
    await sleep(20)
  }
  return false
}

/* ------------------------------------------------------------- rename */

test('rename changes the display name only; active rename reaches socket clients', async () => {
  const p = await create('Rename Me')
  const res = await srv.patch(`/api/projects/${p.id}`, { name: '  Renamed   Project ' })
  assert.equal(res.status, 200, res.text)
  assert.equal(res.json.id, p.id)
  assert.equal(res.json.name, 'Renamed Project')
  assert.equal((await registry()).projects.find((x) => x.id === p.id).name, 'Renamed Project')
  assert.ok(await fs.stat(path.join(srv.dir, 'projects', p.id, 'project.json')), 'folder keeps its id')

  for (const body of [{}, { name: '' }, { name: '   ' }, { name: 42 }, { name: 'x'.repeat(121) }]) {
    const bad = await srv.patch(`/api/projects/${p.id}`, body)
    assert.equal(bad.status, 400, `${JSON.stringify(body).slice(0, 40)} → ${bad.status}`)
  }

  // Active project: state carries projectName and a stateChanged goes out.
  await srv.post(`/api/projects/${p.id}/activate`)
  assert.equal((await srv.get('/api/state')).json.projectName, 'Renamed Project')
  const sock = await socketConnect(srv.base)
  try {
    await srv.patch(`/api/projects/${p.id}`, { name: 'Live Name' })
    const got = await waitFor(() =>
      sock.events.some(([name, payload]) => name === 'stateChanged' && payload.projectName === 'Live Name')
    )
    assert.ok(got, 'stateChanged with the new projectName')
    assert.ok(sock.events.some(([name, list]) => name === 'projectsChanged' && list.some((x) => x.name === 'Live Name')))
  } finally {
    sock.close()
    await srv.post('/api/projects/blank/activate')
  }

  // projectName is runtime-only: echoing the state back does not store it.
  const state = (await srv.get('/api/state')).json
  assert.equal((await srv.patch('/api/state', state)).status, 200)
  const stored = JSON.parse(await fs.readFile(path.join(srv.dir, 'projects', 'blank', 'project.json'), 'utf8'))
  assert.equal(stored.projectName, undefined)
  assert.equal(stored.customCssVersion, undefined)
})

/* ---------------------------------------------------------- duplicate */

test('duplicate copies project.json, assets and custom.css to a new id', async () => {
  const src = await create('Dup Source')
  await srv.post(`/api/projects/${src.id}/activate`)
  const g = await srv.post('/api/graphics', { type: 'hockeyScorebug', name: 'Bug' })
  await srv.post(`/api/graphics/${g.json.id}/score`, { side: 'away', delta: 2 })
  await srv.post(`/api/projects/${src.id}/assets`, fileForm(PNG, 'logo.png'))
  await srv.request('PUT', `/api/projects/${src.id}/custom-css`, { css: '.hockey-clock { background: red; }' })

  const dup = await srv.post(`/api/projects/${src.id}/duplicate`, {})
  assert.equal(dup.status, 201, dup.text)
  assert.equal(dup.json.name, 'Dup Source copy')
  assert.notEqual(dup.json.id, src.id)
  assert.equal(dup.json.active, false)
  const again = await srv.post(`/api/projects/${src.id}/duplicate`, {})
  assert.equal(again.json.name, 'Dup Source copy 2')
  assert.notEqual(again.json.id, dup.json.id)
  const named = await srv.post(`/api/projects/${src.id}/duplicate`, { name: 'Named Copy' })
  assert.equal(named.json.name, 'Named Copy')
  assert.equal(named.json.id, 'named-copy')

  const assets = await srv.get(`/api/projects/${dup.json.id}/assets`)
  assert.deepEqual(assets.json.map((a) => a.filename), ['logo.png'])
  const css = await srv.get(`/api/projects/${dup.json.id}/custom-css`)
  assert.equal(css.json.css, '.hockey-clock { background: red; }')

  // Still on the source project; the copy has the same graphics.
  assert.equal((await srv.get('/api/state')).json.projectId, src.id)
  const act = await srv.post(`/api/projects/${dup.json.id}/activate`)
  assert.equal(act.status, 200, act.text)
  assert.equal(act.json.state.graphics.find((x) => x.id === g.json.id).data.awayScore, 2)
  assert.equal(act.json.state.projectName, 'Dup Source copy')

  const leftovers = (await fs.readdir(path.join(srv.dir, 'projects'))).filter((e) => e.startsWith('.'))
  assert.deepEqual(leftovers, [])
  assert.equal((await srv.post('/api/projects/nope/duplicate', {})).status, 404)
  assert.equal((await srv.post(`/api/projects/${src.id}/duplicate`, { name: 7 })).status, 400)
  await srv.post('/api/projects/blank/activate')
})

/* ------------------------------------------------------------- delete */

test('delete moves an inactive project to trash; active and last are refused', async () => {
  const victim = await create('Delete Me')
  await srv.post(`/api/projects/${victim.id}/assets`, fileForm(PNG, 'a.png'))
  const res = await srv.del(`/api/projects/${victim.id}`)
  assert.equal(res.status, 200, res.text)
  assert.equal(res.json.ok, true)
  assert.ok(!(await registry()).projects.some((p) => p.id === victim.id))
  await assert.rejects(fs.access(path.join(srv.dir, 'projects', victim.id)))
  const trash = await fs.readdir(path.join(srv.dir, 'trash'))
  const moved = trash.find((d) => d.startsWith(`${victim.id}-`))
  assert.ok(moved, `trash has ${victim.id}-<timestamp>: ${trash}`)
  assert.ok(await fs.stat(path.join(srv.dir, 'trash', moved, 'assets', 'a.png')))
  assert.equal((await srv.del(`/api/projects/${victim.id}`)).status, 404)

  // The same name can be created again (folder name is free).
  const recreated = await create('Delete Me')
  assert.equal(recreated.id, victim.id)
  await srv.del(`/api/projects/${recreated.id}`)

  const active = (await srv.get('/api/state')).json.projectId
  const refused = await srv.del(`/api/projects/${active}`)
  assert.equal(refused.status, 409)
  assert.match(refused.json.error, /active project/)
  assert.equal((await srv.get('/api/state')).json.projectId, active)
})

test('project management routes reject unknown and traversal ids', async () => {
  const ids = ['does-not-exist', '..%2F..%2Fetc', '%2E%2E', '..%2Fblank', 'Blank', 'a%00b']
  for (const id of ids) {
    for (const [method, url, body] of [
      ['PATCH', `/api/projects/${id}`, { name: 'x' }],
      ['POST', `/api/projects/${id}/duplicate`, {}],
      ['DELETE', `/api/projects/${id}`, undefined],
      ['GET', `/api/projects/${id}/custom-css`, undefined],
      ['PUT', `/api/projects/${id}/custom-css`, { css: 'a{}' }],
      ['GET', `/projects/${id}/custom.css`, undefined]
    ]) {
      const res = await srv.request(method, url, body)
      assert.ok([400, 404].includes(res.status), `${method} ${url} → ${res.status}`)
    }
  }
  const entries = await fs.readdir(srv.dir)
  assert.ok(!entries.includes('custom.css'))
})

/* --------------------------------------------------------- custom CSS */

test('custom CSS: save, serve, live version, size limit, @import stripped', async () => {
  const p = await create('Styled')
  await srv.post(`/api/projects/${p.id}/activate`)
  assert.equal((await srv.get('/api/state')).json.customCssVersion, '')
  assert.equal((await srv.get(`/projects/${p.id}/custom.css`)).status, 404)

  const sock = await socketConnect(srv.base)
  const css = '.hockey-clock { background: url(assets/bg.png); }\n'
  const saved = await srv.request('PUT', `/api/projects/${p.id}/custom-css`, { css })
  assert.equal(saved.status, 200, saved.text)
  assert.match(saved.json.version, /^[0-9a-f]{12}$/)
  assert.equal(saved.json.removedImports, 0)
  assert.equal(saved.json.maxBytes, CUSTOM_CSS_MAX_BYTES)
  const got = await waitFor(() =>
    sock.events.some(([name, s]) => name === 'stateChanged' && s.customCssVersion === saved.json.version)
  )
  sock.close()
  assert.ok(got, 'stateChanged with customCssVersion')

  const served = await srv.get(`/projects/${p.id}/custom.css`)
  assert.equal(served.status, 200)
  assert.match(served.headers.get('content-type'), /^text\/css/)
  assert.equal(served.headers.get('x-content-type-options'), 'nosniff')
  assert.equal(served.text, css)

  const withImport = await srv.request('PUT', `/api/projects/${p.id}/custom-css`, {
    css: '@import url("https://evil.example/x.css");\n@IMPORT \'b.css\';\n.a { color: red; }'
  })
  assert.equal(withImport.json.removedImports, 2)
  const text = (await srv.get(`/projects/${p.id}/custom.css`)).text
  assert.ok(!/@import\s/i.test(text.replace(/\/\*[\s\S]*?\*\//g, '')), text)
  assert.match(text, /\.a \{ color: red; \}/)

  const tooBig = await srv.request('PUT', `/api/projects/${p.id}/custom-css`, {
    css: `/*${'x'.repeat(CUSTOM_CSS_MAX_BYTES)}*/`
  })
  assert.equal(tooBig.status, 413)
  assert.match(tooBig.json.error, /too large/)
  assert.equal((await srv.get(`/projects/${p.id}/custom.css`)).text, text, 'unchanged after a rejected save')
  assert.equal((await srv.request('PUT', `/api/projects/${p.id}/custom-css`, { css: 12 })).status, 400)

  // Empty CSS removes the file.
  const cleared = await srv.request('PUT', `/api/projects/${p.id}/custom-css`, { css: '  \n' })
  assert.equal(cleared.json.version, '')
  assert.equal((await srv.get('/api/state')).json.customCssVersion, '')
  assert.equal((await srv.get(`/projects/${p.id}/custom.css`)).status, 404)
  await srv.post('/api/projects/blank/activate')
})

test('custom CSS survives export → import and hostile custom.css in an archive is sanitized', async () => {
  const p = await create('Css Export')
  await srv.post(`/api/projects/${p.id}/activate`)
  const css = '/* brand */\n.match-board { --primary: #ff6600; }\n'
  await srv.request('PUT', `/api/projects/${p.id}/custom-css`, { css })
  const exp = await fetch(`${srv.base}/api/projects/active/export`)
  const zip = Buffer.from(await exp.arrayBuffer())
  const imp = await srv.post('/api/projects/import', fileForm(zip, 'css.proverlay'))
  assert.equal(imp.status, 201, imp.text)
  assert.equal((await srv.get(`/api/projects/${imp.json.id}/custom-css`)).json.css, css)

  const hostile = await buildZip({
    'project.json': JSON.stringify({ graphics: [] }),
    'custom.css': '@import url(https://evil.example/a.css);\n.b { color: blue; }'
  })
  const res = await srv.post('/api/projects/import', fileForm(hostile, 'hostile.proverlay'))
  assert.equal(res.status, 201, res.text)
  const stored = (await srv.get(`/api/projects/${res.json.id}/custom-css`)).json.css
  assert.ok(!stored.includes('evil.example'))
  assert.match(stored, /\.b \{ color: blue; \}/)

  const huge = await buildZip({
    'project.json': JSON.stringify({ graphics: [] }),
    'custom.css': `/*${'x'.repeat(CUSTOM_CSS_MAX_BYTES + 10)}*/`
  })
  const big = await srv.post('/api/projects/import', fileForm(huge, 'huge.proverlay'))
  assert.equal(big.status, 400)
  assert.match(big.json.error, /custom\.css is too large/)
  await srv.post('/api/projects/blank/activate')
})

test('sanitizeCustomCss strips every @import spelling and is idempotent', () => {
  const cases = [
    ['@import url(https://x/a.css);\n.a{}', 1],
    ['@IMPORT "a;b.css" screen;.b{}', 1],
    ['@\\69mport url(x);.c{}', 1],
    ['@\\49 MPORT url(x);.c{}', 1],
    ['@import url(x)', 1],
    ['/* @import inside a comment */ .d{}', 0],
    ['.e::after{content:"@import x;"}', 0],
    ['@media (min-width: 10px) { .f { color: red } }', 0],
    ['.g{background:url(assets/a.png)}', 0]
  ]
  for (const [input, count] of cases) {
    const out = sanitizeCustomCss(input)
    assert.equal(out.removedImports, count, input)
    assert.equal(sanitizeCustomCss(out.css).css, out.css, `idempotent: ${input}`)
    if (count) assert.ok(!/@(import|\\69|\\49)/i.test(out.css.replace(/\/\*[\s\S]*?\*\//g, '')), out.css)
  }
  assert.equal(sanitizeCustomCss('.g{background:url(assets/a.png)}').css, '.g{background:url(assets/a.png)}')
})

/* ---------------------------------------------------- default positions */

test('widget types get distinct default positions where they would collide', () => {
  const pos = (type) => createGraphicFromType(type, 'x').position
  assert.equal(pos('matchScoreboard'), 'top-center')
  assert.equal(pos('hockeyScorebug'), 'top-center')
  assert.equal(pos('streamCountdown'), 'center')
  assert.equal(pos('customTicker'), 'bottom-full')
  assert.equal(pos('lowerThird'), 'bottom-left')
  assert.equal(pos('quizShow'), 'top-left')
  const message = createGraphicFromType('message', 'x')
  assert.equal(message.position, 'custom')
  assert.ok(message.data.placementFree.y < 90, 'message sits above the ticker')
})
