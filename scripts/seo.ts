import { readFileSync } from 'node:fs'
import type { Plugin, ResolvedConfig } from 'vite'
import { siteUrls } from './module-pages.ts'
import { pageContentHtml, pageMetadataHtml, escapeHtml } from './page-html.ts'
import { homeContent } from './seo-content.ts'
import { HOME_DESCRIPTION, HOME_TITLE } from '../src/site-metadata.ts'
import { isModulePaused } from '../src/catalog/availability.ts'
import { moduleIdFromSlug } from '../src/catalog/module-links.ts'

/** Advertise only canonical pages actually emitted by this build, never aliases, fragments or 404 routes. */
export function sitemapXml(htmlPages: readonly string[], appUrl: URL) {
  const urls = new Set<string>()
  for (const html of htmlPages) {
    if (/<meta name="robots" content="[^"]*noindex/.test(html)) continue
    const canonical = html.match(/<link rel="canonical" href="([^"]+)"/)?.[1]
    if (!canonical) continue
    const url = new URL(canonical)
    if (url.origin !== appUrl.origin || !url.pathname.startsWith(appUrl.pathname) || url.hash || url.search) continue
    const module = /^module\/([a-z0-9-]+)\/$/.exec(url.pathname.slice(appUrl.pathname.length))
    if (module && isModulePaused(moduleIdFromSlug(module[1]))) continue
    urls.add(url.href)
  }
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${[...urls].sort().map(url => `  <url><loc>${escapeHtml(url)}</loc></url>`).join('\n')}\n</urlset>\n`
}

/** The crawler policy in public/robots.txt plus this build's same-origin sitemap. */
export function robotsTxt(appUrl: URL) {
  return readFileSync(new URL('../public/robots.txt', import.meta.url), 'utf8').trimEnd() + `\n\nSitemap: ${new URL('sitemap.xml', appUrl).href}\n`
}

/** Runs after the module, developer and forum page generators. Firmware and private community data are never inputs. */
export function seo(): Plugin {
  let config: ResolvedConfig
  return {
    name: 'modwerk-seo', apply: 'build', enforce: 'post',
    configResolved(resolved) { config = resolved },
    generateBundle(_options, bundle) {
      const index = bundle['index.html']
      if (!index || index.type !== 'asset') throw new Error('Missing built app HTML for SEO.')
      const { appUrl } = siteUrls(String(index.source), config.base)
      // Project-path deployments need the same canonical base as their generated detail pages.
      const home = pageMetadataHtml(String(index.source), HOME_TITLE, appUrl.href, {
        description: HOME_DESCRIPTION, 'og:title': HOME_TITLE, 'og:description': HOME_DESCRIPTION, 'og:url': appUrl.href,
        'twitter:title': HOME_TITLE, 'twitter:description': HOME_DESCRIPTION,
        'og:image': new URL('modwerk-social-preview-v2.jpg', appUrl).href,
        'twitter:image': new URL('modwerk-social-preview-v2.jpg', appUrl).href,
      })
      const pages = Object.values(bundle).flatMap(asset => asset.type === 'asset' && asset.fileName.endsWith('.html') ? [String(asset.source)] : [])
      const threads = pages.filter(html => /<link rel="canonical" href="[^"]*\/forum\/thread\//.test(html))
      const discussions = new Map(threads.map(html => [html.match(/<link rel="canonical" href="([^"]+)"/)![1], html.match(/<h1>([\s\S]*?)<\/h1>/)?.[1] ?? 'Discussion']))
      // The titles are already escaped text from the public thread page generator.
      const forum = discussions.size ? '<h2>Community discussions</h2><ul>' + [...discussions].slice(0, 30).map(([url, title]) => `<li><a href="${escapeHtml(url)}">${title}</a></li>`).join('') + '</ul>' : ''
      index.source = pageContentHtml(home, homeContent(appUrl) + forum)
      this.emitFile({ type: 'asset', fileName: 'sitemap.xml', source: sitemapXml([String(index.source), ...pages], appUrl) })
      // public/robots.txt holds the crawler policy; emitting this asset replaces the copied file, so keep its rules.
      this.emitFile({ type: 'asset', fileName: 'robots.txt', source: robotsTxt(appUrl) })
    },
  }
}
