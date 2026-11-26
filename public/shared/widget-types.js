/**
 * One description per widget type. Shared by the server and the pages (pure
 * data, relative imports only).
 *
 * From a description the app derives, without code per type:
 *   - the widget POST /api/graphics creates   (server/graphicDefaults.js)
 *   - the check of `data` in a PATCH           (server/validation.js)
 *   - the operate card: fields + status line   (public/shared/operate-fields.js)
 *
 * A description:
 *   label       name of the type on the operate card
 *   position    where a new widget is placed (see server/graphicDefaults.js)
 *   operator    whether a new widget is listed on /operator
 *   fields      the fields an operator edits (see widget-fields.js)
 *   summary     keys of the fields that make up the card's status line
 *   extraData   default `data` that is not a field (set elsewhere, e.g. the layout editor)
 *
 * Only `message` and `lowerThird` are described so far. The other types still
 * have their own defaults, validation and card; see docs/ARCHITECTURE.md
 * ("Describing a widget type") for how to move one.
 */
import { defineFields, fieldDefaults } from './widget-fields.js'

function describe({ label, position = 'center', operator = false, fields, summary = [], extraData = {} }) {
  const list = defineFields(fields)
  for (const key of summary) {
    if (!list.some((f) => f.key === key)) throw new Error(`Summary names an unknown field "${key}"`)
  }
  for (const key of Object.keys(extraData)) {
    if (list.some((f) => f.key === key)) throw new Error(`"${key}" is both a field and extra data`)
  }
  return Object.freeze({ label, position, operator, fields: list, summary: Object.freeze([...summary]), extraData })
}

/*
 * `lenient` on the text fields below: the API never checked these fields, so a
 * script or Stream Deck button may send a number (a score as message text) or
 * null (clear a title). Those keep working. No maxLength for the same reason.
 * `live`: the text on air follows the operator's typing, as it always did.
 */
export const WIDGET_DESCRIPTIONS = Object.freeze({
  lowerThird: describe({
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
  message: describe({
    label: 'Message',
    // Bottom centre, just above the ticker.
    position: 'custom',
    operator: false,
    fields: [{ key: 'text', kind: 'text', label: 'Message text', default: 'Message', live: true, lenient: true }],
    summary: ['text'],
    extraData: { placementFree: { x: 50, y: 82 } }
  })
})

/** The description of a widget type, or null when the type has none (own code, or unknown). */
export function widgetDescription(type) {
  return typeof type === 'string' && Object.hasOwn(WIDGET_DESCRIPTIONS, type) ? WIDGET_DESCRIPTIONS[type] : null
}

/** The described fields of a widget type ([] when it has none). */
export function widgetFields(type) {
  return widgetDescription(type)?.fields || []
}

/** Default `data` of a new widget of a described type: field defaults, then the extra data. */
export function widgetDefaultData(type) {
  const description = widgetDescription(type)
  if (!description) return {}
  return { ...fieldDefaults(description.fields), ...structuredClone(description.extraData) }
}
