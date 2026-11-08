// SPDX-License-Identifier: Elastic-2.0
// Copyright (c) 2026 Jannik Aßfalg (repeat98)
// Synthetic fixtures for the isolated local forum preview. Never accepts a remote target.
import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { hashPassword } from 'better-auth/crypto'
import { randomBytes } from 'node:crypto'

if (process.argv.length !== 2) throw new Error('This local-only seed accepts no arguments.')
const directory = '.wrangler/forum-preview'
mkdirSync(directory, { recursive: true })
const config = directory + '/wrangler.local.jsonc'
writeFileSync(config, JSON.stringify({
  name: 'modwerk-forum-local-preview',
  main: '../../worker.ts',
  compatibility_date: '2026-09-30',
  compatibility_flags: ['nodejs_compat'],
  vars: {
    APP_URL: 'http://127.0.0.1:5197',
    AUTH_BASE_URL: 'http://127.0.0.1:8897/api/auth',
    AUTH_SECRET: randomBytes(32).toString('hex'),
    SESSION_TRANSPORT: 'bearer',
    REGISTRATION_OPEN: 'false',
    PRIVACY_READY: 'false',
  },
  d1_databases: [{binding:'DB',database_name:'octamod-community',database_id:'00000000-0000-0000-0000-000000000000',migrations_dir:'../../migrations'}],
  r2_buckets: [{binding:'MEDIA',bucket_name:'modwerk-forum-preview-media'}],
}, null, 2))
const password = 'Octamod local preview 2026!'
const hash = await hashPassword(password)
const sql = value => value === null ? 'NULL' : "'" + String(value).replaceAll("'", "''") + "'"
const statements = []
const add = (table, data) => statements.push(`INSERT OR IGNORE INTO ${table}(${Object.keys(data).join(',')}) VALUES(${Object.values(data).map(sql).join(',')});`)
for (const name of ['demo', 'patchwork', 'tapeclub']) {
  const id = 'preview-' + name, time = Date.now()
  add('auth_users', { id, name, username: name, displayUsername: name, email: name + '@example.test', emailVerified: 1, createdAt: time, updatedAt: time })
  add('users', { id, display_name: name, username: name, email_verified: 1 })
  add('auth_accounts', { id: id + '-credential', accountId: id, providerId: 'credential', userId: id, password: hash, createdAt: time, updatedAt: time })
}
const threads = [
  { id: 'preview-request', user: 'patchwork', title: 'Could scenes control more module parameters?', category: 'general', section: 'requests', machine: 'octatrack', body: 'Fictional preview request.\n\nIt would be fun to explore a smoother transition between two effects settings. What would make that useful in a live set?' },
  { id: 'preview-tutorial', user: 'demo', title: 'A first-flash checklist for your Octatrack', category: 'general', section: 'tutorials', machine: 'octatrack', body: 'Fictional preview guide — this is not a tested flashing procedure.\n\n## Before you start\n\n- Back up your projects and samples.\n- Keep the original OS file.\n- Review compatibility for each module.\n\n**Read the actual flashing guide before using hardware.**' },
  { id: 'preview-introduction', user: 'tapeclub', title: 'Hello from a small tabletop setup', category: 'general', section: 'introductions', body: 'Fictional preview introduction.\n\nI like sample mangling, long delays, and learning how other people put their live sets together. What are you making?' },
  { id: 'preview-showcase', user: 'patchwork', title: 'A slow, evolving live-set sketch', category: 'general', section: 'showcase', machine: 'octatrack', body: 'Fictional preview showcase.\n\nA little inspiration for this new category: share your music, hardware builds, or a workflow worth trying.\n\n> Small changes can make a simple pattern feel alive.' },
  { id: 'preview-welcome', user: 'demo', title: 'Welcome to the Modwerk community', category: 'general', pinned: 1, body: 'This is a local forum draft with fictional sample discussions.\n\nUse this space to ask questions, compare approaches and share what you are making with your Elektron machines. Please credit original authors and keep firmware on your own device.\n\nWhere would you like to take your next setup?' },
  { id: 'preview-tape', user: 'tapeclub', title: 'How are you using Tape Echo in a live set?', category: 'modules', module: 'tapeecho', body: 'Sample discussion for the local preview.\n\nI am exploring transitions built around a short delay and a slowly changing feedback level. What would you try first?' },
  { id: 'preview-config', user: 'patchwork', title: 'A small starting point for rhythmic experiments', category: 'configs', config: { name: 'Rhythmic sketch', moduleIds: ['euclid', 'repitch'], moduleVersions: { euclid: '0.1.0', repitch: '0.1.0' }, keepStockFx2: false }, body: 'A fictional configuration to try the sharing flow.\n\nCopy it into your local configurations to review current versions and compatibility. This post contains module selections only; it contains no firmware.' },
  { id: 'preview-issue', user: 'demo', title: 'Example issue: documenting a repeatable setup', category: 'issues', module: 'euclid', issue: { device: 'MKII', version: 'Local preview example', steps: 'Describe the setup and exact controls here.', expected: 'Explain what you expected to happen.', actual: 'Record what happened instead.' }, body: 'This is a fictional sample issue, not a known defect in Euclid.\n\nThe form captures enough detail to help someone reproduce a problem. Sensitive reports can still be sent privately from a module page.' },
]
for (const thread of threads) {
  add('forum_threads', { id: thread.id, user_id: 'preview-' + thread.user, title: thread.title, category: thread.category, section: thread.section ?? null, machine: thread.machine ?? (thread.module || thread.config ? 'octatrack' : null), module_id: thread.module ?? null, configuration_json: thread.config ? JSON.stringify(thread.config) : null, issue_json: thread.issue ? JSON.stringify(thread.issue) : null, pinned: thread.pinned ?? 0 })
  add('forum_posts', { id: thread.id + '-post', thread_id: thread.id, user_id: 'preview-' + thread.user, body: thread.body })
  add('forum_follows', { thread_id: thread.id, user_id: 'preview-' + thread.user })
}
add('forum_posts', { id: 'preview-tape-reply', thread_id: 'preview-tape', user_id: 'preview-patchwork', body: 'Sample reply: start with a simple pattern so it is easier to hear each change, and share the module configuration alongside your notes.' })
for (const [index, body] of [
  'Welcome to Shoutbox 8! These are fictional messages in your local preview.',
  'Working on a small live-set sketch today. What are you making?',
  'The new tutorials section looks like a good place for first-flash tips.',
  'Try the rich editor: bold, lists, quotes, code, and links.',
].entries()) add('forum_shouts', {id:'preview-shout-'+index,user_id:'preview-'+['demo','tapeclub','patchwork'][index%3],body})
writeFileSync(directory + '/seed.sql', statements.join('\n'))
const wrangler = ['node_modules/wrangler/bin/wrangler.js', 'd1']
const flags = ['--config', config, '--local', '--persist-to', directory]
execFileSync(process.execPath, [...wrangler, 'migrations', 'apply', 'octamod-community', ...flags], { stdio: 'inherit' })
execFileSync(process.execPath, [...wrangler, 'execute', 'octamod-community', ...flags, '--file', directory + '/seed.sql'], { stdio: 'inherit' })
console.log('Local preview only: demo@example.test / ' + password)
