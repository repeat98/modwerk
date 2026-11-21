import { afterEach, expect, it } from 'vitest'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { localReplay } from './run.mjs'

const folders = []
afterEach(() => { for (const dir of folders.splice(0)) rmSync(dir, { recursive: true, force: true }) })

const snapshot = (item, work) => {
  mkdirSync(join(work, 'scripts'), { recursive: true })
  writeFileSync(join(work, item.files[0]), 'process.exitCode = 1')
}
const folder = () => { const directory = mkdtempSync(join(tmpdir(), 'modwerk-eval-test-')); folders.push(directory); return directory }
// The case comes from the tree's first eight hex digits, modulo the three cases: board-holder, diagnostic-summary, bold-guides.
const BOARD = '0'.repeat(40), BOARD_AGAIN = '00000003'.padEnd(40, '0'), DIAGNOSTIC = '00000001'.padEnd(40, '0')

it('assigns before scoring, keeps a failed first attempt and reuses it for a new tree with the same case', () => {
  const directory = folder()
  const replay = (tree, label) => localReplay(tree, 'origin', label, { directory, snapshot, elsewhere: () => [] })
  const tree = BOARD
  expect(replay(tree, 'stale model label')).toBe(false)
  expect(replay(tree)).toBe(false)
  expect(replay(tree, 'fixture agent')).toBe(true)
  const [suite] = readdirSync(join(directory, tree))
  const file = join(directory, tree, suite, 'result.json')
  const first = readFileSync(file, 'utf8')
  expect(JSON.parse(first)).toMatchObject({ agent: 'fixture agent', case: 'board-holder', suite, tree, passed: false })
  expect(replay(tree, 'another attempt')).toBe(true)
  expect(readFileSync(file, 'utf8')).toBe(first)
  // A new tree with the same case on the same suite keeps that score and is not assigned again, with or without a label.
  expect(replay(BOARD_AGAIN)).toBe(true)
  expect(readdirSync(directory)).toEqual([tree])
  // A new tree with another case is still a fresh assignment.
  expect(replay(DIAGNOSTIC, 'fixture agent')).toBe(false)
  expect(readdirSync(join(directory, DIAGNOSTIC, suite))).toEqual(['work'])
})

it('reuses a score another worktree of this checkout holds for the case, and only on the same suite', () => {
  const here = folder(), other = folder()
  const replay = (directory, tree, label, elsewhere = []) => localReplay(tree, 'origin', label, { directory, snapshot, elsewhere: () => elsewhere })
  expect(replay(other, BOARD)).toBe(false)
  expect(replay(other, BOARD, 'fixture agent')).toBe(true)
  const [suite] = readdirSync(join(other, BOARD))
  expect(replay(here, BOARD_AGAIN, undefined, [other])).toBe(true)
  expect(existsSync(join(here, BOARD_AGAIN))).toBe(false)
  // A score under another suite is another snapshot of the task: not reused.
  renameSync(join(other, BOARD, suite), join(other, BOARD, 'f'.repeat(64)))
  expect(replay(here, BOARD_AGAIN, undefined, [other])).toBe(false)
  expect(existsSync(join(here, BOARD_AGAIN, suite, 'work'))).toBe(true)
})
