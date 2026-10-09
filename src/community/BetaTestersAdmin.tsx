import { useEffect, useState } from 'react'
import { api, post } from './api'

type BetaTester = { username: string; displayName: string }
export function BetaTestersAdmin() {
  const [members, setMembers] = useState<BetaTester[]>([]), [username, setUsername] = useState(''), [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [saved, setSaved] = useState('')
  useEffect(() => { let cancelled = false; void api<BetaTester[]>('/admin/forum/beta-testers').then(value => { if (!cancelled) setMembers(value) }).catch(error => { if (!cancelled) setError(error.message) }); return () => { cancelled = true } }, [])
  async function save(name: string, betaTester: boolean) {
    setBusy(true); setError(''); setSaved('')
    try {
      await post('/admin/forum/beta-testers/' + encodeURIComponent(name), { betaTester, reason }, 'PUT')
      setMembers(await api<BetaTester[]>('/admin/forum/beta-testers'))
      setSaved(`@${name} ${betaTester ? 'now has' : 'no longer has'} beta tester access.`); setUsername(''); setReason('')
    } catch (error) { setError(error instanceof Error ? error.message : 'Unable to change beta tester access.') }
    finally { setBusy(false) }
  }
  return <section className="configuration-section"><h2>Beta testers</h2><p className="service-note">Beta testers can browse and build modules marked Beta. This class can accompany any member role and grants no administrator or developer permissions.</p>
    {members.map(member => <article className="inbox-issue" key={member.username}><div className="section-title"><strong>{member.displayName} · <a href={'#forum/profile/' + member.username}>@{member.username}</a></strong><span className="pill">Beta tester</span></div><button className="text-button" disabled={busy || !reason.trim()} title={reason.trim() ? undefined : 'Enter a reason below first'} onClick={() => void save(member.username, false)}>Remove beta tester access</button></article>)}
    <form className="community-form" onSubmit={event => { event.preventDefault(); void save(username.trim().replace(/^@/, '').toLowerCase(), true) }}><label>Username<input value={username} onChange={event => setUsername(event.target.value)} required maxLength={25} placeholder="@username" autoComplete="off" /></label><label>Reason<input value={reason} onChange={event => setReason(event.target.value)} required maxLength={1000} /></label><button className="button button-primary" disabled={busy || !username.trim() || !reason.trim()}>{busy ? 'Saving…' : 'Add beta tester'}</button></form>
    {saved && <p className="service-note" role="status">{saved}</p>}{error && <p className="file-error" role="alert">{error}</p>}
  </section>
}
