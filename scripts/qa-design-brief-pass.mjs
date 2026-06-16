#!/usr/bin/env node
import { readFileSync } from 'fs'

const checks = []
const pass = (id, msg) => checks.push({ id, result: 'Pass', msg })
const fail = (id, msg) => checks.push({ id, result: 'Fail', msg })

const handlers = readFileSync('public/shared/operate-handlers.js', 'utf8')
if (handlers.includes('export function matchOperateHtml')) pass('TC-500', 'matchOperateHtml exported')
else fail('TC-500', 'matchOperateHtml missing')

if (handlers.includes("graphic.type === 'matchScoreboard'") && handlers.includes('matchOperateHtml')) {
  pass('TC-501', 'refreshOperateSection wires match')
} else fail('TC-501', 'match not wired in refresh')

if (handlers.includes('button--tinted match-operate__score-btn')) pass('TC-502', 'score + uses tinted')
else fail('TC-502', 'score buttons wrong class')

const operate = readFileSync('public/operate/operate.js', 'utf8')
const focusMatch = operate.match(/operatorFocusTypes = new Set\(\[([^\]]+)\]\)/)
if (focusMatch && !focusMatch[1].includes('matchScoreboard')) pass('TC-503', 'match stays on /operate')
else fail('TC-503', 'match redirects to operator')

if (readFileSync('public/operator/operator.js', 'utf8').includes('operate-match.js')) pass('TC-504', 'operator uses operate-match')
else fail('TC-504', 'operator not refactored')

if (!readFileSync('public/operator/index.html', 'utf8').includes('pv-sync-bar')) pass('TC-505', 'operator sync bar removed')
else fail('TC-505', 'pv-sync-bar still present')

const base = 'http://localhost:2014'
for (const [id, path] of [
  ['TC-510', '/control'],
  ['TC-511', '/operator'],
  ['TC-512', '/operate/score-main'],
  ['TC-513', '/operate/ticker-main']
]) {
  const r = await fetch(base + path)
  if (r.ok) pass(id, `${path} ${r.status}`)
  else fail(id, `${path} ${r.status}`)
}

const controlHtml = await (await fetch(`${base}/control`)).text()
if (controlHtml.includes('operate-panel.css')) pass('TC-520', 'control links operate-panel.css')
else fail('TC-520', 'missing css link')
if (controlHtml.includes('project-setup-details')) pass('TC-521', 'project panel collapsible id')
else fail('TC-521', 'missing project-setup-details')

const state = await (await fetch(`${base}/api/state`)).json()
const match = state.graphics.find((g) => g.type === 'matchScoreboard')
if (match) {
  const orig = match.data.homeScore ?? 0
  const r = await fetch(`${base}/api/graphics/${match.id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ data: { ...match.data, homeScore: orig + 1 } })
  })
  if (r.ok) pass('TC-530', 'match score PATCH')
  else fail('TC-530', `PATCH ${r.status}`)
  const s2 = await (await fetch(`${base}/api/state`)).json()
  const m2 = s2.graphics.find((g) => g.id === match.id)
  if (m2.data.homeScore === orig + 1) pass('TC-531', 'score persisted')
  else fail('TC-531', `expected ${orig + 1} got ${m2.data.homeScore}`)
  await fetch(`${base}/api/graphics/${match.id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ data: { ...match.data, homeScore: orig } })
  })
} else {
  fail('TC-530', 'no match graphic')
}

const ticker = state.graphics.find((g) => g.type === 'customTicker')
if (ticker) {
  const body = { data: { ...ticker.data, messages: [{ id: 'qa-auto', text: 'test', enabled: false }] } }
  const r = await fetch(`${base}/api/graphics/${ticker.id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })
  if (r.ok) pass('TC-540', 'ticker enabled:false PATCH')
  else fail('TC-540', `PATCH ${r.status}`)
}

const { detectDevice } = await import('../server/device.js')
if (detectDevice('Mozilla/5.0 (iPhone)') === 'mobile') pass('TC-550', 'iPhone mobile')
else fail('TC-550', 'device detect')
if (detectDevice('Mozilla/5.0 (Macintosh)') === 'desktop') pass('TC-551', 'Mac desktop')
else fail('TC-551', 'device detect')

const fails = checks.filter((c) => c.result === 'Fail')
const summary = { pass: checks.length - fails.length, fail: fails.length, checks }
console.log(JSON.stringify(summary, null, 2))
process.exit(fails.length ? 1 : 0)
