import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { stepListId } from '../public/shared/list-step.js'
import { stepImageId } from '../public/shared/image-list.js'
import {
  WIDGET_DESCRIPTIONS,
  describeWidget,
  widgetActions,
  widgetCapabilities,
  widgetFields,
  widgetHasSteps
} from '../public/shared/widget-types.js'
import { quizStepTarget } from '../server/quizShow.js'
import { createGraphicFromType } from '../server/graphicDefaults.js'
import { startTestServer, socketConnect } from './helpers.js'

/* ------------------------------------------------------------ declarations */

test('a description can declare steps and actions without describing fields', () => {
  const stepsOnly = describeWidget({ label: 'Slides', steps: true })
  assert.equal(stepsOnly.steps, true)
  assert.equal(stepsOnly.fields, null, 'the type keeps its own defaults, validation and card')
  assert.deepEqual(stepsOnly.actions, [])

  const withActions = describeWidget({
    label: 'Poll',
    actions: [
      { id: 'close', label: 'Close the poll' },
      { id: 'set-option', label: 'Highlight option', fields: [{ key: 'option', kind: 'number', default: 1, min: 1, integer: true }] }
    ]
  })
  assert.equal(withActions.steps, false)
  assert.deepEqual(withActions.actions.map((a) => [a.id, a.label, a.fields.map((f) => f.key)]), [
    ['close', 'Close the poll', []],
    ['set-option', 'Highlight option', ['option']]
  ])
  assert.ok(Object.isFrozen(withActions.actions) && Object.isFrozen(withActions.actions[0]))

  const bad = [
    { steps: true },
    { label: 'X', actions: 'reveal' },
    { label: 'X', actions: [{ label: 'No id' }] },
    { label: 'X', actions: [{ id: 'Reveal Answer', label: 'Bad id' }] },
    { label: 'X', actions: [{ id: 'reveal' }] },
    { label: 'X', actions: [{ id: 'a', label: 'A' }, { id: 'a', label: 'Again' }] },
    { label: 'X', actions: [{ id: 'a', label: 'A', fields: [{ key: 'n', kind: 'number' }] }] },
    { label: 'X', extraData: { a: 1 } },
    { label: 'X', summary: ['name'] }
  ]
  for (const description of bad) assert.throws(() => describeWidget(description), Error, JSON.stringify(description))
})

test('built-in types: who has steps, who has actions', () => {
  for (const type of ['lowerThirdShow', 'image', 'quizShow']) assert.ok(widgetHasSteps(type), type)
  for (const type of ['message', 'lowerThird', 'matchScoreboard', 'customTicker', 'nope', 'constructor', null]) {
    assert.equal(widgetHasSteps(type), false, String(type))
    assert.deepEqual(widgetActions(type), [], String(type))
  }
  assert.deepEqual(widgetActions('quizShow').map((a) => a.id), ['reveal', 'hide-answer', 'show-question'])
  assert.deepEqual(widgetActions('image'), [])

  // Declaring steps does not turn a type into a field-described one.
  for (const type of ['lowerThirdShow', 'image', 'quizShow']) {
    assert.equal(WIDGET_DESCRIPTIONS[type].fields, null, type)
    assert.deepEqual(widgetFields(type), [])
  }
  assert.ok(Array.isArray(createGraphicFromType('quizShow').data.questions), 'own template still used')
  assert.deepEqual(createGraphicFromType('image').data.images, [])
  assert.deepEqual(createGraphicFromType('lowerThirdShow').data.entries, [])
})

test('widgetCapabilities: only types that have something, as plain JSON', () => {
  const caps = widgetCapabilities()
  assert.deepEqual(Object.keys(caps).sort(), ['image', 'lowerThirdShow', 'quizShow'])
  assert.deepEqual(caps.image, { steps: true, actions: [] })
  assert.deepEqual(caps.lowerThirdShow, { steps: true, actions: [] })
  assert.deepEqual(caps.quizShow, {
    steps: true,
    actions: [
      { id: 'reveal', label: 'Reveal answer', fields: [] },
      { id: 'hide-answer', label: 'Hide answer', fields: [] },
      {
        id: 'show-question',
        label: 'Show question by number',
        fields: [{ key: 'number', kind: 'number', label: 'Question number', default: 1, min: 1, integer: true }]
      }
    ]
  })
  assert.deepEqual(JSON.parse(JSON.stringify(caps)), caps)
})

/* ---------------------------------------------------------------- stepping */

