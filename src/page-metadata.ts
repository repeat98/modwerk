export type PageMetadata = { title: string; description: string; url: string; image?: string; imageAlt?: string }

/** Match the static page's signals when moving between public pages without reloading. */
export function setPageMetadata({ title, description, url, image, imageAlt }: PageMetadata) {
  document.title = title
  const previousUrl = document.querySelector<HTMLMetaElement>('meta[property="og:url"]')?.content
  let canonical = document.querySelector<HTMLLinkElement>('link[rel="canonical"]')
  if (!canonical) { canonical = document.createElement('link'); canonical.rel = 'canonical'; document.head.append(canonical) }
  canonical.href = url
  const values: Record<string, string> = { description, 'og:title': title, 'og:description': description, 'og:url': url, 'twitter:title': title, 'twitter:description': description }
  // A directly loaded page keeps its generated card; client navigation falls back to the site card.
  if (image || previousUrl !== url) {
    const base = new URL(document.baseURI)
    for (const key of ['og:image', 'twitter:image']) values[key] = new URL(image ?? 'modwerk-social-preview-v2.jpg', base).href
    for (const key of ['og:image:alt', 'twitter:image:alt']) values[key] = imageAlt ?? 'Modwerk. Mods for Elektron instruments.'
    values['og:image:type'] = 'image/jpeg'; values['og:image:width'] = '1200'; values['og:image:height'] = '630'
  }
  for (const [key, value] of Object.entries(values)) {
    const attribute = key.startsWith('og:') ? 'property' : 'name'
    let tag = document.querySelector<HTMLMetaElement>(`meta[${attribute}="${key}"]`)
    if (!tag) { tag = document.createElement('meta'); tag.setAttribute(attribute, key); document.head.append(tag) }
    tag.content = value
  }
  const type = document.querySelector<HTMLMetaElement>('meta[property="og:type"]')
  if (type) type.content = url.includes('/forum/thread/') ? 'article' : 'website'
}
