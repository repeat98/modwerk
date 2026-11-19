// SPDX-License-Identifier: Elastic-2.0
// Copyright (c) 2026 Jannik Aßfalg (repeat98)
// Step 3 of a maintenance bot pass (docs/MAINTENANCE_BOT.md). Runs from main with write access and no model:
// it holds the model's proposals to the policy, files them in the Worker's ledger, carries out what is due and
// not stopped, and on the daily run sends the report to Telegram.
import { tagDiscordLinks } from '../../server/site-link-tags.ts'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { TODO_COMMAND, actionId, classify } from './policy.mjs'
import { MARKER, approveRun, discord, github, ledger, pages, readBoardTarget, readDiscordTarget, readTarget } from './lib.mjs'
import { dailyReport } from './report.mjs'

const daily = process.env.BOT_MODE === 'daily', dir = process.env.BOT_DIR ?? 'bot'
const { api } = github(), bot = ledger(), chat = discord()
const targets = new Map(), rejected = [], log = []
const target = async number => { if (!targets.has(number)) targets.set(number, await readTarget(api, number)); return targets.get(number) }
const fresh = async number => { targets.delete(number); return target(number) }

const state = await bot('/state')
if (state.paused) {
  console.log('Paused from Telegram; nothing is proposed or carried out.')
  if (daily) await bot('/report', 'POST', { text: 'Maintenance bot: paused. Nothing was done. Send /resume to start it again.' })
  process.exit(0)
}

// 1. Proposals: the model's file is untrusted input, so each one is re-read against GitHub and the policy.
let proposals = { actions: [], report: '' }
const file = join(dir, 'proposals.json')
if (existsSync(file)) {
  try { proposals = JSON.parse(readFileSync(file, 'utf8')) } catch { rejected.push('The model wrote proposals that are not valid JSON.') }
}
const labels = new Set((await pages(api, '/labels')).map(label => label.name))
// The forum and the shoutbox as the policy sees them: a thread is open while its last post is not a helper's.
let activity
async function siteTarget(kind, id) {
  activity ??= await bot('/forum')
  if (kind === 'forum_reply') {
    const thread = activity.threads.find(row => row.id === id), last = thread?.posts.at(-1)
    return { kind: 'forum', id, number: 0, author: last?.author ?? '', lastPost: last?.id, state: thread && !thread.locked && last && !last.helper ? 'open' : 'closed' }
  }
  const index = activity.shouts.findIndex(row => row.id === id), shout = activity.shouts[index]
  return { kind: 'shout', id, number: 0, author: shout?.author ?? '', state: shout && !shout.helper && !activity.shouts.slice(index + 1).some(row => row.helper) ? 'open' : 'closed' }
}
const accepted = []
for (const proposal of (Array.isArray(proposals.actions) ? proposals.actions : []).slice(0, 40)) {
  const kind = String(proposal?.kind ?? ''), board = kind.startsWith('board_'), talk = kind === 'discord_reply', site = kind === 'forum_reply' || kind === 'shout_reply', number = board || talk || site ? 0 : Number(proposal?.number)
  if (!board && !talk && !site && (!Number.isSafeInteger(number) || number < 1)) { rejected.push('A proposal named no pull request or issue.'); continue }
  if (talk && !chat) { rejected.push('A Discord reply was proposed, but the bot has no Discord token.'); continue }
  try {
    const where = site ? await siteTarget(kind, kind === 'forum_reply' ? proposal.thread : proposal.shout) : talk ? await readDiscordTarget(chat, proposal.channel, proposal.message) : board ? await readBoardTarget(kind, proposal.thread ?? proposal.claim) : await target(number)
    const decision = classify(proposal, where, labels)
    if (decision.reject) { rejected.push((site ? 'Site' : talk ? 'Discord' : board ? 'Board' : '#' + number) + ' ' + kind + ': ' + decision.reject + '.'); continue }
    accepted.push({ id: decision.id, kind: decision.payload.kind, target: number, tier: decision.tier, summary: decision.summary, reason: decision.reason, payload: decision.payload, windowHours: decision.windowHours })
  } catch (error) { rejected.push('#' + number + ': could not be read (' + error.message + ').') }
}
const { created } = accepted.length ? await bot('/actions', 'POST', { actions: accepted }) : { created: [] }
console.log(accepted.length + ' proposals accepted (' + created.length + ' new), ' + rejected.length + ' held back.')

