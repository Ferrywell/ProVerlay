#!/usr/bin/env node
/**
 * Maakt dist/Odido.proverlay voor import in bestaande installaties.
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const odidoDir = path.join(root, 'data', 'projects', 'odido')
const odidoAssets = path.join(odidoDir, 'assets')
const outPath = path.join(root, 'dist', 'Odido.proverlay')

const SKIP_ASSETS = new Set(['test21.png', '.DS_Store', '.gitkeep'])

async function main() {
  const { ZipArchive } = await import('archiver')
  fs.mkdirSync(path.dirname(outPath), { recursive: true })
  if (fs.existsSync(outPath)) fs.unlinkSync(outPath)

  const output = fs.createWriteStream(outPath)
  const archive = new ZipArchive()

  archive.pipe(output)
  archive.append(
    JSON.stringify({ id: 'odido', name: 'Odido', exportedAt: new Date().toISOString() }, null, 2),
    { name: 'manifest.json' }
  )
  archive.file(path.join(odidoDir, 'project.json'), { name: 'project.json' })

  for (const file of fs.readdirSync(odidoAssets)) {
    if (SKIP_ASSETS.has(file)) continue
    const src = path.join(odidoAssets, file)
    if (!fs.statSync(src).isFile()) continue
    archive.file(src, { name: `assets/${file}` })
  }

  await archive.finalize()
  await new Promise((resolve, reject) => {
    output.on('close', resolve)
    output.on('error', reject)
  })
  console.log('package-odido-proverlay: wrote', outPath)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
