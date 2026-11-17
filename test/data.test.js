import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { startTestServer, makeTempDir, fileForm, sleep, buildZip } from './helpers.js'
import { detectDelimiter, parseCsv, parseXlsx, decodeText } from '../server/dataParse.js'
import { fetchDataUrl, hostAllowed, sheetCsvUrl, publicOnlyLookup } from '../server/dataFetch.js'
import { applyTableToGraphic, buildItems, correctIndex, variablesFromTable } from '../server/dataBindings.js'
import { isLocalRequest } from '../server/api.js'
import {
  resolveGraphicVariables,
  resolveText,
  usedVariableNames,
  variableContext,
  graphicUsesLiveVariables
} from '../public/shared/variables.js'

/* ------------------------------------------------------------- fixtures */

/** Minimal .xlsx with shared strings; sheets = { name: [[cell, …], …] }. */
async function buildXlsx(sheets) {
  const strings = []
  const si = (v) => {
    let i = strings.indexOf(v)
    if (i === -1) i = strings.push(v) - 1
    return i
  }
  const col = (n) => String.fromCharCode(65 + n)
  const sheetXml = (rows) =>
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rows
      .map(
        (r, ri) =>
          `<row r="${ri + 1}">${r
            .map((v, ci) =>
              typeof v === 'number'
                ? `<c r="${col(ci)}${ri + 1}"><v>${v}</v></c>`
                : `<c r="${col(ci)}${ri + 1}" t="s"><v>${si(String(v))}</v></c>`
            )
            .join('')}</row>`
      )
      .join('')}</sheetData></worksheet>`
  const names = Object.keys(sheets)
  const files = {}
  names.forEach((name, i) => {
    files[`xl/worksheets/sheet${i + 1}.xml`] = sheetXml(sheets[name])
  })
  const esc = (s) => s.replaceAll('&', '&amp;').replaceAll('<', '&lt;')
  files['xl/sharedStrings.xml'] =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${strings.length}" uniqueCount="${strings.length}">${strings.map((s) => `<si><t>${esc(s)}</t></si>`).join('')}</sst>`
  files['xl/workbook.xml'] =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${names
      .map((n, i) => `<sheet name="${esc(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`)
      .join('')}</sheets></workbook>`
  files['xl/_rels/workbook.xml.rels'] =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${names
      .map(
        (_, i) =>
          `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`
      )
      .join('')}<Relationship Id="rIdS" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/></Relationships>`
  files['_rels/.rels'] =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`
  files['[Content_Types].xml'] =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${names
      .map(
        (_, i) =>
          `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`
      )
      .join('')}<Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/></Types>`
  return buildZip(files)
}

/* ------------------------------------------------------------------ CSV */

test('csv: delimiter detection for comma, semicolon (Dutch Excel) and tab', () => {
  assert.equal(detectDelimiter('a,b,c\n1,2,3'), ',')
  assert.equal(detectDelimiter('Naam;Titel\nAnna;Host, presentator'), ';')
  assert.equal(detectDelimiter('a\tb\n1\t2'), '\t')
  assert.equal(detectDelimiter('"a;x",b\n"1;y",2'), ',', 'delimiters inside quotes do not count')
})

test('csv: BOM, CRLF, quotes, doubled quotes, newlines in quotes, empty rows, duplicate headers', () => {
  const text = '\uFEFFName;Title;Name\r\n"Anna ""AJ"" de Vries";"Host;\nand presenter";x\r\n\r\n;;\r\nBob;Coach;y'
  const t = parseCsv(text)
  assert.deepEqual(t.headers, ['Name', 'Title', 'Name 2'])
  assert.equal(t.rows.length, 2, 'empty rows dropped')
  assert.equal(t.rows[0].Name, 'Anna "AJ" de Vries')
  assert.equal(t.rows[0].Title, 'Host;\nand presenter')
  assert.equal(t.rows[1]['Name 2'], 'y')
})

test('csv: missing header cells and short rows', () => {
  const t = parseCsv('Name,,Extra\nAnna,1\nBob,2,3,4')
  assert.deepEqual(t.headers, ['Name', 'Column 2', 'Extra', 'Column 4'], 'a longer row adds a column instead of losing data')
  assert.equal(t.rows[0].Extra, '')
  assert.equal(t.rows[1]['Column 4'], '4')
  assert.equal(parseCsv('').rows.length, 0)
  assert.deepEqual(parseCsv('\n\n').headers, [])
})

