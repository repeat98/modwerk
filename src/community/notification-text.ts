import { communityModule } from './modules'
import type { BellItem } from './notification-contract'

export type NotificationLine = { text: string; excerpt: string | null; href: string; ids: string[]; seen: boolean; created_at: string }
const quote = (value: string | null) => '“' + (value ?? 'a discussion') + '”'
function people(items: BellItem[]) {
  const names = [...new Set(items.map(item => item.actorOfficial ? 'Modwerk' : item.actor ? '@' + item.actor : 'A deleted member'))]
  return names.length === 1 ? names[0] : names.length === 2 ? names.join(' and ') : `${names[0]}, ${names[1]} and ${names.length - 2} ${names.length === 3 ? 'other' : 'others'}`
}
function excerpt(value: string | null) {
  if (!value) return null
  const text = value.replace(/^>.*$/gm, '').replace(/```/g, '').replace(/\s+/g, ' ').trim()
  return text.length > 160 ? text.slice(0, 157).trimEnd() + '…' : text || null
}

/** Shared by the bell and activity email. Likes on the same post or module collapse into one line; other
 * entries keep their own line in the given (newest first) order. `link` turns an app hash into an href. */
export function notificationLines(items: BellItem[], link: (hash: string) => string = hash => hash): NotificationLine[] {
  const moduleName = (id: string | null) => (id && communityModule(id)?.name) ?? id ?? 'your module'
  const moduleHref = (id: string | null) => link((id && communityModule(id)?.href) ?? '#library')
  const threadHref = (item: BellItem) => link('#forum/thread/' + item.thread_id + (item.post_id && item.post_id !== item.thread_id ? '?post=' + item.post_id + (item.post_page ? '&page=' + item.post_page : '') : ''))
  const lines: (NotificationLine | BellItem[])[] = [], groups = new Map<string, BellItem[]>()
  for (const item of items) {
    if (item.kind === 'post_like' || item.kind === 'module_like') {
      const key = item.kind + ':' + (item.post_id ?? item.module_id)
      if (!groups.has(key)) { groups.set(key, []); lines.push(groups.get(key)!) }
      groups.get(key)!.push(item)
      continue
    }
    if (item.kind === 'message') {
      const key = 'message:' + (item.actor ?? '')
      if (!groups.has(key)) { groups.set(key, []); lines.push(groups.get(key)!) }
      groups.get(key)!.push(item)
      continue
    }
    const actor = people([item]), base = { ids: [item.id], seen: item.seen, created_at: item.created_at }
    if (item.kind === 'announcement') { lines.push({ ...base, text: `Modwerk: ${item.title ?? 'News'}`, excerpt: excerpt(item.excerpt), href: item.url ?? (item.module_id ? moduleHref(item.module_id) : link('#library')) }); continue }
    if (item.kind === 'reply') lines.push({ ...base, text: `${actor} replied in ${quote(item.title)}`, excerpt: excerpt(item.excerpt), href: threadHref(item) })
    else if (item.kind === 'mention') lines.push({ ...base, text: `${actor} mentioned you in ${quote(item.title)}`, excerpt: excerpt(item.excerpt), href: threadHref(item) })
    else if (item.kind === 'bug_report') lines.push({ ...base, text: `New bug report for ${moduleName(item.module_id)} from ${actor}: ${quote(item.title)}`, excerpt: excerpt(item.excerpt), href: threadHref(item) })
    else if (item.kind === 'module_comment') lines.push({ ...base, text: `${actor} commented on ${moduleName(item.module_id)}`, excerpt: excerpt(item.excerpt), href: moduleHref(item.module_id) })
    else if (item.kind.startsWith('issue_')) {
      const report = 'your bug report ' + quote(item.title), href = item.url ?? link('#account/report/' + item.issue_id)
      const who = item.github_actor ? '@' + item.github_actor + ' on GitHub' : item.actor ? '@' + item.actor : 'A module developer'
      if (item.kind === 'issue_comment') lines.push({ ...base, text: `${who} replied to ${report}`, excerpt: excerpt(item.excerpt), href })
      else lines.push({ ...base, text: `${who} ${item.kind === 'issue_resolved' ? 'marked' : item.kind === 'issue_closed' ? 'closed' : 'reopened'} ${report}${item.kind === 'issue_resolved' ? ' as fixed' : ''}`, excerpt: null, href })
    }
    else if (item.kind === 'module_update') lines.push({ ...base, text: `${item.title ?? moduleName(item.module_id)} ${item.module_version ?? ''} is now available`.replace(/\s+/g, ' '), excerpt: 'Open the module to review the update.', href: item.url?.startsWith('#') ? link(item.url) : moduleHref(item.module_id) })
    else if (item.kind === 'module_rating') lines.push({ ...base, text: `${actor} rated ${moduleName(item.module_id)}${item.rating ? ' ' + '★'.repeat(item.rating) + '☆'.repeat(5 - item.rating) : ''}`, excerpt: null, href: moduleHref(item.module_id) })
  }
  return lines.map(line => {
    if (!Array.isArray(line)) return line
    const first = line[0], base = { ids: line.map(item => item.id), seen: line.every(item => item.seen), created_at: first.created_at, excerpt: null }
    if (first.kind === 'message') return { ...base, excerpt: excerpt(first.excerpt), text: `${people(line)} sent you ${line.length === 1 ? 'a message' : line.length + ' messages'}`, href: link(first.actor ? '#forum/messages/' + first.actor : '#forum/messages') }
    return first.kind === 'post_like'
      ? { ...base, text: `${people(line)} liked your post in ${quote(first.title)}`, href: threadHref(first) }
      : { ...base, text: `${people(line)} liked ${moduleName(first.module_id)}`, href: moduleHref(first.module_id) }
  })
}
