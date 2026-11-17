/**
 * Upgrade scripts run once per connection, in order, when Companion loads a
 * newer module version (Companion remembers the last script index per
 * connection). Never remove or reorder entries: append a new script for every
 * future change of config fields, action ids/options or feedback ids/options.
 *
 * In module API 2.x the option values in props.actions / props.feedbacks are
 * wrapped as { value, isExpression }.
 */

function wrap(value) {
  return { value, isExpression: false }
}

/** Keep an option as-is (expression or value) when present, else use a default value. */
function keep(options, key, fallback) {
  const option = options?.[key]
  if (option && typeof option === 'object' && 'isExpression' in option) return option
  if (option !== undefined) return wrap(option)
  return wrap(fallback)
}

/** Legacy (0.x) action id → new action id + option mapping. */
const LEGACY_ACTIONS = {
  showGraphic: (o) => ['graphic_visibility', { graphic: keep(o, 'graphic', ''), mode: wrap('show') }],
  hideGraphic: (o) => ['graphic_visibility', { graphic: keep(o, 'graphic', ''), mode: wrap('hide') }],
  toggleGraphic: (o) => ['graphic_visibility', { graphic: keep(o, 'graphic', ''), mode: wrap('toggle') }],
  showGraphicSolo: (o) => ['graphic_solo', { graphic: keep(o, 'graphic', ''), mode: wrap('show') }],
  hideGraphicSolo: (o) => ['graphic_solo', { graphic: keep(o, 'graphic', ''), mode: wrap('hide') }],
  toggleGraphicSolo: (o) => ['graphic_solo', { graphic: keep(o, 'graphic', ''), mode: wrap('toggle') }],
  startCountdownDuration: (o) => [
    'countdown_start',
    { graphic: keep(o, 'graphic', ''), minutes: keep(o, 'minutes', 15), seconds: keep(o, 'seconds', 0) },
  ],
  scorePlus: (o) => [
    'score',
    { graphic: keep(o, 'graphic', ''), side: keep(o, 'side', 'home'), mode: wrap('add'), amount: wrap(1) },
  ],
  scoreMinus: (o) => [
    'score',
    { graphic: keep(o, 'graphic', ''), side: keep(o, 'side', 'home'), mode: wrap('subtract'), amount: wrap(1) },
  ],
  clockStart: (o) => [
    'clock',
    { graphic: keep(o, 'graphic', ''), action: wrap('start'), seconds: wrap(10), time: wrap('45:00') },
  ],
  clockPause: (o) => [
    'clock',
    { graphic: keep(o, 'graphic', ''), action: wrap('pause'), seconds: wrap(10), time: wrap('45:00') },
  ],
  showLowerThirdEntry: (o) => ['lower_third_show', { speaker: keep(o, 'speaker', '') }],
  hideLowerThirdShow: (o) => ['lower_third_hide', { graphic: keep(o, 'graphic', '') }],
  setPrimaryColor: (o) => ['brand_primary_color', { color: keep(o, 'color', 0xdc2626) }],
}

const LEGACY_FEEDBACKS = {
  graphic_visible: 'graphic_on_air',
  graphic_solo_visible: 'graphic_solo_on_air',
  // The old roster feedback was "a speaker of this roster is on air" — the roster itself is on air.
  lower_third_visible: 'graphic_on_air',
}

/** v1.0.0: new action/feedback ids (atomic score/clock), reconnect settings removed from the config. */
export function upgradeV1(_context, props) {
  let updatedConfig = null
  if (props.config && ('reconnect' in props.config || 'reconnect_interval' in props.config)) {
    const { reconnect: _r, reconnect_interval: _ri, ...rest } = props.config
    updatedConfig = rest
  }

  const updatedActions = []
  for (const action of props.actions || []) {
    const map = LEGACY_ACTIONS[action.actionId]
    if (!map) continue
    const [actionId, options] = map(action.options || {})
    action.actionId = actionId
    action.options = options
    updatedActions.push(action)
  }

  const updatedFeedbacks = []
  for (const fb of props.feedbacks || []) {
    const feedbackId = LEGACY_FEEDBACKS[fb.feedbackId]
    if (!feedbackId) continue
    fb.feedbackId = feedbackId
    fb.options = { graphic: keep(fb.options, 'graphic', '') }
    updatedFeedbacks.push(fb)
  }

  return { updatedConfig, updatedActions, updatedFeedbacks }
}

export const UpgradeScripts = [upgradeV1]
