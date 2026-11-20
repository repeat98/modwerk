import { ForumAvatar } from './ForumIdentity'
import type { MembersOnline as Presence } from './forum-contract'
import { useMembersOnline } from './useMembersOnline'

const onlineLabel = (online: number) => online === 1 ? '1 person online' : online + ' people online'

/** Public member names up to the server's limit, with guests and other people counted separately. */
export function MembersOnlineList({ presence }: { presence: Presence }) {
  const guests = presence.guests ?? 0, others = Math.max(0,presence.more - guests)
  return <ul className="members-online-list" aria-label="People online">
    {presence.members.map(member => <li key={member.username}><a href={'#forum/profile/' + encodeURIComponent(member.username)}><ForumAvatar username={member.username} avatar={member.avatar} />@{member.username}</a></li>)}
    {guests > 0 && <li className="members-online-more">{guests} {guests === 1 ? 'guest' : 'guests'}</li>}
    {others > 0 && <li className="members-online-more">{presence.guests === undefined ? (!presence.members.length ? onlineLabel(presence.online) : 'and ' + others + ' more') : others + (others === 1 ? ' more member' : ' more members')}</li>}
  </ul>
}

/** The sidebar's online count. */
export function MembersOnlineChip({ presence }: { presence: Presence | null }) {
  if (!presence) return <span className="sidebar-online is-unknown" title="Online count unavailable"><span aria-hidden="true">— online</span><span className="sr-only">Online count unavailable</span></span>
  return <span className="sidebar-online" title={onlineLabel(presence.online) + ' · active in the last 5 minutes'}><span className="online-dot" aria-hidden="true" />{presence.online} online</span>
}

/** One line on the forum home naming who is around right now. The line keeps its height while loading, when nobody
 * is online and when the count is unavailable, so the page below it never moves. */
export function ForumOnlineNow() {
  const presence = useMembersOnline(true, false)
  return <div className="forum-online-now">{presence?.online
    ? <><span className="forum-online-now-label" title="Active in the last 5 minutes"><span className="online-dot" aria-hidden="true" />{presence.online} online now</span><MembersOnlineList presence={presence} /></>
    : presence && <span className="forum-online-now-label is-quiet">Nobody online in the last 5 minutes</span>}</div>
}
