import { useEffect, useState } from 'react'
import { api, post } from './api'
import { COMMUNITY_MODULES } from './modules'
import { NotificationList } from './NotificationList'
import { PublicAnnouncementCard } from './PublicAnnouncement'
import { accountHref } from './member-access'
import { DEVELOPMENT_DISCORD_URL } from '../config/development-discord'
import { SUPPORT_URL } from '../config/support'
import type { AnnouncementVisibility } from './notification-contract'

type Sent = { id: string; slug: string; title: string; body: string; url: string | null; module_id: string | null; created_at: string; reads: number; audience: number; visibility: AnnouncementVisibility
  /** Public card totals from every viewer, signed in or not, since `counts_started`. */
  shown: number; opened: number; dismissed: number; counts_started: string | null }
const errorText = (error: unknown) => error instanceof Error ? error.message : 'The request could not be completed.'
const BODY_LIMIT = 400
/** The key makes a send idempotent; this proposes one from the title and today's date. */
const keyFrom = (title: string) => (title.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48) + '-' + new Date().toISOString().slice(0, 10)).replace(/^-+/, '')
const sentAt = (value: string) => new Date(value.replace(' ', 'T') + 'Z').toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
/** Announcements sent before card totals began show when their totals start. */
const countedFrom = (item: Sent) => item.counts_started && Date.parse(item.created_at.replace(' ', 'T') + 'Z') < Date.parse(item.counts_started) ? new Date(item.counts_started).toLocaleDateString(undefined, { dateStyle: 'medium' }) : ''
/** Where a bell entry leads, in the words the operator would use: the bell opens the link, else the module page, else the library. */
function destination(url: string | null, moduleId: string | null) {
  if (url === SUPPORT_URL) return 'Ko-fi'
  if (url === DEVELOPMENT_DISCORD_URL) return 'the development Discord'
  if (url) return url.replace(/^https:\/\//, '')
  if (moduleId) return (COMMUNITY_MODULES.find(module => module.id === moduleId)?.name ?? moduleId) + ' page'
  return 'Library'
}

/** Admin workspace: choose the audience, send an announcement, change its visibility or remove it. Never mailed. */
export function AnnouncementsPanel() {
  const [items, setItems] = useState<Sent[]>([]), [loading, setLoading] = useState(true), [error, setError] = useState(''), [busy, setBusy] = useState(false), [note, setNote] = useState('')
  const [title, setTitle] = useState(''), [body, setBody] = useState(''), [moduleId, setModuleId] = useState(''), [url, setUrl] = useState(''), [slug, setSlug] = useState(''), [slugEdited, setSlugEdited] = useState(false)
  const [visibility, setVisibility] = useState<AnnouncementVisibility>('signed-in')
  const load = () => api<Sent[]>('/admin/announcements').then(setItems).catch(error => setError(errorText(error))).finally(() => setLoading(false))
  useEffect(() => { void load() }, [])
  async function send(event: React.FormEvent) {
    event.preventDefault()
    if (!window.confirm(`Send this to ${visibility === 'public' ? 'everyone, including signed-out visitors' : 'current signed-in members'}? Its message cannot be edited afterwards.`)) return
    setBusy(true); setError(''); setNote('')
    try {
      await post('/admin/announcements', { slug, title, body, visibility, url: url || undefined, moduleId: moduleId || undefined })
      setTitle(''); setBody(''); setModuleId(''); setUrl(''); setSlug(''); setSlugEdited(false); setNote(visibility === 'public' ? 'Public announcement sent.' : 'Sent to signed-in members’ bells.')
      await load()
    } catch (error) { setError(errorText(error)) } finally { setBusy(false) }
  }
  async function retract(item: Sent) {
    if (!window.confirm(`Remove “${item.title}” from the site?`)) return
    setBusy(true); setError(''); setNote('')
    try { await api('/admin/announcements/' + item.id, { method: 'DELETE' }); await load() } catch (error) { setError(errorText(error)) } finally { setBusy(false) }
  }
  async function changeVisibility(item: Sent, visibility: AnnouncementVisibility) {
    setBusy(true); setError(''); setNote('')
    try {
      await post('/admin/announcements/' + item.id, { visibility }, 'PATCH')
      setNote(visibility === 'public' ? 'Announcement is now public.' : 'Announcement is now visible to signed-in members only.')
      await load()
    } catch (error) { setError(errorText(error)) } finally { setBusy(false) }
  }
  const ready = title.trim().length >= 3 && !!body.trim() && slug.length >= 3
  return <section className="configuration-section announcements-admin">
    <h2>Compose an announcement</h2>
    <p className="service-note">Public announcements appear as a dismissible floating card for everyone, including signed-out visitors. Only the latest announcement is shown; dismissed news stays quiet. Signed-in announcements appear in the bell of verified members who joined before they were sent. Neither is emailed.</p>
    <div className="announcement-compose">
      <form className="community-form announcement-form" onSubmit={event => void send(event)}>
        <label>Visibility<select value={visibility} onChange={event => setVisibility(event.target.value as AnnouncementVisibility)}><option value="public">Public — everyone</option><option value="signed-in">Signed-in users</option></select></label>
        <label>Title<input value={title} maxLength={120} required minLength={3} onChange={event => { setTitle(event.target.value); if (!slugEdited) setSlug(keyFrom(event.target.value)) }} placeholder="Sidechain Compressor is out" /></label>
        <label><span className="announcement-label">Message<small aria-live="polite">{body.length} / {BODY_LIMIT}</small></span><textarea value={body} maxLength={BODY_LIMIT} required rows={4} onChange={event => setBody(event.target.value)} placeholder="One or two plain sentences." /></label>
        <div className="form-two-columns">
          <label>Module page<select value={moduleId} onChange={event => setModuleId(event.target.value)}><option value="">No module</option>{COMMUNITY_MODULES.map(module => <option key={module.id} value={module.id}>{module.name}</option>)}</select></label>
          <label>Link<input value={url} maxLength={200} onChange={event => setUrl(event.target.value)} placeholder="#library, modwerk.app or your Ko-fi page" /></label>
        </div>
        <p className="announcement-hint">Both are optional. A link replaces the module page; without either, the entry opens the library.</p>
        <label>Key<input className="announcement-key" value={slug} maxLength={64} required minLength={3} pattern="[a-z0-9][a-z0-9-]*" onChange={event => { setSlug(event.target.value); setSlugEdited(true) }} /></label>
        <p className="announcement-hint">Proposed from the title and today’s date. Sending the same key twice is refused, so a double click cannot announce twice.</p>
        <div className="announcement-actions"><button type="submit" className="button button-primary" disabled={busy || !ready}>{busy ? 'Working…' : visibility === 'public' ? 'Send public announcement' : 'Send to signed-in users'}</button></div>
      </form>
      <aside className="announcement-preview" aria-label="Preview">
        <p className="announcement-preview-label">{visibility === 'public' ? 'Preview of the public card' : 'Preview in the bell'}</p>
        <div className={visibility === 'public' ? 'announcement-public-preview' : 'announcement-preview-card'} aria-hidden="true" inert>
          {visibility === 'public' ? <PublicAnnouncementCard line={{ kind: 'announcement', text: title.trim() || 'Your title', excerpt: body.trim() || 'Your message appears here.', href: url || COMMUNITY_MODULES.find(module => module.id === moduleId)?.href || '#library', ids: ['preview'], seen: false, created_at: new Date().toISOString(), actor: null, official: true, avatar: null }} signup={accountHref('register')} onDismiss={() => {}} onOpen={() => {}} /> :
          <NotificationList lines={[{ kind: 'announcement', text: title.trim() || 'Your title', excerpt: body.trim() || 'Your message appears here.', href: '#admin/announcements', ids: ['preview'], seen: false, created_at: new Date().toISOString(), actor: null, official: true, avatar: null }]} onOpen={() => {}} />
          }
        </div>
        <p className="announcement-hint">{visibility === 'public' ? 'Visible to everyone' : 'Visible to current signed-in members'} · Opens {destination(url || null, moduleId || null)}</p>
        {visibility === 'public' && url === DEVELOPMENT_DISCORD_URL && <p className="announcement-hint">Signed-out visitors also see Create account. Browsers that already handled a Discord invitation, the former visitor popup or a member’s own invitation, skip this card.</p>}
      </aside>
    </div>
    {error && <p className="file-error" role="alert">{error}</p>}
    {note && <p className="success-note" role="status">{note}</p>}
    <h3 className="announcement-sent-heading">Sent{items.length ? <span className="subtle"> {items.length}</span> : null}</h3>
    <details className="admin-help"><summary>How reads and card totals are counted</summary><p className="announcement-read-note">Card totals count everyone who was shown, opened or dismissed a public card, signed-out visitors included. They identify no one and leave out browsers sending Do Not Track or Global Privacy Control and visitors who objected to counting. Acknowledgements count members who clicked or dismissed the card; bell entries count members who opened them or used “Mark all read.” The audience includes eligible members who have not visited since it was sent; earlier read markers are preserved when visibility changes.</p></details>
    {loading ? <p className="service-note" role="status">Loading announcements…</p> : items.length ? <ul className="announcement-sent">{items.map(item => {
      const share = item.audience ? Math.min(100, Math.round(item.reads / item.audience * 100)) : 0, from = countedFrom(item)
      return <li key={item.id}>
        <div className="announcement-sent-text">
          <strong>{item.title}</strong>
          <p>{item.body}</p>
          <label className="announcement-visibility">Visibility<select aria-label={'Visibility for ' + item.title} value={item.visibility} disabled={busy} onChange={event => void changeVisibility(item, event.target.value as AnnouncementVisibility)}><option value="public">Public — everyone</option><option value="signed-in">Signed-in users</option></select></label>
          <small><time>{sentAt(item.created_at)}</time><span>Opens {destination(item.url, item.module_id)}</span><code title="Key">{item.slug}</code></small>
        </div>
        <div className="announcement-sent-reads">
          {(item.visibility === 'public' || item.shown + item.opened + item.dismissed > 0) && <>
            <dl className="announcement-card-counts" aria-label={'Card totals for ' + item.title + ', everyone including signed-out visitors'}>
              <div><dt>Shown</dt><dd>{item.shown}</dd></div><div><dt>Opened</dt><dd>{item.opened}</dd></div><div><dt>Dismissed</dt><dd>{item.dismissed}</dd></div>
            </dl>
            {from && <small>Totals from {from}</small>}
          </>}
          <span><strong>{item.reads}</strong> of {item.audience} {item.visibility === 'public' ? 'members acknowledged' : 'marked read'}</span>
          <span className="announcement-meter" aria-hidden="true"><span style={{ width: share + '%' }} /></span>
        </div>
        <button type="button" className="button button-quiet announcement-remove" disabled={busy} onClick={() => void retract(item)} aria-label={'Remove ' + item.title}>Remove</button>
      </li>
    })}</ul> : <p className="service-note">Nothing has been announced yet.</p>}
  </section>
}
