/**
 * One description per widget type. Shared by the server and the pages (pure
 * data, relative imports only).
 *
 * From a description the app derives, without code per type:
 *   - the widget POST /api/graphics creates   (server/graphicDefaults.js)
 *   - the check of `data` in a PATCH           (server/validation.js)
 *   - the operate card: fields + status line   (public/shared/operate-fields.js)
 *   - what a remote control can do with it     (server/widgetActions.js, `state.widgetTypes`)
 *
 * A description:
 *   label       name of the type on the operate card
 *   steps       true when the widget can go to its next / previous item
 *               (POST /api/graphics/:id/step)
 *   actions     what else it offers to a remote control, each
 *               { id, label, fields? } with `fields` (see widget-fields.js)
 *               describing the payload (POST /api/graphics/:id/actions/:actionId)
 *   fields      the fields an operator edits (see widget-fields.js)
 *   position    where a new widget is placed (see server/graphicDefaults.js)
 *   operator    whether a new widget is listed on /operator
 *   summary     keys of the fields that make up the card's status line
 *   extraData   default `data` that is not a field (set elsewhere, e.g. the layout editor)
 *
 * A type with `fields` gets its defaults, validation and operate card from the
 * description (`message`, `lowerThird`). A type without `fields` keeps its own
 * code for those and only says here which steps and actions it has
 * (`lowerThirdShow`, `image`, `quizShow`); what a step or an action does is in
 * server/widgetActions.js. See docs/ARCHITECTURE.md ("Describing a widget
 * type", "Steps and actions").
 */
import { defineFields, fieldDefaults } from './widget-fields.js'

function defineActions(actions) {
  if (!Array.isArray(actions)) throw new Error('Actions: expected a list')
  const seen = new Set()
  return Object.freeze(
    actions.map((raw, index) => {
      const id = raw?.id
      if (typeof id !== 'string' || !/^[a-z][a-z0-9-]*$/.test(id)) {
        throw new Error(`Action ${index + 1}: "id" must be lower-case letters, digits and dashes`)
      }
      if (seen.has(id)) throw new Error(`Action "${id}" is declared twice`)
      seen.add(id)
      if (typeof raw.label !== 'string' || !raw.label) throw new Error(`Action "${id}" has no label`)
      return Object.freeze({ id, label: raw.label, fields: defineFields(raw.fields || []) })
    })
  )
}

/** Check one description and return it frozen. Exported for the tests. */
export function describeWidget({
  label,
  steps = false,
  actions = [],
  fields,
  position = 'center',
  operator = false,
  summary = [],
  extraData = {}
}) {
  if (typeof label !== 'string' || !label) throw new Error('A widget description needs a label')
  // No `fields` at all: the type keeps its own defaults, validation and card.
  const list = fields === undefined ? null : defineFields(fields)
  for (const key of summary) {
    if (!list?.some((f) => f.key === key)) throw new Error(`Summary names an unknown field "${key}"`)
  }
  for (const key of Object.keys(extraData)) {
    if (!list) throw new Error(`"${label}": extra data needs fields`)
    if (list.some((f) => f.key === key)) throw new Error(`"${key}" is both a field and extra data`)
  }
  return Object.freeze({
    label,
    steps: steps === true,
    actions: defineActions(actions),
    fields: list,
    position,
    operator,
    summary: Object.freeze([...summary]),
    extraData
  })
}

/*
 * `lenient` on the text fields below: the API never checked these fields, so a
 * script or Stream Deck button may send a number (a score as message text) or
 * null (clear a title). Those keep working. No maxLength for the same reason.
 * `live`: the text on air follows the operator's typing, as it always did.
 */
export const WIDGET_DESCRIPTIONS = Object.freeze({
  lowerThird: describeWidget({
    label: 'Lower third',
    position: 'bottom-left',
    operator: false,
    fields: [
      { key: 'name', kind: 'text', label: 'Name', default: 'Name', live: true, lenient: true },
      { key: 'title', kind: 'text', label: 'Title', default: 'Title', live: true, lenient: true },
      { key: 'company', kind: 'text', label: 'Company', default: '', live: true, lenient: true }
    ],
    summary: ['name', 'title']
  }),
  message: describeWidget({
    label: 'Message',
    // Bottom centre, just above the ticker.
    position: 'custom',
    operator: false,
    fields: [{ key: 'text', kind: 'text', label: 'Message text', default: 'Message', live: true, lenient: true }],
    summary: ['text'],
    extraData: { placementFree: { x: 50, y: 82 } }
  }),

  /* Steps and actions only: defaults, validation and card of these are hand-written. */
  lowerThirdShow: describeWidget({ label: 'Lower thirds', steps: true }),
  image: describeWidget({ label: 'Image', steps: true }),
  quizShow: describeWidget({
    label: 'Quiz',
    steps: true,
    actions: [
      { id: 'reveal', label: 'Reveal answer' },
      { id: 'hide-answer', label: 'Hide answer' },
      {
        id: 'show-question',
        label: 'Show question by number',
        fields: [{ key: 'number', kind: 'number', label: 'Question number', default: 1, min: 1, integer: true }]
      }
    ]
  })
})

/** The description of a widget type, or null when the type has none. */
export function widgetDescription(type) {
  return typeof type === 'string' && Object.hasOwn(WIDGET_DESCRIPTIONS, type) ? WIDGET_DESCRIPTIONS[type] : null
}

/** The described fields of a widget type ([] when it has none). */
export function widgetFields(type) {
  return widgetDescription(type)?.fields || []
}

/** Default `data` of a new widget of a type with described fields: field defaults, then the extra data. */
export function widgetDefaultData(type) {
  const description = widgetDescription(type)
  if (!description?.fields) return {}
  return { ...fieldDefaults(description.fields), ...structuredClone(description.extraData) }
}

/** True when widgets of this type can step to a next / previous item. */
export function widgetHasSteps(type) {
  return widgetDescription(type)?.steps === true
}

/** The actions a widget type declares ([] when it has none). */
export function widgetActions(type) {
  return widgetDescription(type)?.actions || []
}

/**
 * What remote controls need to know, per widget type that has steps or actions:
 *
 *   { quizShow: { steps: true, actions: [{ id, label, fields: [{ key, kind, label, default, … }] }] }, … }
 *
 * The server sends it with every state as `state.widgetTypes`. A type that is
 * not listed has no steps and no actions.
 */
export function widgetCapabilities() {
  const out = {}
  for (const [type, description] of Object.entries(WIDGET_DESCRIPTIONS)) {
    if (!description.steps && !description.actions.length) continue
    out[type] = {
      steps: description.steps,
      actions: description.actions.map((action) => ({
        id: action.id,
        label: action.label,
        fields: action.fields.map((field) => ({ ...field }))
      }))
    }
  }
  return out
}