test('csv: UTF-8 with and without BOM, Windows-1252 fallback', () => {
  assert.equal(decodeText(Buffer.from('Zoë', 'utf8')), 'Zoë')
  assert.equal(decodeText(Buffer.from([0x5a, 0x6f, 0xeb])), 'Zoë', 'cp1252 export from old Excel')
})

/* ----------------------------------------------------------------- xlsx */

test('xlsx: reads the chosen sheet, falls back to the first, lists sheet names', async () => {
  const buf = await buildXlsx({
    Speakers: [['Name', 'Title'], ['Anna', 'Host'], ['Bob', 'Coach']],
    Vars: [['key', 'value'], ['event.title', 'Final'], ['round', 3]]
  })
  const first = await parseXlsx(buf)
  assert.deepEqual(first.sheets, ['Speakers', 'Vars'])
  assert.equal(first.sheet, 'Speakers')
  assert.deepEqual(first.table.rows, [{ Name: 'Anna', Title: 'Host' }, { Name: 'Bob', Title: 'Coach' }])
  const vars = await parseXlsx(buf, 'Vars')
  assert.deepEqual(vars.table.rows[1], { key: 'round', value: '3' })
  assert.equal((await parseXlsx(buf, 'Missing')).sheet, 'Speakers')
  await assert.rejects(parseXlsx(Buffer.from('not a zip')), /Excel/)
})

/* ---------------------------------------------------------------- fetch */

test('sheet links become CSV export links', () => {
  assert.equal(
    sheetCsvUrl('https://docs.google.com/spreadsheets/d/ABC123/edit#gid=456'),
    'https://docs.google.com/spreadsheets/d/ABC123/export?format=csv&gid=456'
  )
  assert.equal(
    sheetCsvUrl('https://docs.google.com/spreadsheets/d/ABC123/edit?usp=sharing'),
    'https://docs.google.com/spreadsheets/d/ABC123/export?format=csv'
  )
  assert.equal(
    sheetCsvUrl('https://docs.google.com/spreadsheets/d/e/2PACX-x/pubhtml?gid=7&single=true'),
    'https://docs.google.com/spreadsheets/d/e/2PACX-x/pub?output=csv&gid=7&single=true'
  )
  const csv = 'https://docs.google.com/spreadsheets/d/e/2PACX-x/pub?gid=0&single=true&output=csv'
  assert.equal(sheetCsvUrl(csv), csv)
  assert.equal(sheetCsvUrl('https://data.example.com/a.csv'), 'https://data.example.com/a.csv')
  assert.throws(() => sheetCsvUrl('not a link'), /valid link/)
})

test('fetch rules: https only, allowed hosts, redirects checked, private addresses refused', async () => {
  assert.equal(hostAllowed('docs.google.com'), true)
  assert.equal(hostAllowed('doc-0s-4k-sheets.googleusercontent.com'), true)
  assert.equal(hostAllowed('googleusercontent.com.evil.com'), false)
  assert.equal(hostAllowed('example.com'), false)
  assert.equal(hostAllowed('data.example.com', ['*.example.com']), true)
  assert.equal(hostAllowed('example.com', ['*.example.com']), false)

  const calls = []
  const fake = (responses) => async (url) => {
    calls.push(url)
    return responses.shift()
  }
  const ok = await fetchDataUrl('https://docs.google.com/x', {
    request: fake([{ redirect: 'https://doc-1.googleusercontent.com/y' }, { body: Buffer.from('a,b') }])
  })
  assert.equal(ok.toString(), 'a,b')
  assert.deepEqual(calls, ['https://docs.google.com/x', 'https://doc-1.googleusercontent.com/y'])

  await assert.rejects(fetchDataUrl('http://docs.google.com/x', { request: fake([]) }), /https/)
  await assert.rejects(fetchDataUrl('https://example.com/x.csv', { request: fake([]) }), /not an allowed host/)
  await assert.rejects(
    fetchDataUrl('https://docs.google.com/x', { request: fake([{ redirect: 'https://169.254.169.254/latest' }]) }),
    /not an allowed host/
  )
  await assert.rejects(
    fetchDataUrl('https://10.0.0.5/x.csv', { allowedHosts: ['10.0.0.5'], request: fake([{ body: Buffer.from('') }]) }),
    /Private addresses/
  )
  await assert.rejects(fetchDataUrl('https://u:p@docs.google.com/x', { request: fake([]) }), /user name/)
  const loop = Array.from({ length: 10 }, () => ({ redirect: 'https://docs.google.com/again' }))
  await assert.rejects(fetchDataUrl('https://docs.google.com/x', { request: fake(loop) }), /Too many redirects/)
})

