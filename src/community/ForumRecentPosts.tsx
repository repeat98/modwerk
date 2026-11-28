import { useEffect, useState } from 'react'
import { api } from './api'
import { useReconnectRetry } from './useReconnectRetry'
import { ForumTime } from './ForumTime'
import { ForumAuthorName, ForumAvatar } from './ForumIdentity'
import { threadHref } from '../routing'
import { ForumRecentSkeleton } from './ForumSkeleton'
type Recent={id:string;thread_id:string;title:string;excerpt:string;username:string|null;avatar?:string|null;official?:number;created_at:string;page:number}
export function ForumRecentPosts({machine}:{machine?:string}){
  const [items,setItems]=useState<Recent[]|null>(null),[error,setError]=useState(''),[revision,setRevision]=useState(0)
  useEffect(()=>{let cancelled=false;void api<Recent[]>('/forum/recent-posts'+(machine?'?machine='+machine:'')).then(value=>{if(!cancelled){setItems(value);setError('')}}).catch(()=>{if(!cancelled)setError('Recent replies could not load.')});return()=>{cancelled=true}},[machine,revision])
  useReconnectRetry(!!error,setRevision)
  // The newest reply of each thread, so one busy discussion does not fill the block.
  const shown=items?.filter((item,index)=>items.findIndex(other=>other.thread_id===item.thread_id)===index)
  return <aside className="forum-recent" aria-labelledby="forum-recent-title"><div className="forum-list-heading"><h2 id="forum-recent-title">Recent replies</h2></div>{error?<p className="service-note" role="status">{error} <button type="button" className="text-button" onClick={()=>{setError('');setRevision(value=>value+1)}}>Try again</button></p>:!shown?<ForumRecentSkeleton/>:shown.length?shown.map(item=><article key={item.id}><div className="forum-meta"><span className="forum-author"><ForumAvatar username={item.username} official={item.official} avatar={item.avatar}/><ForumAuthorName username={item.username} official={item.official}/></span><ForumTime value={item.created_at} relative/></div><h3><a href={threadHref(item.thread_id,item.title,'?post='+item.id+'&page='+item.page)}>{item.title}</a></h3><p>{item.excerpt}</p></article>):<p className="service-note">Replies will appear here as conversations get going.</p>}</aside>
}