test('stepListId: next/previous, the ends, no active item, empty list', () => {
  const items = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]
  assert.equal(stepImageId, stepListId, 'the image widget uses the same rule')
  assert.equal(stepListId(items, 'a', 'next'), 'b')
  assert.equal(stepListId(items, 'b', 'previous'), 'a')
  assert.equal(stepListId(items, 'c', 'next'), 'a', 'wraps by default')
  assert.equal(stepListId(items, 'a', 'previous'), 'c')
  assert.equal(stepListId(items, 'c', 'next', { wrap: false }), null)
  assert.equal(stepListId(items, 'a', 'previous', { wrap: false }), null)
  assert.equal(stepListId(items, null, 'next'), 'a')
  assert.equal(stepListId(items, null, 'previous'), 'c')
  assert.equal(stepListId(items, 'gone', 'next', { wrap: false }), 'a')
  assert.equal(stepListId([{ id: 'only' }], 'only', 'next'), 'only')
  assert.equal(stepListId([], null, 'next'), null)
})

test('quizStepTarget: question → answer → next question, and back', () => {
  const questions = [{ id: 'q1' }, { id: 'q2' }, { id: 'q3' }]
  const step = (activeId, revealed, visible, direction, wrap = true) => {
    const target = quizStepTarget(questions, { activeId, revealed, visible }, direction, { wrap })
    return target && `${target.questionId}${target.revealed ? '+answer' : ''}`
  }
  // On air, forwards.
  assert.equal(step('q1', false, true, 'next'), 'q1+answer')
  assert.equal(step('q1', true, true, 'next'), 'q2')
  assert.equal(step('q3', false, true, 'next'), 'q3+answer')
  assert.equal(step('q3', true, true, 'next'), 'q1', 'wraps to the first question')
  assert.equal(step('q3', true, true, 'next', false), null, 'no wrap: nothing changes')
  // On air, backwards: exactly undoes "next".
  assert.equal(step('q2', true, true, 'previous'), 'q2')
  assert.equal(step('q2', false, true, 'previous'), 'q1+answer')
  assert.equal(step('q1', false, true, 'previous'), 'q3+answer', 'wraps to the end of the sequence')
  assert.equal(step('q1', false, true, 'previous', false), null)
  assert.equal(step('q1', true, true, 'previous', false), 'q1')
  // Off air: going on air never shows an answer.
  assert.equal(step('q2', false, false, 'next'), 'q2', 'a question that was not answered yet comes back')
  assert.equal(step('q2', true, false, 'next'), 'q3')
  assert.equal(step('q3', true, false, 'next'), 'q1')
  assert.equal(step('q3', true, false, 'next', false), null)
  assert.equal(step('q2', false, false, 'previous'), 'q1')
  assert.equal(step('q2', true, false, 'previous'), 'q1')
  assert.equal(step('q1', true, false, 'previous', false), null)
  // No current question (new quiz, or the question was deleted).
  for (const visible of [true, false]) {
    assert.equal(step(null, false, visible, 'next'), 'q1')
    assert.equal(step(null, true, visible, 'previous'), 'q3')
    assert.equal(step('deleted', true, visible, 'next', false), 'q1')
  }
  assert.equal(quizStepTarget([], {}, 'next'), null)
  // A one-question quiz toggles between question and answer, and restarts with wrap.
  const one = (revealed, direction, wrap) => quizStepTarget([{ id: 'q' }], { activeId: 'q', revealed, visible: true }, direction, { wrap })
  assert.deepEqual(one(false, 'next', true), { questionId: 'q', revealed: true })
  assert.deepEqual(one(true, 'next', true), { questionId: 'q', revealed: false })
  assert.equal(one(true, 'next', false), null)
})

/* --------------------------------------------------------------------- API */

let srv

before(async () => {
  srv = await startTestServer()
})

after(async () => {
  await srv?.close()
})

async function create(type, name = type) {
  const res = await srv.post('/api/graphics', { type, name })
  assert.equal(res.status, 201, res.text)
  return res.json
}

const urlOf = (g, suffix = '') => `/api/graphics/${g.id}${suffix}`

async function ok(promise) {
  const res = await promise
  assert.equal(res.status, 200, res.text)
  return res.json
}

const step = (g, delta, extra = {}) => srv.post(urlOf(g, '/step'), { delta, ...extra })
const hide = (g) => ok(srv.post(urlOf(g, '/hide')))

