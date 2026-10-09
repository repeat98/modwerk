import { confirmAccount } from './account-confirmation'
import type { Database, User } from './platform'
import { HttpError, jsonBody, response } from './security'
import { throttle } from './auth'
import { backfillWorkingReports } from './working-reports'

/** Only the verified owner, after reauthentication. Never export credentials or another member's text. */
export async function accountExport(request:Request,db:Database,owner:User|null,sessionCreatedAt?:Date|string){
  if(!owner?.username||!owner.email_verified||owner.suspended)throw new HttpError(401,'Sign in to download your account data.')
  if(request.method!=='POST')throw new HttpError(405,'Use the account data download form.')
  await throttle(db,'account-export:'+owner.id,5,900)
  const body=await jsonBody(request)
  await confirmAccount(db,owner.id,body,sessionCreatedAt)
  await backfillWorkingReports(db)
  // Explicit field lists keep operator notes, access/session tokens and password hashes out.
  const queries={
    account:'SELECT id,name,email,emailVerified,createdAt,updatedAt,username,displayUsername FROM auth_users WHERE id=?',
    identities:'SELECT providerId,accountId,createdAt,updatedAt FROM auth_accounts WHERE userId=?',
    policyAcceptances:'SELECT version,accepted_at FROM account_policy_acceptances WHERE user_id=?',
    discordInvitation:'SELECT shown_at FROM member_discord_invites WHERE user_id=?',
    welcomeEmail:'SELECT state,template_version,accepted_at,first_attempt_at,attempts FROM member_welcome_mail WHERE user_id=?',
    newsPreferences:'SELECT enabled,consent_version,changed_at FROM account_news_preferences WHERE user_id=?',
    newsEmails:'SELECT campaign_id,status,attempted_at,attempts FROM news_deliveries WHERE member_id=?',
    configurations:'SELECT id,name,modules_json,revision,updated_at,keep_stock_fx2,module_versions_json FROM configurations WHERE user_id=?',
    comments:"SELECT p.id,t.module_id,p.body,p.created_at FROM forum_posts p JOIN forum_threads t ON t.id=p.thread_id WHERE p.user_id=? AND p.hidden<2 AND t.id='module-' || t.module_id AND p.id<>t.id",
    workingReports:'SELECT module_id,machine,os,module_version,catalog_version,build_json,source_post_id,created_at FROM module_working_reports WHERE user_id=?',
    ratings:'SELECT module_id,value FROM ratings WHERE user_id=?',
    likes:'SELECT module_id FROM likes WHERE user_id=?',
    threads:'SELECT id,title,COALESCE(section,category) AS category,machine,module_id,configuration_json,issue_json,status,locked,hidden,created_at,updated_at FROM forum_threads WHERE user_id=?',
    posts:'SELECT id,thread_id,body,hidden,created_at,edited_at FROM forum_posts WHERE user_id=? AND hidden<2',
    postMedia:'SELECT id,post_id,kind,mime,bytes,caption,created_at FROM forum_media WHERE user_id=? AND removed=0',
    profilePicture:'SELECT avatar_id AS id,avatar_mime AS mime FROM users WHERE id=? AND avatar_id IS NOT NULL',
    profileLinks:'SELECT instagram_url AS instagramUrl,soundcloud_url AS soundcloudUrl,bandcamp_url AS bandcampUrl FROM users WHERE id=?',
    onlineList:'SELECT show_online AS shown FROM users WHERE id=?',
    role:'SELECT role FROM users WHERE id=?',
    shoutboxMessages:'SELECT id,body,hidden,created_at,edited_at FROM forum_shouts WHERE user_id=?',
    shoutboxReports:'SELECT id,shout_id,reason,resolved,created_at FROM forum_shout_reports WHERE user_id=?',
    conversations:'SELECT c.id,c.created_at,cm.last_read_at FROM conversation_members cm JOIN conversations c ON c.id=cm.conversation_id WHERE cm.user_id=?',
    messagesSent:'SELECT id,conversation_id,body,hidden,created_at FROM messages WHERE user_id=?',
    messageBlocks:'SELECT u.username,b.created_at FROM message_blocks b JOIN users u ON u.id=b.blocked_id WHERE b.user_id=?',
    messageReports:'SELECT id,conversation_id,reason,resolved,created_at FROM message_reports WHERE user_id=?',
    reactions:'SELECT post_id FROM forum_reactions WHERE user_id=?',
    follows:'SELECT thread_id FROM forum_follows WHERE user_id=?',
    bookmarks:'SELECT thread_id FROM forum_bookmarks WHERE user_id=?',
    threadReads:'SELECT thread_id,last_read_at,last_read_post_id FROM forum_thread_reads WHERE member_id=?',
    forumVisits:'SELECT seen_at,last_visit_at,all_read_at FROM forum_visits WHERE member_id=?',
    notifications:'SELECT id,kind,thread_id,post_id,module_id,module_version,issue_id,github_actor,excerpt,seen,emailed,created_at FROM notifications WHERE user_id=?',
    creatorSupport:'SELECT module_id,ko_fi_url,updated_at FROM module_creator_support WHERE user_id=?',
    moduleUpdateOptOuts:'SELECT module_id,created_at FROM module_update_opt_outs WHERE user_id=?',
    moduleUpdateSubscriptions:'SELECT module_id,after_version,created_at FROM module_update_subscriptions WHERE user_id=?',
    pushDevices:'SELECT activity,signups,created_at FROM push_subscriptions WHERE user_id=?',
    signupEvent:'SELECT username,created_at FROM signup_events WHERE user_id=?',
    lastSeen:"SELECT strftime('%Y-%m-%dT%H:%M:%SZ',seen_at,'unixepoch') AS seen_at FROM member_presence WHERE user_id=?",
    announcementReads:'SELECT announcement_id,read_at FROM announcement_reads WHERE user_id=?',
    notificationPreferences:'SELECT email_enabled,frequency,replies,likes,modules,bugs,updates,last_digest_at,changed_at FROM notification_preferences WHERE user_id=?',
    reports:'SELECT id,post_id,reason,resolved,created_at FROM forum_reports WHERE user_id=?',
    issues:'SELECT id,module_id,title,body,status,created_at,context_json,log_missing,log_missing_note,github_url,public_sharing,maintainer_sharing,forum_thread_id,public_json FROM issues WHERE reporter_id=?',
    issueLogs:'SELECT l.issue_id,l.text,l.bytes,l.summary_json FROM issue_logs l JOIN issues i ON i.id=l.issue_id WHERE i.reporter_id=?',
    removalRequests:'SELECT id,status,created_at,updated_at FROM account_removal_requests WHERE user_id=?',
    contributions:'SELECT id,module_id,title,repository_url,description,usage,test_report_url,stress_notes,quality_notes,resource_notes,license,rights_confirmed,status,created_at FROM submissions WHERE owner_id=?',
    contributionMedia:'SELECT m.id,m.submission_id,m.kind,m.mime,m.caption,m.capture_type,m.bytes FROM media m JOIN submissions s ON s.id=m.submission_id WHERE s.owner_id=?',
  }
  const entries=Object.entries(queries)
  // One D1 batch gives a consistent snapshot and cannot race individual writes.
  const results=await db.batch(entries.map(([,sql])=>db.prepare(sql).bind(owner.id))) as {results:unknown[]}[]
  const out=response({format:'modwerk-account-data-v1',exportedAt:new Date().toISOString(),data:Object.fromEntries(entries.map(([key],index)=>[key,results[index].results]))})
  out.headers.set('Content-Disposition','attachment; filename="modwerk-account-data.json"')
  out.headers.set('Referrer-Policy','no-referrer')
  return out
}
