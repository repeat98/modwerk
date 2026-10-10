import { issueStatusStatements } from './issue-notifications'
import type { Database, User } from './platform'
import { ADMIN_ACTOR, needMember, throttle } from './auth'
import { HttpError, jsonBody, required, response } from './security'
import { FORUM_CATEGORIES, forumMachine, REQUEST_STATUSES, sharedConfiguration } from '../src/community/forum-contract'
import { communityModule } from '../src/community/modules'
import { ensureDiscussionThread, ensureModuleThreadsOnce, SYSTEM_AUTHOR } from './module-threads'
import { notifyMentions, notifyPostLike, notifyReplies, notifyRequestStatus } from './notifications'
import { attachMedia, postAttachments } from './forum-media'
import { shoutbox } from './shoutbox'
import { FIRST_UNREAD_FIELDS, FIRST_UNREAD_JOIN, markForumRead, noteForumVisit, recordThreadRead, UNREAD, UNREAD_FIELDS, UNREAD_JOINS } from './forum-unread'
import { forumHighlights, maintainerColumn, memberProfile } from './recognition'
import { betaTesterIds } from './beta-testers'
import { adminRoleRoutes, memberRoles } from './member-roles'
import { worksReportCount } from './hardware-reports'

type Thread = {id:string;user_id:string;category:string;section:string|null;module_id:string|null;request_status:string;locked:number;hidden:number;configuration_json:string|null;issue_json:string|null}
/** Public configuration threads (alias t) whose snapshot includes a module: binds the snapshot machine, then the native module ID.
 * Snapshots without a machine are Octatrack. */
