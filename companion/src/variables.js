import {
  SCORE_TYPES,
  formatCountdown,
  formatScoreClock,
  graphicLabel,
  graphicsOf,
  imageItems,
  imageLabel,
  isClockRunning,
  periodLabel,
  quizQuestions,
  rosterEntries,
  tickerCurrentText,
  tickerMessages,
} from './model.js'

/**
 * Variable ids per graphic use the sanitised graphic id (`keys`, see buildVarKeys):
 *   name_<key>, onair_<key>, solo_<key>
 *   score_<key>_home / _away, code_<key>_home / _away, clock_<key>, clock_<key>_running, period_<key>
 *   countdown_<key>, ticker_<key>_current, ticker_<key>_enabled,
 *   speaker_<key>_name / _title, quiz_<key>_question / _revealed, message_<key>, image_<key>_name
 */
export function getVariableDefinitions(state, keys) {
  const defs = {
    project_name: { name: 'Active project name' },
    project_id: { name: 'Active project id' },
    graphic_count: { name: 'Number of graphics in the project' },
    visible_count: { name: 'Number of graphics on the combined output' },
  }
  for (const g of graphicsOf(state)) {
    const k = keys.get(g.id)
    const label = graphicLabel(g)
    defs[`name_${k}`] = { name: `${label}: name` }
    defs[`onair_${k}`] = { name: `${label}: on air (combined output)` }
    defs[`solo_${k}`] = { name: `${label}: on air (solo output)` }
    if (SCORE_TYPES.includes(g.type)) {
      defs[`code_${k}_home`] = { name: `${label}: home code` }
      defs[`code_${k}_away`] = { name: `${label}: away code` }
      defs[`score_${k}_home`] = { name: `${label}: home score` }
      defs[`score_${k}_away`] = { name: `${label}: away score` }
      defs[`clock_${k}`] = { name: `${label}: clock (mm:ss)` }
      defs[`clock_${k}_running`] = { name: `${label}: clock running` }
      defs[`period_${k}`] = { name: `${label}: period` }
    } else if (g.type === 'streamCountdown') {
      defs[`countdown_${k}`] = { name: `${label}: time remaining` }
    } else if (g.type === 'customTicker') {
      defs[`ticker_${k}_current`] = { name: `${label}: current ticker text (enabled messages)` }
      defs[`ticker_${k}_enabled`] = { name: `${label}: number of enabled messages` }
    } else if (g.type === 'lowerThirdShow') {
      defs[`speaker_${k}_name`] = { name: `${label}: active speaker name` }
      defs[`speaker_${k}_title`] = { name: `${label}: active speaker title` }
    } else if (g.type === 'quizShow') {
      defs[`quiz_${k}_question`] = { name: `${label}: active question` }
      defs[`quiz_${k}_revealed`] = { name: `${label}: answer revealed` }
    } else if (g.type === 'message') {
      defs[`message_${k}`] = { name: `${label}: text` }
    } else if (g.type === 'image') {
      defs[`image_${k}_name`] = { name: `${label}: active image name` }
    }
  }
  return defs
}

/** Variables that change with time while a clock or countdown runs. */
export function getTimeVariableValues(state, keys, nowMs) {
  const values = {}
  for (const g of graphicsOf(state)) {
    const k = keys.get(g.id)
    if (SCORE_TYPES.includes(g.type)) values[`clock_${k}`] = formatScoreClock(g, nowMs)
    else if (g.type === 'streamCountdown') {
      values[`countdown_${k}`] = formatCountdown(g.data?.targetDateTime, g.data?.format, nowMs)
    }
  }
  return values
}

export function getVariableValues(state, keys, nowMs) {
  const graphics = graphicsOf(state)
  const values = {
    // ProVerlay stores the project (client) name in state.client.name; the blank project has none.
    project_name: String(state?.client?.name || state?.projectId || ''),
    project_id: String(state?.projectId || ''),
    graphic_count: graphics.length,
    visible_count: graphics.filter((g) => g.visible).length,
  }
  for (const g of graphics) {
    const k = keys.get(g.id)
    const d = g.data || {}
    values[`name_${k}`] = graphicLabel(g)
    values[`onair_${k}`] = Boolean(g.visible)
    values[`solo_${k}`] = Boolean(g.soloVisible)
    if (SCORE_TYPES.includes(g.type)) {
      values[`code_${k}_home`] = String(d.homeCode ?? '')
      values[`code_${k}_away`] = String(d.awayCode ?? '')
      values[`score_${k}_home`] = Number(d.homeScore) || 0
      values[`score_${k}_away`] = Number(d.awayScore) || 0
      values[`clock_${k}_running`] = isClockRunning(d.clock)
      values[`period_${k}`] = periodLabel(g)
    } else if (g.type === 'customTicker') {
      values[`ticker_${k}_current`] = tickerCurrentText(d)
      values[`ticker_${k}_enabled`] = tickerMessages(d).filter((m) => m.enabled).length
    } else if (g.type === 'lowerThirdShow') {
      const entry = rosterEntries(g).find((e) => e.id === d.activeEntryId)
      values[`speaker_${k}_name`] = String(entry?.name ?? '')
      values[`speaker_${k}_title`] = String(entry?.title ?? '')
    } else if (g.type === 'quizShow') {
      const q = quizQuestions(g).find((item) => item.id === d.activeQuestionId)
      values[`quiz_${k}_question`] = String(q?.question ?? '')
      values[`quiz_${k}_revealed`] = Boolean(d.revealed)
    } else if (g.type === 'message') {
      values[`message_${k}`] = String(d.text ?? '')
    } else if (g.type === 'image') {
      const img = imageItems(g).find((item) => item.id === d.activeImageId)
      values[`image_${k}_name`] = img ? imageLabel(img) : ''
    }
  }
  return { ...values, ...getTimeVariableValues(state, keys, nowMs) }
}

/** Only the entries of `next` that differ from `previous`. */
export function diffValues(previous, next) {
  const changed = {}
  for (const [key, value] of Object.entries(next)) {
    if (previous[key] !== value) changed[key] = value
  }
  return changed
}
