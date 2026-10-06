import { useEffect, useState } from 'react'
import { api, post } from './api'
import { useCommunity } from './context'
import { AvatarPicker } from './AvatarPicker'
type Profile = {username: string; displayName: string; bio: string; email: string; passwordRequired: boolean; freshLogin: boolean; methods: string[]}
export function AccountSettings({section='profile'}:{section?:'profile'|'security'}) {
  const { refresh, refreshDeveloper } = useCommunity(), [profile, setProfile] = useState<Profile | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState(''), [message, setMessage] = useState(''), [deleting, setDeleting] = useState(false)
  useEffect(() => { let cancelled = false; void api<Profile>('/auth/profile').then(value => { if (!cancelled) setProfile(value) }).catch(error => { if (!cancelled) setError(error.message) }); return () => { cancelled = true } }, [])
  async function save(form: HTMLFormElement) {
    setBusy(true); setError(''); setMessage('')
    try { await post('/auth/profile', Object.fromEntries(new FormData(form)), 'PATCH'); setProfile(await api<Profile>('/auth/profile')); await refresh(); setMessage('Profile updated.') } catch(error) { setError(error instanceof Error ? error.message : 'Unable to save your profile.') } finally { setBusy(false) }
  }
  async function remove(form: HTMLFormElement) {
    setBusy(true); setError('')
    try { await post('/auth/account', Object.fromEntries(new FormData(form)), 'DELETE'); await refresh(); await refreshDeveloper(); window.location.assign('#account/login?deleted=1') } catch(error) { setError(error instanceof Error ? error.message : 'Unable to delete your account.') } finally { setBusy(false) }
  }
  return <>
    {section==='profile'&&<section className="configuration-section account-profile"><h2>Edit your profile</h2><p className="service-note">Your username, display name, picture and bio are visible to other members.</p><AvatarPicker/>{profile ? <form className="community-form" onSubmit={event => { event.preventDefault(); void save(event.currentTarget) }}><div className="account-profile-fields"><label>Public username<input name="username" defaultValue={profile.username} required minLength={3} maxLength={24} pattern="[A-Za-z0-9_]+" autoComplete="username" spellCheck={false}/><small>3–24 letters, numbers or underscores.</small></label><label>Display name<input name="displayName" defaultValue={profile.displayName} required maxLength={60} autoComplete="nickname"/></label></div><label>About you<textarea name="bio" defaultValue={profile.bio} rows={3} maxLength={500}/><small>Optional. Up to 500 characters.</small></label><p className="service-note">Private email: {profile.email}<br/>Sign-in methods: {profile.methods.map(method => method === 'credential' ? 'Email and password' : method === 'github' ? 'GitHub' : method === 'google' ? 'Google' : 'Discord').join(', ')}</p><button className="button button-primary" disabled={busy}>{busy ? 'Saving…' : 'Save profile'}</button></form> : <p role="status">Loading profile…</p>}</section>}
    {section==='security'&&<section className="configuration-section account-deletion">
      <div className="account-deletion-overview"><div><h2>Delete account</h2><p className="account-card-description">Permanently delete your profile and private account data.</p></div>{!deleting&&<button className="button button-danger" disabled={busy||!profile} onClick={()=>setDeleting(true)}>Delete my account</button>}</div>
      <p className="account-card-note">Shared discussions remain under “Deleted member”. Local configurations and firmware stay on your device.</p>
      <details className="account-details"><summary>What deletion removes</summary><ul><li>Your profile, email, sign-in identities and sessions.</li><li>Your ratings, likes, bookmarks and private reports.</li></ul><p>Existing discussions remain attributed to “Deleted member”; module source credits stay with their modules.</p></details>
      {deleting&&profile&&<form className="community-form" onSubmit={event=>{event.preventDefault();void remove(event.currentTarget)}}><p className="file-error">Account deletion is permanent.</p>{profile.passwordRequired?<label>Your password<input name="password" type="password" required maxLength={128} autoComplete="current-password"/></label>:!profile.freshLogin&&<p className="service-note">Sign in again before deleting your account. <a href="#account/login?reauth=1">Sign in again</a></p>}<label>Type DELETE to confirm<input name="confirm" required pattern="DELETE" autoComplete="off" spellCheck={false}/></label><div className="forum-actions"><button className="button button-danger" disabled={busy||!profile.passwordRequired&&!profile.freshLogin}>{busy?'Deleting…':'Permanently delete account'}</button><button type="button" className="button button-quiet" disabled={busy} onClick={()=>setDeleting(false)}>Cancel</button></div></form>}
    </section>}
    {message && <p className="success-note" role="status">{message}</p>}{error && <p className="file-error" role="alert">{error}</p>}
  </>
}