test('fetch: DNS lookup refuses names that resolve to private addresses', async () => {
  const err = await new Promise((resolve) => publicOnlyLookup('localhost', {}, (e) => resolve(e)))
  assert.match(String(err?.message), /private address/)
})

test('isLocalRequest: only loopback', () => {
  const req = (remoteAddress) => ({ socket: { remoteAddress } })
  assert.equal(isLocalRequest(req('127.0.0.1')), true)
  assert.equal(isLocalRequest(req('::ffff:127.0.0.1')), true)
  assert.equal(isLocalRequest(req('::1')), true)
  assert.equal(isLocalRequest(req('192.168.1.20')), false)
  assert.equal(isLocalRequest(req('::ffff:10.0.0.2')), false)
})

/* -------------------------------------------------------------- binding */

test('bindings: rows become list items with stable ids', () => {
  const rows = [
    { Naam: 'Anna', Functie: 'Host', Org: 'NOS' },
    { Naam: '', Functie: 'skipped: no name' },
    { Naam: 'Bob', Functie: 'Coach', Org: '' },
    { Naam: 'Anna', Functie: 'Second Anna', Org: '' }
  ]
  const cols = { name: 'Naam', title: 'Functie', company: 'Org' }
  const a = buildItems('lowerThirdShow', rows, cols)
  assert.deepEqual(a.map((e) => [e.name, e.title, e.company]), [['Anna', 'Host', 'NOS'], ['Bob', 'Coach', ''], ['Anna', 'Second Anna', '']])
  assert.equal(new Set(a.map((e) => e.id)).size, 3, 'duplicate names get their own id')
  const b = buildItems('lowerThirdShow', [{ ...rows[0], Functie: 'Presenter' }, rows[2], rows[3]], cols)
  assert.equal(b[0].id, a[0].id, 'same name → same id after a title edit')

  const ticker = buildItems('customTicker', [{ T: 'One' }, { T: 'Two' }], { text: 'T' }, [{ id: buildItems('customTicker', [{ T: 'One' }], { text: 'T' })[0].id, enabled: false }])
  assert.deepEqual(ticker.map((m) => [m.text, m.enabled]), [['One', false], ['Two', true]], 'operator on/off kept')

  const quiz = buildItems('quizShow', [{ Q: 'Who?', A: 'Ann', B: 'Bob', C: '', D: '', Ok: 'B' }], {
    question: 'Q', optionA: 'A', optionB: 'B', optionC: 'C', optionD: 'D', correct: 'Ok'
  })
  assert.deepEqual(quiz[0].options, ['Ann', 'Bob'])
  assert.equal(quiz[0].correct, 1)
  assert.equal(correctIndex('2', ['a', 'b']), 1)
  assert.equal(correctIndex('bob', ['Ann', 'Bob']), 1)
  assert.equal(correctIndex('9', ['a', 'b']), 0)

  const images = buildItems('image', [{ F: 'lt-anna.png', N: 'Anna' }, { F: '../x.png' }, { F: 'notes.txt' }, { F: 'C:\\Designs\\bob.webp' }], { src: 'F', name: 'N' })
  assert.deepEqual(images.map((i) => [i.src, i.name]), [['lt-anna.png', 'Anna'], ['x.png', 'x'], ['bob.webp', 'bob']])
})

