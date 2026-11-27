import type { CSSProperties } from 'react'
import { FORUM_CATEGORIES, type ForumCategory } from './forum-contract'
import { DEVICES_BY_ID } from '../devices/registry'
import { apiUrl, assetUrl } from '../hosting'
import { profileHref } from '../routing'
import { CONTRIBUTION_LABELS, ROLE_LABELS, type ContributionRoles, type MemberRole } from './member-standing'

// With `href` the badge links to the topic, the natural next step after reading a thread.
export function ForumCategoryBadge({ category, href }: { category: ForumCategory; href?: string }) {
  const content = <><span aria-hidden="true" />{FORUM_CATEGORIES[category]}</>
  return href ? <a className="forum-category-badge" data-category={category} href={href}>{content}</a> : <span className="forum-category-badge" data-category={category}>{content}</span>
}

export function ForumMachineBadge({ machine }: { machine: string | null }) {
  const device = machine ? DEVICES_BY_ID[machine] : undefined
  return device ? <a className="forum-machine-badge" href={'#forum?machine=' + device.id}>{device.name}</a> : null
}

// Without a picture a member gets a soft two-colour orb: colours, angle and highlight come from a hash of the username,
// so the same member always looks the same. A deleted member gets a flat neutral disc.
function avatarOrb(username: string) {
  let hash = 2166136261
  for (const character of username) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619)
  // Mix the bits once more: plain FNV gives short, similar names the same low bits, and so the same colours.
  hash = Math.imul(hash ^ hash >>> 16, 0x85ebca6b); hash = Math.imul(hash ^ hash >>> 13, 0xc2b2ae35); hash = (hash ^ hash >>> 16) >>> 0
  // The hues sit in wheel order, so index + 3..5 is always a far-away second colour.
  const first = hash % 8, second = (first + 3 + (hash >>> 3) % 3) % 8
  return { '--orb-a': `var(--orb-${first})`, '--orb-b': `var(--orb-${second})`, '--orb-angle': (hash >>> 5) % 360 + 'deg', '--orb-x': 20 + (hash >>> 14) % 60 + '%', '--orb-y': 18 + (hash >>> 20) % 50 + '%' } as CSSProperties
}

// A member's picture when they set one, otherwise their orb.
export function ForumAvatar({ username, official, avatar }: { username: string | null; official?: unknown; avatar?: string | null }) {
  const tone = official ? 'official' : username ? [...username].reduce((sum, character) => sum + character.charCodeAt(0), 0) % 5 : 'neutral'
  const picture = !official && !!username && !!avatar
  return <span className="forum-avatar" data-tone={tone} data-picture={picture || undefined} style={!official && !picture && username ? avatarOrb(username) : undefined} aria-hidden="true">{official ? <img src={assetUrl('modwerk-mark.svg')} alt="" /> : picture ? <img src={apiUrl('/forum/avatars/' + avatar)} alt="" loading="lazy" decoding="async" /> : null}</span>
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
