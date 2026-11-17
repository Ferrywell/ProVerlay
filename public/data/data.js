/**
 * Data page (/data): data sources (Google Sheets, CSV/Excel uploads, linked
 * files), preview, mapping onto widget lists, project variables and the
 * key/value variable source. Server side: server/dataSources.js.
 */
import { sharedSocket } from '/public/shared/connection.js'
import { showToast, showErrorToast, withPending } from '/public/shared/toast.js'
import { BUILTIN_VARIABLES, usedVariableNames } from '/public/shared/variables.js'

const sourceList = document.getElementById('source-list')
const variableRows = document.getElementById('variable-rows')
const variableWarnings = document.getElementById('variable-warnings')
const variableSourceForm = document.getElementById('variable-source-form')
const sourceVariableList = document.getElementById('source-variable-list')
const hostsForm = document.getElementById('hosts-form')

/** Fields a column can feed, per widget type (server/dataBindings.js). */
const BINDABLE = {
  lowerThirdShow: {
    label: 'Lower thirds',
    fields: [
      ['name', 'Name', true],
      ['title', 'Title'],
      ['company', 'Organization']
    ]
  },
  customTicker: { label: 'Ticker', fields: [['text', 'Message', true]] },
  quizShow: {
    label: 'Quiz',
    fields: [
      ['question', 'Question', true],
      ['optionA', 'Answer A'],
      ['optionB', 'Answer B'],
      ['optionC', 'Answer C'],
      ['optionD', 'Answer D'],
      ['correct', 'Correct answer (1–4, A–D or its text)']
    ]
  },
  image: {
    label: 'Image',
    fields: [
      ['src', 'File name (in the project assets)', true],
      ['name', 'Display name']
    ]
  }
}

/** Header names that probably belong to a field (first match wins). */
const GUESS = {
  name: ['name', 'naam', 'person', 'speaker'],
  title: ['title', 'titel', 'role', 'function', 'functie'],
  company: ['organization', 'organisation', 'organisatie', 'company', 'club', 'bedrijf'],
  text: ['message', 'text', 'tekst', 'line', 'bericht'],
  question: ['question', 'vraag'],
  optionA: ['a', 'answer a', 'option a', 'answer 1'],
  optionB: ['b', 'answer b', 'option b', 'answer 2'],
  optionC: ['c', 'answer c', 'option c', 'answer 3'],
  optionD: ['d', 'answer d', 'option d', 'answer 4'],
  correct: ['correct', 'answer', 'juist', 'goed'],
  src: ['file', 'filename', 'image', 'src', 'bestand'],
  key: ['key', 'name', 'variable', 'naam'],
  value: ['value', 'waarde', 'text']
}

let data = { sources: [], variableSource: null, dataSettings: { allowedHosts: [] } }
let state = null
const previews = new Map() // sourceId -> { fetchedAt, headers, rows, total }
let pendingRender = false

const escapeHtml = (value = '') =>
  String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;')

async function api(method, url, body) {
  let res
  try {
    res = await fetch(url, {
      method,
      headers: body === undefined || body instanceof FormData ? {} : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : body instanceof FormData ? body : JSON.stringify(body)
    })
  } catch {
    throw new Error('ProVerlay server unreachable')
  }
  const json = await res.json().catch(() => null)
  if (!res.ok) throw new Error(json?.error || `Request failed (HTTP ${res.status})`)
  return json
}

async function run(button, fn, success) {
  try {
    const result = await withPending(button, fn)
    if (success) showToast(success, { type: 'success', duration: 2500 })
    return result
  } catch (err) {
    showErrorToast(err.message)
    return null
  }
}

function guessColumn(field, headers) {
  const wanted = GUESS[field] || [field]
  const lower = headers.map((h) => h.toLowerCase().trim())
  for (const w of wanted) {
    const i = lower.indexOf(w)
    if (i !== -1) return headers[i]
  }
  for (const w of wanted.filter((x) => x.length > 2)) {
    const i = lower.findIndex((h) => h.includes(w))
    if (i !== -1) return headers[i]
  }
  return ''
}

function timeText(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString([], { dateStyle: 'short', timeStyle: 'medium' })
}

