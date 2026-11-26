// SPDX-License-Identifier: Elastic-2.0
// Copyright (c) 2026 Jannik Aßfalg (repeat98)
// The maintenance bot's morning report (docs/MAINTENANCE_BOT.md). The owner reads it on a phone, so it counts
// rather than lists, names only failures, and points at /modwerk-todo for the work at the computer.
const WEEK = 7 * 86400, LABELS = { discord_reply: 'Discord replies', forum_reply: 'forum replies', shout_reply: 'shoutbox replies', board_reply: 'board replies', comment: 'replies', review: 'reviews', merge: 'merges', close: 'closures', approve_run: 'check starts', label: 'labels' }
const short = count => count >= 1e6 ? (count / 1e6).toFixed(1) + 'M' : Math.round(count / 1e3) + 'k'
/**
 * The bot's weekly look at itself (docs/MAINTENANCE_BOT.md, "How it improves"): one line of numbers for Monday's
 * report, and `flags` for each kind of action the owner stopped, or that failed, three times or more. A flag
 * becomes a to-do for a desktop session, which proposes the change to the prompt or the policy; the bot never
 * edits its own rules. `usage` is last week's count of what each lane read.
 */
export function weeklyRetro(actions, usage = {}, date = new Date()) {
  const since = date.getTime() / 1000 - WEEK, week = actions.filter(a => a.created_at >= since)
  const count = status => week.filter(a => a.status === status).length
  const stale = actions.filter(a => a.status === 'pending' && a.tier === 'ask' && date.getTime() / 1000 - a.created_at > 2 * 86400).length
  const flags = []
  for (const kind of new Set(week.map(a => a.kind))) {
    const of = week.filter(a => a.kind === kind), decided = of.filter(a => ['done', 'vetoed', 'failed'].includes(a.status)).length, name = LABELS[kind] ?? kind
    for (const [status, word] of [['vetoed', 'stopped'], ['failed', 'failed']]) {
      const hit = of.filter(a => a.status === status)
      if (hit.length >= 3) flags.push(hit.length + ' of ' + decided + ' ' + name + ' ' + word)
    }
  }
  const lane = (name, label) => usage[name]?.runs ? label + ' ' + short(usage[name].tokens) + ' tokens in ' + usage[name].runs + ' runs' : ''
  const tokens = [lane('hard', 'reviews'), lane('light', 'the rest')].filter(Boolean).join(', ')
  return {
    flags,
    line: 'Last 7 days: ' + count('done') + ' done, ' + count('vetoed') + ' stopped, ' + count('failed') + ' failed, ' + count('expired') + ' dropped' + (stale ? ', ' + stale + ' waiting for you over 2 days' : '') + '.' + (tokens ? ' Read: ' + tokens + '.' : ''),
  }
}

const NOUNS = { label: ['label', 'labels'], comment: ['reply', 'replies'], review: ['review', 'reviews'], merge: ['merge', 'merges'], close: ['closure', 'closures'], approve_run: ['started check', 'started checks'] }
export function dailyReport(actions, todos = [], date = new Date()) {
  const count = (status, tier) => actions.filter(a => a.status === status && (!tier || a.tier === tier)).length
  const kinds = {}
  for (const action of actions.filter(a => a.status === 'done')) kinds[action.kind] = (kinds[action.kind] ?? 0) + 1
  const done = Object.entries(kinds).map(([kind, n]) => n + ' ' + (NOUNS[kind]?.[n === 1 ? 0 : 1] ?? kind)).join(', ')
  const failed = actions.filter(a => a.status === 'failed' || (a.status === 'running' && date.getTime() / 1000 - a.updated_at > 3600))
  const waiting = [count('pending', 'ask') && count('pending', 'ask') + ' need your OK', count('pending', 'window') && count('pending', 'window') + ' run unless you stop them'].filter(Boolean).join(', ')
  const urgent = todos.filter(todo => todo.urgent).slice(0, 2).map(todo => '• ' + (todo.target ? '#' + todo.target + ' ' : '') + todo.note.slice(0, 90))
  // Windows arrive silently, so the report names what can still be stopped, soonest first.
  const clock = seconds => new Date(seconds * 1000).toLocaleTimeString('de-DE', { timeZone: 'Europe/Berlin', hour: '2-digit', minute: '2-digit' })
  const stoppable = actions.filter(a => a.status === 'pending' && a.tier === 'window').sort((a, b) => a.due_at - b.due_at).slice(0, 8).map(a => '• ' + clock(a.due_at) + ' ' + a.summary)
  return [
    'Modwerk, ' + date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'Europe/Berlin' }),
    waiting ? 'Waiting: ' + waiting + ' (messages above).' : 'Nothing waits for you.',
    ...stoppable,
    done && 'Done: ' + done + '.',
    ...failed.map(a => '❌ ' + a.summary + (a.result ? ' (' + a.result.slice(0, 80) + ')' : ' (outcome unknown, check GitHub)')),
    todos.length ? 'At your computer: ' + todos.length + ' to-do' + (todos.length === 1 ? '' : 's') + ', run /modwerk-todo.' + (urgent.length ? '\n' + urgent.join('\n') : '') : '',
  ].filter(Boolean).join('\n')
}
