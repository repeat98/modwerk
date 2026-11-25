import { afterEach, describe, expect, it } from 'vitest'
import { execFileSync, spawnSync } from 'node:child_process'
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

it.each([{ args: [] }, { args: ['--released'] }, { args: [''] }])('rejects a claims filter without a holder ($args)', ({ args }) => {
  const result = spawnSync(process.execPath, [join(import.meta.dirname, 'agent-board.mjs'), 'list', '--holder', ...args], {
    env: { ...process.env, MODWERK_BOARD: 'off' }, encoding: 'utf8',
  })
  expect(result.status).toBe(1)
  expect(result.stderr).toContain('Give a GitHub login after --holder')
})

describe('what a branch needs claimed', () => {
  it('finds new module folders, hook and table indices, migrations and machine ids, and nothing that was already there', () => {
    const manifest = (...ids) => JSON.stringify({ platform: { kind: 'elemod', claims: ['ui:x', ...ids.map(id => 'machine:' + id)] } })
    const { root, commit } = repository({
      'sdk/machines/octatrack/events.json': events([35, 36]), 'migrations/0083_old.sql': '', 'sdk/octatrack/modules/echo/README.md': '',
      'sdk/digitakt/core/interface.json': JSON.stringify({ events: [{ name: 'ev_a' }], tables: [] }),
      'sdk/digitakt/modules/poly/modwerk.module.json': manifest(6), 'sdk/analog-rytm-mkii/modules/chorus/README.md': '',
    })
    commit({
      'sdk/machines/octatrack/events.json': events([35, 36, 37]), 'migrations/0084_new.sql': '', 'sdk/octatrack/modules/echo/LICENSE': '',
      'sdk/octatrack/modules/tape-echo/README.md': '', 'sdk/octatrack/modules/tape-echo/src/a.c': '', 'sdk/drafts/slicer/README.md': '', 'sdk/digitone/modules/swarm/README.md': '',
      'sdk/digitakt/core/interface.json': JSON.stringify({ events: [{ name: 'ev_a' }, { name: 'ev_b' }], tables: [{ name: 'core_x' }] }),
      // The Analog Rytm keeps its modules in modules/_submissions/<id>; one moved there is not new.
      'sdk/analog-rytm-mkii/modules/_submissions/temp-save/src/main.c': '', 'sdk/analog-rytm-mkii/modules/_submissions/chorus/README.md': '',
      'sdk/digitakt/modules/poly/modwerk.module.json': manifest(6, 9), 'sdk/digitakt/modules/kick/modwerk.module.json': manifest(10),
      'sdk/drafts/slicer/octamod.module.json': JSON.stringify({ presentation: { summary: 'Slices a loop across the pads.' } }),
      // A machine without a line in the board's code: the Digitakt II, whose submissions sit in modules/_submissions/<id> too.
      'sdk/digitakt-ii/modules/_submissions/mute-latch/modwerk.module.json': manifest(),
    })
    expect(board.neededClaims({ root, base: 'HEAD~1' }).map(item => item.kind + ' ' + item.key).sort()).toEqual([
      'hook digitakt/events/1', 'hook digitakt/tables/0', 'hook octatrack/37', 'machine-id digitakt/10', 'machine-id digitakt/9', 'migration 0084',
      'module analog-rytm-mkii/temp-save', 'module digitakt-ii/mute-latch', 'module digitakt/kick', 'module digitone/swarm', 'module octatrack/slicer', 'module octatrack/tape-echo',
    ])
    expect(board.neededClaims({ root, base: 'HEAD~1' }).find(item => item.key === 'octatrack/slicer').note).toBe('Slices a loop across the pads.')
  })
  it('claims consecutive new hook indices as one run', () => {
    const { root, commit } = repository({ 'sdk/machines/octatrack/events.json': events([35, 36]) })
    commit({ 'sdk/machines/octatrack/events.json': events([35, 36, 37, 38, 39, 40, 42]) })
    expect(board.neededClaims({ root, base: 'HEAD~1' }).map(item => item.key).sort()).toEqual(['octatrack/37-40', 'octatrack/42'])
  })
  it('notes a module claim with its summary, cut at a word to 120 characters, and never the template\'s placeholder', () => {
    const note = summary => board.summaryNote(JSON.stringify({ presentation: { summary } }))
    const long = note('A stereo chorus for the send bus: two swept taps, the right side out of phase, with feedback and its own high- and low-pass.')
    expect(long).toBe('A stereo chorus for the send bus: two swept taps, the right side out of phase, with feedback and its own high- and…')
    expect(long.length).toBeLessThanOrEqual(120)
    expect([note('Replace with one sentence about what this mod adds.'), board.summaryNote('{ not json'), board.summaryNote(null), note(7)]).toEqual(['', '', '', ''])
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
  it('counts a claim tied to the pull request as its own, whoever holds it', async () => {
    const needed = [{ kind: 'module', key: 'octatrack/grain' }]
    const held = { ...claimRow('module', 'octatrack/grain', 'maintainer'), pullRequest: 1858 }
    const compare = pullRequest => board.compareClaims(needed, 'Author', { fetch: answer(200, { claims: [held] }), pullRequest })
    expect((await compare(1858)).mine).toHaveLength(1)
    expect((await compare(1859)).others).toHaveLength(1)
    expect((await compare(undefined)).others).toHaveLength(1)
  })
  it('compares a run of hooks with every claim inside it', async () => {
    const needed = [{ kind: 'hook', key: 'octatrack/38-51' }]
    const compare = (...rows) => board.compareClaims(needed, 'Ada', { fetch: answer(200, { claims: rows }) })
    expect((await compare(claimRow('hook', 'octatrack/40', 'bo'))).others[0].claim.key).toBe('octatrack/40')
    expect((await compare(claimRow('hook', 'octatrack/38', 'ada'))).free).toHaveLength(1)
    expect((await compare(claimRow('hook', 'octatrack/38-51', 'ada'))).mine).toHaveLength(1)
    expect((await compare(claimRow('hook', 'octatrack/events/40', 'bo'), claimRow('hook', 'octatrack/52', 'bo'))).free).toHaveLength(1)
  })
  it('counts a run claimed ahead of the work as covering the part a branch adds', async () => {
    const needed = [{ kind: 'hook', key: 'digitakt-ii/tables/4-5' }]
    const compare = (claims, pullRequest) => board.compareClaims(needed, 'Ada', { fetch: answer(200, { claims }), pullRequest })
    expect((await compare([claimRow('hook', 'digitakt-ii/tables/4-6', 'ada')])).mine[0].claim.key).toBe('digitakt-ii/tables/4-6')
    expect((await compare([{ ...claimRow('hook', 'digitakt-ii/tables/4-6', 'claptom'), pullRequest: 1999 }], 1999)).mine).toHaveLength(1)
    expect((await compare([claimRow('hook', 'digitakt-ii/tables/4-6', 'bo')])).others).toHaveLength(1)
    expect((await compare([claimRow('hook', 'digitakt-ii/tables/4', 'ada')])).free).toHaveLength(1)
    expect((await compare([claimRow('hook', 'digitakt-ii/tables/5-6', 'ada')])).free).toHaveLength(1)
    expect((await compare([claimRow('hook', 'digitakt-ii/events/4-6', 'ada')])).free).toHaveLength(1)
    expect(board.branchVerdict(await compare([claimRow('hook', 'digitakt-ii/tables/4-6', 'ada')]), { requireClaims: true })).toEqual({ ok: true, lines: ['✓ hook digitakt-ii/tables/4-5: yours (claim digitakt-ii/tables/4-6).'] })
  })
  it('fails an unclaimed item only in a pull request run, and someone else\'s claim always', () => {
    const free = { mine: [], others: [], unknown: [], free: [{ kind: 'module', key: 'octatrack/drummap', why: 'new module' }] }
    expect(board.branchVerdict(free).ok).toBe(true)
    const required = board.branchVerdict(free, { requireClaims: true })
    expect(required.ok).toBe(false)
    expect(required.lines[0]).toMatch(/^✗ module octatrack\/drummap .*unclaimed.*npm run pr:ready/)
    expect(board.branchVerdict({ ...free, free: [], mine: free.free }, { requireClaims: true }).ok).toBe(true)
    expect(board.branchVerdict({ ...free, free: [], others: [{ ...free.free[0], claim: claimRow('module', 'octatrack/drummap', 'bo') }] }).ok).toBe(false)
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
    const line = (claims, login) => board.moduleClaimLine({ root, machine: 'octatrack', id: 'tape-echo', folder: 'sdk/octatrack/modules/tape-echo', claims, login })
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
    const machineFinding = thread({ kind: 'finding', topic: { kind: 'machine', key: 'octatrack' }, body: 'Machine note' })
    const moduleFinding = thread({ kind: 'finding', body: 'Exact module observation', pullRequest: 42 })
    const detail = board.moduleMessagesLine({ machine: 'octatrack', id: 'tape-echo', messages: [machineFinding, moduleFinding] }).detail
    expect(detail).toContain('module octatrack/tape-echo PR #42 «Exact module observation»')
    expect(detail).not.toContain('Machine note')
    const messages = [thread({}), thread({ kind: 'finding', to: null, topic: { kind: 'machine', key: 'octatrack' } }), thread({ kind: 'finding', to: null, topic: { kind: 'machine', key: 'digitakt' } }), thread({ topic: { kind: 'module', key: 'octatrack/other' } })]
    expect(board.moduleMessagesLine({ machine: 'octatrack', id: 'tape-echo', messages, login: 'Ada' })).toEqual({ state: 'info', name: 'board messages', detail: '1 open question on module octatrack/tape-echo (1 waiting for you), 1 finding on it or on octatrack · machine octatrack «Room for a chorus?»: npm run board -- messages --machine octatrack' })
    const answered = [thread({ replies: [{ id: crypto.randomUUID(), author: 'ada', body: 'Yes', createdAt: '2026-10-30T01:00:00.000Z' }] })]
    expect(board.moduleMessagesLine({ machine: 'octatrack', id: 'tape-echo', messages: answered, login: 'ada' }).detail).not.toContain('waiting')
    expect(board.moduleMessagesLine({ machine: 'digitone', id: 'swarm', messages, login: 'ada' })).toBeNull()
  })
  it('tells pr:ready what waits in the inbox, and stays quiet signed out or offline', async () => {
    const token = 'a'.repeat(64)
    expect(await board.inboxNotes({ token, fetch: async () => Response.json({ login: 'ada', waiting: [thread({})], replies: [thread({ author: 'ada', to: 'bo' }), thread({ author: 'ada', kind: 'finding' })] }) })).toEqual([expect.stringMatching(/^Board: 1 question waits for your answer and 2 of your questions and findings have a reply\. .*npm run board -- inbox/)])
    expect(await board.inboxNotes({ token, fetch: async () => Response.json({ login: 'ada', waiting: [], replies: [] }) })).toEqual([])
    const expiring = [{ kind: 'issue', key: '1620' }]
    expect(await board.inboxNotes({ token, fetch: async () => Response.json({ login: 'ada', waiting: [], replies: [], expiring }) })).toEqual(['You have 1 board claim expiring within three days. Run npm run board -- inbox to see which claims to review.'])
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
    // A wanted task names who took it and the pull request that ends it, and its text is quoted like any other.
    const wanted = board.describeThread(thread({ kind: 'wanted', topic: { kind: 'site', key: 'forum' }, to: 'cy', body: 'Show the module version on forum threads.', pullRequest: 1500 }))
    expect(wanted).toEqual([expect.stringMatching(/wanted +site forum +@bo taken by @cy {2}open until 2026-11-29 {2}ends with #1500$/), '    «Show the module version on forum threads.»'])
    expect(board.describeThread(thread({ kind: 'wanted', to: null, priority: 'high' }))[0]).toMatch(/open until 2026-11-29 {2}high priority$/)
  })
  it('sends take, link and a reply\'s pull request to the routes that hold them', async () => {
    const sent = [], fetch = async (url, init) => { sent.push([url.replace(/^.*\/api/, ''), init.method, JSON.parse(init.body ?? 'null')]); return Response.json({ message: {} }) }
    const id = crypto.randomUUID(), options = { token: 'a'.repeat(64), api: 'https://api.example.test/api', fetch }
    await board.messageAction(id, 'take', { pullRequest: 1500 }, options)
    await board.messageAction(id, 'link', { pullRequest: 1501 }, options)
    await board.messageAction(id, 'reply', { body: 'Sent as #1502.', pullRequest: 1502 }, options)
    expect(sent).toEqual([['/agent-board/messages/' + id + '/take', 'POST', { pullRequest: 1500 }], ['/agent-board/messages/' + id + '/fold', 'POST', { pullRequest: 1501 }], ['/agent-board/messages/' + id + '/replies', 'POST', { body: 'Sent as #1502.', pullRequest: 1502 }]])
    await board.messageAction(id, 'priority', { priority: 'high' }, options)
    expect(sent.at(-1)).toEqual(['/agent-board/messages/' + id + '/priority', 'POST', { priority: 'high' }])
    expect(board.MESSAGE_KINDS).toContain('wanted'); expect(board.TOPICS).toContain('site')
  })
})

it('requests weekly board activity only when a week count is supplied', async () => {
  const api = 'https://board.test/api', requested = []
  const fetch = async url => {
    requested.push(url)
    return Response.json(url.endsWith('?weeks=8') ? { weeks: [] } : { days: 30 })
  }
  expect(await board.activity({ api, fetch, weeks: 8 })).toEqual({ weeks: [] })
  expect(await board.activity({ api, fetch })).toEqual({ days: 30 })
  expect(requested).toEqual([api + '/agent-board/activity?weeks=8', api + '/agent-board/activity'])
})

describe('pr:ready and the board', () => {
  const needed = [{ kind: 'migration', key: '0084', why: 'new migration' }, { kind: 'hook', key: 'octatrack/37', why: 'new entry' }]
  const fake = ({ login = 'ada', claims = [], fail, refuseNotes } = {}) => {
    const taken = []
    return { taken, module: { ...board, neededClaims: () => needed, whoami: async () => { if (fail) throw new board.BoardUnavailable('down'); return login }, currentBranch: () => 'work',
      compareClaims: (items, name) => board.compareClaims(items, name, { fetch: async () => Response.json({ claims }) }),
      claim: async item => { taken.push(item); if (refuseNotes && item.note) throw new board.BoardError('Leave file paths out of the note.', 400); return { claim: item } } } }
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
  it('sends a module\'s summary as its claim note, keeps one written by hand, and claims without it when the note is refused', async () => {
    const withNote = [{ kind: 'module', key: 'octatrack/slicer', why: 'new module folder', note: 'Slices a loop.' }, { kind: 'module', key: 'octatrack/echo', why: 'new module folder', note: 'An echo.' }]
    const run = async options => { const { taken, module } = fake(options); await boardClaims('.', 'main', { ...module, neededClaims: () => withNote }); return taken }
    const handWritten = { ...claimRow('module', 'octatrack/echo', 'ada'), note: 'Tape echo with wow.' }
    expect(await run({ claims: [handWritten] })).toEqual([{ kind: 'module', key: 'octatrack/slicer', branch: 'work', note: 'Slices a loop.' }, { kind: 'module', key: 'octatrack/echo', branch: 'work' }])
    expect((await run({ refuseNotes: true })).map(item => item.key + (item.note ? ' + note' : ''))).toEqual(['octatrack/slicer + note', 'octatrack/slicer', 'octatrack/echo + note', 'octatrack/echo'])
  })
  it('renews a covering run whole instead of claiming only the part the branch adds', async () => {
    const { taken, module } = fake({ claims: [claimRow('hook', 'octatrack/36-38', 'ada')] })
    const result = await boardClaims('.', 'main', module)
    expect(taken.map(item => item.key)).toEqual(['0084', 'octatrack/36-38'])
    expect(result.notes).toContain('Board: claimed hook octatrack/36-38 for @ada.')
  })
  it('only notes an unreachable board', async () => {
    const result = await boardClaims('.', 'main', fake({ fail: true }).module)
    expect(readiness({ board: result })).toMatchObject({ ok: true, notes: expect.arrayContaining([expect.stringContaining('claims not checked')]) })
  })
})

describe('npm run board -- wait', () => {
  const thread = (replies, extra = {}) => ({ id: 't1', author: 'asker', replies: replies.map(([id, author]) => ({ id, author })), ...extra })
  const clock = () => { let t = 0; return { now: () => t, sleep: async ms => { t += ms } } }

  it('ends when someone else has the newest word, not on the waiting developer\'s own reply', async () => {
    const reads = [[thread([])], [thread([['r1', 'asker']])], [thread([['r1', 'asker'], ['r2', 'owner']])]]
    const changed = await board.waitForReply({ read: async () => reads.shift() ?? [], me: 'asker', ...clock() })
    expect(changed.map(item => item.replies.at(-1).id)).toEqual(['r2'])
  })

  it('ends on a thread new to the inbox or one that ended, and reads again after the board was briefly away', async () => {
    let n = 0
    const read = async () => {
      n++
      if (n === 2) throw new board.BoardUnavailable('deploying')
      return n < 3 ? [thread([])] : [thread([]), { id: 't2', author: 'reviewer', replies: [] }]
    }
    expect((await board.waitForReply({ read, me: 'asker', ...clock() })).map(item => item.id)).toEqual(['t2'])
    const ends = [[thread([['r1', 'asker']])], [thread([['r1', 'asker']], { endedAt: '2026-11-25T10:00:00Z' })]]
    expect((await board.waitForReply({ read: async () => ends.shift(), me: 'asker', ...clock() })).map(item => item.id)).toEqual(['t1'])
  })

  it('gives up at the deadline', async () => {
    const reads = []
    const result = await board.waitForReply({ read: async () => { reads.push(1); return [thread([])] }, me: 'asker', minutes: 3, ...clock() })
    expect(result).toBeNull()
    expect(reads.length).toBe(4)
  })
})
