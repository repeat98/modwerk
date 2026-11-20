import { useEffect, useState } from 'react'
import { Icon } from '../components/Icon'
import { AdminRecord, AdminViews } from './AdminViews'
import { useAdminQueue } from './useAdminQueue'
import { ForumTime } from './ForumTime'
import { AccountConfirmation } from './AccountConfirmation'
import { api, post } from './api'
import { SUPPORT_EMAIL, SUPPORT_MAILTO } from '../support'
type RemovalRequest={id:string;status:'requested'|'reviewing'|'completed'|'cancelled';created_at:string;updated_at:string;responseDueAt:string;responseOverdue:boolean}
type ReviewRequest=RemovalRequest&{user_id:string;username:string|null;review_note:string}
const labels={requested:'Requested',reviewing:'Under review',completed:'Completed',cancelled:'Cancelled'}
type MailCount={day:string;purpose:'verify'|'reset'|'activity'|'welcome'|'news';accepted:number;failed:number;limited:number}
function errorText(error:unknown){return error instanceof Error?error.message:'The request could not be completed.'}
export function AccountRemovalRequest(){
 const [ready,setReady]=useState(false)
 const [request,setRequest]=useState<RemovalRequest|null|undefined>(),[error,setError]=useState(''),[busy,setBusy]=useState(false),[confirmed,setConfirmed]=useState(false)
 useEffect(()=>{let cancelled=false;void api<RemovalRequest|null>('/auth/account-removal').then(value=>{if(!cancelled)setRequest(value)}).catch(error=>{if(!cancelled)setError(errorText(error))});return()=>{cancelled=true}},[])
 const active=request&&(request.status==='requested'||request.status==='reviewing')
 async function send(form:HTMLFormElement){setBusy(true);setError('');try{setRequest(await post<RemovalRequest>('/auth/account-removal',{password:new FormData(form).get('password'),confirm:'REQUEST'}));form.reset();setConfirmed(false)}catch(error){setError(errorText(error))}finally{setBusy(false)}}
 async function withdraw(){setBusy(true);setError('');try{await api('/auth/account-removal',{method:'DELETE'});setRequest(await api<RemovalRequest|null>('/auth/account-removal'))}catch(error){setError(errorText(error))}finally{setBusy(false)}}
 return <section className="configuration-section account-removal">
  <h2>Account removal</h2>
  <p className="account-card-description">Ask the administrator to remove your account and its data.</p>
  <dl className="account-facts"><div><dt>During review</dt><dd>Your account stays active</dd></div><div><dt>Response</dt><dd>Within one month</dd></div></dl>
  {active?<><p className="success-note" role="status">{labels[request.status]} · requested {new Date(request.created_at.replace(' ','T')+'Z').toLocaleDateString()}</p><p className="account-card-note">Response due by {new Date(request.responseDueAt).toLocaleDateString()}.</p><button className="button button-quiet" disabled={busy} onClick={()=>void withdraw()}>{busy?'Saving…':'Withdraw request'}</button></>:request===undefined&&!error?<p role="status" className="service-note">Loading account requests…</p>:<details className="account-action-details"><summary>Request account removal<Icon name="arrow" size={16}/></summary>{request&&<p className="account-card-note">Previous request: {labels[request.status]}.</p>}<form className="community-form" onSubmit={event=>{event.preventDefault();void send(event.currentTarget)}}><AccountConfirmation onReady={setReady}/><label className="risk-accept"><input type="checkbox" checked={confirmed} onChange={event=>setConfirmed(event.target.checked)} required/>I want the administrator to remove my account.</label><button className="button button-quiet" disabled={busy||!confirmed||!ready}>{busy?'Sending…':'Send removal request'}</button><p className="service-note">This requests removal; it does not delete data immediately. You can withdraw the request while it is pending.</p></form></details>}
  <p className="account-card-note">Need help? <a href={SUPPORT_MAILTO}>Contact support ↗</a></p>
  <details className="account-details"><summary>How requests are handled</summary><p>We will respond within one month. If a complex request needs more time, we will explain the reason within that month.</p><p>We will explain any required retention of shared discussions or attribution.</p><p>For help with a request, contact <a href={SUPPORT_MAILTO}>{SUPPORT_EMAIL}</a>. Never send passwords, recovery links or firmware.</p></details>
  {error&&<p className="file-error" role="alert">{error}</p>}
 </section>
}
const requestViews = [{ id: 'active', label: 'Active requests' }, { id: 'archive', label: 'Completed and cancelled' }]

