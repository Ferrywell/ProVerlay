#!/usr/bin/env node
/**
 * Genereert seed-data/ voor de Electron-app.
 * Bevat het Client-demoproject (PNG scorebalk + ticker + fonts) als standaard first-run.
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { BLANK_PROJECT, SEED_REGISTRY } from '../server/projectSeed.js'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const seedRoot = path.join(root, 'seed-data')
const repoClient = path.join(root, 'data', 'projects', 'client')
const seedClient = path.join(seedRoot, 'projects', 'client')
const seedClientAssets = path.join(seedClient, 'assets')
const seedBlankAssets = path.join(seedRoot, 'projects', 'blank', 'assets')

/** Assets mee in app-bundle (geen 6MB editor-referentie). */
const CLIENT_ASSETS = [
  'CLIENT_SCOREBALK_BASIS.png',
  'CLIENT_TICKERBALK_BASIS_BALK.png',
  'BrandFontHeadline-Bold.ttf',
  'BrandFontHeadline-Regular.ttf',
  'BrandFontText-Regular.ttf'
]

function prepareClientProject() {
  const raw = JSON.parse(fs.readFileSync(path.join(repoClient, 'project.json'), 'utf8'))
  raw.brandId = 'client'
  raw.client = {
    name: 'CLIENT',
    notes:
      'Client live: zet Ticker aan (logo + oranje balk). Voetbal: Match score aan. Hockey: Hockey scorebug + Ticker.'
  }
  raw.brand = {
    name: 'Client',
    fontFamily: "'BrandFont Headline', 'BrandFont Text', sans-serif",
    fontUrl: '/projects/client/assets/BrandFontHeadline-Bold.ttf',
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

fs.mkdirSync(seedClientAssets, { recursive: true })
for (const file of CLIENT_ASSETS) {
  fs.copyFileSync(path.join(repoClient, 'assets', file), path.join(seedClientAssets, file))
}
fs.writeFileSync(path.join(seedClient, 'project.json'), JSON.stringify(prepareClientProject(), null, 2))

fs.writeFileSync(path.join(seedRoot, 'registry.json'), JSON.stringify(SEED_REGISTRY, null, 2))

console.log('generate-seed-data: wrote', seedRoot, '(blank + client demo, active:', SEED_REGISTRY.activeProjectId + ')')
