export const PROFILE_LINK_FIELDS = [
  { key: 'instagramUrl', label: 'Instagram', placeholder: 'https://www.instagram.com/yourname/' },
  { key: 'soundcloudUrl', label: 'SoundCloud', placeholder: 'https://soundcloud.com/yourname' },
  { key: 'bandcampUrl', label: 'Bandcamp', placeholder: 'https://yourname.bandcamp.com' },
] as const
export type ProfileLinkField = typeof PROFILE_LINK_FIELDS[number]['key']
export type ProfileLinks = Partial<Record<ProfileLinkField, string>>

/** Accept only HTTPS profiles on the named service, without credentials or tracking parameters. */
export function normalizeProfileLink(key: ProfileLinkField, value: unknown): string {
  const label = PROFILE_LINK_FIELDS.find(field => field.key === key)!.label
  const invalid = () => new Error('Enter an HTTPS ' + label + ' profile URL, or leave it empty.')
  if (typeof value !== 'string' || value.length > 500) throw invalid()
  const text = value.trim()
  if (!text) return ''
  if (/\s|\\/.test(text)) throw invalid()
  let url: URL
  try { url = new URL(text) } catch { throw invalid() }
  if (url.protocol !== 'https:' || url.username || url.password || url.port) throw invalid()
  const path = url.pathname
  if (key === 'instagramUrl') {
    if (!['instagram.com', 'www.instagram.com'].includes(url.hostname) || !/^\/[A-Za-z0-9._]+\/?$/.test(path) || /^\/(p|reel|reels|stories|explore|accounts|direct)\/?$/i.test(path)) throw invalid()
    url.hostname = 'www.instagram.com'
    url.pathname = path.replace(/\/?$/, '/')
  } else if (key === 'soundcloudUrl') {
    if (!['soundcloud.com', 'www.soundcloud.com'].includes(url.hostname) || !/^\/[A-Za-z0-9_-]+\/?$/.test(path)) throw invalid()
    url.hostname = 'soundcloud.com'
    url.pathname = path.replace(/\/$/, '')
  } else if (['bandcamp.com', 'www.bandcamp.com'].includes(url.hostname)) {
    if (!/^\/[A-Za-z0-9_-]+\/?$/.test(path)) throw invalid()
    url.hostname = 'bandcamp.com'
    url.pathname = path.replace(/\/$/, '')
  } else {
    if (!/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.bandcamp\.com$/.test(url.hostname) || url.hostname === 'www.bandcamp.com' || !['/', '/music', '/music/'].includes(path)) throw invalid()
    url.pathname = '/'
  }
  url.search = ''; url.hash = ''
  return url.href
}

/** Fail closed if a legacy or malformed API value reaches the public page. */
export function publicProfileLinks(profile: ProfileLinks) {
  return PROFILE_LINK_FIELDS.flatMap(field => {
    try {
      const href = normalizeProfileLink(field.key, profile[field.key] ?? '')
      if (!href) return []
      const url = new URL(href)
      const account = field.key === 'bandcampUrl' && url.hostname !== 'bandcamp.com'
        ? url.hostname.replace('.bandcamp.com', '') : url.pathname.split('/')[1]
      return [{ ...field, href, account: '@' + account }]
    } catch { return [] }
  })
}
