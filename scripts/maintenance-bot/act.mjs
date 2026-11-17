// SPDX-License-Identifier: Elastic-2.0
// Copyright (c) 2026 Jannik Aßfalg (repeat98)
// Step 3 of a maintenance bot pass (docs/MAINTENANCE_BOT.md). Runs from main with write access and no model:
// it holds the model's proposals to the policy, files them in the Worker's ledger, carries out what is due and
// not stopped, and on the daily run sends the report to Telegram.
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { TODO_COMMAND, actionId, classify } from './policy.mjs'
import { MARKER, github, ledger, pages, readBoardTarget, readTarget } from './lib.mjs'
import { dailyReport } from './report.mjs'

const daily = process.env.BOT_MODE === 'daily', dir = process.env.BOT_DIR ?? 'bot'
const { api } = github(), bot = ledger()
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
const accepted = []
for (const proposal of (Array.isArray(proposals.actions) ? proposals.actions : []).slice(0, 40)) {
  const board = String(proposal?.kind ?? '').startsWith('board_'), number = board ? 0 : Number(proposal?.number)
  if (!board && (!Number.isSafeInteger(number) || number < 1)) { rejected.push('A proposal named no pull request or issue.'); continue }
  try {
    const decision = classify(proposal, board ? await readBoardTarget(proposal.kind, proposal.thread ?? proposal.claim) : await target(number), labels)
    if (decision.reject) { rejected.push((board ? 'Board' : '#' + number) + ' ' + proposal.kind + ': ' + decision.reject + '.'); continue }
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

// 2. What is due: approved by the owner, a notice, or a window that closed without a Stop.
async function carryOut(action) {
  const { payload } = action
  if (payload.kind.startsWith('board_')) {
    const id = payload.thread ?? payload.claim, now = await readBoardTarget(payload.kind, id)
    if (!now || now.state !== 'open') return ['expired', 'it ended in the meantime']
    if (payload.pin?.replies !== undefined && now.replies !== payload.pin.replies) return ['expired', 'someone replied in the meantime']
    const verb = { board_reply: 'reply', board_close: 'close', board_release: 'release' }[payload.kind]
    await bot('/board/' + (payload.claim ? 'claims/' : 'messages/') + id + '/' + verb, 'POST', { body: payload.body ?? '' })
    return ['done', '']
  }
  const now = await fresh(payload.number)
  if (now.state !== 'open') return ['expired', 'it was closed in the meantime']
  if ((payload.pin?.head ?? '') !== now.head) return ['expired', 'new commits arrived']
  if (payload.kind !== 'merge' && payload.kind !== 'label' && payload.pin?.comments !== now.comments) return ['expired', 'someone replied in the meantime']
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
      const result = await api('/pulls/' + n + '/merge', 'PUT', { sha: payload.head, merge_method: payload.method })
      if (!result?.merged) return ['failed', 'GitHub refused the merge']
      return ['done', 'merged ' + result.sha.slice(0, 9)]
    }
    case 'close':
      if (payload.body) await api('/issues/' + n + '/comments', 'POST', { body: payload.body + '\n\n' + MARKER })
      await api('/issues/' + n, 'PATCH', payload.isPull ? { state: 'closed' } : { state: 'closed', state_reason: payload.stateReason })
      return ['done', '']
  }
  return ['failed', 'unknown kind']
}
const { actions: due } = await bot('/actions/due')
let merged = false
for (const action of due) {
  try { await bot('/actions/' + action.id + '/claim', 'POST') } catch (error) { if (error.status === 409) continue; throw error }
  let outcome
  try { outcome = await carryOut(action) } catch (error) { outcome = ['failed', error.message.slice(0, 300)] }
  await bot('/actions/' + action.id + '/result', 'POST', { status: outcome[0], result: outcome[1] })
  if (action.kind === 'merge' && outcome[0] === 'done') merged = true
  log.push(outcome[0] + ': ' + action.summary + (outcome[1] ? ' (' + outcome[1] + ')' : ''))
}
// Merges made with the job's token start no push workflows; publish the way module author updates do.
if (merged) for (const workflow of ['pages.yml', 'worker.yml']) await api('/actions/workflows/' + workflow + '/dispatches', 'POST', { ref: 'main' })
console.log(log.length ? log.join('\n') : 'Nothing was due.')
if (rejected.length) console.log('Held back:\n' + rejected.join('\n'))

// 3. The fingerprint moves only after the model's proposals were filed, so a failed run is retried next pass.
if (process.env.BOT_FINGERPRINT && existsSync(file)) await bot('/state', 'PUT', { fingerprint: process.env.BOT_FINGERPRINT })

// 4. The daily report: a few lines; each action already has its own message with buttons.
if (daily) {
  const { actions } = await bot('/actions/recent?hours=24')
  // A to-do whose pull request or issue was closed is done with, whoever closed it.
  const open = []
  for (const todo of (await bot('/todos')).todos) {
    const thread = todo.command.match(/^npm run board -- reply ([0-9a-f-]{36})$/)?.[1]
    const state = thread ? (await readBoardTarget('board_reply', thread))?.state : await api('/issues/' + todo.target).then(issue => issue.state, () => 'open')
    if (state === 'closed') await bot('/todos/' + todo.id + '/status', 'POST', { status: 'dropped' }); else open.push(todo)
  }
  const broken = !existsSync(file) || rejected.some(reason => reason.startsWith('The model wrote'))
  await bot('/report', 'POST', { text: dailyReport(actions, open) + (broken ? '\n⚠️ The review itself failed today; see the Actions log.' : '') })
}
