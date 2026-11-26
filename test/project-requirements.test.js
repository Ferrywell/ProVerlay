import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { startTestServer, buildZip, fileForm } from './helpers.js'
import { appVersion } from '../server/appVersion.js'
import {
  cleanVersion,
  compareVersions,
  exportRequirements,
  importNotice,
  isKnownWidgetType,
  unknownWidgetTypes,
  usedWidgetTypes
} from '../server/projectRequirements.js'

const widget = (type, name, id = `${type}-${name}`) => ({ id, type, name, visible: false, data: {} })

test('widget types of a project: used, known and unknown', () => {
  const state = {
    graphics: [
      widget('message', 'Break'),
      widget('nowPlaying', 'Now playing (Spotify)'),
      widget('message', 'Back soon'),
      widget('hologram', 'A'),
      widget('hologram', 'B'),
      widget('hologram', 'C'),
      widget('hologram', 'D'),
      widget('clock', 'Old clock'),
      { id: 'broken' }
    ]
  }
  assert.deepEqual(usedWidgetTypes(state), ['clock', 'hologram', 'message', 'nowPlaying'])
  assert.deepEqual(usedWidgetTypes({}), [])
  assert.equal(isKnownWidgetType('message'), true)
  assert.equal(isKnownWidgetType('clock'), true, 'legacy types the render still draws are known')
  assert.equal(isKnownWidgetType('nowPlaying'), false)
  assert.deepEqual(unknownWidgetTypes(state), [
    { type: 'hologram', count: 4, names: ['A', 'B', 'C'] },
    { type: 'nowPlaying', count: 1, names: ['Now playing (Spotify)'] }
  ])
  assert.deepEqual(unknownWidgetTypes({ graphics: [widget('message', 'x')] }), [])
})

test('versions: only plain versions count, compared by number', () => {
  assert.equal(cleanVersion(' 0.12.0 '), '0.12.0')
  assert.equal(cleanVersion('1.0.0-beta.1'), '1.0.0-beta.1')
  assert.equal(cleanVersion('<script>'), '')
  assert.equal(cleanVersion(12), '')
  assert.equal(compareVersions('0.12.0', '0.11.0'), 1)
  assert.equal(compareVersions('0.9.0', '0.11.0'), -1)
  assert.equal(compareVersions('0.11.0', '0.11.0'), 0)
  assert.equal(compareVersions('1.0.0-beta.1', '1.0.0'), 0)
  assert.equal(compareVersions('', '0.11.0'), null)
})

test('export requirements: version and widget types', () => {
  assert.deepEqual(exportRequirements({ graphics: [widget('quizShow', 'Q'), widget('image', 'I')] }, '0.11.0'), {
    app: { name: 'ProVerlay', version: '0.11.0' },
    widgetTypes: ['image', 'quizShow']
  })
  assert.deepEqual(exportRequirements(null, '0.11.0').widgetTypes, [])
})

test('import notice: nothing when every type is known', () => {
  assert.equal(importNotice({ state: { graphics: [widget('message', 'x')] }, runningVersion: '0.11.0' }), null)
  assert.equal(importNotice({ state: { graphics: [] }, runningVersion: '0.11.0' }), null)
})

test('import notice: names the type, the widgets and what to do', () => {
  const state = { graphics: [widget('nowPlaying', 'Now playing (Spotify)'), widget('message', 'x')] }

  const newer = importNotice({ state, manifest: { app: { version: '0.12.0' } }, runningVersion: '0.11.0' })
  assert.equal(newer.exportedWith, '0.12.0')
  assert.equal(newer.runningVersion, '0.11.0')
  assert.deepEqual(newer.unknownWidgetTypes, [{ type: 'nowPlaying', count: 1, names: ['Now playing (Spotify)'] }])
  assert.match(newer.message, /1 widget will stay off screen/)
  assert.match(newer.message, /nowPlaying \("Now playing \(Spotify\)"\)/)
  assert.match(newer.message, /Update ProVerlay to 0\.12\.0 or newer/)

  // Same version number: a build with extra widget types, updating would not help.
  const sameNumber = importNotice({ state, manifest: { app: { version: '0.11.0' } }, runningVersion: '0.11.0' })
  assert.match(sameNumber.message, /a build with widget types that this ProVerlay 0\.11\.0 does not have/)
  assert.doesNotMatch(sameNumber.message, /Update ProVerlay to/)

  // An export from before this feature, or a manifest with junk in it.
  for (const manifest of [null, {}, { app: { version: '<b>9</b>' } }]) {
    const unknownOrigin = importNotice({ state, manifest, runningVersion: '0.11.0' })
    assert.equal(unknownOrigin.exportedWith, '')
    assert.match(unknownOrigin.message, /does not say which version/)
  }

  const many = importNotice({
    state: { graphics: ['A', 'B', 'C', 'D'].map((n) => widget('hologram', n)).concat(widget('nowPlaying', 'NP')) },
    manifest: { app: { version: '0.12.0' } },
    runningVersion: '0.11.0'
  })
  assert.match(many.message, /5 widgets will stay off screen/)
  assert.match(many.message, /widget types hologram \("A", "B", "C", 1 more\); nowPlaying \("NP"\)/)
})

