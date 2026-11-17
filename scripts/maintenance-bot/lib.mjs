// SPDX-License-Identifier: Elastic-2.0
// Copyright (c) 2026 Jannik Aßfalg (repeat98)
// Shared by the maintenance bot's snapshot and executor (docs/MAINTENANCE_BOT.md).
import { githubApi, pages } from '../author-release-api.mjs'

export { pages }
export const MARKER = '<!-- modwerk-maintenance-bot -->'

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
/** Green means at least one check ran on this commit and every one finished without failing. */
export async function checkSummary(api, sha) {
  const runs = (await api('/commits/' + sha + '/check-runs?per_page=100')).check_runs ?? []
  if (!runs.length) return 'none'
  if (runs.some(run => run.status !== 'completed')) return 'pending'
  return runs.every(run => GREEN.has(run.conclusion)) ? 'green' : 'red'
}

/** The live state the policy decides against. */
export async function readTarget(api, number) {
  const issue = await api('/issues/' + number)
  const target = { number, isPull: !!issue.pull_request, author: issue.user?.login ?? '', state: issue.state, comments: issue.comments, draft: false, head: '', files: [], firstTime: false, checksGreen: false }
  if (!target.isPull) return target
  const pull = await api('/pulls/' + number)
  const files = await pages(api, '/pulls/' + number + '/files')
  return { ...target, draft: !!pull.draft, head: pull.head.sha, files: files.flatMap(file => [file.filename, file.previous_filename].filter(Boolean)), firstTime: ['FIRST_TIMER', 'FIRST_TIME_CONTRIBUTOR', 'NONE'].includes(pull.author_association), checksGreen: (await checkSummary(api, pull.head.sha)) === 'green' }
}
