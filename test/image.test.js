import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { startTestServer, makeTempDir, fileForm, sleep } from './helpers.js'
import { migrateLegacyImages, LEGACY_IMAGE_ID } from '../server/imageMigration.js'
import {
  activeImage,
  imageRotationMs,
  imageSize,
  imageVariant,
  stepImageId
} from '../public/shared/image-list.js'

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

async function createImageWidget(name = 'Sponsors') {
  const res = await srv.post('/api/graphics', { type: 'image', name })
  assert.equal(res.status, 201, res.text)
  return res.json
}

async function upload(name) {
  const res = await srv.post('/api/projects/blank/assets', fileForm(PNG, name))
  assert.equal(res.status, 200, res.text)
  return res.json.filename
}

test('helpers: variants, sizes, stepping and rotation', () => {
  assert.equal(imageVariant({}), 'free')
  assert.equal(imageVariant({ variant: 'nope' }), 'free')
  assert.deepEqual(imageSize({}), { mode: 'original', percent: 50 })
  assert.deepEqual(imageSize({ variant: 'lowerThirdSlot' }), { mode: 'percent', percent: 60 })
  assert.deepEqual(imageSize({ variant: 'fullScreen', size: { mode: 'original' } }).mode, 'fitCanvas')
  assert.deepEqual(imageSize({ size: { mode: 'percent', percent: 250 } }), { mode: 'percent', percent: 100 })

  const list = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]
  assert.equal(stepImageId(list, null, 'next'), 'a')
  assert.equal(stepImageId(list, null, 'previous'), 'c')
  assert.equal(stepImageId(list, 'c', 'next'), 'a')
  assert.equal(stepImageId(list, 'c', 'next', { wrap: false }), null)
  assert.equal(stepImageId(list, 'a', 'previous'), 'c')
  assert.equal(stepImageId([], null, 'next'), null)

  const two = { images: [{ id: 'a', src: 'a.png' }, { id: 'b', src: 'b.png' }] }
  assert.equal(imageRotationMs(two), 0)
  assert.equal(imageRotationMs({ ...two, rotation: { enabled: true, intervalMs: 10 } }), 2000, 'minimum interval')
  assert.equal(imageRotationMs({ images: [two.images[0]], rotation: { enabled: true } }), 0, 'one image does not rotate')
  assert.equal(activeImage({ ...two, activeImageId: 'b' }).src, 'b.png')
})

test('migration: an old { src, alt } image widget becomes a one-image list that is on air as before', () => {
  const legacy = {
    graphics: [
      { id: 'img', type: 'image', visible: true, position: 'top-right', data: { src: 'logo.png', alt: 'Logo' } },
      { id: 'empty', type: 'image', data: {} },
      { id: 'msg', type: 'message', data: { text: 'hi' } }
    ]
  }
  const migrated = migrateLegacyImages(legacy)
  const img = migrated.graphics[0]
  assert.deepEqual(img.data, {
    images: [{ id: LEGACY_IMAGE_ID, src: 'logo.png', name: 'logo', alt: 'Logo' }],
    activeImageId: LEGACY_IMAGE_ID
  })
  assert.equal(img.visible, true)
  assert.equal(img.position, 'top-right')
  assert.deepEqual(migrated.graphics[1].data, { images: [], activeImageId: null })
  assert.equal(migrated.graphics[2], legacy.graphics[2], 'other widgets untouched')
  assert.equal(migrateLegacyImages(migrated), migrated, 'idempotent')
  // Defaults that match the old render: free placement at original size.
  assert.equal(imageVariant(img.data), 'free')
  assert.equal(imageSize(img.data).mode, 'original')
})

test('new Image widget starts empty, off air, on the operator', async () => {
  const g = await createImageWidget()
  assert.equal(g.type, 'image')
  assert.equal(g.visible, false)
  assert.equal(g.operator, true)
  assert.deepEqual(g.data.images, [])
  assert.equal(g.data.activeImageId, null)
  assert.equal(g.data.variant, 'free')
})

