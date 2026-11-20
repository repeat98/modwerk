import { useEffect, useState } from 'react'
import { api } from './api'
type Comment={id:string;module_id:string;body:string;author:string}
export function ModerationPanel(){
 const [items,setItems]=useState<Comment[]>([]),[error,setError]=useState(''),[loading,setLoading]=useState(true)
 useEffect(()=>{void api<Comment[]>('/admin/comments').then(setItems).catch(error=>setError(error.message)).finally(()=>setLoading(false))},[])
 async function remove(id:string){try{await api('/comments/'+id,{method:'DELETE'});setItems(current=>current.filter(item=>item.id!==id))}catch(error){setError(error instanceof Error?error.message:'Unable to remove comment.')}}
 const [query,setQuery] = useState('')
 const term = query.trim().toLowerCase()
 const matched = items.filter(item => [item.module_id, item.author, item.body].some(text => text.toLowerCase().includes(term)))
 return <section className="configuration-section"><div className="section-title"><h2>Recent comments</h2>{!loading && !error && <span className="pill">{matched.length}</span>}</div>
  <p className="service-note">Guest names are unverified. Remove spam, abuse or private and infringing content.</p>
  {!!items.length && <label className="admin-search">Find a comment<input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Module, author or text"/></label>}
  {matched.map(item => <article className="admin-comment" key={item.id}>
    <strong>{item.module_id}</strong><small>{item.author}</small>
    <p className="preserve-lines">{item.body}</p><button className="text-button" onClick={() => void remove(item.id)}>Remove comment</button>
  </article>)}
  {loading && <p className="service-note" role="status">Loading comments…</p>}
  {!loading && !matched.length && !error && <p className="admin-empty">{items.length ? 'No comments match your search.' : 'No comments to moderate.'}</p>}
  {error && <p className="file-error" role="alert">{error}</p>}
 </section>
}
