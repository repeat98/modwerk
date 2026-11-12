import { afterEach, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { evidenceOnBaseProblem, testingVersionProblem } from './module-qualification.mjs'

const roots = []
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }) })

it('refuses a new module whose tested commit is already on main, and judges no other commit', () => {
  const root = mkdtempSync(join(tmpdir(), 'evidence-')); roots.push(root)
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim()
  const manifest = (path, evidenceRevision) => { mkdirSync(dirname(join(root, path)), { recursive: true }); writeFileSync(join(root, path), JSON.stringify({ tests: { evidenceRevision } })) }
  git('init', '-q', '-b', 'main'); git('config', 'user.email', 'a@b.c'); git('config', 'user.name', 'a')
  manifest('sdk/octatrack/modules/euclid/octamod.module.json', '0'.repeat(40)); git('add', '.'); git('commit', '-qm', 'main')
  const main = git('rev-parse', 'HEAD')
  git('checkout', '-qb', 'work')
  // DATAMATIC (#1103): a draft whose tested commit is main's.
  manifest('sdk/drafts/datamatic/octamod.module.json', main)
  expect(evidenceOnBaseProblem({ root, base: main })).toMatch(/^sdk\/drafts\/datamatic\/octamod\.module\.json: tests\.evidenceRevision names .*already on main/)
  git('add', '.'); git('commit', '-qm', 'draft')
  manifest('sdk/drafts/datamatic/octamod.module.json', git('rev-parse', 'HEAD'))
  expect(evidenceOnBaseProblem({ root, base: main })).toBe(null)
  // A commit from the author's own repository, and a listed module's update, are not judged.
  manifest('sdk/drafts/datamatic/octamod.module.json', 'f'.repeat(40))
  manifest('sdk/octatrack/modules/euclid/octamod.module.json', main)
  expect(evidenceOnBaseProblem({ root, base: main })).toBe(null)
})

it('asks a new version\'s TESTING.md to name it, and leaves an unchanged version alone', () => {
  const root = mkdtempSync(join(tmpdir(), 'testing-')); roots.push(root)
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim()
  const write = (path, text) => { mkdirSync(dirname(join(root, path)), { recursive: true }); writeFileSync(join(root, path), text) }
  const folder = 'sdk/analog-rytm-mkii/modules/qperf/'
  git('init', '-q', '-b', 'main'); git('config', 'user.email', 'a@b.c'); git('config', 'user.name', 'a')
  write(folder + 'modwerk.module.json', JSON.stringify({ version: '0.1.0-experimental' })); write(folder + 'TESTING.md', 'QT08 on 0.1.0: passed.')
  git('add', '.'); git('commit', '-qm', 'main')
  const main = git('rev-parse', 'HEAD')
  write(folder + 'README.md', 'docs only')
  expect(testingVersionProblem({ root, base: main })).toBe(null)
  write(folder + 'modwerk.module.json', JSON.stringify({ version: '0.2.0-experimental' }))
  expect(testingVersionProblem({ root, base: main })).toMatch(/^sdk\/analog-rytm-mkii\/modules\/qperf\/TESTING\.md does not name 0\.2\.0-experimental/)
  write(folder + 'TESTING.md', 'QL19 on 0.2.0: not tested on a unit yet.')
  expect(testingVersionProblem({ root, base: main })).toBe(null)
  // 0.2.0 is not 0.2.01 or 10.2.0.
  write(folder + 'TESTING.md', 'Ran 10.2.0 and 0.2.01.')
  expect(testingVersionProblem({ root, base: main })).toMatch(/does not name/)
})
