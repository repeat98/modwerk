import { confirmAccount } from './account-confirmation'
import type { Database, User } from './platform'
import { HttpError, jsonBody, required, response } from './security'
import { throttle } from './auth'
import { withPrivacyDeadline } from './privacy-deadline'

/** Requests are private and reversible. Data removal is a separate operator action. */
export async function accountRequest(request: Request, db: Database, owner: User|null,sessionCreatedAt?:Date|string) {
 if(!owner?.username||!owner.email_verified)throw new HttpError(401,'Sign in to manage an account-removal request.')
 if(request.method==='GET'){const row=await db.prepare('SELECT id,status,created_at,updated_at FROM account_removal_requests WHERE user_id=? ORDER BY created_at DESC,rowid DESC LIMIT 1').bind(owner.id).first<{created_at:string}>();return response(row?withPrivacyDeadline(row):null)}
 await throttle(db,'account-request:'+owner.id,5,900)
 if(request.method==='DELETE'){
  await db.prepare("UPDATE account_removal_requests SET status='cancelled',updated_at=CURRENT_TIMESTAMP WHERE user_id=? AND status IN ('requested','reviewing')").bind(owner.id).run()
  return response({ok:true})
 }
 if(request.method!=='POST')throw new HttpError(405,'Choose a supported account-request action.')
 const body=await jsonBody(request)
 if(body.confirm!=='REQUEST')throw new HttpError(400,'Confirm the removal request.')
  await confirmAccount(db,owner.id,body,sessionCreatedAt)
 await db.prepare("INSERT OR IGNORE INTO account_removal_requests(id,user_id) VALUES(?,?)").bind(crypto.randomUUID(),owner.id).run()
 const row=await db.prepare("SELECT id,status,created_at,updated_at FROM account_removal_requests WHERE user_id=? AND status IN ('requested','reviewing')").bind(owner.id).first<{created_at:string}>()
 return response(row?withPrivacyDeadline(row):null,202)
}
export async function reviewAccountRequest(request:Request,db:Database,id:string){
 const body=await jsonBody(request)
 if(body.status!=='reviewing'&&body.status!=='cancelled'&&body.status!=='completed')throw new HttpError(400,'Choose reviewing, cancelled or completed.')
 const requestRow=await db.prepare('SELECT user_id,status FROM account_removal_requests WHERE id=?').bind(id).first<{user_id:string;status:string}>()
 if(!requestRow)throw new HttpError(404,'Request not found.')
 if(!['requested','reviewing'].includes(requestRow.status))throw new HttpError(409,'This request has already ended.')
 if(body.status==='completed'){
  const privateChecks=[['auth_users','id'],['auth_accounts','userId'],['auth_sessions','userId'],['account_tokens','user_id'],['auth_verifications','value'],['sessions','user_id'],['issues','reporter_id'],['configurations','user_id'],['forum_bookmarks','user_id'],['forum_follows','user_id'],['push_subscriptions','user_id'],['signup_events','user_id'],['notifications','user_id'],['notification_preferences','user_id'],['announcement_reads','user_id'],['forum_reports','user_id'],['forum_shout_reports','user_id'],['forum_shouts','user_id'],['messages','user_id'],['conversation_members','user_id'],['message_blocks','user_id'],['message_reports','user_id'],['forum_media','user_id'],['developer_sessions','user_id'],['developer_auth_codes','user_id'],['module_maintainers','user_id'],['issue_replies','user_id'],['developer_events','actor_id'],['account_policy_acceptances','user_id'],['account_news_preferences','user_id'],['member_welcome_mail','user_id']] as const
  const checks=privateChecks.map(([table,column])=>`EXISTS(SELECT 1 FROM ${table} WHERE ${column}=?)`)
  checks.push("EXISTS(SELECT 1 FROM users WHERE id=? AND (username IS NOT NULL OR github_id IS NOT NULL OR github_login IS NOT NULL OR email_verified=1 OR suspended=0 OR display_name!='Deleted member'))")
  const remaining=await db.prepare('SELECT '+checks.join(' OR ')+' AS present').bind(...checks.map(()=>requestRow.user_id)).first<{present:number}>()
  if(remaining?.present)throw new HttpError(409,'Account data is still present. Complete and verify the separately authorized operator procedure first.')
 }
 const updated=await db.prepare("UPDATE account_removal_requests SET status=?,review_note=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND status IN ('requested','reviewing') RETURNING id").bind(body.status,required(body.note,'Review note',1000),id).first()
 if(!updated)throw new HttpError(409,'This request has already ended.')
 return response({ok:true})
}
