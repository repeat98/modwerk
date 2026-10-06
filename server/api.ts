import { pushRoutes } from './push'
import { followReportedModule, moduleUpdateRoutes } from './module-updates'
import { issueStatusStatements } from './issue-notifications'
import { forum } from './forum'
import { forumMedia } from './forum-media'
import { avatarRoutes } from './avatars'
import { notificationRoutes, notifyModuleMaintainers, unsubscribe, withdrawModuleLike } from './notifications'
import { notifyBugDevelopers, publicBugDetails } from './bug-reports'
import { developerAuthentication, developerUser } from './developer-auth'
import { developerApi } from './developers'
import { communityModule, moduleThreadId } from '../src/community/modules'
import { ensureDiscussionThread } from './module-threads'
import { validateDigiIssueContext } from '../src/community/digi-issue-context'
import { recordAnonymousCount, recordUsage, recordModuleDownload, usageStatistics } from './usage'
import { moduleStatistics } from './module-statistics'
import { adminInsights } from './admin-insights'
import { adminAccounts } from './admin-accounts'
import { adminAnnouncements } from './announcements'
import recipes from '../src/catalog/module-sets.json'
import type { Database, Env, Media, User } from './platform'
import { withPrivacyDeadline } from './privacy-deadline'
import { reviewAccountRequest } from './account-requests'
import { ADMIN_ACTOR, adminActor, authentication, currentUser, needMember, throttle } from './auth'
import { boundedBody, checkOrigin, HttpError, jsonBody, optional, required, response } from './security'
import { MODULES } from '../src/catalog/modules'
import { handleGithubWebhook, githubConfig, mirrorIssue, setGithubIssueState } from './github'
import { IssueInputError, validateIssueContext, validateLogMissing } from '../src/community/issue-context'
import { OT_LOG_MAX_BYTES, OtLogError, parseOtLog } from '../src/community/ot-log'

