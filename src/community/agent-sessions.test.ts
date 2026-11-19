import { afterEach, describe, expect, it, vi } from 'vitest'
import { gzipSync } from 'node:zlib'
import type { DatabaseSync } from 'node:sqlite'
import { testServer } from './test-server'
import { handleCommunity } from '../../server/transport'
import { digest } from '../../server/security'
import { cleanupAgentSessions, SESSIONS_KEPT } from '../../server/agent-sessions'
import { claudeProjectFolder, firmwareFindings, firmwareReason, prepareSession, readClaudeTranscript, readCodexRollout, scrubText, SESSION_CONSENT_VERSION, validateSession } from './agent-sessions'

const databases: DatabaseSync[] = []
afterEach(() => { databases.splice(0).forEach(db => db.close()); vi.unstubAllGlobals(); vi.useRealTimers() })

const line = (value: unknown) => JSON.stringify(value)
const claudeTranscript = [
  line({ type: 'session-owner', accountUuid: 'f791c26b-29e1-40e0-9552-726b4d2fa20a' }),
  line({ type: 'user', isSidechain: false, origin: { kind: 'human' }, timestamp: '2026-11-19T10:00:00.000Z', gitBranch: 'module/tape-echo', message: { role: 'user', content: [{ type: 'text', text: 'Port the tape echo to the Digitakt.<system-reminder>CLAUDE.md contents</system-reminder>' }] } }),
  line({ type: 'user', isMeta: true, timestamp: '2026-11-19T10:00:01.000Z', message: { role: 'user', content: 'Base directory for this skill: /home/someone/modwerk/.claude/skills/modwerk-start' } }),
  line({ type: 'assistant', timestamp: '2026-11-19T10:00:02.000Z', message: { role: 'assistant', content: [{ type: 'thinking', thinking: 'secret plan' }, { type: 'text', text: 'I will check the board first.' }] } }),
  line({ type: 'assistant', timestamp: '2026-11-19T10:00:03.000Z', message: { role: 'assistant', content: [{ type: 'tool_use', id: 't1', name: 'Bash', input: { command: 'npm run module:doctor -- tape-echo', description: 'Run the module doctor' } }] } }),
  line({ type: 'user', origin: { kind: 'human' }, timestamp: '2026-11-19T10:00:04.000Z', message: { role: 'user', content: [{ tool_use_id: 't1', type: 'tool_result', is_error: true, content: '00000000: 4e 75 4e 71 60 fe 00 00 00 10 00 20 00 30 00 40' }] } }),
  line({ type: 'assistant', timestamp: '2026-11-19T10:00:05.000Z', message: { role: 'assistant', content: [{ type: 'tool_use', id: 't2', name: 'Write', input: { file_path: '/home/someone/modwerk/sdk/x.c', content: 'int stock_table[] = {1,2,3};' } }] } }),
  line({ type: 'user', isSidechain: true, origin: { kind: 'human' }, message: { role: 'user', content: 'subagent prompt' } }),
  line({ type: 'user', origin: { kind: 'task-notification' }, message: { role: 'user', content: 'A background task finished with its output' } }),
  line({ type: 'user', isCompactSummary: true, isVisibleInTranscriptOnly: true, message: { role: 'user', content: 'This session is being continued from a previous conversation. Summary: 0x10 0x20' } }),
  line({ type: 'user', origin: { kind: 'human' }, timestamp: '2026-11-19T10:00:06.000Z', message: { role: 'user', content: '<command-message>modwerk-pr-ready</command-message>\n<command-name>/modwerk-pr-ready</command-name>\n<command-args>now</command-args>' } }),
]

