import type { Plugin, ResolvedConfig } from 'vite'
import { siteUrls } from './module-pages.ts'
import { escapeHtml, pageMetadataHtml, pageContentHtml } from './page-html.ts'
import { pageTitle } from '../src/site-metadata.ts'
import { developerContent, projectsContent } from './seo-content.ts'
import { PROJECT_TITLE, PROJECT_DESCRIPTION, PROJECT_PREVIEW_IMAGE, PROJECT_PREVIEW_ALT } from '../src/projects/projects.ts'
import { SUBMIT_DESCRIPTION, SUBMIT_PREVIEW_IMAGE, SUBMIT_PREVIEW_ALT } from '../src/community/developer-guidance.ts'

/** Pages that have a real path, so a link to them can carry its own card: original artwork in `public/` (docs/SOCIAL-PREVIEW.md). Each path is also a route in `src/routing.ts`. */
export const SITE_PAGES = [
  { path: 'submit/', name: 'Start developing', description: SUBMIT_DESCRIPTION, image: SUBMIT_PREVIEW_IMAGE, alt: SUBMIT_PREVIEW_ALT },
  { path: 'projects/', name: PROJECT_TITLE, description: PROJECT_DESCRIPTION, image: PROJECT_PREVIEW_IMAGE, alt: PROJECT_PREVIEW_ALT },
] as const
export type SitePage = (typeof SITE_PAGES)[number]

/** The built app page with the page's title, description and preview card, loading its assets relative to its own depth. */
export function sitePageHtml(html: string, page: SitePage, base: string): string {
  const { appUrl, siteName } = siteUrls(html, base)
  const pageUrl = new URL(page.path, appUrl).href, imageUrl = new URL(page.image, appUrl).href
  const title = pageTitle(page.name, siteName), alt = page.alt
  const values: Record<string, string> = {
    description: page.description,
    'og:title': title, 'og:description': page.description, 'og:url': pageUrl, 'og:image': imageUrl, 'og:image:alt': alt,
    'twitter:title': title, 'twitter:description': page.description, 'twitter:image': imageUrl, 'twitter:image:alt': alt,
  }
  const result = pageMetadataHtml(html, title, pageUrl, values)
    .replace(/<base href="[^"]*"\s*\/>/, `<base href="${escapeHtml(base.startsWith('/') ? base : '../'.repeat(page.path.split('/').length - 1))}" />`)
  return pageContentHtml(result, page.path === 'projects/' ? projectsContent(appUrl) : developerContent(appUrl))
}

export function sitePages(): Plugin {
  let config: ResolvedConfig
  return {
    name: 'modwerk-site-pages',
    apply: 'build',
    enforce: 'post',
    configResolved(resolved) { config = resolved },
    generateBundle(_options, bundle) {
      const index = bundle['index.html']
      if (!index || index.type !== 'asset') throw new Error('Missing built app HTML for site pages.')
      const html = String(index.source)
      for (const page of SITE_PAGES) this.emitFile({ type: 'asset', fileName: page.path + 'index.html', source: sitePageHtml(html, page, config.base) })
    },
  }
}
