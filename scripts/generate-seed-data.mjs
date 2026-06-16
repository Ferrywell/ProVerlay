#!/usr/bin/env node
/**
 * Genereert seed-data/ voor de Electron-app — alleen schone first-run state.
 * De repo-map data/ (Odido, tests, werkbestanden) wordt NOOIT meegepakt.
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { BLANK_PROJECT, SEED_REGISTRY } from '../server/projectSeed.js'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const seedRoot = path.join(root, 'seed-data')
const blankAssets = path.join(seedRoot, 'projects', 'blank', 'assets')

fs.rmSync(seedRoot, { recursive: true, force: true })
fs.mkdirSync(blankAssets, { recursive: true })
fs.writeFileSync(path.join(blankAssets, '.gitkeep'), '')
fs.writeFileSync(path.join(seedRoot, 'registry.json'), JSON.stringify(SEED_REGISTRY, null, 2))
fs.writeFileSync(
  path.join(seedRoot, 'projects', 'blank', 'project.json'),
  JSON.stringify(BLANK_PROJECT, null, 2)
)

console.log('generate-seed-data: wrote', seedRoot)
