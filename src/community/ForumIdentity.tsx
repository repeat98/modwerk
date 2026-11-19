import { FORUM_CATEGORIES, type ForumCategory } from './forum-contract'
import { DEVICES_BY_ID } from '../devices/registry'
import { apiUrl, assetUrl } from '../hosting'
import { profileHref } from '../routing'
import { CONTRIBUTION_LABELS, ROLE_LABELS, type ContributionRoles, type MemberRole } from './member-standing'

export function ForumCategoryBadge({ category }: { category: ForumCategory }) {
  return <span className="forum-category-badge" data-category={category}><span aria-hidden="true" />{FORUM_CATEGORIES[category]}</span>
}

export function ForumMachineBadge({ machine }: { machine: string | null }) {
  const device = machine ? DEVICES_BY_ID[machine] : undefined
  return device ? <a className="forum-machine-badge" href={'#forum?machine=' + device.id}>{device.name}</a> : null
}

// A member's picture when they set one, otherwise their initials on a colour picked from the username.
export function ForumAvatar({ username, official, avatar }: { username: string | null; official?: unknown; avatar?: string | null }) {
  const tone = official ? 'official' : username ? [...username].reduce((sum, character) => sum + character.charCodeAt(0), 0) % 5 : 'neutral'
  const picture = !official && !!username && !!avatar
  return <span className="forum-avatar" data-tone={tone} data-picture={picture || undefined} aria-hidden="true">{official ? <img src={assetUrl('modwerk-mark.svg')} alt="" /> : picture ? <img src={apiUrl('/forum/avatars/' + avatar)} alt="" loading="lazy" decoding="async" /> : username?.slice(0, 2).toUpperCase() ?? '—'}</span>
}

// Official module threads have no public member profile.
export function ForumAuthorName({ username, official, missing = 'Deleted member' }: { username: string | null; official?: unknown; missing?: string }) {
  return official ? <strong>Modwerk</strong> : username ? <a href={profileHref(username)}>@{username}</a> : <span>{missing}</span>
}

// Only a claim confirmed on both sides earns this: the reviewed catalog names the GitHub handle and the member verified it.
export function ForumMaintainerBadge() {
  return <span className="forum-author-badge forum-maintainer-badge" title="Linked maintainer, confirmed through the module catalog and a GitHub sign-in">Module maintainer</span>
}

// Member roles and the independent beta tester class carry their own badges.
export function ForumRoleBadge({ role, betaTester, contributions }: { role?: MemberRole | null; betaTester?: boolean; contributions?: ContributionRoles }) {
  const showSiteRole = role && role !== 'user' && !(role === 'developer' && contributions?.roles.includes('modder'))
  return <>
    {contributions?.roles.map(kind => <span key={kind} className="forum-role-badge" data-role={kind}>
      {CONTRIBUTION_LABELS[kind]}{kind === 'device-reviewer' && ' · ' + contributions.reviewDevices.map(id => DEVICES_BY_ID[id]?.name ?? id).join(', ')}
    </span>)}
    {showSiteRole && <span className="forum-role-badge" data-role={role}>{ROLE_LABELS[role]}</span>}
    {betaTester && <span className="forum-role-badge" data-role="beta-tester">Beta tester</span>}
  </>
}
