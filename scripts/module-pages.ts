import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import sharp from 'sharp'
import type { Plugin, ResolvedConfig } from 'vite'
import { MODULES } from '../src/catalog/modules.ts'
import { modulePath } from '../src/catalog/module-links.ts'
import type { FirmwareModule } from '../src/catalog/modules.ts'
import { DETAILS } from '../src/catalog/details.ts'
import { MODULE_DOCUMENTS_BY_ID } from '../src/catalog/documents.ts'
import { ModulePreview } from '../src/components/ModulePreview.tsx'
import { DIGI_MODS, type DigiMod } from '../src/devices/digi-mods.ts'
import { DEVICES_BY_ID } from '../src/devices/registry.ts'
import { escapeHtml, pageMetadataHtml, pageContentHtml } from './page-html.ts'
import { pageTitle } from '../src/site-metadata.ts'
import { digiContent, octatrackContent } from './seo-content.ts'
import { socialCard } from './social-cards.ts'

/** Rasterize the same artwork and CSS used by the module cards, without browser or firmware input. */
export async function moduleThumbnail(id: string, stylesheet: string): Promise<Buffer> {
  const markup = renderToStaticMarkup(createElement(ModulePreview, { id }))
  let artwork = markup.match(/<svg\b[^>]*>[\s\S]*?<\/svg>/)?.[0]
  if (!artwork) throw new Error('Missing module thumbnail artwork: ' + id)
  // librsvg cannot fetch the browser's relative image URL. Embed the same published SVG for server previews.
  if (artwork.includes('<image ')) {
    const document = MODULE_DOCUMENTS_BY_ID[id]
    const source = readFileSync(new URL(`../public/module-media/${id}/${document.version}/presentation/thumbnail.svg`, import.meta.url))
    artwork = artwork.replace(/(<image\b[^>]*href=")[^"]+("[^>]*>)/, '$1data:image/svg+xml;base64,' + source.toString('base64') + '$2')
  }
  const rules = Array.from(stylesheet.matchAll(/([^{}]+)\{([^{}]+)\}/g), match => ({ selector: match[1].trim(), declarations: match[2] }))
  const palette = rules.find(rule => rule.selector === `.module-preview[data-module="${id}"]`) ?? rules.find(rule => rule.selector === '.module-preview')
  const color = palette?.declarations.match(/--signal:\s*([^;]+)/)?.[1]
  const rgb = palette?.declarations.match(/--signal-rgb:\s*([^;]+)/)?.[1]
  if (!color || !rgb) throw new Error('Missing module thumbnail palette: ' + id)
  const styles = rules.filter(rule => /^(?:\.signal-[\w-]+(?:, \.rhythm-on)?|\.rhythm-off|\.reel-[\w-]+|\.signal-art (?:text|\.rhythm-count))$/.test(rule.selector)).map(rule => {
    const declarations = rule.declarations.split(';').filter(declaration => /^\s*(?:stroke[\w-]*|fill|opacity|font[\w-]*|letter-spacing)\s*:/.test(declaration)).join(';')
    return `${rule.selector}{${declarations}}`
  }).join('\n').replaceAll('var(--signal)', color).replaceAll('var(--signal-rgb)', rgb).replaceAll('var(--mono)', 'monospace')
  const detail = DETAILS[id]
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
    <style>${styles}</style>
    <defs><radialGradient id="glow" cx="60%" cy="100%" r="75%"><stop stop-color="${color}" stop-opacity=".075"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></radialGradient></defs>
    <rect width="1200" height="630" fill="#1c1c22"/><rect width="1200" height="630" fill="url(#glow)"/>
    <text x="55" y="58" fill="${color}" opacity=".85" font-family="monospace" font-size="24" letter-spacing="2">${escapeHtml(detail.label)}</text>
    <circle cx="1140" cy="48" r="7" fill="${color}" opacity=".6"/>
    ${artwork.replace('<svg ', '<svg x="60" y="70" width="1080" height="490" ')}
    ${detail.controls.slice(0, 3).map((control, index) => `<text x="${[55, 600, 1145][index]}" y="595" text-anchor="${['start', 'middle', 'end'][index]}" fill="${color}" opacity=".75" font-family="monospace" font-size="22" letter-spacing="1">${escapeHtml(control)}</text>`).join('')}
  </svg>`
  return sharp(Buffer.from(svg)).jpeg({ quality: 90 }).toBuffer()
}

/** The public site URL from the built page's own Open Graph tags, under the Pages project path when there is one. */
export function siteUrls(html: string, base: string) {
  const home = html.match(/<meta property="og:url" content="([^"]+)"/)?.[1]
  if (!home) throw new Error('Missing public site URL for module previews.')
  return { appUrl: new URL(base.startsWith('/') ? base : '.', home), siteName: html.match(/<meta property="og:site_name" content="([^"]+)"/)?.[1] ?? 'Modwerk' }
}

/** GitHub Pages serves this for every path without a file: it boots the app from an absolute base so thread and profile paths open client-side. */
export function notFoundPageHtml(html: string, base: string): string {
  const { appUrl } = siteUrls(html, base)
  return html
    .replace(/\s*<link rel="canonical" href="[^"]*"\s*\/>/g, '')
    .replace(/<base href="[^"]*"\s*\/>/, `<base href="${escapeHtml(base.startsWith('/') ? base : appUrl.href)}" />`)
    .replace(/<title>/, '<meta name="robots" content="noindex" />\n    <title>')
}

export function modulePageHtml(html: string, module: FirmwareModule, imagePath: string, base: string): string {
  const { appUrl, siteName } = siteUrls(html, base)
  const pageUrl = new URL(modulePath(module.id), appUrl).href
  const imageUrl = new URL(imagePath, appUrl).href
  const title = pageTitle(module.name + ' for Elektron Octatrack', siteName)
  const alt = module.name + ' module thumbnail'
  const values: Record<string, string> = {
    description: module.description,
    'og:title': title, 'og:description': module.description, 'og:url': pageUrl,
    'og:image': imageUrl, 'og:image:alt': alt,
    'twitter:title': title, 'twitter:description': module.description,
    'twitter:image': imageUrl, 'twitter:image:alt': alt,
  }
  const page = pageMetadataHtml(html, title, pageUrl, values)
    .replace(/<base href="[^"]*"\s*\/>/, `<base href="${escapeHtml(base.startsWith('/') ? base : '../../')}" />`)
  return pageContentHtml(page, octatrackContent(module, appUrl))
}

export function digiModulePageHtml(html: string, mod: DigiMod, imagePath: string, base: string): string {
  const { appUrl, siteName } = siteUrls(html, base)
  const pageUrl = new URL(`${mod.device}/module/${mod.id}/`, appUrl).href
  const title = pageTitle(`${mod.title} for Elektron ${DEVICES_BY_ID[mod.device].name}`, siteName)
  const imageUrl = new URL(imagePath, appUrl).href, alt = mod.title + ' for ' + DEVICES_BY_ID[mod.device].name
  const page = pageMetadataHtml(html, title, pageUrl, {
    description: mod.summary, 'og:title': title, 'og:description': mod.summary, 'og:url': pageUrl, 'og:image': imageUrl, 'og:image:alt': alt,
    'twitter:title': title, 'twitter:description': mod.summary, 'twitter:image': imageUrl, 'twitter:image:alt': alt,
  }).replace(/<base href="[^"]*"\s*\/>/, `<base href="${escapeHtml(base.startsWith('/') ? base : '../../../')}" />`)
  return pageContentHtml(page, digiContent(mod, appUrl))
}

export function modulePages(): Plugin {
  let config: ResolvedConfig
  return {
    name: 'octamod-module-pages',
    apply: 'build',
    enforce: 'post',
    configResolved(resolved) { config = resolved },
    async generateBundle(_options, bundle) {
      const index = bundle['index.html']
      if (!index || index.type !== 'asset') throw new Error('Missing built app HTML for module previews.')
      const html = String(index.source)
      this.emitFile({ type: 'asset', fileName: '404.html', source: notFoundPageHtml(html, config.base) })
      const stylesheet = readFileSync(resolve(config.root, 'src/styles.css'), 'utf8')
      for (const module of MODULES) {
        const thumbnail = await moduleThumbnail(module.id, stylesheet)
        const hash = createHash('sha256').update(thumbnail).digest('hex').slice(0, 12)
        const imagePath = `module-thumbnails/${module.id}-${hash}.jpg`
        this.emitFile({ type: 'asset', fileName: imagePath, source: thumbnail })
        const page = modulePageHtml(html, module, imagePath, config.base)
        this.emitFile({ type: 'asset', fileName: modulePath(module.id) + 'index.html', source: page })
        // Keep existing links loadable; startRouting replaces them with the public canonical URL.
        if (modulePath(module.id) !== `module/${module.id}/`) {
          this.emitFile({ type: 'asset', fileName: `module/${module.id}/index.html`, source: page })
        }
      }
      for (const mod of DIGI_MODS) {
        const card = await socialCard(config.root, { kicker: 'Elektron ' + DEVICES_BY_ID[mod.device].name, title: mod.title, left: 'modwerk.app', right: mod.category })
        const imagePath = `module-thumbnails/${mod.device}-${mod.id}-${createHash('sha256').update(card).digest('hex').slice(0, 12)}.jpg`
        this.emitFile({ type: 'asset', fileName: imagePath, source: card })
        this.emitFile({ type: 'asset', fileName: `${mod.device}/module/${mod.id}/index.html`, source: digiModulePageHtml(html, mod, imagePath, config.base) })
      }
    },
  }
}
