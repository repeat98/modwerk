import { useEffect, useState } from 'react'
import { FLASHING_RISKS, INDEPENDENCE_NOTICE } from '../firmware-notices'
import { BETA_RISKS_VERSION, BETA_TESTER_LIMIT, betaInvitationRoute } from '../config/beta-invitation'
import { DEVELOPMENT_DISCORD_URL } from '../config/development-discord'
import { api, post } from './api'
import { useCommunity } from './context'
import { accountHref } from './member-access'

// The extra link has no limit, so it reports null and the page drops the pool sentence.
type Invitation = { status: 'pending' | 'active' | 'full'; testers: number; limit: number | null; risksVersion: string }
export function BetaInvitationPage({ campaign }: { campaign: string }) {
  const { session, loading, refresh } = useCommunity()
  const [invitation, setInvitation] = useState<Invitation | null>(null), [error, setError] = useState(''), [accepted, setAccepted] = useState(false), [busy, setBusy] = useState(false)
  const verified = !!(session.user?.verified && session.user.username)
  const valid = /^(public|[a-f0-9]{32})$/.test(campaign)
  const load = () => api<Invitation>('/auth/beta-invitations/' + campaign).then(setInvitation)
  useEffect(() => {
    if (!valid || !verified) return
    const controller = new AbortController()
    void api<Invitation>('/auth/beta-invitations/' + campaign, { signal: controller.signal }).then(value => { if (!controller.signal.aborted) setInvitation(value) }).catch(failure => { if (!controller.signal.aborted) setError(failure.message) })
    return () => controller.abort()
  }, [campaign, valid, verified, session.user?.id])
  async function join() {
    if (!accepted || busy || !invitation || invitation.status !== 'pending') return
    setBusy(true); setError('')
    try {
      const result = await post<Invitation>('/auth/beta-invitations/' + campaign, { acceptRisks: true, risksVersion: invitation.risksVersion })
      setInvitation(result)
      await refresh()
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Beta access could not be granted. Please try again.')
      await load().catch(() => {})
    } finally { setBusy(false) }
  }
  const discordInvitation = <div className="beta-invitation-discord"><h2>Join the beta testers on Discord</h2><p>Join our development Discord to ask questions, share feedback and help us find bugs.</p><a className="button button-primary" href={DEVELOPMENT_DISCORD_URL} target="_blank" rel="noreferrer" onClick={() => { if (invitation?.status === 'active') void post('/auth/beta-discord-invite', {}).catch(() => {}) }}>Join Discord<span className="sr-only"> (opens in a new tab)</span></a></div>
  return <section className="beta-invitation-page">
    <span className="pill">Modwerk beta</span><h1>{invitation?.status === 'active' ? 'You have beta access' : 'Join the Modwerk beta'}</h1>
    {invitation?.status === 'active' ? <>
      <p role="status">Your account can now use beta features. You’ll see a Beta badge beside Modwerk.</p>
      {discordInvitation}
      <a className="text-button" href="#octatrack/setup">Set up your Octatrack</a>
    </> : <>
      <p>Try early features, including Octatrack USB loading and beta modules. Some features need an Octatrack and a computer.</p>
      {invitation?.limit !== null && <p>The tester pool is limited to <strong>{BETA_TESTER_LIMIT} people</strong>. Places are first come, first served when you accept.{invitation && ` ${invitation.testers} of ${invitation.limit} places are currently taken.`}</p>}
      <div className="beta-invitation-risks"><h2>Before you join</h2><p>Beta features are experimental. Expect bugs and unfinished behavior.</p><p>{FLASHING_RISKS}</p><p>Back up your projects and samples before trying custom firmware. {INDEPENDENCE_NOTICE}</p></div>
      {valid && discordInvitation}
      <p>Joining the beta does not enable diagnostics or change your email preferences.</p>
      {loading ? <p role="status">Checking your account…</p> : !valid ? <p className="file-error" role="alert">This beta invitation is unavailable.</p> : !session.user ? <div className="dialog-actions"><a className="button button-primary" href={accountHref('login', betaInvitationRoute(campaign))}>Sign in to continue</a><a className="button button-quiet" href={accountHref('register', betaInvitationRoute(campaign))}>Create account</a></div> : !verified ? <p>Verify your email and complete your profile in <a className="text-button" href="#account">Account</a> before joining.</p> : invitation?.status === 'full' ? <p role="status">All 50 beta places are taken. Thanks for your interest — the public features are still available.</p> : invitation?.status === 'pending' && invitation.risksVersion === BETA_RISKS_VERSION ? <form onSubmit={event => { event.preventDefault(); void join() }}>
        <label className="beta-invitation-accept"><input type="checkbox" required checked={accepted} disabled={busy} onChange={event => setAccepted(event.target.checked)} /><span>I understand these risks and want to join the experimental beta.</span></label>
        <button type="submit" className="button button-primary" disabled={!accepted || busy}>{busy ? 'Joining…' : 'Accept risks and join beta'}</button>
      </form> : invitation?.status === 'pending' ? <p className="file-error" role="alert">The risk reminder has changed. Reload this page before joining.</p> : !error && <p role="status">Checking your invitation…</p>}
    </>}
    {error && <p className="file-error" role="alert">{error}</p>}
  </section>
}