/* ---------------------------------------------------------------- sources */

function statusLine(s) {
  const st = s.status || {}
  const parts = []
  if (st.state === 'loading') parts.push('Updating…')
  if (st.lastUpdated) parts.push(`Updated ${timeText(st.lastUpdated)}`)
  if (st.rowCount || st.state === 'ok') parts.push(`${st.rowCount || 0} rows`)
  if (st.state === 'cached') parts.push('using the last saved copy')
  const error = st.error ? `Last error: ${st.error}` : ''
  const held = st.held?.length ? `Changes held until ${st.held.length === 1 ? 'the widget is' : 'the widgets are'} off air` : ''
  return { text: [parts.join(' · '), held, error].filter(Boolean).join(' — ') || 'Not loaded yet', error: Boolean(error), held: Boolean(held) }
}

function whereText(s) {
  if (s.origin === 'url') return `Google Sheet · ${s.url}`
  if (s.origin === 'file') return s.path ? `Linked file · ${s.path}` : 'Linked file · link it again on this computer'
  return `Uploaded ${s.kind === 'xlsx' ? 'Excel' : 'CSV'} file`
}

function previewHtml(s) {
  const p = previews.get(s.id)
  if (!p || !p.headers.length) return ''
  const longCells = p.rows.reduce((n, row) => n + p.headers.filter((h) => String(row[h] ?? '').length > 120).length, 0)
  const head = p.headers.map((h) => `<th>${escapeHtml(h)}</th>`).join('')
  const body = p.rows
    .map(
      (row) =>
        `<tr>${p.headers
          .map((h) => {
            const v = String(row[h] ?? '')
            const warn = v === '' || v.length > 120
            return `<td${warn ? ' class="is-warn"' : ''} title="${escapeHtml(v)}">${escapeHtml(v)}</td>`
          })
          .join('')}</tr>`
    )
    .join('')
  const note = [
    `First ${p.rows.length} of ${p.total} rows.`,
    longCells ? `${longCells} very long ${longCells === 1 ? 'value' : 'values'} (over 120 characters) in this preview.` : '',
    'Empty cells are marked.'
  ]
    .filter(Boolean)
    .join(' ')
  return `<div class="preview-wrap"><table class="preview-table"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div><p class="preview-note">${escapeHtml(note)}</p>`
}

function bindableGraphics() {
  return (state?.graphics || []).filter((g) => Object.hasOwn(BINDABLE, g.type))
}

function mappingHtml(s) {
  const headers = s.status?.headers || []
  const linked = bindableGraphics().filter((g) => g.data?.dataBinding?.sourceId === s.id)
  const linkedHtml = linked.length
    ? `<ul class="linked-list">${linked
        .map(
          (g) =>
            `<li>${escapeHtml(g.name || g.id)} <span class="hint">(${escapeHtml(BINDABLE[g.type].label)})</span><button type="button" class="button button--secondary" data-unlink="${escapeHtml(g.id)}">Unlink</button></li>`
        )
        .join('')}</ul>`
    : '<p class="hint">No widgets use this source yet.</p>'
  if (!headers.length) return `<div class="mapping">${linkedHtml}</div>`
  const widgets = bindableGraphics()
  if (!widgets.length) {
    return `<div class="mapping">${linkedHtml}<p class="hint">Add a Lower thirds, Ticker, Quiz or Image widget in the dashboard to fill it from this source.</p></div>`
  }
  const options = widgets
    .map((g) => `<option value="${escapeHtml(g.id)}">${escapeHtml(g.name || g.id)} (${escapeHtml(BINDABLE[g.type].label)})</option>`)
    .join('')
  return `<details class="mapping" data-mapping="${escapeHtml(s.id)}">
    <summary>Use this data in a widget</summary>
    ${linkedHtml}
    <form class="mapping-form" data-mapping-form="${escapeHtml(s.id)}">
      <label class="field"><span>Widget</span><select name="graphicId">${options}</select></label>
      <div class="mapping-fields" style="display:contents"></div>
      <div class="action-group"><button class="button button--primary" type="submit">Fill this widget from the source</button></div>
    </form>
  </details>`
}

