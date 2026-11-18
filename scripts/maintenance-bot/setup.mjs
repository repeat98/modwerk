// SPDX-License-Identifier: Elastic-2.0
// Copyright (c) 2026 Jannik Aßfalg (repeat98)
// One-time setup of the maintenance bot (docs/MAINTENANCE_BOT.md), run by the owner after the Worker with the
// bot's routes is live: `npm run maintenance-bot:setup`. Needs gh signed in as the owner, wrangler access to the
// Worker (CLOUDFLARE_ACCOUNT_ID set), a Telegram bot token from @BotFather and a token from `claude setup-token`.
import { execFileSync } from 'node:child_process'
import { createHash, randomBytes } from 'node:crypto'
import { createInterface } from 'node:readline/promises'

const ask = async question => { const rl = createInterface({ input: process.stdin, output: process.stdout }); try { return (await rl.question(question)).trim() } finally { rl.close() } }
const run = (command, args, input) => execFileSync(command, args, { input, stdio: [input === undefined ? 'inherit' : 'pipe', 'pipe', 'inherit'], encoding: 'utf8' })
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

const api = run('gh', ['variable', 'list', '--json', 'name,value', '--jq', '.[] | select(.name=="COMMUNITY_API_URL") | .value']).trim()
if (!/^https:\/\/.+\/api$/.test(api)) throw new Error('The repository variable COMMUNITY_API_URL is missing.')

const token = process.env.TELEGRAM_BOT_TOKEN || await ask('Telegram bot token from @BotFather: ')
const telegram = async (method, body = {}) => {
  const data = await (await fetch('https://api.telegram.org/bot' + token + '/' + method, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })).json()
  if (!data.ok) throw new Error('Telegram ' + method + ': ' + data.description)
  return data.result
}
const me = await telegram('getMe')
await telegram('deleteWebhook')
console.log('Open https://t.me/' + me.username + ' on your phone and send it any message. Waiting up to two minutes…')
let chat
for (let tries = 0; tries < 24 && !chat; tries++) {
  const updates = await telegram('getUpdates', { timeout: 5, allowed_updates: ['message'] })
  chat = updates.map(update => update.message?.chat).filter(found => found?.type === 'private').at(-1)
  if (!chat) await sleep(1000)
}
if (!chat) throw new Error('No message reached the bot. Send it one and run setup again.')
if ((await ask('Found ' + [chat.first_name, chat.last_name].filter(Boolean).join(' ') + (chat.username ? ' (@' + chat.username + ')' : '') + '. Is that you? [y/N] ')).toLowerCase() !== 'y') process.exit(1)

const claude = process.env.CLAUDE_CODE_OAUTH_TOKEN || await ask('Token from `claude setup-token` (run it in another terminal): ')
const key = randomBytes(32).toString('hex'), secret = randomBytes(32).toString('hex')

// Worker secrets first: the GitHub side switches on last, once the Worker answers with the new key.
const worker = { TELEGRAM_BOT_TOKEN: token, TELEGRAM_CHAT_ID: String(chat.id), TELEGRAM_WEBHOOK_SECRET: secret, MAINTENANCE_BOT_KEY_SHA256: createHash('sha256').update(key).digest('hex') }
for (const [name, value] of Object.entries(worker)) { run('npx', ['wrangler', 'secret', 'put', name, '--config', 'wrangler.worker.jsonc'], value); console.log('Worker secret ' + name + ' set.') }
let ready = false
for (let tries = 0; tries < 12 && !ready; tries++) {
  const reply = await fetch(api + '/maintenance-bot/state', { headers: { Authorization: 'Bearer ' + key } })
  ready = reply.ok
  if (!ready) { if (reply.status === 404) throw new Error('The Worker has no maintenance bot routes yet. Merge and deploy the pull request first.'); await sleep(5000) }
}
if (!ready) throw new Error('The Worker does not accept the new key yet. Run setup again in a minute.')

await telegram('setWebhook', { url: api + '/maintenance-bot/telegram', secret_token: secret, allowed_updates: ['message', 'callback_query'], drop_pending_updates: true })
await telegram('setMyCommands', { commands: [{ command: 'status', description: 'What is waiting and what was done' }, { command: 'todos', description: 'Your open to-do list' }, { command: 'pause', description: 'Stop all actions until /resume' }, { command: 'resume', description: 'Start again' }] })
run('gh', ['secret', 'set', 'MAINTENANCE_BOT_KEY'], key)
run('gh', ['secret', 'set', 'CLAUDE_CODE_OAUTH_TOKEN'], claude)
run('gh', ['variable', 'set', 'MAINTENANCE_BOT_ENABLED', '--body', 'true'])
await telegram('sendMessage', { chat_id: chat.id, text: 'Maintenance bot connected. It reviews every 30 minutes and reports each morning. Stop or Approve each action from its message; /pause stops everything.' })
console.log('Done. Start a first pass with: gh workflow run maintenance-bot.yml -f mode=daily')