test('bindings: the item on air follows its id, or its position when the id is gone', () => {
  const cols = { name: 'N', title: 'T' }
  const first = buildItems('lowerThirdShow', [{ N: 'Anna', T: 'Host' }, { N: 'Bob', T: 'Coach' }], cols)
  const graphic = { id: 'lt', type: 'lowerThirdShow', visible: true, data: { entries: first, activeEntryId: first[1].id, dataBinding: { sourceId: 's', columns: cols } } }

  const titleFix = applyTableToGraphic(graphic, { rows: [{ N: 'Anna', T: 'Host' }, { N: 'Bob', T: 'Head coach' }] })
  assert.equal(titleFix.data.activeEntryId, first[1].id)
  assert.equal(titleFix.data.entries[1].title, 'Head coach')
  assert.equal(titleFix.visible, true)

  const renamed = applyTableToGraphic(graphic, { rows: [{ N: 'Anna', T: 'Host' }, { N: 'Robert', T: 'Coach' }] })
  assert.equal(renamed.data.entries[renamed.data.entries.findIndex((e) => e.id === renamed.data.activeEntryId)].name, 'Robert')

  const gone = applyTableToGraphic(graphic, { rows: [{ N: 'Anna', T: 'Host' }] })
  assert.equal(gone.data.activeEntryId, null)
  assert.equal(gone.visible, false, 'nothing left to show → off air')

  assert.equal(applyTableToGraphic(graphic, { rows: [{ N: 'Anna', T: 'Host' }, { N: 'Bob', T: 'Coach' }] }), null, 'no change')
})

test('variables from a key/value table', () => {
  const vars = variablesFromTable({ rows: [{ k: 'event.title', v: 'Final' }, { k: 'bad key!', v: 'x' }, { k: '', v: 'y' }, { k: 'sponsor', v: '' }] }, 'k', 'v')
  assert.deepEqual(vars, { 'event.title': 'Final', sponsor: '' })
})

/* ------------------------------------------------------------ variables */

test('variables: resolution, built-ins, unknown names and per-widget text fields', () => {
  const state = {
    variables: { 'event.title': 'Cup final', sponsor: 'ACME' },
    sourceVariables: { sponsor: 'From sheet' },
    graphics: [
      { id: 'm', type: 'matchScoreboard', visible: true, data: { homeCode: 'AJA', awayCode: 'PSV', homeName: 'Ajax', homeScore: 2, awayScore: 1, clock: { period: 'second_half', minute: 67, second: 5 } } },
      { id: 'msg', type: 'message', data: { text: '{{event.title}} · {{home.name}} {{home.score}}–{{away.score}} {{away.name}} · {{missing}}' } }
    ]
  }
  const ctx = variableContext(state, Date.UTC(2026, 10, 17, 12, 0))
  assert.equal(ctx.sponsor, 'From sheet', 'source variables win')
  assert.equal(ctx.clock, '67:05')
  assert.equal(ctx.period, '2nd half')
  assert.equal(resolveText(state.graphics[1].data.text, ctx), 'Cup final · Ajax 2–1 PSV · ')
  assert.equal(resolveText('{{ event.title }}', ctx), 'Cup final')
  assert.equal(resolveText('no vars', ctx), 'no vars')

  const roster = { id: 'r', type: 'lowerThirdShow', data: { entries: [{ id: 'a', name: '{{sponsor}}', title: 'Plain' }], activeEntryId: 'a' } }
  assert.equal(resolveGraphicVariables(roster, ctx).data.entries[0].name, 'From sheet')
  const plain = { id: 'p', type: 'message', data: { text: 'Hello' } }
  assert.equal(resolveGraphicVariables(plain, ctx), plain, 'unchanged object when there is nothing to resolve')
  const score = { id: 's', type: 'matchScoreboard', data: { homeCode: '{{home.code}}' } }
  assert.equal(resolveGraphicVariables(score, ctx), score, 'scorebug fields are not resolved')
  const quiz = { id: 'q', type: 'quizShow', data: { questions: [{ id: 'q1', question: 'Who wins {{event.title}}?', options: ['{{home.name}}', 'Other'] }] } }
  assert.deepEqual(resolveGraphicVariables(quiz, ctx).data.questions[0].options, ['Ajax', 'Other'])
  const ticker = { id: 't', type: 'customTicker', data: { messages: [{ id: '1', text: 'Now: {{time}}', enabled: true }] } }
  assert.match(resolveGraphicVariables(ticker, ctx).data.messages[0].text, /^Now: \d\d:\d\d$/)
  assert.equal(graphicUsesLiveVariables(ticker), true)
  assert.equal(graphicUsesLiveVariables(state.graphics[1]), false)

  assert.deepEqual(usedVariableNames({ graphics: [state.graphics[1], roster, ticker] }), [
    'away.name', 'away.score', 'event.title', 'home.name', 'home.score', 'missing', 'sponsor', 'time'
  ])
})

