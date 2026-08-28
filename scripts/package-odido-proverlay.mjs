#!/usr/bin/env node
/**
 * Maakt dist/Odido.proverlay voor import in bestaande installaties.
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import archiver from 'archiver'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const odidoDir = path.join(root, 'data', 'projects', 'odido')
const outPath = path.join(root, 'dist', 'Odido.proverlay')

const ASSETS = [
  'ODIDO_SCOREBALK_BASIS.png',
  'ODIDO_TICKERBALK_BASIS_BALK.png',
  'OtypicalHeadline-Bold.ttf',
  'OtypicalHeadline-Regular.ttf',
  'OtypicalText-Regular.ttf'
]

fs.mkdirSync(path.dirname(outPath), { recursive: true })
if (fs.existsSync(outPath)) fs.unlinkSync(outPath)

const output = fs.createWriteStream(outPath)
const archive = archiver('zip', { zlib: { level: 9 } })

archive.pipe(output)
archive.append(
  JSON.stringify({ id: 'odido', name: 'Odido', exportedAt: new Date().toISOString() }, null, 2),
  { name: 'manifest.json' }
)
archive.file(path.join(odidoDir, 'project.json'), { name: 'project.json' })
for (const file of ASSETS) {
  archive.file(path.join(odidoDir, 'assets', file), { name: `assets/${file}` })
}

await archive.finalize()
await new Promise((resolve, reject) => {
  output.on('close', resolve)
  output.on('error', reject)
})
console.log('package-odido-proverlay: wrote', outPath)
