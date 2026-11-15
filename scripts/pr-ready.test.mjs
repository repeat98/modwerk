import { describe, expect, it } from 'vitest'
import { execFileSync, spawnSync } from 'node:child_process'
import { copyFileSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { MODULE_SCOPE_REQUIRED_FROM, baseEdits, gateEdits, moduleScopeProblems, pythonProblem, readiness } from './pr-ready.mjs'

describe('pr:ready verdict', () => {
  it('is ready only with a committed, current, regenerated branch whose checks pass', () => {
    expect(readiness({}).ok).toBe(true)
    for (const state of [{ dirty: ['a.ts'] }, { behind: true }, { regenerated: ['src/catalog/module-documents.json'] }, { checkPassed: false }]) expect(readiness(state).ok).toBe(false)
  })
  it('says the checks need Python 3.10+ instead of letting an older one crash inside them', () => {
    for (const version of ['3.10.0', '3.12.4', '3.14.0', '4.0.0']) expect(pythonProblem({ version })).toBeNull()
    const old = pythonProblem({ command: 'python3', version: '3.9.6' })
    expect(old).toContain('needs Python 3.10 or newer')
    expect(old).toContain('python3 is 3.9.6')
    expect(pythonProblem({ command: 'python', error: 'spawn python ENOENT' })).toContain('python did not run (spawn python ENOENT)')
    expect(pythonProblem({ version: null })).toContain('an unknown version')
    const verdict = readiness({ python: old })
    expect(verdict.ok).toBe(false)
    expect(verdict.problems[0]).toBe(old)
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
    expect(listed).toContain('npm run board -- finding')
    expect(asked).not.toContain('npm run board -- finding')
    expect(readiness({ guideEdits: ['docs/SDK.md'] }).ok).toBe(true)
  })
  it('refuses a module pull request that edits a check which judges modules, and lets a module release carry the rest', () => {
    // Track Mutes (#931) edited the compatibility gate to turn it green; its test still found every clash.
    expect(gateEdits(['sdk/octatrack/modules/track-mutes/manifest.py', 'scripts/module-compat.py', 'sdk/tests/test_module_compat.py'])).toEqual(['scripts/module-compat.py', 'sdk/tests/test_module_compat.py'])
    expect(gateEdits(['sdk/drafts/track-mutes/manifest.py', '.github/workflows/module-pr.yml'])).toEqual(['.github/workflows/module-pr.yml'])
    expect(gateEdits(['sdk/digitakt/modules/digiperform/build.json', 'scripts/modules.mjs', 'sdk/machines/octatrack/compatibility.json'])).toEqual(['scripts/modules.mjs', 'sdk/machines/octatrack/compatibility.json'])
    // Every machine the registry gives a module folder, the Zoom pedals' too.
    expect(gateEdits(['sdk/zoom/modules/loop/modwerk.module.json', 'scripts/machine-folders.mjs'])).toEqual(['scripts/machine-folders.mjs'])
    expect(gateEdits(['sdk/digitakt-ii/modules/track-names/build.json', 'scripts/change-scope.mjs'])).toEqual(['scripts/change-scope.mjs'])
    // What a module release legitimately carries (ARP KEY LOCKS, #954): the package builder's list, assets, the native comparison, test lists.
    expect(gateEdits(['sdk/octatrack/modules/arp-key-locks/manifest.py', 'scripts/build-module-packages.py', 'src/engine/assets/module-build.json', 'sdk/native-comparisons/arp-key-locks.json', 'scripts/module-release-scope.test.mjs', 'sdk/tests/test_arp_key_locks.py'])).toEqual([])
    // A Fix: pull request to the gate itself changes no module.
    expect(gateEdits(['scripts/module-compat.py', 'sdk/tests/test_module_compat.py'])).toEqual([])
    const verdict = readiness({ gateEdits: ['scripts/module-compat.py'] })
    expect(verdict.ok).toBe(false)
    expect(verdict.problems[0]).toContain('scripts/module-compat.py')
    expect(verdict.problems[0]).toContain('never change the check to pass it')
  })
  it('refuses a module pull request that also changes the base, and leaves a module its own recipe rows', () => {
    // Threshold Slices (#1285) added a shared sample-editor service and a hook beside its draft.
    const threshold = ['sdk/drafts/threshold-slices/README.md', 'sdk/machines/octatrack/events.json', 'sdk/machines/octatrack/include/modwerk_events.h', 'sdk/machines/octatrack/module-adapters/sample_editor_service.c']
    expect(baseEdits(threshold)).toEqual(threshold.slice(1))
    expect(baseEdits(['sdk/octatrack/modules/syntiz/manifest.py', 'src/engine/assets/octatrack-base.elemod', 'src/engine/assets/octatrack-base-sources.json'])).toHaveLength(2)
    // What module releases carried in October and November: package rows, their own recipe rows and runtime helpers.
    expect(baseEdits(['sdk/octatrack/modules/scale-quantizer/manifest.py', 'sdk/machines/octatrack/module-adapters/machine-recipes.json', 'sdk/machines/octatrack/module-adapters/quantizer_runtime.py', 'src/engine/assets/octatrack-module-packages.json'])).toEqual([])
    // A base pull request changes no module folder.
    expect(baseEdits(threshold.slice(1))).toEqual([])
    const verdict = readiness({ baseEdits: threshold.slice(1) })
    expect(verdict.ok).toBe(false)
    expect(verdict.problems[0]).toContain('its own owner-reviewed pull request')
  })
  it('refuses both in CI for a contributor\'s module pull request opened from the start day, never the owner\'s', () => {
    const files = ['sdk/drafts/threshold-slices/README.md', 'sdk/machines/octatrack/events.json', 'scripts/modules.mjs']
    const contributor = { author: 'someone', owner: 'repeat98', openedAt: MODULE_SCOPE_REQUIRED_FROM + 'T10:00:00Z' }
    expect(moduleScopeProblems(files, contributor)).toHaveLength(2)
    expect(moduleScopeProblems(files, { ...contributor, author: 'Repeat98' })).toEqual([])
    expect(moduleScopeProblems(files, { ...contributor, openedAt: '2026-11-07T10:00:00Z' })).toEqual([])
    expect(moduleScopeProblems(files, { ...contributor, author: null })).toEqual([])
    expect(moduleScopeProblems(['sdk/drafts/threshold-slices/README.md'], contributor)).toEqual([])
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
      // Its module folders come from the machine registry, as in every checkout.
      copyFileSync(new URL('./machine-folders.mjs', import.meta.url), join(checkout, 'scripts', 'machine-folders.mjs'))
      mkdirSync(join(checkout, 'src', 'devices'), { recursive: true })
      copyFileSync(new URL('../src/devices/machines.generated.json', import.meta.url), join(checkout, 'src', 'devices', 'machines.generated.json'))
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