async function makeRoster(names) {
  const roster = await create('lowerThirdShow', 'Speakers')
  const ids = []
  for (const name of names) {
    const res = await srv.post(urlOf(roster, '/entries'), { name, title: `${name}'s title` })
    assert.equal(res.status, 201, res.text)
    ids.push(res.json.entry.id)
  }
  return { roster, ids }
}

async function makeImages(files) {
  const widget = await create('image', 'Sponsors')
  const res = await srv.post(urlOf(widget, '/images'), { images: files.map((src) => ({ src })) })
  assert.equal(res.status, 201, res.text)
  return { widget, ids: res.json.images.map((img) => img.id) }
}

async function makeQuiz(count) {
  const quiz = await create('quizShow', 'Quiz')
  const questions = Array.from({ length: count }, (_, i) => ({
    id: `q${i + 1}`,
    question: `Question ${i + 1}?`,
    options: ['A', 'B', 'C', 'D'],
    correct: 0
  }))
  await ok(srv.patch(urlOf(quiz), { data: { questions } }))
  return quiz
}

test('discovery: the state lists steps and actions per widget type, and never stores them', async () => {
  const state = (await srv.get('/api/state')).json
  assert.deepEqual(state.widgetTypes, widgetCapabilities())

  const sock = await socketConnect(srv.base)
  try {
    assert.deepEqual((await sock.emitWithAck('getState', null)).widgetTypes, widgetCapabilities())
  } finally {
    sock.close()
  }

  // A client that sends the state back does not get an "unknown key" error, and nothing is saved.
  const echoed = await srv.patch('/api/state', { widgetTypes: { message: { steps: true } }, settings: { fontSize: 2.3 } })
  assert.equal(echoed.status, 200, echoed.text)
  assert.deepEqual(echoed.json.widgetTypes, widgetCapabilities())
  const stored = JSON.parse(await fs.readFile(path.join(srv.dir, 'projects', state.projectId, 'project.json'), 'utf8'))
  assert.equal(stored.settings.fontSize, 2.3)
  assert.equal(stored.widgetTypes, undefined)
})

test('step route: lower-thirds roster', async () => {
  const { roster, ids } = await makeRoster(['Anna', 'Bram', 'Cleo'])
  const [anna, bram, cleo] = ids
  const active = (g) => [g.visible, g.data.activeEntryId]

  // No body at all means "next"; a new roster starts with the first person.
  const first = await srv.post(urlOf(roster, '/step'))
  assert.equal(first.status, 200, first.text)
  assert.deepEqual(active(first.json), [true, anna])
  assert.deepEqual(active(await ok(step(roster, 1))), [true, bram])
  assert.deepEqual(active(await ok(step(roster, 1))), [true, cleo])
  // End of the list.
  const stay = await ok(step(roster, 1, { wrap: false }))
  assert.deepEqual(active(stay), [true, cleo], 'no wrap: stays on the last person')
  assert.deepEqual(active(await ok(step(roster, 1))), [true, anna], 'wraps to the first')
  assert.deepEqual(active(await ok(step(roster, -1, { wrap: false }))), [true, anna])
  assert.deepEqual(active(await ok(step(roster, -1))), [true, cleo], 'wraps to the last')
  assert.deepEqual(active(await ok(step(roster, -1))), [true, bram])

  // Off air: hiding keeps the person, the next step continues from there and goes on air.
  assert.deepEqual(active(await hide(roster)), [false, bram])
  assert.deepEqual(active(await ok(step(roster, 1))), [true, cleo])
  await hide(roster)
  assert.deepEqual(active(await ok(step(roster, 1, { wrap: false }))), [false, cleo], 'no wrap at the end: stays off air')
  assert.deepEqual(active(await ok(step(roster, -1))), [true, bram])

  // Same result as the roster's own route.
  const viaShow = await ok(srv.post(urlOf(roster, `/entries/${cleo}/show`)))
  await ok(srv.post(urlOf(roster, `/entries/${bram}/show`)))
  const viaStep = await ok(step(roster, 1))
  assert.deepEqual(viaStep, viaShow)

  // "previous" on a new roster starts at the end.
  const fresh = await makeRoster(['One', 'Two'])
  assert.deepEqual(active(await ok(step(fresh.roster, -1))), [true, fresh.ids[1]])

  // Ten quick presses are ten steps (computed inside the write queue).
  const five = await makeRoster(['a', 'b', 'c', 'd', 'e'])
  const results = await Promise.all(Array.from({ length: 10 }, () => step(five.roster, 1)))
  assert.ok(results.every((r) => r.status === 200))
  assert.equal((await srv.get(urlOf(five.roster))).json.data.activeEntryId, five.ids[4])

  // Nothing to step through.
  const empty = await create('lowerThirdShow', 'Empty')
  const refused = await step(empty, 1)
  assert.equal(refused.status, 409, refused.text)
  assert.match(refused.json.error, /no people/)
  assert.equal((await srv.get(urlOf(empty))).json.visible, false)
})

