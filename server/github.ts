import { issueStatusStatements, publicIssueReplyStatement } from './issue-notifications'
import { handleGithubCommand } from './github-commands'
import type { Database, Env } from './platform'
import { HttpError } from './security'
import { communityModule } from '../src/community/modules'
import { configurationSummary } from '../src/community/configuration-report'
import { profilePath } from '../src/community/forum-links'
import { FLASH_STATES, type IssueContext } from '../src/community/issue-context'
import { REPORT_CLOSURE_REASONS, REPORT_COMMANDS, type ReportClosureReason } from '../src/community/report-closure'
import { digest } from './security'

const API = 'https://api.github.com'
const BODY_LIMIT = 60000
export type GithubConfig = { token: string; repository: string }

/** Mirroring is on only with a token and a valid owner/name repository. */
export function githubConfig(env: Env): GithubConfig | null {
  const token = env.GITHUB_TOKEN?.trim() ?? '', repository = env.GITHUB_REPOSITORY?.trim() || 'repeat98/modwerk'
  return token && /^[A-Za-z0-9-]{1,39}\/[A-Za-z0-9_.-]{1,100}$/.test(repository) ? { token, repository } : null
}

async function githubResponse(config: GithubConfig, path: string, method: string, body: unknown): Promise<Response> {
  let result: Response
  try {
    result = await fetch(API + '/repos/' + config.repository + path, {
      method, ...(body === undefined ? {} : { body: JSON.stringify(body) }), redirect: 'manual', signal: AbortSignal.timeout(8000),
      headers: { Authorization: 'Bearer ' + config.token, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json', 'User-Agent': 'octamod-community', 'X-GitHub-Api-Version': '2022-11-28' },
    })
  } catch { throw new Error('GitHub did not respond.') }
  if (!result.ok) {
    let message = ''
    try { message = String(((await result.json()) as { message?: unknown }).message ?? '') } catch { /* status is enough */ }
    throw new Error('GitHub answered ' + result.status + (message ? ': ' + message.slice(0, 200) : '') + '.')
  }
  return result
}

async function github<T>(config: GithubConfig, path: string, method: string, body: unknown): Promise<T> {
  return await (await githubResponse(config, path, method, body)).json() as T
}

/** Read the current public conversation, including replies posted before the site showed them. */
export async function githubIssueReplies(config: GithubConfig, number: number, page: number) {
  const result = await githubResponse(config, '/issues/' + number + '/comments?per_page=20&page=' + (page + 1), 'GET', undefined)
  const rows: unknown = await result.json()
  if (!Array.isArray(rows)) throw new Error('GitHub did not return issue comments.')
  const replies = rows.map(row => {
    if (!row || typeof row !== 'object') throw new Error('GitHub returned an unexpected comment.')
    const { id, body, created_at, updated_at, user } = row
    if (!Number.isSafeInteger(id) || id <= 0 || typeof body !== 'string' || body.length > 65536 || typeof created_at !== 'string' || !Number.isFinite(Date.parse(created_at)) || typeof updated_at !== 'string' || !Number.isFinite(Date.parse(updated_at))) throw new Error('GitHub returned an unexpected comment.')
    return { id, body, created_at, updated_at, author: typeof user?.login === 'string' ? user.login : 'Deleted GitHub account', url: 'https://github.com/' + config.repository + '/issues/' + number + '#issuecomment-' + id }
  })
  return { replies, hasMore: /;\s*rel="next"/.test(result.headers.get('Link') ?? '') }
}

/**
 * Reporter text goes to a public issue: it must not ping people, link other
 * issues or inject markup. Mentions and #references get a zero-width space,
 * and angle brackets are escaped.
 */
export function inert(text: string) {
  return text.replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/@(?=[A-Za-z0-9])/g, '@​').replace(/#(?=[0-9])/g, '#​')
}
const quote = (text: string) => inert(text).split(/\r?\n/).map(line => '> ' + line).join('\n')

/**
 * What the reporter agreed to publish. `full` marks reports filed since 13 October 2026, whose reporters agreed to
 * publish the configuration, build fingerprint and log on GitHub too; older reports keep them on the site.
 */
export type PublicBugDetails = { device: string; version: string; steps: string; expected: string; actual: string; modules?: { id: string; name: string; version: string }[]; full?: boolean }
/** A whole-configuration report lists every module in `moduleIds`; `module_id` is then only the first of them. */
export type MirroredIssue = { id: string; module_id: string; scope?: 'module' | 'configuration'; moduleIds?: string[]; title: string; reporter: string | null; owners: string[]; details: PublicBugDetails; context?: IssueContext; log?: string }

export function issueTitle(issue: Pick<MirroredIssue, 'module_id' | 'scope' | 'title'>) { return ('[' + (issue.scope === 'configuration' ? 'configuration' : issue.module_id) + '] ' + issue.title).slice(0, 256) }
const GITHUB_LOGIN = /^[A-Za-z0-9-]{1,39}$/
const appLink = (app: string | undefined, hash: string) => { if (!app) return null; const url = new URL(app); url.hash = hash; return url.href }
const cell = (text: string) => inert(text).replace(/\|/g, '\\|')

/** The validated log, verbatim in a collapsed block. Past `room` characters the oldest records go; `#` lines stay in place. */
export function logBlock(text: string, room: number) {
  const lines = text.split(/\r?\n/).filter(Boolean), marker = (line: string) => line.startsWith('#')
  let left = room - 300 - lines.filter(marker).reduce((sum, line) => sum + line.length + 1, 0), from = lines.length
  for (; from > 0; from--) {
    const line = lines[from - 1]
    if (marker(line)) continue
    if (line.length + 1 > left) break
    left -= line.length + 1
  }
  const omitted = lines.slice(0, from).filter(line => !marker(line)).length
  // Header values may hold backticks; a longer fence keeps the log inside the code block.
  const fence = '`'.repeat(Math.max(3, ...(text.match(/`+/g) ?? []).map(run => run.length + 1)))
  return ['<details><summary>OCTAMOD.LOG' + (omitted ? ' (oldest ' + omitted + ' records left out to fit GitHub)' : '') + '</summary>', '', fence + 'text', ...lines.filter((line, index) => index >= from || marker(line)), fence, '', '</details>', '']
}

export function issueMarkdown(issue: MirroredIssue, app?: string) {
  const configuration = issue.scope === 'configuration', context = issue.context
  const owners = [...new Set(issue.owners.filter(login => GITHUB_LOGIN.test(login)).map(login => '@' + login))]
  const reporter = issue.reporter ? inert(issue.reporter) : 'a Modwerk member', profile = issue.reporter && app ? new URL(profilePath(issue.reporter), app).href : null
  const site = appLink(app, '') ?? 'https://modwerk.app/', { device, version, steps, expected, actual } = issue.details
  const modules = configuration ? issue.details.modules ?? [] : []
  const report = ['Reported on [Modwerk](' + site + ') for ' + (configuration ? 'the **whole configuration**' : '**`' + issue.module_id + '`**') + ' by ' + (profile ? '[' + reporter + '](' + profile + ')' : reporter) + (owners.length ? ' · ' + owners.join(' ') : ''), '',
    '| | |', '| --- | --- |', '| Device | ' + cell(device) + ' |', configuration ? '| Configuration | ' + configurationSummary(modules.length) + ' |' : '| Module version | ' + cell(version) + ' |',
    ...(context ? ['| Firmware | ' + cell(FLASH_STATES[context.flash]) + ' |', '| Build fingerprint | ' + (context.build ? '`' + context.build + '`' : 'Not recorded') + ' |'] : []), '',
    ...(configuration ? ['### Modules in this configuration', '', ...modules.map(module => '- `' + module.id + '` ' + inert(module.version)), '', 'Reported for the whole configuration: the cause may be one module or how they combine. Reply here to narrow it down, then mention the author of the module at fault.', ''] : []),
    ...(!configuration && context ? ['### Configuration', '', ...(context.modules.length ? context.modules.map(module => '- `' + module.id + '` ' + inert(module.version)) : ['No modules recorded.']), ''] : []),
    ...([['Steps to reproduce', steps], ['Expected', expected], ['Actual', actual]] as const).filter(([, text]) => text).flatMap(([heading, text]) => ['### ' + heading, '', quote(text), ''])]
  const rest = ['---',
    '_' + (issue.details.full ? 'Everything the reporter submitted is in this issue.' : 'The reporter’s configuration, build fingerprint and any device log were not published with this report; ask here if you need them.') + ' Comments and status changes here are sent to the reporter on Modwerk, and the reporter’s replies appear here._', '',
    '### Module maintainer actions', '',
    'Reply here normally. Registered authors and verified current maintainers ' + (configuration ? 'of any module in this configuration ' : '') + 'can manage reports with new comments; no fork or repository write access is needed:', '',
    ...REPORT_COMMANDS.map(command => '- `' + (configuration && command.startsWith('/modwerk resolve') ? '/modwerk resolve <module-id> <published-version> verified-download' : command) + '`'), '',
    'Keep a report open with `needs-info` while waiting for the reporter. Confirm only a reproduced bug; use `unknown` for a configuration report. Questions and suggestions can use `/modwerk classify question|feature <explanation>`. Advanced states: `/modwerk investigate <explanation>`, `/modwerk awaiting-verification <explanation>`, `/modwerk unconfirm <explanation>`.', '',
    'Only the registered release author can use `resolve`, after verifying that exact published download fixes the report on their unit. Ordinary closures claim no new firmware fix.', '',
    'A merged PR alone does not resolve a report. [Author release steps](https://github.com/repeat98/modwerk/blob/main/docs/MODULE_AUTHOR_UPDATES.md).',
  ]
  const log = issue.log ? ['### Device log', '', ...logBlock(issue.log, BODY_LIMIT - [...report, ...rest].join('\n').length)] : []
  return [...report, ...log, ...rest].join('\n').slice(0, BODY_LIMIT)
}

export async function createGithubIssue(config: GithubConfig, issue: MirroredIssue, app?: string) {
  const created = await github<{ number: number; html_url: string }>(config, '/issues', 'POST', { title: issueTitle(issue), body: issueMarkdown(issue, app), labels: ['issue-report', ...(issue.scope === 'configuration' ? ['configuration', ...(issue.moduleIds ?? [issue.module_id]).map(id => 'module:' + id)] : ['module:' + issue.module_id])] })
  if (!Number.isInteger(created.number) || typeof created.html_url !== 'string' || !created.html_url.startsWith('https://github.com/')) throw new Error('GitHub returned an unexpected issue.')
  return { number: created.number, url: created.html_url }
}

export async function setGithubIssueState(config: GithubConfig, number: number, status: 'open' | 'closed', reason: 'completed' | 'not_planned' = 'completed') {
  await github(config, '/issues/' + number, 'PATCH', status === 'closed' ? { state: 'closed', state_reason: reason } : { state: 'open' })
}

export async function githubCommentOnce(config: GithubConfig, number: number, marker: string, body: string) {
  let found = false
  for (let page = 1; page <= 30; page++) {
    const comments = await github<{ body?: string; user?: { login?: string } }[]>(config, '/issues/' + number + '/comments?per_page=100&page=' + page, 'GET', undefined)
    if (!Array.isArray(comments)) throw new Error('GitHub did not return issue comments.')
    if (comments.some(comment => comment.body?.includes(marker))) { found = true; break }
    if (comments.length < 100) break
    if (page === 30) throw new Error('Too many issue comments to verify a retry safely.')
  }
  if (!found) await github(config, '/issues/' + number + '/comments', 'POST', { body: body + '\n\n' + marker })
}

/** Retry-safe release comment followed by issue closure, using only public release metadata. */
export async function resolveGithubRelease(config: GithubConfig, number: number, moduleId: string, version: string, href: string, app: string) {
  const marker = '<!-- modwerk-release:' + moduleId + ':' + version + ' -->'
  await githubCommentOnce(config, number, marker, 'Released **' + inert(moduleId) + ' ' + inert(version) + '**: [module and download](' + new URL(href, app).href + '). The module maintainer confirmed that the published download fixes this report. If the problem remains with this version, please reply with reproduction steps.')
  await setGithubIssueState(config, number, 'closed')
}

/** A maintainer can close a duplicate or explained report without claiming a firmware release. */
export async function closeGithubReport(config: GithubConfig, number: number, reason: ReportClosureReason, note: string, login: string) {
  const marker = '<!-- modwerk-report-closure:' + await digest(reason + '\n' + note) + ' -->'
  await githubCommentOnce(config, number, marker, 'Closed by module maintainer **' + inert(login) + '**: **' + REPORT_CLOSURE_REASONS[reason] + '**.\n\n' + quote(note) + '\n\nNo new firmware fix is claimed by this closure. If the problem remains, reply here with reproduction details so the maintainer can reopen the report.')
  await setGithubIssueState(config, number, 'closed', 'not_planned')
}

type IssueRow = { id: string; module_id: string; scope: 'module' | 'configuration'; author_login: string; title: string; reporter: string | null; github_state: string; public_json: string | null; context_json: string | null }

/**
 * Create the GitHub issue for a stored report. The report is kept whatever GitHub answers.
 * `stale` lets the administrator take over a claim left by a request that died mid-sync.
 */
export async function mirrorIssue(db: Database, env: Env, id: string, stale = false) {
  const config = githubConfig(env)
  if (!config) return { state: 'none' as const }
  const row = await db.prepare('SELECT i.id,i.module_id,i.scope,i.author_login,i.title,i.github_state,i.public_json,i.context_json,u.username AS reporter FROM issues i JOIN users u ON u.id=i.reporter_id WHERE i.id=?').bind(id).first<IssueRow>()
  if (!row) throw new HttpError(404, 'Issue not found.')
  // Only reports whose reporter chose a public bug description are published, and only what they agreed to publish.
  if (!row.public_json) throw new HttpError(400, 'This report is private and cannot be published to GitHub.')
  // Claim the row so concurrent requests cannot open two GitHub issues.
  const claimable = stale ? "('none','pending','failed','syncing')" : "('none','pending','failed')"
  if (!await db.prepare("UPDATE issues SET github_state='syncing',github_error='' WHERE id=? AND github_state IN " + claimable + " RETURNING id").bind(id).first()) return { state: row.github_state as 'synced' | 'syncing' }
  try {
    const moduleIds = row.scope === 'configuration' ? (await db.prepare('SELECT module_id FROM issue_modules WHERE issue_id=? ORDER BY rowid').bind(id).all<{ module_id: string }>()).results.map(item => item.module_id) : undefined
    // A configuration report mentions no one: its cause is unknown, so it is narrowed down before any author is pinged.
    const owners = moduleIds ? [] : (communityModule(row.module_id)?.maintainers ?? [])
    const details = JSON.parse(row.public_json) as PublicBugDetails
    // Only reporters who agreed to publish them get their configuration and log on GitHub.
    const log = details.full ? (await db.prepare('SELECT text FROM issue_logs WHERE issue_id=?').bind(id).first<{ text: string }>())?.text : undefined
    const context = details.full && row.context_json ? JSON.parse(row.context_json) as IssueContext : undefined
    const created = await createGithubIssue(config, { id: row.id, module_id: row.module_id, scope: row.scope, moduleIds, title: row.title, reporter: row.reporter, owners, details, context, log }, env.APP_URL)
    await db.prepare("UPDATE issues SET github_state='synced',github_number=?,github_url=?,github_error='' WHERE id=?").bind(created.number, created.url, id).run()
    return { state: 'synced' as const, url: created.url }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'GitHub mirroring failed.'
    await db.prepare("UPDATE issues SET github_state='failed',github_error=? WHERE id=?").bind(message.slice(0, 300), id).run()
    return { state: 'failed' as const, error: message }
  }
}

function hex(bytes: ArrayBuffer) { return Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('') }
function sameText(a: string, b: string) { if (a.length !== b.length) return false; let difference = 0; for (let index = 0; index < a.length; index++) difference |= a.charCodeAt(index) ^ b.charCodeAt(index); return difference === 0 }

export async function signGithubPayload(secret: string, body: ArrayBuffer) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return 'sha256=' + hex(await crypto.subtle.sign('HMAC', key, body))
}

export type WebhookPayload = { action?: unknown; issue?: { number?: unknown; state_reason?: unknown; pull_request?: unknown }; comment?: { id?: unknown; body?: unknown; user?: { id?: unknown; login?: unknown; type?: unknown } }; sender?: { id?: unknown; login?: unknown }; repository?: { full_name?: unknown } }

/**
 * GitHub "issues" and "issue_comment" webhooks. Closing or reopening a mirrored issue updates the report's
 * status; status changes and comments notify the reporter. Only signed deliveries for the configured
 * repository count, and a redelivered event never notifies twice.
 */
export async function handleGithubWebhook(request: Request, env: Env, db: Database, body: ArrayBuffer) {
  const secret = env.GITHUB_WEBHOOK_SECRET?.trim() ?? '', config = githubConfig(env)
  if (!secret || !config) throw new HttpError(503, 'GitHub webhooks are not configured.')
  if (!sameText(request.headers.get('X-Hub-Signature-256') ?? '', await signGithubPayload(secret, body))) throw new HttpError(401, 'Invalid signature.')
  const event = request.headers.get('X-GitHub-Event')
  if (event !== 'issues' && event !== 'issue_comment') return { ok: true, handled: false }
  let payload: WebhookPayload
  try { payload = JSON.parse(new TextDecoder().decode(body)) } catch { throw new HttpError(400, 'Invalid payload.') }
  const number = payload.issue?.number
  if (!Number.isSafeInteger(number) || Number(number) <= 0 || payload.issue?.pull_request || String(payload.repository?.full_name ?? '').toLowerCase() !== config.repository.toLowerCase()) return { ok: true, handled: false }
  // Most issues and comments on the repository did not start on Modwerk.
  const issue=await db.prepare('SELECT id FROM issues WHERE github_number=?').bind(number).first<{id:string}>()
  if (!issue) return { ok: true, handled: false }
  const delivery = (request.headers.get('X-GitHub-Delivery') ?? '').slice(0, 100) || crypto.randomUUID()
  if(await db.prepare('SELECT id FROM github_webhook_deliveries WHERE id=?').bind(delivery).first())return {ok:true,handled:true}
  if (event === 'issue_comment') {
    const comment = payload.comment
    // Bots (CI, release tooling) talk to developers, not reporters.
    if (payload.action !== 'created' || typeof comment?.body !== 'string' || comment.user?.type === 'Bot') return { ok: true, handled: false }
    if (/^\s*\/modwerk(?:\s|$)/.test(comment.body)) {
      const result = await handleGithubCommand(env, db, config, issue.id, Number(number), payload)
      await db.prepare('INSERT INTO github_webhook_deliveries(id,issue_id) VALUES(?,?) ON CONFLICT DO NOTHING').bind(delivery, issue.id).run()
      return { ok: true, handled: true, ...result }
    }
    // The authenticated frontend post is already attributed in the conversation. Do not
    // turn the reporter's own relayed reply into an apparent reply from the service account.
    const relayed = comment.body.includes('<!-- modwerk-reply:') && await db.prepare("SELECT actor FROM github_actions WHERE issue_id=? AND published_hash=? AND id LIKE 'reply:%'").bind(issue.id, await digest(comment.body)).first<{ actor: string }>()
    if (relayed) {
      await db.prepare('INSERT INTO github_webhook_deliveries(id,issue_id) VALUES(?,?) ON CONFLICT DO NOTHING').bind(delivery, issue.id).run()
      return { ok: true, handled: true }
    }
    const acknowledgement = /<!-- modwerk-(?:command|triage):/.test(comment.body) && await db.prepare("SELECT id FROM github_actions WHERE issue_id=? AND published_hash=? AND (id LIKE 'command:%' OR id LIKE 'triage:%')").bind(issue.id,await digest(comment.body)).first()
    if (acknowledgement) {
      await db.prepare('INSERT INTO github_webhook_deliveries(id,issue_id) VALUES(?,?) ON CONFLICT DO NOTHING').bind(delivery,issue.id).run()
      return {ok:true,handled:true}
    }
    const login = typeof comment.user?.login === 'string' && GITHUB_LOGIN.test(comment.user.login) ? comment.user.login : null
    const githubId = Number.isSafeInteger(comment.user?.id) && Number(comment.user?.id) > 0 ? String(comment.user?.id) : null
    await db.batch([publicIssueReplyStatement(db, issue.id, delivery, comment.body, null, login, githubId),db.prepare('INSERT INTO github_webhook_deliveries(id,issue_id) VALUES(?,?) ON CONFLICT DO NOTHING').bind(delivery,issue.id)])
    return { ok: true, handled: true }
  }
  const status = payload.action === 'closed' ? 'closed' : payload.action === 'reopened' ? 'open' : null
  if (!status) return { ok: true, handled: false }
  // "Completed" is how GitHub records a fix, including closing through a merged pull request.
  const actor=payload.sender?.login
  await db.batch(issueStatusStatements(db,issue.id,status,null,typeof actor==='string'&&GITHUB_LOGIN.test(actor)?actor:null,delivery,payload.issue?.state_reason==='completed'))
  return { ok: true, handled: true }
}
