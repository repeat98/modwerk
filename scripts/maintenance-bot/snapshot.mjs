// SPDX-License-Identifier: Elastic-2.0
// Copyright (c) 2026 Jannik Aßfalg (repeat98)
// Step 1 of a maintenance bot pass (docs/MAINTENANCE_BOT.md): list what is open, find what changed since the last
// successful pass, and write each lane's work and context to BOT_DIR (lanes.mjs). A lane with no work gets no
// file, and the workflow starts no model for it.
import { createHash } from 'node:crypto'
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { plan } from './lanes.mjs'
import { boardGet, checkSummary, discord, github, ledger, pages } from './lib.mjs'

const daily = process.env.BOT_MODE === 'daily', dir = process.env.BOT_DIR ?? 'bot'
const { api } = github(), bot = ledger()
// A source that is down takes only itself out of the pass. A refused Discord sign-in once stopped every review
// of pull requests and issues for two days.
const down = []
const soft = async (name, read, fallback) => {
  try { return await read() } catch (error) { down.push(name); console.log(name + ' could not be read (' + String(error.message).replace(/\d{6,}/g, '…') + '); the pass goes on without it.'); return fallback }
}

const items = await pages(api, '/issues?state=open&sort=updated&direction=desc')
const pulls = await pages(api, '/pulls?state=open&sort=updated&direction=desc')
const prs = []
for (const pull of pulls) {
  prs.push({
    number: pull.number, title: pull.title, author: pull.user?.login, association: pull.author_association, draft: pull.draft,
    head: pull.head.sha, labels: pull.labels.map(label => label.name), updated: pull.updated_at, checks: await checkSummary(api, pull.head.sha),
    // A first-time contributor's checks that wait for a maintainer to start them; the executor starts them.
    waitingRuns: ((await api('/actions/runs?status=action_required&head_sha=' + pull.head.sha + '&per_page=30')).workflow_runs ?? []).length,
  })
}
const issues = items.filter(item => !item.pull_request).map(item => ({
  number: item.number, title: item.title, author: item.user?.login, labels: item.labels.map(label => label.name), comments: item.comments, updated: item.updated_at,
}))
const commentCounts = new Map(items.map(item => [item.number, item.comments]))
for (const pr of prs) pr.comments = commentCounts.get(pr.number) ?? 0

// The agent board's live threads and active claims, public like the pull requests (docs/AGENT_BOARD.md).
const threads = ((await soft('The agent board', () => boardGet('/messages'), null))?.messages ?? []).map(({ id, kind, topic, author, to, body, pullRequest, activeAt, endsAt, replies }) => ({
  id, kind, topic: topic.kind + ' ' + topic.key, author, to, body: body.slice(0, 600), pullRequest, activeAt, endsAt, replies: replies.map(reply => ({ author: reply.author, body: reply.body.slice(0, 400), at: reply.createdAt })),
}))
const claims = ((await soft('The agent board', () => boardGet('/claims'), null))?.claims ?? []).map(({ id, kind, key, holder, branch, pullRequest, createdAt, expiresAt }) => ({ id, kind, key, holder, branch, pullRequest, createdAt, expiresAt }))

// TARS's view of the Modwerk Discord: every text channel and active thread it can see, minus DISCORD_IGNORE_CHANNELS.
// The cheap part (each channel's latest message id) runs every pass; messages are read only for rooms that changed.
const chat = discord(), guild = process.env.DISCORD_GUILD_ID ?? '', ignore = new Set((process.env.DISCORD_IGNORE_CHANNELS ?? '').split(/[\s,]+/).filter(Boolean))
const rooms = chat && /^\d{17,20}$/.test(guild) ? await soft('Discord', async () => {
  const channels = (await chat('/guilds/' + guild + '/channels')) ?? [], active = (await chat('/guilds/' + guild + '/threads/active'))?.threads ?? []
  const names = new Map(channels.map(channel => [channel.id, channel.name]))
  return [
    ...channels.filter(channel => channel.type === 0 || channel.type === 5).map(channel => ({ id: channel.id, name: channel.name, last: channel.last_message_id ?? '' })),
    ...active.filter(thread => !ignore.has(thread.parent_id)).map(thread => ({ id: thread.id, name: (names.get(thread.parent_id) ?? 'thread') + ' / ' + thread.name, last: thread.last_message_id ?? '' })),
  ].filter(room => !ignore.has(room.id) && room.last)
}, []) : []

// The site's forum and shoutbox, the last three days (TARS answers there too).
const site = await soft('The forum', () => bot('/forum'), { threads: [], shouts: [] })
const state = await bot('/state')
let seen = {}
try { seen = JSON.parse(state.items || '{}') } catch { /* an unreadable map means a first pass */ }
const first = !Object.keys(seen).length
const work = plan({ prs, issues, threads, rooms, forum: site.threads, shouts: site.shouts, seen, daily })
// A source that is down keeps its old signatures, so its items are still new when it is back.
if (down.length) for (const [key, value] of Object.entries(seen)) if (!(key in work.items) && /^[bdfs]/.test(key)) work.items[key] = value
// The first pass after this router ships has nothing to compare with. It records what is open and reviews
// nothing, so the switch does not send every open pull request to the stronger model at once.
if (first && !daily) {
  await bot('/state', 'PUT', { items: JSON.stringify(work.items) }).catch(error => console.log('The first map could not be saved yet (' + error.message + ').'))
  work.hard = []; work.light = null
}
const run = !state.paused && (work.hard.length > 0 || !!work.light)
const fingerprint = createHash('sha256').update(JSON.stringify(work.items)).digest('hex')

