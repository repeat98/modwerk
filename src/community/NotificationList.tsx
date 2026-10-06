import type { NotificationLine } from './notification-text'
import { ForumAvatar } from './ForumIdentity'
function time(value: string) {
  const date = new Date(value.includes('T') ? value : value.replace(' ', 'T') + 'Z'), minutes = Math.floor((Date.now() - date.getTime()) / 60000)
  return { iso: date.toISOString(), label: minutes < 1 ? 'Just now' : minutes < 60 ? `${minutes}m ago` : minutes < 1440 ? `${Math.floor(minutes / 60)}h ago` : date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) }
}
/** Bell and account inbox entries; opening one marks every notification it groups as read. */
export function NotificationList({ lines, onOpen }: { lines: NotificationLine[]; onOpen: (line: NotificationLine) => void }) {
  return <ul className="notification-list">{lines.map(line => { const when = time(line.created_at); return <li key={line.ids[0]} data-unread={!line.seen}>
    <a href={line.href} onClick={() => onOpen(line)} {...line.href.startsWith('https://') ? { target: '_blank', rel: 'noreferrer' } : {}}><ForumAvatar username={line.actor} official={line.official} avatar={line.avatar} />{!line.seen && <span className="sr-only">Unread: </span>}<strong>{line.text}</strong>{line.excerpt && <span className="notification-excerpt">{line.excerpt}</span>}<time dateTime={when.iso}>{when.label}</time></a>
  </li> })}</ul>
}
