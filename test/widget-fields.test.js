import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import {
  coerceFieldInput,
  defineFields,
  fieldControlsHtml,
  fieldDefaults,
  fieldDisplayValue,
  fieldSummary,
  fieldsHtml,
  validateFieldData
} from '../public/shared/widget-fields.js'
import {
  WIDGET_DESCRIPTIONS,
  widgetDefaultData,
  widgetDescription,
  widgetFields
} from '../public/shared/widget-types.js'
import { createGraphicFromType, isWidgetType } from '../server/graphicDefaults.js'
import { validateGraphicPatch } from '../server/validation.js'
import { startTestServer } from './helpers.js'

/** One field of every kind, with limits. */
const SAMPLE = defineFields([
  { key: 'headline', kind: 'text', label: 'Headline', default: 'Breaking', maxLength: 20 },
  { key: 'body', kind: 'multiline', label: 'Body', default: '', maxLength: 200 },
  { key: 'size', kind: 'number', label: 'Size', default: 40, min: 10, max: 200, integer: true },
  { key: 'opacity', kind: 'number', label: 'Opacity', default: 0.8, min: 0, max: 1, step: 0.1 },
  { key: 'crawl', kind: 'boolean', label: 'Crawl', default: false },
  { key: 'side', kind: 'choice', label: 'Side', default: 'left', options: ['left', { value: 'right', label: 'Right side' }] },
  { key: 'accent', kind: 'color', label: 'Accent', default: '#ff0000' },
  { key: 'legacy', kind: 'text', label: 'Legacy', default: '', lenient: true }
])

/* ------------------------------------------------------------ description */

test('defineFields: normalises options and refuses a wrong description', () => {
  assert.deepEqual(SAMPLE.find((f) => f.key === 'side').options, [
    { value: 'left', label: 'left' },
    { value: 'right', label: 'Right side' }
  ])
  assert.ok(Object.isFrozen(SAMPLE) && Object.isFrozen(SAMPLE[0]))
  const bad = [
    'not a list',
    [{ kind: 'text', default: '' }],
    [{ key: '__proto__', kind: 'text', default: '' }],
    [{ key: 'a', kind: 'slider', default: 1 }],
    [{ key: 'a', kind: 'text', default: '' }, { key: 'a', kind: 'text', default: '' }],
    [{ key: 'a', kind: 'text' }],
    [{ key: 'a', kind: 'text', default: 5 }],
    [{ key: 'a', kind: 'text', default: 'too long', maxLength: 3 }],
    [{ key: 'a', kind: 'number', default: 5, max: 3 }],
    [{ key: 'a', kind: 'number', default: 1, min: 'low' }],
    [{ key: 'a', kind: 'choice', default: 'x' }],
    [{ key: 'a', kind: 'choice', default: 'z', options: ['x', 'y'] }],
    [{ key: 'a', kind: 'choice', default: 'x', options: ['x', 'x'] }],
    [{ key: 'a', kind: 'number', default: 1, lenient: true }]
  ]
  for (const list of bad) assert.throws(() => defineFields(list), Error, JSON.stringify(list))
})

/* --------------------------------------------------- description → defaults */

test('fieldDefaults: every field default, in the order of the list', () => {
  const defaults = fieldDefaults(SAMPLE)
  assert.deepEqual(defaults, {
    headline: 'Breaking',
    body: '',
    size: 40,
    opacity: 0.8,
    crawl: false,
    side: 'left',
    accent: '#ff0000',
    legacy: ''
  })
  assert.deepEqual(Object.keys(defaults), SAMPLE.map((f) => f.key))
  assert.deepEqual(fieldDefaults([]), {})
})

