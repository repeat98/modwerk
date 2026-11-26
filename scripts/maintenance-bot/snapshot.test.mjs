// SPDX-License-Identifier: Elastic-2.0
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const { bot, chat } = vi.hoisted(() => ({ bot: vi.fn(), chat: vi.fn() }))
const pull = { number: 5, title: 'Tape Echo 0.4', user: { login: 'alice' }, author_association: 'CONTRIBUTOR', draft: false, head: { sha: 'a1' }, labels: [], updated_at: '2026-11-26T10:00:00Z' }
const issue = { number: 9, title: 'Keep fails', user: { login: 'bob' }, labels: [], comments: 1, updated_at: '2026-11-26T10:00:00Z' }
vi.mock('./lib.mjs', () => ({
  ledger: () => bot, discord: () => chat, boardGet: async () => ({ messages: [], claims: [] }), checkSummary: async () => 'green',
  github: () => ({ api: async () => ({ workflow_runs: [] }) }), pages: async (_api, path) => path.startsWith('/pulls') ? [pull] : [issue],
}))
let dir, saved
const world = items => async (path, method, body) => {
  if (path === '/state' && method === 'PUT') { saved = body; return {} }
  if (path === '/state') return { paused: false, items }
  if (path === '/forum') return { threads: [], shouts: [] }
  return path === '/todos' ? { todos: [] } : { actions: [] }
}
const read = name => JSON.parse(readFileSync(join(dir, name), 'utf8'))
beforeEach(() => {
  vi.resetModules(); saved = undefined
  dir = mkdtempSync(join(tmpdir(), 'modwerk-snapshot-'))
  vi.stubEnv('BOT_DIR', dir); vi.stubEnv('BOT_MODE', 'pass'); vi.stubEnv('DISCORD_GUILD_ID', '1'.repeat(18)); vi.stubEnv('GITHUB_OUTPUT', join(dir, 'output'))
  chat.mockReset().mockRejectedValue(new Error('Discord GET /guilds/' + '1'.repeat(18) + '/channels HTTP 401'))
})
afterEach(() => { vi.unstubAllEnvs(); rmSync(dir, { recursive: true, force: true }) })

it('records what is open on its first pass and starts no model', async () => {
  bot.mockReset().mockImplementation(world(''))
  await import('./snapshot.mjs')
  expect(Object.keys(JSON.parse(saved.items)).sort()).toEqual(['i9', 'p5', 's'])
  expect(existsSync(join(dir, 'hard.json'))).toBe(false)
  expect(existsSync(join(dir, 'light.json'))).toBe(false)
})

it('still reviews pull requests and issues when Discord refuses the sign-in, each in its own lane', async () => {
  bot.mockReset().mockImplementation(world('{"p5":"old","i9":"old","d77":"kept"}'))
  await import('./snapshot.mjs')
  expect(read('hard.json')).toMatchObject({ lane: 'hard', down: ['Discord'], work: { pullRequests: [5] }, prs: [{ number: 5, head: 'a1', checks: 'green' }] })
  expect(read('light.json')).toMatchObject({ lane: 'light', work: { issues: [9], discord: [] }, prs: [{ number: 5, title: 'Tape Echo 0.4' }] })
  expect(read('light.json').prs[0].head).toBeUndefined()
  // The room Discord could not list keeps its signature, so its messages are still new when Discord is back.
  expect(read('proposals.json')).toMatchObject({ actions: [], items: { d77: 'kept' } })
  expect(saved).toBeUndefined()
  // The workflow fetches the source of exactly these pull requests for the hard lane.
  expect(readFileSync(join(dir, 'output'), 'utf8')).toMatch(/^run=true\n.*\ndown=Discord\nhard=5\n$/s)
})
