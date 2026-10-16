import { useEffect, useState } from 'react'
import { api, post } from './api'
import { betaInvitationRoute } from '../config/beta-invitation'

type Pool = { testers: number; limit: number; publicEnabled: boolean; extraToken: string | null }
type BetaTester = { username: string; displayName: string }
export function BetaTestersAdmin() {
  const [members, setMembers] = useState<BetaTester[]>([]), [username, setUsername] = useState(''), [reason, setReason] = useState('')
  const [pool, setPool] = useState<Pool | null>(null)
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [saved, setSaved] = useState('')
  useEffect(() => { let cancelled = false; void api<Pool>('/admin/forum/beta-invitation').then(value => { if (!cancelled) setPool(value) }).catch(error => { if (!cancelled) setError(error.message) }); void api<BetaTester[]>('/admin/forum/beta-testers').then(value => { if (!cancelled) setMembers(value) }).catch(error => { if (!cancelled) setError(error.message) }); return () => { cancelled = true } }, [])
  async function save(name: string, betaTester: boolean) {
    setBusy(true); setError(''); setSaved('')
    try {
      await post('/admin/forum/beta-testers/' + encodeURIComponent(name), { betaTester, reason }, 'PUT')
      setMembers(await api<BetaTester[]>('/admin/forum/beta-testers'))
      setPool(await api<Pool>('/admin/forum/beta-invitation'))
      setSaved(`@${name} ${betaTester ? 'now has' : 'no longer has'} beta tester access.`); setUsername(''); setReason('')
    } catch (error) { setError(error instanceof Error ? error.message : 'Unable to change beta tester access.') }
    finally { setBusy(false) }
  }
  async function invitation(body: object, failure: string) {
    setBusy(true); setError('')
    try { setPool(await post<Pool>('/admin/forum/beta-invitation', body, 'PUT')) } catch (error) { setError(error instanceof Error ? error.message : failure) } finally { setBusy(false) }
  }
  return <section className="configuration-section"><h2>Beta testers</h2><p className="service-note">Beta testers can browse and build modules marked Beta. This class can accompany any member role and grants no administrator or developer permissions.</p>
    {pool && <><p className="service-note">{pool.testers} of {pool.limit} places taken. Suspended accounts retain their place until access is removed. Public joining is {pool.publicEnabled ? 'open' : 'closed'}.</p><button type="button" className="button button-quiet" disabled={busy} onClick={() => void invitation({ publicEnabled: !pool.publicEnabled }, 'Unable to change public joining.')}>{pool.publicEnabled ? 'Close public beta invitation' : 'Open public beta invitation'}</button>
      <p className="service-note">The extra link lets anyone who has it join beyond the {pool.limit} places. A new link stops the old one.</p>
      {pool.extraToken && <input readOnly aria-label="Extra beta invitation link" value={location.origin + '/#' + betaInvitationRoute(pool.extraToken)} onFocus={event => event.target.select()} />}
      <button type="button" className="button button-quiet" disabled={busy} onClick={() => void invitation({ extraLink: true }, 'Unable to create the extra link.')}>{pool.extraToken ? 'New extra beta link' : 'Create extra beta link'}</button>
      {pool.extraToken && <button type="button" className="button button-quiet" disabled={busy} onClick={() => void invitation({ extraLink: false }, 'Unable to close the extra link.')}>Close extra beta link</button>}</>}
    {members.map(member => <article className="inbox-issue" key={member.username}><div className="section-title"><strong>{member.displayName} · <a href={'#forum/profile/' + member.username}>@{member.username}</a></strong><span className="pill">Beta tester</span></div><button className="text-button" disabled={busy || !reason.trim()} title={reason.trim() ? undefined : 'Enter a reason below first'} onClick={() => void save(member.username, false)}>Remove beta tester access</button></article>)}
    <form className="community-form" onSubmit={event => { event.preventDefault(); void save(username.trim().replace(/^@/, '').toLowerCase(), true) }}><label>Username<input value={username} onChange={event => setUsername(event.target.value)} required maxLength={25} placeholder="@username" autoComplete="off" /></label><label>Reason<input value={reason} onChange={event => setReason(event.target.value)} required maxLength={1000} /></label><button className="button button-primary" disabled={busy || !username.trim() || !reason.trim()}>{busy ? 'Saving…' : 'Add beta tester'}</button></form>
    {saved && <p className="service-note" role="status">{saved}</p>}{error && <p className="file-error" role="alert">{error}</p>}
  </section>
}
