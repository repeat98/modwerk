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