test('step route: image list, same result as /images/step', async () => {
  const { widget, ids } = await makeImages(['one.png', 'two.png', 'three.png'])
  const twin = await makeImages(['one.png', 'two.png', 'three.png'])
  const position = (g, list) => [g.visible, list.indexOf(g.data.activeImageId)]

  // The same presses through the new route and through the image widget's own route.
  const presses = [
    [1, true], [1, true], [1, true], [1, true], [-1, true], [-1, true], [1, false], [1, false], [-1, false],
    [-1, false], [-1, false], [-1, false], [-1, true]
  ]
  const seen = []
  for (const [delta, wrap] of presses) {
    const generic = await ok(step(widget, delta, { wrap }))
    const own = await ok(srv.post(urlOf(twin.widget, '/images/step'), { direction: delta === 1 ? 'next' : 'previous', wrap }))
    assert.deepEqual(position(generic, ids), position(own, twin.ids), `delta ${delta}, wrap ${wrap}`)
    seen.push(position(generic, ids)[1])
  }
  assert.deepEqual(seen, [0, 1, 2, 0, 2, 1, 2, 2, 1, 0, 0, 0, 2])

  // Off air: the next step continues from the image that was on air.
  await hide(widget)
  assert.deepEqual(position(await ok(step(widget, 1)), ids), [true, 0])
  await hide(widget)
  assert.deepEqual(position(await ok(step(widget, -1)), ids), [true, 2])

  const empty = await create('image', 'No images')
  const refused = await step(empty, 1)
  assert.equal(refused.status, 409, refused.text)
  assert.match(refused.json.error, /no images/)
  // The image widget's own route keeps its answer for an empty list.
  assert.equal((await srv.post(urlOf(empty, '/images/step'), {})).status, 404)
})

test('step route: quiz goes question → answer → next question', async () => {
  const quiz = await makeQuiz(3)
  const at = (g) => `${g.visible ? 'on' : 'off'} ${g.data.activeQuestionId}${g.data.revealed ? '+answer' : ''}`

  assert.equal(at(await ok(step(quiz, 1))), 'on q1', 'a new quiz starts with the first question, answer hidden')
  assert.equal(at(await ok(step(quiz, 1))), 'on q1+answer')
  assert.equal(at(await ok(step(quiz, 1))), 'on q2')
  assert.equal(at(await ok(step(quiz, -1))), 'on q1+answer', 'previous undoes next')
  assert.equal(at(await ok(step(quiz, -1))), 'on q1')
  assert.equal(at(await ok(step(quiz, -1, { wrap: false }))), 'on q1', 'no wrap at the start: nothing changes')
  assert.equal(at(await ok(step(quiz, -1))), 'on q3+answer', 'wraps to the end')
  assert.equal(at(await ok(step(quiz, 1, { wrap: false }))), 'on q3+answer', 'no wrap at the end: nothing changes')
  assert.equal(at(await ok(step(quiz, 1))), 'on q1', 'wraps to the first question')

  // Off air with the answer not shown yet: the same question comes back, answer hidden.
  await ok(step(quiz, 1))
  await ok(step(quiz, 1))
  assert.equal(at(await hide(quiz)), 'off q2')
  assert.equal(at(await ok(step(quiz, 1))), 'on q2')
  // Off air after the answer: on to the next question.
  await ok(step(quiz, 1))
  assert.equal(at(await hide(quiz)), 'off q2+answer')
  assert.equal(at(await ok(step(quiz, 1))), 'on q3')
  // Off air, previous: the question before, answer hidden.
  await hide(quiz)
  assert.equal(at(await ok(step(quiz, -1))), 'on q2')

  // The quiz the dashboard and the existing Companion actions drive with a PATCH is the same quiz.
  await ok(srv.patch(urlOf(quiz), { visible: true, data: { activeQuestionId: 'q1', revealed: false } }))
  assert.equal(at(await ok(step(quiz, 1))), 'on q1+answer')
  await ok(srv.patch(urlOf(quiz), { data: { revealed: false } }))
  assert.equal(at(await ok(step(quiz, 1))), 'on q1+answer')

  // The current question was deleted: start again at the first one.
  await ok(srv.patch(urlOf(quiz), { data: { activeQuestionId: 'gone', revealed: true } }))
  assert.equal(at(await ok(step(quiz, 1))), 'on q1')

  // A quiz without questions.
  await ok(srv.patch(urlOf(quiz), { visible: false, data: { questions: [] } }))
  const refused = await step(quiz, 1)
  assert.equal(refused.status, 409, refused.text)
  assert.match(refused.json.error, /no questions/)
  assert.equal((await srv.get(urlOf(quiz))).json.visible, false)
})

