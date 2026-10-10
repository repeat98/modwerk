import registeredAuthors from '../.github/module-authors.json'
import { communityModule } from '../src/community/modules'
import { isReportClosureReason } from '../src/community/report-closure'
import { throttle } from './auth'
import { claimGithubAction } from './github-actions'
import { closeGithubReport, githubCommentOnce, inert, setGithubIssueState, type GithubConfig, type WebhookPayload } from './github'
import { issueStatusStatements } from './issue-notifications'
import type { Database, Env } from './platform'
import { finishModuleRelease } from './release-completion'
import { HttpError, required } from './security'

const help = 'Use `/modwerk close configuration|duplicate|not_reproducible|withdrawn <explanation>`, `/modwerk reopen <explanation>`, or `/modwerk resolve <version> verified-download` after verifying that exact published download on your unit. A whole-configuration report names the module: `/modwerk resolve <module-id> <version> verified-download`. Post a new command to retry. Replying and managing reports require no fork or repository write access.'

/** Only newly created, signed comments by a registered numeric GitHub identity can act. */
export async function handleGithubCommand(env: Env, db: Database, config: GithubConfig, issueId: string, number: number, payload: WebhookPayload) {
  const comment = payload.comment!, user = comment.user, login = typeof user?.login === 'string' ? user.login : '', id = user?.id
  if (user?.type !== 'User' || !Number.isSafeInteger(id) || payload.sender?.id !== id || payload.sender?.login !== login || !Number.isSafeInteger(comment.id) || Number(comment.id) <= 0) return { command: 'ignored' }
  const report = await db.prepare('SELECT module_id,scope,maintainer_sharing,public_sharing FROM issues WHERE id=? AND public_json IS NOT NULL AND github_number=?').bind(issueId, number).first<{ module_id: string; scope: 'module' | 'configuration'; maintainer_sharing: number; public_sharing: number }>()
  // A whole-configuration report belongs to every module in it; a maintainer acts for the modules they maintain, and a revoked one drops out.
  const reported = !report ? [] : report.scope === 'configuration' ? (await db.prepare('SELECT module_id FROM issue_modules WHERE issue_id=? ORDER BY rowid').bind(issueId).all<{ module_id: string }>()).results.map(item => item.module_id) : [report.module_id]
  const registered = (registeredAuthors.accounts as Record<string, number>)[login.toLowerCase()]
  const suspended = await db.prepare("SELECT 1 FROM users u WHERE (u.github_id=? OR EXISTS(SELECT 1 FROM auth_accounts a WHERE a.userId=u.id AND a.providerId='github' AND a.accountId=?)) AND u.suspended=1 LIMIT 1").bind(String(id), String(id)).first()
  const revoked = new Set(reported.length ? (await db.prepare(`SELECT m.module_id FROM module_maintainers m JOIN users u ON u.id=m.user_id WHERE m.module_id IN (${reported.map(() => '?').join(',')}) AND m.revoked=1 AND (u.github_id=? OR lower(m.github_login)=lower(?))`).bind(...reported, String(id), login).all<{ module_id: string }>()).results.map(item => item.module_id) : [])
  const maintained = reported.flatMap(moduleId => { const module = communityModule(moduleId); return module && !revoked.has(moduleId) && module.maintainers.some(handle => handle.toLowerCase() === login.toLowerCase()) ? [module] : [] })
  if (!report?.maintainer_sharing || report.public_sharing || registered !== id || suspended || !maintained.length) return { command: 'denied' }
  const body = String(comment.body).trim(), key = 'command:' + comment.id
  const receipt = await claimGithubAction(db, key, issueId, String(id), body)
  if (!receipt) return { command: 'already-completed' }
  try {
    await throttle(db, 'github-command:' + id, 30)
    const match = body.match(/^\/modwerk (close|reopen|resolve)(?:\s+([\s\S]+))?$/)
    let result = '', outcome = 'completed'
    try {
      if (!match) throw new HttpError(400, help)
      const argument = match[2] ?? ''
      if (match[1] === 'resolve') {
        // On a whole-configuration report the release belongs to one module, which the command names.
        const resolve = report.scope === 'configuration' ? argument.match(/^(\S+) (\S+) verified-download$/) : argument.match(/^(\S+) verified-download$/)
        if (!resolve) throw new HttpError(400, help)
        const module = report.scope === 'configuration' ? maintained.find(item => item.id === resolve[1]) : maintained[0]
        if (!module) throw new HttpError(403, 'Name a module of this configuration that you maintain.')
        const completed = await finishModuleRelease(env, db, module, resolve[report.scope === 'configuration' ? 2 : 1], [issueId], { id: null, githubLogin: login })
        result = 'Released **' + inert(completed.version) + '**. ' + completed.updateNotificationsQueued + ' module update notifications queued; delivery follows members’ preferences and the existing push/email schedule.'
      } else if (match[1] === 'close') {
        const close = argument.match(/^(\S+)\s+([\s\S]+)$/)
        if (!close || !isReportClosureReason(close[1])) throw new HttpError(400, help)
        const note = required(close[2], 'Public explanation', 2000)
        await closeGithubReport(config, number, close[1], note, login)
        await db.batch(issueStatusStatements(db, issueId, 'closed', null, login, null, false))
        result = 'Report closed with an explanation; Modwerk status and the reporter notification are synchronized. No firmware release is claimed.'
      } else {
        const note = required(argument, 'Public explanation', 2000)
        await githubCommentOnce(config, number, '<!-- modwerk-reopen:' + comment.id + ' -->', 'Reopened by **' + inert(login) + '**.\n\n' + inert(note).split(/\r?\n/).map(line => '> ' + line).join('\n'))
        await setGithubIssueState(config, number, 'open')
        await db.batch(issueStatusStatements(db, issueId, 'open', null, login))
        result = 'Report reopened on GitHub and Modwerk.'
      }
    } catch (error) {
      if (!(error instanceof HttpError) || error.status >= 500 || error.status === 429) throw error
      result = 'Command could not complete: ' + inert(error.message)
      outcome = 'rejected'
    }
    await githubCommentOnce(config, number, '<!-- modwerk-command:' + comment.id + ' -->', result)
    await receipt.complete()
    return { command: outcome }
  } catch {
    await receipt.release()
    try { await githubCommentOnce(config, number, '<!-- modwerk-command-error:' + comment.id + ' -->', 'The command could not be confirmed. Post a new command or redeliver its webhook to retry. Check the issue status before assuming it completed; no firmware verification has been added by this failure.') } catch { /* The provider may also be unavailable for feedback. */ }
    throw new HttpError(502, 'GitHub command could not complete. Redeliver this webhook or post a new command to retry.')
  }
}
