import { FORUM_CATEGORIES, type ForumCategory } from './forum-contract'
import { DEVICES_BY_ID } from '../devices/registry'
import { apiUrl } from '../hosting'

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
  return <span className="forum-avatar" data-tone={tone} data-picture={picture || undefined} aria-hidden="true">{picture ? <img src={apiUrl('/forum/avatars/' + avatar)} alt="" loading="lazy" decoding="async" /> : official ? 'MW' : username?.slice(0, 2).toUpperCase() ?? '—'}</span>
}

// Official module threads have no public member profile.
export function ForumAuthorName({ username, official, missing = 'Deleted member' }: { username: string | null; official?: unknown; missing?: string }) {
  return official ? <strong>Modwerk</strong> : username ? <a href={'#forum/profile/' + encodeURIComponent(username)}>@{username}</a> : <span>{missing}</span>
}
