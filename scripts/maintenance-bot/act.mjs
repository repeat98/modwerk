// SPDX-License-Identifier: Elastic-2.0
// Copyright (c) 2026 Jannik Aßfalg (repeat98)
// Step 3 of a maintenance bot pass (docs/MAINTENANCE_BOT.md). Runs from main with write access and no model:
// it holds the model's proposals to the policy, files them in the Worker's ledger, carries out what is due and
// not stopped, and on the daily run sends the report to Telegram.
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { classify } from './policy.mjs'
import { MARKER, github, ledger, pages, readTarget } from './lib.mjs'

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
  const number = Number(proposal?.number)
  if (!Number.isSafeInteger(number) || number < 1) { rejected.push('A proposal named no pull request or issue.'); continue }
  try {
    const decision = classify(proposal, await target(number), labels)
    if (decision.reject) { rejected.push('#' + number + ' ' + proposal.kind + ': ' + decision.reject + '.'); continue }
    accepted.push({ id: decision.id, kind: decision.payload.kind, target: number, tier: decision.tier, summary: decision.summary, reason: decision.reason, payload: decision.payload, windowHours: decision.windowHours })
  } catch (error) { rejected.push('#' + number + ': could not be read (' + error.message + ').') }
}
const { created } = accepted.length ? await bot('/actions', 'POST', { actions: accepted }) : { created: [] }
console.log(accepted.length + ' proposals accepted (' + created.length + ' new), ' + rejected.length + ' held back.')

// 2. What is due: approved by the owner, a notice, or a window that closed without a Stop.
async function carryOut(action) {
  const { payload } = action, now = await fresh(payload.number)
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

// 4. The daily report: the model's briefing first, then the ledger's last 24 hours.
if (daily) {
  const { actions } = await bot('/actions/recent?hours=24')
  const line = action => '• ' + action.summary + (action.result ? ' (' + action.result + ')' : '')
  const group = (title, rows) => rows.length ? [title, ...rows.map(line)].join('\n') : ''
  const until = action => new Date(action.due_at * 1000).toISOString().slice(11, 16) + ' UTC'
  const text = [
    'Modwerk maintenance, ' + new Date().toISOString().slice(0, 10),
    String(proposals.report ?? '').trim() || 'The model wrote no briefing today.',
    group('Needs your OK (tap Approve or Stop on its message):', actions.filter(a => a.status === 'pending' && a.tier === 'ask')),
    group('Will happen unless you stop it:', actions.filter(a => a.status === 'pending' && a.tier === 'window').map(a => ({ ...a, summary: a.summary + ' at ' + until(a) }))),
    group('Done in the last 24 hours:', actions.filter(a => a.status === 'done')),
    group('Failed (look at these):', actions.filter(a => a.status === 'failed')),
    group('Stuck mid-run, outcome unknown (check GitHub):', actions.filter(a => a.status === 'running' && Date.now() / 1000 - a.updated_at > 3600)),
    group('Stopped by you:', actions.filter(a => a.status === 'vetoed')),
    group('Dropped because things changed:', actions.filter(a => a.status === 'expired')),
    rejected.length ? 'Held back by the policy today:\n' + rejected.map(reason => '• ' + reason).join('\n') : '',
    'Commands: /status, /pause, /resume.',
  ].filter(Boolean).join('\n\n')
  await bot('/report', 'POST', { text: text.slice(0, 30000) })
}