describe('reading a transcript', () => {
  it('keeps prompts, replies and tool calls from Claude Code, and drops outputs, thinking and injected turns', () => {
    const read = readClaudeTranscript(claudeTranscript)
    expect(read.branch).toBe('module/tape-echo')
    expect(read.startedAt).toBe('2026-11-19T10:00:00.000Z')
    expect(read.entries.map(entry => [entry.who, entry.text, entry.failed ?? false])).toEqual([
      ['developer', 'Port the tape echo to the Digitakt.<system-reminder>CLAUDE.md contents</system-reminder>', false],
      ['agent', 'I will check the board first.', false],
      ['tool', 'Bash: Run the module doctor · npm run module:doctor -- tape-echo', true],
      ['tool', 'Write: /home/someone/modwerk/sdk/x.c', false],
      ['developer', '/modwerk-pr-ready now', false],
    ])
    expect(read.removed).toMatchObject({ toolOutputs: 1, thinking: 1, skipped: 3 })
    expect(JSON.stringify(read)).not.toMatch(/4e 75|stock_table|secret plan|f791c26b|subagent prompt|background task|previous conversation/)
  })

  it('reads a Codex rollout the same way', () => {
    const read = readCodexRollout([
      line({ type: 'session_meta', timestamp: '2026-11-19T10:00:00.000Z', payload: { cwd: '/home/someone/modwerk', git: { branch: 'fix/sync' } } }),
      line({ type: 'response_item', timestamp: '2026-11-19T10:00:01.000Z', payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text: '<environment_context>cwd</environment_context>' }] } }),
      line({ type: 'response_item', timestamp: '2026-11-19T10:00:02.000Z', payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text: 'Why does the sync fail?' }] } }),
      line({ type: 'response_item', timestamp: '2026-11-19T10:00:03.000Z', payload: { type: 'reasoning', summary: [] } }),
      line({ type: 'response_item', timestamp: '2026-11-19T10:00:04.000Z', payload: { type: 'function_call', name: 'shell', call_id: 'c1', arguments: JSON.stringify({ command: ['bash', '-lc', 'npm test'] }) } }),
      line({ type: 'response_item', timestamp: '2026-11-19T10:00:05.000Z', payload: { type: 'function_call_output', call_id: 'c1', output: JSON.stringify({ output: 'boom', metadata: { exit_code: 1 } }) } }),
      line({ type: 'response_item', timestamp: '2026-11-19T10:00:06.000Z', payload: { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'The test fails on the transfer step.' }] } }),
    ])
    expect(read).toMatchObject({ agent: 'codex', cwd: '/home/someone/modwerk', branch: 'fix/sync' })
    expect(read.entries.map(entry => [entry.who, entry.text, entry.failed ?? false])).toEqual([
      ['developer', 'Why does the sync fail?', false],
      ['tool', 'shell: bash -lc npm test', true],
      ['agent', 'The test fails on the transfer step.', false],
    ])
    expect(read.removed).toMatchObject({ toolOutputs: 1, thinking: 1, skipped: 1 })
  })

  it('keeps a command the developer ran with ! and drops its output', () => {
    const read = readClaudeTranscript([
      line({ type: 'user', origin: { kind: 'human' }, timestamp: '2026-11-19T10:00:00.000Z', message: { role: 'user', content: '<bash-input>gh auth login</bash-input>' } }),
      line({ type: 'user', origin: { kind: 'human' }, timestamp: '2026-11-19T10:00:01.000Z', message: { role: 'user', content: '<bash-stdout>! One-time code (ABCD-1234) copied to clipboard</bash-stdout><bash-stderr></bash-stderr>' } }),
    ])
    const session = prepareSession(read, '')
    expect(session.entries.map(entry => entry.text)).toEqual(['! gh auth login'])
    expect(JSON.stringify(session)).not.toMatch(/ABCD-1234|One-time/)
    expect(session.removed.toolOutputs).toBe(2)
  })

  it('names the folder Claude Code keeps a checkout\'s transcripts in', () => {
    expect(claudeProjectFolder('/home/jannik/modwerk')).toBe('-home-jannik-modwerk')
    expect(claudeProjectFolder('c:\\Users\\jannik.aßfalg\\Dev')).toBe('c--Users-jannik-a-falg-Dev')
  })
})