test('images: add several at once, show, step, reorder, rename, delete', async () => {
  const g = await createImageWidget()
  const files = []
  for (const name of ['lt-anna.png', 'lt_bob.png', 'Sponsor board.png']) files.push(await upload(name))

  const added = await srv.post(`/api/graphics/${g.id}/images`, { images: files.map((src) => ({ src })) })
  assert.equal(added.status, 201, added.text)
  assert.deepEqual(added.json.images.map((i) => i.name), ['lt anna', 'lt bob', 'Sponsor board'])
  const [a, b, c] = added.json.images
  assert.ok(a.id.startsWith('img-'))

  const one = await srv.post(`/api/graphics/${g.id}/images`, { src: files[0], name: 'Anna again' })
  assert.equal(one.status, 201)
  assert.equal(one.json.images[0].name, 'Anna again')
  const d = one.json.images[0]

  assert.deepEqual((await srv.get(`/api/graphics/${g.id}/images`)).json.map((i) => i.id), [a.id, b.id, c.id, d.id])

  const shown = await srv.post(`/api/graphics/${g.id}/images/${b.id}/show`)
  assert.equal(shown.status, 200)
  assert.equal(shown.json.visible, true)
  assert.equal(shown.json.data.activeImageId, b.id)

  let step = await srv.post(`/api/graphics/${g.id}/images/step`, { direction: 'next' })
  assert.equal(step.json.data.activeImageId, c.id)
  step = await srv.post(`/api/graphics/${g.id}/images/step`, { direction: 'previous' })
  assert.equal(step.json.data.activeImageId, b.id)
  await srv.post(`/api/graphics/${g.id}/images/${d.id}/show`)
  step = await srv.post(`/api/graphics/${g.id}/images/step`, {})
  assert.equal(step.json.data.activeImageId, a.id, 'wraps to the first')

  // Hide keeps the active image, so Next continues down the list.
  assert.equal((await srv.post(`/api/graphics/${g.id}/hide`)).json.visible, false)
  step = await srv.post(`/api/graphics/${g.id}/images/step`, { direction: 'next' })
  assert.equal(step.json.visible, true)
  assert.equal(step.json.data.activeImageId, b.id)

  const order = await srv.request('PUT', `/api/graphics/${g.id}/images/order`, { ids: [d.id, c.id, b.id, a.id] })
  assert.equal(order.status, 200, order.text)
  assert.deepEqual(order.json.data.images.map((i) => i.id), [d.id, c.id, b.id, a.id])
  assert.equal((await srv.request('PUT', `/api/graphics/${g.id}/images/order`, { ids: [a.id] })).status, 400)

  const renamed = await srv.patch(`/api/graphics/${g.id}/images/${c.id}`, { name: ' Main sponsor ', alt: 'Sponsor' })
  assert.equal(renamed.json.image.name, 'Main sponsor')
  assert.equal(renamed.json.image.alt, 'Sponsor')

  // Deleting the image on air takes the widget off air; the asset file stays.
  const del = await srv.del(`/api/graphics/${g.id}/images/${b.id}`)
  assert.equal(del.status, 200)
  assert.equal(del.json.graphic.visible, false)
  assert.equal(del.json.graphic.data.activeImageId, null)
  await fs.access(path.join(srv.dir, 'projects', 'blank', 'assets', files[1]))
  assert.equal((await srv.del(`/api/graphics/${g.id}/images/${b.id}`)).status, 404)
})

test('images: bad input is rejected', async () => {
  const g = await createImageWidget()
  const bad = ['../secret.png', 'page.html', '', 'dir/x.png', '.hidden.png', 5]
  for (const src of bad) {
    const res = await srv.post(`/api/graphics/${g.id}/images`, { src })
    assert.equal(res.status, 400, `${src} → ${res.status}`)
  }
  for (const images of [[{ id: 'x', src: 'a.html' }], [{ id: 'x', src: 'a.png' }, { id: 'x', src: 'b.png' }], [{ src: 'a.png' }], 'x']) {
    const res = await srv.patch(`/api/graphics/${g.id}`, { data: { images } })
    assert.equal(res.status, 400, JSON.stringify(images))
  }
  assert.equal((await srv.patch(`/api/graphics/${g.id}`, { data: { autoHideMs: -1 } })).status, 400)
  assert.equal((await srv.post(`/api/graphics/${g.id}/images/nope/show`)).status, 404)
  assert.equal((await srv.post(`/api/graphics/${g.id}/images/step`, {})).status, 404, 'empty list')

  const msg = (await srv.post('/api/graphics', { type: 'message', name: 'm' })).json
  assert.equal((await srv.post(`/api/graphics/${msg.id}/images`, { src: 'a.png' })).status, 404)
  assert.equal((await srv.get(`/api/graphics/${msg.id}/images`)).status, 404)
})

