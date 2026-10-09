import { PushSettings } from './PushSettings'
import { BackLink } from '../components/BackLink'
import { MaintainerAccess } from './MaintainerAccess'
import { BetaTestersAdmin } from './BetaTestersAdmin'
import { MemberRolesAdmin } from './MemberRolesAdmin'
import { ForumModeration } from './ForumModeration'
import { AccountMailHealth, AccountRequestInbox } from './AccountRequests'
import { StatisticsPanel } from './StatisticsPanel'
import { AccountStatistics } from './AccountStatistics'
import { CommunityActivity } from './CommunityActivity'
import { useEffect, useState } from 'react'
import { api, post } from './api'
import { useCommunity } from './context'
import { SubmissionPage } from './SubmissionPage'
import { ModerationPanel } from './ModerationPanel'
import { IssueInbox } from './IssueInbox'
import { AnnouncementsPanel } from './AnnouncementsPanel'
import { NewsPanel } from './NewsPanel'
import type { PublishedModule } from './api'
type ReviewEvent = { id: string; module_id: string; action: string; note: string; created_at: string; actor: string }
function PublishedModules({ onChange }: { onChange: () => void }) {
  const [items, setItems] = useState<PublishedModule[]>([]), [error, setError] = useState(''), [loading, setLoading] = useState(true), [selected, setSelected] = useState(''), [note, setNote] = useState(''), [busy, setBusy] = useState(false)
  useEffect(() => { void api<PublishedModule[]>('/catalog').then(setItems).catch(error => setError(error.message)).finally(() => setLoading(false)) }, [])
  async function withdraw() { setBusy(true); setError(''); try { await post('/admin/modules/' + selected + '/withdraw', { note }); setItems(await api<PublishedModule[]>('/catalog')); setSelected(''); setNote(''); onChange() } catch (error) { setError(error instanceof Error ? error.message : 'Unable to withdraw module.') } finally { setBusy(false) } }
  return <section className="configuration-section"><h2>Published contributions</h2><p className="service-note">Only approved versions appear here. An update stays private until reviewed. Build integration is separate; the browser engine still follows its pinned catalog.</p>{loading ? <p role="status">Loading modules…</p> : items.map(item => <article className="admin-module-row" key={item.module_id}><div><strong>{item.title}</strong><small>{item.module_id} · @{item.author}</small><a href={item.repository_url} target="_blank" rel="noreferrer">Approved source ↗</a></div><button className="button button-quiet" onClick={() => { setSelected(item.module_id); setNote('') }}>Withdraw</button></article>)}{!loading && !items.length && !error && <p className="service-note">No community modules have been approved yet.</p>}{selected && <div className="admin-withdraw"><h3>Withdraw {items.find(item => item.module_id === selected)?.title}</h3><p>This hides the published contribution and its media. Discussion and review history are retained. A replacement needs a new approval.</p><label>Reason<textarea value={note} onChange={event => setNote(event.target.value)} maxLength={2000} rows={3}/></label><div className="review-actions"><button className="button button-quiet" disabled={busy} onClick={() => setSelected('')}>Cancel</button><button className="button button-primary" disabled={!note.trim() || busy} onClick={() => void withdraw()}>{busy ? 'Saving…' : 'Withdraw from site'}</button></div></div>}{error && <p className="file-error" role="alert">{error}</p>}</section>
}
function ReviewHistory() {
  const [items, setItems] = useState<ReviewEvent[]>([]), [error, setError] = useState(''), [loading, setLoading] = useState(true)
  useEffect(() => { void api<ReviewEvent[]>('/admin/history').then(setItems).catch(error => setError(error.message)).finally(() => setLoading(false)) }, [])
  return <section className="configuration-section"><h2>Review history</h2><p className="service-note">Approvals, rejections and withdrawals record the administrator and their notes.</p>{loading ? <p role="status">Loading history…</p> : items.map(item => <article className="inbox-issue" key={item.id}><div className="section-title"><strong>{item.module_id}</strong><span className="pill">{item.action}</span></div><small>@{item.actor} · {item.created_at}</small><p>{item.note}</p></article>)}{!loading && !items.length && !error && <p className="service-note">No review actions recorded yet.</p>}{error && <p className="file-error" role="alert">{error}</p>}</section>
}
export function AdminPage() {
  const { session, refresh } = useCommunity(), [tab, setTab] = useState('statistics'), [issueModule,setIssueModule] = useState('')
  function navigate(next: string, moduleId = '') { setIssueModule(moduleId); setTab(next) }
  if (!session.admin) return <div className="community-page admin-page"><BackLink href="#forum">Community forum</BackLink><div className="page-heading"><div><p className="page-kicker">MODWERK / ADMIN</p><h1>Admin workspace</h1><p>Moderation and publication history for the site administrator.</p></div></div><section className="configuration-section"><h2>Administrators only</h2><p className="service-note">{session.available ? (session.user ? 'Your account does not have administrator access.' : 'Sign in with an administrator account to continue.') : 'Community services are not connected yet.'}</p>{session.available && !session.user ? <a className="button button-primary" href="#account/login?next=forum">Sign in</a> : <a className="text-button" href="#library">Return to library →</a>}</section></div>
  return <div className="community-page admin-page"><BackLink href="#forum">Community forum</BackLink><div className="page-heading"><div><p className="page-kicker">MODWERK / ADMIN</p><h1>Admin workspace</h1><p>Understand site activity, explore module engagement and manage the community.</p></div></div><nav className="admin-tabs" aria-label="Site management">{[['statistics','Statistics'],['issues','Issues'],['comments','Comments'],['forum','Forum'],['accounts','Accounts'],['modules','Modules'],['review','Module PRs'],['announcements','Announcements'],['news','News'],['history','History']].map(([id,label]) => <button key={id} aria-pressed={tab === id} onClick={() => navigate(id)}>{label}</button>)}</nav>{tab === 'statistics' ? <><AccountStatistics/><StatisticsPanel onNavigate={navigate}/><CommunityActivity/></> : tab === 'review' ? <SubmissionPage/> : tab === 'modules' ? <PublishedModules onChange={() => void refresh()}/> : tab === 'accounts' ? <><PushSettings topic="signups"/><AccountStatistics/><AccountMailHealth/><AccountRequestInbox/><MemberRolesAdmin/><BetaTestersAdmin/><MaintainerAccess/></> : tab === 'forum' ? <ForumModeration/> : tab === 'announcements' ? <AnnouncementsPanel/> : tab === 'news' ? <NewsPanel/> : tab === 'comments' ? <ModerationPanel/> : tab === 'issues' ? <IssueInbox key={issueModule} moduleId={issueModule} onClearModule={() => navigate('issues')}/> : <ReviewHistory/>}</div>
}