describe('scrubbing', () => {
  it('removes secrets, home paths, addresses and the developer\'s names, and keeps the prose readable', () => {
    const removed = { toolOutputs: 0, thinking: 0, codeBlocks: 0, hexLines: 0, blobs: 0, secrets: 0, skipped: 0, trimmed: 0 }
    const text = scrubText([
      'Token ghp_' + 'a'.repeat(36) + ' and sk-ant-' + 'b'.repeat(30) + ' and board ' + 'c'.repeat(64),
      // Built at runtime, so no secret-shaped literal sits in the source for secret scanners.
      'RESEND_API_KEY=' + ['re', 'live' + '9'.repeat(16)].join('_') + ' and password: ' + 'hunter' + 22 + ' and Authorization: Bearer ' + 'abcdefghijklmnopqrstuv',
      'The token: expired, so I signed in again.',
      'Opened /home/jannik/modwerk/AGENTS.md and C:\\Users\\jannik\\Dev on jannik-laptop, mail me at someone@example.com from 192.168.1.20.',
    ].join('\n'), { user: 'jannik', host: 'jannik-laptop' }, removed)
    expect(text).not.toMatch(/ghp_a|sk-ant|cccc|re_live|hunter22|abcdefghijkl|jannik|someone@|192\.168/)
    expect(text).toContain('The token: expired, so I signed in again.')
    expect(text).toContain('~/modwerk/AGENTS.md')
    expect(removed.secrets).toBeGreaterThanOrEqual(6)
  })

  it('removes a sign-in\'s one-time device code an agent quotes, and leaves other ids alone', () => {
    expect(scrubText('Paste the one-time code **WDJB-MJHT** on github.com/login/device.')).toBe('Paste the one-time code **[code removed]** on github.com/login/device.')
    expect(scrubText('Your code: 7E2A-15FF')).toBe('Your code: [code removed]')
    expect(scrubText('The MKII-1234 board and issue 1736-1737 stay.')).toBe('The MKII-1234 board and issue 1736-1737 stay.')
  })

  it('removes the developer\'s names as whole words in any script, and leaves longer words alone', () => {
    const text = scrubText('Greta Šimek checked it. greta.simek wrote back, and Gretas review and Šimeková stay.', { names: ['Greta Šimek', 'Greta', 'Šimek', 'simek'] })
    expect(text).toBe('[name] checked it. [name].[name] wrote back, and Gretas review and Šimeková stay.')
  })

  it('removes the home folder in the form Claude Code names its project folders', () => {
    const text = scrubText('Read ~/.claude/projects/C--Users-jan-doe-Dev/abc/tool-results/x.txt and /home/alice/.claude/projects/-home-alice-modwerk/y.jsonl', { home: 'C:\\Users\\jan.doe' })
    expect(text).toBe('Read ~/.claude/projects/~-Dev/abc/tool-results/x.txt and ~/.claude/projects/-home-alice-modwerk/y.jsonl')
    expect(scrubText('-home-alice-modwerk', { home: '/home/alice' })).toBe('~-modwerk')
  })

  it('removes hex dumps, hex tables and long code blocks, and keeps short snippets', () => {
    const removed = { toolOutputs: 0, thinking: 0, codeBlocks: 0, hexLines: 0, blobs: 0, secrets: 0, skipped: 0, trimmed: 0 }
    const long = '```c\n' + Array.from({ length: 20 }, (_, i) => `line ${i};`).join('\n') + '\n```'
    const text = scrubText(`Here is the dump:\n0004f2a0: 4e 75 4e 71 60 fe 00 00 00 10 00 20\nand the table 0x10, 0x20, 0x30, 0x40, 0x50, 0x60, 0x70, 0x80, 0x90.\n${long}\nRun \`npm run check\`:\n\`\`\`sh\nnpm run check\n\`\`\`\nAfter it, the next line stays.`, {}, removed)
    expect(text).not.toMatch(/4e 75|0x50|line 7;/)
    expect(text).toContain('[code block removed: 20 lines]')
    expect(text).toContain('npm run check')
    expect(text).toContain('After it, the next line stays.')
    expect(removed).toMatchObject({ hexLines: 2, codeBlocks: 1 })
  })

  it('flags disassembly and number tables that survive scrubbing, and not prose that starts like a mnemonic', () => {
    const asm = Array.from({ length: 6 }, (_, i) => `  move.l  (a${i % 8}),d${i % 8}`).join('\n')
    expect(firmwareReason(asm)).toBe('disassembly')
    expect(firmwareReason('Table: ' + Array.from({ length: 40 }, (_, i) => i * 3).join(', '))).toBe('a long table of numbers')
    expect(firmwareReason(Array.from({ length: 8 }, () => 'add a test (unit), then link it, and swap the order, as in step 2.').join('\n'))).toBeNull()
    expect(firmwareReason('The hook at 0x4f2a0 calls 0x4f3b0; nothing else changed.')).toBeNull()
  })

  it('prepares a session: skips what the developer left out and keeps the note short', () => {
    const session = prepareSession(readClaudeTranscript(claudeTranscript), 'The doctor said nothing useful about the missing claim.', {}, [1])
    expect(session.entries.map(entry => entry.who)).toEqual(['developer', 'tool', 'tool', 'developer'])
    expect(session.entries[0].text).toBe('Port the tape echo to the Digitakt.')
    expect(session.entries[2].text).toBe('Write: ~/modwerk/sdk/x.c')
    expect(session.removed.skipped).toBe(4)
    expect(validateSession(JSON.parse(JSON.stringify(session)))).toMatchObject({ ok: true })
    expect(firmwareFindings(session.entries)).toEqual([])
  })
})

