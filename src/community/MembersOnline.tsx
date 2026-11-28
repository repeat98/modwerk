import { ForumAvatar } from './ForumIdentity'
import type { MembersOnline as Presence } from './forum-contract'
import { useMembersOnline } from './useMembersOnline'
import { useCommunity } from './context'
import { profileHref } from '../routing'

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

const count = (value: number, one: string, many: string) => value + ' ' + (value === 1 ? one : many)
const sentence = (parts: string[]) => parts.length < 2 ? parts.join('') : parts.slice(0, -1).join(', ') + ' and ' + parts.at(-1)

/** The forum home's "Online now" section: overlapping avatars that link to profiles, then one line naming who is
 * around. It keeps its height while loading, when nobody is online and when the count is unavailable, so the page
 * below it never moves. */
export function ForumOnlineNow() {
  const presence = useMembersOnline(true, false), me = useCommunity().session.user?.username
  // The viewer comes first, named "You".
  const members = [...presence?.members ?? []].sort((a, b) => Number(b.username === me) - Number(a.username === me))
  const online = presence?.online ?? 0, stack = members.slice(0, 6), rest = online - stack.length
  const guests = presence?.guests ?? 0, named = members.slice(0, 2), others = members.length - named.length + Math.max(0, (presence?.more ?? 0) - guests)
  const names = named.map(member => member.username === me ? 'You' : '@' + member.username)
  const more = others > 0 ? [presence?.guests === undefined ? (names.length ? count(others, 'more', 'more') : onlineLabel(online)) : count(others, 'more member', 'more members')] : []
  const line = !presence ? '' : !online ? 'Quiet right now' : online === 1 && members[0]?.username === me ? 'Just you right now'
    : sentence([...names, ...more, ...guests > 0 ? [count(guests, 'guest', 'guests')] : []])
  return <section className="forum-online-now" aria-labelledby="forum-online-now-title" data-state={!presence ? 'loading' : online ? undefined : 'quiet'}>
    <div className="forum-list-heading">
      <h2 id="forum-online-now-title"><span className="online-dot" aria-hidden="true" />Online now</h2>
      {online > 0 && <span className="forum-online-now-count" title={onlineLabel(online) + ' · active in the last 5 minutes'}><span aria-hidden="true">{online}</span><span className="sr-only">{online} online now, active in the last 5 minutes</span></span>}
    </div>
    <div className="forum-online-now-people">
      {/* Loading and unavailable look alike (the count is null for both), so the placeholder stays still. */}
      {!presence ? <span className="forum-online-now-stack" aria-hidden="true">{[0, 1, 2].map(index => <span key={index} className="forum-avatar forum-online-now-placeholder" />)}</span>
        : stack.length > 0 && <ul className="forum-online-now-stack" aria-label="Members online">
          {stack.map(member => <li key={member.username}><a href={profileHref(member.username)} aria-label={'@' + member.username} title={'@' + member.username}><ForumAvatar username={member.username} avatar={member.avatar} /></a></li>)}
          {rest > 0 && <li className="forum-online-now-more" aria-hidden="true" title={count(rest, 'more person', 'more people') + ' online'}>+{rest}</li>}
        </ul>}
      <p className="forum-online-now-names">{line}</p>
    </div>
  </section>
}