mkdirSync(dir, { recursive: true })
if (run) {
  const recent = await bot('/actions/recent?hours=' + 24 * 14), todos = (await bot('/todos')).todos.map(({ id, target, command, note, urgent }) => ({ id, target, command, note, urgent }))
  const brief = list => list.map(({ number, title, author, draft, labels }) => ({ number, title, author, draft, labels }))
  // A lane sees the ledger for its own work, and every answer the owner stopped or approved: the precedents.
  const ledgerFor = (numbers, ids) => recent.actions.filter(({ target, payload, status, tier, decided_at }) => numbers.has(target) || [payload?.thread, payload?.claim, payload?.channel, payload?.shout].some(id => ids.has(id)) || status === 'vetoed' || (tier === 'ask' && decided_at))
    .map(({ payload, ...action }) => ({ ...action, body: payload?.body?.slice(0, 400), thread: payload?.thread, claim: payload?.claim, message: payload?.message, shout: payload?.shout }))
  // What the owner's replies taught the bot (docs/MAINTENANCE_BOT.md, "How it improves"): standing rules for both lanes.
  const { lessons } = await bot('/lessons').catch(() => ({ lessons: [] }))
  const base = { mode: daily ? 'daily' : 'pass', now: new Date().toISOString(), down, lessons }
  if (work.hard.length) {
    const mine = new Set(work.hard)
    writeFileSync(join(dir, 'hard.json'), JSON.stringify({ ...base, lane: 'hard', work: { pullRequests: work.hard },
      prs: prs.map(pr => mine.has(pr.number) ? pr : brief([pr])[0]), issues: brief(issues),
      board: { threads: threads.filter(thread => mine.has(thread.pullRequest)), claims },
      todos: todos.filter(todo => mine.has(todo.target)), ledger: ledgerFor(mine, new Set()) }, null, 1))
  }
  if (work.light) {
    const { light } = work, since = Date.now() - 3 * 86400000, wanted = new Set(light.discord)
    // Messages from the last three days, oldest first, in the rooms that changed.
    const conversations = []
    for (const room of rooms.filter(room => wanted.has(room.id) && Number((BigInt(room.last) >> 22n) + 1420070400000n) >= since)) {
      const messages = ((await soft('Discord', () => chat('/channels/' + room.id + '/messages?limit=50'), [])) ?? []).filter(message => Date.parse(message.timestamp) >= since && (message.content || message.attachments?.length)).reverse()
      if (messages.length) conversations.push({ channel: room.id, name: room.name, messages: messages.map(message => ({ id: message.id, author: message.author?.username, bot: !!message.author?.bot, at: message.timestamp, replyTo: message.message_reference?.message_id, text: message.content.slice(0, 600) + (message.attachments?.length ? ' [' + message.attachments.length + ' attachment(s)]' : '') })) })
    }
    const numbers = new Set([...light.issues, ...light.pullRequests]), ids = new Set([...light.board, ...light.discord, ...light.forum, ...site.shouts.map(shout => shout.id)])
    const quiet = new Set(light.pullRequests), talk = new Set(light.board), posts = new Set(light.forum)
    writeFileSync(join(dir, 'light.json'), JSON.stringify({ ...base, lane: 'light', work: light,
      issues, prs: prs.map(pr => quiet.has(pr.number) ? pr : brief([pr])[0]),
      board: { threads: threads.filter(thread => talk.has(thread.id)), claims }, discord: conversations,
      forum: site.threads.filter(thread => posts.has(thread.id)), shoutbox: light.shoutbox ? site.shouts : [],
      todos, ledger: ledgerFor(numbers, ids) }, null, 1))
  }
  // The proposals start as the map to save; each lane's answer is added by model-status.mjs.
  writeFileSync(join(dir, 'proposals.json'), JSON.stringify({ actions: [], todos: [], drop: [], items: work.items }))
}
const output = process.env.GITHUB_OUTPUT
if (output) appendFileSync(output, 'run=' + run + '\nfingerprint=' + fingerprint + '\ndown=' + [...new Set(down)].join(', ') + '\nhard=' + (run ? work.hard.join(' ') : '') + '\n')
const count = work.light ? work.light.issues.length + work.light.pullRequests.length + work.light.board.length + work.light.discord.length + work.light.forum.length + Number(work.light.shoutbox) : 0
console.log((state.paused ? 'Paused. ' : '') + prs.length + ' open pull requests, ' + issues.length + ' open issues, ' + threads.length + ' board threads, ' + claims.length + ' claims, ' + rooms.length + ' Discord rooms; '
  + (run ? 'hard lane: ' + work.hard.length + ' pull request(s), light lane: ' + count + ' item(s).' : first && !daily ? 'first pass: recorded what is open.' : 'nothing changed, the model is skipped.'))
