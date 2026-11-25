import { spawnSync, execFileSync } from 'node:child_process'
import { copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'

const runner = new URL('../../scripts/check.mjs', import.meta.url)
const generators = ['licenses:generate', 'machines:generate', 'modules:generate']
const preflight = ['prepare', 'licenses:check', 'machines:check', 'modules:check', 'elekloader:check', 'modules:compat', ...generators]
const appChecks = ['lint', 'typecheck', 'build:bundle']

// The real runner takes its root from import.meta.url. Keep its fixture and last-run record
// in the scratch repository while importing the same check implementations as the CLI.
function writeRunner(folder: string) {
  const scripts = join(folder, 'scripts')
  mkdirSync(scripts)
  const path = join(scripts, 'check.mjs')
  const source = readFileSync(runner, 'utf8').replace(/from '(\.\/[^']+)'/g, (_, specifier: string) =>
    'from ' + JSON.stringify(new URL(specifier, runner).href))
  writeFileSync(path, source)
  return path
}

function check(failure = '', buildOnly = false, args: string[] = [], env: Record<string, string> = {}) {
  const folder = mkdtempSync(join(tmpdir(), 'octamod-check-test.'))
  const log = join(folder, 'scripts.log')
  const npm = join(folder, 'npm.mjs')
  writeFileSync(npm, `
    import { appendFileSync } from 'node:fs'
    const name = process.argv[3]
    appendFileSync(process.env.CHECK_TEST_LOG, JSON.stringify(process.argv.slice(3)) + '\\n')
    process.exitCode = process.env.CHECK_TEST_FAIL === name ? 1 : 0
    // CHECK_TEST_FLAKY: the full Vitest run fails one file; rerun alone, it passes ('alone') or fails again.
    const args = process.argv.slice(5)
    if (name === 'test' && process.env.CHECK_TEST_FLAKY && !args.includes('-t')) {
      if (args.includes('src/a.test.ts')) process.exitCode = process.env.CHECK_TEST_FLAKY === 'alone' && process.env.MODWERK_TEST_WORKERS === '1' ? 0 : 1
      else { console.log('\\x1b[41m FAIL \\x1b[49m src/a.test.ts > waits out a reply timer'); process.exitCode = 1 }
    }
  `)
  try {
    const entry = writeRunner(folder)
    mkdirSync(join(folder, 'src/catalog'), { recursive: true })
    mkdirSync(join(folder, 'src/community/module-changelogs'), { recursive: true })
    for (const file of ['module-documents.json', 'machine-modules.json']) {
      writeFileSync(join(folder, 'src/catalog', file), JSON.stringify({ modules: [] }))
    }
    const machine = 'sdk/machines/octatrack/'
    mkdirSync(join(folder, machine, 'elekloader'), { recursive: true })
    for (const file of ['base-sizes.json', 'base-binding.json', 'base-versions.json', 'elekloader/flash.h', 'elekloader/build_core.py']) {
      copyFileSync(new URL('../' + machine + file, runner), join(folder, machine, file))
    }
    // The base-bound check reads the package manifest beside the base binding (scripts/base-bound.mjs).
    const packages = 'src/engine/assets/octatrack-module-packages.json'
    mkdirSync(join(folder, 'src/engine/assets'), { recursive: true })
    copyFileSync(new URL('../' + packages, runner), join(folder, packages))
    const result = spawnSync(process.execPath, [entry, ...(buildOnly ? ['--build'] : []), ...args], {
      encoding: 'utf8',
      env: { ...process.env, npm_execpath: npm, CHECK_TEST_LOG: log, CHECK_TEST_FAIL: failure, MODWERK_SLOTS: '0', ...env },
    })
    if (result.error) throw result.error
    const calls: string[][] = readFileSync(log, 'utf8').trim().split('\n').map(line => JSON.parse(line))
    return { ...result, calls, scripts: calls.map(([name]) => name) }
  } finally {
    rmSync(folder, { recursive: true, force: true })
  }
}

it('writes the uncommitted module list and changelog before anything reads them', () => {
  const result = check('prepare')
  expect(result.status).toBe(1)
  expect(result.scripts).toEqual(['prepare'])
})

it('rejects a stale catalog before generation or any dependent check can run', () => {
  const result = check('modules:check')
  expect(result.status).toBe(1)
  expect(result.scripts).toEqual(['prepare', 'licenses:check', 'machines:check', 'modules:check'])
  // Release-note problems are reported in the same run, not one push later.
  expect(result.stdout).toContain('Module changelogs:')
})

