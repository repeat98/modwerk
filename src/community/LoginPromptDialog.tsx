import { useEffect, useRef, useState } from 'react'
import { accountHref } from './member-access'
import { useCommunity } from './context'
import { Icon } from '../components/Icon'
/** The sign-in prompt for a member-only action ("Sign in to like this module"), saying what a free account unlocks. Building firmware needs no account. */
export function LoginPromptDialog({next,onClose,action}:{next:string;onClose:()=>void;action:string}) {
  const dialog=useRef<HTMLDialogElement>(null),signIn=useRef<HTMLAnchorElement>(null)
  useEffect(()=>{const element=dialog.current,previousFocus=document.activeElement;element?.showModal();signIn.current?.focus();return()=>{element?.close();if(previousFocus instanceof HTMLElement)previousFocus.focus()}},[])
  return <dialog ref={dialog} className="app-dialog login-prompt-dialog" aria-labelledby="login-prompt-title" aria-describedby="login-prompt-message login-prompt-notice login-prompt-privacy" onCancel={event=>{event.preventDefault();onClose()}} onKeyDown={event=>event.stopPropagation()}>
    <header className="login-prompt-header">
      <h2 id="login-prompt-title">{action}</h2>
      <button type="button" className="icon-button" aria-label="Cancel" onClick={onClose}><Icon name="close" size={18}/></button>
    </header>
    <p id="login-prompt-message">Sign in or create a free Modwerk account to continue.</p>
    <div id="login-prompt-notice" className="login-prompt-notice">
      <p>A free account lets you like and rate modules, join discussions and follow module updates. Every member helps us grow an active community for bug reports, feedback and forum discussions.</p>
      <p><strong>Modwerk will always stay free and open source &lt;3</strong></p>
    </div>
    <p id="login-prompt-privacy">You come back to this page after signing in.</p>
    <div className="dialog-actions">
      <a ref={signIn} className="button button-primary" href={accountHref('login',next)} onClick={onClose}>Sign in</a>
      <a className="button button-quiet" href={accountHref('register',next)} onClick={onClose}>Create account</a>
    </div>
  </dialog>
}
/** Lets a visitor press a member-only control: `prompt` opens the dialog instead of the action, and `next` (or a per-action
 * override) brings them back. `gate` wraps a handler so verified members run it; signed-in members without a verified
 * email go to their account page, where the verification lives. */
export function useLoginPrompt(next:string|(()=>string)) {
  const {session}=useCommunity(),[action,setAction]=useState<string|null>(null),[target,setTarget]=useState('forum')
  function prompt(action:string,override?:string){
    if(session.user)window.location.assign('#account')
    else{setTarget(override??(typeof next==='function'?next():next));setAction(action)}
  }
  const gate=(action:string,run:()=>void,override?:string)=>()=>{if(session.user?.verified)run();else prompt(action,override)}
  return {dialog:action?<LoginPromptDialog action={action} next={target} onClose={()=>setAction(null)}/>:null,gate,prompt}
}
