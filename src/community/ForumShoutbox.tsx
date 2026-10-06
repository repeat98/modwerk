import { useEffect, useRef, useState } from 'react'
import { api, apiFetch, post } from './api'
import { useCommunity } from './context'
import { SHOUT_MAX_LENGTH, type ForumShout, type ForumShouts } from './forum-contract'
import { Icon } from '../components/Icon'
import { ForumTime } from './ForumTime'
import { ForumAvatar } from './ForumIdentity'

export function ForumShoutbox({archive=false,page=0,floating=false}:{archive?:boolean;page?:number;floating?:boolean}) {
  const {session}=useCommunity()
  const [data,setData]=useState<ForumShouts|null>(null),[error,setError]=useState(''),[notice,setNotice]=useState(''),[draft,setDraft]=useState(''),[busy,setBusy]=useState(false),[collapsed,setCollapsed]=useState(()=>!archive&&typeof window!=='undefined'&&window.matchMedia('(max-width: 600px)').matches),[revision,setRevision]=useState(0),[editing,setEditing]=useState<string|null>(null),[editBody,setEditBody]=useState('')
  const list=useRef<HTMLDivElement>(null),followEnd=useRef(true),minimizeButton=useRef<HTMLButtonElement>(null)
  function expand(){setCollapsed(false);window.requestAnimationFrame(()=>minimizeButton.current?.focus())}
  function minimize(){setCollapsed(true);window.requestAnimationFrame(()=>document.getElementById('shoutbox-launcher')?.focus())}
  useEffect(()=>{
    if(collapsed)return
    let cancelled=false,inFlight=false
    const controller=new AbortController()
    async function load(){
      if(inFlight)return
      inFlight=true
      try{
        const next=await api<ForumShouts>('/forum/shouts?'+(archive?'page='+page:'compact=1'),{signal:controller.signal})
        if(!cancelled){const element=list.current;followEnd.current=!element||element.scrollHeight-element.scrollTop-element.clientHeight<60;setData(next);setError('')}
      }catch(error){if(!cancelled)setError(error instanceof Error?error.message:'Messages could not load.')}
      finally{inFlight=false}
    }
    void load()
    const timer=window.setInterval(()=>{if(page===0&&document.visibilityState==='visible')void load()},30000)
    const visible=()=>{if(page===0&&document.visibilityState==='visible')void load()}
    document.addEventListener('visibilitychange',visible)
    return()=>{cancelled=true;controller.abort();window.clearInterval(timer);document.removeEventListener('visibilitychange',visible)}
  },[archive,page,revision,collapsed,session.user?.id,session.admin])
  useEffect(()=>{if(followEnd.current&&list.current)list.current.scrollTop=list.current.scrollHeight},[data])
  async function act(path:string,payload?:unknown,method='POST'){
    setBusy(true);setError('');setNotice('')
    try{
      if(method==='DELETE'){const result=await apiFetch(path,{method});if(!result.ok)throw new Error('This message could not be deleted.')}
      else await post(path,payload,method)
      setRevision(current=>current+1)
      return true
    }catch(error){setError(error instanceof Error?error.message:'Your message could not be saved.');return false}
    finally{setBusy(false)}
  }
  async function send(){if(await act('/forum/shouts',{body:draft})){setDraft('');setNotice('Message sent.');followEnd.current=true}}
  function messageActions(item:ForumShout){
    return <details className="shout-actions"><summary aria-label={'Actions for message by '+(item.username??'Deleted member')}>•••</summary>
      {item.canEdit&&<div className="forum-actions"><button type="button" className="text-button" disabled={busy} onClick={()=>{setEditing(item.id);setEditBody(item.body)}}>Edit</button><button type="button" className="text-button" disabled={busy} onClick={()=>{if(window.confirm('Delete this message?'))void act('/forum/shouts/'+item.id,undefined,'DELETE')}}>Delete</button></div>}
      {session.user?.verified&&!item.hidden&&<form className="community-form" onSubmit={event=>{event.preventDefault();const form=event.currentTarget;void act('/forum/shouts/'+item.id+'/report',{reason:new FormData(form).get('reason')}).then(ok=>{if(ok){form.reset();form.closest('details')?.removeAttribute('open');setNotice('Report sent privately to the administrator.')}})}}><label>Report this message<input name="reason" required maxLength={1000} placeholder="Reason for reporting"/></label><button className="text-button" disabled={busy}>Send report</button></form>}
      {session.admin&&<form className="community-form" onSubmit={event=>{event.preventDefault();const form=event.currentTarget;void act('/admin/forum/shouts/'+item.id,{action:'hidden',value:!item.hidden,reason:new FormData(form).get('reason')},'PATCH').then(ok=>{if(ok){form.reset();form.closest('details')?.removeAttribute('open')}})}}><label>Moderation reason<input name="reason" required maxLength={1000}/></label><button className="text-button" disabled={busy}>{item.hidden?'Restore message':'Hide message'}</button></form>}
    </details>
  }
  if(floating&&collapsed)return <button id="shoutbox-launcher" type="button" className="forum-chat-launcher" aria-expanded={false} aria-controls="shoutbox-content" onClick={expand}><Icon name="message" size={18}/><span>Shoutbox 8</span></button>
  return <section className={'forum-shoutbox'+(archive?' is-archive':'')+(floating?' is-floating':'')} aria-labelledby="shoutbox-title" role={floating?'dialog':undefined} aria-modal={floating?false:undefined} onKeyDown={event=>{if(floating&&event.key==='Escape'){event.stopPropagation();minimize()}}}>
    <header className="shoutbox-heading"><div><Icon name="message" size={18}/><h2 id="shoutbox-title">Shoutbox 8</h2><span>Quick questions. Small discoveries. Say hello.</span></div><div><a className="text-button" href={archive?'#forum':'#forum/shoutbox'}>{archive&&<Icon name="back" size={13}/>} {archive?'Back to forum':'Archive'}</a>{!archive&&<button ref={minimizeButton} type="button" className="text-button" aria-label={floating?'Minimize Shoutbox 8':undefined} aria-expanded={!collapsed} aria-controls="shoutbox-content" onClick={()=>floating?minimize():setCollapsed(current=>!current)}>{floating?<Icon name="close" size={16}/>:collapsed?'Expand':'Collapse'}</button>}</div></header>
    {!collapsed&&<div id="shoutbox-content">
      <div className="shoutbox-messages" ref={list} role="region" aria-label="Community messages" tabIndex={0}>
        {!data&&!error?<p role="status" className="shoutbox-empty">Loading messages…</p>:data?.messages.length?[...data.messages].reverse().map(item=><article key={item.id} id={'shout-'+item.id} className="shout-message" data-hidden={!!item.hidden}>
          <ForumAvatar username={item.username} avatar={item.avatar}/>
          <div className="shout-message-content"><div className="forum-meta">{item.username?<a href={'#forum/profile/'+item.username}>@{item.username}</a>:<span>Deleted member</span>}<ForumTime value={item.created_at} relative/>{item.edited_at&&<small>Edited</small>}{!!item.hidden&&<span className="pill">Hidden</span>}</div>
            {editing===item.id?<form className="community-form" onSubmit={event=>{event.preventDefault();void act('/forum/shouts/'+item.id,{body:editBody},'PATCH').then(ok=>{if(ok)setEditing(null)})}}><label>Edit message<textarea value={editBody} onChange={event=>setEditBody(event.target.value)} maxLength={SHOUT_MAX_LENGTH} required rows={2}/></label><div className="forum-actions"><button className="text-button" disabled={busy||!editBody.trim()}>Save</button><button type="button" className="text-button" onClick={()=>setEditing(null)}>Cancel</button></div></form>:<p>{item.body}</p>}
          </div>{(session.user?.verified||session.admin)&&messageActions(item)}
        </article>):!error&&<p className="shoutbox-empty">It’s quiet here. Say hello or share what you’re working on.</p>}
      </div>
      {error&&<div className="shoutbox-feedback"><p className="file-error" role="alert">{error}</p><button type="button" className="text-button" disabled={busy} onClick={()=>setRevision(current=>current+1)}>Try again</button></div>}
      {session.user?.verified?<form className="shoutbox-composer" onSubmit={event=>{event.preventDefault();void send()}}><label className="sr-only" htmlFor="shoutbox-message">Your public message</label><textarea id="shoutbox-message" value={draft} onChange={event=>setDraft(event.target.value)} rows={2} maxLength={SHOUT_MAX_LENGTH} placeholder="Say something… (Shift + Enter for a new line)" disabled={busy} aria-describedby="shoutbox-hint" onKeyDown={event=>{if(event.key==='Enter'&&!event.shiftKey&&!event.nativeEvent.isComposing){event.preventDefault();if(!busy&&draft.trim())void send()}}}/><button className="button button-primary" disabled={busy||!draft.trim()}>{busy?'Sending…':'Send'}<Icon name="arrow" size={14}/></button><p id="shoutbox-hint">Public · @{session.user.username}<span>{draft.length} / {SHOUT_MAX_LENGTH}</span></p></form>:<p className="shoutbox-signin">{session.user?<a href="#account">Verify your account to join the conversation.</a>:<><a href="#account/login">Sign in</a> or <a href="#account/register">create an account</a> to join the conversation.</>}</p>}
      {notice&&<p role="status" className="shoutbox-notice">{notice}</p>}
      {archive&&(page>0||data?.hasMore)&&<nav className="forum-pagination" aria-label="Shoutbox archive pages">{page>0?<a href={'#forum/shoutbox?page='+(page-1)}><Icon name="back" size={14}/>Newer messages</a>:<span/>}<span>Page {page+1}</span>{data?.hasMore&&<a href={'#forum/shoutbox?page='+(page+1)}>Older messages<Icon name="arrow" size={14}/></a>}</nav>}
    </div>}
  </section>
}
