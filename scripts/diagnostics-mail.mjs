#!/usr/bin/env node
// Diagnostics emails for the owner's diagnostics pass (docs/MAINTENANCE.md#beta-worker, server/diagnostics-mail.ts).
// Drafts a personal email for a member whose shared diagnostics show a problem, or whose problem is fixed; lists and
// discards drafts. It cannot send: the owner reads each draft in Admin > Octatrack and sends it there, signed in.
//
//   node scripts/diagnostics-mail.mjs list
//   node scripts/diagnostics-mail.mjs draft --user NAME --kind problem|fixed --subject "…" --body-file FILE [--cause "#1720"]
//   node scripts/diagnostics-mail.mjs discard ID
//
// The administrator key comes from MODWERK_ADMIN_KEY or the file MODWERK_ADMIN_KEY_FILE
// (default ~/.cache/modwerk-local/admin-key.txt). The body is plain text: that member's own facts in plain words,
// never another tester's data or a raw record.
import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'

const API = process.env.MODWERK_API_URL ?? 'https://octamod-community.octamod.workers.dev/api'
const ORIGIN = process.env.MODWERK_APP_ORIGIN ?? 'https://modwerk.app'
const [command, ...rest] = process.argv.slice(2)
const option = name => { const at = rest.indexOf('--' + name); return at < 0 ? undefined : rest[at + 1] }
const fail = message => { console.error(message); process.exit(1) }

async function call(path, method = 'GET', body, session) {
  const headers = { Origin: ORIGIN, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...(session ? { 'X-Octamod-Admin': session } : {}) }
  const response = await fetch(API + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) })
  const value = await response.json().catch(() => ({}))
  if (!response.ok) fail(`${method} ${path}: ${response.status} ${value.error ?? ''}`.trim())
  return value
}
async function session() {
  const key = (process.env.MODWERK_ADMIN_KEY ?? readFileSync(process.env.MODWERK_ADMIN_KEY_FILE ?? homedir() + '/.cache/modwerk-local/admin-key.txt', 'utf8')).trim()
  return (await call('/auth/admin', 'POST', { key })).token
}

if (command === 'list') {
  const { mails, emailAvailable } = await call('/admin/diagnostics-mail', 'GET', undefined, await session())
  if (!emailAvailable) console.log('(email is not connected on this backend)')
  for (const mail of mails) console.log(`${mail.id}  ${mail.status.padEnd(9)} ${mail.kind.padEnd(7)} @${mail.username}${mail.eligible ? '' : ' (cannot be sent now)'}  ${mail.cause ? mail.cause + '  ' : ''}${mail.subject}`)
  if (!mails.length) console.log('No diagnostics emails yet.')
} else if (command === 'draft') {
  const user = option('user'), kind = option('kind'), subject = option('subject'), file = option('body-file'), cause = option('cause')
  if (!user || !kind || !subject || !file) fail('draft needs --user, --kind, --subject and --body-file.')
  const { id } = await call('/admin/diagnostics-mail', 'POST', { username: user.replace(/^@/, ''), kind, subject, body: readFileSync(file, 'utf8'), ...(cause ? { cause } : {}) }, await session())
  console.log(`Drafted ${id} for @${user.replace(/^@/, '')}. The owner sends it from Admin > Octatrack.`)
} else if (command === 'discard') {
  if (!/^[a-f0-9]{32}$/.test(rest[0] ?? '')) fail('discard needs a draft id.')
  await call('/admin/diagnostics-mail/' + rest[0], 'DELETE', undefined, await session())
  console.log('Discarded.')
} else fail('Use list, draft or discard. Sending is the owner’s, in Admin > Octatrack.')