/* ------------------------------------------------------------------ API */

let srv

before(async () => {
  srv = await startTestServer()
})

after(async () => {
  await srv?.close()
})

async function uploadSource(name, content, extra = {}) {
  const form = fileForm(Buffer.from(content), name)
  for (const [k, v] of Object.entries(extra)) form.append(k, v)
  const res = await srv.post('/api/data-sources/upload', form)
  assert.equal(res.status, 201, res.text)
  return res.json.source
}

async function waitFor(fn, timeoutMs = 4000) {
  const start = Date.now()
  for (;;) {
    const value = await fn()
    if (value) return value
    if (Date.now() - start > timeoutMs) return value
    await sleep(100)
  }
}

const sourceStatus = async (id) => (await srv.get('/api/data-sources')).json.sources.find((s) => s.id === id)?.status

test('api: semicolon CSV upload drives the lower-thirds roster; a new file updates the person on air', async () => {
  const source = await uploadSource('speakers.csv', 'Naam;Functie\nAnna;Host\nBob;Coach\n', { name: 'Speakers' })
  assert.equal(source.name, 'Speakers')
  assert.equal(source.kind, 'csv')
  const status = await waitFor(async () => {
    const s = await sourceStatus(source.id)
    return s?.state === 'ok' && s
  })
  assert.equal(status.rowCount, 2)
  assert.deepEqual(status.headers, ['Naam', 'Functie'])

  const rows = await srv.get(`/api/data-sources/${source.id}/rows?limit=1`)
  assert.deepEqual(rows.json.rows, [{ Naam: 'Anna', Functie: 'Host' }])
  assert.equal(rows.json.total, 2)

  const roster = (await srv.post('/api/graphics', { type: 'lowerThirdShow', name: 'LT' })).json
  const bad = await srv.request('PUT', `/api/graphics/${roster.id}/data-binding`, { sourceId: source.id, columns: { title: 'Functie' } })
  assert.equal(bad.status, 400, 'name column is required')
  const bound = await srv.request('PUT', `/api/graphics/${roster.id}/data-binding`, {
    sourceId: source.id,
    columns: { name: 'Naam', title: 'Functie' }
  })
  assert.equal(bound.status, 200, bound.text)
  assert.deepEqual(bound.json.data.entries.map((e) => e.name), ['Anna', 'Bob'])

  const bob = bound.json.data.entries[1]
  await srv.post(`/api/graphics/${roster.id}/entries/${bob.id}/show`)
  const replaced = await srv.post(`/api/data-sources/${source.id}/file`, fileForm(Buffer.from('Naam;Functie\nAnna;Host\nBob;Head coach\n'), 'v2.csv'))
  assert.equal(replaced.status, 200, replaced.text)
  const after = (await srv.get(`/api/graphics/${roster.id}`)).json
  assert.equal(after.visible, true)
  assert.equal(after.data.activeEntryId, bob.id)
  assert.equal(after.data.entries[1].title, 'Head coach')

  // Wrong type of file for this source, and a broken file
  assert.equal((await srv.post(`/api/data-sources/${source.id}/file`, fileForm(Buffer.from('x'), 'v3.xlsx'))).status, 400)
  assert.equal((await srv.post('/api/data-sources/upload', fileForm(Buffer.from('x'), 'notes.pdf'))).status, 400)

  // Unlink keeps the list
  const unlinked = await srv.request('PUT', `/api/graphics/${roster.id}/data-binding`, { sourceId: null })
  assert.equal(unlinked.json.data.dataBinding, undefined)
  assert.equal(unlinked.json.data.entries.length, 2)
})

