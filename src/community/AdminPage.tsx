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
import { ForumTime } from './ForumTime'
import { AdminViews } from './AdminViews'
import './admin-subpages.css'
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
  return <section className="configuration-section">
    <div className="section-title"><h2>Approved contributions</h2>{!loading && !error && <span className="pill">{items.length}</span>}</div>
    <p className="service-note">Updates stay private until approved. Browser builds follow the pinned catalog.</p>
    {loading && <p role="status">Loading modules…</p>}
    {items.map(item => <article className="admin-contribution" key={item.module_id}>
      <div className="admin-module-row"><div><strong>{item.title}</strong><small>{item.module_id} · @{item.author}</small></div>
        <div className="forum-actions"><a className="text-button" href={item.repository_url} target="_blank" rel="noreferrer">Approved source ↗</a>
          <button className="button button-quiet" disabled={busy} aria-expanded={item.module_id === selected} onClick={() => { setSelected(item.module_id); setNote('') }}>Withdraw</button></div>
      </div>
      {selected === item.module_id && <div className="admin-withdraw"><h3>Withdraw {item.title}</h3>
        <p>This hides the contribution and its media. Discussion and review history are retained. A replacement needs a new approval.</p>
        <label>Reason<textarea value={note} onChange={event => setNote(event.target.value)} maxLength={2000} rows={3}/></label>
        <div className="review-actions"><button className="button button-quiet" disabled={busy} onClick={() => setSelected('')}>Cancel</button>
          <button className="button button-primary" disabled={!note.trim() || busy} onClick={() => void withdraw()}>{busy ? 'Saving…' : 'Withdraw from site'}</button></div>
      </div>}
    </article>)}
    {!loading && !items.length && !error && <p className="admin-empty">No community modules have been approved yet.</p>}
    {error && <p className="file-error" role="alert">{error}</p>}
  </section>
}
function ReviewHistory() {
  const [items, setItems] = useState<ReviewEvent[]>([]), [error, setError] = useState(''), [loading, setLoading] = useState(true)
  useEffect(() => { void api<ReviewEvent[]>('/admin/history').then(setItems).catch(error => setError(error.message)).finally(() => setLoading(false)) }, [])
  return <section className="configuration-section"><h2>Contribution decisions</h2>
    {loading && <p role="status">Loading history…</p>}
    {!!items.length && <ol className="admin-history">{items.map(item => <li key={item.id}>
      <div className="section-title"><strong>{item.module_id}</strong><span className="pill">{item.action}</span></div>
      <small>@{item.actor} · <ForumTime value={item.created_at}/></small>
      {item.note && <p className="preserve-lines">{item.note}</p>}
    </li>)}</ol>}
    {!loading && !items.length && !error && <p className="admin-empty">No review actions recorded yet.</p>}
    {error && <p className="file-error" role="alert">{error}</p>}
  </section>
}
const toolViews = {
  statistics: [
    { id: 'usage', label: 'Site usage', panel: <StatisticsPanel onNavigate={(section, id) => { window.location.hash = adminHref(section, id) }}/> },
    { id: 'members', label: 'Members', panel: <AccountStatistics/> },
    { id: 'activity', label: 'Forum and issues', panel: <CommunityActivity/> },
  ],
  octatrack: [
    { id: 'syncs', label: 'USB activity', panel: <OctatrackAdmin/> },
    { id: 'diagnostics', label: 'Diagnostics', panel: <OctatrackDiagnosticsAdmin/> },
    { id: 'mail', label: 'Tester emails', panel: <DiagnosticsMailPanel/> },
  ],
  accounts: [
    { id: 'roles', label: 'Member roles', panel: <MemberRolesAdmin/> },
    { id: 'beta', label: 'Beta testers', panel: <BetaTestersAdmin/> },
    { id: 'developers', label: 'Developer access', panel: <MaintainerAccess/> },
    { id: 'alerts', label: 'Sign-up alerts', panel: <PushSettings topic="signups"/> },
    { id: 'mail', label: 'Email delivery', panel: <AccountMailHealth/> },
    { id: 'members', label: 'Member statistics', panel: <AccountStatistics/> },
  ],
} as const

function SectionContent({ section, query }: { section: AdminSection; query: URLSearchParams }) {
  const { refresh } = useCommunity()
  const view = query.get('view')
  if (section === 'statistics' || section === 'octatrack' || section === 'accounts') {
    const views = toolViews[section]
    const active = views.find(item => item.id === view) ?? views[0]
    return <><AdminViews section={section} views={views} active={active.id}/>{active.panel}</>
  }
  switch (section) {
    case 'issues': {
      const moduleId = query.get('module') ?? ''
      const filter = query.get('status')
      const status = filter === 'all' || filter === 'closed' ? filter : 'open'
      return <IssueInbox moduleId={moduleId} status={status}
        onStatus={value => { window.location.hash = adminHref('issues', moduleId, value) }}
        onClearModule={() => { window.location.hash = adminHref('issues', '', status) }}/>
    }
    case 'forum': return <ForumModeration reviewed={view === 'reviewed'}/>
    case 'requests': return <AccountRequestInbox archived={view === 'archive'}/>
    case 'comments': return <ModerationPanel/>
    case 'modules': return <PublishedModules onChange={() => void refresh()}/>
    case 'review': return <section className="configuration-section"><h2>Review a contribution</h2>
      <p className="service-note">Module changes are reviewed and merged in the Modwerk repository.</p>
      <div className="forum-actions"><a className="button button-primary" href={(sourceRepository() || 'https://github.com/repeat98/modwerk') + '/pulls'} target="_blank" rel="noreferrer">Open pull requests ↗</a>
        <a className="button button-quiet" href="#submit">Contribution guide</a></div>
      <nav aria-label="Contribution records" className="admin-related"><a href={adminHref('modules')}>Published modules →</a><a href={adminHref('history')}>Review history →</a></nav>
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
    {session.admin ? section ? <div className="admin-subpage"><SectionContent key={section.id} section={section.id} query={new URLSearchParams(search)}/></div> : <AdminOverview/>
      : loading ? <p role="status">Checking administrator access…</p>
      : <section className="configuration-section"><h2>Administrators only</h2>
        <p className="service-note">{session.available ? session.user ? 'Your account does not have administrator access.' : 'Sign in with an administrator account to continue.' : 'Community services are unavailable.'}</p>
        {session.available && !session.user ? <a className="button button-primary" href={accountHref('login', route)}>Sign in</a> : <a className="text-button" href="#library">Return to library →</a>}
      </section>}
  </div>
}
