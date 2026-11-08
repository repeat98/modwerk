import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import { seo, sitemapXml } from './seo.ts'
import { modulePageHtml, digiModulePageHtml, notFoundPageHtml } from './module-pages.ts'
import { forumThreadPageHtml } from './forum-pages.ts'
import { sitePageHtml, SITE_PAGES } from './site-pages.ts'
import { MODULES } from '../src/catalog/modules.ts'
import { AVAILABLE_MODULES, PAUSED_MODULE_IDS } from '../src/catalog/availability.ts'
import { DIGI_MODS } from '../src/devices/digi-mods.ts'
import { HOME_DESCRIPTION, HOME_TITLE } from '../src/site-metadata.ts'

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8')
const thread = { id: 'public-topic', title: 'A & B <script>alert(1)</script>', category: 'showcase', username: 'musician', excerpt: 'Public discussion summary.', image: null }

it.each(['./', '/octamod/'])('builds crawlable content and a sitemap matching the public output under %s', base => {
  const appUrl = new URL(base.startsWith('/') ? base : '.', 'https://modwerk.app/')
  const plugin = seo()
  plugin.configResolved({ base })
  const builtHtml = html.replaceAll('%BASE_URL%', base)
  const bundle = { 'index.html': { type: 'asset', fileName: 'index.html', source: builtHtml }, '404.html': { type: 'asset', fileName: '404.html', source: notFoundPageHtml(builtHtml, base) } }
  for (const module of MODULES) bundle['module/' + module.id + '/index.html'] = { type: 'asset', fileName: 'module/' + module.id + '/index.html', source: modulePageHtml(builtHtml, module, 'x.jpg', base) }
  for (const mod of DIGI_MODS) bundle[`${mod.device}/module/${mod.id}/index.html`] = { type: 'asset', fileName: `${mod.device}/module/${mod.id}/index.html`, source: digiModulePageHtml(builtHtml, mod, 'x.jpg', base) }
  bundle['submit/index.html'] = { type: 'asset', fileName: 'submit/index.html', source: sitePageHtml(builtHtml, SITE_PAGES[0], 'x.jpg', base) }
  const forum = forumThreadPageHtml(builtHtml, thread, base)
  bundle['forum/thread/public-topic/index.html'] = { type: 'asset', fileName: 'forum/thread/public-topic/index.html', source: forum }
  bundle['forum/thread/alias/index.html'] = { type: 'asset', fileName: 'forum/thread/alias/index.html', source: forum }
  const emitted = []
  plugin.generateBundle.call({ emitFile(asset) { emitted.push(asset) } }, {}, bundle)
  const sitemap = emitted.find(asset => asset.fileName === 'sitemap.xml').source
  const root = bundle['index.html'].source
  for (const page of Object.values(bundle)) {
    const startup = page.source.match(/<script\b[^>]*src="[^"]*app-startup\.js"[^>]*>/g)
    expect(startup).toHaveLength(1)
    expect(startup[0]).not.toMatch(/\b(?:async|defer|type)\b/)
    expect(page.source.indexOf(startup[0])).toBeLessThan(page.source.indexOf('</head>'))
    const pageUrl = new URL(page.fileName, appUrl)
    const documentBase = new URL(page.source.match(/<base href="([^"]*)"/)[1], pageUrl)
    expect(new URL(startup[0].match(/src="([^"]*)"/)[1], documentBase).href).toBe(new URL('app-startup.js', appUrl).href)
  }
  expect(root).toContain('<h1>Community mods for electronic music hardware</h1>')
  expect(root).toContain(HOME_DESCRIPTION)
  expect(root).toContain(`<meta property="og:url" content="${appUrl.href}" />`)
  expect(root).toContain(`<link rel="canonical" href="${appUrl.href}" />`)
  expect(root.match(/rel="canonical"/g)).toHaveLength(1)
  for (const mod of DIGI_MODS) expect(root).toContain(`href="${appUrl.href}${mod.device}/module/${mod.id}/"`)
  expect(root).toContain('A &amp; B &lt;script&gt;alert(1)&lt;/script&gt;')
  expect(root).not.toContain('<script>alert(1)</script>')
  expect(sitemap.match(/<loc>/g)).toHaveLength(AVAILABLE_MODULES.length + DIGI_MODS.length + 3)
  expect(sitemap).toContain(`<loc>${appUrl.href}module/fm-synth/</loc>`)
  expect(sitemap).toContain(`<loc>${appUrl.href}submit/</loc>`)
  expect(sitemap).not.toContain('module/synth/')
  for (const id of PAUSED_MODULE_IDS) expect(sitemap).not.toContain('module/' + id + '/')
  expect(sitemap).not.toMatch(/404|profile\/|#|index\.html/)
  expect(emitted.find(asset => asset.fileName === 'robots.txt').source).toBe(`User-agent: *\nAllow: /\nSitemap: ${appUrl.href}sitemap.xml\n`)
})

it('omits external, private, missing and fragment routes, and works without the community API', () => {
  const canonical = url => `<link rel="canonical" href="${url}" />`
  const sitemap = sitemapXml([canonical('https://other.test/'), canonical('https://modwerk.app/#account'), canonical('https://modwerk.app/?token=secret'), '<meta name="robots" content="noindex" />' + canonical('https://modwerk.app/404.html'), '<title>Unpublished thread</title>'], new URL('https://modwerk.app/'))
  expect(sitemap).not.toContain('<url>')
  const plugin = seo(), emitted = [], index = { type: 'asset', fileName: 'index.html', source: html }
  plugin.configResolved({ base: './' })
  plugin.generateBundle.call({ emitFile(asset) { emitted.push(asset) } }, {}, { 'index.html': index })
  expect(emitted.find(asset => asset.fileName === 'sitemap.xml').source).toContain('<loc>https://modwerk.app/</loc>')
  expect(index.source).not.toContain('Community discussions')
})

it('keeps the source homepage metadata consistent with client navigation', () => {
  expect(html).toContain(`<title>${HOME_TITLE.replaceAll('&', '&amp;')}</title>`)
  expect(html).toContain(`<meta name="description" content="${HOME_DESCRIPTION}" />`)
})
