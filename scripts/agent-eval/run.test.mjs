import { afterEach, expect, it } from 'vitest'
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { localReplay } from './run.mjs'

const folders = []
afterEach(() => { for (const dir of folders.splice(0)) rmSync(dir, { recursive: true, force: true }) })

it('assigns before scoring, keeps a failed first attempt and assigns again for a new tree', () => {
  const directory = mkdtempSync(join(tmpdir(), 'modwerk-eval-test-'))
  folders.push(directory)
  const snapshot = (item, work) => {
    mkdirSync(join(work, 'scripts'), { recursive: true })
    writeFileSync(join(work, item.files[0]), 'process.exitCode = 1')
  }
  const replay = (tree, label) => localReplay(tree, 'origin', label, { directory, snapshot })
  const tree = '0'.repeat(40)
  expect(replay(tree, 'stale model label')).toBe(false)
  expect(replay(tree)).toBe(false)
  expect(replay(tree, 'fixture agent')).toBe(true)
  const [suite] = readdirSync(join(directory, tree))
  const file = join(directory, tree, suite, 'result.json')
  const first = readFileSync(file, 'utf8')
  expect(JSON.parse(first)).toMatchObject({ agent: 'fixture agent', case: 'board-holder', suite, tree, passed: false })
  expect(replay(tree, 'another attempt')).toBe(true)
  expect(readFileSync(file, 'utf8')).toBe(first)
  expect(replay(tree.slice(1) + '1', 'fixture agent')).toBe(false)
})
