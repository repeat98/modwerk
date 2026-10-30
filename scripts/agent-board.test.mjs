import { afterEach, describe, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import * as board from './agent-board.mjs'
import { boardClaims, readiness } from './pr-ready.mjs'

const folders = []
afterEach(() => { for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true }) })
function repository(files) {
  const root = mkdtempSync(join(tmpdir(), 'agent-board-')); folders.push(root)
  const git = (...args) => execFileSync('git', args, { cwd: root, stdio: 'pipe' })
  const write = entries => { for (const [path, text] of Object.entries(entries)) { mkdirSync(dirname(join(root, path)), { recursive: true }); writeFileSync(join(root, path), text) } }
  git('init', '-q', '-b', 'main'); git('config', 'user.email', 'test@example.test'); git('config', 'user.name', 'Test')
  write(files); git('add', '.'); git('commit', '-qm', 'base')
  return { root, commit(entries) { write(entries); git('add', '.'); git('commit', '-qm', 'change') } }
}
const events = indices => JSON.stringify({ events: indices.map(index => ({ event: 'ev_' + index, index })) })
const claimRow = (kind, key, holder) => ({ id: crypto.randomUUID(), kind, key, holder, branch: 'work', pullRequest: null, expiresAt: '2026-11-12T00:00:00.000Z' })

describe('what a branch needs claimed', () => {
  it('finds new module folders, hook and table indices and migrations, and nothing that was already there', () => {
    const { root, commit } = repository({
      'sdk/machines/octatrack/events.json': events([35, 36]), 'migrations/0083_old.sql': '', 'sdk/octabam/modules/echo/README.md': '',
      'sdk/digitakt/core/interface.json': JSON.stringify({ events: [{ name: 'ev_a' }], tables: [] }),
    })
    commit({
      'sdk/machines/octatrack/events.json': events([35, 36, 37]), 'migrations/0084_new.sql': '', 'sdk/octabam/modules/echo/LICENSE': '',
      'sdk/octabam/modules/tape-echo/README.md': '', 'sdk/octabam/modules/tape-echo/src/a.c': '', 'sdk/drafts/slicer/README.md': '', 'sdk/digitone/modules/swarm/README.md': '',
      'sdk/digitakt/core/interface.json': JSON.stringify({ events: [{ name: 'ev_a' }, { name: 'ev_b' }], tables: [{ name: 'core_x' }] }),
    })
    expect(board.neededClaims({ root, base: 'HEAD~1' }).map(item => item.kind + ' ' + item.key).sort()).toEqual([
      'hook digitakt/events/1', 'hook digitakt/tables/0', 'hook octatrack/37', 'migration 0084', 'module digitone/swarm', 'module octatrack/slicer', 'module octatrack/tape-echo',
    ])
  })
})

