import { issueStatusStatements } from './issue-notifications'
import type { Database, User } from './platform'
import { ADMIN_ACTOR, needMember, throttle } from './auth'
import { HttpError, jsonBody, required, response } from './security'
import { FORUM_CATEGORIES, forumMachine, sharedConfiguration } from '../src/community/forum-contract'
import { communityModule } from '../src/community/modules'
import { ensureDiscussionThread, ensureModuleThreadsOnce, SYSTEM_AUTHOR } from './module-threads'
import { notifyMentions, notifyPostLike, notifyReplies, RECIPIENTS } from './notifications'
import { attachMedia, postAttachments } from './forum-media'
import { shoutbox } from './shoutbox'

type Thread = {id:string;user_id:string;locked:number;hidden:number;configuration_json:string|null;issue_json:string|null}
function page(url: URL) { const value = Number(url.searchParams.get('page') ?? 0); if (!Number.isInteger(value) || value < 0 || value > 10000) throw new HttpError(400,'Invalid page.'); return value }
const threadFields = `t.id,t.title,COALESCE(t.section,t.category) AS category,t.machine,t.module_id,t.status,t.locked,t.pinned,t.created_at,t.updated_at,u.username,u.avatar_id AS avatar,t.user_id='${SYSTEM_AUTHOR}' AS official,(SELECT MAX(COUNT(*)-1,0) FROM forum_posts p WHERE p.thread_id=t.id AND p.hidden=0) AS replies,(SELECT GROUP_CONCAT(DISTINCT m.kind) FROM forum_media m JOIN forum_posts mp ON mp.id=m.post_id WHERE mp.thread_id=t.id AND m.removed=0 AND mp.hidden=0) AS media_kinds`
async function threadById(db: Database, id: string, admin: boolean) {
  const thread = await db.prepare('SELECT * FROM forum_threads WHERE id=? AND (hidden=0 OR ?=1)').bind(id, Number(admin)).first<Thread>()
  if (!thread) throw new HttpError(404,'Thread not found.')
  return thread
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
      UNION ALL SELECT r.id,r.reason,r.resolved,r.created_at,s.id AS post_id,s.body,s.hidden,NULL AS thread_id,s.user_id,u.username,'Shoutbox' AS title,'shout' AS kind FROM forum_shout_reports r JOIN forum_shouts s ON s.id=r.shout_id JOIN users u ON u.id=s.user_id) ORDER BY resolved,created_at DESC LIMIT 100`).all()).results)
    if (path === '/api/admin/forum/history' && request.method === 'GET') return response((await db.prepare('SELECT m.id,m.target,m.action,m.reason,m.created_at,u.display_name AS actor FROM forum_moderation m JOIN users u ON u.id=m.actor_id ORDER BY m.rowid DESC LIMIT 100').all()).results)
    if ((match = path.match(/^\/api\/admin\/forum\/(posts|threads|users|reports|media|shouts|shout-reports)\/([a-zA-Z0-9-]+)$/)) && request.method === 'PATCH') {
      const body = await jsonBody(request), reason = required(body.reason,'Moderation reason',1000), target = match[2]
      const allowed = (match[1] === 'posts' || match[1] === 'shouts') ? ['hidden'] : match[1] === 'threads' ? ['locked','pinned','hidden'] : match[1] === 'users' ? ['suspended'] : match[1] === 'media' ? ['removed'] : ['resolved']
      if (typeof body.action !== 'string' || !allowed.includes(body.action)) throw new HttpError(400,'Unknown moderation action.')
      const value = bool(body.value), table = {posts:'forum_posts',threads:'forum_threads',users:'users',reports:'forum_reports',media:'forum_media',shouts:'forum_shouts','shout-reports':'forum_shout_reports'}[match[1]]!
      // The hourly job deletes removed files from the bucket, so removal cannot be undone.
      if (match[1] === 'media' && !value) throw new HttpError(400,'Removed files cannot be restored.')
      if (target === ADMIN_ACTOR || target === SYSTEM_AUTHOR) throw new HttpError(400,'This system account cannot be suspended.')
      const result = await db.batch([
        db.prepare(`UPDATE ${table} SET ${body.action}=? WHERE id=?`).bind(value,target),
        db.prepare(`INSERT INTO forum_moderation(id,actor_id,target,action,reason) SELECT ?,?,?,?,? WHERE EXISTS(SELECT 1 FROM ${table} WHERE id=?)`).bind(crypto.randomUUID(),adminId??ADMIN_ACTOR,target,`${body.action}:${value}`,reason,target),
        ...(body.action === 'suspended' && value ? [db.prepare('DELETE FROM sessions WHERE user_id=?').bind(target),db.prepare('DELETE FROM auth_sessions WHERE userId=?').bind(target),db.prepare('DELETE FROM developer_sessions WHERE user_id=?').bind(target),db.prepare('DELETE FROM developer_auth_codes WHERE user_id=?').bind(target)] : []),
      ])
      if (!(result[0] as {meta:{changes:number}}).meta.changes) throw new HttpError(404,'Item not found.')
      return response({ok:true})
    }
    throw new HttpError(404,'Moderation route not found.')
  }
  if (path === '/api/forum/threads' && request.method === 'GET') {
    const category = url.searchParams.get('category') ?? '', module = await moduleId(db,url.searchParams.get('module')), query = (url.searchParams.get('q') ?? '').trim().slice(0,120), saved = url.searchParams.get('saved') === '1', following = url.searchParams.get('following') === '1', author = url.searchParams.get('author') ?? ''
    const sort = url.searchParams.get('sort') ?? 'active'
    const view = url.searchParams.get('view') ?? 'community'
    if (!['community','modules'].includes(view)) throw new HttpError(400,'Choose a supported discussion view.')
    if (!['active','newest'].includes(sort)) throw new HttpError(400,'Choose a supported discussion order.')
    if (category && !Object.hasOwn(FORUM_CATEGORIES,category)) throw new HttpError(400,'Unknown category.')
    let machine: string | null
    try { machine = forumMachine(url.searchParams.get('machine')) } catch { throw new HttpError(400,'Unknown machine.') }
    if (saved || following) needMember(user)
    // Personal lists retain module homes the member has chosen to follow or save.
    const authorScope = view === 'modules' ? `AND t.user_id='${SYSTEM_AUTHOR}'` : saved || following ? '' : `AND t.user_id<>'${SYSTEM_AUTHOR}'`
    const escaped = '%' + query.replace(/[\\%_]/g, '\\$&') + '%'
    const rows = (await db.prepare(`SELECT ${threadFields},
      lp.id AS last_post_id,lu.username AS last_username,substr(lp.body,1,160) AS last_excerpt,
      (SELECT CAST(COUNT(*)/30 AS INTEGER) FROM forum_posts preceding WHERE preceding.thread_id=t.id AND (preceding.created_at<lp.created_at OR (preceding.created_at=lp.created_at AND preceding.rowid<lp.rowid))) AS last_post_page
      FROM forum_threads t JOIN users u ON u.id=t.user_id
      LEFT JOIN forum_posts lp ON lp.id=(SELECT p.id FROM forum_posts p WHERE p.thread_id=t.id AND p.hidden=0 ORDER BY p.created_at DESC,p.rowid DESC LIMIT 1)
      LEFT JOIN users lu ON lu.id=lp.user_id
      WHERE t.hidden=0 ${authorScope} AND (?='' OR COALESCE(t.section,t.category)=?) AND (? IS NULL OR t.machine=?) AND (? IS NULL OR t.module_id=?) AND (?='' OR u.username=?) AND (?=0 OR EXISTS(SELECT 1 FROM forum_bookmarks b WHERE b.thread_id=t.id AND b.user_id=?))
      AND (?=0 OR EXISTS(SELECT 1 FROM forum_follows f WHERE f.thread_id=t.id AND f.user_id=?))
      AND (?='' OR t.title LIKE ? ESCAPE '\\' OR EXISTS(SELECT 1 FROM forum_posts p WHERE p.thread_id=t.id AND p.hidden=0 AND p.body LIKE ? ESCAPE '\\'))
      ORDER BY t.pinned DESC,${sort==='newest'?'t.created_at':'t.updated_at'} DESC,t.id LIMIT 31 OFFSET ?`)
      .bind(category,category,machine,machine,module,module,author,author,Number(saved),user?.id??'',Number(following),user?.id??'',query,escaped,escaped,page(url)*30).all()).results
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

  if (path === '/api/forum/machines' && request.method === 'GET') {
    return response((await db.prepare('SELECT machine,COUNT(*) AS threads,MAX(updated_at) AS updated_at FROM forum_threads WHERE hidden=0 AND user_id<>? AND machine IS NOT NULL GROUP BY machine').bind(SYSTEM_AUTHOR).all()).results)
  }
  if (path === '/api/forum/notifications' && request.method === 'GET') {
    const member = needMember(user)
    // Superseded by /api/notifications; kept with its original shape for frontends deployed before the bell.
    return response((await db.prepare(`SELECT n.id,n.thread_id,n.post_id,n.seen,n.created_at,t.title FROM notifications n JOIN forum_threads t ON t.id=n.thread_id JOIN forum_posts p ON p.id=n.post_id WHERE n.kind IN ('reply','mention','bug_report') AND n.user_id IN (${RECIPIENTS}) AND t.hidden=0 AND p.hidden=0 ORDER BY n.created_at DESC,n.id LIMIT 100`).bind(member.id,member.id).all()).results)
  }
  if (path === '/api/forum/notifications' && request.method === 'PATCH') {
    const member = needMember(user)
    await db.prepare(`UPDATE notifications SET seen=1 WHERE kind IN ('reply','mention','bug_report') AND user_id IN (${RECIPIENTS})`).bind(member.id,member.id).run()
    return response({ok:true})
  }
  if ((match=path.match(/^\/api\/forum\/profiles\/([a-z0-9_]{3,24})$/)) && request.method === 'GET') {
    const profile = await db.prepare('SELECT username,display_name AS displayName,profile_bio AS bio,avatar_id AS avatar,created_at FROM users WHERE username=? AND email_verified=1 AND suspended=0 AND NOT EXISTS(SELECT 1 FROM social_pending_accounts p WHERE p.user_id=users.id)').bind(match[1]).first()
    if (!profile) throw new HttpError(404,'Profile not found.')
    return response(profile)
  }
  if ((match=path.match(/^\/api\/forum\/threads\/([a-zA-Z0-9-]+)$/)) && request.method === 'GET') {
    const thread = await threadById(db,match[1],admin)
    const [details,pagePosts] = await Promise.all([
      db.prepare(`SELECT ${threadFields},t.hidden,
        EXISTS(SELECT 1 FROM forum_follows f WHERE f.thread_id=t.id AND f.user_id=?) AS following,
        EXISTS(SELECT 1 FROM forum_bookmarks b WHERE b.thread_id=t.id AND b.user_id=?) AS bookmarked
        FROM forum_threads t JOIN users u ON u.id=t.user_id WHERE t.id=?`).bind(user?.id??null,user?.id??null,thread.id).first<Record<string,unknown>&{following:number;bookmarked:number}>(),
      db.prepare('SELECT p.*,u.username,u.avatar_id AS avatar,u.display_name AS displayName,(SELECT COUNT(*) FROM forum_reactions r WHERE r.post_id=p.id) AS likes,EXISTS(SELECT 1 FROM forum_reactions r WHERE r.post_id=p.id AND r.user_id=?) AS liked FROM forum_posts p JOIN users u ON u.id=p.user_id WHERE p.thread_id=? ORDER BY p.created_at,p.rowid LIMIT 31 OFFSET ?').bind(user?.id??'',thread.id,page(url)*30).all<{id:string;user_id:string;hidden:number;body:string;username:string;avatar:string|null;displayName:string;created_at:string;edited_at:string|null;likes:number;liked:number}>(),
    ])
    if(!details)throw new HttpError(404,'Thread not found.')
    const {following:followed,bookmarked:saved,...summary}=details
    const posts=pagePosts.results,following=!!followed,bookmarked=!!saved
    const attachments = await postAttachments(db,posts.slice(0,30).filter(post=>admin||!post.hidden).map(post=>post.id))
    return response({thread:summary,posts:posts.slice(0,30).map(post=>({attachments:attachments.get(post.id)??[],canRemoveMedia:!post.hidden&&post.user_id===user?.id&&!!user?.email_verified,id:post.id,body:post.hidden&&!admin?'':post.body,username:post.hidden&&!admin?null:post.username,avatar:post.hidden&&!admin?null:post.avatar,displayName:post.hidden&&!admin?null:post.displayName,created_at:post.created_at,edited_at:post.edited_at,hidden:post.hidden,likes:post.hidden?0:post.likes,liked:!post.hidden&&!!post.liked,canEdit:!thread.locked&&!post.hidden&&post.user_id===user?.id&&!!user?.email_verified,official:post.user_id===SYSTEM_AUTHOR,...(admin?{user_id:post.user_id}:{})})),configuration:thread.configuration_json?JSON.parse(thread.configuration_json):null,issue:thread.issue_json?JSON.parse(thread.issue_json):null,following,bookmarked,hasMore:posts.length>30})
  }
  const member = needMember(user)
  await throttle(db,'forum:'+member.id,60)
  await throttle(db,'forum-ip:'+(request.headers.get('CF-Connecting-IP')??'local'),120)
  const body = await jsonBody(request)
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
  if ((match=path.match(/^\/api\/forum\/threads\/([a-zA-Z0-9-]+)\/(replies|follow|bookmark|status)$/))) {
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