test('step route: bad requests', async () => {
  const { roster } = await makeRoster(['Anna'])
  for (const body of [{ delta: 2 }, { delta: 0 }, { delta: '1' }, { delta: 1.5 }, { delta: null }, { delta: 1, wrap: 'no' }]) {
    const res = await srv.post(urlOf(roster, '/step'), body)
    assert.equal(res.status, 400, `${JSON.stringify(body)} → ${res.status}`)
    assert.match(res.json.error, /^(delta|wrap): /)
  }
  assert.equal((await srv.post(urlOf(roster, '/step'), [1])).status, 400)
  assert.equal((await srv.get(urlOf(roster))).json.visible, false, 'a refused step changes nothing')

  assert.equal((await srv.post('/api/graphics/nope/step', { delta: 1 })).status, 404)
  for (const type of ['message', 'matchScoreboard', 'customTicker', 'streamCountdown']) {
    const g = await create(type)
    const res = await step(g, 1)
    assert.equal(res.status, 400, `${type} → ${res.status}`)
    assert.match(res.json.error, /has no steps/)
  }
})

test('action route: the quiz actions', async () => {
  const quiz = await makeQuiz(3)
  const act = (id, payload) => srv.post(urlOf(quiz, `/actions/${id}`), payload)
  const at = (g) => `${g.visible ? 'on' : 'off'} ${g.data.activeQuestionId}${g.data.revealed ? '+answer' : ''}`

  // Nothing on air yet: there is no answer to reveal.
  const early = await act('reveal')
  assert.equal(early.status, 409, early.text)
  assert.match(early.json.error, /no question on air/)

  assert.equal(at(await ok(act('show-question', { number: 2 }))), 'on q2')
  assert.equal(at(await ok(act('reveal'))), 'on q2+answer')
  assert.equal(at(await ok(act('reveal'))), 'on q2+answer', 'revealing twice is harmless')
  assert.equal(at(await ok(act('hide-answer'))), 'on q2')
  assert.equal(at(await ok(act('reveal', { ignored: true }))), 'on q2+answer', 'keys an action does not describe are ignored')
  assert.equal(at(await ok(act('show-question'))), 'on q1', 'a payload field that is not sent gets its default')
  assert.equal(at(await ok(act('show-question', { number: 3 }))), 'on q3')
  // Actions and steps work on the same quiz.
  assert.equal(at(await ok(step(quiz, 1))), 'on q3+answer')

  await hide(quiz)
  assert.equal((await act('reveal')).status, 409, 'off air: nothing to reveal')
  assert.equal(at(await ok(act('hide-answer'))), 'off q3')

  for (const payload of [{ number: 0 }, { number: '2' }, { number: 1.5 }, { number: null }, { number: [2] }]) {
    const res = await act('show-question', payload)
    assert.equal(res.status, 400, `${JSON.stringify(payload)} → ${res.status}`)
    assert.match(res.json.error, /^payload\.number: /)
  }
  const beyond = await act('show-question', { number: 4 })
  assert.equal(beyond.status, 400)
  assert.match(beyond.json.error, /the quiz has 3 questions/)
  assert.equal((await act('show-question', [2])).status, 400)
  assert.equal(at((await srv.get(urlOf(quiz))).json), 'off q3', 'refused actions change nothing')

  const unknown = await act('explode')
  assert.equal(unknown.status, 404)
  assert.match(unknown.json.error, /has no action "explode"\. Available: reveal, hide-answer, show-question/)
  assert.equal((await srv.post('/api/graphics/nope/actions/reveal')).status, 404)
  const { widget } = await makeImages(['one.png'])
  const none = await srv.post(urlOf(widget, '/actions/reveal'))
  assert.equal(none.status, 404)
  assert.match(none.json.error, /This widget type has no actions/)
  for (const name of ['constructor', '__proto__', 'toString']) {
    assert.equal((await act(name)).status, 404, name)
  }
})
