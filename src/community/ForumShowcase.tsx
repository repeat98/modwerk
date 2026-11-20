import { useEffect, useState } from 'react'
import { api } from './api'
import { apiUrl } from '../hosting'
import { useCommunity } from './context'
import { Icon } from '../components/Icon'
import { AudioPlayer } from '../components/AudioPlayer'
import '../components/audio-preview.css'
import { ForumAuthorName, ForumAvatar, ForumMachineBadge } from './ForumIdentity'
import { ForumTime } from './ForumTime'
import type { ForumShowcaseItem } from './forum-contract'
import { threadHref } from '../routing'
import { useReconnectRetry } from './useReconnectRetry'
import { Skeleton } from './ForumSkeleton'

function Card({ item }: { item: ForumShowcaseItem }) {
  const image = item.attachments.find(media => media.kind === 'image'), sound = item.attachments.find(media => media.kind === 'audio')
  const href = threadHref(item.thread_id, item.title, '?post=' + item.id + '&page=' + item.page), more = item.attachments.length - (image ? 1 : 0) - (sound ? 1 : 0)
  const caption = (image?.caption || sound?.caption || '').trim()
  return <li className="forum-showcase-card" data-kind={image ? 'image' : 'audio'} data-category={item.category}>
    <div className="forum-showcase-cover">
      {image && <img src={apiUrl('/forum/media/' + image.id)} alt={image.caption || 'Image from “' + item.title + '”'} loading="lazy" decoding="async" />}
      {sound && <div className="forum-showcase-sound" data-cover={!!image || undefined}>
        {!image && <span className="forum-showcase-sound-mark" aria-hidden="true"><Icon name="wave" size={36}/></span>}
        {/* The module pages' compact player: a strip along the bottom of the cover. */}
        <div className="audio-preview-dock"><div className="audio-preview-player"><AudioPlayer src={apiUrl('/forum/media/' + sound.id)} label={'sound clip from “' + item.title + '”' + (sound.caption ? ': ' + sound.caption : '')} variant="dock"/></div></div>
      </div>}
      <span className="forum-showcase-chips"><ForumMachineBadge machine={item.machine} />{more > 0 && <span className="forum-showcase-more">+{more} more</span>}{sound && <span className="forum-showcase-audio-label" aria-hidden="true"><Icon name="wave" size={12}/>Audio</span>}</span>
    </div>
    <div className="forum-showcase-copy">
      <h3><a className="forum-showcase-title" href={href} title={item.title}>{item.title}</a></h3>
      <p className="forum-showcase-caption" aria-hidden={!caption || undefined}>{caption}</p>
      <div className="forum-showcase-meta"><ForumAvatar username={item.username} official={item.official} avatar={item.avatar} /><ForumAuthorName username={item.username} official={item.official} /><ForumTime value={item.created_at} relative /></div>
    </div>
  </li>
}

/** A loading card with the loaded card's cover and lines. `ghost` keeps it invisible: it only gives an empty strip the
 * height a full one has. */
function LoadingCard({ ghost }: { ghost?: boolean }) {
  return <li className={'forum-showcase-card forum-showcase-loading' + (ghost ? ' forum-showcase-ghost' : '')} aria-hidden="true">
    <div className="forum-showcase-cover" />
    <div className="forum-showcase-copy">
      <h3><Skeleton width="78%" /></h3>
      <p className="forum-showcase-caption"><Skeleton width="52%" /></p>
      <div className="forum-showcase-meta"><span className="forum-avatar forum-skeleton-box" /><Skeleton width="38%" /></div>
    </div>
  </li>
}

/** The newest images and sound clips, with an invitation to add one: a sideways strip on the front page, a wrapping gallery on the Showcase topic. */
export function ForumShowcase({ machine, category, shareHref, layout = 'strip' }: { machine?: string; category?: string; shareHref: string; layout?: 'strip' | 'grid' }) {
  const { session, settled = true } = useCommunity(), [items, setItems] = useState<ForumShowcaseItem[] | null>(null), [failed, setFailed] = useState(false), [revision, setRevision] = useState(0)
  const query = new URLSearchParams({ ...(machine ? { machine } : {}), ...(category ? { category } : {}) }).toString()
  useEffect(() => {
    let cancelled = false
    void api<ForumShowcaseItem[]>('/forum/showcase' + (query ? '?' + query : '')).then(value => { if (!cancelled) { setItems(value); setFailed(false) } }).catch(() => { if (!cancelled) setFailed(true) })
    return () => { cancelled = true }
  }, [query, revision])
  useReconnectRetry(failed, setRevision)
  // Start each changed feed at its invitation and newest shares, without retaining an older scroll position.
  const feedKey = JSON.stringify([query, items?.map(item => item.id)])
  // Without media storage nobody can share here. Until the session is known the strip shows loading cards, as media
  // storage is on wherever the forum runs; a failed load keeps the strip's place with only the invitation.
  if (settled && !session.forumMedia) return null
  const loading = !items && !failed, empty = !loading && !items?.length
  return <section className="forum-showcase" data-layout={layout} aria-labelledby="forum-showcase-title" aria-busy={loading}>
    <div className="forum-list-heading"><h2 id="forum-showcase-title">{layout === 'grid' ? 'Latest shares' : 'Fresh from the community'}</h2>{layout === 'strip' && <a className="text-button" href={'#forum?category=showcase' + (machine ? '&machine=' + machine : '')}>Browse the Showcase<Icon name="arrow" size={13} /></a>}</div>
    <ul key={feedKey} className="forum-showcase-strip" data-empty={empty || undefined}>
      {empty && <LoadingCard ghost />}
      <li className="forum-showcase-invite"><a href={shareHref}>
        <span className="forum-showcase-invite-icon"><Icon name="plus" size={20} /></span>
        <strong>{items?.length === 0 ? 'Be the first to share' : 'Share yours'}</strong>
        <span>A jam, a sound you made with a module, or a photo of your setup.</span>
        {failed && !items && <small>Recent shares could not load. They come back when the connection does.</small>}
      </a></li>
      {items ? items.map(item => <Card key={item.id} item={item} />) : loading && [0, 1, 2].map(index => <LoadingCard key={index} />)}
    </ul>
  </section>
}
