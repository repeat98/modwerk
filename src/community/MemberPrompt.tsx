import { useCommunity } from './context'
import { Icon } from '../components/Icon'
import { accountHref } from './member-access'
// Waits until the stored session is checked, so a signed-in member never sees the sign-in invitation flash past.
export function MemberPrompt(){const {session,settled=true}=useCommunity();return !settled||session.user?.verified?null:<p className="service-note">{session.user?<>Verify your email in <a href="#account">your account</a> to post, like and report issues.</>:<><a href="#account/login">Sign in</a> or <a href="#account/register">create a free account</a> to post, like modules, follow updates and report issues; everyone can read the discussions.</>}</p>}
/** One card where a composer would be: guests get a free account that returns to `next`, unverified members the way to verify. */
export function MemberInvite({id,title,text,next}:{id:string;title:string;text:string;next:string}){
  const {session,settled=true}=useCommunity()
  if(!settled||session.user?.verified)return null
  const verify=!!session.user
  return <section className="forum-join" aria-labelledby={id}><span className="forum-join-mark" aria-hidden="true"><Icon name={verify?'mail':'message'} size={18}/></span><div><h2 id={id}>{verify?'Verify your email to post':title}</h2><p>{verify?'Open the link we sent when you signed up, or ask for a new one.':text}</p></div><div className="forum-join-actions">{verify?<a className="button button-primary" href="#account/resend">Send a new link</a>:<><a className="button button-primary" href={accountHref('register',next)}>Create a free account</a><a className="button button-quiet" href={accountHref('login',next)}>Sign in</a></>}</div></section>
}
