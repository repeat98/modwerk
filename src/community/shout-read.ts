import type { ForumShouts } from './forum-contract'

type Cursor = { time: string; ids: string[] }
export type ShoutCount = { count: number; more: boolean }

// SQLite timestamps have second precision. Remember all IDs read in that second so a
// subsequent message, edit or deletion cannot move the boundary between read and unread.
function merge(current: Cursor | null, next: Cursor): Cursor {
  if (!current || next.time > current.time) return next
  if (next.time < current.time) return current
  const added = next.ids.filter(id => !current.ids.includes(id))
  return added.length ? { time: current.time, ids: [...current.ids, ...added] } : current
}

export function trackShoutReads(key: string) {
  let cursor: Cursor | null = null
  return ({ messages, hasMore }: ForumShouts, read: boolean): ShoutCount => {
    try {
      const saved: Cursor | null = JSON.parse(localStorage.getItem(key) ?? 'null')
      if (saved && typeof saved.time === 'string' && Array.isArray(saved.ids) && saved.ids.every(id => typeof id === 'string')) cursor = merge(cursor, saved)
    } catch { /* Keep tracking in memory when site storage is unavailable. */ }
    if (!cursor || read) {
      const time = messages[0]?.created_at ?? ''
      const next = merge(cursor, { time, ids: messages.filter(item => item.created_at === time).map(item => item.id) })
      if (next !== cursor) {
        cursor = next
        try { localStorage.setItem(key, JSON.stringify(cursor)) } catch { /* In-memory progress still works. */ }
      }
      return { count: 0, more: false }
    }
    const { time, ids } = cursor
    const boundary = messages.findIndex(item => item.created_at === time && ids.includes(item.id))
    const recent = messages.filter((item, index) => item.created_at > time || (item.created_at === time && (boundary < 0 || index < boundary)))
    const count = recent.filter(item => !item.hidden && !item.canEdit).length
    return { count, more: hasMore && recent.length === messages.length }
  }
}
