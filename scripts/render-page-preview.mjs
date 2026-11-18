// Re-export a page's original social card from its editable vector source:
//   node scripts/render-page-preview.mjs projects|submit [--fonts <dir>]
// The submit card is set in Archivo and JetBrains Mono, like the homepage card: pass
// a folder holding their TTFs (docs/SOCIAL-PREVIEW.md), or the system fallbacks show.
import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { createHash } from 'node:crypto'

const PAGES = { projects: 'projects-social-preview-v1.jpg', submit: 'submit-social-preview-v1.jpg' }
const [page, flag, fonts] = process.argv.slice(2)
if (!PAGES[page]) throw new Error(`Name a page: ${Object.keys(PAGES).join(' or ')}.`)
if (flag === '--fonts') {
  const files = readdirSync(fonts)
  for (const family of ['Archivo', 'JetBrainsMono']) if (!files.some(file => file.startsWith(family) && file.endsWith('.ttf'))) throw new Error(`No ${family} TTF in ${fonts}.`)
  // Sharp reads fontconfig's settings when it loads, so point it at the folder first.
  const config = join(mkdtempSync(join(tmpdir(), 'modwerk-fonts-')), 'fonts.conf')
  writeFileSync(config, `<?xml version="1.0"?><!DOCTYPE fontconfig SYSTEM "fonts.dtd"><fontconfig><dir>${resolve(fonts)}</dir><include ignore_missing="yes">/etc/fonts/fonts.conf</include></fontconfig>`)
  process.env.FONTCONFIG_FILE = config
}
const { default: sharp } = await import('sharp')
const source = new URL(`../docs/social-preview/${page}.svg`, import.meta.url)
const target = new URL(`../public/${PAGES[page]}`, import.meta.url)
const mark = readFileSync(new URL('../public/modwerk-mark.svg', import.meta.url), 'utf8').replace(/<svg\b[^>]*>/, '<svg width="66" height="66" viewBox="1 1 58 58">')
const svg = readFileSync(source, 'utf8').replace('<!-- MODWERK_MARK -->', mark)
const image = await sharp(Buffer.from(svg), { density: 144 }).resize(1200, 630).jpeg({ quality: 93, progressive: true, chromaSubsampling: '4:4:4' }).toBuffer()
writeFileSync(target, image)
console.log(`Exported ${target.pathname}: ${image.length} bytes, SHA-256 ${createHash('sha256').update(image).digest('hex')}`)
