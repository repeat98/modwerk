import { useEffect, useState } from 'react'
import { api } from './api'
import { useReconnectRetry } from './useReconnectRetry'
import type { ForumHighlights as Highlights } from './forum-contract'
import { ForumAuthorName, ForumAvatar } from './ForumIdentity'
import { Icon } from '../components/Icon'
import { Skeleton } from './ForumSkeleton'

const likes = (count: number) => count + (count === 1 ? ' like' : ' likes')
const PEOPLE = 'Members with the most liked replies'
const skeletonAuthor = (width: string) => <span className="forum-author"><span className="forum-avatar forum-skeleton-box" /><Skeleton width={width} /></span>
/** The forum home's highlights: the most liked posts and reply authors of the last 30 days, and the newest members. */
export function ForumHighlights() {
  const [data, setData] = useState<Highlights | null>(null), [unavailable, setUnavailable] = useState(false), [revision, setRevision] = useState(0)
  useEffect(() => { let cancelled = false; void api<Highlights>('/forum/highlights').then(value => { if (!cancelled) { setData(value); setUnavailable(false) } }).catch(() => { if (!cancelled) setUnavailable(true) }); return () => { cancelled = true } }, [revision])
  useReconnectRetry(unavailable, setRevision)
  const quiet = data && !data.topPosts.length && !data.topMembers.length && !data.newMembers.length
  // The block keeps its place in the sidebar while loading and when unavailable, so the blocks below it never jump.
  return <section className="forum-highlights" aria-labelledby="forum-highlights-title" aria-busy={!data && !unavailable}>
    <div className="forum-list-heading"><h2 id="forum-highlights-title">Highlights</h2><span>Last 30 days</span></div>
    {unavailable ? <p className="service-note">Highlights are unavailable right now.</p> : !data ? <><span className="sr-only" role="status">Loading highlights…</span><div className="forum-highlight-groups" aria-hidden="true">
      <div className="forum-highlight-group"><h3>Most liked posts</h3><ol className="forum-highlight-posts">{[0, 1].map(index => <li key={index}><div className="forum-meta">{skeletonAuthor('64px')}</div><h4><Skeleton width={index ? '70%' : '90%'} /></h4><p><Skeleton width="100%" /></p></li>)}</ol></div>
      <div className="forum-highlight-group"><h3>{PEOPLE}</h3><ol className="forum-highlight-people">{[0, 1].map(index => <li key={index}>{skeletonAuthor('72px')}<small><Skeleton width="40px" /></small></li>)}</ol></div>
    </div></> : quiet ? <p className="service-note">Likes and new members will show up here.</p> : <div className="forum-highlight-groups">
      {data.topPosts.length > 0 && <div className="forum-highlight-group"><h3>Most liked posts</h3><ol className="forum-highlight-posts">{data.topPosts.map(post => <li key={post.id}>
        <div className="forum-meta"><span className="forum-author"><ForumAvatar username={post.username} avatar={post.avatar} /><ForumAuthorName username={post.username} /></span><span className="forum-highlight-likes"><Icon name="heart" size={12} />{likes(post.likes)}</span></div>
        <h4><a href={'#forum/thread/' + post.thread_id + '?post=' + post.id + '&page=' + post.page}>{post.title}</a></h4>
        <p>{post.excerpt}</p>
      </li>)}</ol></div>}
      {data.topMembers.length > 0 && <div className="forum-highlight-group"><h3>{PEOPLE}</h3><ol className="forum-highlight-people">{data.topMembers.map(member => <li key={member.username}><span className="forum-author"><ForumAvatar username={member.username} avatar={member.avatar} /><ForumAuthorName username={member.username} /></span><small>{likes(member.likes)}</small></li>)}</ol></div>}
      {data.newMembers.length > 0 && <div className="forum-highlight-group"><h3>New members</h3><ul className="forum-highlight-members">{data.newMembers.map(member => <li key={member.username}><a href={'#forum/profile/' + encodeURIComponent(member.username)}><ForumAvatar username={member.username} avatar={member.avatar} />@{member.username}</a></li>)}</ul></div>}
    </div>}
  </section>
}
