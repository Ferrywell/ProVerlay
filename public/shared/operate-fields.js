/**
 * Described fields on the operate cards (see widget-fields.js for what a field
 * description is, widget-types.js for the types that have one).
 *
 * Two ways to use them:
 *
 *   1. A type whose card is nothing but its fields needs no card code:
 *      `describedCards()` builds the card from the description.
 *
 *   2. A hand-written card that also has plain fields lists them on its module
 *      and puts their controls in its own HTML:
 *
 *        export const tickerCard = {
 *          fields: widgetFields('customTicker'),          // or a subset
 *          more: (g) => fieldsHtml(tickerCard.fields, g.data) + ownControlsHtml(g),
 *          …
 *        }
 *
 *      operate-card.js saves, toggles and refreshes every control of a field in
 *      `fields`; the card's own `field()`, `action()` and `update()` only see
 *      its own controls.
 */
import { patchData, setIfIdle } from '/public/shared/operate-ui.js'
import { showErrorToast } from '/public/shared/toast.js'
import {
  FIELD_TOGGLE_ACTION,
  coerceFieldInput,
  fieldDisplayValue,
  fieldSummary,
  fieldsHtml
} from '/public/shared/widget-fields.js'
import { WIDGET_DESCRIPTIONS } from '/public/shared/widget-types.js'

/** Save what a control holds. Resolves to the updated graphic, or null (a toast says why). */
export function saveFieldInput(graphic, field, raw) {
  const result = coerceFieldInput(field, raw)
  if (result.error) {
    showErrorToast(result.error)
    return null
  }
  return patchData(graphic.id, { [field.key]: result.value })
}

/** Flip an on/off field. */
export function toggleField(graphic, field) {
  return saveFieldInput(graphic, field, !fieldDisplayValue(field, graphic.data))
}

/** Bring the controls of `fields` in line with `data` (a control being typed in is left alone). */
export function syncFields(card, fields, data) {
  for (const field of fields || []) {
    const value = fieldDisplayValue(field, data)
    if (field.kind === 'boolean') {
      const btn = card.querySelector(`[data-action="${FIELD_TOGGLE_ACTION}"][data-field="${field.key}"]`)
      if (!btn) continue
      btn.classList.toggle('button--live', value)
      btn.classList.toggle('button--gray', !value)
      btn.setAttribute('aria-pressed', String(value))
      const text = value ? 'On' : 'Off'
      if (btn.textContent !== text) btn.textContent = text
    } else {
      setIfIdle(card, `[data-field="${field.key}"]`, value)
    }
  }
}

/** The operate card of a type that only has described fields. */
export function fieldsCard(description) {
  const { label, fields, summary } = description
  return {
    label,
    fields,
    status: (g) => fieldSummary(fields, summary, g.data, label),
    primary: (g) => fieldsHtml(fields, g.data),
    update() {}
  }
}

/** One generated card per described widget type: `{ message: card, lowerThird: card, … }`. */
export function describedCards() {
  return Object.fromEntries(Object.entries(WIDGET_DESCRIPTIONS).map(([type, d]) => [type, fieldsCard(d)]))
}
