import { describe, expect, it } from 'vitest'
import { execFileSync, spawnSync } from 'node:child_process'
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { MODULE_SCOPE_REQUIRED_FROM, baseEdits, checkAndCommit, gateEdits, mergeMain, moduleScopeProblems, pythonProblem, readiness } from './pr-ready.mjs'

describe('pr:ready verdict', () => {
  it('merges a clean main itself and leaves a conflicting one untouched, naming its files', () => {
    const root = mkdtempSync(join(tmpdir(), 'modwerk-merge-main-'))
    const git = (...args) => execFileSync('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', '-c', 'commit.gpgsign=false',
      '-c', 'core.hooksPath=' + join(root, '.git', 'unused-hooks'), ...args], { cwd: root, stdio: 'pipe', encoding: 'utf8' }).trimEnd()
    const commit = (file, text) => { writeFileSync(join(root, file), text); git('add', file); git('commit', '-q', '-m', file) }
    try {
      git('init', '-q', '--initial-branch=main'); commit('shared', 'base\n')
      git('switch', '-q', '-c', 'topic'); commit('mine', 'topic\n')
      git('switch', '-q', 'main'); commit('theirs', 'main\n'); git('switch', '-q', 'topic')
      expect(mergeMain(git, 'main')).toEqual({ merged: true, conflicts: [] })
      expect(() => git('merge-base', '--is-ancestor', 'main', 'HEAD')).not.toThrow()
      git('switch', '-q', 'main'); commit('shared', 'main side\n'); git('switch', '-q', 'topic'); commit('shared', 'topic side\n')
      const before = git('rev-parse', 'HEAD')
      expect(mergeMain(git, 'main')).toEqual({ merged: false, conflicts: ['shared'] })
      expect(git('rev-parse', 'HEAD')).toBe(before)
      expect(git('status', '--porcelain')).toBe('')
      expect(readiness({ behind: true, conflicts: ['shared'], remote: 'origin' }).problems).toEqual([expect.stringMatching(/^Merging current main conflicts in shared\. Run git merge origin\/main/)])
    } finally { rmSync(root, { recursive: true, force: true }) }
  })

  it('commits only a fully staged tree that passed one full check', () => {
    const root = mkdtempSync(join(tmpdir(), 'modwerk-checked-commit-')), file = join(root, 'feature')
    const git = (...args) => execFileSync('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.invalid',
      '-c', 'commit.gpgsign=false', '-c', 'core.hooksPath=' + join(root, '.git', 'unused-hooks'), ...args],
    { cwd: root, stdio: 'pipe', encoding: 'utf8' }).trimEnd()
    try {
      git('init', '--initial-branch=main'); git('commit', '--allow-empty', '-m', 'base')
      expect(() => checkAndCommit(root, git, 'topic', () => true)).toThrow(/topic branch/)
      git('switch', '-c', 'topic')
      const parent = git('rev-parse', 'HEAD')
      writeFileSync(file, 'new')
      const unexpected = () => { throw new Error('ran the full check unexpectedly') }
      expect(() => checkAndCommit(root, git, 'topic', unexpected)).toThrow(/fully staged/)
      git('add', 'feature')
      expect(checkAndCommit(root, git, 'topic', () => false)).toBe(false)
      expect(() => checkAndCommit(root, git, 'topic', () => { writeFileSync(file, 'edited'); return true })).toThrow(/fully staged/)
      git('add', 'feature')
      expect(() => checkAndCommit(root, git, 'topic', () => { writeFileSync(file, 'restaged'); git('add', 'feature'); return true })).toThrow(/changed during/)
      expect(git('rev-parse', 'HEAD')).toBe(parent)
      const tree = git('write-tree')
      let checks = 0
      expect(checkAndCommit(root, git, 'finish topic', () => { checks++; return true })).toBe(true)
      expect(checks).toBe(1)
      expect(git('show', '-s', '--format=%T %P %s', 'HEAD')).toBe(tree + ' ' + parent + ' finish topic')
      expect(git('status', '--porcelain')).toBe('')
      writeFileSync(file, 'next'); git('add', 'feature')
      const gitWithHook = (...args) => {
        if (args[0] === 'commit') { writeFileSync(file, 'changed by hook'); git('add', 'feature') }
        return git(...args)
      }
      expect(() => checkAndCommit(root, gitWithHook, 'with hook', () => true)).toThrow(/resulting commit differs/)
    } finally { rmSync(root, { recursive: true, force: true }) }
  })

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
  it('makes npm run check name an old Python before the module gates crash in it', () => {
    const check = readFileSync(new URL('./check.mjs', import.meta.url), 'utf8')
    const probe = check.indexOf('localPythonProblem(root)')
    expect(probe).toBeGreaterThan(-1)
    expect(probe).toBeLessThan(check.indexOf("run('modules:check'"))
    expect(probe).toBeLessThan(check.indexOf("run('modules:compat')"))
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
  it('tells everyone else who reviews first releases, and to rerun when main moves', () => {
    const { notes } = readiness({})
    expect(notes[0]).toContain('device reviewer or repository maintainer to review and merge')
    expect(notes.at(-1)).toContain('If main moves before the merge, run this again')
  })
  it('says a change to what runs on an instrument opens as a draft until the exact build ran on a unit', () => {
    const verdict = readiness({ instrument: ['public/octatrack-modules/synth/example.mwrm'] })
    expect(verdict.ok).toBe(true)
    expect(verdict.instrument).toBe(true)
    expect(verdict.notes.find(note => note.startsWith('This changes what runs on an instrument'))).toContain('gh pr create --draft')
    expect(verdict.notes.at(-1)).toContain('If main moves before the merge, run this again')
    expect(readiness({}).instrument).toBe(false)
  })
  it('routes a base build to the cumulative draft without prompting for a topic PR', () => {
    const verdict = readiness({ instrument: ['src/engine/assets/octatrack-base.elemod'] })
    expect(verdict.baseDraft).toBe(true)
    expect(verdict.notes.join(' ')).toContain('directly to base/<machine>-next')
    expect(verdict.notes.join(' ')).not.toContain('gh pr create --draft')
    expect(verdict.notes.join(' ')).not.toContain('open or update the PR')
  })
  it('prompts the agent to verify GitHub after full readiness on a contribution', () => {
    for (const input of [{}, { instrument: ['public/octatrack-modules/synth/example.mwrm'] }]) {
      const notes = readiness(input).notes.join(' ')
      expect(notes).toContain('gh pr view <URL> --json state,headRefOid,isDraft')
      expect(notes).toContain('gh pr ready <URL>')
      expect(notes).toContain('verify isDraft is false')
    }
    for (const input of [{ draftOnly: true }, { checkPassed: false }, { baseDraft: true }]) {
      expect(readiness(input).notes.join(' ')).not.toContain('gh pr ready <URL>')
    }
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
    // The CPU price check is a gate; its pending list is not, so a module that names its price deletes its own line there.
    expect(gateEdits(['sdk/octatrack/modules/poly8/octamod.module.json', 'scripts/module-cpu-price.mjs', 'sdk/module-cpu-prices-pending.json'])).toEqual(['scripts/module-cpu-price.mjs'])
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
    expect(verdict.problems[0]).toContain('directly to the machine’s base/<machine>-next branch')
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
      // What runs on an instrument is defined once, beside the description check that also asks about it.
      copyFileSync(new URL('./pr-body.mjs', import.meta.url), join(checkout, 'scripts', 'pr-body.mjs'))
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
      git(checkout, 'add', 'scripts', 'src')
      git(checkout, 'commit', '-m', 'Track the local check fixture')
      writeFileSync(join(checkout, 'new-helper.ts'), 'export const enabled = true\n')
      const dirty = spawnSync(process.execPath, [script], { cwd: checkout,
        env: { ...env, npm_execpath: join(directory, 'never-run-npm.mjs') }, encoding: 'utf8' })
      expect(dirty.status, dirty.stderr).toBe(1)
      expect(dirty.stdout).toContain('new-helper.ts')
      expect(dirty.stdout).not.toContain('Your branch does not contain current main')
    } finally { rmSync(directory, { recursive: true, force: true }) }
  }, 20_000)
})
