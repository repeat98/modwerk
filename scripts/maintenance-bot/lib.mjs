// SPDX-License-Identifier: Elastic-2.0
// Copyright (c) 2026 Jannik Aßfalg (repeat98)
// Shared by the maintenance bot's snapshot and executor (docs/MAINTENANCE_BOT.md).
import { githubApi, pages } from '../author-release-api.mjs'

export { pages }
export const MARKER = '<!-- modwerk-maintenance-bot -->'

export const approveRun = (api, id) => api('/actions/runs/' + id + '/approve', 'POST')

export function github() {
  const repository = process.env.GITHUB_REPOSITORY, token = process.env.GITHUB_TOKEN
  if (!repository || !token) throw new Error('GITHUB_REPOSITORY and GITHUB_TOKEN are required.')
  return { api: githubApi(repository, token), repository }
}

/** The Worker's ledger. COMMUNITY_API_URL is the API base ending in /api, MAINTENANCE_BOT_KEY the bearer key. */
export function ledger() {
  const base = process.env.COMMUNITY_API_URL?.replace(/\/+$/, ''), key = process.env.MAINTENANCE_BOT_KEY
  if (!base || !/^https:\/\/.+\/api$/.test(base) || !key) throw new Error('COMMUNITY_API_URL (https, ending in /api) and MAINTENANCE_BOT_KEY are required.')
  return async (path, method = 'GET', body) => {
    const response = await fetch(base + '/maintenance-bot' + path, {
      method, headers: { Authorization: 'Bearer ' + key, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}), redirect: 'error', signal: AbortSignal.timeout(30000),
    })
    const data = await response.json().catch(() => null)
    if (!response.ok) { const error = new Error('Maintenance bot ledger: ' + method + ' ' + path + ' HTTP ' + response.status + (data?.error ? ' ' + data.error : '')); error.status = response.status; throw error }
    return data
  }
}

const GREEN = new Set(['success', 'neutral', 'skipped'])
let required
/** The checks main's rules require before a merge. GitHub refuses a merge while one has not reported ("is expected"). */
export const requiredChecks = api => required ??= api('/rules/branches/main').then(rules => rules.flatMap(rule => rule.type === 'required_status_checks' ? rule.parameters.required_status_checks.map(check => check.context) : []), () => [])
/**
 * Green means every check on this commit finished without failing, and every required one has reported. When a
 * required one has not, the commit is `incomplete`: its checks are about to start, wait for a maintainer, or
 * cannot run because the pull request conflicts.
 */
export async function checkSummary(api, sha) {
  const runs = (await api('/commits/' + sha + '/check-runs?per_page=100')).check_runs ?? []
  if (!runs.length) return 'none'
  if (runs.some(run => run.status !== 'completed')) return 'pending'
  if (!runs.every(run => GREEN.has(run.conclusion))) return 'red'
  return (await requiredChecks(api)).every(name => runs.some(run => run.name === name)) ? 'green' : 'incomplete'
}

/** The live state the policy decides against. */
export async function readTarget(api, number) {
  const issue = await api('/issues/' + number)
  const target = { number, isPull: !!issue.pull_request, author: issue.user?.login ?? '', state: issue.state, comments: issue.comments, draft: false, head: '', files: [], firstTime: false, checksGreen: false }
  if (!target.isPull) return target
  const pull = await api('/pulls/' + number)
  const files = await pages(api, '/pulls/' + number + '/files')
  const waitingRuns = ((await api('/actions/runs?status=action_required&head_sha=' + pull.head.sha + '&per_page=30')).workflow_runs ?? []).length
  const checks = await checkSummary(api, pull.head.sha)
  return { ...target, waitingRuns, draft: !!pull.draft, head: pull.head.sha, baseRef: pull.base.ref, headRef: pull.head.ref, files: files.flatMap(file => [file.filename, file.previous_filename].filter(Boolean)), firstTime: ['FIRST_TIMER', 'FIRST_TIME_CONTRIBUTOR', 'NONE'].includes(pull.author_association), checks, checksGreen: checks === 'green' }
}

/** The agent board's public reads (threads and claims need no sign-in). */
export async function boardGet(path) {
  const base = process.env.COMMUNITY_API_URL?.replace(/\/+$/, '')
  const response = await fetch(base + '/agent-board' + path, { headers: { Accept: 'application/json' }, redirect: 'error', signal: AbortSignal.timeout(30000) })
  if (response.status === 404) return null
  if (!response.ok) throw new Error('Agent board: GET ' + path + ' HTTP ' + response.status)
  return await response.json()
}

/** A board thread or claim as the policy sees it; a missing or ended one is closed. */
export async function readBoardTarget(kind, id) {
  if (!/^[0-9a-f-]{36}$/.test(String(id))) return null
  if (kind === 'board_release') {
    const claim = (await boardGet('/claims'))?.claims?.find(row => row.id === id)
    return { kind: 'claim', id, number: 0, holder: claim?.holder ?? '', state: claim ? 'open' : 'closed' }
  }
  const thread = (await boardGet('/messages/' + id))?.message
  return { kind: 'thread', id, number: 0, author: thread?.author ?? '', to: thread?.to ?? '', replies: thread?.replies?.length ?? 0, state: thread && !thread.endedAt ? 'open' : 'closed' }
}

/** Discord's REST API as TARS (docs/DISCORD_BOT.md). Null when the bot has no Discord token. */
export function discord() {
  const token = process.env.DISCORD_BOT_TOKEN
  if (!token) return null
  return async (path, method = 'GET', body) => {
    const response = await fetch('https://discord.com/api/v10' + path, {
      method, headers: { Authorization: 'Bot ' + token, 'User-Agent': 'DiscordBot (https://modwerk.app, 1)', ...(body ? { 'Content-Type': 'application/json' } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}), redirect: 'error', signal: AbortSignal.timeout(30000),
    })
    if (response.status === 404) return null
    if (!response.ok) throw new Error('Discord ' + method + ' ' + path.split('?')[0] + ' HTTP ' + response.status)
    return response.status === 204 ? null : await response.json()
  }
}

/**
 * A Discord message as the policy sees it. It is open while nobody has answered it: no later message from TARS or
 * the owner in the channel, and no reply to it from anyone.
 */
export async function readDiscordTarget(send, channel, message) {
  if (!/^\d{17,20}$/.test(String(channel)) || !/^\d{17,20}$/.test(String(message))) return null
  const [original, me, later] = await Promise.all([send('/channels/' + channel + '/messages/' + message), send('/users/@me'), send('/channels/' + channel + '/messages?after=' + message + '&limit=100')])
  if (!original) return { kind: 'discord', number: 0, state: 'closed' }
  const owner = process.env.DISCORD_OWNER_ID ?? ''
  const answered = (later ?? []).some(next => next.author?.id === me?.id || (owner && next.author?.id === owner) || next.message_reference?.message_id === message)
  return { kind: 'discord', number: 0, channel, id: message, author: original.author?.username ?? '', bot: !!original.author?.bot, after: (later ?? []).length, state: answered || original.author?.id === me?.id ? 'closed' : 'open' }
}
