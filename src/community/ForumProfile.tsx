import { useEffect, useState } from 'react'
import { api } from './api'
import { ForumAvatar, ForumMaintainerBadge, ForumRoleBadge } from './ForumIdentity'
import { ForumTime } from './ForumTime'
import { useCommunity } from './context'
import { Icon } from '../components/Icon'
import { DEVICES_BY_ID } from '../devices/registry'
import type { ForumReplyItem, MemberProfile } from './forum-contract'
import { DETAILS } from '../catalog/details'
import { MODULES } from '../catalog/modules'
import { CardStats } from '../components/ModuleCard'
import { ModulePreview } from '../components/ModulePreview'
import type { ModuleStatistics } from './module-statistics'
import { memberStanding, POINTS, TIERS } from './member-standing'
import { ProfileLinksView } from './ProfileLinksView'

const memberSince = (value: string) => new Date(value.includes('T') ? value : value.replace(' ', 'T') + 'Z').toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
export function ForumProfile({ username, onLoad }: { username: string; onLoad?: (profile: MemberProfile) => void }) {
  const { session } = useCommunity(), [profile, setProfile] = useState<MemberProfile | null>(null), [error, setError] = useState('')
  const canMessage = !!session.user?.verified && session.user.username?.toLowerCase() !== username.toLowerCase()
  useEffect(() => { let cancelled = false; void api<MemberProfile>('/forum/profiles/' + encodeURIComponent(username)).then(value => { if (!cancelled) { setProfile(value); onLoad?.(value) } }).catch(error => { if (!cancelled) setError(error.message) }); return () => { cancelled = true } }, [username, onLoad])
  if (!profile) return <section className="configuration-section forum-profile"><p role={error ? 'alert' : 'status'}>{error || 'Loading member profile…'}</p></section>
  return <><section className="configuration-section forum-profile"><ForumAvatar username={profile.username} avatar={profile.avatar} /><div>
    <h2>{profile.displayName}<ForumRoleBadge role={profile.role} betaTester={profile.betaTester} />{profile.maintains.length > 0 && <ForumMaintainerBadge profile />}</h2>
    <p className="forum-profile-since">@{profile.username} · Member since {memberSince(profile.memberSince)}</p>
    {profile.bio && <p className="profile-bio">{profile.bio}</p>}
    <ProfileLinksView key={profile.username} profile={profile} />
    <dl className="forum-profile-stats"><div><dt>Threads</dt><dd>{profile.threads}</dd></div><div><dt>Replies</dt><dd>{profile.replies}</dd></div><div><dt>Likes received</dt><dd>{profile.likesReceived}</dd></div><div><dt>Bug reports</dt><dd>{profile.reports}</dd></div><div><dt>Modules</dt><dd>{profile.maintains.length}</dd></div></dl>
    <ForumStanding profile={profile} />
    {canMessage && <a className="button button-quiet forum-profile-message" href={'#forum/messages/' + encodeURIComponent(username)}><Icon name="mail" size={15} />Send a message</a>}
  </div></section>
    <MaintainedModules maintains={profile.maintains} /></>
}

/** A member's latest replies, shown beside the threads they started. */
export function ForumProfileReplies({ items }: { items: ForumReplyItem[] }) {
  return <aside className="forum-recent" aria-labelledby="forum-profile-replies-title"><div className="forum-list-heading"><h2 id="forum-profile-replies-title">Recent replies</h2><span>Latest first</span></div>{items.length ? items.map(item => <article key={item.id}><div className="forum-meta"><ForumTime value={item.created_at} relative /></div><h3><a href={'#forum/thread/' + item.thread_id + '?post=' + item.id + '&page=' + item.page}>{item.title}</a></h3><p>{item.excerpt}</p></article>) : <p className="service-note">No replies yet.</p>}</aside>
}

/** The member's tier, points and progress to the next tier, with the rules that earn points. */
function ForumStanding({ profile }: { profile: MemberProfile }) {
  const standing = memberStanding({ ...profile, modules: profile.maintains.length })
  const rules: [string, number][] = [['Thread started', POINTS.thread], ['Reply', POINTS.reply], ['Like from another member', POINTS.like], ['Public bug report', POINTS.report], ['Module maintained', POINTS.module]]
  return <div className="forum-standing" data-tier={standing.tier.id}>
    <div className="forum-standing-head"><span className="forum-standing-tier">{standing.tier.name}</span><span className="forum-standing-rank">Tier {standing.rank} of {TIERS.length}</span><strong>{standing.points.toLocaleString()} <small>points</small></strong></div>
    {standing.next ? <><div className="forum-standing-bar" role="progressbar" aria-label={'Progress to ' + standing.next.name} aria-valuemin={standing.tier.from} aria-valuemax={standing.next.from} aria-valuenow={standing.points}><span style={{ width: Math.round(standing.progress * 100) + '%' }} /></div>
      <p className="forum-standing-next">{(standing.next.from - standing.points).toLocaleString()} points to {standing.next.name}</p></> : <p className="forum-standing-next">Top tier reached</p>}
    <details className="forum-standing-rules"><summary>How points work</summary><ul>{rules.map(([label, points]) => <li key={label}><span>{label}</span><span>+{points}</span></li>)}</ul><p>Tiers: {TIERS.map(tier => tier.name + ' ' + tier.from).join(' · ')}. Removed posts and likes on your own posts do not count.</p></details>
  </div>
}

/** The modules a member maintains, as the library's own cards without the add and compare controls. */
function MaintainedModules({ maintains }: { maintains: MemberProfile['maintains'] }) {
  const [statistics, setStatistics] = useState<ModuleStatistics[] | null>(null)
  useEffect(() => { let cancelled = false; if (maintains.length) void api<ModuleStatistics[]>('/community/summary').then(value => { if (!cancelled) setStatistics(value) }).catch(() => { if (!cancelled) setStatistics(null) }); return () => { cancelled = true } }, [maintains.length])
  if (!maintains.length) return null
  return <section className="forum-profile-modules" aria-labelledby="forum-profile-modules-title"><div className="forum-list-heading"><h2 id="forum-profile-modules-title">Maintained modules</h2><span>{maintains.length}</span></div>
    <div className="module-grid">{maintains.map(item => {
      const module = MODULES.find(candidate => candidate.id === item.id), machine = DEVICES_BY_ID[item.machine]?.name ?? item.machine
      if (!module) return <article key={item.id} className="module-card"><div className="module-card-body"><div className="module-card-heading"><a href={item.href}>{item.name}</a></div><div className="card-bottom"><span>{machine}</span></div></div></article>
      return <article key={item.id} className="module-card">
        <a href={item.href} className="module-cover" aria-label={'View ' + module.name}><ModulePreview id={module.id} /><div className="hover-info"><span>{module.description}</span><strong>Explore module <Icon name="arrow" size={15} /></strong></div></a>
        <div className="module-card-body">
          <div className="module-card-heading"><a href={item.href}>{module.name}</a></div>
          <p className="card-description">{module.description}</p>
          <div className="card-bottom"><span>{DETAILS[module.id].family} · {machine}</span><CardStats statistics={statistics?.find(stats => stats.module_id === module.id)} /></div>
        </div>
      </article>
    })}</div></section>
}