test('api: hold changes while on air', async () => {
  const source = await uploadSource('ticker.csv', 'Line\nOne\nTwo\n')
  await waitFor(async () => (await sourceStatus(source.id))?.state === 'ok')
  await srv.patch(`/api/data-sources/${source.id}`, { holdWhileOnAir: true })
  const ticker = (await srv.post('/api/graphics', { type: 'customTicker', name: 'T' })).json
  await srv.request('PUT', `/api/graphics/${ticker.id}/data-binding`, { sourceId: source.id, columns: { text: 'Line' } })
  await srv.post(`/api/graphics/${ticker.id}/toggle`, { visible: true })

  await srv.post(`/api/data-sources/${source.id}/file`, fileForm(Buffer.from('Line\nOne\nTwo\nThree\n'), 't.csv'))
  assert.equal((await srv.get(`/api/graphics/${ticker.id}`)).json.data.messages.length, 2, 'held while on air')
  assert.deepEqual((await sourceStatus(source.id)).held, [ticker.id])

  await srv.post(`/api/graphics/${ticker.id}/toggle`, { visible: false })
  const released = await waitFor(async () => (await srv.get(`/api/graphics/${ticker.id}`)).json.data.messages.length === 3)
  assert.ok(released, 'applied once off air')
})

test('api: xlsx upload with sheet choice, and variables from a key/value sheet', async () => {
  const buf = await buildXlsx({ Names: [['Name'], ['Zoë']], Vars: [['key', 'value'], ['event.title', 'Cup final']] })
  const res = await srv.post('/api/data-sources/upload', fileForm(buf, 'show.xlsx'))
  assert.equal(res.status, 201, res.text)
  const id = res.json.source.id
  const st = await waitFor(async () => {
    const s = await sourceStatus(id)
    return s?.state === 'ok' && s
  })
  assert.deepEqual(st.sheets, ['Names', 'Vars'])
  await srv.patch(`/api/data-sources/${id}`, { sheet: 'Vars' })
  await srv.post(`/api/data-sources/${id}/refresh`)
  const vs = await srv.request('PUT', '/api/variable-source', { sourceId: id, keyColumn: 'key', valueColumn: 'value' })
  assert.equal(vs.status, 200, vs.text)
  assert.deepEqual((await srv.get('/api/state')).json.sourceVariables, { 'event.title': 'Cup final' })
  await srv.request('PUT', '/api/variable-source', { sourceId: null })
  assert.deepEqual((await srv.get('/api/state')).json.sourceVariables, {})
})

test('api: project variables; data-source keys cannot be set through PATCH /api/state', async () => {
  const put = await srv.request('PUT', '/api/variables', { variables: { 'event.title': 'Final', round: 3 } })
  assert.deepEqual(put.json.variables, { 'event.title': 'Final', round: '3' })
  assert.equal((await srv.request('PUT', '/api/variables', { variables: { 'bad key': 'x' } })).status, 400)
  assert.equal((await srv.request('PUT', '/api/variables', { variables: { a: { nested: 1 } } })).status, 400)

  const before = (await srv.get('/api/state')).json
  const echo = await srv.patch('/api/state', {
    ...before,
    dataSources: [{ id: 'src-evil0000', origin: 'file', path: '/etc/passwd', kind: 'csv' }],
    dataSettings: { allowedHosts: ['evil.example'] }
  })
  assert.equal(echo.status, 200, echo.text)
  const after = (await srv.get('/api/state')).json
  assert.deepEqual(after.dataSources, before.dataSources, 'ignored')
  assert.deepEqual(after.dataSettings, before.dataSettings)
  assert.equal((await srv.patch('/api/state', { variables: { 'x y': '1' } })).status, 400)
})

test('api: sheet links to other hosts fail with a clear error until the host is allowed', async () => {
  const res = await srv.post('/api/data-sources', { url: 'https://data.example.invalid/names.csv', name: 'Elsewhere' })
  assert.equal(res.status, 201, res.text)
  const st = await waitFor(async () => {
    const s = await sourceStatus(res.json.source.id)
    return s?.state === 'error' && s
  })
  assert.match(st.error, /not an allowed host/)
  const hosts = await srv.request('PUT', '/api/data-settings', { allowedHosts: ['data.example.invalid', 'http://bad host/', '*.example.org'] })
  assert.deepEqual(hosts.json.allowedHosts, ['data.example.invalid', '*.example.org'])
  assert.equal((await srv.post('/api/data-sources', { url: 'ftp://x/y' })).status, 400)
  assert.equal((await srv.post('/api/data-sources', {})).status, 400)
  await srv.del(`/api/data-sources/${res.json.source.id}`)
})

