#!/usr/bin/env node
import fs from 'fs'
import path from 'path'
import { readPsd } from 'ag-psd'

const psdPath = process.argv[2]
if (!psdPath) {
  console.error('Gebruik: node scripts/inspect-psd.mjs <pad/naar/bestand.psd>')
  process.exit(1)
}

const buffer = fs.readFileSync(psdPath)
const psd = readPsd(buffer, { skipLayerImageData: true, skipCompositeImageData: true })

function walkLayers(layers = [], depth = 0, out = []) {
  for (const layer of layers) {
    if (layer.hidden) continue
    const left = layer.left ?? 0
    const top = layer.top ?? 0
    const right = layer.right ?? left
    const bottom = layer.bottom ?? top
    const width = Math.max(0, right - left)
    const height = Math.max(0, bottom - top)
    out.push({
      name: layer.name || '(unnamed)',
      depth,
      left,
      top,
      width,
      height,
      xPct: psd.width ? ((left + width / 2) / psd.width) * 100 : 0,
      yPct: psd.height ? ((top + height / 2) / psd.height) * 100 : 0
    })
    if (layer.children?.length) walkLayers(layer.children, depth + 1, out)
  }
  return out
}

const layers = walkLayers(psd.children || [])
const summary = {
  file: path.basename(psdPath),
  canvas: { width: psd.width, height: psd.height },
  layerCount: layers.length,
  layers
}

console.log(JSON.stringify(summary, null, 2))
