import { describe, expect, it } from 'vitest'
import { execFileSync, spawnSync } from 'node:child_process'
import { copyFileSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { readiness } from './pr-ready.mjs'

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
