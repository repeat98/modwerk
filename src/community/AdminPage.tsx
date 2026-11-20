import { PushSettings } from './PushSettings'
import { BackLink } from '../components/BackLink'
import { MaintainerAccess } from './MaintainerAccess'
import { BetaTestersAdmin } from './BetaTestersAdmin'
import { OctatrackDiagnosticsAdmin } from '../components/OctatrackDiagnostics'
import { OctatrackAdmin } from './OctatrackAdmin'
import { MemberRolesAdmin } from './MemberRolesAdmin'
import { ForumModeration } from './ForumModeration'
import { AccountMailHealth, AccountRequestInbox } from './AccountRequests'
import { StatisticsPanel } from './StatisticsPanel'
import { AccountStatistics } from './AccountStatistics'
import { CommunityActivity } from './CommunityActivity'
import { useEffect, useState } from 'react'
import { api, post } from './api'
import { useCommunity } from './context'
import { AdminOverview } from './AdminOverview'
import { adminGroups, adminHref, adminSectionFor, type AdminSection } from './admin-navigation'
import { accountHref } from './member-access'
import { sourceRepository } from '../hosting'
import { ModerationPanel } from './ModerationPanel'
import { IssueInbox } from './IssueInbox'
import { AnnouncementsPanel } from './AnnouncementsPanel'
import { NewsPanel } from './NewsPanel'
import { DiagnosticsMailPanel } from './DiagnosticsMailPanel'
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
function SectionContent({ section, query }: { section: AdminSection; query: URLSearchParams }) {
  const { refresh } = useCommunity()
  switch (section) {
    case 'statistics': return <><AccountStatistics/><StatisticsPanel onNavigate={(section, id) => { window.location.hash = adminHref(section, id) }}/><CommunityActivity/></>
    case 'octatrack': return <><OctatrackAdmin/><OctatrackDiagnosticsAdmin/><DiagnosticsMailPanel/></>
    case 'issues': {
      const moduleId = query.get('module') ?? ''
      const filter = query.get('status')
      const status = filter === 'all' || filter === 'closed' ? filter : 'open'
      return <IssueInbox moduleId={moduleId} status={status}
        onStatus={value => { window.location.hash = adminHref('issues', moduleId, value) }}
        onClearModule={() => { window.location.hash = adminHref('issues', '', status) }}/>
    }
    case 'forum': return <ForumModeration/>
    case 'requests': return <AccountRequestInbox/>
    case 'accounts': return <><MemberRolesAdmin/><BetaTestersAdmin/><MaintainerAccess/><PushSettings topic="signups"/><AccountMailHealth/><AccountStatistics/></>
    case 'comments': return <ModerationPanel/>
    case 'modules': return <PublishedModules onChange={() => void refresh()}/>
    case 'review': return <section className="configuration-section"><h2>Review a contribution</h2>
      <p className="service-note">Module changes are reviewed and merged in the Modwerk repository.</p>
      <div className="forum-actions"><a className="button button-primary" href={(sourceRepository() || 'https://github.com/repeat98/modwerk') + '/pulls'} target="_blank" rel="noreferrer">Open pull requests ↗</a>
        <a className="button button-quiet" href="#submit">Contribution guide</a></div>
    </section>
    case 'announcements': return <AnnouncementsPanel/>
    case 'news': return <NewsPanel/>
    case 'history': return <ReviewHistory/>
  }
}

export function AdminPage({ route }: { route: string }) {
  const { session, loading } = useCommunity()
  const [path, search] = route.split('?')
  const section = adminSectionFor(path)
  const inside = !!section && session.admin
  return <div className="community-page admin-page">
    <BackLink href={inside ? '#admin' : '#forum'}>{inside ? 'Admin workspace' : 'Community forum'}</BackLink>
    <header className="page-heading admin-heading">
      <h1>{inside ? section.label : 'Admin workspace'}</h1>
      {inside && <label className="admin-section-picker">Section
        <select value={section.id} onChange={event => { window.location.hash = event.target.value ? '#admin/' + event.target.value : '#admin' }}>
          <option value="">Workspace overview</option>
          {adminGroups.map(group => <optgroup key={group.label} label={group.label}>
            {group.sections.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
          </optgroup>)}
        </select>
      </label>}
    </header>
    {session.admin ? section ? <SectionContent section={section.id} query={new URLSearchParams(search)}/> : <AdminOverview/>
      : loading ? <p role="status">Checking administrator access…</p>
      : <section className="configuration-section"><h2>Administrators only</h2>
        <p className="service-note">{session.available ? session.user ? 'Your account does not have administrator access.' : 'Sign in with an administrator account to continue.' : 'Community services are unavailable.'}</p>
        {session.available && !session.user ? <a className="button button-primary" href={accountHref('login', route)}>Sign in</a> : <a className="text-button" href="#library">Return to library →</a>}
      </section>}
  </div>
}
