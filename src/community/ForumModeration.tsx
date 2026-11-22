import { useState } from 'react'
import { api, post } from './api'
import { threadHref } from '../routing'
import { AdminRecord, AdminViews } from './AdminViews'
import { ForumTime } from './ForumTime'
import { useAdminQueue } from './useAdminQueue'

type Report={id:string;reason:string;resolved:number;created_at:string;post_id:string;body:string;hidden:number;thread_id:string|null;kind:'post'|'shout'|'message';user_id:string;username:string;title:string}
type Transcript={id:string;body:string;hidden:number;created_at:string;username:string|null}[]
// The whole reported conversation, loaded on demand; the Worker refuses conversations nobody reported.
function ConversationDetails({id}:{id:string}){
 const [messages,setMessages]=useState<Transcript|null>(null),[error,setError]=useState('')
 return <details onToggle={event=>{if(event.currentTarget.open&&!messages)void api<Transcript>('/admin/forum/messages/'+id).then(setMessages).catch(error=>setError(error.message))}}><summary>Show conversation</summary>{error?<p className="file-error">{error}</p>:!messages?<p role="status">Loading…</p>:<ul className="moderation-conversation">{messages.map(item=><li key={item.id} data-hidden={!!item.hidden}><strong>@{item.username??'Deleted member'}</strong> <small>{item.created_at}</small><p className="preserve-lines">{item.hidden?'(hidden)':item.body}</p></li>)}</ul>}</details>
}
const reportKinds = { post: 'Forum post', shout: 'Shoutbox post', message: 'Direct message' }
const reportViews = [{ id: 'pending', label: 'Needs review' }, { id: 'reviewed', label: 'Reviewed' }]

export function ForumModeration({ reviewed }: { reviewed: boolean }) {
  const view = reviewed ? 'reviewed' : 'pending'
  const { items: rows, loading, loadError, reload } = useAdminQueue<Report>('/admin/forum/reports?view=' + view)
  const items = rows.filter(item => Boolean(item.resolved) === reviewed)
  const [actionError, setActionError] = useState(''), [busy, setBusy] = useState(false)
  async function moderate(item: Report, form: HTMLFormElement) {
    const fields = new FormData(form)
    const action = fields.get('action')
    const group = action === 'resolved' ? { post: 'reports', shout: 'shout-reports', message: 'message-reports' }[item.kind]
      : action === 'suspended' ? 'users' : { post: 'posts', shout: 'shouts', message: 'messages' }[item.kind]
    const id = action === 'resolved' ? item.id : action === 'suspended' ? item.user_id : item.post_id
    setBusy(true)
    setActionError('')
    try {
      await post('/admin/forum/' + group + '/' + id, { action, value: action === 'hidden' ? !item.hidden : true, reason: fields.get('reason') }, 'PATCH')
      reload()
    } catch (error) { setActionError(error instanceof Error ? error.message : 'Moderation failed.') }
    finally { setBusy(false) }
  }

  return <>
    <AdminViews section="forum" views={reportViews} active={view}/>
    <section className="configuration-section">
      <div className="section-title"><h2>{reviewed ? 'Reviewed reports' : 'Reports to review'}</h2>
        {!loading && !loadError && <span className="pill">{items.length}</span>}
      </div>
      {loading && <p role="status">Loading reports…</p>}
      {items.length === 100 && <p className="service-note">Showing the latest 100 matching reports.</p>}
      {!loading && !loadError && !items.length && <p className="admin-empty">{reviewed ? 'No reports have been reviewed yet.' : 'No forum reports need review.'}</p>}
      {items.map(item => <AdminRecord key={item.id} title={item.reason} meta={reportKinds[item.kind] + ' · @' + item.username}
        status={<span className="pill">{item.hidden ? 'Content hidden' : 'Content visible'}</span>}>
        <p className="admin-record-meta">{item.kind === 'message' ? item.title : <a href={item.kind === 'shout' ? '#forum/shoutbox' : threadHref(item.thread_id ?? '')}>{item.title} ↗</a>} · <ForumTime value={item.created_at}/></p>
        <blockquote className="preserve-lines">{item.body}</blockquote>
        {item.kind === 'message' && item.thread_id && <ConversationDetails id={item.thread_id}/>}
        <form className="community-form" onSubmit={event => { event.preventDefault(); void moderate(item, event.currentTarget) }}>
          <label>Action<select name="action"><option value="resolved">Mark report reviewed</option>
            <option value="hidden">{(item.hidden ? 'Restore ' : 'Hide ') + (item.kind === 'message' ? 'latest message' : 'post')}</option>
            <option value="suspended">Suspend author</option>
          </select></label>
          <label>Reason<input name="reason" required maxLength={1000}/></label>
          <button className="button button-quiet" disabled={busy}>Apply moderation</button>
        </form>
      </AdminRecord>)}
      {(loadError || actionError) && <p className="file-error" role="alert">{loadError || actionError}</p>}
      {loadError && <button className="button button-quiet" onClick={reload}>Retry loading reports</button>}
    </section>
  </>
}
