import type { NotificationLine } from './notification-text'
import { ForumAvatar } from './ForumIdentity'
import { SUPPORT_URL } from '../config/support'
import { countSupportPrompt, trackUsage } from './usage'
import { answerSupportPrompt } from './support-prompt'
import { Icon, type IconName } from '../components/Icon'

const activity: Record<NotificationLine['kind'], { label: string; icon: IconName }> = {
  announcement: { label: 'Modwerk news', icon: 'bell' },
  module_update: { label: 'Module update', icon: 'download' },
  reply: { label: 'Reply', icon: 'message' },
  mention: { label: 'Mention', icon: 'message' },
  message: { label: 'Message', icon: 'mail' },
  post_like: { label: 'Likes', icon: 'heart' },
  module_like: { label: 'Likes', icon: 'heart' },
  module_comment: { label: 'Comment', icon: 'message' },
  module_rating: { label: 'Rating', icon: 'star' },
  bug_report: { label: 'Bug report', icon: 'help' },
  issue_comment: { label: 'Report reply', icon: 'message' },
  issue_resolved: { label: 'Report fixed', icon: 'check' },
  issue_closed: { label: 'Report closed', icon: 'check' },
  issue_reopened: { label: 'Report reopened', icon: 'help' },
  request_status: { label: 'Feature request', icon: 'sliders' },
}
function time(value: string) {
  const date = new Date(value.includes('T') ? value : value.replace(' ', 'T') + 'Z'), minutes = Math.floor((Date.now() - date.getTime()) / 60000)
  return { iso: date.toISOString(), label: minutes < 1 ? 'Just now' : minutes < 60 ? `${minutes}m ago` : minutes < 1440 ? `${Math.floor(minutes / 60)}h ago` : date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) }
}
/** Bell and account inbox entries; opening one marks every notification it groups as read. An entry that links to Ko-fi
 * counts as a Ko-fi click, like the button in the support dialog. */
export function NotificationList({ lines, onOpen }: { lines: NotificationLine[]; onOpen: (line: NotificationLine) => void }) {
  return <ul className="notification-list">{lines.map(line => { const when = time(line.created_at), detail = activity[line.kind]; return <li key={line.ids[0]} data-unread={!line.seen} data-kind={line.kind}>
    <a href={line.href} onClick={() => { if (line.href === SUPPORT_URL) { trackUsage('support_link_opened'); countSupportPrompt('bell-kofi'); answerSupportPrompt('kofi') } onOpen(line) }} {...line.href.startsWith('https://') ? { target: '_blank', rel: 'noreferrer' } : {}}>
      <ForumAvatar username={line.actor} official={line.official} avatar={line.avatar} />
      <span className="notification-copy">
        <span className="notification-meta"><span className="notification-kind"><Icon name={detail.icon} size={12} />{detail.label}</span><span className="notification-when"><time dateTime={when.iso}>{when.label}</time>{!line.seen && <span className="notification-unread-dot" aria-hidden="true" />}</span></span>
        <strong>{!line.seen && <span className="sr-only">Unread: </span>}{line.text}</strong>
        {line.excerpt && <span className="notification-excerpt">{line.excerpt}</span>}
      </span>
    </a>
  </li> })}</ul>
}
