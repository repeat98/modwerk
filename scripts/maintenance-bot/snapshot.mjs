// SPDX-License-Identifier: Elastic-2.0
// Copyright (c) 2026 Jannik Aßfalg (repeat98)
// Step 1 of a maintenance bot pass (docs/MAINTENANCE_BOT.md): list what is open, and start the model only when
// something changed since its last run, or for the daily report. Writes the model's context to BOT_DIR.
import { createHash } from 'node:crypto'
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { boardGet, checkSummary, discord, github, ledger, pages } from './lib.mjs'

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

// The agent board's live threads and active claims, public like the pull requests (docs/AGENT_BOARD.md).
const threads = ((await boardGet('/messages'))?.messages ?? []).map(({ id, kind, topic, author, to, body, pullRequest, activeAt, endsAt, replies }) => ({
  id, kind, topic: topic.kind + ' ' + topic.key, author, to, body: body.slice(0, 600), pullRequest, activeAt, endsAt, replies: replies.map(reply => ({ author: reply.author, body: reply.body.slice(0, 400), at: reply.createdAt })),
}))
const claims = ((await boardGet('/claims'))?.claims ?? []).map(({ id, kind, key, holder, branch, pullRequest, createdAt, expiresAt }) => ({ id, kind, key, holder, branch, pullRequest, createdAt, expiresAt }))
// Main's health: the latest finished run of each workflow on main, so a red one becomes an urgent to-do.
const mainRuns = new Map()
for (const run of (await api('/actions/runs?branch=main&status=completed&per_page=60')).workflow_runs ?? []) {
  if (run.path?.endsWith('/maintenance-bot.yml') || run.event === 'pull_request' || mainRuns.has(run.workflow_id)) continue
  mainRuns.set(run.workflow_id, { workflow: run.name, run: run.id, sha: run.head_sha, conclusion: run.conclusion })
}
const red = [...mainRuns.values()].filter(run => run.conclusion === 'failure')

// TARS's view of the Modwerk Discord: every text channel and active thread it can see, minus DISCORD_IGNORE_CHANNELS.
// The cheap part (each channel's latest message id) runs every pass; messages are read only when the model runs.
const chat = discord(), guild = process.env.DISCORD_GUILD_ID ?? '', ignore = new Set((process.env.DISCORD_IGNORE_CHANNELS ?? '').split(/[\s,]+/).filter(Boolean))
let rooms = []
if (chat && /^\d{17,20}$/.test(guild)) {
  const channels = (await chat('/guilds/' + guild + '/channels')) ?? [], threads = (await chat('/guilds/' + guild + '/threads/active'))?.threads ?? []
  const names = new Map(channels.map(channel => [channel.id, channel.name]))
  rooms = [
    ...channels.filter(channel => channel.type === 0 || channel.type === 5).map(channel => ({ id: channel.id, name: channel.name, last: channel.last_message_id ?? '' })),
    ...threads.filter(thread => !ignore.has(thread.parent_id)).map(thread => ({ id: thread.id, name: (names.get(thread.parent_id) ?? 'thread') + ' / ' + thread.name, last: thread.last_message_id ?? '' })),
  ].filter(room => !ignore.has(room.id) && room.last)
}

const fingerprint = createHash('sha256').update(JSON.stringify({
  red: red.map(run => run.run), rooms: rooms.map(room => [room.id, room.last]),
  prs: prs.map(({ number, head, draft, checks, comments, labels }) => [number, head, draft, checks, comments, labels]), issues: issues.map(({ number, comments, labels }) => [number, comments, labels]),
  threads: threads.map(({ id, replies }) => [id, replies.length]), claims: claims.map(({ id, pullRequest }) => [id, pullRequest]),
})).digest('hex')
const state = await bot('/state')
const recent = await bot('/actions/recent?hours=' + 24 * 14)
const run = !state.paused && (daily || fingerprint !== state.fingerprint)

// Messages from the last three days, oldest first, in rooms that are not quiet; read only for the model.
const conversations = []
if (run && chat) {
  const since = Date.now() - 3 * 86400000
  for (const room of rooms.filter(room => Number((BigInt(room.last) >> 22n) + 1420070400000n) >= since)) {
    const messages = ((await chat('/channels/' + room.id + '/messages?limit=50')) ?? []).filter(message => Date.parse(message.timestamp) >= since && (message.content || message.attachments?.length)).reverse()
    if (messages.length) conversations.push({ channel: room.id, name: room.name, messages: messages.map(message => ({ id: message.id, author: message.author?.username, bot: !!message.author?.bot, at: message.timestamp, replyTo: message.message_reference?.message_id, text: message.content.slice(0, 600) + (message.attachments?.length ? ' [' + message.attachments.length + ' attachment(s)]' : '') })) })
  }
}

mkdirSync(dir, { recursive: true })
writeFileSync(join(dir, 'context.json'), JSON.stringify({ mode: daily ? 'daily' : 'pass', now: new Date().toISOString(), prs, issues, board: { threads, claims }, discord: conversations, mainRed: red, ledger: recent.actions.map(({ payload, ...action }) => ({ ...action, body: payload?.body?.slice(0, 400), thread: payload?.thread, claim: payload?.claim, message: payload?.message })) }, null, 1))
const output = process.env.GITHUB_OUTPUT
if (output) appendFileSync(output, 'run=' + run + '\nfingerprint=' + fingerprint + '\n')
console.log((state.paused ? 'Paused. ' : '') + prs.length + ' open pull requests, ' + issues.length + ' open issues, ' + threads.length + ' board threads, ' + claims.length + ' claims, ' + rooms.length + ' Discord rooms' + (red.length ? ', main red in ' + red.length + ' workflow(s)' : '') + '; ' + (run ? 'the model runs.' : 'nothing changed, the model is skipped.'))