// To-dos: work only a session at the owner's computer can do, picked up there with /modwerk-todo.
const todos = []
for (const todo of (Array.isArray(proposals.todos) ? proposals.todos : []).slice(0, 30)) {
  const number = Number(todo?.number), command = String(todo?.command ?? '').trim(), note = String(todo?.note ?? '').trim().replace(/\s+/g, ' ').slice(0, 200)
  if (!Number.isSafeInteger(number) || number < 0 || !TODO_COMMAND.test(command) || !note) { rejected.push('A to-do was not a /modwerk-* command with a number and a note.'); continue }
  todos.push({ id: actionId('todo', number, command), target: number, command, note, urgent: todo.urgent === true })
}
if (todos.length) await bot('/todos', 'POST', { todos })
// The model may drop an open to-do it saw settled (answered, superseded, moved on); only ids that are open count.
const open = new Set((await bot('/todos')).todos.map(todo => todo.id))
for (const id of (Array.isArray(proposals.drop) ? proposals.drop : []).slice(0, 30)) if (open.has(id)) await bot('/todos/' + id + '/status', 'POST', { status: 'dropped' })

// Watchers that need no model. A red run on main becomes an urgent to-do (the Worker tells the owner at once).
const latest = new Map(), today = new Date().toISOString().slice(0, 10)
// The Monday of this week: a weekly to-do keeps one id all week, so a ticked-off one can come back next week.
const week = new Date(Date.now() - ((new Date().getUTCDay() + 6) % 7) * 86400000).toISOString().slice(0, 10)
for (const run of (await api('/actions/runs?branch=main&status=completed&per_page=60')).workflow_runs ?? []) {
  if (run.path?.endsWith('/maintenance-bot.yml') || run.event === 'pull_request' || latest.has(run.workflow_id)) continue
  latest.set(run.workflow_id, run)
}
const failing = [...latest.values()].filter(run => run.conclusion === 'failure')
if (failing.length) await bot('/todos', 'POST', { todos: failing.map(run => ({ id: actionId('todo', 0, 'red main', run.workflow_id, today), target: 0, command: 'gh run view ' + run.id + ' --log-failed', note: 'main is red: ' + run.name + ' at ' + run.head_sha.slice(0, 9), urgent: true })) })

// Open to-dos whose item is settled go away: a closed issue or pull request, an ended board thread, a workflow
// that is green on main again.
for (const todo of (await bot('/todos')).todos) {
  const thread = todo.command.match(/^npm run board -- reply ([0-9a-f-]{36})$/)?.[1], run = todo.command.match(/^gh run view (\d+) --log-failed$/)?.[1]
  let settled = false
  if (thread) settled = (await readBoardTarget('board_reply', thread))?.state === 'closed'
  else if (run) { const workflow = (await api('/actions/runs/' + run).catch(() => null))?.workflow_id; settled = !!workflow && latest.get(workflow)?.conclusion === 'success' }
  else if (todo.target) settled = (await api('/issues/' + todo.target).then(issue => issue.state, () => 'open')) === 'closed'
  if (settled) await bot('/todos/' + todo.id + '/status', 'POST', { status: 'dropped' })
}

if (daily) {
  // Diagnostics members share, counted by failure: a new failure, or one more than twice its usual daily rate.
  const { failures } = await bot('/diagnostics')
  const rising = failures.filter(row => row.today >= 2 && (row.week === 0 || row.today > 2 * row.week / 7)).slice(0, 4)
  if (rising.length) await bot('/todos', 'POST', { todos: [{ id: actionId('todo', 0, '/modwerk-diagnostics', week), target: 0, command: '/modwerk-diagnostics', note: 'New or rising: ' + rising.map(row => row.key + ' (' + row.today + ')').join(', '), urgent: false }] })
  // Mondays: new commits upstream since the owner last looked (docs/MAINTENANCE.md, upstream worker).
  if (new Date().getUTCDay() === 1) await upstreamWatch()
}