function needUser(user: User | null): User { if (!user) throw new HttpError(401,'Sign in to manage your activity.'); return user }
async function knownModule(db: Database, id: string) {
  if (communityModule(id)||recipes.some(recipe=>'remix-'+recipe.id===id)) return
  if (!await db.prepare("SELECT submission_id FROM module_publications WHERE module_id=?").bind(id).first()) throw new HttpError(404,'Module not found.')
}
function issueInput<T>(read:()=>T):T{try{return read()}catch(error){if(error instanceof IssueInputError||error instanceof OtLogError)throw new HttpError(400,error.message);throw error}}
export async function handleApi(request: Request, env: Env): Promise<Response> {
  try {
    const url = new URL(request.url), path = url.pathname
    // GitHub calls this server-to-server without an Origin; the HMAC signature authenticates it instead.
    if (path === '/api/github/webhook' && request.method === 'POST') {
      if (!env.DB) throw new HttpError(503,'Community services are not connected yet.')
      return response(await handleGithubWebhook(request,env,env.DB,await boundedBody(request,1024*1024)))
    }
    // Mail clients post one-click unsubscribes (RFC 8058) without an Origin or session; a signed token authorizes them.
    if (path === '/api/notifications/unsubscribe' && request.method === 'POST') {
      if (!env.DB) throw new HttpError(503,'Community services are not connected yet.')
      return await unsubscribe(request,env,env.DB)
    }
    checkOrigin(request,env)
    const auth = await authentication(request,env,path)
    if (auth) return auth
    if (/^\/api\/(submissions|review|repository)(?:\/|$)/.test(path)) throw new HttpError(410,'Module contributions and updates are accepted through GitHub pull requests only.')
    if (/^\/api\/configurations(?:\/|$)/.test(path)) throw new HttpError(410,'Configurations are saved on your device. Use Export to copy one to another device.')
    const db = env.DB
    if (!db) throw new HttpError(503,'Community services are not connected yet. Your device workspace still works.')
    if (path === '/api/usage/events' && request.method === 'POST') return await recordUsage(request,env,db)
    if (path === '/api/usage/module-downloads' && request.method === 'POST') return await recordModuleDownload(request,env,db)
    if (path === '/api/usage/count' && request.method === 'POST') return await recordAnonymousCount(request,env,db)
    if (path === '/api/catalog' && request.method === 'GET') return response((await db.prepare("SELECT s.module_id,s.title,s.repository_url,s.description,s.usage,s.resource_notes,s.test_report_url,s.reviewed_at,(SELECT strftime('%Y-%m-%dT%H:%M:%SZ', MIN(first.reviewed_at)) FROM submissions first WHERE first.module_id=s.module_id AND first.status='approved') AS added_at,u.github_login AS author FROM module_publications p JOIN submissions s ON s.id=p.submission_id JOIN users u ON u.id=s.owner_id ORDER BY s.reviewed_at DESC").all()).results)
    if(path==='/api/community/summary'&&request.method==='GET')return response(await moduleStatistics(db))
    const developerAuth = await developerAuthentication(request,env,db)
    if(developerAuth)return developerAuth
    const user = await currentUser(request,db,env)
    // Private history rows name the administrator account that acted; the key falls back to the fixed administrator row.
    const adminId = await adminActor(request,env,db), admin = !!adminId
    const push = await pushRoutes(request,env,db,user,admin)
    if(push)return push
    const developer = await developerApi(request,db,user,admin,await developerUser(request,env,db),adminId)
    if(developer)return developer
    const avatar = await avatarRoutes(request,env,db,user)
    if(avatar)return avatar
    const media = await forumMedia(request,env,db,user,admin)
    if(media)return media
    const discussion = await forum(request,db,user,admin,adminId)
    if(discussion)return discussion
    const notifications = await notificationRoutes(request,env,db,user)
    if(notifications)return notifications
    let match: RegExpMatchArray | null
    if ((match = path.match(/^\/api\/modules\/([a-z0-9-]+)\/updates$/))) return await moduleUpdateRoutes(request,env,db,match[1],user)
    if ((match = path.match(/^\/api\/media\/([^/]+)$/)) && request.method === 'GET') {
      const item = await db.prepare('SELECT m.*,s.status,s.owner_id,p.submission_id AS published FROM media m JOIN submissions s ON s.id=m.submission_id LEFT JOIN module_publications p ON p.submission_id=s.id WHERE m.id=?').bind(match[1]).first<Media & {status:string;owner_id:string;published:string|null}>()
      if (!item || (!item.published && !admin && item.owner_id !== user?.id)) throw new HttpError(404,'Media not found.')
      const object = await env.MEDIA?.get(item.object_key)
      if (!object) throw new HttpError(404,'Media not found.')
      return new Response(object.body,{headers:{'Content-Type':item.mime,'X-Content-Type-Options':'nosniff','Cache-Control':'private, no-store','Content-Security-Policy':"default-src 'none'; sandbox"}})
    }
    if ((match = path.match(/^\/api\/modules\/([a-z0-9-]+)$/)) && request.method === 'GET') {
      await knownModule(db,match[1])
      const isSet=match[1].startsWith('remix-')
      if (!isSet) await ensureDiscussionThread(db,match[1])
      const [posts,statistics,media] = await Promise.all([
        isSet ? Promise.resolve({results:[]}) : db.prepare("SELECT p.id,p.body,p.created_at,u.display_name AS author,p.user_id,t.locked FROM forum_posts p JOIN forum_threads t ON t.id=p.thread_id JOIN users u ON u.id=p.user_id WHERE t.id=? AND p.id<>t.id AND p.hidden=0 AND (t.hidden=0 OR ?=1) ORDER BY p.created_at DESC,p.rowid DESC LIMIT 100").bind(moduleThreadId(match[1]),Number(admin)).all<{id:string;body:string;created_at:string;author:string;user_id:string;locked:number}>(),
        db.prepare(`WITH requested AS (SELECT ? AS module_id,? AS user_id) SELECT
          (SELECT AVG(value) FROM ratings WHERE module_id=requested.module_id) AS average,
          (SELECT COUNT(*) FROM ratings WHERE module_id=requested.module_id) AS count,
          COALESCE((SELECT value FROM ratings WHERE module_id=requested.module_id AND user_id=requested.user_id),0) AS ownRating,
          (SELECT COUNT(*) FROM likes WHERE module_id=requested.module_id) AS likes,
          EXISTS(SELECT 1 FROM likes WHERE module_id=requested.module_id AND user_id=requested.user_id) AS liked,
          COALESCE((SELECT downloads FROM module_downloads WHERE module_id=requested.module_id),0) AS downloads,
          (SELECT value FROM module_download_meta WHERE key='collection_started') AS downloadsStarted,
          (SELECT COUNT(*) FROM forum_posts p JOIN forum_threads t ON t.id=p.thread_id WHERE t.id='module-' || requested.module_id AND p.id<>t.id AND p.hidden=0 AND t.hidden=0) AS discussionCount
          FROM requested`).bind(match[1],user?.id??null).first<{average:number|null;count:number;ownRating:number;likes:number;liked:number;downloads:number;downloadsStarted:string|null;discussionCount:number}>(),
        db.prepare("SELECT m.id,m.kind,m.caption,m.capture_type FROM media m JOIN module_publications p ON p.submission_id=m.submission_id WHERE p.module_id=?").bind(match[1]).all(),
      ])
      const comments = posts.results.map(({locked,...comment}) => ({...comment,user_id:undefined,canDelete:admin || !locked && comment.user_id === user?.id}))
      if(!statistics)throw new Error('Module statistics missing.')
      return response({comments,ratings:{average:statistics.average,count:statistics.count},ownRating:statistics.ownRating,media:media.results,likes:statistics.likes,liked:!!statistics.liked,downloads:statistics.downloads,downloadsStarted:statistics.downloadsStarted,discussionCount:statistics.discussionCount})
    }
    if ((match = path.match(/^\/api\/modules\/([a-z0-9-]+)\/(comments|rating|like)$/)) && request.method === 'POST') {
      await knownModule(db,match[1])
      const body = await jsonBody(request)
      await throttle(db,'community-ip:'+(request.headers.get('CF-Connecting-IP')??'local'),30)
      if(match[2]==='comments')required(body.body,'Comment',2000)
      else if(match[2]==='rating'&&(!Number.isInteger(body.value)||Number(body.value)<1||Number(body.value)>5))throw new HttpError(400,'Choose a rating from 1 to 5.')
      const owner=needMember(user)
      await throttle(db,'community:' + owner.id,30)
      if (match[2] === 'comments') {
        await ensureDiscussionThread(db,match[1])
        const reply=await forum(new Request(new URL('/api/forum/threads/'+moduleThreadId(match[1])+'/replies',request.url),{method:'POST',headers:request.headers,body:JSON.stringify({body:required(body.body,'Comment',2000)})}),db,user,admin,adminId)
        if (!reply) throw new HttpError(500,'The reply could not be saved.')
        return response({ok:true,...await reply.json() as {id:string;page:number}})
      }
      else if(match[2]==='like'){if(typeof body.liked!=='boolean')throw new HttpError(400,'Choose liked or unliked.');if(body.liked)await db.batch([db.prepare('INSERT INTO likes(module_id,user_id) VALUES(?,?) ON CONFLICT DO NOTHING').bind(match[1],owner.id),...notifyModuleMaintainers(db,match[1],'module_like',owner.id)]);else await db.batch([db.prepare('DELETE FROM likes WHERE module_id=? AND user_id=?').bind(match[1],owner.id),withdrawModuleLike(db,match[1],owner.id)])}
      else { const rating = Number(body.value); if (!Number.isInteger(rating) || rating < 1 || rating > 5) throw new HttpError(400,'Choose a rating from 1 to 5.'); await db.batch([db.prepare('INSERT INTO ratings(module_id,user_id,value) VALUES(?,?,?) ON CONFLICT(module_id,user_id) DO UPDATE SET value=excluded.value').bind(match[1],owner.id,rating),...notifyModuleMaintainers(db,match[1],'module_rating',owner.id)]) }
      return response({ok:true})
    }
    if ((match = path.match(/^\/api\/comments\/([^/]+)$/)) && request.method === 'DELETE') {
      const owner=admin?null:needUser(user)
      // Compatibility removal hides the canonical post, including migrated comment IDs.
      await db.batch([
        db.prepare("UPDATE forum_posts SET hidden=1 WHERE (id=? OR id='comment-' || ?) AND EXISTS(SELECT 1 FROM forum_threads t WHERE t.id=forum_posts.thread_id AND t.id='module-' || t.module_id AND forum_posts.id<>t.id AND (?=1 OR (t.hidden=0 AND t.locked=0 AND forum_posts.user_id=?)))").bind(match[1],match[1],Number(admin),owner?.id??''),
        ...(admin?[db.prepare("INSERT INTO forum_moderation(id,actor_id,target,action,reason) SELECT ?,?,p.id,'hidden:1','Removed through the module comment compatibility endpoint.' FROM forum_posts p JOIN forum_threads t ON t.id=p.thread_id WHERE (p.id=? OR p.id='comment-' || ?) AND t.id='module-' || t.module_id AND p.id<>t.id").bind(crypto.randomUUID(),adminId,match[1],match[1])]:[]),
      ])
      return response({ok:true})
    }
    if ((match=path.match(/^\/api\/modules\/([a-z0-9-]+)\/issues$/)) && request.method==='GET') {
      // Lets reporters find an existing issue before filing a duplicate. Titles are public on GitHub already.
      await knownModule(db,match[1]);const config=githubConfig(env)
      if(!config)return response({tracker:'forum',issues:[],allUrl:null})
      const issues=(await db.prepare("SELECT title,github_url AS url,created_at FROM issues WHERE module_id=? AND status='open' AND github_url IS NOT NULL ORDER BY created_at DESC LIMIT 10").bind(match[1]).all()).results
      return response({tracker:'github',issues,allUrl:'https://github.com/'+config.repository+'/issues?q='+encodeURIComponent('is:issue is:open label:"module:'+match[1]+'"')})
    }
    if ((match=path.match(/^\/api\/modules\/([a-z0-9-]+)\/issues$/)) && request.method==='POST') {
      const owner=needMember(user)
      await knownModule(db,match[1]);const body=await jsonBody(request,OT_LOG_MAX_BYTES+32*1024)
      if(typeof body.steps!=='string'&&typeof body.body==='string')throw new HttpError(400,'Issue reports now include structured device details. Reload the page and report again.')
      if(Object.keys(body).some(key=>!['title','steps','expected','actual','context','log','logMissing','maintainerSharing','displayName','visibility','notifyUpdates'].includes(key)))throw new HttpError(400,'Unexpected report field. Files and firmware are not accepted.')
      if(body.notifyUpdates!==undefined&&typeof body.notifyUpdates!=='boolean')throw new HttpError(400,'Choose whether to follow module updates.')
      if(body.visibility!==undefined&&body.visibility!=='forum'&&body.visibility!=='private')throw new HttpError(400,'Choose a public forum report or a private report.')
      const publicReport=body.visibility==='forum'
      const title=required(body.title,'Issue title',160),steps=optional(body.steps,'Steps to reproduce',3000),expected=optional(body.expected,'Expected result',1000),actual=required(body.actual,'What happened',2000)
      const module=communityModule(match[1]),digi=module?.machine==='digitakt'||module?.machine==='digitone'
      const context=issueInput(()=>digi?validateDigiIssueContext(body.context,module.machine):validateIssueContext(body.context))
      if(!digi && body.context && typeof body.context==='object' && (body.context as Record<string,unknown>).machine && (body.context as Record<string,unknown>).machine!=='octatrack')throw new HttpError(400,'The report belongs to a different machine.')
      if(body.maintainerSharing!==undefined&&typeof body.maintainerSharing!=='boolean')throw new HttpError(400,'Choose whether to share with verified maintainers.')
      const attached=body.log!==undefined&&body.log!==null&&body.log!==''
      if(attached&&typeof body.log!=='string')throw new HttpError(400,'Attach OCTAMOD.LOG as text.')
      if(digi && (body.log!==undefined||body.logMissing!==undefined))throw new HttpError(400,'This machine accepts structured reports only. Files and firmware are not accepted.')
      const log=attached?issueInput(()=>parseOtLog(body.log as string)):null
      // The log is optional; older clients may still say why there is none.
      const missing=digi||log||body.logMissing===undefined?null:issueInput(()=>validateLogMissing(body.logMissing,context as import('../src/community/issue-context').OctatrackIssueContext))
      await throttle(db,'issue-ip:'+(request.headers.get('CF-Connecting-IP')??'local'),10)
      // Bound stored reports across the site as well as per IP and member.
      await throttle(db,'issue-global',60)
      const core=MODULES.find(item=>item.id===match![1])
      const recipe=recipes.find(item=>'remix-'+item.id===match![1])
      const published=core||recipe?null:await db.prepare("SELECT u.github_login FROM module_publications p JOIN submissions s ON s.id=p.submission_id JOIN users u ON u.id=s.owner_id WHERE p.module_id=?").bind(match[1]).first<{github_login:string}>()
      const author=module?.author??core?.author??recipe?.author??published?.github_login
      if(!author)throw new HttpError(400,'No author is registered for this module.')
      await throttle(db,'issue-member:'+owner.id,10)
      const id=crypto.randomUUID(),details=[['Steps to reproduce',steps],['Expected',expected],['Actual',actual]].filter(([,text])=>text).map(([label,text])=>label+':\n'+text).join('\n\n')
      const publicDetails=publicReport?publicBugDetails(match[1],context,log,steps,expected,actual):null
      // With GitHub configured, a public report becomes a GitHub issue and gets no forum thread of its own.
      const github=!!publicReport&&!!githubConfig(env)
      const threadId=publicReport&&!github?crypto.randomUUID():null,postId=crypto.randomUUID()
      const statements=threadId?[
        db.prepare('INSERT INTO forum_threads(id,user_id,title,category,machine,module_id,issue_json) VALUES(?,?,?,\'issues\',?,?,?)').bind(threadId,owner.id,title,module?.machine??'octatrack',match[1],JSON.stringify(publicDetails)),
        db.prepare('INSERT INTO forum_posts(id,thread_id,user_id,body) VALUES(?,?,?,?)').bind(postId,threadId,owner.id,details),
        db.prepare('INSERT INTO forum_follows(thread_id,user_id) VALUES(?,?)').bind(threadId,owner.id),
        ...notifyBugDevelopers(db,match[1],threadId,postId,owner.id),
      ]:[]
      statements.push(db.prepare('INSERT INTO issues(id,module_id,author_login,reporter_id,title,body,context_json,log_missing,log_missing_note,github_state,maintainer_sharing,forum_thread_id,public_json) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(id,match[1],author,owner.id,title,details,JSON.stringify(context),missing?.reason??null,missing?.note??'',github?'pending':'none',Number(publicReport||body.maintainerSharing===true),threadId,publicDetails&&JSON.stringify(publicDetails)))
      if(log)statements.push(db.prepare('INSERT INTO issue_logs(issue_id,text,bytes,summary_json) VALUES(?,?,?,?)').bind(id,log.text,log.text.length,JSON.stringify(log.summary)))
      if(module&&body.notifyUpdates!==false)statements.push(followReportedModule(db,match[1],owner.id))
      await db.batch(statements)
      // The report is stored either way; a failed mirror stays retryable from the admin inbox.
      const mirrored=github?await mirrorIssue(db,env,id):{state:'none' as const}
      return response({ok:true,id,author,forumThreadId:threadId,github:mirrored.state,githubUrl:'url' in mirrored?mirrored.url??null:null},201)
    }
    if(path==='/api/issues/mine'&&request.method==='GET'){
      if(!user)return response([])
      return response((await db.prepare('SELECT id,module_id,author_login,title,body,status,created_at,github_url,public_sharing,maintainer_sharing,forum_thread_id FROM issues WHERE reporter_id=? ORDER BY created_at DESC LIMIT 100').bind(user.id).all()).results)
    }
    if (path.startsWith('/api/admin/')) {
      if (!admin) throw new HttpError(403,'Administrator access is required.')
      if(path==='/api/admin/account-requests'&&request.method==='GET')return response((await db.prepare("SELECT r.id,r.user_id,r.status,r.created_at,r.updated_at,r.review_note,u.username FROM account_removal_requests r JOIN users u ON u.id=r.user_id ORDER BY CASE WHEN r.status IN ('requested','reviewing') THEN 0 ELSE 1 END,r.created_at ASC,r.rowid ASC LIMIT 100").all<{created_at:string}>()).results.map(withPrivacyDeadline))
      if(path==='/api/admin/account-mail'&&request.method==='GET')return response((await db.prepare('SELECT day,purpose,accepted,failed,limited FROM account_mail_daily ORDER BY day DESC,purpose LIMIT 60').all()).results)
      if((match=path.match(/^\/api\/admin\/account-requests\/([a-zA-Z0-9-]+)$/))&&request.method==='PATCH')return reviewAccountRequest(request,db,match[1])
      const announcements = await adminAnnouncements(request, db, path)
      if (announcements) return announcements
      if (path === '/api/admin/insights' && request.method === 'GET') return response(await adminInsights(db))
      if (path === '/api/admin/accounts' && request.method === 'GET') return response(await adminAccounts(db,new Date(),Number(url.searchParams.get('days') ?? 30)))
      if (path === '/api/admin/statistics' && request.method === 'GET') return await usageStatistics(db,Number(url.searchParams.get('days') ?? 7))
      if (path === '/api/admin/overview' && request.method === 'GET') return response(await db.prepare("SELECT (SELECT COUNT(*) FROM submissions WHERE status='pending') AS pending,(SELECT COUNT(*) FROM module_publications) AS published,(SELECT COUNT(*) FROM forum_posts p JOIN forum_threads t ON t.id=p.thread_id WHERE t.id='module-' || t.module_id AND p.id<>t.id AND p.hidden=0 AND t.hidden=0) AS comments,(SELECT COUNT(*) FROM issues WHERE status='open') AS issues,(SELECT COALESCE(SUM(bytes),0) FROM media) AS mediaBytes").first())
      if (path === '/api/admin/history' && request.method === 'GET') return response((await db.prepare('SELECT e.id,e.module_id,e.action,e.note,e.created_at,u.display_name AS actor FROM review_events e JOIN users u ON u.id=e.actor_id ORDER BY e.rowid DESC LIMIT 100').all()).results)
      if (path === '/api/admin/issues' && request.method === 'GET') {
        const moduleId = url.searchParams.has('moduleId') ? required(url.searchParams.get('moduleId'),'Module ID',100) : '', status = url.searchParams.get('status')??'all'
        if (!['all','open','closed'].includes(status)) throw new HttpError(400,'Choose all, open or closed issues.')
        return response((await db.prepare("SELECT i.id,i.module_id,i.author_login,i.title,i.body,i.status,i.created_at,i.context_json,i.log_missing,i.log_missing_note,i.github_state,i.github_url,i.github_error,i.public_sharing,l.summary_json AS log_summary_json,u.display_name AS reporter FROM issues i JOIN users u ON u.id=i.reporter_id LEFT JOIN issue_logs l ON l.issue_id=i.id WHERE (?='' OR i.module_id=?) AND (?='all' OR i.status=?) ORDER BY i.created_at DESC,i.rowid DESC LIMIT 200").bind(moduleId,moduleId,status,status).all<Record<string,unknown>&{context_json:string|null;log_summary_json:string|null}>()).results.map(({context_json,log_summary_json,...item})=>({...item,context:context_json?JSON.parse(context_json):null,log:log_summary_json?JSON.parse(log_summary_json):null})))
      }
      if ((match=path.match(/^\/api\/admin\/issues\/([^/]+)\/log$/)) && request.method === 'GET') {
        const log=await db.prepare('SELECT text FROM issue_logs WHERE issue_id=?').bind(match[1]).first<{text:string}>()
        if(!log)throw new HttpError(404,'No log is attached to this issue.')
        return new Response(log.text,{headers:{'Content-Type':'text/plain; charset=us-ascii','Content-Disposition':'attachment; filename="OCTAMOD-'+match[1].replace(/[^a-f0-9-]/g,'')+'.LOG"','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}})
      }
      if ((match=path.match(/^\/api\/admin\/issues\/([^/]+)\/github$/)) && request.method === 'POST') {
        if(!githubConfig(env))throw new HttpError(503,'GitHub mirroring is not configured for this backend.')
        return response(await mirrorIssue(db,env,match[1],true))
      }
      if ((match=path.match(/^\/api\/admin\/issues\/([^/]+)$/)) && request.method === 'PATCH') {
        const body=await jsonBody(request)
        if(body.status!=='open'&&body.status!=='closed')throw new HttpError(400,'Choose open or closed.')
        const issue=await db.prepare('SELECT github_number FROM issues WHERE id=?').bind(match[1]).first<{github_number:number|null}>()
        if(!issue)throw new HttpError(404,'Issue not found.')
        await db.batch(issueStatusStatements(db,match[1],body.status,ADMIN_ACTOR))
        // Keep the GitHub issue in step; the local status is authoritative for the reporter either way.
        const config=githubConfig(env);let github='none'
        if(config&&issue.github_number){try{await setGithubIssueState(config,issue.github_number,body.status);github='synced'}catch{github='failed'}}
        return response({ok:true,github})
      }
      if (path === '/api/admin/comments' && request.method === 'GET') return response((await db.prepare("SELECT p.id,t.module_id,p.body,p.created_at,u.display_name AS author FROM forum_posts p JOIN forum_threads t ON t.id=p.thread_id JOIN users u ON u.id=p.user_id WHERE t.id='module-' || t.module_id AND p.id<>t.id AND p.hidden=0 AND t.hidden=0 ORDER BY p.created_at DESC,p.rowid DESC LIMIT 100").all()).results)
      if ((match=path.match(/^\/api\/admin\/modules\/([a-z0-9-]+)\/withdraw$/)) && request.method === 'POST') {
        const body=await jsonBody(request),note=required(body.note,'Withdrawal reason',2000),event=crypto.randomUUID(),id=match[1]
        const [recorded]=await db.batch([
          db.prepare("INSERT INTO review_events(id,actor_id,module_id,submission_id,action,note) SELECT ?,?,module_id,submission_id,'withdrawn',? FROM module_publications WHERE module_id=?").bind(event,adminId,note,id),
          db.prepare('DELETE FROM module_publications WHERE module_id=? AND EXISTS(SELECT 1 FROM review_events WHERE id=?)').bind(id,event),
        ])
        if (!(recorded as {meta:{changes:number}}).meta.changes) throw new HttpError(404,'Published contribution not found.')
        return response({ok:true})
      }
      throw new HttpError(404,'API route not found.')
    }
    throw new HttpError(404,'API route not found.')
  } catch (error) {
    if (!(error instanceof HttpError)) reportFailure(request, error)
    return response({error:error instanceof HttpError ? error.message : 'The community service could not complete this request.'},error instanceof HttpError ? error.status : 500)
  }
}
/** Logs an unexpected failure for Workers Logs: method, path and the error only, never a body, query or header. */
export function reportFailure(request: Request, error: unknown) {
  const detail = error instanceof Error ? error.stack ?? error.message : String(error)
  console.error(`Unhandled failure in ${request.method} ${new URL(request.url).pathname}: ${detail}`)
}
