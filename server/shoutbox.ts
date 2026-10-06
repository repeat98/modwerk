import type { Database, User } from './platform'
import { needMember, throttle } from './auth'
import { HttpError, jsonBody, required, response } from './security'
import { SHOUT_MAX_LENGTH } from '../src/community/forum-contract'

export async function shoutbox(request: Request, db: Database, user: User | null, admin: boolean): Promise<Response | null> {
  const url = new URL(request.url), path = url.pathname
  if (!/^\/api\/forum\/shouts(?:\/|$)/.test(path)) return null
  if (path === '/api/forum/shouts' && request.method === 'GET') {
    const page = Number(url.searchParams.get('page') ?? 0)
    if (!Number.isInteger(page) || page < 0 || page > 10000) throw new HttpError(400, 'Invalid page.')
    const limit = url.searchParams.get('compact') === '1' ? 8 : 30
    const rows = (await db.prepare(`SELECT s.id,s.body,s.created_at,s.edited_at,s.hidden,u.username,u.avatar_id AS avatar,s.user_id
      FROM forum_shouts s JOIN users u ON u.id=s.user_id
      WHERE s.hidden=0 OR ?=1 ORDER BY s.rowid DESC LIMIT ? OFFSET ?`)
      .bind(Number(admin),limit+1,page*limit).all<{id:string;body:string;created_at:string;edited_at:string|null;hidden:number;username:string|null;user_id:string}>()).results
    return response({messages:rows.slice(0,limit).map(({user_id,...item})=>({...item,canEdit:!item.hidden&&user_id===user?.id&&!!user?.email_verified&&!user?.suspended})),hasMore:rows.length>limit})
  }
  const member = needMember(user)
  await throttle(db,'shoutbox:'+member.id,60)
  await throttle(db,'shoutbox-ip:'+(request.headers.get('CF-Connecting-IP')??'local'),120)
  if (path === '/api/forum/shouts' && request.method === 'POST') {
    const body = await jsonBody(request), text = required(body.body,'Message',SHOUT_MAX_LENGTH)
    await throttle(db,'shout-send:'+member.id,6,60)
    await throttle(db,'shout-send-hour:'+member.id,30)
    const id = crypto.randomUUID()
    await db.prepare('INSERT INTO forum_shouts(id,user_id,body) VALUES(?,?,?)').bind(id,member.id,text).run()
    return response({id},201)
  }
  const match = path.match(/^\/api\/forum\/shouts\/([a-zA-Z0-9-]+)(?:\/(report))?$/)
  if (!match) throw new HttpError(404,'Message not found.')
  const message = await db.prepare('SELECT id,user_id FROM forum_shouts WHERE id=? AND hidden=0').bind(match[1]).first<{id:string;user_id:string}>()
  if (!message) throw new HttpError(404,'Message not found.')
  if (match[2] === 'report' && request.method === 'POST') {
    const body = await jsonBody(request)
    await db.prepare('INSERT INTO forum_shout_reports(id,shout_id,user_id,reason) VALUES(?,?,?,?) ON CONFLICT(shout_id,user_id) DO NOTHING')
      .bind(crypto.randomUUID(),message.id,member.id,required(body.reason,'Reason',1000)).run()
    return response({ok:true})
  }
  if (!match[2] && ['PATCH','DELETE'].includes(request.method)) {
    if (message.user_id !== member.id) throw new HttpError(403,'You can change only your own messages.')
    if (request.method === 'DELETE') await db.prepare('DELETE FROM forum_shouts WHERE id=? AND user_id=?').bind(message.id,member.id).run()
    else {
      const body = await jsonBody(request)
      const edited = await db.prepare('UPDATE forum_shouts SET body=?,edited_at=CURRENT_TIMESTAMP WHERE id=? AND hidden=0 RETURNING id')
        .bind(required(body.body,'Message',SHOUT_MAX_LENGTH),message.id).first()
      if (!edited) throw new HttpError(409,'This message is no longer available.')
    }
    return response({ok:true})
  }
  throw new HttpError(405,'Choose a supported message action.')
}
