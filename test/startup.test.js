import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { startTestServer, makeTempDir } from './helpers.js'

/** Lay out a data dir with an active project "show" containing `content`. */
async function plantProject(dir, content, { bak } = {}) {
  const projectDir = path.join(dir, 'projects', 'show')
  await fs.mkdir(path.join(projectDir, 'assets'), { recursive: true })
  await fs.writeFile(path.join(projectDir, 'project.json'), content)
  if (bak !== undefined) await fs.writeFile(path.join(projectDir, 'project.json.bak'), bak)
  await fs.writeFile(
    path.join(dir, 'registry.json'),
    JSON.stringify({
      activeProjectId: 'show',
      projects: [
        { id: 'blank', name: 'New client' },
        { id: 'show', name: 'Show' }
      ]
    })
  )
}

test('fresh data dir: blank project is created', async () => {
  const srv = await startTestServer()
  try {
    const state = (await srv.get('/api/state')).json
    assert.equal(state.projectId, 'blank')
    assert.deepEqual(state.graphics, [])
  } finally {
    await srv.close()
  }
})

test('corrupt project.json with a good backup: restored from project.json.bak', async () => {
  const good = JSON.stringify({ graphics: [{ id: 'm1', type: 'message', data: { text: 'hi' } }] })
  const srv = await startTestServer({ prepare: (dir) => plantProject(dir, '{"graphics": [', { bak: good }) })
  try {
    const state = (await srv.get('/api/state')).json
    assert.equal(state.projectId, 'show')
    assert.equal(state.graphics[0].id, 'm1')
    const files = await fs.readdir(path.join(srv.dir, 'projects', 'show'))
    assert.ok(files.some((f) => f.startsWith('project.json.corrupt-')), 'damaged file kept aside')
    const restored = JSON.parse(await fs.readFile(path.join(srv.dir, 'projects', 'show', 'project.json'), 'utf8'))
    assert.equal(restored.graphics[0].id, 'm1')
  } finally {
    await srv.close()
  }
})

test('corrupt project.json without backup: falls back to blank and stays up', async () => {
  for (const content of ['{"graphics": [', '{"graphics": "x"}', '{"graphics": {"a": 1}}', '42']) {
    const srv = await startTestServer({ prepare: (dir) => plantProject(dir, content) })
    try {
      const state = (await srv.get('/api/state')).json
      assert.equal(state.projectId, 'blank', `content ${content}`)
      // Fully functional afterwards.
      const g = await srv.post('/api/graphics', { type: 'message', name: 'after' })
      assert.equal(g.status, 201)
      // The damaged project stays on disk, untouched.
      const raw = await fs.readFile(path.join(srv.dir, 'projects', 'show', 'project.json'), 'utf8')
      assert.equal(raw, content)
      const registry = JSON.parse(await fs.readFile(path.join(srv.dir, 'registry.json'), 'utf8'))
      assert.equal(registry.activeProjectId, 'blank')
    } finally {
      await srv.close()
    }
  }
})

test('blank itself corrupt as well: blank is recreated', async () => {
  const srv = await startTestServer({
    prepare: async (dir) => {
      await plantProject(dir, 'garbage')
      await fs.mkdir(path.join(dir, 'projects', 'blank'), { recursive: true })
      await fs.writeFile(path.join(dir, 'projects', 'blank', 'project.json'), 'also garbage')
    }
  })
  try {
    const state = (await srv.get('/api/state')).json
    assert.equal(state.projectId, 'blank')
    assert.deepEqual(state.graphics, [])
    const files = await fs.readdir(path.join(srv.dir, 'projects', 'blank'))
    assert.ok(files.some((f) => f.startsWith('project.json.corrupt-')))
  } finally {
    await srv.close()
  }
})

test('corrupt registry.json is rebuilt from project folders', async () => {
  const srv = await startTestServer({
    prepare: async (dir) => {
      await plantProject(dir, JSON.stringify({ client: { name: 'The Show' }, graphics: [] }))
      await fs.writeFile(path.join(dir, 'registry.json'), '{not json')
    }
  })
  try {
    const projects = (await srv.get('/api/projects')).json
    assert.deepEqual(projects.map((p) => p.id).sort(), ['blank', 'show'])
    assert.equal(projects.find((p) => p.id === 'show').name, 'The Show')
    assert.equal((await srv.get('/api/state')).json.projectId, 'blank')
  } finally {
    await srv.close()
  }
})

test('a bricking PATCH is rejected, so the project still loads after restart', async () => {
  const dir = await makeTempDir()
  let srv = await startTestServer({ dataDir: dir })
  const res = await srv.patch('/api/state', { graphics: 'x' })
  assert.equal(res.status, 400)
  await srv.patch('/api/state', { settings: { fontSize: 3.3 } })
  await srv.close({ keepDir: true })

  srv = await startTestServer({ dataDir: dir })
  try {
    const state = (await srv.get('/api/state')).json
    assert.equal(state.projectId, 'blank')
    assert.equal(state.settings.fontSize, 3.3)
  } finally {
    await srv.close()
  }
})

test('port already in use rejects instead of exiting the process', async () => {
  const srv = await startTestServer()
  try {
    const { startServer } = await import('../server/app.js')
    await assert.rejects(startServer({ dataDir: srv.dir, port: srv.handle.port, host: '127.0.0.1' }), {
      code: 'EADDRINUSE'
    })
  } finally {
    await srv.close().catch(() => {})
  }
})
