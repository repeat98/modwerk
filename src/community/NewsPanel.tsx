import { useEffect, useState } from 'react'
import { api, post } from './api'
import { BETA_INVITATION_PLACEHOLDER, betaInvitationRoute } from '../config/beta-invitation'
import { ForumPostBody } from './ForumPostBody'

type Campaign = { id: string; subject: string; body: string; beta_invitation: number; status: 'draft' | 'sending' | 'sent' | 'cancelled'; created_at: string; scheduled_at: string | null; recipient_count: number; sent: number; failed: number; skipped: number; queued: number }
type Overview = { optIns: number; dailyLimit: number; emailAvailable: boolean; testAvailable: boolean; campaigns: Campaign[] }
const errorText = (error: unknown) => error instanceof Error ? error.message : 'The request could not be completed.'
const when = (value: string) => new Date(value.replace(' ', 'T') + 'Z').toLocaleString()
const STATUS = { draft: 'Draft', sending: 'Queued', sent: 'Sent', cancelled: 'Cancelled' }

/** Admin workspace: write an occasional news mail in markdown, test it on your own address and queue it for members who opted in. */
export function NewsPanel() {
  const [overview, setOverview] = useState<Overview | null>(null), [loading, setLoading] = useState(true), [error, setError] = useState(''), [busy, setBusy] = useState(false), [note, setNote] = useState('')
  const [editing, setEditing] = useState<string | null>(null), [subject, setSubject] = useState(''), [body, setBody] = useState(''), [preview, setPreview] = useState(false), [betaInvitation, setBetaInvitation] = useState(false)
  const load = () => api<Overview>('/admin/news').then(setOverview).catch(error => setError(errorText(error))).finally(() => setLoading(false))
  useEffect(() => { void load() }, [])
  const dirty = subject.trim().length >= 3 && body.trim().length > 0
  async function run(action: () => Promise<unknown>, done = '') {
    setBusy(true); setError(''); setNote('')
    try { await action(); if (done) setNote(done); await load() } catch (error) { setError(errorText(error)) } finally { setBusy(false) }
  }
  /** Saves the composer as a draft, or updates the draft being edited, and returns its id. */
  async function save() {
    if (editing) { await post('/admin/news/' + editing, { subject, body, betaInvitation }, 'PATCH'); return editing }
    const created = await post<{ id: string }>('/admin/news', { subject, body, betaInvitation })
    setEditing(created.id)
    return created.id
  }
  const clear = () => { setEditing(null); setSubject(''); setBody(''); setPreview(false); setBetaInvitation(false) }
  function queue() {
    if (!overview || !window.confirm(`Queue this news mail for the ${overview.optIns} members who opted in? It is sent over the coming hours within the daily budget and cannot be edited once queued.`)) return
    void run(async () => { const id = await save(); await post('/admin/news/' + id + '/queue', {}); clear() }, 'Queued. The hourly sender works through the recipients within the daily budget.')
  }
  return <section className="configuration-section">
    <h2>News mail</h2>
    <p className="service-note">An occasional email to the members who opted in to Modwerk news. Markdown, rendered like a forum post. The sender keeps within {overview?.dailyLimit ?? '…'} messages a day beside account mail, so a campaign to more members is sent over several days. Every message carries a one-click unsubscribe and a link to account settings.</p>
    {overview && <p className="service-note"><strong>{overview.optIns}</strong> {overview.optIns === 1 ? 'member has' : 'members have'} current news consent.{!overview.emailAvailable && ' Email is not connected on this backend, so nothing can be sent yet.'}</p>}
    <form className="admin-form" onSubmit={event => { event.preventDefault(); void run(save, editing ? 'Draft updated.' : 'Draft saved.') }}>
      <label>Subject<input value={subject} maxLength={150} required minLength={3} onChange={event => setSubject(event.target.value)} placeholder="What landed on Modwerk in October" /></label>
      <label>Message (markdown){preview
        ? <div className="news-preview"><ForumPostBody body={(betaInvitation ? body.replaceAll(BETA_INVITATION_PLACEHOLDER, 'https://modwerk.app/#' + betaInvitationRoute(editing ?? '0'.repeat(32))) : body) || '_Nothing to preview yet._'} /></div>
        : <textarea value={body} maxLength={20000} required rows={14} onChange={event => setBody(event.target.value)} placeholder={'Hi,\n\nHere’s what landed on Modwerk this month.\n\n## New and updated modules\n\n- [Mini Verb](https://modwerk.app/#module/miniverb) — new'} />}</label>
      {betaInvitation && <p className="service-note">Beta invitation · a styled Join the beta button opens the site’s risk reminder. Each recipient must accept before getting access, within the 50-person pool. Keep the {BETA_INVITATION_PLACEHOLDER} link. Saving this draft sends nothing.</p>}
      <div className="review-actions">
        <button type="button" className="button button-quiet" disabled={busy} onClick={() => void run(async () => { const suggestion = await api<{ subject: string; body: string }>('/admin/news/suggest'); setSubject(suggestion.subject); setBody(suggestion.body); setBetaInvitation(false); setPreview(false) })}>Suggest this week’s digest</button>
        <button type="button" className="button button-quiet" disabled={busy} onClick={() => void run(async () => { const suggestion = await api<{ subject: string; body: string }>('/admin/news/beta-invitation'); setEditing(null); setSubject(suggestion.subject); setBody(suggestion.body); setBetaInvitation(true); setPreview(false) })}>Prepare beta invitation</button>
        <button type="button" className="button button-quiet" disabled={busy} onClick={() => setPreview(value => !value)}>{preview ? 'Edit' : 'Preview'}</button>
        <button type="submit" className="button button-quiet" disabled={busy || !dirty}>{editing ? 'Update draft' : 'Save draft'}</button>
        <button type="button" className="button button-quiet" disabled={busy || !dirty || !overview?.testAvailable} title={overview && !overview.testAvailable ? 'Sign in with your administrator account to receive a test message.' : undefined} onClick={() => void run(async () => { const id = await save(); await post('/admin/news/' + id + '/test', {}) }, 'Test message sent to your address.')}>Send a test to my address</button>
        <button type="button" className="button button-primary" disabled={busy || !dirty || !overview?.emailAvailable || !overview.optIns} onClick={queue}>Queue for sending</button>
        {(editing || subject || body) && <button type="button" className="text-button" disabled={busy} onClick={clear}>Clear</button>}
      </div>
    </form>
    {error && <p className="file-error" role="alert">{error}</p>}
    {note && <p className="success-note" role="status">{note}</p>}
    <h3>Campaigns</h3>
    {loading ? <p className="service-note" role="status">Loading campaigns…</p> : overview?.campaigns.length ? <ul className="notification-list">{overview.campaigns.map(item => <li key={item.id}>
      <strong>{item.subject}</strong>{!!item.beta_invitation && <span className="pill">Beta invitation</span>} <span className="pill">{STATUS[item.status]}</span>
      <small>{when(item.created_at)}{item.status === 'draft' ? '' : ` · ${item.recipient_count} recipients · ${item.sent} sent · ${item.queued} queued · ${item.failed} failed · ${item.skipped} skipped`}</small>{' '}
      {item.status === 'draft' && <><button type="button" className="text-button" disabled={busy} onClick={() => { setEditing(item.id); setSubject(item.subject); setBody(item.body); setBetaInvitation(!!item.beta_invitation); setPreview(false); window.scrollTo({ top: 0 }) }}>Edit</button>{' '}
        <button type="button" className="text-button" disabled={busy} onClick={() => { if (window.confirm('Discard this draft?')) void run(() => api('/admin/news/' + item.id, { method: 'DELETE' })) }}>Discard</button></>}
      {item.status === 'sending' && <button type="button" className="text-button" disabled={busy} onClick={() => { if (window.confirm('Cancel the remaining deliveries? Messages already sent cannot be recalled.')) void run(() => post('/admin/news/' + item.id + '/cancel', {}), 'Cancelled.') }}>Cancel</button>}
      {(item.status === 'sent' || item.status === 'cancelled') && <button type="button" className="text-button" disabled={busy} onClick={() => { setEditing(null); setSubject(item.subject); setBody(item.body); setBetaInvitation(!!item.beta_invitation); setPreview(false); window.scrollTo({ top: 0 }) }}>Copy into composer</button>}
    </li>)}</ul> : <p className="service-note">No news mail has been written yet.</p>}
  </section>
}
