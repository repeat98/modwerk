import { useEffect, useState } from 'react'
import { api } from './api'
import { apiUrl } from '../hosting'
import { useCommunity } from './context'
import { Icon } from '../components/Icon'
import { AudioPlayer } from '../components/AudioPlayer'
import { ForumAuthorName, ForumAvatar, ForumMachineBadge } from './ForumIdentity'
import { ForumTime } from './ForumTime'
import type { ForumShowcaseItem } from './forum-contract'
import { threadHref } from '../routing'

function Card({ item }: { item: ForumShowcaseItem }) {
  const image = item.attachments.find(media => media.kind === 'image'), sound = item.attachments.find(media => media.kind === 'audio')
  const href = threadHref(item.thread_id, item.title, '?post=' + item.id + '&page=' + item.page), more = item.attachments.length - (image ? 1 : 0) - (sound ? 1 : 0)
  const caption = (image?.caption || sound?.caption || '').trim()
  return <li className="forum-showcase-card" data-kind={image ? 'image' : 'audio'} data-category={item.category}>
    <div className="forum-showcase-cover">
      {image && <img src={apiUrl('/forum/media/' + image.id)} alt={image.caption || 'Image from “' + item.title + '”'} loading="lazy" decoding="async" />}
      {sound && <div className="forum-showcase-sound" data-cover={!!image || undefined}><AudioPlayer src={apiUrl('/forum/media/' + sound.id)} label={'sound clip from “' + item.title + '”' + (sound.caption ? ': ' + sound.caption : '')} variant="card"/></div>}
      <span className="forum-showcase-chips"><ForumMachineBadge machine={item.machine} />{more > 0 && <span className="forum-showcase-more">+{more} more</span>}{sound && <span className="forum-showcase-audio-label" aria-hidden="true"><Icon name="wave" size={12}/>Audio</span>}</span>
    </div>
    <div className="forum-showcase-copy">
      <h3><a className="forum-showcase-title" href={href}>{item.title}</a></h3>
      {caption && <p className="forum-showcase-caption">{caption}</p>}
      <div className="forum-showcase-meta"><ForumAvatar username={item.username} official={item.official} avatar={item.avatar} /><ForumAuthorName username={item.username} official={item.official} /><ForumTime value={item.created_at} relative /></div>
    </div>
  </li>
}

/** The newest images and sound clips, with an invitation to add one: a sideways strip on the front page, a wrapping gallery on the Showcase topic. */
export function ForumShowcase({ machine, category, shareHref, layout = 'strip' }: { machine?: string; category?: string; shareHref: string; layout?: 'strip' | 'grid' }) {
  const { session } = useCommunity(), [items, setItems] = useState<ForumShowcaseItem[] | null>(null), [failed, setFailed] = useState(false)
  const query = new URLSearchParams({ ...(machine ? { machine } : {}), ...(category ? { category } : {}) }).toString()
  useEffect(() => {
    let cancelled = false
    void api<ForumShowcaseItem[]>('/forum/showcase' + (query ? '?' + query : '')).then(value => { if (!cancelled) setItems(value) }).catch(() => { if (!cancelled) setFailed(true) })
    return () => { cancelled = true }
  }, [query])
  // Without media storage nobody can share here, and on a failed load the feed below still works.
  if (!session.forumMedia || failed) return null
  return <section className="forum-showcase" data-layout={layout} aria-labelledby="forum-showcase-title" aria-busy={!items}>
    <div className="forum-list-heading"><h2 id="forum-showcase-title">{layout === 'grid' ? 'Latest shares' : 'Fresh from the community'}</h2>{layout === 'strip' && <a className="text-button" href={'#forum?category=showcase' + (machine ? '&machine=' + machine : '')}>Browse the Showcase<Icon name="arrow" size={13} /></a>}</div>
    <ul className="forum-showcase-strip" data-empty={items?.length === 0 || undefined}>
      {items ? items.map(item => <Card key={item.id} item={item} />) : [0, 1, 2].map(index => <li key={index} className="forum-showcase-card forum-showcase-loading" aria-hidden="true"><div className="forum-showcase-cover" /><div className="forum-showcase-copy"><span /><span /></div></li>)}
      <li className="forum-showcase-invite"><a href={shareHref}>
        <span className="forum-showcase-invite-icon"><Icon name="plus" size={20} /></span>
        <strong>{items?.length === 0 ? 'Be the first to share' : 'Share yours'}</strong>
        <span>A jam, a sound you made with a module, or a photo of your setup.</span>
      </a></li>
    </ul>
  </section>
}
