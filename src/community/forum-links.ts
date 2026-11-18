// SPDX-License-Identifier: GPL-3.0-or-later OR Elastic-2.0
// Copyright (c) 2026 Jannik Aßfalg (repeat98)
/** Forum links are explicit web URLs; executable, local and credential-bearing URLs stay text. */
export function forumLink(value: string): string | undefined {
  if (Array.from(value).some(character=>character.charCodeAt(0)<=32||character.charCodeAt(0)===127)) return undefined
  try {
    const url = new URL(value)
    return ['https:','http:'].includes(url.protocol) && !url.username && !url.password ? url.href : undefined
  } catch { return undefined }
}

export type YouTubeVideo = { id: string; start: number }
const youTubeHosts = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com', 'youtu.be', 'www.youtu.be'])
/** Start time in seconds from `t=90`, `t=1m30s` or `start=90`; anything else, or more than half a day, means the beginning. */
function startSeconds(value: string | null) {
  if (!value) return 0
  const parts = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/.exec(value)
  const seconds = /^\d+$/.test(value) ? Number(value) : parts && (parts[1] || parts[2] || parts[3]) ? Number(parts[1] ?? 0) * 3600 + Number(parts[2] ?? 0) * 60 + Number(parts[3] ?? 0) : 0
  return seconds < 43200 ? seconds : 0
}
/** The video behind a YouTube watch, share, Shorts, live or embed link. Playlists, channels and every other host stay ordinary links. */
export function youTubeVideo(value: string): YouTubeVideo | undefined {
  const href = forumLink(value.trim())
  if (!href) return undefined
  const url = new URL(href)
  if (!youTubeHosts.has(url.hostname) || url.port) return undefined
  const [first, second] = url.pathname.split('/').filter(Boolean)
  const id = url.hostname.endsWith('youtu.be') ? first : first === 'watch' ? url.searchParams.get('v') : ['shorts', 'embed', 'live', 'v'].includes(first) ? second : undefined
  return id && /^[A-Za-z0-9_-]{11}$/.test(id) ? { id, start: startSeconds(url.searchParams.get('t') ?? url.searchParams.get('start')) } : undefined
}
/** The first YouTube link in plain text such as a chat message, ignoring punctuation that ends a sentence. */
export function firstYouTubeVideo(text: string) {
  for (const match of text.matchAll(/https?:\/\/[^\s<>"']+/g)) {
    const video = youTubeVideo(match[0].replace(/[.,;:!?)\]]+$/, ''))
    if (video) return video
  }
  return undefined
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/
/** The title's words for a readable URL; empty when nothing usable is left. */
export function threadSlug(title: string) {
  return title.toLowerCase().replace(/ß/g, 'ss').normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+/, '').slice(0, 60).replace(/-+$/, '')
}
/** Public path of a thread: its ID, followed by the title's words when the ID is a UUID. Module home threads keep their fixed IDs. The ID alone stays valid. */
export function threadPath(id: string, title?: string | null) {
  const slug = title && UUID.test(id) && id.length === 36 ? threadSlug(title) : ''
  return 'forum/thread/' + id + (slug ? '-' + slug : '') + '/'
}
/** The thread ID in a path segment, dropping the title words that may follow a UUID. */
export function threadIdFromSegment(segment: string) { return UUID.test(segment) ? segment.slice(0, 36) : segment }
export function profilePath(username: string) { return 'forum/profile/' + encodeURIComponent(username) + '/' }
/** Plain text of a post's Markdown for previews, feeds and page descriptions. */
export function postExcerpt(markdown: string, max = 200) {
  const text = markdown.replace(/```[\s\S]*?(?:```|$)/g, ' ').replace(/!\[[^\]]*\]\([^)]*\)/g, ' ').replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/^[ \t]*(?:#{1,6}|>|[-*+]|\d+[.)])[ \t]+/gm, '').replace(/`([^`]*)`/g, '$1').replace(/(\*{1,3}|_{1,3}|~~)(\S(?:[^*_~]*?\S)?)\1/g, '$2').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
  return text.length > max ? text.slice(0, max - 1).trimEnd() + '…' : text
}
/** The hash route behind a thread or profile path, for the push service worker, which opens hash routes only. */
export function forumHashRoute(path: string) {
  const match = /^forum\/(thread|profile)\/([^/?]+)\/(\?.*)?$/.exec(path)
  return match ? '#forum/' + match[1] + '/' + (match[1] === 'thread' ? threadIdFromSegment(match[2]) : match[2]) + (match[3] ?? '') : undefined
}
/** The address the Share button hands out: the thread's public page, tagged so the site counts a visit through it as one
 * from a shared forum link (visit-source.ts), which the site then drops from the address bar. */
export function shareLink(href: string, base: string) {
  const link = new URL(href, base)
  if (link.origin === new URL(base).origin) link.searchParams.set('utm_source', 'forum-share')
  return link.href
}
