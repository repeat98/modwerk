import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { installMatches, resetProblem } from './lane.mjs'

const lane = fileURLToPath(new URL('./lane.mjs', import.meta.url))
const git = (cwd, ...args) => execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.com', ...args], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })

describe('lanes', () => {
  const lock = { packages: { '': { name: 'modwerk' }, 'node_modules/a': { version: '1.0.0' }, 'node_modules/@esbuild/darwin-arm64': { version: '0.25.0', optional: true } } }

  it('borrows an install only when it is the install of the same lock file', () => {
    expect(installMatches(lock, { packages: { 'node_modules/a': { version: '1.0.0' } } })).toBe(true)
    expect(installMatches(lock, { packages: { 'node_modules/a': { version: '1.0.1' } } })).toBe(false)
    expect(installMatches(lock, { packages: {} })).toBe(false)
    expect(installMatches(lock, { packages: { 'node_modules/a': { version: '1.0.0' }, 'node_modules/b': { version: '2.0.0' } } })).toBe(false)
    expect(installMatches(lock, null)).toBe(false)
  })

  it('never resets a worktree with uncommitted or unpushed work', () => {
    expect(resetProblem({ dirty: false, unpushed: 0 })).toBe(null)
    expect(resetProblem({ dirty: true, unpushed: 0 })).toMatch(/uncommitted/)
    expect(resetProblem({ dirty: false, unpushed: 2 })).toMatch(/2 commit\(s\) that are on no remote/)
  })

  it('prunes only clean worktrees whose commits are on a remote, and only with --yes', () => {
    const top = mkdtempSync(join(tmpdir(), 'lanes-')), remote = join(top, 'remote.git'), clone = join(top, 'clone')
    git(top, 'init', '--quiet', '--bare', '-b', 'main', remote)
    git(top, 'clone', '--quiet', remote, clone)
    writeFileSync(join(clone, 'a'), '1'); git(clone, 'add', 'a'); git(clone, 'commit', '--quiet', '-m', 'one'); git(clone, 'push', '--quiet', 'origin', 'main')
    const at = name => join(clone, '.claude', 'worktrees', name)
    for (const name of ['pushed', 'dirty', 'local']) git(clone, 'worktree', 'add', '--quiet', '--detach', at(name), 'origin/main')
    writeFileSync(join(at('dirty'), 'b'), 'uncommitted')
    writeFileSync(join(at('local'), 'a'), '2'); git(at('local'), 'commit', '--quiet', '-am', 'local only')
    const run = (...args) => spawnSync(process.execPath, [lane, ...args], { cwd: clone, encoding: 'utf8' }).stdout
    const listed = run('prune')
    expect(listed).toMatch(/remove {2}.*pushed/)
    expect(listed).toMatch(/keep .*dirty \(it has uncommitted changes/)
    expect(listed).toMatch(/keep .*local \(it has 1 commit\(s\) that are on no remote/)
    expect(existsSync(at('pushed'))).toBe(true)
    run('prune', '--yes')
    expect(existsSync(at('pushed'))).toBe(false)
    expect(existsSync(at('dirty')) && existsSync(at('local'))).toBe(true)
  })
})
