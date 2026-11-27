// SPDX-License-Identifier: Elastic-2.0
// Copyright (c) 2026 Jannik Aßfalg (repeat98)
// The owner's to-do list from the maintenance bot (docs/MAINTENANCE_BOT.md), for /modwerk-todo.
//   npm run todo                list the open to-dos, urgent first
//   npm run todo -- done <id>   tick one off
//   npm run todo -- drop <id>   drop one that no longer applies
//   npm run todo -- lessons     what the owner's replies in Telegram taught the bot
// Signs in with the owner's board session (npm run board -- login); nobody else's session is accepted.
import { boardRequest, readToken } from '../agent-board.mjs'

export function formatTodos(todos) {
  if (!todos.length) return 'No open to-dos.'
  return todos.map(todo => todo.id + '  ' + (todo.urgent ? 'URGENT  ' : '') + todo.command + '  #' + todo.target + ': ' + todo.note).join('\n')
}

if (import.meta.url === 'file://' + process.argv[1]) {
  const [verb, id] = process.argv.slice(2), token = await readToken()
  if (!token) { console.error('Sign in first: npm run board -- login'); process.exit(1) }
  try {
    if (!verb || verb === 'list') console.log(formatTodos((await boardRequest('/maintenance-bot/todos', { token })).todos))
    else if (verb === 'lessons') console.log((await boardRequest('/maintenance-bot/lessons', { token })).lessons.map(lesson => '- ' + lesson.why + '  (on: ' + lesson.summary + ')').join('\n') || 'No lessons yet.')
    else if ((verb === 'done' || verb === 'drop') && /^[a-f0-9]{16}$/.test(id ?? '')) {
      await boardRequest('/maintenance-bot/todos/' + id + '/status', { method: 'POST', token, body: { status: verb === 'done' ? 'done' : 'dropped' } })
      console.log((verb === 'done' ? 'Done: ' : 'Dropped: ') + id)
    } else { console.error('Usage: npm run todo [-- done <id> | drop <id> | lessons]'); process.exit(1) }
  } catch (error) { console.error(error.message); process.exit(1) }
}
