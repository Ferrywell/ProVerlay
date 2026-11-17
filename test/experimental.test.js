import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { startTestServer, makeTempDir } from './helpers.js'
import { experimentalFeatures, isExperimentalEnabled, experimentalFlagForType } from '../server/experimental.js'
import { widgetTypeAvailable } from '../public/shared/experimental.js'
import { BLANK_PROJECT } from '../server/projectSeed.js'

/** Run `fn` with PROVERLAY_EXPERIMENTAL set (or removed when value is undefined). */
async function withFlag(value, fn) {
  const before = process.env.PROVERLAY_EXPERIMENTAL
  if (value === undefined) delete process.env.PROVERLAY_EXPERIMENTAL
  else process.env.PROVERLAY_EXPERIMENTAL = value
  try {
    return await fn()
  } finally {
    if (before === undefined) delete process.env.PROVERLAY_EXPERIMENTAL
    else process.env.PROVERLAY_EXPERIMENTAL = before
  }
}

test('PROVERLAY_EXPERIMENTAL parsing: comma/space separated, case-insensitive, unknown names ignored', () => {
  assert.deepEqual(experimentalFeatures({}), [])
  assert.deepEqual(experimentalFeatures({ PROVERLAY_EXPERIMENTAL: '' }), [])
  assert.deepEqual(experimentalFeatures({ PROVERLAY_EXPERIMENTAL: 'f1' }), ['f1'])
  assert.deepEqual(experimentalFeatures({ PROVERLAY_EXPERIMENTAL: ' F1 , nope f1' }), ['f1'])
  assert.deepEqual(experimentalFeatures({ PROVERLAY_EXPERIMENTAL: 'constructor,__proto__' }), [])
  assert.equal(isExperimentalEnabled('f1', { PROVERLAY_EXPERIMENTAL: 'f1' }), true)
  assert.equal(isExperimentalEnabled('f1', {}), false)
  assert.equal(experimentalFlagForType('f1Timing'), 'f1')
  assert.equal(experimentalFlagForType('matchScoreboard'), null)
  assert.equal(experimentalFlagForType('constructor'), null)
})

test('pages hide experimental widget types unless the state lists the flag', () => {
  assert.equal(widgetTypeAvailable({}, 'f1Timing'), false)
  assert.equal(widgetTypeAvailable({ experimental: [] }, 'f1Timing'), false)
  assert.equal(widgetTypeAvailable({ experimental: ['f1'] }, 'f1Timing'), true)
  assert.equal(widgetTypeAvailable({}, 'matchScoreboard'), true)
  assert.equal(widgetTypeAvailable({}, 'toString'), true)
})

test('f1Timing can only be added with the f1 flag; existing ones keep working without it', async () => {
  const dir = await makeTempDir()
  let projectFile
  let f1

  // 1. With the flag: the tower can be added and the state lists the flag.
  await withFlag('f1', async () => {
    const srv = await startTestServer({ dataDir: dir })
    try {
      const res = await srv.post('/api/graphics', { type: 'f1Timing', name: 'Tower' })
      assert.equal(res.status, 201, res.text)
      f1 = res.json
      assert.deepEqual((await srv.get('/api/state')).json.experimental, ['f1'])
      projectFile = path.join(dir, 'projects', (await srv.get('/api/state')).json.projectId, 'project.json')
    } finally {
      await srv.close({ keepDir: true })
    }
  })

  const saved = await fs.readFile(projectFile, 'utf8')
  assert.ok(!JSON.parse(saved).experimental, 'flags are never written to project.json')

  // 2. Without the flag: no new towers, but the existing one loads unchanged and stays operable.
  await withFlag(undefined, async () => {
    const srv = await startTestServer({ dataDir: dir })
    try {
      const state = (await srv.get('/api/state')).json
      assert.deepEqual(state.experimental, [])
      const loaded = state.graphics.find((g) => g.id === f1.id)
      assert.deepEqual(loaded, f1, 'existing tower is loaded exactly as saved')
      assert.equal(await fs.readFile(projectFile, 'utf8'), saved, 'loading does not rewrite the project')

      const add = await srv.post('/api/graphics', { type: 'f1Timing', name: 'Tower 2' })
      assert.equal(add.status, 400)
      assert.match(add.json.error, /PROVERLAY_EXPERIMENTAL=f1/)

      const toggle = await srv.post(`/api/graphics/${f1.id}/toggle`, { visible: true })
      assert.equal(toggle.status, 200, toggle.text)
      assert.equal(toggle.json.visible, true)
      const patch = await srv.patch(`/api/graphics/${f1.id}`, { data: { topCount: 3 } })
      assert.equal(patch.status, 200, patch.text)
      assert.equal((await srv.get(`/api/f1/${f1.id}/live`)).status, 200)

      // A client echoing the whole state back (including `experimental`) is accepted, not stored.
      const echo = await srv.patch('/api/state', state)
      assert.equal(echo.status, 200, echo.text)
      assert.ok(!JSON.parse(await fs.readFile(projectFile, 'utf8')).experimental)
    } finally {
      await srv.close()
    }
  })
})

test('new projects start empty (no widgets)', async () => {
  assert.deepEqual(BLANK_PROJECT.graphics, [])
  const srv = await startTestServer()
  try {
    assert.deepEqual((await srv.get('/api/state')).json.graphics, [], 'first-run project')
    const created = await srv.post('/api/projects', { name: 'Fresh show' })
    assert.equal(created.status, 201, created.text)
    const id = created.json.id
    assert.equal((await srv.post(`/api/projects/${id}/activate`)).status, 200)
    assert.deepEqual((await srv.get('/api/state')).json.graphics, [], 'new project')
  } finally {
    await srv.close()
  }
})
