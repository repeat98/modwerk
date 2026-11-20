import { useEffect, useState } from 'react'
import { api } from './api'
import { useReconnectRetry } from './useReconnectRetry'
import type { ForumHighlights as Highlights } from './forum-contract'
import { ForumAuthorName, ForumAvatar } from './ForumIdentity'
import { Icon } from '../components/Icon'
import { Skeleton } from './ForumSkeleton'

const likes = (count: number) => count + (count === 1 ? ' like' : ' likes')
/** The forum home's "This month" block: the most liked posts and reply authors of the last 30 days, and the newest members. */
export function ForumHighlights() {
  const [data, setData] = useState<Highlights | null>(null), [unavailable, setUnavailable] = useState(false), [revision, setRevision] = useState(0)
  useEffect(() => { let cancelled = false; void api<Highlights>('/forum/highlights').then(value => { if (!cancelled) { setData(value); setUnavailable(false) } }).catch(() => { if (!cancelled) setUnavailable(true) }); return () => { cancelled = true } }, [revision])
  useReconnectRetry(unavailable, setRevision)
  const quiet = data && !data.topPosts.length && !data.topMembers.length && !data.newMembers.length
  // The block keeps its place in the sidebar while loading and when unavailable, so the blocks below it never jump.
  return <section className="forum-highlights" aria-labelledby="forum-highlights-title" aria-busy={!data && !unavailable}>
    <div className="forum-list-heading"><h2 id="forum-highlights-title">This month</h2><span>The last 30 days around the forum</span></div>
    {unavailable ? <p className="service-note">Highlights are unavailable right now.</p> : !data ? <><span className="sr-only" role="status">Loading highlights…</span>{['Most liked posts', 'Most liked replies'].map(title => <div key={title} className="forum-highlight-group" aria-hidden="true"><h3>{title}</h3><ol>{[0, 1, 2].map(index => <li key={index}><Skeleton width={index === 1 ? '70%' : '90%'} /><small><Skeleton width="40%" /></small></li>)}</ol></div>)}</> : quiet ? <p className="service-note">Likes and new members will show up here.</p> : <>
      {data.topPosts.length > 0 && <div className="forum-highlight-group"><h3>Most liked posts</h3><ol>{data.topPosts.map(post => <li key={post.id}><a href={'#forum/thread/' + post.thread_id + '?post=' + post.id + '&page=' + post.page}>{post.title}</a><small><ForumAuthorName username={post.username} /> · <Icon name="heart" size={11} /> {likes(post.likes)}</small></li>)}</ol></div>}
      {data.topMembers.length > 0 && <div className="forum-highlight-group"><h3>Most liked replies</h3><ol>{data.topMembers.map(member => <li key={member.username}><span className="forum-author"><ForumAvatar username={member.username} avatar={member.avatar} /><ForumAuthorName username={member.username} /></span><small>{likes(member.likes)}</small></li>)}</ol></div>}
      {data.newMembers.length > 0 && <div className="forum-highlight-group"><h3>New members</h3><ul className="forum-highlight-members">{data.newMembers.map(member => <li key={member.username}><a href={'#forum/profile/' + encodeURIComponent(member.username)}><ForumAvatar username={member.username} avatar={member.avatar} />@{member.username}</a></li>)}</ul></div>}
    </>}
  </section>
}