describe('the board client', () => {
  const answer = (status, value) => async () => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } })
  it('sorts what a branch needs into yours, someone else\'s and free', async () => {
    const needed = [{ kind: 'migration', key: '0084' }, { kind: 'hook', key: 'octatrack/37' }, { kind: 'module', key: 'octatrack/tape-echo' }]
    const fetch = answer(200, { claims: [claimRow('migration', '0084', 'ada'), claimRow('hook', 'octatrack/37', 'bo')] })
    const compared = await board.compareClaims(needed, 'Ada', { fetch })
    expect([compared.mine, compared.others, compared.free].map(list => list.map(item => item.key))).toEqual([['0084'], ['octatrack/37'], ['octatrack/tape-echo']])
    expect((await board.compareClaims(needed, null, { fetch })).unknown).toHaveLength(2)
  })
  it('treats an undeployed or failing board as unavailable, and a refusal as an answer', async () => {
    await expect(board.listClaims({}, { fetch: answer(404, { error: 'API route not found.' }) })).rejects.toBeInstanceOf(board.BoardUnavailable)
    await expect(board.listClaims({}, { fetch: answer(503, { error: 'down' }) })).rejects.toBeInstanceOf(board.BoardUnavailable)
    await expect(board.listClaims({}, { fetch: async () => { throw new TypeError('fetch failed') } })).rejects.toBeInstanceOf(board.BoardUnavailable)
    // A lost connect race is retried; the answer after it counts.
    let calls = 0
    expect(await board.listClaims({}, { fetch: async () => { if (++calls < 3) throw new TypeError('fetch failed', { cause: { code: 'ETIMEDOUT' } }); return Response.json({ claims: [] }) } })).toEqual([])
    expect(calls).toBe(3)
    await expect(board.claim({ kind: 'migration', key: '0084' }, { token: 'a'.repeat(64), fetch: answer(409, { error: 'migration 0084 is claimed by @bo.' }) })).rejects.toThrow('claimed by @bo')
    // Tests never reach the live board.
    await expect(board.listClaims()).rejects.toBeInstanceOf(board.BoardUnavailable)
  })
  it('gives the doctor a red line for an unclaimed new module or someone else\'s claim', () => {
    const { root } = repository({ 'README.md': '' })
    const line = (claims, login) => board.moduleClaimLine({ root, machine: 'octatrack', id: 'tape-echo', folder: 'sdk/octabam/modules/tape-echo', claims, login })
    expect(line([], 'ada')).toMatchObject({ state: 'fail', fix: 'npm run board -- claim module octatrack/tape-echo' })
    expect(line([], null).fix).toMatch(/^npm run board -- login/)
    expect(line([claimRow('module', 'octatrack/tape-echo', 'ada')], 'ada').state).toBe('ok')
    expect(line([claimRow('module', 'octatrack/tape-echo', 'bo')], 'ada')).toMatchObject({ state: 'fail', detail: expect.stringContaining('@bo') })
    expect(board.moduleClaimLine({ root, machine: 'octatrack', id: 'x', folder: 'x', claims: [], login: null, unavailable: 'down' }).state).toBe('info')
  })
  it('finds a module\'s author in the catalogue or its manifest, for a question nobody holds', () => {
    const { root } = repository({
      'src/catalog/module-documents.json': JSON.stringify({ modules: [{ id: 'tape-echo', author: { github: 'Ada' } }] }),
      'sdk/digitakt/modules/swarm/modwerk.module.json': JSON.stringify({ author: { github: 'bo' } }),
      'sdk/analog-rytm-mkii/modules/_submissions/chorus/modwerk.module.json': JSON.stringify({ author: { github: 'cy' } }),
    })
    expect(['octatrack/tape-echo', 'digitakt/swarm', 'analog-rytm-mkii/chorus', 'octatrack/swarm', 'digitakt/../swarm', undefined].map(key => board.moduleAuthor(key, root))).toEqual(['Ada', 'bo', 'cy', null, null, null])
  })
})

