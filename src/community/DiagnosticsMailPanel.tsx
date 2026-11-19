import { useEffect, useState } from 'react'
import { api, apiFetch, post } from './api'
import { sendAll, sendAllNote } from './diagnostics-mail-send-all'

type Mail = { id: string; username: string; kind: 'problem' | 'fixed'; cause: string; subject: string; body: string; status: 'draft' | 'sending' | 'sent' | 'discarded' | 'failed'; created_at: string; sent_at: string | null; eligible: number }
type Overview = { emailAvailable: boolean; canSend: boolean; mails: Mail[] }
const errorText = (error: unknown) => error instanceof Error ? error.message : 'The request could not be completed.'
const when = (value: string) => new Date(value.replace(' ', 'T') + 'Z').toLocaleString()
const KIND = { problem: 'Problem', fixed: 'Fixed' }

/** Admin workspace: the diagnostics pass drafts a personal email for a member whose shared diagnostics show a problem, or
 * whose problem is fixed (server/diagnostics-mail.ts); the owner reads each one here and sends it, or discards it. */
export function DiagnosticsMailPanel() {
  const [overview, setOverview] = useState<Overview | null>(null), [error, setError] = useState(''), [note, setNote] = useState(''), [busy, setBusy] = useState(false)
  const load = () => api<Overview>('/admin/diagnostics-mail').then(setOverview).catch(error => setError(errorText(error)))
  useEffect(() => { void load() }, [])
  async function run(action: () => Promise<unknown>, done: string) {
    setBusy(true); setError(''); setNote('')
    try { await action(); setNote(done); await load() } catch (error) { setError(errorText(error)) } finally { setBusy(false) }
  }
  const send = (mail: Mail) => {
    if (!window.confirm(`Send “${mail.subject}” to @${mail.username} now?`)) return
    void run(() => post('/admin/diagnostics-mail/' + mail.id + '/send', {}), 'Sent.')
  }
  const discard = (mail: Mail) => void run(() => post('/admin/diagnostics-mail/' + mail.id, {}, 'DELETE'), 'Discarded.')
  const sendOne = async (id: string) => {
    const result = await apiFetch('/admin/diagnostics-mail/' + id + '/send', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
    return { status: result.status, error: ((await result.json().catch(() => ({}))) as { error?: string }).error }
  }
  const [progress, setProgress] = useState('')
  async function sendEvery(list: Mail[]) {
    if (!window.confirm(`Send all ${list.length} drafts that can still be sent? Each goes to its member now.`)) return
    setBusy(true); setError(''); setNote('')
    try {
      const result = await sendAll(list.map(mail => mail.id), sendOne, (done, total) => setProgress(`Sending ${done} of ${total}…`))
      ;(result.stopped ? setError : setNote)(sendAllNote(result))
      await load()
    } finally { setProgress(''); setBusy(false) }
  }
  const drafts = overview?.mails.filter(mail => mail.status === 'draft') ?? [], done = overview?.mails.filter(mail => mail.status !== 'draft') ?? []
  return <section className="configuration-section">
    <h2>Diagnostics emails</h2>
    <p className="service-note">Personal emails to members whose shared diagnostics show a problem, and when it is fixed. The diagnostics pass drafts them; nothing goes out until you send it here. Each one carries a link that stops these emails.</p>
    {overview && !overview.emailAvailable && <p className="service-note">Email is not connected on this backend, so nothing can be sent yet.</p>}
    {overview && !overview.canSend && <p className="service-note">Signed in with the administrator key: you can read drafts here, but sending needs your administrator account.</p>}
    {note && <p className="success-note" role="status">{note}</p>}
    {error && <p className="file-error" role="alert">{error}</p>}
    {overview && !drafts.length && <p>No drafts.</p>}
    {drafts.filter(mail => mail.eligible).length > 1 && <div className="button-row">
      <button className="button button-primary" disabled={busy || !overview?.canSend || !overview.emailAvailable} onClick={() => void sendEvery(drafts.filter(mail => mail.eligible))}>Send all {drafts.filter(mail => mail.eligible).length} drafts</button>
      {progress && <span className="service-note" role="status">{progress}</span>}
    </div>}
    {drafts.map(mail => <article key={mail.id} className="admin-card">
      <p className="service-note"><strong>@{mail.username}</strong> · {KIND[mail.kind]}{mail.cause && ' · ' + mail.cause} · drafted {when(mail.created_at)}{!mail.eligible && ' · can no longer be sent: they stopped sharing diagnostics or these emails'}</p>
      <h3>{mail.subject}</h3>
      <p style={{ whiteSpace: 'pre-wrap' }}>{mail.body}</p>
      <div className="button-row">
        <button className="button button-primary" disabled={busy || !overview?.canSend || !overview.emailAvailable || !mail.eligible} onClick={() => send(mail)}>Send</button>
        <button className="button button-quiet" disabled={busy} onClick={() => discard(mail)}>Discard</button>
      </div>
    </article>)}
    {!!done.length && <details><summary>Sent and discarded ({done.length})</summary><ul>{done.map(mail => <li key={mail.id}>@{mail.username} · {KIND[mail.kind]} · {mail.subject} · {mail.status}{mail.sent_at ? ' ' + when(mail.sent_at) : ''}</li>)}</ul></details>}
  </section>
}
