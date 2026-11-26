// SPDX-License-Identifier: Elastic-2.0
// Copyright (c) 2026 Jannik Aßfalg (repeat98)
// Routes a maintenance bot pass by hardness (docs/MAINTENANCE_BOT.md). Pull requests that changed go to the hard
// lane, where the stronger model reviews and merges; issues, the board and the chats go to the light lane. Only
// what changed since the last successful pass is work, so a quiet pass starts no model.
import { createHash } from 'node:crypto'

/** Pull requests the hard lane takes in one pass; the rest come 30 minutes later. */
export const HARD_CAP = 6
/** Kinds only the hard lane may propose: the executor holds back a merge or review from the light lane. */
export const HARD_ONLY = new Set(['merge', 'review'])
const WEEK = 7 * 86400000, STARTING = 45 * 60000
const sign = value => createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0, 12)

/**
 * `seen` is the signature map the last successful pass saved. Returns each lane's work and `items`, the map to save
 * when this pass succeeds. An item left for a later pass keeps its old signature, so it counts as changed again.
 * The daily run also sweeps what only time changes: every issue and board thread, and pull requests quiet for a week.
 */
export function plan({ prs, issues, threads, rooms, forum, shouts, seen = {}, daily = false, now = Date.now() }) {
  const items = {}
  const changed = (key, value) => { items[key] = sign(value); return seen[key] !== items[key] }
  const later = key => { if (seen[key]) items[key] = seen[key]; else delete items[key] }
  const due = [], quiet = []
  for (const pr of prs) {
    const key = 'p' + pr.number
    // Checks that still run, or have yet to start after a push, say nothing: the pull request is judged in the
    // pass after they settle. One whose required checks never start (a conflict) is judged as it is.
    if (pr.checks === 'pending' || (pr.checks === 'incomplete' && now - Date.parse(pr.updated) < STARTING)) later(key)
    else if (changed(key, [pr.head, pr.draft, pr.checks, pr.comments, pr.labels, pr.waitingRuns])) due.push(pr)
    else if (daily && now - Date.parse(pr.updated) > WEEK) quiet.push(pr.number)
  }
  // Ready pull requests first, then the longest waiting.
  due.sort((a, b) => Number(a.draft) - Number(b.draft) || Date.parse(a.updated) - Date.parse(b.updated))
  for (const pr of due.slice(HARD_CAP)) later('p' + pr.number)
  const light = {
    issues: issues.filter(issue => changed('i' + issue.number, [issue.comments, issue.labels]) || daily).map(issue => issue.number),
    pullRequests: quiet,
    board: threads.filter(thread => changed('b' + thread.id, thread.replies.length) || daily).map(thread => thread.id),
    discord: rooms.filter(room => changed('d' + room.id, room.last)).map(room => room.id),
    forum: forum.filter(thread => changed('f' + thread.id, thread.posts.at(-1)?.id ?? '')).map(thread => thread.id),
    shoutbox: changed('s', shouts.at(-1)?.id ?? ''),
  }
  const any = Object.values(light).some(value => value === true || value.length > 0)
  return { hard: due.slice(0, HARD_CAP).map(pr => pr.number), light: any ? light : null, items }
}
