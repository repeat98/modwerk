import type { Database, Env, User } from './platform'
import { requireRegisteredReleaseAuthor, completeModuleRelease } from './release-completion'
import { closeGithubReport, githubConfig, setGithubIssueState } from './github'
import { isReportClosureReason } from '../src/community/report-closure'
import { ADMIN_ACTOR, needMember, throttle } from './auth'
import { issueReplyStatements, issueStatusStatements } from './issue-notifications'
import { ITEM_SQL, toItem, VISIBLE } from './notifications'
import { HttpError, jsonBody, required, response } from './security'
import { COMMUNITY_MODULES, communityModule, developerModules, moduleThreadId } from '../src/community/modules'

export async function maintainedModules(db: Database, user: User) {
  const rows = (await db.prepare('SELECT module_id,github_login FROM module_maintainers WHERE user_id=? AND revoked=0').bind(user.id).all<{module_id:string;github_login:string}>()).results
  // Removed maintainers lose access immediately when the reviewed catalog changes.
  return COMMUNITY_MODULES.filter(module => rows.some(row => row.module_id === module.id && row.github_login.toLowerCase()===user.github_login?.toLowerCase() && module.maintainers.some(login => login.toLowerCase() === row.github_login.toLowerCase())))
}
type Issue = {id:string;module_id:string;scope:'module'|'configuration';reporter_id:string;title:string;body:string;status:string;context_json:string|null;maintainer_sharing:number;public_sharing:number;created_at:string;forum_thread_id:string|null;github_url:string|null;github_number:number|null}
async function accessIssue(db:Database,id:string,user:User|null,admin:boolean,developer:User|null) {
  const issue = await db.prepare('SELECT * FROM issues WHERE id=?').bind(id).first<Issue>()
  if (!issue) throw new HttpError(404,'Report not found.')
  const reporter = !!user && issue.reporter_id === user.id
  // A whole-configuration report is shared with the maintainers of every module in it.
  const reported = issue.scope === 'configuration' ? (await db.prepare('SELECT module_id FROM issue_modules WHERE issue_id=? ORDER BY rowid').bind(issue.id).all<{module_id:string}>()).results.map(item => item.module_id) : [issue.module_id]
  const maintainer = !!developer?.github_id && !developer.suspended && !!issue.maintainer_sharing && !issue.public_sharing && (await maintainedModules(db,developer)).some(module => reported.includes(module.id))
  if (!admin && !reporter && !maintainer) throw new HttpError(404,'Report not found.')
  return {issue,reporter,reported,canManage:admin || maintainer,actor:admin?{id:ADMIN_ACTOR,display_name:'Administrator'}:reporter?user:developer}
}
export async function developerApi(request:Request,db:Database,user:User|null,admin:boolean,developer:User|null,adminId:string|null=admin?ADMIN_ACTOR:null,env:Env={}):Promise<Response|null> {
  const url = new URL(request.url), path = url.pathname
  if (path === '/api/admin/maintainers') {
    if (!admin) throw new HttpError(403,'Administrator access is required.')
    if (request.method === 'GET') return response((await db.prepare('SELECT m.module_id,m.user_id,m.github_login,m.revoked,m.created_at FROM module_maintainers m ORDER BY m.module_id,m.github_login LIMIT 200').all()).results)
    throw new HttpError(405,'Choose a supported maintainer action.')
  }
  let match:RegExpMatchArray|null
  if ((match = path.match(/^\/api\/admin\/maintainers\/([a-z0-9-]+)\/([a-zA-Z0-9-]+)$/))) {
    if (!admin) throw new HttpError(403,'Administrator access is required.')
    if (!['DELETE','PATCH'].includes(request.method)) throw new HttpError(405,'Choose a supported maintainer action.')
    const body = await jsonBody(request), note = required(body.note,'Revocation reason',1000)
    await db.batch([
      db.prepare('INSERT INTO developer_events(id,actor_id,module_id,action,note) SELECT ?,?,?,?,? WHERE EXISTS(SELECT 1 FROM module_maintainers WHERE module_id=? AND user_id=?)').bind(crypto.randomUUID(),adminId??ADMIN_ACTOR,match[1],request.method==='DELETE'?'maintainer-revoked':'maintainer-restored',note,match[1],match[2]),
      db.prepare('UPDATE module_maintainers SET revoked=? WHERE module_id=? AND user_id=?').bind(request.method==='DELETE'?1:0,match[1],match[2]),
    ])
    return response({ok:true})
  }
  if (path.startsWith('/api/developer/')) {
    if(!developer?.github_id||developer.suspended||!developerModules(developer.github_login).length)throw new HttpError(401,'Verify a GitHub account listed as a module author or maintainer to manage your modules.')
    const member=developer,modules=await maintainedModules(db,member)
    const claim=path.match(/^\/api\/developer\/modules\/([a-z0-9-]+)\/claim$/)
    if(claim&&request.method==='POST'){
      const module=communityModule(claim[1])
      if(!module||!module.maintainers.some(login=>login.toLowerCase()===member.github_login?.toLowerCase()))throw new HttpError(403,'Your GitHub account is not a declared maintainer of this module.')
      const existing=await db.prepare('SELECT user_id,revoked FROM module_maintainers WHERE module_id=? AND github_login=? COLLATE NOCASE').bind(module.id,member.github_login).first<{user_id:string;revoked:number}>()
      if(existing?.revoked)throw new HttpError(403,'Access was revoked. Contact the administrator.')
      if(existing&&existing.user_id!==member.id)throw new HttpError(409,'This maintainer handle is already linked to another GitHub identity. Ask the administrator to review the source identity.')
      await throttle(db,'module-claim:'+member.id,30)
      await db.batch([db.prepare('INSERT INTO module_maintainers(module_id,user_id,github_login) VALUES(?,?,?) ON CONFLICT(module_id,user_id) DO NOTHING').bind(module.id,member.id,member.github_login),db.prepare('INSERT INTO developer_events(id,actor_id,module_id,action) VALUES(?,?,?,?)').bind(crypto.randomUUID(),member.id,module.id,'module-claimed'),db.prepare('INSERT INTO forum_follows(thread_id,user_id) SELECT id,? FROM forum_threads WHERE id=? ON CONFLICT DO NOTHING').bind(member.id,moduleThreadId(module.id))])
      return response({ok:true},201)
    }
    const release=path.match(/^\/api\/developer\/modules\/([a-z0-9-]+)\/releases\/complete$/)
    if(release&&request.method==='POST'){
      const module=modules.find(item=>item.id===release[1])
      if(!module)throw new HttpError(403,'You do not maintain that module.')
      return await completeModuleRelease(request,env,db,member,module)
    }
    const requested = url.searchParams.get('moduleId') ?? ''
    if (requested && !modules.some(module => module.id === requested)) throw new HttpError(403,'You do not maintain that module.')
    if (path === '/api/developer/notifications') {
      const ids=modules.map(module=>module.id)
      if(!ids.length)return response(request.method==='GET'?[]:{ok:true})
      // Only modules the developer still maintains; revoked or removed claims drop out of the inbox.
      const scope=`n.user_id=? AND n.module_id IN (${ids.map(()=>'?').join(',')})`
      if(request.method==='GET')return response((await db.prepare(`${ITEM_SQL} WHERE ${scope} AND ${VISIBLE} ORDER BY n.created_at DESC,n.rowid DESC LIMIT 100`).bind(member.id,...ids).all<Parameters<typeof toItem>[0]>()).results.map(toItem))
      if(request.method==='PATCH'){
        await throttle(db,'developer-notifications:'+member.id,30)
        await db.prepare(`UPDATE notifications SET seen=1 WHERE id IN (SELECT n.id FROM notifications n WHERE ${scope})`).bind(member.id,...ids).run()
        return response({ok:true})
      }
      throw new HttpError(405,'Choose a supported notification action.')
    }
    if (path === '/api/developer/modules' && request.method === 'GET') {
      const candidates=developerModules(member.github_login)
      const grants=(await db.prepare('SELECT module_id,revoked FROM module_maintainers WHERE user_id=?').bind(member.id).all<{module_id:string;revoked:number}>()).results
      return response(await Promise.all(candidates.map(async module => ({...module,claimed:modules.some(value=>value.id===module.id),blocked:grants.some(grant=>grant.module_id===module.id&&grant.revoked===1),
        reports:modules.some(value=>value.id===module.id)?await db.prepare("SELECT COUNT(*) AS total,SUM(CASE WHEN status='open' THEN 1 ELSE 0 END) AS open FROM issues WHERE (module_id=? OR id IN(SELECT issue_id FROM issue_modules WHERE module_id=?)) AND maintainer_sharing=1 AND public_sharing=0").bind(module.id,module.id).first():{total:0,open:0},
        ratings:await db.prepare('SELECT COUNT(*) AS count,AVG(value) AS average FROM ratings WHERE module_id=?').bind(module.id).first(),
        threads:(await db.prepare('SELECT COUNT(*) AS count FROM forum_threads WHERE module_id=? AND hidden=0').bind(module.id).first<{count:number}>())?.count ?? 0,
      }))))
    }
    if (path === '/api/developer/issues' && request.method === 'GET') {
      const ids = requested ? [requested] : modules.map(module => module.id), status = url.searchParams.get('status') ?? 'open'
      if (!['open','closed','all'].includes(status)) throw new HttpError(400,'Choose all, open or closed reports.')
      if (!ids.length) return response([])
      const marks=ids.map(()=>'?').join(',')
      return response((await db.prepare(`SELECT id,module_id,scope,title,body,status,created_at,forum_thread_id,github_url FROM issues WHERE maintainer_sharing=1 AND public_sharing=0 AND (module_id IN (${marks}) OR id IN(SELECT issue_id FROM issue_modules WHERE module_id IN (${marks}))) AND (?='all' OR status=?) ORDER BY created_at DESC,rowid DESC LIMIT 200`).bind(...ids,...ids,status,status).all()).results)
    }
    throw new HttpError(404,'Developer route not found.')
  }
  if (path !== '/api/issues/mine' && (match = path.match(/^\/api\/issues\/([a-zA-Z0-9-]+)(?:\/(replies|log))?$/))) {
    const {issue,reporter,reported,canManage,actor} = await accessIssue(db,match[1],user,admin,developer)
    if (match[2] === 'log' && request.method === 'GET') {
      const log = await db.prepare('SELECT text FROM issue_logs WHERE issue_id=?').bind(issue.id).first<{text:string}>()
      if (!log) throw new HttpError(404,'No log is attached.')
      return new Response(log.text,{headers:{'Content-Type':'text/plain; charset=us-ascii','Content-Disposition':'attachment; filename="OCTAMOD.LOG"','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}})
    }
    if (!match[2] && request.method === 'GET') {
      const page = Number(url.searchParams.get('page') ?? 0)
      if (!Number.isInteger(page) || page < 0 || page > 10000) throw new HttpError(400,'Invalid reply page.')
      const replies = (await db.prepare('SELECT r.id,r.body,r.created_at,u.username,u.display_name AS author FROM issue_replies r JOIN users u ON u.id=r.user_id WHERE issue_id=? ORDER BY r.created_at,r.rowid LIMIT 101 OFFSET ?').bind(issue.id,page*100).all()).results
      const log = await db.prepare('SELECT summary_json FROM issue_logs WHERE issue_id=?').bind(issue.id).first<{summary_json:string}>()
      return response({id:issue.id,module_id:issue.module_id,scope:issue.scope,reportedModules:issue.scope==='configuration'?reported:[],title:issue.title,body:issue.body,status:issue.status,created_at:issue.created_at,forumThreadId:issue.forum_thread_id,githubUrl:issue.github_url,context:issue.context_json?JSON.parse(issue.context_json):null,maintainerSharing:!!issue.maintainer_sharing,canShare:reporter&&!!user?.email_verified&&!issue.public_sharing,canManage,hasLog:!!log,replies:replies.slice(0,100),hasMore:replies.length>100})
    }
    const member = admin || actor?.github_id ? actor! : needMember(user)
    await throttle(db,'private-report:'+member.id,30)
    const body = await jsonBody(request)
    if (match[2] === 'replies' && request.method === 'POST') {
      const content = required(body.body,'Reply',4000), replyId = crypto.randomUUID()
      await db.batch([
        db.prepare('INSERT INTO issue_replies(id,issue_id,user_id,body) VALUES(?,?,?,?)').bind(replyId,issue.id,member.id,content),
        ...issueReplyStatements(db,issue,reported,replyId,member.id,content),
      ])
      return response({ok:true},201)
    }
    if (!match[2] && request.method === 'PATCH') {
      const closingWithoutRelease = body.closureReason !== undefined
      if (closingWithoutRelease ? Object.keys(body).some(key=>!['status','closureReason','note'].includes(key)) : Object.keys(body).length !== 1) throw new HttpError(400,'Choose one report action.')
      if (typeof body.maintainerSharing === 'boolean') {
        if (!reporter || !user?.email_verified || issue.public_sharing) throw new HttpError(403,'Only the reporter can change private sharing.')
        await db.batch([
          db.prepare('UPDATE issues SET maintainer_sharing=? WHERE id=?').bind(Number(body.maintainerSharing),issue.id),
          db.prepare('INSERT INTO developer_events(id,actor_id,module_id,issue_id,action) VALUES(?,?,?,?,?)').bind(crypto.randomUUID(),member.id,issue.module_id,issue.id,body.maintainerSharing?'report-shared':'report-unshared'),
        ])
        return response({ok:true})
      }
      if (!canManage) throw new HttpError(403,'Only an authorized maintainer or administrator can resolve this report.')
      if (body.status !== 'open' && body.status !== 'closed') throw new HttpError(400,'Choose open or closed.')
      if (closingWithoutRelease && (body.status !== 'closed' || !isReportClosureReason(body.closureReason) || issue.github_number == null)) throw new HttpError(400,'Choose a closure reason for a GitHub report.')
      const note = closingWithoutRelease ? required(body.note,'Public closure explanation',2000) : ''
      if(issue.github_number!=null){
        if(!admin && body.status==='closed' && !closingWithoutRelease)requireRegisteredReleaseAuthor(member)
        const config=githubConfig(env)
        if(!config)throw new HttpError(503,'GitHub report status synchronization is not configured.')
        try {
          if (isReportClosureReason(body.closureReason)) await closeGithubReport(config,issue.github_number,body.closureReason,note,member.github_login??member.display_name)
          else await setGithubIssueState(config,issue.github_number,body.status)
        } catch { throw new HttpError(502,'GitHub could not update this report. Its Modwerk status was not changed; try again.') }
      }
      await db.batch([
        ...issueStatusStatements(db,issue.id,body.status,member.id,null,null,!closingWithoutRelease),
        db.prepare('INSERT INTO developer_events(id,actor_id,module_id,issue_id,action,note) VALUES(?,?,?,?,?,?)').bind(crypto.randomUUID(),member.id,issue.module_id,issue.id,'report-'+body.status,closingWithoutRelease?body.closureReason+': '+note:''),
      ])
      return response({ok:true})
    }
    throw new HttpError(405,'Choose a supported report action.')
  }
  return null
}
