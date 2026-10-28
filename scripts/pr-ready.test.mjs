import { describe, expect, it } from 'vitest'
import { execFileSync, spawnSync } from 'node:child_process'
import { copyFileSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { gateEdits, readiness } from './pr-ready.mjs'

describe('pr:ready verdict', () => {
  it('is ready only with a committed, current, regenerated branch whose checks pass', () => {
    expect(readiness({}).ok).toBe(true)
    for (const state of [{ dirty: ['a.ts'] }, { behind: true }, { regenerated: ['src/catalog/module-documents.json'] }, { checkPassed: false }]) expect(readiness(state).ok).toBe(false)
  })
  it('says how to bring a stale branch up to date from the remote that holds main', () => {
    expect(readiness({ behind: true, remote: 'upstream' }).problems[0]).toContain('git merge upstream/main')
  })
  it('names the generated files to commit', () => {
    expect(readiness({ regenerated: ['src/catalog/module-documents.json'] }).problems[0]).toContain('src/catalog/module-documents.json')
  })
  it('tells an author whether the bot can merge the update, and why not', () => {
    expect(readiness({ author: 'octo', scope: { modules: ['digieq'] } }).notes[0]).toContain('Automatic merge')
    const refused = readiness({ author: 'octo', scope: { error: 'Licence text changes require owner review.' } })
    expect(refused.ok).toBe(false)
    expect(refused.problems[0]).toContain('Licence text changes require owner review.')
  })
  it('tells everyone else that the owner merges once CI is green, and to rerun when main moves', () => {
    const { notes } = readiness({})
    expect(notes[0]).toContain('owner reviews it and merges it with one click')
    expect(notes.at(-1)).toContain('If main moves before the merge, run this again')
  })
  it('asks what the guides lacked, listing the guide edits on the branch', () => {
    const asked = readiness({}).notes.find(note => note.startsWith('What did the guides lack'))
    expect(asked).toContain('write "nothing" in the PR')
    const listed = readiness({ guideEdits: ['docs/module-guides/effects.md'] }).notes.find(note => note.startsWith('What did the guides lack'))
    expect(listed).toContain('docs/module-guides/effects.md')
    expect(readiness({ guideEdits: ['docs/SDK.md'] }).ok).toBe(true)
  })
  it('refuses a module pull request that edits a check which judges modules, and lets a module release carry the rest', () => {
    // Track Mutes (#931) edited the compatibility gate to turn it green; its test still found every clash.
    expect(gateEdits(['sdk/octabam/modules/track-mutes/manifest.py', 'scripts/module-compat.py', 'sdk/tests/test_module_compat.py'])).toEqual(['scripts/module-compat.py', 'sdk/tests/test_module_compat.py'])
    expect(gateEdits(['sdk/drafts/track-mutes/manifest.py', '.github/workflows/module-pr.yml'])).toEqual(['.github/workflows/module-pr.yml'])
    expect(gateEdits(['sdk/digitakt/modules/digiperform/build.json', 'scripts/modules.mjs', 'sdk/machines/octatrack/compatibility.json'])).toEqual(['scripts/modules.mjs', 'sdk/machines/octatrack/compatibility.json'])
    // What a module release legitimately carries (ARP KEY LOCKS, #954): the package builder's list, assets, the native comparison, test lists.
    expect(gateEdits(['sdk/octabam/modules/arp-key-locks/manifest.py', 'scripts/build-module-packages.py', 'src/engine/assets/module-build.json', 'sdk/native-comparisons/arp-key-locks.json', 'scripts/module-release-scope.test.mjs', 'sdk/tests/test_arp_key_locks.py'])).toEqual([])
    // A Fix: pull request to the gate itself changes no module.
    expect(gateEdits(['scripts/module-compat.py', 'sdk/tests/test_module_compat.py'])).toEqual([])
    const verdict = readiness({ gateEdits: ['scripts/module-compat.py'] })
    expect(verdict.ok).toBe(false)
    expect(verdict.problems[0]).toContain('scripts/module-compat.py')
    expect(verdict.problems[0]).toContain('never change the check to pass it')
  })
  it('says which packages CI rebuilds and how to reproduce them before the push', () => {
    expect(readiness({ compiled: { octatrack: true, elemod: false } }).notes.some(note => note.includes('build-modules-isolated.sh'))).toBe(true)
    expect(readiness({ compiled: { octatrack: false, elemod: true } }).notes.some(note => note.includes('verify-elemod-release-exports.mjs'))).toBe(true)
    expect(readiness({ compiled: { octatrack: false, elemod: false } }).notes.some(note => note.includes('isolated'))).toBe(false)
    expect(readiness({ compiled: { octatrack: true, elemod: true } }).ok).toBe(true)
  })
  it('refreshes a narrow clone’s main tracking ref so the suggested merge uses current main', () => {
    const directory = realpathSync(mkdtempSync(join(tmpdir(), 'modwerk-ready-fetch-')))
    const env = { ...process.env, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: join(directory, 'no-global-config') }
    const git = (cwd, ...args) => execFileSync('git', ['-c', 'user.name=Readiness test',
      '-c', 'user.email=readiness@example.invalid', '-c', 'commit.gpgsign=false', ...args],
    { cwd, env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
    try {
      const remote = join(directory, 'remote.git'), seed = join(directory, 'seed'), checkout = join(directory, 'checkout')
      git(directory, 'init', '--bare', '--initial-branch=main', remote)
      git(directory, 'init', '--initial-branch=main', seed)
      writeFileSync(join(seed, 'README'), 'baseline\n')
      git(seed, 'add', 'README'); git(seed, 'commit', '-m', 'Baseline')
      const initial = git(seed, 'rev-parse', 'HEAD')
      git(seed, 'branch', 'topic'); git(seed, 'remote', 'add', 'origin', remote)
      git(seed, 'push', 'origin', 'main', 'topic')
      git(directory, 'clone', '--single-branch', '--branch', 'topic', remote, checkout)
      git(checkout, 'update-ref', 'refs/remotes/origin/main', initial)
      writeFileSync(join(seed, 'README'), 'new main\n')
      git(seed, 'commit', '-am', 'Advance main'); git(seed, 'push', 'origin', 'main')
      const current = git(seed, 'rev-parse', 'HEAD')
      mkdirSync(join(checkout, 'scripts'))
      const script = join(checkout, 'scripts', 'pr-ready.mjs')
      copyFileSync(new URL('./pr-ready.mjs', import.meta.url), script)
      // A stale branch must stop before any generator/check invocation.
      const result = spawnSync(process.execPath, [script, '--remote', 'origin'], { cwd: checkout,
        env: { ...env, npm_execpath: join(directory, 'never-run-npm.mjs') }, encoding: 'utf8' })
      expect(result.status, result.stderr).toBe(1)
      expect(result.stdout).toContain('git merge origin/main')
      expect(result.stdout).toContain('Not ready yet.')
      expect(git(checkout, 'rev-parse', 'origin/main')).toBe(current)
      git(checkout, 'merge', '--ff-only', 'origin/main')
      expect(git(checkout, 'rev-parse', 'HEAD')).toBe(current)
    } finally { rmSync(directory, { recursive: true, force: true }) }
  }, 20_000)
})
