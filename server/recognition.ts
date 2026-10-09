import type { Database } from './platform'
import { COMMUNITY_MODULES, communityModule } from '../src/community/modules'
import { SYSTEM_AUTHOR } from './module-threads'
import { effectiveRole } from '../src/community/member-standing'
import type { ProfileLinks } from '../src/community/profile-links'

/** Members with a public profile: verified, not suspended and finished with sign-up. */
const PUBLIC_MEMBER = "u.email_verified=1 AND u.suspended=0 AND u.username IS NOT NULL AND NOT EXISTS(SELECT 1 FROM social_pending_accounts s WHERE s.user_id=u.id)"
/** The opening post is the thread itself; everything after it is a reply. */
const REPLY = 'p.id<>(SELECT first.id FROM forum_posts first WHERE first.thread_id=t.id ORDER BY first.created_at,first.rowid LIMIT 1)'
const PAGE = '(SELECT CAST(COUNT(*)/30 AS INTEGER) FROM forum_posts preceding WHERE preceding.thread_id=t.id AND (preceding.created_at<p.created_at OR (preceding.created_at=p.created_at AND preceding.rowid<p.rowid))) AS page'
/** A claim confirmed on both sides: the reviewed catalog lists the GitHub handle and the holder verified it with GitHub. */
export const CONFIRMED = 'm.revoked=0 AND d.suspended=0 AND d.github_id IS NOT NULL AND lower(d.github_login)=lower(m.github_login)'

/** A column for a posts query (`p`) that is 1 when the author is a linked maintainer of the module: the developer
 * identity itself or the forum account signed in through the same GitHub account. Manifest handles alone never
 * earn the badge, and a thread without a catalog module binds nothing. */
export function maintainerColumn(moduleId: string | null) {
  const module = moduleId ? communityModule(moduleId) : undefined
  if (!module?.maintainers.length) return { sql: '0', values: [] as string[] }
  const handles = module.maintainers.map(login => login.toLowerCase())
  return { sql: `EXISTS(SELECT 1 FROM module_maintainers m JOIN users d ON d.id=m.user_id WHERE m.module_id=? AND ${CONFIRMED} AND lower(m.github_login) IN (${handles.map(() => '?').join(',')}) AND (d.id=p.user_id OR EXISTS(SELECT 1 FROM auth_accounts g WHERE g.userId=p.user_id AND g.providerId='github' AND g.accountId=d.github_id)))`, values: [module.id, ...handles] }
}

/** Catalog modules a member maintains through a confirmed claim, by their own identity or their GitHub sign-in. */
export async function maintainedByMember(db: Database, userId: string) {
  const rows = (await db.prepare(`SELECT m.module_id,m.github_login FROM module_maintainers m JOIN users d ON d.id=m.user_id WHERE ${CONFIRMED} AND (d.id=? OR EXISTS(SELECT 1 FROM auth_accounts g WHERE g.userId=? AND g.providerId='github' AND g.accountId=d.github_id))`).bind(userId, userId).all<{ module_id: string; github_login: string }>()).results
  return COMMUNITY_MODULES.filter(module => rows.some(row => row.module_id === module.id && module.maintainers.some(login => login.toLowerCase() === row.github_login.toLowerCase())))
    .map(module => ({ id: module.id, name: module.name, machine: module.machine, href: module.href }))
}