test('api: linked file is re-read when it changes, and the cache keeps the data when it is gone', async () => {
  const dir = await makeTempDir()
  const file = path.join(dir, 'names.csv')
  await fs.writeFile(file, 'Name\nAnna\n')
  const res = await srv.post('/api/data-sources', { path: file })
  assert.equal(res.status, 201, res.text)
  const id = res.json.source.id
  assert.ok(await waitFor(async () => (await sourceStatus(id))?.rowCount === 1))
  await sleep(1100) // mtime resolution
  await fs.writeFile(file, 'Name\nAnna\nBob\n')
  assert.ok(await waitFor(async () => (await sourceStatus(id))?.rowCount === 2, 6000), 'picked up the saved file')

  await fs.rm(file)
  await srv.post(`/api/data-sources/${id}/refresh`)
  const st = await sourceStatus(id)
  assert.equal(st.state, 'cached')
  assert.match(st.error, /not found/)
  assert.equal((await srv.get(`/api/data-sources/${id}/rows`)).json.total, 2, 'last good copy kept')

  assert.equal((await srv.post('/api/data-sources', { path: 'relative.csv' })).status, 400)
  assert.equal((await srv.post('/api/data-sources', { path: path.join(dir, 'nope.csv') })).status, 400)
  await srv.del(`/api/data-sources/${id}`)
  await assert.rejects(fs.access(path.join(srv.dir, 'projects', 'blank', 'data-sources', `${id}.cache.json`)))
})

test('api: export carries data files and caches; import drops linked paths and allowed hosts', async () => {
  const dir = await makeTempDir()
  const linked = path.join(dir, 'l.csv')
  await fs.writeFile(linked, 'Name\nZed\n')
  const linkedSource = (await srv.post('/api/data-sources', { path: linked })).json.source
  await waitFor(async () => (await sourceStatus(linkedSource.id))?.state === 'ok')
  await srv.request('PUT', '/api/data-settings', { allowedHosts: ['data.example.org'] })

  const res = await fetch(`${srv.base}/api/projects/active/export`)
  const zip = Buffer.from(await res.arrayBuffer())
  const imported = await srv.post('/api/projects/import', fileForm(zip, 'show.proverlay'))
  assert.equal(imported.status, 201, imported.text)
  const projectDir = path.join(srv.dir, 'projects', imported.json.id)
  const files = await fs.readdir(path.join(projectDir, 'data-sources'))
  assert.ok(files.some((f) => f.endsWith('.csv') && !f.endsWith('.cache.json')), 'uploaded file')
  assert.ok(files.includes(`${linkedSource.id}.cache.json`), 'cache of the linked file')
  const data = JSON.parse(await fs.readFile(path.join(projectDir, 'project.json'), 'utf8'))
  const importedLinked = data.dataSources.find((s) => s.id === linkedSource.id)
  assert.equal(importedLinked.path, undefined, 'linked path removed')
  assert.deepEqual(data.dataSettings.allowedHosts, [])
})

test('import ignores files outside the allow-list in data-sources/', async () => {
  const zip = await buildZip({
    'manifest.json': JSON.stringify({ name: 'Tricky data' }),
    'project.json': JSON.stringify({ graphics: [] }),
    'data-sources/src-abcd1234.csv': 'Name\nA\n',
    'data-sources/evil.html': '<script>1</script>',
    'data-sources/../escape.csv': 'x'
  })
  const res = await srv.post('/api/projects/import', fileForm(zip, 't.proverlay'))
  assert.equal(res.status, 201, res.text)
  const files = await fs.readdir(path.join(srv.dir, 'projects', res.json.id, 'data-sources'))
  assert.deepEqual(files, ['src-abcd1234.csv'])
})

