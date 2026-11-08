import { afterEach, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { evidenceOnBaseProblem } from './module-qualification.mjs'

const roots = []
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }) })

it('refuses a new module whose tested commit is already on main, and judges no other commit', () => {
  const root = mkdtempSync(join(tmpdir(), 'evidence-')); roots.push(root)
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim()
  const manifest = (path, evidenceRevision) => { mkdirSync(dirname(join(root, path)), { recursive: true }); writeFileSync(join(root, path), JSON.stringify({ tests: { evidenceRevision } })) }
  git('init', '-q', '-b', 'main'); git('config', 'user.email', 'a@b.c'); git('config', 'user.name', 'a')
  manifest('sdk/octabam/modules/euclid/octamod.module.json', '0'.repeat(40)); git('add', '.'); git('commit', '-qm', 'main')
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
  manifest('sdk/octabam/modules/euclid/octamod.module.json', main)
  expect(evidenceOnBaseProblem({ root, base: main })).toBe(null)
})
