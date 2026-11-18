// Re-export a page's original social card from its editable vector source:
//   node scripts/render-page-preview.mjs projects|submit
import { readFileSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import sharp from 'sharp'

const PAGES = { projects: 'projects-social-preview-v1.jpg', submit: 'submit-social-preview-v1.jpg' }
const page = process.argv[2]
if (!PAGES[page]) throw new Error(`Name a page: ${Object.keys(PAGES).join(' or ')}.`)
const source = new URL(`../docs/social-preview/${page}.svg`, import.meta.url)
const target = new URL(`../public/${PAGES[page]}`, import.meta.url)
const mark = readFileSync(new URL('../public/modwerk-mark.svg', import.meta.url), 'utf8').replace(/<svg\b[^>]*>/, '<svg width="66" height="66" viewBox="1 1 58 58">')
const svg = readFileSync(source, 'utf8').replace('<!-- MODWERK_MARK -->', mark)
const image = await sharp(Buffer.from(svg), { density: 144 }).resize(1200, 630).jpeg({ quality: 93, progressive: true, chromaSubsampling: '4:4:4' }).toBuffer()
writeFileSync(target, image)
console.log(`Exported ${target.pathname}: ${image.length} bytes, SHA-256 ${createHash('sha256').update(image).digest('hex')}`)