function fieldSelectsHtml(sourceId, graphicId) {
  const source = data.sources.find((s) => s.id === sourceId)
  const graphic = (state?.graphics || []).find((g) => g.id === graphicId)
  if (!source || !graphic) return ''
  const headers = source.status?.headers || []
  const existing = graphic.data?.dataBinding?.sourceId === sourceId ? graphic.data.dataBinding.columns || {} : {}
  return BINDABLE[graphic.type].fields
    .map(([field, label, required]) => {
      const current = existing[field] ?? guessColumn(field, headers)
      const opts = [`<option value="">${required ? 'Choose a column' : '— none —'}</option>`]
        .concat(headers.map((h) => `<option value="${escapeHtml(h)}"${h === current ? ' selected' : ''}>${escapeHtml(h)}</option>`))
        .join('')
      return `<label class="field"><span>${escapeHtml(label)}${required ? ' *' : ''}</span><select name="col:${field}"${required ? ' required' : ''}>${opts}</select></label>`
    })
    .join('')
}

function sourceCardHtml(s) {
  const st = statusLine(s)
  const settings = []
  if (s.origin === 'url') {
    settings.push(
      `<label class="field"><span>Check every (seconds)</span><input type="number" min="5" max="3600" step="1" data-field="pollSeconds" value="${Math.round((s.pollMs || 30000) / 1000)}" /></label>`
    )
  }
  if (s.kind === 'xlsx' && s.status?.sheets?.length) {
    const opts = s.status.sheets
      .map((name) => `<option value="${escapeHtml(name)}"${name === (s.sheet || s.status.sheet) ? ' selected' : ''}>${escapeHtml(name)}</option>`)
      .join('')
    settings.push(`<label class="field"><span>Sheet</span><select data-field="sheet">${opts}</select></label>`)
  }
  settings.push(
    `<label class="field field--check"><input type="checkbox" data-field="holdWhileOnAir"${s.holdWhileOnAir ? ' checked' : ''} /><span>Hold list changes while the widget is on air</span></label>`
  )
  return `<article class="source-card" id="source-${escapeHtml(s.id)}" data-source-id="${escapeHtml(s.id)}">
    <div class="source-card__head">
      <span class="source-card__name">${escapeHtml(s.name)}</span>
      <span class="source-card__badge">${escapeHtml(s.origin === 'url' ? 'Sheet' : s.kind === 'xlsx' ? 'Excel' : 'CSV')}</span>
      <button type="button" class="button button--secondary" data-action="refresh">Refresh now</button>
      ${s.origin === 'upload' ? `<label class="button button--secondary">New file<input type="file" accept="${s.kind === 'xlsx' ? '.xlsx' : '.csv,.tsv,.txt'}" data-action="replace" hidden /></label>` : ''}
      <button type="button" class="button button--secondary" data-action="rename">Rename</button>
      <button type="button" class="button button--danger" data-action="delete">Delete</button>
    </div>
    <div class="source-card__where">${escapeHtml(whereText(s))}</div>
    <p class="source-status${st.error ? ' is-error' : ''}${st.held ? ' is-held' : ''}" role="status">${escapeHtml(st.text)}</p>
    <div class="source-card__settings">${settings.join('')}</div>
    ${previewHtml(s)}
    ${mappingHtml(s)}
  </article>`
}

function renderSources() {
  if (sourceList.contains(document.activeElement) && document.activeElement !== document.body) {
    // Do not rebuild under the user's cursor; try again when they leave the field.
    pendingRender = true
    return
  }
  pendingRender = false
  const open = new Set([...sourceList.querySelectorAll('details[open][data-mapping]')].map((d) => d.dataset.mapping))
  sourceList.innerHTML = data.sources.map(sourceCardHtml).join('')
  for (const form of sourceList.querySelectorAll('[data-mapping-form]')) {
    const select = form.elements.graphicId
    const linked = bindableGraphics().find((g) => g.data?.dataBinding?.sourceId === form.dataset.mappingForm)
    if (linked) select.value = linked.id
    form.querySelector('.mapping-fields').innerHTML = fieldSelectsHtml(form.dataset.mappingForm, select.value)
  }
  for (const id of open) sourceList.querySelector(`details[data-mapping="${CSS.escape(id)}"]`)?.setAttribute('open', '')
  if (location.hash) document.getElementById(location.hash.slice(1))?.scrollIntoView({ block: 'nearest' })
}

