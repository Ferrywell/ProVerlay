#!/usr/bin/env node
/**
 * Genereert seed-data/ voor de Electron-app.
 * Bevat het Odido-demoproject (PNG scorebalk + ticker + fonts) als standaard first-run.
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { BLANK_PROJECT, SEED_REGISTRY } from '../server/projectSeed.js'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const seedRoot = path.join(root, 'seed-data')
const repoOdido = path.join(root, 'data', 'projects', 'odido')
const seedOdido = path.join(seedRoot, 'projects', 'odido')
const seedOdidoAssets = path.join(seedOdido, 'assets')
const seedBlankAssets = path.join(seedRoot, 'projects', 'blank', 'assets')

/** Assets mee in app-bundle (geen 6MB editor-referentie). */
const ODIDO_ASSETS = [
  'ODIDO_SCOREBALK_BASIS.png',
  'ODIDO_TICKERBALK_BASIS_BALK.png',
  'OtypicalHeadline-Bold.ttf',
  'OtypicalHeadline-Regular.ttf',
  'OtypicalText-Regular.ttf'
]

function prepareOdidoProject() {
  const raw = JSON.parse(fs.readFileSync(path.join(repoOdido, 'project.json'), 'utf8'))
  raw.brandId = 'odido'
  raw.client = {
    name: 'ODIDO',
    notes:
      'Odido live: zet Ticker aan (logo + oranje balk). Voetbal: Match score aan. Hockey: Hockey scorebug + Ticker.'
  }
  raw.brand = {
    name: 'Odido',
    fontFamily: "'Otypical Headline', 'Otypical Text', sans-serif",
    fontUrl: '/projects/odido/assets/OtypicalHeadline-Bold.ttf',
    colors: {
      primary: '#FF7621',
      secondary: '#7066FF',
      text: '#FFFFFF',
      background: 'rgba(0, 0, 0, 0.85)',
      accent: '#2F9A92'
    }
  }
  for (const g of raw.graphics) {
    if (g.id === 'ticker-main') g.visible = true
    if (g.id === 'hockey-scorebug-main') {
      g.visible = true
      g.data.clock = {
        period: 'q1',
        remainingMs: 900000,
        quarterMs: 900000,
        running: false,
        runningSince: null
      }
    }
    if (g.id === 'score-main') {
      g.visible = false
      if (g.data?.layout) g.data.layout.backgroundVisible = true
    }
    if (g.type === 'f1Timing') g.visible = false
    if (g.type === 'streamCountdown') g.visible = false
  }
  return raw
}

fs.rmSync(seedRoot, { recursive: true, force: true })
fs.mkdirSync(seedBlankAssets, { recursive: true })
fs.writeFileSync(path.join(seedBlankAssets, '.gitkeep'), '')
fs.writeFileSync(
  path.join(seedRoot, 'projects', 'blank', 'project.json'),
  JSON.stringify(BLANK_PROJECT, null, 2)
)

fs.mkdirSync(seedOdidoAssets, { recursive: true })
for (const file of ODIDO_ASSETS) {
  fs.copyFileSync(path.join(repoOdido, 'assets', file), path.join(seedOdidoAssets, file))
}
fs.writeFileSync(path.join(seedOdido, 'project.json'), JSON.stringify(prepareOdidoProject(), null, 2))

fs.writeFileSync(path.join(seedRoot, 'registry.json'), JSON.stringify(SEED_REGISTRY, null, 2))

console.log('generate-seed-data: wrote', seedRoot, '(blank + odido demo, active:', SEED_REGISTRY.activeProjectId + ')')
