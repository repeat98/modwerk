import { needMember, throttle } from './auth'
import { githubCommentOnce, githubConfig, githubIssueReplies, inert } from './github'
import { claimGithubAction } from './github-actions'
import { profilePath } from '../src/community/forum-links'
import type { Database, Env, User } from './platform'
import { digest, HttpError, jsonBody, required, response } from './security'

/** Read or reply to an explicitly published, module-scoped report; never a general GitHub proxy. */
export async function publicIssueReplies(request: Request, env: Env, db: Database, user: User | null = null): Promise<Response | null> {
  const url = new URL(request.url)
  const match = url.pathname.match(/^\/api\/modules\/([a-z0-9-]+)\/issues\/([a-zA-Z0-9-]+)\/replies$/)
  if (!match || !['GET', 'POST'].includes(request.method)) return null
  const page = Number(url.searchParams.get('page') ?? 0)
  if (!Number.isSafeInteger(page) || page < 0 || page > 10000) throw new HttpError(400, 'Choose a valid reply page.')
  // A whole-configuration report is a conversation on each of its modules.
  const issue = await db.prepare('SELECT github_number FROM issues WHERE id=? AND (module_id=? OR EXISTS(SELECT 1 FROM issue_modules m WHERE m.issue_id=issues.id AND m.module_id=?)) AND public_json IS NOT NULL AND github_url IS NOT NULL AND github_number IS NOT NULL').bind(match[2], match[1], match[1]).first<{ github_number: number }>()
  if (!issue || !Number.isSafeInteger(issue.github_number) || issue.github_number <= 0) throw new HttpError(404, 'Public GitHub report not found.')
  const config = githubConfig(env)
  if (!config) throw new HttpError(503, 'GitHub replies are temporarily unavailable. Open the conversation on GitHub.')
  if (request.method === 'POST') {
    const member = needMember(user), body = await jsonBody(request)
    if (Object.keys(body).sort().join(',') !== 'body,requestId' || typeof body.requestId !== 'string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(body.requestId)) throw new HttpError(400, 'Send a reply with a fresh request identifier.')
    const content = required(body.body, 'Public reply', 4000)
    await throttle(db, 'github-post-member:' + member.id, 20)
    await throttle(db, 'github-post-ip:' + (request.headers.get('CF-Connecting-IP') ?? 'local'), 30)
    await throttle(db, 'github-post', 300)
    const key = 'reply:' + member.id + ':' + body.requestId
    const receipt = await claimGithubAction(db, key, match[2], member.id, content)
    if (!receipt) return response({ ok: true }, 201)
    try {
      const author = inert(member.username!), profile = new URL(profilePath(member.username!), env.APP_URL).href
      const marker = '<!-- modwerk-reply:' + await digest(key) + ' -->'
      const text = 'Reply from **[' + author + ' on Modwerk](' + profile + ')**:\n\n' + inert(content).split(/\r?\n/).map(line => '> ' + line).join('\n')
      await db.prepare('UPDATE github_actions SET published_hash=? WHERE id=?').bind(await digest(text + '\n\n' + marker), key).run()
      await githubCommentOnce(config, issue.github_number, marker, text)
      await db.prepare(`INSERT INTO notifications(id,user_id,kind,actor_id,issue_id,module_id,excerpt,delivery_id)
        SELECT lower(hex(randomblob(16))),i.reporter_id,'issue_comment',?,i.id,i.module_id,?,? FROM issues i JOIN users u ON u.id=i.reporter_id
        WHERE i.id=? AND i.reporter_id<>? AND u.email_verified=1 AND u.suspended=0 ON CONFLICT DO NOTHING`).bind(member.id, content.slice(0, 400), key, match[2], member.id).run()
      await receipt.complete()
      return response({ ok: true }, 201)
    } catch {
      await receipt.release()
      throw new HttpError(502, 'Your reply could not be confirmed on GitHub. Keep this draft and try sending it again; retries reuse the same reply.')
    }
  }
  await throttle(db, 'github-replies-ip:' + (request.headers.get('CF-Connecting-IP') ?? 'local'), 60)
  await throttle(db, 'github-replies', 1500)
  try { return response(await githubIssueReplies(config, issue.github_number, page)) }
  catch { throw new HttpError(502, 'GitHub replies could not load. Try again or open the conversation on GitHub.') }
}