sourceList.addEventListener('focusout', () => {
  setTimeout(() => {
    if (pendingRender && !sourceList.contains(document.activeElement)) renderSources()
  }, 0)
})

async function loadPreviews() {
  await Promise.all(
    data.sources.map(async (s) => {
      const fetchedAt = s.status?.lastUpdated || ''
      if (!s.status?.headers?.length) return
      if (previews.get(s.id)?.fetchedAt === fetchedAt) return
      try {
        const p = await api('GET', `/api/data-sources/${encodeURIComponent(s.id)}/rows?limit=8`)
        previews.set(s.id, { ...p, fetchedAt })
      } catch {
        previews.delete(s.id)
      }
    })
  )
}

async function applyData(next) {
  if (!next) return
  data = next
  await loadPreviews()
  renderSources()
  renderVariableSource()
  renderHosts()
}

sourceList.addEventListener('click', async (event) => {
  const btn = event.target.closest('button')
  const card = event.target.closest('[data-source-id]')
  if (!btn || !card) return
  const id = card.dataset.sourceId
  const source = data.sources.find((s) => s.id === id)
  const base = `/api/data-sources/${encodeURIComponent(id)}`
  if (btn.dataset.unlink) {
    const result = await run(btn, () => api('PUT', `/api/graphics/${encodeURIComponent(btn.dataset.unlink)}/data-binding`, { sourceId: null }), 'Widget unlinked; it keeps its current list')
    if (result) await refreshAll()
    return
  }
  if (btn.dataset.action === 'refresh') {
    const result = await run(btn, () => api('POST', `${base}/refresh`))
    if (result) {
      await applyData(result)
      if (result.status?.error) showErrorToast(`${source?.name}: ${result.status.error}`)
      else showToast(`${source?.name} updated`, { type: 'success', duration: 2000 })
    }
  } else if (btn.dataset.action === 'rename') {
    const name = window.prompt('Name of this data source', source?.name || '')
    if (name && name.trim()) await applyData(await run(btn, () => api('PATCH', base, { name: name.trim() })))
  } else if (btn.dataset.action === 'delete') {
    if (!window.confirm(`Delete the data source "${source?.name}"? Widgets that use it keep their current list.`)) return
    previews.delete(id)
    await applyData(await run(btn, () => api('DELETE', base), 'Data source deleted'))
  }
})

sourceList.addEventListener('change', async (event) => {
  const el = event.target
  const card = el.closest('[data-source-id]')
  if (!card) return
  const id = card.dataset.sourceId
  const base = `/api/data-sources/${encodeURIComponent(id)}`
  if (el.name === 'graphicId') {
    el.form.querySelector('.mapping-fields').innerHTML = fieldSelectsHtml(el.form.dataset.mappingForm, el.value)
    return
  }
  if (el.dataset.action === 'replace') {
    const file = el.files?.[0]
    if (!file) return
    const body = new FormData()
    body.append('file', file, file.name)
    const result = await run(null, () => api('POST', `${base}/file`, body))
    el.value = ''
    if (result) {
      await applyData(result)
      if (result.status?.error) showErrorToast(result.status.error)
      else showToast('New file loaded', { type: 'success', duration: 2000 })
    }
    return
  }
  const patch =
    el.dataset.field === 'pollSeconds'
      ? { pollMs: Math.max(5, Math.min(3600, Math.round(Number(el.value) || 30))) * 1000 }
      : el.dataset.field === 'sheet'
        ? { sheet: el.value }
        : el.dataset.field === 'holdWhileOnAir'
          ? { holdWhileOnAir: el.checked }
          : null
  if (!patch) return
  const result = await run(null, () => api('PATCH', base, patch), 'Saved')
  if (result) {
    await applyData(result)
    if (patch.sheet !== undefined) applyData(await run(null, () => api('POST', `${base}/refresh`)))
  }
})