test('svg images are accepted', async () => {
  const g = await createImageWidget()
  const res = await srv.post('/api/projects/blank/assets', fileForm(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'), 'bug.svg'))
  assert.equal(res.status, 200, res.text)
  assert.equal((await srv.post(`/api/graphics/${g.id}/images`, { src: 'bug.svg' })).status, 201)
})

test('auto-hide takes the image off air after the set time; a new take restarts it', async () => {
  const g = await createImageWidget()
  const [a, b] = (await srv.post(`/api/graphics/${g.id}/images`, { images: [{ src: 'a.png' }, { src: 'b.png' }] })).json.images
  await srv.patch(`/api/graphics/${g.id}`, { data: { autoHideMs: 400 } })

  await srv.post(`/api/graphics/${g.id}/images/${a.id}/show`)
  await sleep(250)
  await srv.post(`/api/graphics/${g.id}/images/${b.id}/show`) // restart
  await sleep(250)
  assert.equal((await srv.get(`/api/graphics/${g.id}`)).json.visible, true, 'still on air 500 ms after the first take')
  await sleep(350)
  const after = (await srv.get(`/api/graphics/${g.id}`)).json
  assert.equal(after.visible, false)
  assert.equal(after.data.activeImageId, b.id, 'keeps the last image for Next')
})

test('carousel rotates through the list while on air and stops when hidden', async () => {
  const g = await createImageWidget()
  const imgs = (await srv.post(`/api/graphics/${g.id}/images`, { images: [{ src: 'a.png' }, { src: 'b.png' }] })).json.images
  await srv.patch(`/api/graphics/${g.id}`, { data: { rotation: { enabled: true, intervalMs: 2000 } } })
  await srv.post(`/api/graphics/${g.id}/images/${imgs[0].id}/show`)
  await sleep(2300)
  assert.equal((await srv.get(`/api/graphics/${g.id}`)).json.data.activeImageId, imgs[1].id)
  await srv.post(`/api/graphics/${g.id}/hide`)
  await sleep(2200)
  assert.equal((await srv.get(`/api/graphics/${g.id}`)).json.data.activeImageId, imgs[1].id, 'no rotation off air')
})

// Last: a second server switches the process-wide data dir.
test('migration runs on load and is written back once', async () => {
  const dir = await makeTempDir()
  const project = {
    graphics: [{ id: 'old-image', type: 'image', name: 'Logo', visible: true, position: 'top-left', data: { src: 'logo.png', alt: '' } }]
  }
  const local = await startTestServer({
    dataDir: dir,
    prepare: async (d) => {
      await fs.mkdir(path.join(d, 'projects', 'blank', 'assets'), { recursive: true })
      await fs.writeFile(path.join(d, 'projects', 'blank', 'project.json'), JSON.stringify(project))
      await fs.writeFile(
        path.join(d, 'registry.json'),
        JSON.stringify({ activeProjectId: 'blank', projects: [{ id: 'blank', name: 'Blank' }] })
      )
    }
  })
  try {
    const g = (await local.get('/api/state')).json.graphics[0]
    assert.equal(g.data.activeImageId, LEGACY_IMAGE_ID)
    assert.equal(g.data.images[0].src, 'logo.png')
    assert.equal(g.visible, true)
    const stored = JSON.parse(await fs.readFile(path.join(dir, 'projects', 'blank', 'project.json'), 'utf8'))
    assert.ok(Array.isArray(stored.graphics[0].data.images), 'migrated project saved')
    assert.equal(stored.graphics[0].data.src, undefined)
  } finally {
    await local.close()
  }
})