describe('questions and findings in the commands', () => {
  const thread = values => ({ id: crypto.randomUUID(), kind: 'question', topic: { kind: 'module', key: 'octatrack/tape-echo' }, author: 'bo', to: 'ada', body: 'Room for a chorus?', pullRequest: null, createdAt: '2026-10-30T00:00:00.000Z', activeAt: '2026-10-30T00:00:00.000Z', endsAt: '2026-11-29T00:00:00.000Z', replies: [], ...values })
  it('gives the doctor an info line for questions and findings on the module or its machine, never a red one', () => {
    const messages = [thread({}), thread({ kind: 'finding', to: null, topic: { kind: 'machine', key: 'octatrack' } }), thread({ kind: 'finding', to: null, topic: { kind: 'machine', key: 'digitakt' } }), thread({ topic: { kind: 'module', key: 'octatrack/other' } })]
    expect(board.moduleMessagesLine({ machine: 'octatrack', id: 'tape-echo', messages, login: 'Ada' })).toEqual({ state: 'info', name: 'board messages', detail: '1 open question on module octatrack/tape-echo (1 waiting for you), 1 finding on it or on octatrack: npm run board -- messages --machine octatrack' })
    const answered = [thread({ replies: [{ id: crypto.randomUUID(), author: 'ada', body: 'Yes', createdAt: '2026-10-30T01:00:00.000Z' }] })]
    expect(board.moduleMessagesLine({ machine: 'octatrack', id: 'tape-echo', messages: answered, login: 'ada' }).detail).not.toContain('waiting')
    expect(board.moduleMessagesLine({ machine: 'digitone', id: 'swarm', messages, login: 'ada' })).toBeNull()
  })
  it('tells pr:ready what waits in the inbox, and stays quiet signed out or offline', async () => {
    const token = 'a'.repeat(64)
    expect(await board.inboxNotes({ token, fetch: async () => Response.json({ login: 'ada', waiting: [thread({})], replies: [thread({ author: 'ada', to: 'bo' }), thread({ author: 'ada', kind: 'finding' })] }) })).toEqual([expect.stringMatching(/^Board: 1 question waits for your answer and 2 of your questions and findings have a reply\. .*npm run board -- inbox/)])
    expect(await board.inboxNotes({ token, fetch: async () => Response.json({ login: 'ada', waiting: [], replies: [] }) })).toEqual([])
    expect(await board.inboxNotes({ token, fetch: async () => Response.json({ error: 'Sign in for the board first' }, { status: 401 }) })).toEqual([])
    expect(await board.inboxNotes({ token, fetch: async () => { throw new TypeError('fetch failed') } })).toEqual([])
  })
  it('reads a board without messages yet as claims only, and a missing thread as an answer', async () => {
    const fetch = async url => url.includes('/messages') ? Response.json({ error: 'API route not found.' }, { status: 404 }) : Response.json(url.includes('/me') ? { login: 'ada' } : { claims: [] })
    const previous = process.env.MODWERK_BOARD_TOKEN
    process.env.MODWERK_BOARD_TOKEN = 'a'.repeat(64)
    try {
      const { listClaims, listMessages, whoami } = board
      expect(await listClaims({}, { fetch })).toEqual([])
      expect(await whoami({ fetch })).toBe('ada')
      await expect(listMessages({}, { fetch })).rejects.toBeInstanceOf(board.BoardUnavailable)
      await expect(board.boardRequest('/agent-board/messages/' + crypto.randomUUID(), { fetch: async () => Response.json({ error: 'No board thread has that id.' }, { status: 404 }) })).rejects.toBeInstanceOf(board.BoardError)
    } finally { if (previous === undefined) delete process.env.MODWERK_BOARD_TOKEN; else process.env.MODWERK_BOARD_TOKEN = previous }
  })
  it('shows other developers\' words quoted, with who wrote them', () => {
    const lines = board.describeThread(thread({ replies: [{ id: '12345678-0000-0000-0000-000000000000', author: 'ada', body: 'Yes, take it.', createdAt: '2026-10-30T01:00:00.000Z' }] }))
    expect(lines.slice(1)).toEqual(['    «Room for a chorus?»', '    12345678 @ada: «Yes, take it.»'])
    expect(lines[0]).toMatch(/question +module octatrack\/tape-echo +@bo → @ada {2}open until 2026-11-29$/)
  })
})

describe('pr:ready and the board', () => {
  const needed = [{ kind: 'migration', key: '0084', why: 'new migration' }, { kind: 'hook', key: 'octatrack/37', why: 'new entry' }]
  const fake = ({ login = 'ada', claims = [], fail } = {}) => {
    const taken = []
    return { taken, module: { ...board, neededClaims: () => needed, whoami: async () => { if (fail) throw new board.BoardUnavailable('down'); return login }, currentBranch: () => 'work',
      compareClaims: (items, name) => board.compareClaims(items, name, { fetch: async () => Response.json({ claims }) }),
      claim: async item => { taken.push(item); return { claim: item } } } }
  }
  it('claims what the branch adds for the signed-in developer', async () => {
    const { taken, module } = fake()
    const result = await boardClaims('.', 'main', module)
    expect(taken).toEqual([{ kind: 'migration', key: '0084', branch: 'work' }, { kind: 'hook', key: 'octatrack/37', branch: 'work' }])
    expect(readiness({ board: result }).ok).toBe(true)
  })
  it('stops on someone else\'s claim, and asks a signed-out developer to sign in', async () => {
    const held = await boardClaims('.', 'main', fake({ claims: [claimRow('hook', 'octatrack/37', 'bo')] }).module)
    expect(readiness({ board: held }).ok).toBe(false)
    expect(held.problems[0]).toMatch(/hook octatrack\/37 .* claimed by @bo/)
    const signedOut = await boardClaims('.', 'main', fake({ login: null }).module)
    expect(signedOut.problems[0]).toContain('npm run board -- login')
  })
  it('only notes an unreachable board', async () => {
    const result = await boardClaims('.', 'main', fake({ fail: true }).module)
    expect(readiness({ board: result })).toMatchObject({ ok: true, notes: expect.arrayContaining([expect.stringContaining('claims not checked')]) })
  })
})