sourceList.addEventListener('submit', async (event) => {
  const form = event.target.closest('[data-mapping-form]')
  if (!form) return
  event.preventDefault()
  const columns = {}
  for (const el of form.querySelectorAll('select[name^="col:"]')) {
    if (el.value) columns[el.name.slice(4)] = el.value
  }
  const graphicId = form.elements.graphicId.value
  const button = form.querySelector('button[type="submit"]')
  const result = await run(
    button,
    () => api('PUT', `/api/graphics/${encodeURIComponent(graphicId)}/data-binding`, { sourceId: form.dataset.mappingForm, columns }),
    'Widget filled from the source; it updates with every change'
  )
  if (result) await refreshAll()
})

/* ------------------------------------------------------------ add sources */

document.getElementById('add-sheet').addEventListener('submit', async (event) => {
  event.preventDefault()
  const form = event.target
  const result = await run(form.querySelector('button'), () =>
    api('POST', '/api/data-sources', { url: form.url.value, name: form.elements.name.value })
  )
  if (result) {
    form.reset()
    showToast(`Added ${result.source.name}; loading…`, { type: 'success', duration: 2500 })
    await applyData(result)
  }
})

document.getElementById('add-upload').addEventListener('submit', async (event) => {
  event.preventDefault()
  const form = event.target
  const file = form.file.files?.[0]
  if (!file) return
  const body = new FormData()
  body.append('file', file, file.name)
  if (form.elements.name.value) body.append('name', form.elements.name.value)
  const result = await run(form.querySelector('button'), () => api('POST', '/api/data-sources/upload', body))
  if (result) {
    form.reset()
    showToast(`Added ${result.source.name}`, { type: 'success', duration: 2500 })
    await applyData(result)
  }
})

document.getElementById('add-file').addEventListener('submit', async (event) => {
  event.preventDefault()
  const form = event.target
  const result = await run(form.querySelector('button'), () =>
    api('POST', '/api/data-sources', { path: form.path.value, name: form.elements.name.value })
  )
  if (result) {
    form.reset()
    showToast(`Linked ${result.source.name}`, { type: 'success', duration: 2500 })
    await applyData(result)
  }
})

/* -------------------------------------------------------------- variables */

function variableRowHtml(key = '', value = '') {
  return `<div class="variable-row">
    <input type="text" name="key" value="${escapeHtml(key)}" placeholder="event.title" aria-label="Variable name" pattern="[A-Za-z0-9_.\\-]{1,80}" />
    <input type="text" name="value" value="${escapeHtml(value)}" placeholder="Value" aria-label="Value" />
    <button type="button" class="button button--secondary" data-remove-variable aria-label="Remove variable">×</button>
  </div>`
}

let variablesDirty = false

function renderVariables() {
  if (!state || variablesDirty) return
  const vars = state.variables || {}
  variableRows.innerHTML = Object.entries(vars)
    .map(([k, v]) => variableRowHtml(k, v))
    .join('')
  renderVariableWarnings()
}

function renderVariableWarnings() {
  if (!state) return
  const known = new Set([...BUILTIN_VARIABLES.map((b) => b.key), ...Object.keys(state.variables || {}), ...Object.keys(state.sourceVariables || {})])
  const missing = usedVariableNames(state).filter((name) => !known.has(name))
  variableWarnings.hidden = !missing.length
  variableWarnings.innerHTML = missing.length
    ? `Used in your widgets but not defined (shown empty on air): ${missing.map((m) => `<code>{{${escapeHtml(m)}}}</code>`).join(', ')}`
    : ''
}

document.getElementById('variable-add').addEventListener('click', () => {
  variablesDirty = true
  variableRows.insertAdjacentHTML('beforeend', variableRowHtml())
  variableRows.lastElementChild?.querySelector('input')?.focus()
})

variableRows.addEventListener('click', (event) => {
  if (!event.target.closest('[data-remove-variable]')) return
  variablesDirty = true
  event.target.closest('.variable-row').remove()
})
variableRows.addEventListener('input', () => {
  variablesDirty = true
})

document.getElementById('variables-form').addEventListener('submit', async (event) => {
  event.preventDefault()
  const variables = {}
  for (const row of variableRows.querySelectorAll('.variable-row')) {
    const key = row.querySelector('[name="key"]').value.trim()
    if (key) variables[key] = row.querySelector('[name="value"]').value
  }
  const result = await run(event.submitter, () => api('PUT', '/api/variables', { variables }), 'Variables saved')
  if (result) variablesDirty = false
})