test('message and lowerThird: the description gives the widget the old template gave', () => {
  assert.deepEqual(widgetDefaultData('message'), { text: 'Message', placementFree: { x: 50, y: 82 } })
  assert.deepEqual(widgetDefaultData('lowerThird'), { name: 'Name', title: 'Title', company: '' })
  assert.deepEqual(Object.keys(widgetDefaultData('message')), ['text', 'placementFree'])
  assert.deepEqual(Object.keys(widgetDefaultData('lowerThird')), ['name', 'title', 'company'])

  const { id: messageId, ...message } = createGraphicFromType('message', 'Break')
  assert.match(messageId, /^message-[0-9a-f]{8}$/)
  assert.deepEqual(message, {
    transition: { in: 'auto', out: 'auto', duration: 450 },
    type: 'message',
    name: 'Break',
    visible: false,
    soloVisible: false,
    position: 'custom',
    operator: false,
    data: { text: 'Message', placementFree: { x: 50, y: 82 } }
  })
  const { id: lowerId, ...lower } = createGraphicFromType('lowerThird', 'Guest')
  assert.match(lowerId, /^lower-third-[0-9a-f]{8}$/)
  assert.deepEqual(lower, {
    transition: { in: 'auto', out: 'auto', duration: 450 },
    type: 'lowerThird',
    name: 'Guest',
    visible: false,
    soloVisible: false,
    position: 'bottom-left',
    operator: false,
    data: { name: 'Name', title: 'Title', company: '' }
  })

  // Two new widgets never share the nested default objects.
  const a = createGraphicFromType('message')
  a.data.placementFree.x = 1
  assert.equal(createGraphicFromType('message').data.placementFree.x, 50)
  assert.equal(WIDGET_DESCRIPTIONS.message.extraData.placementFree.x, 50)
})

test('widgetDescription: own types only', () => {
  assert.ok(isWidgetType('message') && isWidgetType('lowerThird'))
  assert.equal(widgetDescription('message').label, 'Message')
  for (const type of ['matchScoreboard', 'nope', 'constructor', '__proto__', 'toString', null, 5]) {
    assert.equal(widgetDescription(type), null, String(type))
    assert.deepEqual(widgetFields(type), [])
    assert.deepEqual(widgetDefaultData(type), {})
  }
})

/* ------------------------------------------------- description → validation */

test('validateFieldData accepts values of the right kind within the limits', () => {
  const ok = [
    {},
    { headline: '' },
    { headline: 'x'.repeat(20) },
    { body: 'line 1\nline 2' },
    { size: 10 },
    { size: 200 },
    { opacity: 0.35 },
    { crawl: true },
    { side: 'right' },
    { accent: '#abc' },
    { accent: '#A1B2C3' },
    { accent: 'rgba(0, 0, 0, 0.85)' },
    { accent: 'white' },
    { accent: '' },
    // A partial patch: only the keys that are sent are checked.
    { size: 12, crawl: false },
    // Keys the list does not describe are left alone, whatever they hold.
    { placementFree: { x: 1, y: 2 }, entries: [1, 2], other: null },
    { headline: undefined }
  ]
  for (const data of ok) assert.equal(validateFieldData(SAMPLE, data), null, JSON.stringify(data))
})

