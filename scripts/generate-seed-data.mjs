#!/usr/bin/env node
/**
 * Genereert seed-data/ voor de Electron-app.
 * TEMPORARY: Odido-demoproject als standaard first-run (later terug naar blank-only).
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { BLANK_PROJECT, SEED_REGISTRY } from '../server/projectSeed.js'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const seedRoot = path.join(root, 'seed-data')
const repoOdido = path.join(root, 'data', 'projects', 'odido')
const repoOdidoAssets = path.join(repoOdido, 'assets')
const seedOdido = path.join(seedRoot, 'projects', 'odido')
const seedOdidoAssets = path.join(seedOdido, 'assets')
const seedBlankAssets = path.join(seedRoot, 'projects', 'blank', 'assets')
const repoBrands = path.join(root, 'data', 'brands')

/** Dev/testbestanden niet mee in consumer-bundle. */
const SKIP_ASSETS = new Set(['test21.png', '.DS_Store', '.gitkeep'])

function copyOdidoAssets() {
  fs.mkdirSync(seedOdidoAssets, { recursive: true })
  for (const file of fs.readdirSync(repoOdidoAssets)) {
    if (SKIP_ASSETS.has(file)) continue
    const src = path.join(repoOdidoAssets, file)
    if (!fs.statSync(src).isFile()) continue
    fs.copyFileSync(src, path.join(seedOdidoAssets, file))
  }
}

function prepareOdidoProject() {
  const raw = JSON.parse(fs.readFileSync(path.join(repoOdido, 'project.json'), 'utf8'))
  for (const g of raw.graphics || []) {
    if (g.data?.clock && typeof g.data.clock === 'object') {
      g.data.clock.running = false
      g.data.clock.runningSince = null
    }
    if (g.id === 'hockey-scorebug-main' && g.data?.clock) {
      g.data.clock.period = 'q1'
      g.data.clock.remainingMs = 900000
      g.data.clock.quarterMs = 900000
    }
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

copyOdidoAssets()
fs.writeFileSync(path.join(seedOdido, 'project.json'), JSON.stringify(prepareOdidoProject(), null, 2))

fs.mkdirSync(path.join(seedRoot, 'brands'), { recursive: true })
fs.copyFileSync(path.join(repoBrands, 'odido.json'), path.join(seedRoot, 'brands', 'odido.json'))

fs.writeFileSync(path.join(seedRoot, 'registry.json'), JSON.stringify(SEED_REGISTRY, null, 2))

const assetCount = fs.readdirSync(seedOdidoAssets).length
console.log(
  'generate-seed-data: wrote',
  seedRoot,
  `(blank + odido demo, ${assetCount} assets, active: ${SEED_REGISTRY.activeProjectId})`
)
