import { createHash } from 'node:crypto'
import type { Plugin, ResolvedConfig } from 'vite'
import { siteUrls } from './module-pages.ts'
import { socialCard } from './social-cards.ts'
import type { SocialCard } from './social-cards.ts'
import { escapeHtml, pageMetadataHtml, pageContentHtml } from './page-html.ts'
import { developerContent, projectsContent } from './seo-content.ts'
import { PROJECT_TITLE, PROJECT_DESCRIPTION, PROJECT_PREVIEW_IMAGE, PROJECT_PREVIEW_ALT } from '../src/projects/projects.ts'

/** Pages that have a real path, so a link to them can carry its own card. Each path is also a route in `src/routing.ts`. */
export const SITE_PAGES = [
  { path: 'submit/', name: 'Start developing', kicker: 'For developers', description: 'Build a mod for Elektron instruments: write it with the SDK, submit it through GitHub and get it reviewed for the Modwerk library.', right: 'Build a mod' },
  { path: 'projects/', name: PROJECT_TITLE, kicker: 'Elektron community', description: PROJECT_DESCRIPTION, right: 'Explore projects' },
] as const
export type SitePage = (typeof SITE_PAGES)[number]

/** The built app page with the page's title, description and preview card, loading its assets relative to its own depth. */
export function sitePageHtml(html: string, page: SitePage, imagePath: string, base: string): string {
  const { appUrl, siteName } = siteUrls(html, base)
  const pageUrl = new URL(page.path, appUrl).href, imageUrl = new URL(imagePath, appUrl).href
  const title = page.name + ' — ' + siteName, alt = page.path === 'projects/' ? PROJECT_PREVIEW_ALT : page.name + ' — ' + siteName
  const values: Record<string, string> = {
    description: page.description,
    'og:title': title, 'og:description': page.description, 'og:url': pageUrl, 'og:image': imageUrl, 'og:image:alt': alt,
    'twitter:title': title, 'twitter:description': page.description, 'twitter:image': imageUrl, 'twitter:image:alt': alt,
  }
  const result = pageMetadataHtml(html, title, pageUrl, values)
    .replace(/<base href="[^"]*"\s*\/>/, `<base href="${escapeHtml(base.startsWith('/') ? base : '../'.repeat(page.path.split('/').length - 1))}" />`)
  return pageContentHtml(result, page.path === 'projects/' ? projectsContent(appUrl) : developerContent(appUrl))
}

export function sitePageCard(page: SitePage): SocialCard { return { kicker: page.kicker, title: page.name, left: 'modwerk.app', right: page.right } }

export function sitePages(): Plugin {
  let config: ResolvedConfig
  return {
    name: 'modwerk-site-pages',
    apply: 'build',
    enforce: 'post',
    configResolved(resolved) { config = resolved },
    async generateBundle(_options, bundle) {
      const index = bundle['index.html']
      if (!index || index.type !== 'asset') throw new Error('Missing built app HTML for site pages.')
      const html = String(index.source)
      for (const page of SITE_PAGES) {
        if (page.path === 'projects/') {
          this.emitFile({ type: 'asset', fileName: page.path + 'index.html', source: sitePageHtml(html, page, PROJECT_PREVIEW_IMAGE, config.base) })
          continue
        }
        const card = await socialCard(config.root, sitePageCard(page))
        const imagePath = `page-thumbnails/${page.path.replace(/\/$/, '')}-${createHash('sha256').update(card).digest('hex').slice(0, 12)}.jpg`
        this.emitFile({ type: 'asset', fileName: imagePath, source: card })
        this.emitFile({ type: 'asset', fileName: page.path + 'index.html', source: sitePageHtml(html, page, imagePath, config.base) })
      }
    },
  }
}
