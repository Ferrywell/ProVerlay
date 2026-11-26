/**
 * One way to operate any widget from a remote control (Stream Deck, script):
 *
 *   POST /api/graphics/:id/step               { delta: 1 | -1, wrap?: true }
 *   POST /api/graphics/:id/actions/:actionId  { …payload }
 *
 * Which types have steps and which actions they offer is declared in
 * public/shared/widget-types.js (and sent to clients as `state.widgetTypes`).
 * What a step or an action does is listed here, and is always the function the
 * type's own route already uses: the image step is the code behind
 * /images/step, the roster step puts a person on air like /entries/:id/show.
 *
 * Rules that hold for every type (docs/ARCHITECTURE.md, "Steps and actions"):
 *   - a step puts the widget on air (combined output);
 *   - after a hide, "next" continues from the item that was on air;
 *   - at the end of the list a step wraps around; with `wrap: false` nothing changes.
 */
import { getGraphic } from './state.js'
import { HttpError, badRequest, isPlainObject, notFound } from './validation.js'
import { stepImage } from './imageWidget.js'
import { stepLowerThirdEntry } from './lowerThirdEntries.js'
import { hideQuizAnswer, revealQuizAnswer, showQuizQuestionNumber, stepQuiz } from './quizShow.js'
import { fieldDefaults, validateFieldData } from '../public/shared/widget-fields.js'
import { WIDGET_DESCRIPTIONS, widgetActions, widgetHasSteps } from '../public/shared/widget-types.js'

/** type → (graphicId, 'next' | 'previous', { wrap }) → updated graphic, or null when there is nothing to step through. */
const STEPPERS = {
  image: stepImage,
  lowerThirdShow: stepLowerThirdEntry,
  quizShow: stepQuiz
}

/** type → action id → (graphicId, payload) → updated graphic. */
const ACTIONS = {
  quizShow: {
    reveal: (id) => revealQuizAnswer(id),
    'hide-answer': (id) => hideQuizAnswer(id),
    'show-question': (id, payload) => showQuizQuestionNumber(id, payload.number)
  }
}

const EMPTY_LIST = {
  image: 'The image widget has no images',
  lowerThirdShow: 'The roster has no people',
  quizShow: 'The quiz has no questions'
}

/** A declaration without code (or the other way round) stops the start instead of failing on air. */
function checkDeclarations() {
  for (const [type, description] of Object.entries(WIDGET_DESCRIPTIONS)) {
    if (description.steps !== Object.hasOwn(STEPPERS, type)) {
      throw new Error(`Widget type "${type}": "steps" in widget-types.js and the step code in widgetActions.js do not match`)
    }
    const declared = description.actions.map((a) => a.id).sort()
    const coded = Object.keys(ACTIONS[type] || {}).sort()
    if (declared.join() !== coded.join()) {
      throw new Error(`Widget type "${type}": actions in widget-types.js (${declared}) and in widgetActions.js (${coded}) do not match`)
    }
  }
  for (const type of [...Object.keys(STEPPERS), ...Object.keys(ACTIONS)]) {
    if (!Object.hasOwn(WIDGET_DESCRIPTIONS, type)) throw new Error(`Widget type "${type}" has step or action code but no description`)
  }
}
checkDeclarations()

function requireGraphic(id) {
  const graphic = getGraphic(id)
  if (!graphic) throw notFound('Graphic not found')
  return graphic
}

const nameOf = (graphic) => `"${graphic.name || graphic.id}"`

/** The handler returned null: the widget went away meanwhile, or it has nothing to act on. */
function requireResult(result, graphic) {
  if (result) return result
  requireGraphic(graphic.id)
  throw new HttpError(409, EMPTY_LIST[graphic.type] || `${nameOf(graphic)} has nothing to step through`)
}

/** `{ delta: 1 | -1, wrap?: boolean }` → next or previous item of any widget with steps. */
export async function stepGraphic(id, body = {}) {
  const graphic = requireGraphic(id)
  const delta = body.delta === undefined ? 1 : body.delta
  if (delta !== 1 && delta !== -1) throw badRequest('delta: expected 1 (next) or -1 (previous)')
  if (body.wrap !== undefined && typeof body.wrap !== 'boolean') throw badRequest('wrap: expected true or false')
  if (!widgetHasSteps(graphic.type)) throw badRequest(`${nameOf(graphic)} (${graphic.type}) has no steps`)
  const result = await STEPPERS[graphic.type](id, delta === 1 ? 'next' : 'previous', { wrap: body.wrap !== false })
  return requireResult(result, graphic)
}

/** Run an action the widget's type declares; the body is the payload described by the action's fields. */
export async function runGraphicAction(id, actionId, body = {}) {
  const graphic = requireGraphic(id)
  const actions = widgetActions(graphic.type)
  const action = actions.find((a) => a.id === actionId)
  if (!action) {
    const known = actions.length ? `Available: ${actions.map((a) => a.id).join(', ')}` : 'This widget type has no actions'
    throw notFound(`${nameOf(graphic)} (${graphic.type}) has no action "${String(actionId).slice(0, 60)}". ${known}`)
  }
  if (!isPlainObject(body)) throw badRequest('Body must be a JSON object')
  const problem = validateFieldData(action.fields, body, 'payload')
  if (problem) throw badRequest(problem)
  // Fields that are not sent get their default; keys the action does not describe are ignored.
  const payload = fieldDefaults(action.fields)
  for (const field of action.fields) if (body[field.key] !== undefined) payload[field.key] = body[field.key]
  return requireResult(await ACTIONS[graphic.type][action.id](id, payload), graphic)
}
