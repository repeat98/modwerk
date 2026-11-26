// SPDX-License-Identifier: Elastic-2.0
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const { bot, boardGet } = vi.hoisted(() => ({ bot: vi.fn(), boardGet: vi.fn() }))
vi.mock('./lib.mjs', () => ({
  boardGet, ledger: () => bot, github: () => ({ api: async () => ({ workflow_runs: [] }) }),
  pages: async () => [], discord: () => null, readTarget: vi.fn(), readBoardTarget: vi.fn(),
  readDiscordTarget: vi.fn(), approveRun: vi.fn(), MARKER: '',
}))
let dir
beforeEach(() => {
  vi.resetModules()
  boardGet.mockReset().mockResolvedValue({ followups: [] })
  dir = mkdtempSync(join(tmpdir(), 'modwerk-review-'))
  vi.stubEnv('BOT_DIR', dir)
  vi.stubEnv('BOT_FINGERPRINT', 'a'.repeat(64))
  vi.stubEnv('BOT_MODE', 'pass')
  bot.mockReset().mockImplementation(async path => {
    if (path === '/eval-pilot') return { records: [] }
    if (path === '/todos') return { todos: [] }
    if (path === '/actions/due') return { actions: [] }
    return {}
  })
})
afterEach(() => { vi.unstubAllEnvs(); rmSync(dir, { recursive: true, force: true }) })

it.each(['{', 'null', '{"actions":{}}'])('retries an unreadable review and still checks due actions', async contents => {
  writeFileSync(join(dir, 'proposals.json'), contents)
  await expect(import('./act.mjs')).rejects.toThrow(/review/i)
  expect(bot).toHaveBeenCalledWith('/actions/due')
  expect(bot).not.toHaveBeenCalledWith('/state', 'PUT', expect.anything())
})

it('prepares the same private draft on repeated passes and retires it when answered', async () => {
  writeFileSync(join(dir, 'proposals.json'), '{"actions":[]}')
  const id = 'd32680ab-87f2-447b-aeb9-972979702cea'
  boardGet.mockResolvedValue({ followups: [{ id, to: 'ada', target: 'issues/1619', since: '2026-11-20' }] })
  let todos = []
  bot.mockImplementation(async (path, method, body) => {
    if (path === '/eval-pilot') return { records: [] }
    if (path === '/todos' && method === 'POST') todos = body.todos
    if (path === '/todos') return { todos }
    if (path === '/actions/due') return { actions: [] }
    return {}
  })
  await import('./act.mjs')
  const [draft] = todos
  expect(draft.command).toBe('npm run board -- followups ' + id)
  vi.resetModules()
  await import('./act.mjs')
  expect(todos).toEqual([draft])
  boardGet.mockResolvedValue({ followups: [] })
  vi.resetModules()
  await import('./act.mjs')
  expect(bot).toHaveBeenCalledWith('/todos/' + draft.id + '/status', 'POST', { status: 'dropped' })
})

it('saves the fingerprint of a successfully processed empty review', async () => {
  writeFileSync(join(dir, 'proposals.json'), '{"actions":[]}')
  await import('./act.mjs')
  expect(bot).toHaveBeenCalledWith('/state', 'PUT', { fingerprint: 'a'.repeat(64) })
})

it('holds back a merge from the light lane, drops a waiting ask that closed, and saves what the pass saw', async () => {
  writeFileSync(join(dir, 'proposals.json'), JSON.stringify({ actions: [{ kind: 'merge', number: 5, head: 'a1', summary: 'Merge', lane: 'light' }], items: { p5: 'abc' } }))
  const waitingAsk = { id: 'a'.repeat(16), status: 'pending', target: 7, payload: { kind: 'merge', pin: { head: 'h1' } } }
  bot.mockImplementation(async path => path === '/actions/recent?hours=1' ? { actions: [waitingAsk] } : path === '/todos' ? { todos: [] } : path === '/actions/due' ? { actions: [] } : {})
  await import('./act.mjs')
  expect(bot).not.toHaveBeenCalledWith('/actions', 'POST', expect.anything())
  // The mocked GitHub knows no open #7.
  expect(bot).toHaveBeenCalledWith('/actions/' + waitingAsk.id + '/expire', 'POST', { result: 'it was closed in the meantime' })
  expect(bot).toHaveBeenCalledWith('/state', 'PUT', { fingerprint: 'a'.repeat(64), items: '{"p5":"abc"}' })
})

it('tells the owner at once when a source is down, and retires the to-do when it is back', async () => {
  writeFileSync(join(dir, 'proposals.json'), '{"actions":[]}')
  let todos = []
  bot.mockImplementation(async (path, method, body) => {
    if (path === '/todos' && method === 'POST') todos = body.todos
    return path === '/todos' ? { todos } : path === '/actions/due' ? { actions: [] } : {}
  })
  vi.stubEnv('BOT_DOWN', 'Discord')
  await import('./act.mjs')
  expect(todos).toMatchObject([{ urgent: true, note: 'Maintenance bot: Discord could not be read; the rest of the pass ran' }])
  const [alert] = todos
  vi.stubEnv('BOT_DOWN', '')
  vi.resetModules()
  await import('./act.mjs')
  expect(bot).toHaveBeenCalledWith('/todos/' + alert.id + '/status', 'POST', { status: 'dropped' })
})

it('adds what each lane read to this week’s count, beside last week’s', async () => {
  writeFileSync(join(dir, 'proposals.json'), JSON.stringify({ actions: [], usage: { hard: { tokens: 400, out: 9 }, light: { tokens: 100, out: 1 } } }))
  let usage = JSON.stringify({ week: '2000-01-03', hard: { runs: 2, tokens: 50, out: 5 } })
  bot.mockImplementation(async (path, method, body) => {
    if (path === '/state' && method === 'PUT' && body.usage) usage = body.usage
    return path === '/state' ? { usage } : path === '/todos' ? { todos: [] } : path === '/actions/due' ? { actions: [] } : {}
  })
  await import('./act.mjs')
  const first = JSON.parse(usage)
  expect(first).toMatchObject({ hard: { runs: 1, tokens: 400, out: 9 }, light: { runs: 1, tokens: 100, out: 1 }, last: { hard: { runs: 2, tokens: 50, out: 5 } } })
  vi.resetModules()
  await import('./act.mjs')
  expect(JSON.parse(usage)).toMatchObject({ week: first.week, hard: { runs: 2, tokens: 800 }, last: { hard: { runs: 2 } } })
})