export const SHARED_CONFIGURATIONS = "t.category='configs' AND t.hidden=0 AND t.configuration_json IS NOT NULL AND COALESCE(json_extract(t.configuration_json,'$.device'),'octatrack')=? AND EXISTS(SELECT 1 FROM json_each(t.configuration_json,'$.moduleIds') WHERE json_each.value=?)"
export function sharedConfigurationBinds(moduleId: string | null) { const module = moduleId ? communityModule(moduleId) : undefined; return [module?.machine ?? '', module?.moduleId ?? ''] }
/** `forum_posts.hidden` for a deleted post: hidden like a moderated one, but its text is erased, it is never listed and it cannot be restored. */
const POST_DELETED=2
/** Deletes a reply but keeps its row, which notifications and reports refer to: the text is erased, its files are queued for the hourly bucket cleanup and its reports are closed. */
function deletePost(db:Database,postId:string){return [
  db.prepare(`UPDATE forum_posts SET body='',hidden=${POST_DELETED},edited_at=NULL WHERE id=? AND hidden<${POST_DELETED}`).bind(postId),
  db.prepare('UPDATE forum_media SET removed=1 WHERE post_id=?').bind(postId),
  db.prepare('UPDATE forum_reports SET resolved=1 WHERE post_id=?').bind(postId),
]}
/** The first post is the thread itself: deleting it would leave replies without their subject. */
async function isOpeningPost(db:Database,threadId:string,postId:string){return (await db.prepare('SELECT id FROM forum_posts WHERE thread_id=? ORDER BY created_at,rowid LIMIT 1').bind(threadId).first<{id:string}>())?.id===postId}
function page(url: URL) { const value = Number(url.searchParams.get('page') ?? 0); if (!Number.isInteger(value) || value < 0 || value > 10000) throw new HttpError(400,'Invalid page.'); return value }
/** The thread's first post: its hearts are the votes on a feature request. */
const OPENING_POST='(SELECT p.id FROM forum_posts p WHERE p.thread_id=t.id ORDER BY p.created_at,p.rowid LIMIT 1)'
const threadFields = `t.id,t.title,COALESCE(t.section,t.category) AS category,t.machine,t.module_id,t.status,t.request_status,(SELECT COUNT(*) FROM forum_reactions r WHERE r.post_id=${OPENING_POST}) AS votes,t.locked,t.pinned,t.created_at,t.updated_at,u.username,u.avatar_id AS avatar,t.user_id='${SYSTEM_AUTHOR}' AS official,(SELECT MAX(COUNT(*)-1,0) FROM forum_posts p WHERE p.thread_id=t.id AND p.hidden=0) AS replies,(SELECT GROUP_CONCAT(DISTINCT m.kind) FROM forum_media m JOIN forum_posts mp ON mp.id=m.post_id WHERE mp.thread_id=t.id AND m.removed=0 AND mp.hidden=0) AS media_kinds`
async function threadById(db: Database, id: string, admin: boolean) {
  const thread = await db.prepare('SELECT * FROM forum_threads WHERE id=? AND (hidden=0 OR ?=1)').bind(id, Number(admin)).first<Thread>()
  if (!thread) throw new HttpError(404,'Thread not found.')
  return thread
}
/** A member who claimed the module as its maintainer, or whose GitHub sign-in is the developer identity that did; the catalog must still list the handle. */
async function maintainsModule(db: Database, moduleId: string|null, userId: string) {
  const module = moduleId ? communityModule(moduleId) : undefined, handles = module?.maintainers.map(login => login.toLowerCase()) ?? []
  if (!module || !handles.length) return false
  return !!await db.prepare(`SELECT 1 FROM module_maintainers m JOIN users d ON d.id=m.user_id WHERE m.module_id=? AND m.revoked=0 AND d.suspended=0 AND lower(d.github_login)=lower(m.github_login) AND lower(m.github_login) IN (${handles.map(() => '?').join(',')}) AND (m.user_id=? OR EXISTS(SELECT 1 FROM auth_accounts g WHERE g.userId=? AND g.providerId='github' AND g.accountId=d.github_id))`).bind(module.id, ...handles, userId, userId).first()
}
function bool(value: unknown) { if (typeof value !== 'boolean') throw new HttpError(400,'Choose on or off.'); return Number(value) }
function cleanBody(value: unknown) { return required(value,'Post',12000) }
async function moduleId(db: Database, value: unknown) {
  if (value === '' || value === undefined || value === null) return null
  if (typeof value !== 'string') throw new HttpError(400,'Choose a known module.')
  if (!communityModule(value)) { try { await ensureDiscussionThread(db,value) } catch(error) { if(error instanceof HttpError&&error.status===404)throw new HttpError(400,'Choose a known module.'); throw error } }
  return value
}
export async function forum(request: Request, db: Database, user: User|null, admin: boolean, adminId: string|null = admin ? ADMIN_ACTOR : null): Promise<Response|null> {
  const url = new URL(request.url), path = url.pathname
  if (!path.startsWith('/api/forum') && !path.startsWith('/api/admin/forum')) return null
  const chat = await shoutbox(request,db,user,admin)
  if (chat) return chat
  await ensureModuleThreadsOnce(db)
  const home=path.match(/^\/api\/forum\/threads\/module-([a-z0-9-]+)(?:\/(?:replies|follow|bookmark|status))?$/)
  if(home&&!await db.prepare('SELECT id FROM forum_threads WHERE id=?').bind('module-'+home[1]).first())await ensureDiscussionThread(db,home[1])
  let match: RegExpMatchArray|null
  if (path.startsWith('/api/admin/forum')) {
    if (!admin) throw new HttpError(403,'Administrator access is required.')
    if (path === '/api/admin/forum/reports' && request.method === 'GET') return response((await db.prepare(`SELECT * FROM (SELECT r.id,r.reason,r.resolved,r.created_at,p.id AS post_id,p.body,p.hidden,p.thread_id,p.user_id,u.username,t.title,'post' AS kind FROM forum_reports r JOIN forum_posts p ON p.id=r.post_id JOIN forum_threads t ON t.id=p.thread_id JOIN users u ON u.id=p.user_id
      UNION ALL SELECT r.id,r.reason,r.resolved,r.created_at,s.id AS post_id,s.body,s.hidden,NULL AS thread_id,s.user_id,u.username,'Shoutbox' AS title,'shout' AS kind FROM forum_shout_reports r JOIN forum_shouts s ON s.id=r.shout_id JOIN users u ON u.id=s.user_id
      UNION ALL SELECT r.id,r.reason,r.resolved,r.created_at,(SELECT m.id FROM messages m WHERE m.conversation_id=r.conversation_id AND m.user_id<>r.user_id ORDER BY m.created_at DESC,m.rowid DESC LIMIT 1) AS post_id,(SELECT m.body FROM messages m WHERE m.conversation_id=r.conversation_id AND m.user_id<>r.user_id ORDER BY m.created_at DESC,m.rowid DESC LIMIT 1) AS body,(SELECT m.hidden FROM messages m WHERE m.conversation_id=r.conversation_id AND m.user_id<>r.user_id ORDER BY m.created_at DESC,m.rowid DESC LIMIT 1) AS hidden,r.conversation_id AS thread_id,cm.user_id,u.username,'Direct message' AS title,'message' AS kind FROM message_reports r JOIN conversation_members cm ON cm.conversation_id=r.conversation_id AND cm.user_id<>r.user_id JOIN users u ON u.id=cm.user_id) ORDER BY resolved,created_at DESC LIMIT 100`).all()).results)
    if (path === '/api/admin/forum/history' && request.method === 'GET') return response((await db.prepare('SELECT m.id,m.target,m.action,m.reason,m.created_at,u.display_name AS actor FROM forum_moderation m JOIN users u ON u.id=m.actor_id ORDER BY m.rowid DESC LIMIT 100').all()).results)
    if ((match = path.match(/^\/api\/admin\/forum\/messages\/([a-f0-9-]{36})$/)) && request.method === 'GET') {
      // A private conversation opens for the administrator only after one of its members reported it.
      if (!await db.prepare('SELECT 1 FROM message_reports WHERE conversation_id=?').bind(match[1]).first()) throw new HttpError(404,'Only reported conversations can be opened.')
      return response((await db.prepare('SELECT m.id,m.body,m.hidden,m.created_at,u.username FROM messages m JOIN users u ON u.id=m.user_id WHERE m.conversation_id=? ORDER BY m.created_at,m.rowid LIMIT 200').bind(match[1]).all()).results)
    }
    if ((match = path.match(/^\/api\/admin\/forum\/(posts|threads|users|reports|media|shouts|shout-reports|messages|message-reports)\/([a-zA-Z0-9-]+)$/)) && request.method === 'PATCH') {
      const body = await jsonBody(request), reason = required(body.reason,'Moderation reason',1000), target = match[2]
      const allowed = match[1] === 'posts' ? ['hidden','deleted'] : (match[1] === 'shouts' || match[1] === 'messages') ? ['hidden'] : match[1] === 'threads' ? ['locked','pinned','hidden'] : match[1] === 'users' ? ['suspended'] : match[1] === 'media' ? ['removed'] : ['resolved']
      if (typeof body.action !== 'string' || !allowed.includes(body.action)) throw new HttpError(400,'Unknown moderation action.')
      const value = bool(body.value), table = {posts:'forum_posts',threads:'forum_threads',users:'users',reports:'forum_reports',media:'forum_media',shouts:'forum_shouts','shout-reports':'forum_shout_reports',messages:'messages','message-reports':'message_reports'}[match[1]]!
      // The hourly job deletes removed files from the bucket, so removal cannot be undone.
      if (match[1] === 'media' && !value) throw new HttpError(400,'Removed files cannot be restored.')
      if (target === ADMIN_ACTOR || target === SYSTEM_AUTHOR) throw new HttpError(400,'This system account cannot be suspended.')
      const log = (guard='') => db.prepare(`INSERT INTO forum_moderation(id,actor_id,target,action,reason) SELECT ?,?,?,?,? WHERE EXISTS(SELECT 1 FROM ${table} WHERE id=?${guard})`).bind(crypto.randomUUID(),adminId??ADMIN_ACTOR,target,`${body.action}:${value}`,reason,target)
      if (body.action === 'deleted') {
        const post = await db.prepare('SELECT thread_id FROM forum_posts WHERE id=? AND hidden<?').bind(target,POST_DELETED).first<{thread_id:string}>()
        if (!post) throw new HttpError(404,'Item not found.')
        if (await isOpeningPost(db,post.thread_id,target)) throw new HttpError(409,'The first post of a thread cannot be deleted. Hide or lock the thread instead.')
        await db.batch([...deletePost(db,target),log()])
        return response({ok:true})
      }
      // A deleted post has no text left to restore.
      const guard = match[1] === 'posts' ? ` AND hidden<${POST_DELETED}` : ''
      const result = await db.batch([
        db.prepare(`UPDATE ${table} SET ${body.action}=? WHERE id=?${guard}`).bind(value,target),
        log(guard),
        ...(body.action === 'suspended' && value ? [db.prepare('DELETE FROM sessions WHERE user_id=?').bind(target),db.prepare('DELETE FROM auth_sessions WHERE userId=?').bind(target),db.prepare('DELETE FROM developer_sessions WHERE user_id=?').bind(target),db.prepare('DELETE FROM developer_auth_codes WHERE user_id=?').bind(target)] : []),
      ])
      if (!(result[0] as {meta:{changes:number}}).meta.changes) throw new HttpError(404,'Item not found.')
      return response({ok:true})
    }
    const roles = await adminRoleRoutes(request,db,path,adminId??ADMIN_ACTOR)
    if (roles) return roles
    throw new HttpError(404,'Moderation route not found.')
  }
  if (path === '/api/forum/threads' && request.method === 'GET') {
    const category = url.searchParams.get('category') ?? '', module = await moduleId(db,url.searchParams.get('module')), query = (url.searchParams.get('q') ?? '').trim().slice(0,120), saved = url.searchParams.get('saved') === '1', following = url.searchParams.get('following') === '1', unread = url.searchParams.get('unread') === '1', author = url.searchParams.get('author') ?? ''
    // Feature requests list the most voted first unless an order is chosen; the other topics stay on recent activity.
    const sort = url.searchParams.get('sort') ?? (category === 'requests' ? 'top' : 'active'), status = url.searchParams.get('status') ?? ''
    const view = url.searchParams.get('view') ?? 'community'
    if (!['community','modules'].includes(view)) throw new HttpError(400,'Choose a supported discussion view.')
    if (!['active','newest','top'].includes(sort)) throw new HttpError(400,'Choose a supported discussion order.')
    if (category && !Object.hasOwn(FORUM_CATEGORIES,category)) throw new HttpError(400,'Unknown category.')
    if (status && !Object.hasOwn(REQUEST_STATUSES,status)) throw new HttpError(400,'Choose a request status.')
    let machine: string | null
    try { machine = forumMachine(url.searchParams.get('machine')) } catch { throw new HttpError(400,'Unknown machine.') }
    if (saved || following || unread) needMember(user)
    // Signed-in members see which threads hold replies they have not read; anonymous readers run the plain query.
    const reader = user?.email_verified && !user.suspended ? user.id : null
    // Personal lists retain module homes the member has chosen to follow or save.
    const authorScope = view === 'modules' ? `AND t.user_id='${SYSTEM_AUTHOR}'` : saved || following ? '' : `AND t.user_id<>'${SYSTEM_AUTHOR}'`
    const escaped = '%' + query.replace(/[\\%_]/g, '\\$&') + '%'
    const rows = (await db.prepare(`SELECT ${threadFields},${reader?UNREAD_FIELDS+',':''}
      lp.id AS last_post_id,lu.username AS last_username,substr(lp.body,1,160) AS last_excerpt,
      (SELECT CAST(COUNT(*)/30 AS INTEGER) FROM forum_posts preceding WHERE preceding.thread_id=t.id AND (preceding.created_at<lp.created_at OR (preceding.created_at=lp.created_at AND preceding.rowid<lp.rowid))) AS last_post_page
      FROM forum_threads t JOIN users u ON u.id=t.user_id
      LEFT JOIN forum_posts lp ON lp.id=(SELECT p.id FROM forum_posts p WHERE p.thread_id=t.id AND p.hidden=0 ORDER BY p.created_at DESC,p.rowid DESC LIMIT 1)
      LEFT JOIN users lu ON lu.id=lp.user_id ${reader?UNREAD_JOINS:''}
      WHERE t.hidden=0 ${authorScope} AND (?='' OR COALESCE(t.section,t.category)=?) AND (?='' OR t.request_status=?) AND (? IS NULL OR t.machine=?) AND (? IS NULL OR t.module_id=? OR (${SHARED_CONFIGURATIONS})) AND (?='' OR u.username=?) AND (?=0 OR EXISTS(SELECT 1 FROM forum_bookmarks b WHERE b.thread_id=t.id AND b.user_id=?))
      AND (?=0 OR EXISTS(SELECT 1 FROM forum_follows f WHERE f.thread_id=t.id AND f.user_id=?)) ${reader&&unread?'AND '+UNREAD:''}
      AND (?='' OR t.title LIKE ? ESCAPE '\\' OR EXISTS(SELECT 1 FROM forum_posts p WHERE p.thread_id=t.id AND p.hidden=0 AND p.body LIKE ? ESCAPE '\\'))
      ORDER BY t.pinned DESC,${sort==='top'?'votes DESC,t.updated_at':sort==='newest'?'t.created_at':'t.updated_at'} DESC,t.id LIMIT 31 OFFSET ?`)
      .bind(...(reader?[reader,reader]:[]),category,category,status,status,machine,machine,module,module,...sharedConfigurationBinds(module),author,author,Number(saved),user?.id??'',Number(following),user?.id??'',query,escaped,escaped,page(url)*30).all()).results
    return response({threads:rows.slice(0,30),hasMore:rows.length>30})
  }
  if (path === '/api/forum/categories' && request.method === 'GET') {
    let machine: string | null
    try { machine=forumMachine(url.searchParams.get('machine')) } catch { throw new HttpError(400,'Unknown machine.') }
    return response((await db.prepare(`SELECT COALESCE(t.section,t.category) AS category,COUNT(*) AS threads,
      SUM((SELECT MAX(COUNT(*)-1,0) FROM forum_posts p WHERE p.thread_id=t.id AND p.hidden=0)) AS replies
      FROM forum_threads t WHERE t.hidden=0 AND t.user_id<>'${SYSTEM_AUTHOR}' AND (? IS NULL OR t.machine=?) GROUP BY COALESCE(t.section,t.category)`).bind(machine,machine).all()).results)
  }
  if (path === '/api/forum/recent-posts' && request.method === 'GET') {
    let machine: string | null
    try { machine=forumMachine(url.searchParams.get('machine')) } catch { throw new HttpError(400,'Unknown machine.') }
    return response((await db.prepare(`SELECT p.id,p.thread_id,p.created_at,substr(p.body,1,220) AS excerpt,u.username,u.avatar_id AS avatar,p.user_id='${SYSTEM_AUTHOR}' AS official,t.title,COALESCE(t.section,t.category) AS category,t.machine,
      (SELECT CAST(COUNT(*)/30 AS INTEGER) FROM forum_posts preceding WHERE preceding.thread_id=t.id AND (preceding.created_at<p.created_at OR (preceding.created_at=p.created_at AND preceding.rowid<p.rowid))) AS page
      FROM forum_posts p JOIN forum_threads t ON t.id=p.thread_id JOIN users u ON u.id=p.user_id
      WHERE p.hidden=0 AND t.hidden=0 AND t.user_id<>'${SYSTEM_AUTHOR}' AND (? IS NULL OR t.machine=?)
      AND p.id<>(SELECT first.id FROM forum_posts first WHERE first.thread_id=t.id ORDER BY first.created_at,first.rowid LIMIT 1)
      ORDER BY p.created_at DESC,p.rowid DESC LIMIT 6`).bind(machine,machine).all()).results)
  }
  // The newest visible posts with images or sound clips, module threads included; bug reports are not showcase material.
  if (path === '/api/forum/showcase' && request.method === 'GET') {
    let machine: string | null
    try { machine=forumMachine(url.searchParams.get('machine')) } catch { throw new HttpError(400,'Unknown machine.') }
    const category = url.searchParams.get('category')
    if (category !== null && (!Object.hasOwn(FORUM_CATEGORIES,category) || category === 'issues')) throw new HttpError(400,'Unknown category.')
    const posts = (await db.prepare(`SELECT p.id,p.thread_id,p.created_at,u.username,u.avatar_id AS avatar,p.user_id='${SYSTEM_AUTHOR}' AS official,t.title,COALESCE(t.section,t.category) AS category,t.machine,
      (SELECT CAST(COUNT(*)/30 AS INTEGER) FROM forum_posts preceding WHERE preceding.thread_id=t.id AND (preceding.created_at<p.created_at OR (preceding.created_at=p.created_at AND preceding.rowid<p.rowid))) AS page
      FROM forum_posts p JOIN forum_threads t ON t.id=p.thread_id JOIN users u ON u.id=p.user_id
      WHERE p.id IN (SELECT m.post_id FROM forum_media m WHERE m.removed=0 AND m.post_id IS NOT NULL)
      AND p.hidden=0 AND t.hidden=0 AND t.category<>'issues' AND (? IS NULL OR t.machine=?) AND (? IS NULL OR COALESCE(t.section,t.category)=?)
      ORDER BY p.created_at DESC,p.rowid DESC LIMIT 12`).bind(machine,machine,category,category).all<{id:string}>()).results
    const attachments = await postAttachments(db,posts.map(post=>post.id))
    return response(posts.map(post=>({...post,attachments:attachments.get(post.id)??[]})))
  }

  if (path === '/api/forum/visit' && request.method === 'GET') return response(await noteForumVisit(db,needMember(user).id))
  if (path === '/api/forum/machines' && request.method === 'GET') {
    return response((await db.prepare('SELECT machine,COUNT(*) AS threads,MAX(updated_at) AS updated_at FROM forum_threads WHERE hidden=0 AND user_id<>? AND machine IS NOT NULL GROUP BY machine').bind(SYSTEM_AUTHOR).all()).results)
  }
  if (path === '/api/forum/members' && request.method === 'GET') {
    // Name suggestions while typing @ in a composer: members only, by prefix, eight names, never the asker.
    const asker = needMember(user), prefix = (url.searchParams.get('q') ?? '').trim().toLowerCase()
    if (!/^[a-z0-9_]{0,24}$/.test(prefix)) throw new HttpError(400,'Usernames use letters, numbers and underscores.')
    return response((await db.prepare(`SELECT u.username,u.display_name AS displayName,u.avatar_id AS avatar FROM users u WHERE u.username LIKE ? ESCAPE '\\' AND u.id<>? AND u.email_verified=1 AND u.suspended=0 AND u.username IS NOT NULL AND NOT EXISTS(SELECT 1 FROM social_pending_accounts s WHERE s.user_id=u.id) ORDER BY u.username LIMIT 8`).bind(prefix.replace(/[\\%_]/g,'\\$&')+'%',asker.id).all()).results)
  }
  // Public and cacheable: the block changes slowly and the page is read on every forum visit.
  if (path === '/api/forum/highlights' && request.method === 'GET') {
    return Response.json(await forumHighlights(db),{headers:{'Cache-Control':'public, max-age=300','X-Content-Type-Options':'nosniff'}})
  }
  if ((match=path.match(/^\/api\/forum\/profiles\/([a-z0-9_]{3,24})$/)) && request.method === 'GET') {
    const profile = await memberProfile(db,match[1])
    if (!profile) throw new HttpError(404,'Profile not found.')
    return response(profile)
  }
  if ((match=path.match(/^\/api\/forum\/threads\/([a-zA-Z0-9-]+)$/)) && request.method === 'GET') {
    const thread = await threadById(db,match[1],admin), reader=user?.email_verified&&!user.suspended?user.id:null
    const maintainer = maintainerColumn(thread.module_id)
    // A member's view also asks where their reading left off, before this page moves the marker to its last post.
    const [details,pagePosts] = await Promise.all([
      db.prepare(`SELECT ${threadFields},t.hidden,${worksReportCount('t.module_id')} AS worksReports,
        EXISTS(SELECT 1 FROM forum_follows f WHERE f.thread_id=t.id AND f.user_id=?) AS following,
        EXISTS(SELECT 1 FROM forum_bookmarks b WHERE b.thread_id=t.id AND b.user_id=?) AS bookmarked,
        EXISTS(SELECT 1 FROM forum_reactions r WHERE r.user_id=? AND r.post_id=${OPENING_POST}) AS voted${reader?','+FIRST_UNREAD_FIELDS:''}
        FROM forum_threads t JOIN users u ON u.id=t.user_id ${reader?UNREAD_JOINS+' '+FIRST_UNREAD_JOIN:''} WHERE t.id=?`).bind(user?.id??null,user?.id??null,user?.id??null,...(reader?[reader,reader]:[]),thread.id).first<Record<string,unknown>&{following:number;bookmarked:number;voted:number;first_unread_id?:string|null;first_unread_page?:number|null}>(),
      db.prepare(`SELECT p.*,u.username,u.avatar_id AS avatar,u.display_name AS displayName,(SELECT COUNT(*) FROM forum_reactions r WHERE r.post_id=p.id) AS likes,EXISTS(SELECT 1 FROM forum_reactions r WHERE r.post_id=p.id AND r.user_id=?) AS liked,${maintainer.sql} AS maintainer FROM forum_posts p JOIN users u ON u.id=p.user_id WHERE p.thread_id=? AND p.hidden<2 ORDER BY p.created_at,p.rowid LIMIT 31 OFFSET ?`).bind(user?.id??'',...maintainer.values,thread.id,page(url)*30).all<{id:string;user_id:string;hidden:number;body:string;username:string;avatar:string|null;displayName:string;created_at:string;edited_at:string|null;likes:number;liked:number;maintainer:number}>(),
    ])
    if(!details)throw new HttpError(404,'Thread not found.')
    const {following:followed,bookmarked:saved,voted,first_unread_id:unreadId,first_unread_page:unreadPage,...summary}=details
    const posts=pagePosts.results,following=!!followed,bookmarked=!!saved,last=posts.slice(0,30).at(-1)
    if(reader&&last)await recordThreadRead(db,reader,thread.id,last.id).run()
    const request=(thread.section??thread.category)==='requests'
    const canSetRequestStatus=request&&!!user?.email_verified&&!user.suspended&&(admin||await maintainsModule(db,thread.module_id,user.id))
    const [attachments,roles,betaTesters] = await Promise.all([postAttachments(db,posts.slice(0,30).filter(post=>admin||!post.hidden).map(post=>post.id)),memberRoles(db,posts.slice(0,30).filter(post=>!post.hidden&&post.user_id!==SYSTEM_AUTHOR).map(post=>post.user_id)),betaTesterIds(db,posts.slice(0,30).filter(post=>!post.hidden&&post.user_id!==SYSTEM_AUTHOR).map(post=>post.user_id))])
    return response({thread:summary,posts:posts.slice(0,30).map(post=>({attachments:attachments.get(post.id)??[],canRemoveMedia:!post.hidden&&post.user_id===user?.id&&!!user?.email_verified,id:post.id,body:post.hidden&&!admin?'':post.body,username:post.hidden&&!admin?null:post.username,avatar:post.hidden&&!admin?null:post.avatar,displayName:post.hidden&&!admin?null:post.displayName,created_at:post.created_at,edited_at:post.edited_at,hidden:post.hidden,likes:post.hidden?0:post.likes,liked:!post.hidden&&!!post.liked,canEdit:!thread.locked&&!post.hidden&&post.user_id===user?.id&&!!user?.email_verified,official:post.user_id===SYSTEM_AUTHOR,maintainer:!post.hidden&&!!post.maintainer,role:roles.get(post.user_id)??null,betaTester:betaTesters.has(post.user_id),...(admin?{user_id:post.user_id}:{})})),configuration:thread.configuration_json?JSON.parse(thread.configuration_json):null,issue:thread.issue_json?JSON.parse(thread.issue_json):null,following,bookmarked,voted:!!voted,canSetRequestStatus,hasMore:posts.length>30,...(reader?{firstUnread:unreadId?{id:unreadId,page:unreadPage??0}:null}:{})})
  }
  const member = needMember(user)
  await throttle(db,'forum:'+member.id,60)
  await throttle(db,'forum-ip:'+(request.headers.get('CF-Connecting-IP')??'local'),120)
  const body = await jsonBody(request)
  if (path === '/api/forum/read-all' && request.method === 'POST') { await markForumRead(db,member.id); return response({ok:true}) }
  if (path === '/api/forum/threads' && request.method === 'POST') {
    await throttle(db,'new-thread:'+member.id,10)
    if (body.category === 'issues' || body.issue !== undefined) throw new HttpError(400,'Use “Report an issue” on the affected module’s page to report a bug. Discussions are for questions, tips and feedback.')
    if (typeof body.category !== 'string' || !Object.hasOwn(FORUM_CATEGORIES,body.category)) throw new HttpError(400,'Choose a category.')
    const title=required(body.title,'Title',160), content=cleanBody(body.body), module=await moduleId(db,body.moduleId), id=crypto.randomUUID(), postId=crypto.randomUUID()
    let machine: string | null
    try { machine = forumMachine(body.machine) } catch (error) { throw new HttpError(400, error instanceof Error ? error.message : 'Unknown machine.') }
    const moduleMachine = module ? communityModule(module)?.machine??(module.startsWith('remix-')?'octatrack':null) : null
    if (moduleMachine && machine && machine !== moduleMachine) throw new HttpError(400,'The module belongs to a different machine.')
    let config=null
    if(body.category==='configs'){try{config=sharedConfiguration(body.configuration)}catch(error){throw new HttpError(400,error instanceof Error?error.message:'Invalid configuration.')}}
    else if(body.configuration!==undefined)throw new HttpError(400,'Shared configurations belong in the configurations category.')
    const configMachine = config ? config.device ?? 'octatrack' : null
    if (configMachine && ((machine && machine !== configMachine) || (moduleMachine && moduleMachine !== configMachine))) throw new HttpError(400,'The configuration belongs to a different machine.')
    const media = await attachMedia(db,member.id,postId,body.attachments)
    await db.batch([
      db.prepare('INSERT INTO forum_threads(id,user_id,title,category,section,machine,module_id,configuration_json) VALUES(?,?,?,?,?,?,?,?)').bind(id,member.id,title,['introductions','showcase','requests','tutorials'].includes(body.category)?'general':body.category,['introductions','showcase','requests','tutorials'].includes(body.category)?body.category:null,machine ?? moduleMachine ?? configMachine,module,config?JSON.stringify(config):null),
      db.prepare('INSERT INTO forum_posts(id,thread_id,user_id,body) VALUES(?,?,?,?)').bind(postId,id,member.id,content),
      ...media,
      db.prepare('INSERT INTO forum_follows(thread_id,user_id) VALUES(?,?)').bind(id,member.id),
      ...notifyMentions(db,content,id,postId,member.id),
    ])
    return response({id},201)
  }
  if ((match=path.match(/^\/api\/forum\/threads\/([a-zA-Z0-9-]+)\/(replies|follow|bookmark|status|vote|request-status)$/))) {
    const thread = await threadById(db,match[1],false), action=match[2]
    if(action==='replies'&&request.method==='POST'){
      if(thread.locked)throw new HttpError(409,'This thread is locked.')
      const text=cleanBody(body.body),id=crypto.randomUUID(),media=await attachMedia(db,member.id,id,body.attachments)
      const result=await db.batch([
        db.prepare('INSERT INTO forum_posts(id,thread_id,user_id,body) SELECT ?,?,?,? WHERE EXISTS(SELECT 1 FROM forum_threads WHERE id=? AND locked=0 AND hidden=0)').bind(id,thread.id,member.id,text,thread.id),
        ...media,
        db.prepare('UPDATE forum_threads SET updated_at=CURRENT_TIMESTAMP WHERE id=? AND EXISTS(SELECT 1 FROM forum_posts WHERE id=?)').bind(thread.id,id),
        ...notifyMentions(db,text,thread.id,id,member.id),
        notifyReplies(db,thread.id,id,member.id),
        db.prepare('INSERT INTO forum_follows(thread_id,user_id) SELECT ?,? WHERE EXISTS(SELECT 1 FROM forum_posts WHERE id=?) ON CONFLICT DO NOTHING').bind(thread.id,member.id,id),
      ])
      if(!(result[0] as {meta:{changes:number}}).meta.changes)throw new HttpError(409,'This thread is locked or unavailable.')
      const position=await db.prepare('SELECT CAST(COUNT(*)/30 AS INTEGER) AS page FROM forum_posts preceding JOIN forum_posts posted ON posted.id=? WHERE preceding.thread_id=posted.thread_id AND (preceding.created_at<posted.created_at OR (preceding.created_at=posted.created_at AND preceding.rowid<posted.rowid))').bind(id).first<{page:number}>()
      return response({id,page:position?.page??0},201)
    }
    if((action==='follow'||action==='bookmark')&&request.method==='POST'){
      const table=action==='follow'?'forum_follows':'forum_bookmarks'
      if(bool(body.enabled))await db.prepare(`INSERT INTO ${table}(thread_id,user_id) VALUES(?,?) ON CONFLICT DO NOTHING`).bind(thread.id,member.id).run()
      else await db.prepare(`DELETE FROM ${table} WHERE thread_id=? AND user_id=?`).bind(thread.id,member.id).run()
      return response({ok:true})
    }
    // A vote is the heart on the opening post, so it counts, notifies and withdraws like any other like.
    if(action==='vote'&&request.method==='POST'){
      const opening=await db.prepare('SELECT id,hidden FROM forum_posts WHERE thread_id=? ORDER BY created_at,rowid LIMIT 1').bind(thread.id).first<{id:string;hidden:number}>()
      if(!opening||opening.hidden)throw new HttpError(409,'This discussion is unavailable.')
      const liked=!!bool(body.enabled)
      await db.batch([
        liked?db.prepare('INSERT INTO forum_reactions(post_id,user_id) VALUES(?,?) ON CONFLICT DO NOTHING').bind(opening.id,member.id):db.prepare('DELETE FROM forum_reactions WHERE post_id=? AND user_id=?').bind(opening.id,member.id),
        notifyPostLike(db,opening.id,member.id,liked),
      ])
      return response({ok:true})
    }
    if(action==='request-status'&&request.method==='PATCH'){
      if((thread.section??thread.category)!=='requests')throw new HttpError(400,'Only feature requests have a status.')
      if(!admin&&!await maintainsModule(db,thread.module_id,member.id))throw new HttpError(403,'Only administrators and the maintainers of the related module can change a request’s status.')
      const status=String(body.status)
      if(!Object.hasOwn(REQUEST_STATUSES,status))throw new HttpError(400,'Choose open, planned, shipped or declined.')
      const note=body.note===undefined||body.note===null||body.note===''?'':required(body.note,'Note',1000)
      // Notification and history rows are written before the status changes, so repeating the current status does nothing.
      await db.batch([
        notifyRequestStatus(db,thread.id,status,member.id),
        db.prepare('INSERT INTO forum_moderation(id,actor_id,target,action,reason) SELECT ?,?,?,?,? WHERE EXISTS(SELECT 1 FROM forum_threads WHERE id=? AND request_status<>?)').bind(crypto.randomUUID(),adminId??member.id,thread.id,'request_status:'+status,note,thread.id,status),
        db.prepare('UPDATE forum_threads SET request_status=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND request_status<>?').bind(status,thread.id,status),
      ])
      return response({ok:true})
    }
    if(action==='status'&&request.method==='PATCH'){
      if(thread.user_id!==member.id&&!admin)throw new HttpError(403,'Only the thread author or administrator can change its status.')
      if(!['open','resolved'].includes(String(body.status)))throw new HttpError(400,'Choose open or resolved.')
      const issue=await db.prepare('SELECT id FROM issues WHERE forum_thread_id=?').bind(thread.id).first<{id:string}>()
      if(issue)await db.batch(issueStatusStatements(db,issue.id,body.status==='resolved'?'closed':'open',member.id))
      else await db.prepare('UPDATE forum_threads SET status=? WHERE id=? AND category=\'issues\'').bind(body.status,thread.id).run()
      return response({ok:true})
    }
  }
  if((match=path.match(/^\/api\/forum\/posts\/([a-zA-Z0-9-]+)(?:\/(react|report))?$/))){
    const post=await db.prepare('SELECT p.id,p.user_id,p.thread_id,t.locked FROM forum_posts p JOIN forum_threads t ON t.id=p.thread_id WHERE p.id=? AND p.hidden=0 AND t.hidden=0').bind(match[1]).first<{id:string;user_id:string;thread_id:string;locked:number}>()
    if(!post)throw new HttpError(404,'Post not found.')
    if(match[2]==='react'&&request.method==='POST'){
      const liked=!!bool(body.liked)
      await db.batch([
        liked?db.prepare('INSERT INTO forum_reactions(post_id,user_id) VALUES(?,?) ON CONFLICT DO NOTHING').bind(post.id,member.id):db.prepare('DELETE FROM forum_reactions WHERE post_id=? AND user_id=?').bind(post.id,member.id),
        notifyPostLike(db,post.id,member.id,liked),
      ])
      return response({ok:true})
    }
    if(match[2]==='report'&&request.method==='POST'){
      await db.prepare('INSERT INTO forum_reports(id,post_id,user_id,reason) VALUES(?,?,?,?) ON CONFLICT(post_id,user_id) DO NOTHING').bind(crypto.randomUUID(),post.id,member.id,required(body.reason,'Reason',1000)).run()
      return response({ok:true})
    }
    if(!match[2]&&request.method==='DELETE'){
      if(post.user_id!==member.id)throw new HttpError(403,'You can delete only your own posts.')
      if(post.locked)throw new HttpError(409,'This thread is locked.')
      if(await isOpeningPost(db,post.thread_id,post.id))throw new HttpError(409,'The first post of a thread cannot be deleted.')
      await db.batch(deletePost(db,post.id))
      return response({ok:true})
    }
    if(!match[2]&&request.method==='PATCH'){
      if(post.user_id!==member.id)throw new HttpError(403,'You can edit only your own posts.')
      if(post.locked)throw new HttpError(409,'This thread is locked.')
      const edited=await db.prepare('UPDATE forum_posts SET body=?,edited_at=CURRENT_TIMESTAMP WHERE id=? AND hidden=0 AND EXISTS(SELECT 1 FROM forum_threads WHERE id=? AND locked=0 AND hidden=0) RETURNING id').bind(cleanBody(body.body),post.id,post.thread_id).first()
      if(!edited)throw new HttpError(409,'This post is locked or unavailable.')
      return response({ok:true})
    }
  }
  throw new HttpError(404,'Forum route not found.')
}