async function fixture() {
  const server = await testServer(); databases.push(server.db)
  Object.assign(server.env, { GITHUB_OAUTH_CLIENT_ID: 'test-client', GITHUB_OAUTH_CLIENT_SECRET: 'only-a-test-client-secret', GITHUB_OAUTH_CALLBACK_URL: 'https://api.example.test/api/developer/auth/callback' })
  const call = (path: string, method = 'GET', body?: unknown, developer = '', { origin = 'https://octamod.test' as string | null, cookie = '', admin = '' } = {}) => {
    const headers = new Headers({ 'CF-Connecting-IP': '192.0.2.1' })
    if (origin) headers.set('Origin', origin)
    if (body !== undefined) headers.set('Content-Type', 'application/json')
    if (developer) headers.set('X-Modwerk-Developer', developer)
    if (cookie) headers.set('Cookie', cookie)
    if (admin) headers.set('X-Octamod-Admin', admin)
    return handleCommunity(new Request('https://api.example.test/api' + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }), server.env)
  }
  let next = 300
  async function boardLogin(login: string) {
    const githubId = ++next, verifier = next.toString(16).padStart(64, 'a'), challenge = await digest(verifier)
    const start = await call('/developer/auth/start?port=48123&challenge=' + challenge)
    const state = new URL(start.headers.get('Location')!).searchParams.get('state')!, cookie = start.headers.get('Set-Cookie')!.split(';')[0]
    vi.stubGlobal('fetch', vi.fn(async (url: string) => url === 'https://github.com/login/oauth/access_token'
      ? Response.json({ access_token: 'synthetic-github-access', token_type: 'bearer' })
      : Response.json({ data: { viewer: { databaseId: githubId, login } } })))
    const callback = await call('/developer/auth/callback?code=synthetic-code&state=' + state, 'GET', undefined, '', { origin: null, cookie })
    const location = new URL(callback.headers.get('Location')!)
    const complete = await call('/developer/auth/complete', 'POST', { code: location.searchParams.get('code'), verifier })
    vi.unstubAllGlobals()
    return complete.headers.get('X-Modwerk-Developer')!
  }
  const pack = (session: unknown) => gzipSync(JSON.stringify(session)).toString('base64')
  const share = (token: string, session: unknown, consent = SESSION_CONSENT_VERSION) => call('/agent-sessions', 'POST', { consent, data: pack(session) }, token)
  return { ...server, call, boardLogin, share }
}
const session = () => prepareSession(readClaudeTranscript(claudeTranscript), 'The doctor said nothing useful.')