export function AccountRequestInbox({ archived }: { archived: boolean }) {
  const view = archived ? 'archive' : 'active'
  const { items: rows, loading, loadError, reload } = useAdminQueue<ReviewRequest>('/admin/account-requests?view=' + view)
  const items = rows.filter(item => archived === (item.status === 'completed' || item.status === 'cancelled'))
  const [actionError, setActionError] = useState(''), [busy, setBusy] = useState('')
  async function review(id: string, form: HTMLFormElement) {
    setBusy(id)
    setActionError('')
    try {
      await post('/admin/account-requests/' + id, Object.fromEntries(new FormData(form)), 'PATCH')
      reload()
    } catch (error) { setActionError(errorText(error)) }
    finally { setBusy('') }
  }
  return <>
    <AdminViews section="requests" views={requestViews} active={view}/>
    <section className="configuration-section">
      <div className="section-title"><h2>{archived ? 'Request history' : 'Removal requests'}</h2>
        {!loading && !loadError && <span className="pill">{items.length}</span>}
      </div>
      {loading && <p role="status">Loading requests…</p>}
      {!loading && !loadError && !items.length && <p className="admin-empty">{archived ? 'No completed or cancelled requests.' : 'No active removal requests.'}</p>}
      {items.length === 100 && <p className="service-note">Showing 100 requests.</p>}
      {items.map(item => {
        const deadline = new Date(item.responseDueAt).toLocaleDateString(undefined, { dateStyle: 'medium' })
        return <AdminRecord key={item.id} title={item.username ? '@' + item.username : 'Removed account'}
          meta={archived ? 'Requested ' + item.created_at.slice(0, 10) : 'Response due ' + deadline}
          status={<span className="pill" data-overdue={!archived && item.responseOverdue}>{!archived && item.responseOverdue ? 'Overdue · ' : ''}{labels[item.status]}</span>}>
          <dl><dt>Request ID</dt><dd>{item.id}</dd><dt>Account ID</dt><dd>{item.user_id}</dd>
            <dt>Submitted</dt><dd><ForumTime value={item.created_at}/></dd><dt>Response deadline</dt><dd>{deadline}</dd></dl>
          {item.review_note && <p className="preserve-lines">{item.review_note}</p>}
          {!archived && <form className="community-form" onSubmit={event => { event.preventDefault(); void review(item.id, event.currentTarget) }}>
            <label>Review action<select name="status"><option value="reviewing">Under review</option><option value="cancelled">Cancel request</option><option value="completed">Confirm verified completion</option></select></label>
            <label>Private review note<textarea name="note" required maxLength={1000} rows={2}/></label>
            <p className="service-note">Record approval for the removal scope and follow the operator procedure. Verify removal before marking it complete. Saving this review does not delete data.</p>
            <button className="button button-quiet" disabled={!!busy}>{busy === item.id ? 'Saving…' : 'Save review'}</button>
          </form>}
        </AdminRecord>
      })}
      {(loadError || actionError) && <p className="file-error" role="alert">{loadError || actionError}</p>}
      {loadError && <button className="button button-quiet" onClick={reload}>Retry loading requests</button>}
    </section>
  </>
}

export function AccountMailHealth(){
 const [rows,setRows]=useState<MailCount[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState('')
 useEffect(()=>{let cancelled=false;void api<MailCount[]>('/admin/account-mail').then(value=>{if(!cancelled)setRows(value)}).catch(error=>{if(!cancelled)setError(errorText(error))}).finally(()=>{if(!cancelled)setLoading(false)});return()=>{cancelled=true}},[])
 return <section className="configuration-section"><h2>Account email</h2><p className="service-note">Private daily counts of verification, recovery, welcome, activity digest and news attempts. Activity digests and news mail have their own daily caps (ACTIVITY_MAIL_DAILY_LIMIT, NEWS_MAIL_DAILY_LIMIT) beside the account-mail cap. Accepted means the provider accepted the message; inbox delivery must be checked in Resend. These counts contain no addresses, links or provider responses.</p>{loading?<p role="status">Loading email counts…</p>:rows.length?<div className="admin-table-wrap"><table className="admin-delivery"><caption>Daily email delivery counts</caption>
   <thead><tr>{['Date (UTC)', 'Purpose', 'Accepted', 'Failed', 'Limited'].map(label => <th scope="col" key={label}>{label}</th>)}</tr></thead>
   <tbody>{rows.map(row => <tr key={row.day + row.purpose}><td>{row.day}</td><td>{{verify:'Verification', reset:'Recovery', welcome:'Welcome', news:'News', activity:'Activity digest'}[row.purpose]}</td><td>{row.accepted}</td><td>{row.failed}</td><td>{row.limited}</td></tr>)}</tbody>
  </table></div>:!error&&<p>No email attempts recorded.</p>}{error&&<p role="alert" className="file-error">{error}</p>}</section>
}
