import { useEffect, useRef, useState } from 'react'
import { api } from './api'
import { apiUrl } from '../hosting'
import { useCommunity } from './context'
import { Icon } from '../components/Icon'
import { ForumAuthorName, ForumAvatar, ForumMachineBadge } from './ForumIdentity'
import { ForumTime } from './ForumTime'
import type { ForumAttachment, ForumShowcaseItem } from './forum-contract'

// One clip plays at a time across the strip.
let playing: HTMLAudioElement | null = null
/** Decorative bar heights in percent, fixed per file so a clip always draws the same shape. */
function waveform(seed: string, count = 32) {
  let hash = 2166136261
  for (const character of seed) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619)
  return Array.from({ length: count }, (_, index) => {
    hash = Math.imul(hash ^ (hash >>> 15), 2246822507) >>> 0
    return Math.round(100 * (.2 + .8 * Math.sin(Math.PI * (index + .5) / count) * (.35 + .65 * (hash % 1000) / 1000)))
  })
}
function Sound({ item, title, cover }: { item: ForumAttachment; title: string; cover: boolean }) {
  const audio = useRef<HTMLAudioElement>(null), [state, setState] = useState({ playing: false, progress: 0 })
  useEffect(() => { const element = audio.current; return () => { if (playing === element) playing = null } }, [])
  function toggle() {
    const element = audio.current
    if (!element) return
    if (!element.paused) { element.pause(); return }
    if (playing && playing !== element) playing.pause()
    playing = element
    void element.play().catch(() => setState(current => ({ ...current, playing: false })))
  }
  const bars = waveform(item.id)
  return <div className="forum-showcase-sound" data-cover={cover || undefined}>
    {!cover && <span className="forum-showcase-wave" aria-hidden="true">{bars.map((height, index) => <span key={index} style={{ height: height + '%' }} data-played={index / bars.length < state.progress || undefined} />)}</span>}
    <button type="button" className="forum-showcase-play" aria-pressed={state.playing} aria-label={'Play sound clip from “' + title + '”' + (item.caption ? ': ' + item.caption : '')} onClick={toggle}><Icon name={state.playing ? 'pause' : 'play'} size={18} /></button>
    {cover && <span className="forum-showcase-progress" aria-hidden="true"><span style={{ width: state.progress * 100 + '%' }} /></span>}
    <audio ref={audio} preload="none" src={apiUrl('/forum/media/' + item.id)}
      onPlay={() => setState(current => ({ ...current, playing: true }))} onPause={() => setState(current => ({ ...current, playing: false }))}
      onTimeUpdate={event => { const { currentTime, duration } = event.currentTarget; setState(current => ({ ...current, progress: duration ? currentTime / duration : 0 })) }}
      onEnded={() => setState({ playing: false, progress: 0 })} />
  </div>
}
function Card({ item }: { item: ForumShowcaseItem }) {
  const image = item.attachments.find(media => media.kind === 'image'), sound = item.attachments.find(media => media.kind === 'audio')
  const href = '#forum/thread/' + item.thread_id + '?post=' + item.id + '&page=' + item.page, more = item.attachments.length - (image ? 1 : 0) - (sound ? 1 : 0)
  const caption = (image?.caption || sound?.caption || '').trim()
  return <li className="forum-showcase-card" data-kind={image ? 'image' : 'audio'} data-category={item.category}>
    <div className="forum-showcase-cover">
      {image && <img src={apiUrl('/forum/media/' + image.id)} alt={image.caption || 'Image from “' + item.title + '”'} loading="lazy" decoding="async" />}
      {sound && <Sound item={sound} title={item.title} cover={!!image} />}
      <span className="forum-showcase-chips"><ForumMachineBadge machine={item.machine} />{more > 0 && <span className="forum-showcase-more">+{more} more</span>}</span>
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