type ProfileRow = { id: string; username: string; displayName: string; bio: string; avatar: string | null; memberSince: string; threads: number; replies: number; likesReceived: number; reports: number; role: string } & ProfileLinks
/** A public profile with its contribution counts and latest replies; null when there is no public member by that name. */
export async function memberProfile(db: Database, username: string) {
  const row = await db.prepare(`SELECT u.id,u.username,u.display_name AS displayName,u.profile_bio AS bio,u.avatar_id AS avatar,u.created_at AS memberSince,u.instagram_url AS instagramUrl,u.soundcloud_url AS soundcloudUrl,u.bandcamp_url AS bandcampUrl,
    (SELECT COUNT(*) FROM forum_threads t WHERE t.user_id=u.id AND t.hidden=0) AS threads,
    (SELECT COUNT(*) FROM forum_posts p JOIN forum_threads t ON t.id=p.thread_id WHERE p.user_id=u.id AND p.hidden=0 AND t.hidden=0 AND ${REPLY}) AS replies,
    (SELECT COUNT(*) FROM forum_reactions r JOIN forum_posts p ON p.id=r.post_id JOIN forum_threads t ON t.id=p.thread_id WHERE p.user_id=u.id AND r.user_id<>u.id AND p.hidden=0 AND t.hidden=0) AS likesReceived,
    (SELECT COUNT(*) FROM issues i WHERE i.reporter_id=u.id AND i.public_json IS NOT NULL) AS reports,u.role
    FROM users u WHERE u.username=? AND ${PUBLIC_MEMBER}`).bind(username).first<ProfileRow>()
  if (!row) return null
  const [recentReplies, maintains] = await Promise.all([
    db.prepare(`SELECT p.id,p.thread_id,p.created_at,substr(p.body,1,220) AS excerpt,t.title,${PAGE} FROM forum_posts p JOIN forum_threads t ON t.id=p.thread_id WHERE p.user_id=? AND p.hidden=0 AND t.hidden=0 AND ${REPLY} ORDER BY p.created_at DESC,p.rowid DESC LIMIT 6`).bind(row.id).all(),
    maintainedByMember(db, row.id),
  ])
  const { username: name, displayName, bio, avatar, memberSince, threads, replies, likesReceived, reports, instagramUrl, soundcloudUrl, bandcampUrl } = row
  // Only public reports count: a private report's existence stays between the reporter and the maintainers.
  return { username: name, displayName, bio, avatar, memberSince, instagramUrl, soundcloudUrl, bandcampUrl, role: effectiveRole(row.role, maintains.length > 0), threads, replies, likesReceived, reports, maintains, recentReplies: recentReplies.results }
}

/** The forum home's "This month" block: the most liked posts and reply authors of the last 30 days and the newest
 * members. Hidden posts and threads, suspended members and the official account are left out. */
export async function forumHighlights(db: Database, now = Date.now()) {
  const since = new Date(now - 30 * 86400000).toISOString().slice(0, 19).replace('T', ' ')
  const author = `u.suspended=0 AND u.username IS NOT NULL AND p.user_id<>'${SYSTEM_AUTHOR}'`
  const [posts, members, newest] = await Promise.all([
    db.prepare(`SELECT p.id,p.thread_id,p.created_at,substr(p.body,1,160) AS excerpt,u.username,u.avatar_id AS avatar,t.title,COALESCE(t.section,t.category) AS category,(SELECT COUNT(*) FROM forum_reactions r WHERE r.post_id=p.id) AS likes,${PAGE}
      FROM forum_posts p JOIN forum_threads t ON t.id=p.thread_id JOIN users u ON u.id=p.user_id
      WHERE p.hidden=0 AND t.hidden=0 AND p.created_at>=? AND ${author} AND EXISTS(SELECT 1 FROM forum_reactions r WHERE r.post_id=p.id)
      ORDER BY likes DESC,p.created_at DESC,p.rowid DESC LIMIT 3`).bind(since).all(),
    db.prepare(`SELECT u.username,u.avatar_id AS avatar,COUNT(*) AS likes
      FROM forum_posts p JOIN forum_reactions r ON r.post_id=p.id JOIN forum_threads t ON t.id=p.thread_id JOIN users u ON u.id=p.user_id
      WHERE p.hidden=0 AND t.hidden=0 AND p.created_at>=? AND ${author} AND ${REPLY}
      GROUP BY u.id ORDER BY likes DESC,MIN(p.created_at),u.username LIMIT 3`).bind(since).all(),
    db.prepare(`SELECT u.username,u.avatar_id AS avatar FROM users u WHERE ${PUBLIC_MEMBER} ORDER BY u.created_at DESC,u.rowid DESC LIMIT 5`).all(),
  ])
  return { since, topPosts: posts.results, topMembers: members.results, newMembers: newest.results }
}