function columnOptions(headers, current, placeholder) {
  return [`<option value="">${placeholder}</option>`]
    .concat(headers.map((h) => `<option value="${escapeHtml(h)}"${h === current ? ' selected' : ''}>${escapeHtml(h)}</option>`))
    .join('')
}

function renderVariableSource() {
  if (variableSourceForm.contains(document.activeElement)) return
  const vs = data.variableSource
  const sourceSelect = variableSourceForm.elements.sourceId
  sourceSelect.innerHTML = columnOptions([], '', 'Choose a source') +
    data.sources.map((s) => `<option value="${escapeHtml(s.id)}"${s.id === vs?.sourceId ? ' selected' : ''}>${escapeHtml(s.name)}</option>`).join('')
  fillVariableColumns()
  const vars = state?.sourceVariables || {}
  sourceVariableList.innerHTML = Object.entries(vars)
    .map(([k, v]) => `<code>{{${escapeHtml(k)}}}</code><span>${escapeHtml(v)}</span>`)
    .join('')
}

function fillVariableColumns() {
  const vs = data.variableSource
  const source = data.sources.find((s) => s.id === variableSourceForm.elements.sourceId.value)
  const headers = source?.status?.headers || []
  const same = Boolean(vs && source && vs.sourceId === source.id)
  const keyCurrent = same ? vs.keyColumn : guessColumn('key', headers)
  const valueCurrent = same ? vs.valueColumn : guessColumn('value', headers)
  variableSourceForm.elements.keyColumn.innerHTML = columnOptions(headers, keyCurrent, 'Key column')
  variableSourceForm.elements.valueColumn.innerHTML = columnOptions(headers, valueCurrent, 'Value column')
}

variableSourceForm.elements.sourceId.addEventListener('change', fillVariableColumns)

variableSourceForm.addEventListener('submit', async (event) => {
  event.preventDefault()
  const f = variableSourceForm.elements
  await applyData(
    await run(event.submitter, () =>
      api('PUT', '/api/variable-source', { sourceId: f.sourceId.value, keyColumn: f.keyColumn.value, valueColumn: f.valueColumn.value }),
      'Variables now come from this source'
    )
  )
})

document.getElementById('variable-source-clear').addEventListener('click', async (event) => {
  await applyData(await run(event.currentTarget, () => api('PUT', '/api/variable-source', { sourceId: null }), 'Stopped'))
})

document.getElementById('builtin-list').innerHTML = BUILTIN_VARIABLES.map(
  (b) => `<code>{{${escapeHtml(b.key)}}}</code><span>${escapeHtml(b.label)}</span>`
).join('')

/* ------------------------------------------------------------------ hosts */

function renderHosts() {
  if (hostsForm.contains(document.activeElement)) return
  hostsForm.hosts.value = (data.dataSettings?.allowedHosts || []).join('\n')
}

hostsForm.addEventListener('submit', async (event) => {
  event.preventDefault()
  const allowedHosts = hostsForm.hosts.value.split(/[\s,]+/).filter(Boolean)
  await applyData(await run(event.submitter, () => api('PUT', '/api/data-settings', { allowedHosts }), 'Allowed hosts saved'))
})

/* ---------------------------------------------------------------- wiring */

async function refreshAll() {
  try {
    const [nextState, nextData] = await Promise.all([api('GET', '/api/state'), api('GET', '/api/data-sources')])
    state = nextState
    renderVariables()
    await applyData(nextData)
  } catch (err) {
    showErrorToast(err.message)
  }
}

const socket = sharedSocket()
if (socket) {
  socket.on('dataSourcesStatus', (next) => {
    if (next?.projectId === state?.projectId) applyData(next)
    else refreshAll()
  })
  socket.on('stateChanged', (next) => {
    const projectChanged = next?.projectId !== state?.projectId
    state = next
    if (projectChanged) {
      variablesDirty = false
      refreshAll()
      return
    }
    renderVariables()
    renderVariableWarnings()
    renderSources()
    renderVariableSource()
  })
}

refreshAll()