test('API: an export carries its requirements, an import reports unknown widget types', async (t) => {
  const srv = await startTestServer()
  t.after(() => srv.close())

  const created = await srv.post('/api/graphics', { type: 'message', name: 'Break' })
  assert.equal(created.status, 201, created.text)

  // Export: manifest.json lists the version and the widget types.
  const exp = await fetch(`${srv.base}/api/projects/active/export`)
  assert.equal(exp.status, 200)
  const zipPath = path.join(srv.dir, 'export-under-test.zip')
  await fs.writeFile(zipPath, Buffer.from(await exp.arrayBuffer()))
  const unzipper = await import('unzipper')
  const dir = await unzipper.Open.file(zipPath)
  const manifest = JSON.parse((await dir.files.find((f) => f.path === 'manifest.json').buffer()).toString('utf8'))
  assert.deepEqual(manifest.app, { name: 'ProVerlay', version: appVersion() })
  assert.ok(manifest.widgetTypes.includes('message'))
  assert.equal(typeof manifest.name, 'string')
  assert.equal(typeof manifest.exportedAt, 'string')

  // Its own export comes back without a notice.
  const same = await srv.post('/api/projects/import', fileForm(await fs.readFile(zipPath), 'same.proverlay'))
  assert.equal(same.status, 201, same.text)
  assert.equal(same.json.notice, undefined)

  // A project from a newer build: imported, with a notice that says what is missing.
  const future = await buildZip({
    'manifest.json': JSON.stringify({ name: 'From the future', app: { name: 'ProVerlay', version: '99.0.0' }, widgetTypes: ['hologram'] }),
    'project.json': JSON.stringify({ graphics: [widget('hologram', 'Stage hologram'), widget('message', 'Break')] })
  })
  const imp = await srv.post('/api/projects/import', fileForm(future, 'future.proverlay'))
  assert.equal(imp.status, 201, imp.text)
  assert.equal(imp.json.name, 'From the future')
  assert.equal(imp.json.notice.exportedWith, '99.0.0')
  assert.deepEqual(imp.json.notice.unknownWidgetTypes, [{ type: 'hologram', count: 1, names: ['Stage hologram'] }])
  assert.match(imp.json.notice.message, /hologram \("Stage hologram"\)/)
  assert.match(imp.json.notice.message, /Update ProVerlay to 99\.0\.0 or newer/)

  // The notice is an answer to the import, not part of the project list.
  const listed = (await srv.get('/api/projects')).json.find((p) => p.id === imp.json.id)
  assert.ok(listed)
  assert.equal(listed.notice, undefined)

  // The unknown widget is kept, so it works again after an update.
  const stored = JSON.parse(await fs.readFile(path.join(srv.dir, 'projects', imp.json.id, 'project.json'), 'utf8'))
  assert.deepEqual(
    stored.graphics.map((g) => g.type),
    ['hologram', 'message']
  )

  // An old export without requirements still imports, with the notice from project.json alone.
  const old = await buildZip({
    'manifest.json': JSON.stringify({ name: 'Old export' }),
    'project.json': JSON.stringify({ graphics: [widget('hologram', 'H')] })
  })
  const impOld = await srv.post('/api/projects/import', fileForm(old, 'old.proverlay'))
  assert.equal(impOld.status, 201, impOld.text)
  assert.match(impOld.json.notice.message, /does not say which version/)
})