async function upstreamWatch() {
  const tools = JSON.parse(readFileSync('sdk/upstream-tools.json', 'utf8')), lines = [], heads = {}
  const seen = JSON.parse((await bot('/state')).upstream || '{}')
  for (const [name, entry] of Object.entries(tools)) {
    const repo = entry?.repository?.match(/^https:\/\/github\.com\/([\w.-]+\/[\w.-]+?)(?:\.git)?$/)?.[1]
    if (!repo || entry.frozen) continue
    const response = await fetch('https://api.github.com/repos/' + repo + '/commits?per_page=1', { headers: { Accept: 'application/vnd.github+json', Authorization: 'Bearer ' + process.env.GITHUB_TOKEN }, signal: AbortSignal.timeout(30000) })
    const head = response.ok ? (await response.json())[0]?.sha : null
    if (!head) continue
    heads[name] = head
    if (!seen[name] || seen[name] === head) continue
    const compare = await fetch('https://api.github.com/repos/' + repo + '/compare/' + seen[name] + '...' + head, { headers: { Accept: 'application/vnd.github+json', Authorization: 'Bearer ' + process.env.GITHUB_TOKEN }, signal: AbortSignal.timeout(30000) })
    const ahead = compare.ok ? (await compare.json()).ahead_by : null
    lines.push(name + ' ' + (ahead ?? 'some') + ' new')
  }
  // The to-do carries the week; the next week counts from here, whether or not the owner looked yet.
  if (lines.length) await bot('/todos', 'POST', { todos: [{ id: actionId('todo', 0, '/modwerk-maintain upstream', week), target: 0, command: '/modwerk-maintain upstream', note: 'Upstream commits: ' + lines.join(', '), urgent: false }] })
  await bot('/state', 'PUT', { upstream: JSON.stringify(heads) })
}

