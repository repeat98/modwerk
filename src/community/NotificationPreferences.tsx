import { PushSettings } from './PushSettings'
import { BackLink } from '../components/BackLink'
import { useEffect, useRef, useState } from 'react'
import { api, post } from './api'
import type { NotificationPreferences as Preferences } from './notification-contract'

const TOPICS: [keyof Pick<Preferences, 'replies' | 'likes' | 'modules' | 'bugs' | 'updates' | 'messages'>, string][] = [
  ['replies', 'Replies in threads you follow and @mentions'],
  ['likes', 'Likes on your posts'],
  ['modules', 'Comments, ratings and likes on modules you maintain'],
  ['bugs', 'Bug reports for modules you maintain, and replies and status changes for your own reports'],
  ['updates', 'New releases of modules you follow'],
  ['messages', 'Direct messages from other members'],
]
export function NotificationPreferences({ focus = false }: { focus?: boolean }) {
  const [value, setValue] = useState<Preferences | null>(null), [busy, setBusy] = useState(false), [message, setMessage] = useState(''), [error, setError] = useState('')
  const heading = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    let cancelled = false
    void api<Preferences>('/notifications/preferences').then(next => { if (!cancelled) setValue(next) }).catch(error => { if (!cancelled) setError(error.message) })
    return () => { cancelled = true }
  }, [])
  useEffect(() => { if (focus && value) { heading.current?.scrollIntoView({ block: 'start' }); heading.current?.focus() } }, [focus, value])
  async function change(update: Partial<Preferences>) {
    setBusy(true); setError(''); setMessage('')
    try { const next = await post<Preferences>('/notifications/preferences', update, 'PATCH'); setValue(next); setMessage(update.emailEnabled === false ? 'Activity email turned off.' : update.emailEnabled ? 'Activity email turned on.' : 'Email settings saved.') }
    catch (error) { setError(error instanceof Error ? error.message : 'Unable to save your email settings.') }
    finally { setBusy(false) }
  }
  return <><PushSettings/><section className="configuration-section" id="notification-settings"><h2 ref={heading} tabIndex={-1}>Activity email</h2>
    <p className="service-note">The bell shows everything. Email sends a digest of what you have not read yet, at most once per chosen interval. Every email has an unsubscribe link.</p>
    {value && <>
      <label className="risk-accept"><input type="checkbox" checked={value.emailEnabled} disabled={busy} onChange={event => void change({ emailEnabled: event.target.checked })} />Email me about activity I have not seen</label>
      <fieldset className="notification-topics" disabled={busy || !value.emailEnabled}><legend className="sr-only">Include</legend>
        {TOPICS.map(([key, label]) => <label className="risk-accept" key={key}><input type="checkbox" checked={value[key]} onChange={event => void change({ [key]: event.target.checked })} />{label}</label>)}
        <label className="notification-frequency">How often<select value={value.frequency} onChange={event => void change({ frequency: event.target.value as Preferences['frequency'] })}><option value="hours">At most every 6 hours</option><option value="daily">At most once a day</option></select></label>
      </fieldset>
      {!value.emailAvailable && <p className="service-note">Email delivery is not connected yet. Your choices are saved for when it is.</p>}
    </>}
    <p className="service-note">Verification, recovery and optional news emails are separate.</p>
    {message && <p role="status">{message}</p>}{error && <p className="file-error" role="alert">{error}</p>}
  </section></>
}

/** Opened from the link in an activity email; works signed out because the signed token identifies the account. */
export function Unsubscribe({ token }: { token: string }) {
  const [state, setState] = useState<'idle' | 'busy' | 'done'>('idle'), [error, setError] = useState('')
  async function confirm() {
    setState('busy'); setError('')
    try { await post('/notifications/unsubscribe', { token }); setState('done') } catch (error) { setError(error instanceof Error ? error.message : 'Unable to unsubscribe.'); setState('idle') }
  }
  return <div className="community-page account-page"><BackLink href="#account">Your account</BackLink><div className="page-heading"><div><p className="page-kicker">MODWERK / ACCOUNT</p><h1>Activity email</h1><p>Stop digest emails about replies, mentions, likes and module activity.</p></div></div>
    <section className="configuration-section">{state === 'done' ? <><p className="success-note" role="status">You're unsubscribed from activity email. The bell keeps working when you sign in.</p><a className="button button-quiet" href="#account/notifications">Email settings</a></> : <><p>Confirm to turn off activity email for this account. You can turn it back on in your account at any time.</p><button className="button button-primary" disabled={state === 'busy'} onClick={() => void confirm()}>{state === 'busy' ? 'Please wait…' : 'Unsubscribe'}</button></>}{error && <p className="file-error" role="alert">{error}</p>}</section>
  </div>
}