test('validateFieldData rejects a wrong kind or a broken limit, and names the field', () => {
  const bad = [
    [{ headline: 5 }, /^data\.headline: expected text, got number$/],
    [{ headline: null }, /^data\.headline: expected text, got null$/],
    [{ headline: ['a'] }, /^data\.headline: expected text, got a list$/],
    [{ headline: { a: 1 } }, /^data\.headline: expected text, got an object$/],
    [{ headline: 'x'.repeat(21) }, /^data\.headline: at most 20 characters$/],
    [{ body: true }, /^data\.body: expected text, got boolean$/],
    [{ size: '40' }, /^data\.size: expected a number, got string$/],
    [{ size: 40.5 }, /^data\.size: expected a whole number$/],
    [{ size: 9 }, /^data\.size: must be at least 10$/],
    [{ size: 201 }, /^data\.size: must be at most 200$/],
    [{ size: null }, /^data\.size: expected a number, got null$/],
    [{ opacity: 1.5 }, /^data\.opacity: must be at most 1$/],
    [{ crawl: 'yes' }, /^data\.crawl: expected true or false, got string$/],
    [{ crawl: 1 }, /^data\.crawl: expected true or false, got number$/],
    [{ side: 'middle' }, /^data\.side: expected one of: left, right$/],
    [{ side: ['left'] }, /^data\.side: expected one of the choices, got a list$/],
    [{ accent: 'not a colour!' }, /^data\.accent: expected a colour such as #ff0000$/],
    [{ accent: 'red; position: fixed' }, /^data\.accent: /],
    [{ accent: 16711680 }, /^data\.accent: expected a colour, got number$/],
    // The first problem in the order of the list is reported.
    [{ size: 9, headline: 5 }, /^data\.headline: /]
  ]
  for (const [data, message] of bad) assert.match(validateFieldData(SAMPLE, data), message, JSON.stringify(data))
  assert.match(validateFieldData(SAMPLE, { size: 9 }, 'graphics[2].data'), /^graphics\[2\]\.data\.size: /)
  for (const notAnObject of [null, 'x', [], 5]) assert.match(validateFieldData(SAMPLE, notAnObject), /expected an object/)
})

test('validateFieldData: a lenient text field also takes numbers, booleans and null, never a list or object', () => {
  for (const value of ['text', '', 0, 42, 1.5, true, false, null]) {
    assert.equal(validateFieldData(SAMPLE, { legacy: value }), null, JSON.stringify(value))
  }
  assert.match(validateFieldData(SAMPLE, { legacy: [1] }), /^data\.legacy: expected text, got a list$/)
  assert.match(validateFieldData(SAMPLE, { legacy: {} }), /^data\.legacy: expected text, got an object$/)
})

/* ------------------------------------------------------- description → form */

test('coerceFieldInput turns control text into a value of the field kind', () => {
  const field = (key) => SAMPLE.find((f) => f.key === key)
  assert.deepEqual(coerceFieldInput(field('headline'), 'Hello'), { value: 'Hello' })
  assert.deepEqual(coerceFieldInput(field('headline'), undefined), { value: '' })
  assert.match(coerceFieldInput(field('headline'), 'x'.repeat(21)).error, /^Headline: at most 20 characters$/)
  assert.deepEqual(coerceFieldInput(field('size'), ' 42 '), { value: 42 })
  assert.deepEqual(coerceFieldInput(field('opacity'), '0,5'), { value: 0.5 })
  assert.match(coerceFieldInput(field('size'), '').error, /^Size: enter a number$/)
  assert.match(coerceFieldInput(field('size'), 'abc').error, /enter a number/)
  assert.match(coerceFieldInput(field('size'), '4.5').error, /whole number/)
  assert.match(coerceFieldInput(field('size'), '500').error, /at most 200/)
  assert.deepEqual(coerceFieldInput(field('crawl'), true), { value: true })
  assert.deepEqual(coerceFieldInput(field('crawl'), 'false'), { value: false })
  assert.deepEqual(coerceFieldInput(field('side'), 'right'), { value: 'right' })
  assert.match(coerceFieldInput(field('side'), 'middle').error, /not one of the choices/)
  assert.deepEqual(coerceFieldInput(field('accent'), '#00ff00'), { value: '#00ff00' })
  assert.ok(coerceFieldInput(null, 'x').error)
  // A choice with number values gives the number back, not the text of the control.
  const [level] = defineFields([{ key: 'level', kind: 'choice', default: 1, options: [1, 2, 3] }])
  assert.deepEqual(coerceFieldInput(level, '2'), { value: 2 })
})

test('fieldDisplayValue: text shows what is stored, the other kinds fall back to the default', () => {
  const show = (key, data) => fieldDisplayValue(SAMPLE.find((f) => f.key === key), data)
  assert.equal(show('headline', { headline: 'Hi' }), 'Hi')
  assert.equal(show('headline', {}), '', 'missing text is empty, not the default')
  assert.equal(show('headline', undefined), '')
  assert.equal(show('legacy', { legacy: 0 }), '0')
  assert.equal(show('legacy', { legacy: null }), '')
  assert.equal(show('size', {}), 40)
  assert.equal(show('size', { size: 'big' }), 40)
  assert.equal(show('size', { size: 64 }), 64)
  assert.equal(show('crawl', {}), false)
  assert.equal(show('crawl', { crawl: true }), true)
  assert.equal(show('side', { side: 'gone' }), 'left')
  assert.equal(show('accent', { accent: 'rgba(0,0,0,1)' }), '#ff0000', 'the picker only takes #rrggbb')
  assert.equal(show('accent', { accent: '#00FF00' }), '#00FF00')
})

test('fieldSummary joins the filled-in fields', () => {
  const fields = widgetFields('lowerThird')
  assert.equal(fieldSummary(fields, ['name', 'title'], { name: 'Ada', title: 'Engineer', company: 'X' }, 'Lower third'), 'Ada · Engineer')
  assert.equal(fieldSummary(fields, ['name', 'title'], { name: 'Ada', title: '' }, 'Lower third'), 'Ada')
  assert.equal(fieldSummary(fields, ['name', 'title'], {}, 'Lower third'), 'Lower third')
  assert.equal(fieldSummary(SAMPLE, ['side'], { side: 'right' }), 'Right side')
})

test('fieldsHtml: one control per field, values escaped', () => {
  const html = fieldsHtml(SAMPLE, {
    headline: '"><script>alert(1)</script>',
    body: '</textarea><b>',
    size: 64,
    crawl: true,
    side: 'right',
    accent: '#00ff00'
  })
  assert.ok(!html.includes('<script>') && !html.includes('</textarea><b>'))
  assert.match(html, /^<div class="pv-group__cell op-grid op-grid--auto">/)
  assert.match(html, /<input type="text" data-field="headline" maxlength="20" value="&quot;&gt;&lt;script&gt;/)
  assert.match(html, /<textarea rows="2" data-field="body" maxlength="200">&lt;\/textarea&gt;&lt;b&gt;<\/textarea>/)
  assert.match(html, /<input type="number" inputmode="numeric" step="1" min="10" max="200" data-field="size" value="64" \/>/)
  assert.match(html, /<input type="number" inputmode="decimal" step="0.1" min="0" max="1" data-field="opacity" value="0.8" \/>/)
  assert.match(html, /data-action="field-toggle" data-field="crawl" aria-pressed="true">On<\/button>/)
  assert.match(html, /<select data-field="side"><option value="left">left<\/option><option value="right" selected>Right side<\/option><\/select>/)
  assert.match(html, /<input type="color" data-field="accent" value="#00ff00" \/>/)
  assert.equal((html.match(/data-field="/g) || []).length, SAMPLE.length)
  assert.equal(fieldsHtml([], {}), '')
  // The bare controls, for a card that places them in its own grid.
  assert.ok(!fieldControlsHtml(SAMPLE, {}).includes('pv-group__cell'))
})

test('message and lowerThird: the generated form is the form the cards had', () => {
  const squash = (html) => html.replace(/\s+/g, ' ').replace(/> </g, '><').trim()
  assert.equal(
    squash(fieldsHtml(widgetFields('message'), { text: 'Back in 5 "minutes"' })),
    '<div class="pv-group__cell op-grid op-grid--1"><label class="field op-field"><span>Message text</span>' +
      '<input type="text" data-field="text" value="Back in 5 &quot;minutes&quot;" /></label></div>'
  )
  assert.equal(
    squash(fieldsHtml(widgetFields('lowerThird'), { name: 'Ada', title: 'Engineer' })),
    '<div class="pv-group__cell op-grid op-grid--auto">' +
      '<label class="field op-field"><span>Name</span><input type="text" data-field="name" value="Ada" /></label>' +
      '<label class="field op-field"><span>Title</span><input type="text" data-field="title" value="Engineer" /></label>' +
      '<label class="field op-field"><span>Company</span><input type="text" data-field="company" value="" /></label>' +
      '</div>'
  )
  // Typing reaches the air while typing, as before.
  for (const type of ['message', 'lowerThird']) assert.ok(widgetFields(type).every((f) => f.live), type)
})

/* -------------------------------------------- the two converted types: API */

test('validateGraphicPatch checks described fields only for described types', () => {
  const message = { id: 'm', type: 'message', data: {} }
  assert.doesNotThrow(() => validateGraphicPatch(message, { data: { text: 'Hello' } }))
  assert.throws(() => validateGraphicPatch(message, { data: { text: ['Hello'] } }), { status: 400, message: /data\.text/ })
  // A type without a description keeps its own (absent) rules for the same key.
  assert.doesNotThrow(() => validateGraphicPatch({ id: 't', type: 'customTicker', data: {} }, { data: { text: ['x'] } }))
  assert.doesNotThrow(() => validateGraphicPatch({ id: 'f', type: 'futureWidget', data: {} }, { data: { text: ['x'] } }))
})

test('API: message and lowerThird accept and reject what they did before', async () => {
  const srv = await startTestServer()
  try {
    const created = await srv.post('/api/graphics', { type: 'message', name: 'Break' })
    assert.equal(created.status, 201, created.text)
    assert.deepEqual(created.json.data, { text: 'Message', placementFree: { x: 50, y: 82 } })
    assert.equal(created.json.position, 'custom')
    assert.equal(created.json.operator, false)
    const lower = await srv.post('/api/graphics', { type: 'lowerThird', name: 'Guest' })
    assert.equal(lower.status, 201, lower.text)
    assert.deepEqual(lower.json.data, { name: 'Name', title: 'Title', company: '' })
    assert.equal(lower.json.position, 'bottom-left')
    assert.equal(lower.json.operator, false)
    const messageUrl = `/api/graphics/${created.json.id}`
    const lowerUrl = `/api/graphics/${lower.json.id}`

    // Accepted before, accepted now; stored exactly as sent.
    const accepted = [
      [messageUrl, { text: 'Back in 5 minutes' }],
      [messageUrl, { text: '' }],
      [messageUrl, { text: 'x'.repeat(20000) }],
      [messageUrl, { text: '{{home.name}} {{home.score}}' }],
      [messageUrl, { text: 42 }],
      [messageUrl, { text: true }],
      [messageUrl, { text: null }],
      [messageUrl, { placementFree: { x: 10, y: 20 } }],
      [messageUrl, { somethingElse: [1, 2], style: { fontSize: 3 } }],
      [messageUrl, {}],
      [lowerUrl, { name: 'Ada Lovelace', title: 'Engineer', company: 'Analytical Engines' }],
      [lowerUrl, { title: null }],
      [lowerUrl, { company: 7 }],
      [lowerUrl, { name: '' }]
    ]
    for (const [url, data] of accepted) {
      const res = await srv.patch(url, { data })
      assert.equal(res.status, 200, `${JSON.stringify(data).slice(0, 80)} → ${res.status} ${res.text.slice(0, 120)}`)
      for (const [key, value] of Object.entries(data)) assert.deepEqual(res.json.data[key], value, key)
    }
    // Companion "Message: set text (and show)".
    const shown = await srv.patch(messageUrl, { data: { text: 'On air' }, visible: true })
    assert.equal(shown.status, 200, shown.text)
    assert.equal(shown.json.visible, true)
    assert.equal(shown.json.data.text, 'On air')

    // Rejected before, rejected now.
    const rejected = [
      [messageUrl, { data: 'text' }],
      [messageUrl, { data: null }],
      [messageUrl, { data: ['text'] }],
      [messageUrl, { data: { placementFree: 5 } }],
      [messageUrl, { data: { placementFree: [50, 82] } }],
      [messageUrl, { type: 'lowerThird' }],
      [messageUrl, { visible: 'yes' }],
      [messageUrl, JSON.parse('{"data": {"__proto__": {"x": 1}}}')],
      [lowerUrl, { data: 5 }],
      [lowerUrl, { name: 5 }]
    ]
    // New: a list or an object in a text field (see docs/ARCHITECTURE.md, "Describing a widget type").
    const rejectedNow = [
      [messageUrl, { data: { text: ['a', 'b'] } }, /^data\.text: expected text, got a list$/],
      [messageUrl, { data: { text: { nl: 'Hallo' } } }, /^data\.text: expected text, got an object$/],
      [lowerUrl, { data: { name: {} } }, /^data\.name: /],
      [lowerUrl, { data: { title: [] } }, /^data\.title: /],
      [lowerUrl, { data: { name: 'ok', company: { a: 1 } } }, /^data\.company: /]
    ]
    for (const [url, body, message] of [...rejected, ...rejectedNow]) {
      const res = await srv.patch(url, body)
      assert.equal(res.status, 400, `${JSON.stringify(body)} → ${res.status}`)
      assert.ok(res.json.error)
      if (message) assert.match(res.json.error, message)
    }
    // A rejected patch changes nothing, and the field can still be set afterwards.
    assert.equal((await srv.get(messageUrl)).json.data.text, 'On air')
    assert.equal((await srv.get(lowerUrl)).json.data.name, '')
    assert.equal((await srv.patch(messageUrl, { data: { text: 'Still editable' } })).status, 200)

    // PATCH /api/state (a client that sends the whole list) runs the same check.
    const state = (await srv.get('/api/state')).json
    const echo = await srv.patch('/api/state', { graphics: state.graphics })
    assert.equal(echo.status, 200, echo.text)
    const broken = state.graphics.map((g) => (g.type === 'message' ? { ...g, data: { ...g.data, text: { a: 1 } } } : g))
    const refused = await srv.patch('/api/state', { graphics: broken })
    assert.equal(refused.status, 400)
    assert.match(refused.json.error, /^graphics\[\d+\]\.data\.text: expected text, got an object$/)
  } finally {
    await srv.close()
  }
})

test('existing projects load unchanged, whatever the two types hold', async () => {
  const graphics = [
    { id: 'm1', type: 'message', name: 'Old message', visible: true, position: 'center', data: { text: 'hi' } },
    { id: 'm2', type: 'message', data: { text: 5, extra: { kept: true } } },
    { id: 'm3', type: 'message', data: { text: { nl: 'Hallo' } } },
    { id: 'm4', type: 'message' },
    { id: 'l1', type: 'lowerThird', name: 'Guest', data: { name: 'Ada', title: null } },
    { id: 'l2', type: 'lowerThird', data: { name: ['a'], title: 'T', company: 'C', logo: 'x.png' } }
  ]
  const srv = await startTestServer({
    prepare: async (dir) => {
      const projectDir = path.join(dir, 'projects', 'show')
      await fs.mkdir(path.join(projectDir, 'assets'), { recursive: true })
      await fs.writeFile(path.join(projectDir, 'project.json'), JSON.stringify({ graphics }))
      await fs.writeFile(
        path.join(dir, 'registry.json'),
        JSON.stringify({ activeProjectId: 'show', projects: [{ id: 'show', name: 'Show' }] })
      )
    }
  })
  try {
    const state = (await srv.get('/api/state')).json
    assert.equal(state.projectId, 'show')
    assert.deepEqual(state.graphics.map((g) => g.id), graphics.map((g) => g.id))
    for (const stored of graphics) {
      const loaded = state.graphics.find((g) => g.id === stored.id)
      assert.deepEqual(loaded.data, stored.data, stored.id)
      assert.equal(loaded.name, stored.name, stored.id)
    }
    // Toggling such a widget does not run into the field check.
    const toggled = await srv.post('/api/graphics/m3/toggle', { visible: true })
    assert.equal(toggled.status, 200, toggled.text)
    assert.deepEqual(toggled.json.data.text, { nl: 'Hallo' })
    // An old widget without the newer keys takes a normal edit.
    const edited = await srv.patch('/api/graphics/m1', { data: { text: 'hello' } })
    assert.equal(edited.status, 200, edited.text)
    assert.deepEqual(edited.json.data, { text: 'hello' })
  } finally {
    await srv.close()
  }
})