// 2. What is due: approved by the owner, a notice, or a window that closed without a Stop.
async function carryOut(action) {
  const { payload } = action
  if (payload.kind === 'forum_reply' || payload.kind === 'shout_reply') {
    // The Worker posts only while nobody has answered; it says 409 otherwise.
    const path = payload.kind === 'forum_reply' ? '/forum/threads/' + payload.thread + '/reply' : '/forum/shouts/' + payload.shout + '/reply'
    try { await bot(path, 'POST', { body: payload.body, after: payload.after }) } catch (error) { if (error.status === 409) return ['expired', 'someone answered in the meantime']; throw error }
    return ['done', '']
  }
  if (payload.kind === 'discord_reply') {
    if (!chat) return ['failed', 'no Discord token']
    const now = await readDiscordTarget(chat, payload.channel, payload.message)
    if (!now || now.state !== 'open') return ['expired', 'someone answered in the meantime']
    // No pings of any kind: not @everyone, not roles, not the person replied to beyond Discord's reply marker.
    await chat('/channels/' + payload.channel + '/messages', 'POST', { content: tagDiscordLinks(payload.body), message_reference: { message_id: payload.message, channel_id: payload.channel, fail_if_not_exists: false }, allowed_mentions: { parse: [], replied_user: false } })
    return ['done', '']
  }
  if (payload.kind.startsWith('board_')) {
    const id = payload.thread ?? payload.claim, now = await readBoardTarget(payload.kind, id)
    if (!now || now.state !== 'open') return ['expired', 'it ended in the meantime']
    if (payload.pin?.replies !== undefined && now.replies !== payload.pin.replies) return ['expired', 'someone replied in the meantime']
    const verb = { board_reply: 'reply', board_close: 'close', board_release: 'release' }[payload.kind]
    await bot('/board/' + (payload.claim ? 'claims/' : 'messages/') + id + '/' + verb, 'POST', { body: payload.body ?? '', as: payload.as })
    return ['done', '']
  }
  const now = await fresh(payload.number)
  if (now.state !== 'open') return ['expired', 'it was closed in the meantime']
  if ((payload.pin?.head ?? '') !== now.head) return ['expired', 'new commits arrived']
  if (payload.kind !== 'merge' && payload.kind !== 'label' && payload.kind !== 'approve_run' && payload.pin?.comments !== now.comments) return ['expired', 'someone replied in the meantime']
  const n = payload.number
  switch (payload.kind) {
    case 'label':
      if (payload.add.length) await api('/issues/' + n + '/labels', 'POST', { labels: payload.add })
      for (const name of payload.remove) await api('/issues/' + n + '/labels/' + encodeURIComponent(name), 'DELETE').catch(() => undefined)
      return ['done', '']
    case 'comment':
      await api('/issues/' + n + '/comments', 'POST', { body: payload.body + '\n\n' + MARKER })
      return ['done', '']
    case 'review':
      await api('/pulls/' + n + '/reviews', 'POST', { commit_id: now.head, event: payload.event, body: payload.body + '\n\n' + MARKER })
      return ['done', '']
    case 'merge': {
      if (now.draft || !now.checksGreen) return ['expired', now.draft ? 'it became a draft' : 'its checks are no longer green']
      // The Worker merges with the owner's token, at exactly the commit that was checked, so the merge counts as
      // the owner's for the site's release gate and starts the usual push workflows.
      let result
      try { result = await bot('/merge', 'POST', { number: n, sha: payload.head, method: payload.method }) } catch (error) { return ['failed', error.message.slice(0, 200)] }
      return ['done', 'merged ' + String(result.sha).slice(0, 9)]
    }
    case 'approve_run': {
      const runs = (await api('/actions/runs?status=action_required&head_sha=' + now.head + '&per_page=30')).workflow_runs ?? []
      if (!runs.length) return ['expired', 'no run waits any more']
      for (const run of runs) await approveRun(api, run.id)
      return ['done', runs.length + ' run' + (runs.length === 1 ? '' : 's') + ' started']
    }
    case 'close':
      if (payload.body) await api('/issues/' + n + '/comments', 'POST', { body: payload.body + '\n\n' + MARKER })
      await api('/issues/' + n, 'PATCH', payload.isPull ? { state: 'closed' } : { state: 'closed', state_reason: payload.stateReason })
      return ['done', '']
  }
  return ['failed', 'unknown kind']
}
const { actions: due } = await bot('/actions/due')
for (const action of due) {
  try { await bot('/actions/' + action.id + '/claim', 'POST') } catch (error) { if (error.status === 409) continue; throw error }
  let outcome
  try { outcome = await carryOut(action) } catch (error) { outcome = ['failed', error.message.slice(0, 300)] }
  await bot('/actions/' + action.id + '/result', 'POST', { status: outcome[0], result: outcome[1] })
  log.push(outcome[0] + ': ' + action.summary + (outcome[1] ? ' (' + outcome[1] + ')' : ''))
}
// This log is public: counts only, since a summary can name a tester. The details are in Telegram and the ledger.
const tally = status => log.filter(line => line.startsWith(status + ':')).length
console.log(log.length ? log.length + ' carried out: ' + tally('done') + ' done, ' + tally('failed') + ' failed, ' + tally('expired') + ' dropped.' : 'Nothing was due.')
if (rejected.length) console.log(rejected.length + ' held back by the policy.')

// 3. The fingerprint moves only after the model's proposals were filed, so a failed run is retried next pass.
if (process.env.BOT_FINGERPRINT && existsSync(file)) await bot('/state', 'PUT', { fingerprint: process.env.BOT_FINGERPRINT })

// 4. The daily report: a few lines; each action already has its own message with buttons.
if (daily) {
  const { actions } = await bot('/actions/recent?hours=24')
  const broken = !existsSync(file) || rejected.some(reason => reason.startsWith('The model wrote'))
  await bot('/report', 'POST', { text: dailyReport(actions, (await bot('/todos')).todos) + (broken ? '\n⚠️ The review itself failed today; see the Actions log.' : '') })
}
