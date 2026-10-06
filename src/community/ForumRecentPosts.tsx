import { useEffect, useState } from 'react'
import { api } from './api'
import { ForumTime } from './ForumTime'
import { ForumAuthorName, ForumAvatar } from './ForumIdentity'
type Recent={id:string;thread_id:string;title:string;excerpt:string;username:string|null;avatar?:string|null;created_at:string;page:number}
export function ForumRecentPosts({machine}:{machine?:string}){
  const [items,setItems]=useState<Recent[]|null>(null),[error,setError]=useState(''),[revision,setRevision]=useState(0)
  useEffect(()=>{let cancelled=false;void api<Recent[]>('/forum/recent-posts'+(machine?'?machine='+machine:'')).then(value=>{if(!cancelled)setItems(value)}).catch(()=>{if(!cancelled)setError('Recent replies could not load.')});return()=>{cancelled=true}},[machine,revision])
  return <aside className="forum-recent" aria-labelledby="forum-recent-title"><div className="forum-list-heading"><h2 id="forum-recent-title">Recent replies</h2><span>From around the forum</span></div>{error?<><p className="file-error" role="alert">{error}</p><button type="button" className="text-button" onClick={()=>{setError('');setRevision(value=>value+1)}}>Try again</button></>:items===null?<p role="status" className="service-note">Loading replies…</p>:items.length?items.map(item=><article key={item.id}><div className="forum-meta"><span className="forum-author"><ForumAvatar username={item.username} avatar={item.avatar}/><ForumAuthorName username={item.username}/></span><ForumTime value={item.created_at} relative/></div><h3><a href={'#forum/thread/'+item.thread_id+'?post='+item.id+'&page='+item.page}>{item.title}</a></h3><p>{item.excerpt}</p></article>):<p className="service-note">Replies will appear here as conversations get going.</p>}</aside>
}
