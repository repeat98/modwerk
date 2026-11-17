// SPDX-License-Identifier: Elastic-2.0
// Copyright (c) 2026 Jannik Aßfalg (repeat98)
// Step 1 of a maintenance bot pass (docs/MAINTENANCE_BOT.md): list what is open, and start the model only when
// something changed since its last run, or for the daily report. Writes the model's context to BOT_DIR.
import { createHash } from 'node:crypto'
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { checkSummary, github, ledger, pages } from './lib.mjs'

const daily = process.env.BOT_MODE === 'daily', dir = process.env.BOT_DIR ?? 'bot'
const { api } = github(), bot = ledger()

const items = await pages(api, '/issues?state=open&sort=updated&direction=desc')
const pulls = await pages(api, '/pulls?state=open&sort=updated&direction=desc')
const prs = []
for (const pull of pulls) {
  prs.push({
    number: pull.number, title: pull.title, author: pull.user?.login, association: pull.author_association, draft: pull.draft,
    head: pull.head.sha, labels: pull.labels.map(label => label.name), updated: pull.updated_at, checks: await checkSummary(api, pull.head.sha),
  })
}
const issues = items.filter(item => !item.pull_request).map(item => ({
  number: item.number, title: item.title, author: item.user?.login, labels: item.labels.map(label => label.name), comments: item.comments, updated: item.updated_at,
}))
const commentCounts = new Map(items.map(item => [item.number, item.comments]))
for (const pr of prs) pr.comments = commentCounts.get(pr.number) ?? 0

const fingerprint = createHash('sha256').update(JSON.stringify({ prs: prs.map(({ number, head, draft, checks, comments, labels }) => [number, head, draft, checks, comments, labels]), issues: issues.map(({ number, comments, labels }) => [number, comments, labels]) })).digest('hex')
const state = await bot('/state')
const recent = await bot('/actions/recent?hours=' + 24 * 14)
const run = !state.paused && (daily || fingerprint !== state.fingerprint)

mkdirSync(dir, { recursive: true })
writeFileSync(join(dir, 'context.json'), JSON.stringify({ mode: daily ? 'daily' : 'pass', now: new Date().toISOString(), prs, issues, ledger: recent.actions.map(({ payload, ...action }) => ({ ...action, body: payload?.body?.slice(0, 400) })) }, null, 1))
const output = process.env.GITHUB_OUTPUT
if (output) appendFileSync(output, 'run=' + run + '\nfingerprint=' + fingerprint + '\n')
console.log((state.paused ? 'Paused. ' : '') + prs.length + ' open pull requests, ' + issues.length + ' open issues; ' + (run ? 'the model runs.' : 'nothing changed, the model is skipped.'))
