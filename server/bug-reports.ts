import type { Database } from './platform'
import { communityModule, type CommunityModule } from '../src/community/modules'
import { configurationSummary, type ReportedModule } from '../src/community/configuration-report'
import { isDigiIssue, OT_MODELS, type IssueContext } from '../src/community/issue-context'
import type { OtLog } from '../src/community/ot-log'

/** Current, claimed, GitHub-verified maintainers of a catalog module, excluding one member and the developer
 * identity linked to that member's GitHub sign-in, so maintainers are not notified about their own activity. */
export function moduleDevelopers(module: CommunityModule, excludedId: string) {
  const handles = module.maintainers.map(login => login.toLowerCase())
  const recipients = `SELECT m.user_id FROM module_maintainers m JOIN users u ON u.id=m.user_id WHERE m.module_id=? AND m.revoked=0 AND u.suspended=0 AND u.github_id IS NOT NULL AND lower(u.github_login)=lower(m.github_login) AND lower(m.github_login) IN (${handles.map(() => '?').join(',')}) AND m.user_id<>? AND NOT EXISTS(SELECT 1 FROM auth_accounts g WHERE g.userId=? AND g.providerId='github' AND g.accountId=u.github_id)`
  return { recipients, values: [module.id, ...handles, excludedId, excludedId] }
}
export function followModuleDevelopers(db: Database, module: CommunityModule, threadId: string, excludedId = '') {
  const { recipients, values } = moduleDevelopers(module, excludedId)
  return db.prepare(`INSERT INTO forum_follows(thread_id,user_id) SELECT ?,user_id FROM (${recipients}) WHERE 1 ON CONFLICT DO NOTHING`).bind(threadId,...values)
}
/** Deliver public bugs to current, claimed, GitHub-verified module maintainers. */
export function notifyBugDevelopers(db: Database, moduleId: string | null, threadId: string, postId: string, reporterId: string) {
  const module = moduleId ? communityModule(moduleId) : undefined
  if (!module) return []
  const { recipients, values } = moduleDevelopers(module, reporterId)
  return [
    followModuleDevelopers(db, module, threadId, reporterId),
    db.prepare(`INSERT INTO notifications(id,user_id,kind,actor_id,thread_id,post_id,module_id) SELECT lower(hex(randomblob(16))),user_id,'bug_report',?,?,?,? FROM (${recipients}) WHERE 1 ON CONFLICT DO NOTHING`).bind(reporterId,threadId,postId,module.id,...values),
  ]
}

/** Deliver a configuration report once to every current maintainer of any module in it, even one who maintains several. */
export function notifyConfigurationDevelopers(db: Database, modules: readonly Pick<ReportedModule, 'id'>[], threadId: string, postId: string, reporterId: string) {
  const parts = modules.flatMap(({ id }) => { const module = communityModule(id); return module ? [{ module, ...moduleDevelopers(module, reporterId) }] : [] })
  if (!parts.length) return []
  const recipients = parts.map(part => part.recipients).join(' UNION '), values = parts.flatMap(part => part.values)
  return [
    db.prepare(`INSERT INTO forum_follows(thread_id,user_id) SELECT ?,user_id FROM (${recipients}) WHERE 1 ON CONFLICT DO NOTHING`).bind(threadId, ...values),
    db.prepare(`INSERT INTO notifications(id,user_id,kind,actor_id,thread_id,post_id,module_id) SELECT lower(hex(randomblob(16))),user_id,'bug_report',?,?,?,? FROM (${recipients}) WHERE 1 ON CONFLICT DO NOTHING`).bind(reporterId, threadId, postId, parts[0].module.id, ...values),
  ]
}

/** What a whole-configuration report publishes: the device and the reporter's text, plus which modules and versions the configuration holds. The build fingerprint and log stay private. */
export function publicConfigurationDetails(context: IssueContext, modules: readonly ReportedModule[], steps: string, expected: string, actual: string) {
  return { device: (isDigiIssue(context) ? context.model : OT_MODELS[context.model]) + ' · OS ' + context.os, version: configurationSummary(modules.length), steps, expected, actual, modules: modules.map(({ id, name, version }) => ({ id, name, version })) }
}

/** Keep the complete configuration, build fingerprint and log out of public threads. */
export function publicBugDetails(moduleId: string, context: IssueContext, log: OtLog | null, steps: string, expected: string, actual: string) {
  const nativeId = communityModule(moduleId)?.moduleId ?? moduleId
  const version = isDigiIssue(context) ? context.moduleVersion : log?.summary.modules.find(item => item.id===nativeId)?.version ?? context.modules.find(item => item.id===nativeId)?.version ?? 'Not recorded'
  return {device:(isDigiIssue(context)?context.model:OT_MODELS[context.model])+' · OS '+context.os,version,steps,expected,actual}
}
