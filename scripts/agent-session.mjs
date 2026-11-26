#!/usr/bin/env node
// SPDX-License-Identifier: Elastic-2.0
// Copyright (c) 2026 Jannik Aßfalg (repeat98)
// Share this coding-agent session with the owner (docs/AGENT_SESSIONS.md), so they see where contributing gets in the way.
//   npm run session -- status                 # whether to ask the developer: ask (the default), always or never
//   npm run session -- prefer ask|always|never
//   npm run session -- preview [--skip 3,7]   # what would be sent, written to ~/.cache/modwerk/session-preview.json
//   npm run session -- share --note "…" [--skip 3,7] [--new] [--file <transcript>] [--agent claude-code|codex]
//                                             # --new: leave out what your earlier shares of this session already hold
//   npm run session -- list | get <id> | delete <id>
//   npm run session -- review [--file <transcript>]   # where this session spent its time; printed here, nothing is sent
//   npm run session -- pull                   # the owner: every shared session into ~/.cache/modwerk-local/sessions/,
//                                             # signed in with the owner's site account (prompt, or MODWERK_EMAIL/PASSWORD)
// Only the conversation is sent: the developer's prompts, the agent's replies and which tools ran and whether they failed.
// Tool output, thinking, long code blocks, hex dumps, secrets and home paths stay here. Uses the board sign-in.
import { chmod, lstat, mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises'
import { homedir, hostname, userInfo } from 'node:os'
import { dirname, join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { gzipSync } from 'node:zlib'
import { parseArgs } from 'node:util'
import { pathToFileURL } from 'node:url'
import { boardRequest, readToken, BoardError, BoardUnavailable } from './agent-board.mjs'
import { formatReview, heavyProcesses, readCalls, reviewSession } from './agent-session-review.mjs'
import { claudeProjectFolder, firmwareFindings, prepareSession, readClaudeTranscript, readCodexRollout, SESSION_CONSENT_VERSION, SESSION_GZIP_LIMIT, SESSION_NOTE_LIMIT } from '../src/community/agent-sessions.ts'

const PREFERENCES = ['ask', 'always', 'never']
export const preferenceFile = () => process.env.MODWERK_SESSION_FILE ?? join(homedir(), '.config', 'modwerk', 'session-sharing.json')
const previewFile = () => join(homedir(), '.cache', 'modwerk', 'session-preview.json')

export async function readPreference(file = preferenceFile()) {
  try { const value = JSON.parse(await readFile(file, 'utf8')).sharing; return PREFERENCES.includes(value) ? value : 'ask' } catch { return 'ask' }
}
async function writePrivate(file, text) {
  await mkdir(dirname(file), { recursive: true, mode: 0o700 })
  await writeFile(file, text, { mode: 0o600 }); await chmod(file, 0o600)
}

/** What the agent does before its final message, whatever the developer chose about sharing (pr:ready prints it). */
export const reviewLine = 'Session review: before your final message, run /modwerk-post-eval: npm run session -- review, add what its figures cannot show, and tell the developer at most three things that cost time, each with its fix. A concrete fix goes in its own "Workflow: …" pull request (docs/AGENT_SESSIONS.md#review-the-session-first).'

/** What the agent should do about sharing at the end of a task, in one line (pr:ready prints it too). */
export function sharingLine(preference) {
  return preference === 'never' ? 'Session sharing: never. The developer chose not to be asked; do not offer it.'
    : preference === 'always' ? 'Session sharing: always. When the task is done, share this session yourself (npm run session -- share --note "…") and tell the developer in a line.'
      : 'Session sharing: ask. When the task is done, ask the developer once whether to share this session with the owner, and say why it helps: what slowed this session down stays in it unless it is shared, and the owner turns it into a guide edit, a check or a fix that spares their next session and every other developer (npm run session -- share --note "…"; only the conversation is sent, docs/AGENT_SESSIONS.md). If they answer always or never, save it with npm run session -- prefer always|never.'
}

/** The working directories this session may have started in: where npm was called, here, and the checkout's root. */
function places() {
  const list = [process.env.INIT_CWD, process.cwd()]
  try { list.push(execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()) } catch { /* not a checkout */ }
  return [...new Set(list.filter(Boolean))]
}
async function newest(files) {
  let best = null
  for (const file of files) {
    try { const info = await stat(file); if (info.isFile() && (!best || info.mtimeMs > best.mtimeMs)) best = { file, mtimeMs: info.mtimeMs } } catch { /* gone */ }
  }
  return best
}
async function claudeCandidates() {
  const root = join(process.env.CLAUDE_CONFIG_DIR ?? join(homedir(), '.claude'), 'projects'), files = []
  for (const place of places()) {
    const folder = join(root, claudeProjectFolder(place))
    try { for (const name of await readdir(folder)) if (name.endsWith('.jsonl')) files.push(join(folder, name)) } catch { /* no sessions here */ }
  }
  return files
}
async function codexCandidates() {
  const root = join(process.env.CODEX_HOME ?? join(homedir(), '.codex'), 'sessions'), files = [], wanted = places()
  // Codex files sessions by day: the last three days hold the current one.
  for (let back = 0; back < 3; back++) {
    const day = new Date(Date.now() - back * 86400000), folder = join(root, String(day.getFullYear()), String(day.getMonth() + 1).padStart(2, '0'), String(day.getDate()).padStart(2, '0'))
    let names
    try { names = await readdir(folder) } catch { continue }
    for (const name of names) {
      if (!name.startsWith('rollout-') || !name.endsWith('.jsonl')) continue
      const file = join(folder, name), first = (await readFile(file, 'utf8')).split('\n', 1)[0]
      try { if (wanted.includes(JSON.parse(first).payload?.cwd)) files.push(file) } catch { /* not a rollout */ }
    }
  }
  return files
}
/** Claude Code names the running session to the commands it starts; its transcript may sit under any project folder. */
async function claudeSessionFile(id = process.env.CLAUDE_CODE_SESSION_ID) {
  if (!id || !/^[0-9a-f-]{36}$/.test(id)) return null
  const root = join(process.env.CLAUDE_CONFIG_DIR ?? join(homedir(), '.claude'), 'projects')
  let folders
  try { folders = await readdir(root) } catch { return null }
  const found = await newest(folders.map(folder => join(root, folder, id + '.jsonl')))
  return found?.file ?? null
}
/** The transcript of the session running now: Claude Code's by its session id, otherwise the most recently written one
 * for this checkout. */
export async function findTranscript({ file, agent } = {}) {
  if (file) return { file, agent: agent ?? (/[\\/]\.codex[\\/]|rollout-/.test(file) ? 'codex' : 'claude-code') }
  const current = agent === 'codex' ? null : await claudeSessionFile()
  if (current) return { file: current, agent: 'claude-code' }
  const claude = agent === 'codex' ? null : await newest(await claudeCandidates())
  const codex = agent === 'claude-code' ? null : await newest(await codexCandidates())
  const pick = claude && (!codex || claude.mtimeMs >= codex.mtimeMs) ? { file: claude.file, agent: 'claude-code' } : codex ? { file: codex.file, agent: 'codex' } : null
  if (!pick) throw new Error('No Claude Code or Codex transcript found for this checkout. Name it with --file <path>.')
  return pick
}

/** The entries the developer's own earlier shares already hold, as "who at" keys. Only shares made since `since` (when
 * this transcript started) can hold any of it, so older ones are not fetched. */
export async function sharedMoments(get, since = '') {
  const { sessions } = await get('/agent-sessions'), keys = new Set(), ids = []
  for (const item of sessions) {
    if (since && item.createdAt < since) continue
    const shared = await get('/agent-sessions/' + encodeURIComponent(item.id))
    for (const entry of shared.session?.entries ?? []) if (entry.at) keys.add(entry.who + ' ' + entry.at)
    ids.push(item.id.slice(0, 8))
  }
  return { keys, ids }
}
/** Indexes of the transcript entries an earlier share already sent. */
export const alreadyShared = (entries, keys) => entries.flatMap((entry, index) => entry.at && keys.has(entry.who + ' ' + entry.at) ? [index] : [])

export async function buildSession({ file, agent, note = '', skip = [], shared }) {
  const info = await lstat(file)
  if (!info.isFile()) throw new Error(file + ' is not a transcript file.')
  const lines = (await readFile(file, 'utf8')).split('\n').filter(Boolean)
  const read = agent === 'codex' ? readCodexRollout(lines) : readClaudeTranscript(lines)
  // --new: what an earlier share of this session sent stays out, the way --skip leaves entries out.
  if (shared) {
    const { keys, ids } = await shared(read.startedAt ?? '')
    const left = alreadyShared(read.entries, keys)
    if (ids.length) console.log(`Leaving out ${left.length} entries already in your earlier shares (${ids.join(', ')}).`)
    skip = [...skip, ...left]
  }
  let user = ''
  try { user = userInfo().username } catch { /* none */ }
  return prepareSession(read, note, { user, host: hostname().split('.')[0], home: homedir(), names: developerNames() }, skip)
}

/** A note with nothing of the session in it: missing, or only dots, ellipses, quotes and spaces. */
export const placeholderNote = note => !/[\p{L}\p{N}]/u.test(note ?? '')

// Parts of an email address that are roles or services, not a person: never scrubbed as names.
const NOT_NAMES = new Set(['info', 'mail', 'email', 'contact', 'hello', 'admin', 'office', 'studio', 'music', 'noreply', 'users', 'github', 'dev'])
/** The developer's names as git knows them: user.name in full and in parts, and the parts of user.email before the @. */
export function developerNames(read = key => execFileSync('git', ['config', '--get', key], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()) {
  const value = key => { try { return read(key) } catch { return '' } }
  const name = value('user.name'), local = value('user.email').split('@')[0].replace(/^\d+\+/, '')
  const parts = [...name.split(/\s+/), ...local.split(/[._+-]+/)].filter(part => part.length >= 3 && /\p{L}/u.test(part) && !NOT_NAMES.has(part.toLowerCase()))
  return [...new Set([name.trim(), ...parts].filter(part => part.length >= 3))]
}

function summary(session, file) {
  const first = session.entries.find(entry => entry.who === 'developer')?.text.replace(/\s+/g, ' ').slice(0, 100) ?? '(none)'
  const counts = ['developer', 'agent', 'tool'].map(who => session.entries.filter(entry => entry.who === who).length)
  const r = session.removed
  return [
    `Transcript: ${file}`,
    `Kept: ${counts[0]} developer prompts, ${counts[1]} agent replies, ${counts[2]} tool calls (${session.entries.filter(entry => entry.failed).length} failed).`,
    `Removed: ${r.toolOutputs} tool outputs, ${r.thinking} thinking blocks, ${r.codeBlocks} long code blocks, ${r.hexLines} hex dumps, ${r.blobs} data blobs, ${r.secrets} secrets, ${r.skipped} injected or skipped turns${r.trimmed ? `, ${r.trimmed} entries trimmed to fit` : ''}.`,
    `First prompt: «${first}»`,
  ].join('\n')
}

async function token() {
  const value = await readToken()
  if (!value) throw new BoardError('Sign in for the board first: npm run board -- login', 401)
  return value
}

// The same Worker and site the board client uses (scripts/agent-board.mjs).
const API = () => (process.env.MODWERK_API ?? 'https://octamod-community.octamod.workers.dev/api').replace(/\/$/, '')
const SITE = () => new URL(process.env.MODWERK_SITE ?? 'https://modwerk.app/').origin

/** A request with the owner's site account session (`Authorization: Bearer`, as the site sends it). */
export async function accountRequest(path, { method = 'GET', session, body, api = API(), fetch: send = fetch } = {}) {
  const result = await send(api + path, { method, redirect: 'error', signal: AbortSignal.timeout(30000), headers: { Accept: 'application/json', ...(method === 'GET' ? {} : { Origin: SITE() }), ...(session ? { Authorization: 'Bearer ' + session } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) })
  let value
  try { value = await result.json() } catch { throw new BoardUnavailable('The Worker did not answer with JSON (HTTP ' + result.status + ').') }
  if (!result.ok) throw new BoardError(value?.error ?? 'HTTP ' + result.status, result.status)
  return { value, session: result.headers.get('X-Octamod-Session') }
}
/** Signs in to the owner's site account with email and password, as the site's sign-in does, runs `work` with that
 * session, then signs out again. The password is only sent to sign in and is never written anywhere. */
export async function asAccount({ email, password }, work, options = {}) {
  let signedIn
  try { signedIn = await accountRequest('/auth/login', { ...options, method: 'POST', body: { email, password } }) } catch (error) {
    if (error instanceof BoardError && error.status === 401) throw new BoardError(error.message + ' An account made with Google, GitHub or Discord has no password until you set one with "Forgot password" on the site.', 401)
    throw error
  }
  if (!signedIn.session) throw new BoardError('The sign-in returned no session.', 500)
  try { return await work(signedIn.session) } finally { await accountRequest('/auth/logout', { ...options, method: 'POST', session: signedIn.session }).catch(() => {}) }
}
/** Reads a line from the terminal, without echoing it when `hidden`. Enter on an empty line is ignored, so a stray
 * Enter already waiting in the terminal does not answer for the person. */
function ask(question, hidden = false) {
  const input = process.stdin
  if (!input.isTTY) return Promise.resolve('')
  return new Promise(resolve => {
    let value = ''
    process.stdout.write(question)
    input.setRawMode(true); input.resume(); input.setEncoding('utf8')
    const done = answer => { input.setRawMode(false); input.pause(); input.off('data', onData); process.stdout.write('\n'); resolve(answer) }
    const onData = chunk => {
      for (const ch of chunk) {
        if (ch === '\r' || ch === '\n') { if (value.trim()) return done(value); continue }
        if (ch === '\u0003' || ch === '\u0004') return done('')
        if (ch === '\u007f' || ch === '\b') { if (value) { value = value.slice(0, -1); if (!hidden) process.stdout.write('\b \b') } continue }
        value += ch
        if (!hidden) process.stdout.write(ch)
      }
    }
    input.on('data', onData)
  })
}

/** Saves every shared session not yet in `folder`, and an index of all of them. */
export async function pullSessions(folder, get) {
  const { sessions } = await get('/agent-sessions?all=1'), index = []
  await mkdir(folder, { recursive: true, mode: 0o700 })
  for (const item of sessions) {
    const name = `${item.createdAt.slice(0, 10)}-${item.login ?? 'deleted'}-${item.id.slice(0, 8)}.json`, file = join(folder, name)
    try { await stat(file) } catch { await writePrivate(file, JSON.stringify(await get('/agent-sessions/' + item.id), null, 2) + '\n') }
    index.push(`- ${name}: @${item.login ?? 'deleted'}, ${item.agent}, ${item.entries} entries, ${item.branch ?? 'no branch'}${item.note ? ` — «${item.note.replace(/\s+/g, ' ').slice(0, 200)}»` : ''}`)
  }
  await writePrivate(join(folder, 'INDEX.md'), `# Shared agent sessions (pulled ${new Date().toISOString().slice(0, 16)}Z)\n\nPrivate: names and quotes stay in this folder and in chat.\n\n${index.join('\n')}\n`)
  return sessions.length
}

export async function main(argv = process.argv.slice(2)) {
  const { values, positionals } = parseArgs({ args: argv, allowPositionals: true, options: { note: { type: 'string' }, skip: { type: 'string' }, file: { type: 'string' }, agent: { type: 'string' }, new: { type: 'boolean' } } })
  const [command = 'help', arg] = positionals
  const skip = (values.skip ?? '').split(',').filter(Boolean).map(Number).filter(Number.isInteger)
  if (command === 'status') { console.log(sharingLine(await readPreference())); return 0 }
  if (command === 'review') {
    const found = await findTranscript({ file: values.file, agent: values.agent })
    let processes = []
    try { processes = heavyProcesses(execFileSync('ps', ['-Ao', 'pid=,pcpu=,time=,etime=,command='], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 })) } catch { /* no ps (Windows): the review goes on without it */ }
    for (const line of formatReview(reviewSession(readCalls((await readFile(found.file, 'utf8')).split('\n').filter(Boolean), found.agent)), processes)) console.log(line)
    return 0
  }
  if (command === 'prefer') {
    if (!PREFERENCES.includes(arg)) { console.error('Choose ask, always or never.'); return 2 }
    await writePrivate(preferenceFile(), JSON.stringify({ sharing: arg }) + '\n')
    console.log(sharingLine(arg)); return 0
  }
  if (command === 'preview' || command === 'share') {
    if ((values.note ?? '').length > SESSION_NOTE_LIMIT) { console.error(`Keep the note to ${SESSION_NOTE_LIMIT} characters.`); return 2 }
    // The note is what the owner reads first; an agent once sent the instructions' "…" placeholder as it was.
    if (command === 'share' && placeholderNote(values.note)) { console.error('Write the note: a few sentences on what got in the way in this session (--note "The board refused … until …").'); return 2 }
    const found = await findTranscript({ file: values.file, agent: values.agent })
    const shared = values.new ? async since => sharedMoments(async path => boardRequest(path, { token: await token() }), since) : undefined
    const session = await buildSession({ ...found, note: values.note ?? '', skip, shared })
    await writePrivate(previewFile(), JSON.stringify(session, null, 2) + '\n')
    console.log(summary(session, found.file))
    console.log(`What would be sent: ${previewFile()}`)
    const firmware = firmwareFindings(session.entries)
    if (firmware.length) {
      console.error(`✗ Entries ${firmware.map(item => item.index).join(', ')} still look like firmware or stock code (${[...new Set(firmware.map(item => item.reason))].join(', ')}). Firmware never leaves this computer: look at them in the preview, then run this again with --skip ${firmware.map(item => item.index).join(',')}.`)
      return 1
    }
    if (command === 'preview') return 0
    if (!session.entries.length) { console.error(values.new ? 'Your earlier shares already hold all of this session.' : 'This session has no conversation to share yet.'); return 1 }
    const data = gzipSync(JSON.stringify(session))
    if (data.length > SESSION_GZIP_LIMIT) { console.error('The session is too large to share even trimmed. Leave entries out with --skip.'); return 1 }
    const result = await boardRequest('/agent-sessions', { method: 'POST', token: await token(), body: { consent: SESSION_CONSENT_VERSION, data: data.toString('base64') } })
    console.log(`Shared with the owner as ${result.id}, kept until ${result.expiresAt.slice(0, 10)}. Delete it any time: npm run session -- delete ${result.id}`)
    return 0
  }
  if (command === 'list') {
    const { sessions } = await boardRequest('/agent-sessions', { token: await token() })
    if (!sessions.length) console.log('You have not shared any sessions.')
    for (const item of sessions) console.log(`${item.id}  ${item.createdAt.slice(0, 10)}  ${item.agent}  ${item.entries} entries  ${item.branch ?? ''}  kept until ${item.expiresAt.slice(0, 10)}`)
    return 0
  }
  if (command === 'get' || command === 'delete') {
    if (!arg) { console.error(`Name the session: npm run session -- ${command} <id>`); return 2 }
    const result = await boardRequest('/agent-sessions/' + encodeURIComponent(arg), { method: command === 'get' ? 'GET' : 'DELETE', token: await token() })
    console.log(command === 'get' ? JSON.stringify(result, null, 2) : `Deleted ${result.deleted}.`)
    return 0
  }
  if (command === 'pull') {
    // The owner's site account, which carries the administrator role: typed in, or from the environment for this command.
    const email = (process.env.MODWERK_EMAIL ?? '').trim() || (await ask('Modwerk account email: ')).trim()
    const password = process.env.MODWERK_PASSWORD || await ask('Password (not shown, not stored): ', true)
    if (!email || !password) { console.error('Pulling needs your Modwerk account: type its email and password when asked, or set MODWERK_EMAIL and MODWERK_PASSWORD for this command.'); return 2 }
    const folder = join(homedir(), '.cache', 'modwerk-local', 'sessions')
    const count = await asAccount({ email, password }, session => pullSessions(folder, async path => (await accountRequest(path, { session })).value).catch(error => {
      // Signed in, but the account is not an administrator: the Worker answers as for nobody signed in.
      if (error instanceof BoardError && (error.status === 401 || error.status === 403)) throw new BoardError('This account does not have the administrator role, so it cannot read shared sessions.', error.status)
      throw error
    }))
    console.log(`${count} shared sessions in ${folder} (INDEX.md lists them).`)
    return 0
  }
  console.log('npm run session -- review | status | prefer ask|always|never | preview | share --note "…" [--skip 3,7] [--new] [--file <transcript>] | list | get <id> | delete <id> | pull')
  return command === 'help' ? 0 : 2
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().then(code => { process.exitCode = code }, error => {
    console.error(error instanceof BoardError || error instanceof BoardUnavailable ? error.message : error.stack ?? String(error))
    process.exitCode = 1
  })
}
