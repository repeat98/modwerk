import { BackLink } from '../components/BackLink'
import { ForumAvatar } from './ForumIdentity'
import { NewsPreferences } from './NewsPreferences'
import { NotificationPreferences, Unsubscribe } from './NotificationPreferences'
import { AccountRemovalRequest } from './AccountRequests'
import { useEffect, useState } from 'react'
import { PrivateIssueDetail } from './PrivateIssueDetail'
import { AccountExport } from './AccountExport'
import { COMMUNITY_RULES_VERSION } from '../legal/policy'
import { AccountInbox } from './AccountInbox'
import { AccountSettings } from './AccountSettings'
import { SocialReturn } from './SocialReturn'
import { startSocial, type SocialProvider } from './social-login'
import { SocialButton } from './SocialButton'
import { accountHref, safeNext } from './member-access'
import { api, post } from './api'
import { useCommunity } from './context'
import { SUPPORT_MAILTO } from '../support'
import { DeveloperVerification } from './DeveloperVerification'
type DeviceSession = { id:string; current:boolean; expires:number }
function AccountContent({route}:{route:string}) {
  const {session,refresh,loading}=useCommunity(), [busy,setBusy]=useState(false), [error,setError]=useState(route.startsWith('account/sso-error')?(new URLSearchParams(route.split('?')[1]).get('reason')==='exists'?'An account with this email address already exists. Sign in with the method you used to create it (your email and password, or the social provider you first used).':'Social sign-in was not completed. Use your original sign-in method, or create an account if you are new.'):''), [message,setMessage]=useState(''), [devices,setDevices]=useState<DeviceSession[]|null>(null)
  const [path,query='']=route.split('?'),params=new URLSearchParams(query),next=safeNext(params.get('next'))
  const [,action='login',linkToken='']=path.split('/'), mode=['login','register','resend','forgot','verify','reset'].includes(action)?action:'login'
  const linkAction=['verify','reset','forgot','resend'].includes(mode)||params.get('reauth')==='1',member=!!session.user?.verified&&!linkAction
  const accountSections=[{id:'profile',label:'Profile',href:'#account'},{id:'activity',label:'Activity',href:'#account/activity'},{id:'notifications',label:'Emails',href:'#account/notifications'},{id:'security',label:'Security & data',href:'#account/security'},{id:'developer',label:'Developer',href:'#account/developer'}] as const
  const section=action==='report'?'activity':accountSections.find(item=>item.id===action)?.id??'profile'
  const emailAvailable=session.emailAvailable??session.registrationAvailable
  const [lastLink,setLastLink]=useState(linkToken)
  // A fresh emailed link starts a fresh form; stripping a consumed token keeps
  // the successful confirmation visible without retaining the sensitive URL.
  if(linkAction&&linkToken&&linkToken!==lastLink){setLastLink(linkToken);setMessage('');setError('')}
  useEffect(()=>{let cancelled=false;if(member&&section==='security')void api<DeviceSession[]>('/auth/sessions').then(value=>{if(!cancelled)setDevices(value)}).catch(error=>{if(!cancelled)setError(error.message)});return()=>{cancelled=true}},[member,section])
  async function submit(form:HTMLFormElement) {
    setBusy(true);setError('');setMessage('')
    try {
      const fields=Object.fromEntries(new FormData(form))
      const result=await post<{message?:string}>('/auth/'+mode,{...fields,...(mode==='register'?{newsletter:fields.newsletter==='on',rulesVersion:fields.rulesAccepted==='on'?COMMUNITY_RULES_VERSION:''}:{}),...(['verify','reset'].includes(mode)?{token:linkToken}:{})})
      form.reset();await refresh()
      if(mode==='login')window.location.assign('#'+(params.get('reauth')==='1'?'account':next))
      else setMessage(result.message??'Saved.')
      if(mode==='verify'||mode==='reset')history.replaceState(null,'','#account/'+mode)
    } catch(error){setError(error instanceof Error?error.message:'Unable to complete this request.')} finally{setBusy(false)}
  }
  async function social(provider:SocialProvider) {
    setBusy(true);setError('')
    try{await startSocial(provider,params.get('reauth')==='1'?'account':next)}catch(error){setError(error instanceof Error?error.message:'Unable to start sign-in.')}finally{setBusy(false)}
  }
  async function endSessions(all:boolean){setBusy(true);setError('');try{if(all){await api('/auth/sessions',{method:'DELETE'});setDevices(await api<DeviceSession[]>('/auth/sessions'));setMessage('Other sessions signed out.')}else{await post('/auth/logout',{});await refresh();window.location.assign('#account/login')}}catch(error){setError(error instanceof Error?error.message:'Unable to sign out.')}finally{setBusy(false)}}
  const titles:Record<string,string>={login:'Welcome back',register:'Join the community',resend:'Verify your email',forgot:'Forgot your password?',verify:'Confirm your email',reset:'Choose a new password'}
  const descriptions:Record<string,string>={login:'Join discussions, share configurations and follow your modules.',register:'Create your community profile. Your email stays private.',resend:'Request a new link to confirm your email address.',forgot:'Get a recovery link to reset your password.',verify:'Confirm the email address for your community account.',reset:'Set a new password for your community account.'}
  return <div className={'community-page account-page'+(linkAction?' account-page-recovery':member?' account-page-member':' account-page-auth')}><BackLink href="#forum">Community forum</BackLink><div className="page-heading"><div><p className="page-kicker">MODWERK / ACCOUNT</p><h1>{member?'Your account':titles[mode]}</h1><p>{member?'Your profile, account access and community activity.':descriptions[mode]}</p></div></div>
    {member?<>
      <section className="configuration-section account-member" aria-labelledby="account-identity">
        <div className="account-identity"><ForumAvatar username={session.user!.username??session.user!.displayName} avatar={session.user!.avatar}/><div><h2 id="account-identity">{session.user!.displayName||session.user!.username}</h2><p>@{session.user!.username}<span>Community member</span></p></div></div>
        <div className="account-member-actions"><a className="text-button" href={'#forum/profile/'+session.user!.username}>Your public profile</a><a className="text-button" href="#forum?saved=1">Your bookmarks</a><button className="text-button" disabled={busy} onClick={()=>void endSessions(false)}>Sign out</button></div>
      </section>
      <nav className="account-navigation" aria-label="Account settings">{accountSections.map(item=><a key={item.id} href={item.href} aria-current={section===item.id?'page':undefined}>{item.label}</a>)}</nav>
      <div className={'account-workspace account-workspace-'+section}>
        {section==='profile'&&<AccountSettings key={'profile-'+session.user!.id}/>}
        {section==='activity'&&(action==='report'?<PrivateIssueDetail key={linkToken} id={linkToken} back="#account/activity"/>:<AccountInbox key={session.user!.id}/>)}
        {section==='notifications'&&<><NotificationPreferences key={'notifications-'+session.user!.id}/><NewsPreferences key={'news-'+session.user!.id}/></>}
        {section==='security'&&<>
          <section className="configuration-section account-sessions"><h2>Active sessions</h2><p className="service-note">Sign out other sessions while keeping this one connected.</p>
            {devices?<ul className="account-session-list">{devices.map((device,index)=><li key={device.id}><span>{device.current?'This session':'Other session '+(index+1)}{device.current&&<span className="pill">Current</span>}</span><small>Expires {new Date(device.expires*1000).toLocaleDateString()}</small></li>)}</ul>:!error&&<p role="status" className="service-note">Loading sessions…</p>}
            <button className="button button-quiet" disabled={busy||(devices?.length??0)<2} onClick={()=>void endSessions(true)}>Sign out other sessions</button>
            {message&&<p className="success-note" role="status">{message}</p>}{error&&<p className="file-error" role="alert">{error}</p>}
          </section>
          <AccountExport/><AccountRemovalRequest key={'removal-'+session.user!.id}/><AccountSettings key={'security-'+session.user!.id} section="security"/>
        </>}
        {section==='developer'&&<DeveloperVerification route={route}/>}
      </div>
      {section!=='security'&&<>{message&&<p className="success-note" role="status">{message}</p>}{error&&<p className="file-error" role="alert">{error}</p>}</>}
    </>:<div className="account-access-grid"><section className="configuration-section account-auth" aria-label="Community account">
      {!session.available?<p className="service-note" role="status">{loading?'Connecting to the community…':'Community services are unavailable. You can still use your local configurations.'}</p>:<>
      {session.user&&!session.user.username&&<p className="service-note">This browser holds a previous guest identity. Its private reports appear below until you sign in. Guest names do not reserve account usernames.</p>}
      {!(mode==='verify'||mode==='reset')&&<nav className="account-auth-tabs" aria-label="Account actions"><a aria-current={mode==='login'?'page':undefined} href={accountHref('login',next)}>Sign in</a><a aria-current={mode==='register'?'page':undefined} href={accountHref('register',next)}>Create account</a></nav>}
      {mode==='register'&&!session.registrationAvailable&&<p className="service-note" role="status">New registrations are temporarily closed. Existing accounts can still sign in.</p>}
      {!emailAvailable&&['forgot','resend'].includes(mode)&&<p className="service-note" role="status">Account email is not available yet. Please try again later.</p>}
      {(mode==='login'||mode==='register')&&<><div className="social-sign-in" role="group" aria-label="Social sign-in">{(['google','github','discord'] as const).map(provider=><SocialButton key={provider} provider={provider} disabled={busy||!session.ssoProviders?.includes(provider)} onClick={()=>void social(provider)}/>)}</div>{session.ssoProviders?.length?<p className="service-note">Continue to sign in or create an account. No username needed to get started.</p>:<p className="service-note">Social sign-in is being prepared. Use email to continue.</p>}<p className="account-divider">{mode==='register'?'Or create an account with email':'Or use email'}</p></>}
      {message&&(mode==='verify'||mode==='reset')?<a className="button button-primary" href="#account/login">Continue to sign in</a>:<form className="community-form" onSubmit={event=>{event.preventDefault();void submit(event.currentTarget)}}>
        {mode==='register'&&<label>Public username<input name="username" required minLength={3} maxLength={24} pattern="[A-Za-z0-9_]+" autoComplete="username" spellCheck={false}/><small>3–24 letters, numbers or underscores.</small></label>}
        {mode!=='verify'&&mode!=='reset'&&<label>Email address<input type="email" name="email" required maxLength={254} autoComplete="email" placeholder="you@example.com"/></label>}
        {['register','login','verify','reset'].includes(mode)&&<label>{mode==='verify'?'Password you chose when registering':mode==='reset'?'New password':'Password'}<input type="password" name="password" required minLength={15} maxLength={128} autoComplete={mode==='register'||mode==='reset'?'new-password':'current-password'}/>{(mode==='register'||mode==='reset')&&<small>At least 15 characters. Try a few unrelated words.</small>}</label>}
        {mode==='register'&&<><p className="service-note">Use a verified email or social account to post, rate, report issues and build firmware. Your username and posts are public; your email is private. Read the <a href="#privacy">privacy notice</a> and <a href="#impressum">Impressum</a>. We send a welcome email once you complete signup, as well as verification and recovery emails. Activity digests about replies, mentions, likes and your modules are on by default; turn them off in your account or with the link in every email. Usage counts are optional and off by default.</p><label className="risk-accept"><input name="rulesAccepted" type="checkbox" required/><span>I agree to the <a href="#community-rules">community rules</a>.</span></label></>}
        {mode==='register'&&<label className="risk-accept"><input name="newsletter" type="checkbox"/><span>Email me occasional Modwerk news and updates (optional).</span></label>}
        {mode==='verify'&&<p className="service-note">Only continue if you created this account. If you did not, you can ignore this message.</p>}
        <button className="button button-primary" disabled={busy||(mode==='register'&&(!session.registrationAvailable||!emailAvailable))||(['forgot','resend'].includes(mode)&&!emailAvailable)}>{busy?'Please wait…':mode==='login'?'Sign in':mode==='register'?'Create account':mode==='verify'?'Verify email':mode==='reset'?'Save new password':'Send email'}</button>
      </form>}
      <nav className="account-recovery-links" aria-label="Account recovery"><a href="#account/forgot">Reset password</a><a href="#account/resend">Resend verification</a></nav></>}
      {message&&<p className="success-note" role="status">{message}</p>}{error&&<p className="file-error" role="alert">{error}</p>}
    </section>
    {!linkAction&&<DeveloperVerification route={route}/>}
    </div>}
    {params.get('deleted')==='1'&&<p className="success-note" role="status">Your account has been deleted.</p>}
    {!member&&session.user&&!linkAction&&(action==='report'?<PrivateIssueDetail key={linkToken} id={linkToken}/>:<AccountInbox key={session.user.id}/>)}
    <footer className="account-help"><p>Need help with your account? <a href={SUPPORT_MAILTO}>Contact support ↗</a></p><p>Never send passwords, recovery links or firmware.</p></footer>
  </div>
}

export function AccountPage({route}:{route:string}) { return route==='account/sso'||route.startsWith('account/sso/')?<SocialReturn code={route.split('/')[2]??''}/>:route.startsWith('account/unsubscribe/')?<Unsubscribe token={route.split('/')[2]??''}/>:<AccountContent route={route}/> }
