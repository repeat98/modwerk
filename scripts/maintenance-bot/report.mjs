// SPDX-License-Identifier: Elastic-2.0
// Copyright (c) 2026 Jannik Aßfalg (repeat98)
// The maintenance bot's morning report (docs/MAINTENANCE_BOT.md). The owner reads it on a phone, so it counts
// rather than lists, names only failures, and points at /modwerk-todo for the work at the computer.
const NOUNS = { label: ['label', 'labels'], comment: ['reply', 'replies'], review: ['review', 'reviews'], merge: ['merge', 'merges'], close: ['closure', 'closures'], approve_run: ['started check', 'started checks'] }
export function dailyReport(actions, todos = [], date = new Date()) {
  const count = (status, tier) => actions.filter(a => a.status === status && (!tier || a.tier === tier)).length
  const kinds = {}
  for (const action of actions.filter(a => a.status === 'done')) kinds[action.kind] = (kinds[action.kind] ?? 0) + 1
  const done = Object.entries(kinds).map(([kind, n]) => n + ' ' + (NOUNS[kind]?.[n === 1 ? 0 : 1] ?? kind)).join(', ')
  const failed = actions.filter(a => a.status === 'failed' || (a.status === 'running' && date.getTime() / 1000 - a.updated_at > 3600))
  const waiting = [count('pending', 'ask') && count('pending', 'ask') + ' need your OK', count('pending', 'window') && count('pending', 'window') + ' run unless you stop them'].filter(Boolean).join(', ')
  const urgent = todos.filter(todo => todo.urgent).slice(0, 2).map(todo => '• #' + todo.target + ' ' + todo.note.slice(0, 90))
  return [
    'Modwerk, ' + date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'Europe/Berlin' }),
    waiting ? 'Waiting: ' + waiting + ' (messages above).' : 'Nothing waits for you.',
    done && 'Done: ' + done + '.',
    ...failed.map(a => '❌ ' + a.summary + (a.result ? ' (' + a.result.slice(0, 80) + ')' : ' (outcome unknown, check GitHub)')),
    todos.length ? 'At your computer: ' + todos.length + ' to-do' + (todos.length === 1 ? '' : 's') + ', run /modwerk-todo.' + (urgent.length ? '\n' + urgent.join('\n') : '') : '',
  ].filter(Boolean).join('\n')
}