describe('shared agent sessions on the Worker', () => {
  it('stores a session for its developer and the owner, and nobody else', async () => {
    const { call, boardLogin, share, db } = await fixture()
    const developer = await boardLogin('first-porter'), stranger = await boardLogin('someone-else'), ownerBoard = await boardLogin('repeat98')
    // The owner reads through the admin sign-in. Their board session alone opens nothing else, even on an administrator account.
    db.prepare("UPDATE users SET is_admin=1,email_verified=1 WHERE github_login='repeat98'").run()
    const admin = (await (await call('/auth/admin', 'POST', { key: 'e'.repeat(64) })).json() as { token: string }).token

    const shared = await share(developer, session())
    expect(shared.status).toBe(201)
    const { id, expiresAt } = await shared.json() as { id: string; expiresAt: string }
    expect(Date.parse(expiresAt) - Date.now()).toBeGreaterThan(89 * 86400000)

    const own = await (await call('/agent-sessions', 'GET', undefined, developer)).json() as { sessions: { id: string; entries: number; note: string }[] }
    expect(own.sessions).toMatchObject([{ id, entries: 5, note: 'The doctor said nothing useful.' }])
    expect((await (await call('/agent-sessions', 'GET', undefined, stranger)).json() as { sessions: unknown[] }).sessions).toEqual([])
    expect((await call('/agent-sessions?all=1', 'GET', undefined, stranger)).status).toBe(403)
    expect((await call('/agent-sessions/' + id, 'GET', undefined, stranger)).status).toBe(404)
    expect((await call('/agent-sessions/' + id, 'DELETE', undefined, stranger)).status).toBe(404)
    expect((await call('/agent-sessions', 'GET')).status).toBe(401)

    expect((await call('/agent-sessions?all=1', 'GET', undefined, ownerBoard)).status).toBe(403)
    const all = await (await call('/agent-sessions?all=1', 'GET', undefined, '', { admin })).json() as { sessions: { id: string; login: string }[] }
    expect(all.sessions).toMatchObject([{ id, login: 'first-porter' }])
    const read = await (await call('/agent-sessions/' + id, 'GET', undefined, '', { admin })).json() as { session: { entries: { text: string }[] } }
    expect(read.session.entries[0].text).toBe('Port the tape echo to the Digitakt.')

    expect((await call('/agent-sessions/' + id, 'DELETE', undefined, developer)).status).toBe(200)
    expect(db.prepare('SELECT COUNT(*) AS n FROM agent_sessions').get()).toEqual({ n: 0 })
  })

  it('refuses firmware, secrets, stale terms and anything not in the session format', async () => {
    const { boardLogin, share, call } = await fixture()
    const developer = await boardLogin('first-porter')
    const firmware = session(); firmware.entries.push({ who: 'agent', text: Array.from({ length: 8 }, (_, i) => `00004f${i}0: move.l (a0),d${i}`).join('\n') })
    const refused = await share(developer, firmware)
    expect(refused.status).toBe(422)
    expect((await refused.json() as { error: string }).error).toMatch(/firmware or stock code \(disassembly\)/)
    const secret = session(); secret.entries.push({ who: 'developer', text: 'my token ghp_' + 'z'.repeat(36) })
    expect((await share(developer, secret)).status).toBe(422)
    expect((await share(developer, session(), '2020-01-01')).status).toBe(400)
    expect((await share(developer, { ...session(), entries: [{ who: 'stranger', text: 'x' }] })).status).toBe(422)
    expect((await call('/agent-sessions', 'POST', { consent: SESSION_CONSENT_VERSION, data: 'not base64!' }, developer)).status).toBe(400)
    expect((await share('', session())).status).toBe(401)
  })

  it('keeps at most the limit per developer and purges old sessions and suspended accounts\' sessions', async () => {
    const { boardLogin, share, db, env } = await fixture()
    const developer = await boardLogin('first-porter')
    const userId = (db.prepare("SELECT id FROM users WHERE github_login='first-porter'").get() as { id: string }).id
    const insert = db.prepare("INSERT INTO agent_sessions(id,user_id,agent,note,entries,consent_version,bytes,data,created_at) VALUES(?,?,'claude-code','',1,?,1,'',?)")
    for (let i = 0; i < SESSIONS_KEPT; i++) insert.run(`00000000-0000-4000-8000-${String(i).padStart(12, '0')}`, userId, SESSION_CONSENT_VERSION, i ? new Date().toISOString() : '2026-01-01T00:00:00.000Z')
    expect((await share(developer, session())).status).toBe(409)
    await cleanupAgentSessions(env.DB!)
    expect(db.prepare('SELECT COUNT(*) AS n FROM agent_sessions').get()).toEqual({ n: SESSIONS_KEPT - 1 })
    db.prepare('UPDATE users SET suspended=1 WHERE id=?').run(userId)
    await cleanupAgentSessions(env.DB!)
    expect(db.prepare('SELECT COUNT(*) AS n FROM agent_sessions').get()).toEqual({ n: 0 })
  })
})
