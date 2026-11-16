#!/usr/bin/env node
/**
 * Generates seed-data/ for the packaged Electron app: a blank project and the
 * registry. Brand presets ship separately in templates/brands/.
 * seed-data/ is build output (gitignored).
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { BLANK_PROJECT, SEED_REGISTRY } from '../server/projectSeed.js'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const seedRoot = path.join(root, 'seed-data')
const seedBlank = path.join(seedRoot, 'projects', 'blank')

fs.rmSync(seedRoot, { recursive: true, force: true })
fs.mkdirSync(path.join(seedBlank, 'assets'), { recursive: true })
fs.writeFileSync(path.join(seedBlank, 'assets', '.gitkeep'), '')
fs.writeFileSync(path.join(seedBlank, 'project.json'), JSON.stringify(BLANK_PROJECT, null, 2))
fs.writeFileSync(path.join(seedRoot, 'registry.json'), JSON.stringify(SEED_REGISTRY, null, 2))

console.log('generate-seed-data: wrote', seedRoot, `(active: ${SEED_REGISTRY.activeProjectId})`)