it('refuses a cross-compatibility clash before generation or any dependent check can run', () => {
  const result = check('modules:compat')
  expect(result.status).toBe(1)
  expect(result.scripts).toEqual(['prepare', 'licenses:check', 'machines:check', 'modules:check', 'elekloader:check', 'modules:compat'])
})

it.each(['sdk:check', 'lint', 'test', 'build:bundle', ''])('keeps every independent check mandatory and waits for all results (failure: %s)', failure => {
  const result = check(failure)
  expect(result.status).toBe(failure ? 1 : 0)
  expect(result.scripts.slice(0, preflight.length)).toEqual(preflight)
  expect(result.scripts.slice(preflight.length, -1).sort()).toEqual([...appChecks, 'sdk:check', 'test'].sort())
  expect(result.scripts.indexOf('build:bundle')).toBeGreaterThan(result.scripts.indexOf('typecheck'))
  expect(result.scripts.indexOf('sdk:check')).toBeGreaterThan(result.scripts.indexOf('test'))
  // The module doctor's draft test copies a draft under sdk/octatrack/modules/, so it runs alone once the parallel stage is done.
  expect(result.scripts.at(-1)).toBe('test')
})

it.each([['alone', 0], ['again', 1]])('reruns a failed test file alone on one worker and passes only when it passes there (%s)', (mode, status) => {
  const result = check('', false, [], { CHECK_TEST_FLAKY: mode })
  expect(result.status).toBe(status)
  expect(result.calls).toContainEqual(['test', '--', 'src/a.test.ts'])
  if (status === 0) expect(result.stdout).toMatch(/passed alone, so they did not fail the check: src\/a\.test\.ts/)
})

it('runs as CI\'s contract part with the draft doctor last', () => {
  const result = check('', false, ['--part', 'contract'])
  expect(result.status).toBe(0)
  expect(result.scripts.slice(0, preflight.length)).toEqual(preflight)
  expect(result.scripts.slice(preflight.length, -1).sort()).toEqual([...appChecks].sort())
  expect(result.calls.at(-1)).toEqual(['test', '--', 'scripts/module-doctor.test.mjs', '-t', 'checks a draft where every gate looks'])
}, 15_000) // The contract launches 13 npm subprocesses, even with the recording fixture.

it.each([['sdk', 'sdk:check'], ['test:1/2', 'test'], ['test:2/2', 'test']])('runs as CI\'s %s part', (part, suite) => {
  const result = check('', false, ['--part', part])
  expect(result.status).toBe(0)
  expect(result.scripts).toEqual(['prepare', ...generators, suite])
  if (suite === 'test') expect(result.calls.at(-1)).toEqual(['test', '--', '--shard=' + part.slice('test:'.length)])
})

it('prevents bundling on a type error while finishing the other checks', () => {
  const result = check('typecheck')
  expect(result.status).toBe(1)
  expect(result.scripts).not.toContain('build:bundle')
  expect(result.scripts).toContain('test')
  expect(result.scripts).toContain('lint')
  expect(result.scripts).toContain('sdk:check')
})

it('builds through the same generation, typecheck and bundling gates', () => {
  const result = check('', true)
  expect(result.status).toBe(0)
  expect(result.scripts).toEqual(['prepare', 'licenses:generate', 'machines:generate', 'modules:generate', 'typecheck', 'build:bundle'])
  const failure = check('modules:generate', true)
  expect(failure.status).toBe(1)
  expect(failure.scripts).toEqual(['prepare', 'licenses:generate', 'machines:generate', 'modules:generate'])
})

it('rejects stale licence notices before generation can overwrite them', () => {
  const result = check('licenses:check')
  expect(result.status).toBe(1)
  // The stage's other checks still run, so one PR run names every stale file.
  expect(result.scripts).toEqual(['prepare', 'licenses:check', 'machines:check', 'modules:check'])
  const failure = check('licenses:generate', true)
  expect(failure.status).toBe(1)
  expect(failure.scripts).toEqual(['prepare', 'licenses:generate'])
})


