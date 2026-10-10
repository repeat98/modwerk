import { notifyConfigurationDevelopers, publicConfigurationDetails } from './bug-reports'
import { needMember, throttle } from './auth'
import { mirrorIssue, githubConfig } from './github'
import { followReportedModules } from './module-updates'
import type { Database, Env, User } from './platform'
import { HttpError, jsonBody, optional, required, response } from './security'
import { configurationOwners, configurationSummary, validateConfigurationReportContext } from '../src/community/configuration-report'
import { IssueInputError } from '../src/community/issue-context'
import { OT_LOG_MAX_BYTES, OtLogError, parseOtLog } from '../src/community/ot-log'
import { communityModule } from '../src/community/modules'

const FIELDS = ['title', 'steps', 'expected', 'actual', 'context', 'log', 'maintainerSharing', 'visibility', 'notifyUpdates']
function input<T>(read: () => T): T { try { return read() } catch (error) { if (error instanceof IssueInputError || error instanceof OtLogError) throw new HttpError(400, error.message); throw error } }

/**
 * POST /api/configuration-reports. One report for a problem in a whole configuration: it is stored once, listed on
 * every module it contains, and reaches the authors and maintainers of all of them. Everything else follows the
 * module report: the same limits and privacy rules, and the same optional device log.
 */
export async function createConfigurationReport(request: Request, env: Env, db: Database, user: User | null) {
  const owner = needMember(user)
  const body = await jsonBody(request, OT_LOG_MAX_BYTES + 32 * 1024)
  if (Object.keys(body).some(key => !FIELDS.includes(key))) throw new HttpError(400, 'Unexpected report field. Files and firmware are not accepted.')
  if (body.notifyUpdates !== undefined && typeof body.notifyUpdates !== 'boolean') throw new HttpError(400, 'Choose whether to follow module updates.')
  if (body.visibility !== undefined && body.visibility !== 'forum' && body.visibility !== 'private') throw new HttpError(400, 'Choose a public forum report or a private report.')
  if (body.maintainerSharing !== undefined && typeof body.maintainerSharing !== 'boolean') throw new HttpError(400, 'Choose whether to share with verified maintainers.')
  const publicReport = body.visibility === 'forum'
  const title = required(body.title, 'Issue title', 160), steps = optional(body.steps, 'Steps to reproduce', 3000), expected = optional(body.expected, 'Expected result', 1000), actual = required(body.actual, 'What happened', 2000)
  const attached = body.log !== undefined && body.log !== null && body.log !== ''
  if (attached && typeof body.log !== 'string') throw new HttpError(400, 'Attach OCTAMOD.LOG as text.')
  const log = attached ? input(() => parseOtLog(body.log as string)) : null
  // An attached log records the configuration the device ran; otherwise the reporter names it.
  const { context, modules } = input(() => validateConfigurationReportContext(body.context, log?.summary ?? null))
  await throttle(db, 'issue-ip:' + (request.headers.get('CF-Connecting-IP') ?? 'local'), 10)
  await throttle(db, 'issue-global', 60)
  await throttle(db, 'issue-member:' + owner.id, 10)
  const anchor = communityModule(modules[0].id)!, owners = configurationOwners(modules)
  const id = crypto.randomUUID(), details = [['Steps to reproduce', steps], ['Expected', expected], ['Actual', actual]].filter(([, text]) => text).map(([label, text]) => label + ':\n' + text).join('\n\n')
  const publicDetails = publicReport ? publicConfigurationDetails(context, modules, steps, expected, actual) : null
  // With GitHub configured, a public report becomes a GitHub issue and gets no forum thread of its own.
  const github = publicReport && !!githubConfig(env)
  const threadId = publicReport && !github ? crypto.randomUUID() : null, postId = crypto.randomUUID()
  const statements = threadId ? [
    db.prepare("INSERT INTO forum_threads(id,user_id,title,category,machine,module_id,issue_json) VALUES(?,?,?,'issues',?,?,?)").bind(threadId, owner.id, title, anchor.machine, anchor.id, JSON.stringify(publicDetails)),
    db.prepare('INSERT INTO forum_posts(id,thread_id,user_id,body) VALUES(?,?,?,?)').bind(postId, threadId, owner.id, 'Configuration (' + configurationSummary(modules.length) + '): ' + modules.map(module => module.name + ' ' + module.version).join(', ') + '\n\n' + details),
    db.prepare('INSERT INTO forum_follows(thread_id,user_id) VALUES(?,?)').bind(threadId, owner.id),
    ...notifyConfigurationDevelopers(db, modules, threadId, postId, owner.id),
  ] : []
  statements.push(db.prepare("INSERT INTO issues(id,module_id,author_login,reporter_id,title,body,context_json,github_state,maintainer_sharing,forum_thread_id,public_json,scope) VALUES(?,?,?,?,?,?,?,?,?,?,?,'configuration')").bind(id, anchor.id, anchor.author, owner.id, title, details, JSON.stringify(context), github ? 'pending' : 'none', Number(publicReport || body.maintainerSharing === true), threadId, publicDetails && JSON.stringify(publicDetails)))
  for (const module of modules) statements.push(db.prepare('INSERT INTO issue_modules(issue_id,module_id,version) VALUES(?,?,?) ON CONFLICT DO NOTHING').bind(id, module.id, module.version))
  if (log) statements.push(db.prepare('INSERT INTO issue_logs(issue_id,text,bytes,summary_json) VALUES(?,?,?,?)').bind(id, log.text, log.text.length, JSON.stringify(log.summary)))
  if (body.notifyUpdates !== false) statements.push(...followReportedModules(db, modules.map(module => module.id), owner.id))
  await db.batch(statements)
  // The report is stored either way; a failed mirror stays retryable from the admin inbox.
  const mirrored = github ? await mirrorIssue(db, env, id) : { state: 'none' as const }
  return response({ ok: true, id, author: anchor.author, owners, modules: modules.length, forumThreadId: threadId, github: mirrored.state, githubUrl: 'url' in mirrored ? mirrored.url ?? null : null }, 201)
}
