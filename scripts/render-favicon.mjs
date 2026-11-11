// Renders public/favicon.ico from public/modwerk-icon.svg (32 and 48 pixels) and
// public/modwerk-icon-16.svg (16 pixels, drawn on the pixel grid). Run under Node 24:
//   node scripts/render-favicon.mjs
// Each ICO entry is a PNG, which every current browser and search crawler reads.
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const root = fileURLToPath(new URL('../', import.meta.url))
const icon = readFileSync(path.join(root, 'public/modwerk-icon.svg'))
const small = readFileSync(path.join(root, 'public/modwerk-icon-16.svg'))

async function render(svg, viewBox, size) {
  // Rasterise well above the target size, then downsample, so edges stay even.
  return sharp(svg, { density: (72 * size * 4) / viewBox }).resize(size, size).png().toBuffer()
}

const entries = [
  [16, await render(small, 16, 16)],
  [32, await render(icon, 64, 32)],
  [48, await render(icon, 64, 48)],
]

const header = Buffer.alloc(6)
header.writeUInt16LE(0, 0)
header.writeUInt16LE(1, 2)
header.writeUInt16LE(entries.length, 4)
let offset = 6 + 16 * entries.length
const directory = entries.map(([size, png]) => {
  const entry = Buffer.alloc(16)
  entry.writeUInt8(size, 0)
  entry.writeUInt8(size, 1)
  entry.writeUInt16LE(1, 4)
  entry.writeUInt16LE(32, 6)
  entry.writeUInt32LE(png.length, 8)
  entry.writeUInt32LE(offset, 12)
  offset += png.length
  return entry
})

const target = path.join(root, 'public/favicon.ico')
writeFileSync(target, Buffer.concat([header, ...directory, ...entries.map(([, png]) => png)]))
console.log(`Wrote ${path.relative(root, target)} (${entries.map(([size]) => size).join(', ')} px)`)
