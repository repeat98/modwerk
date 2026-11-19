// SPDX-License-Identifier: Elastic-2.0
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const { bot } = vi.hoisted(() => ({ bot: vi.fn() }))
vi.mock('./lib.mjs', () => ({
  ledger: () => bot, github: () => ({ api: async () => ({ workflow_runs: [] }) }),
  pages: async () => [], discord: () => null, readTarget: vi.fn(), readBoardTarget: vi.fn(),
  readDiscordTarget: vi.fn(), approveRun: vi.fn(), MARKER: '',
}))
let dir
beforeEach(() => {
  vi.resetModules()
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

it('saves the fingerprint of a successfully processed empty review', async () => {
  writeFileSync(join(dir, 'proposals.json'), '{"actions":[]}')
  await import('./act.mjs')
  expect(bot).toHaveBeenCalledWith('/state', 'PUT', { fingerprint: 'a'.repeat(64) })
})