function documentationCheck(missingNotes = false, failure = '', changelogEntry = '') {
  const folder = mkdtempSync(join(tmpdir(), 'modwerk-doc-check.'))
  const entry = writeRunner(folder), log = join(folder, 'scripts.log'), npm = join(folder, 'npm.mjs')
  writeFileSync(npm, `import { appendFileSync } from 'node:fs'; appendFileSync(process.env.CHECK_TEST_LOG, process.argv[3] + '\\n'); process.exitCode = process.env.CHECK_TEST_FAIL === process.argv[3] ? 1 : 0`)
  mkdirSync(join(folder, 'src/catalog'), { recursive: true })
  mkdirSync(join(folder, 'src/community/module-changelogs'), { recursive: true })
  writeFileSync(join(folder, 'src/catalog/module-documents.json'), JSON.stringify({ modules: [{ id: 'euclid', version: '1.0.0' }] }))
  writeFileSync(join(folder, 'src/catalog/machine-modules.json'), JSON.stringify({ modules: [] }))
  if (!missingNotes) writeFileSync(join(folder, 'src/community/module-changelogs/euclid.json'), JSON.stringify([{ version: '1.0.0', date: '2026-10-07', changes: ['Correct the clock reset during playback.'] }]))
  const git = (...args: string[]) => execFileSync('git', args, { cwd: folder, stdio: 'pipe' })
  try {
    git('init'); git('config', 'user.name', 'Test'); git('config', 'user.email', 'test@example.com')
    writeFileSync(join(folder, 'README.md'), 'Old'); writeFileSync(join(folder, 'CHANGELOG.md'), '# Application changelog\n\n## 22 October 2026\n\n- Old.\n')
    git('add', '.'); git('commit', '-m', 'base')
    writeFileSync(join(folder, 'README.md'), 'Better')
    if (changelogEntry) writeFileSync(join(folder, 'CHANGELOG.md'), '# Application changelog\n\n## 23 October 2026\n\n- ' + changelogEntry + '\n\n## 22 October 2026\n\n- Old.\n')
    if (!missingNotes) {
      const notesPath = join(folder, 'src/community/module-changelogs/euclid.json')
      writeFileSync(notesPath, readFileSync(notesPath, 'utf8').replace('Correct the clock reset during playback.', 'Documentation-only: clarify the playback reset guide.'))
    }
    const result = spawnSync(process.execPath, [entry, '--base', 'HEAD'], {
      encoding: 'utf8', env: { ...process.env, npm_execpath: npm, CHECK_TEST_LOG: log, CHECK_TEST_FAIL: failure, MODWERK_SLOTS: '0' },
    })
    return { ...result, scripts: readFileSync(log, 'utf8').trim().split('\n') }
  } finally { rmSync(folder, { recursive: true, force: true }) }
}

it('checks documentation without starting the full application suite, build or generators', () => {
  const result = documentationCheck()
  expect(result.status, result.stderr).toBe(0)
  expect(result.stdout).toContain('Documentation check passed')
  expect(result.stdout).toContain('Module changelogs: 1 modules, 1 releases')
  expect(result.scripts).toEqual(['prepare', 'licenses:check', 'machines:check', 'modules:check', 'board', 'sdk:imports:check', 'test'])
})

it('catches imported-source drift before a documentation PR can reach publication', () => {
  const result = documentationCheck(false, 'sdk:imports:check')
  expect(result.status).toBe(1)
  expect(result.stdout).toContain('Documentation check FAILED')
  expect(result.scripts).toEqual(['prepare', 'licenses:check', 'machines:check', 'modules:check', 'board', 'sdk:imports:check'])
})

it('runs the catalogue tests that read Markdown, so a prose-only change cannot break main unseen', () => {
  const result = documentationCheck(false, 'test')
  expect(result.status).toBe(1)
  expect(result.stdout).toContain('Documentation check FAILED')
  expect(result.scripts).toEqual(['prepare', 'licenses:check', 'machines:check', 'modules:check', 'board', 'sdk:imports:check', 'test'])
})

it('requires current-version release notes even on the documentation-only validation path', () => {
  const result = documentationCheck(true)
  expect(result.status).toBe(1)
  expect(result.stderr).toContain('Missing release notes for euclid v1.0.0')
  expect(result.scripts).toEqual(['prepare', 'licenses:check', 'machines:check', 'modules:check'])
})

it('sends a new application changelog entry to its own file instead of CHANGELOG.md', () => {
  const result = documentationCheck(false, '', 'A fix.')
  expect(result.status).toBe(1)
  expect(result.stderr).toContain('changelog/<YYYY-MM-DD>-<topic>.md')
})
