import { spawnSync, execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'

const runner = fileURLToPath(new URL('../../scripts/check.mjs', import.meta.url))

function check(failure = '', buildOnly = false) {
  const folder = mkdtempSync(join(tmpdir(), 'octamod-check-test.'))
  const log = join(folder, 'scripts.log')
  const npm = join(folder, 'npm.mjs')
  writeFileSync(npm, `
    import { appendFileSync } from 'node:fs'
    const name = process.argv[3]
    appendFileSync(process.env.CHECK_TEST_LOG, name + '\\n')
    process.exitCode = process.env.CHECK_TEST_FAIL === name ? 1 : 0
  `)
  try {
    const result = spawnSync(process.execPath, [runner, ...(buildOnly ? ['--build'] : [])], {
      encoding: 'utf8',
      env: { ...process.env, npm_execpath: npm, CHECK_TEST_LOG: log, CHECK_TEST_FAIL: failure },
    })
    return { ...result, scripts: readFileSync(log, 'utf8').trim().split('\n') }
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
})

it('refuses a cross-compatibility clash before generation or any dependent check can run', () => {
  const result = check('modules:compat')
  expect(result.status).toBe(1)
  expect(result.scripts).toEqual(['prepare', 'licenses:check', 'machines:check', 'modules:check', 'elekloader:check', 'modules:compat'])
})

it.each(['sdk:check', 'lint', 'test', 'build:bundle', ''])('keeps every independent check mandatory and waits for all results (failure: %s)', failure => {
  const result = check(failure)
  expect(result.status).toBe(failure ? 1 : 0)
  expect(result.scripts.slice(0, 9)).toEqual(['prepare', 'licenses:check', 'machines:check', 'modules:check', 'elekloader:check', 'modules:compat', 'licenses:generate', 'machines:generate', 'modules:generate'])
  expect(result.scripts.slice(9).sort()).toEqual(['build:bundle', 'lint', 'sdk:check', 'test', 'typecheck'])
  expect(result.scripts.indexOf('build:bundle')).toBeGreaterThan(result.scripts.indexOf('typecheck'))
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
  expect(result.scripts).toEqual(['prepare', 'licenses:check'])
  const failure = check('licenses:generate', true)
  expect(failure.status).toBe(1)
  expect(failure.scripts).toEqual(['prepare', 'licenses:generate'])
})


function documentationCheck(missingNotes = false, failure = '') {
  const folder = mkdtempSync(join(tmpdir(), 'modwerk-doc-check.'))
  const scripts = join(folder, 'scripts'), log = join(folder, 'scripts.log'), npm = join(folder, 'npm.mjs')
  mkdirSync(scripts)
  const scope = new URL('../../scripts/change-scope.mjs', import.meta.url).href
  const changelogs = new URL('../../scripts/module-changelogs.mjs', import.meta.url).href
  writeFileSync(join(scripts, 'check.mjs'), readFileSync(runner, 'utf8').replace("'./change-scope.mjs'", JSON.stringify(scope)).replace("'./module-changelogs.mjs'", JSON.stringify(changelogs)))
  writeFileSync(npm, `import { appendFileSync } from 'node:fs'; appendFileSync(process.env.CHECK_TEST_LOG, process.argv[3] + '\\n'); process.exitCode = process.env.CHECK_TEST_FAIL === process.argv[3] ? 1 : 0`)
  mkdirSync(join(folder, 'src/catalog'), { recursive: true })
  mkdirSync(join(folder, 'src/community/module-changelogs'), { recursive: true })
  writeFileSync(join(folder, 'src/catalog/module-documents.json'), JSON.stringify({ modules: [{ id: 'euclid', version: '1.0.0' }] }))
  writeFileSync(join(folder, 'src/catalog/machine-modules.json'), JSON.stringify({ modules: [] }))
  if (!missingNotes) writeFileSync(join(folder, 'src/community/module-changelogs/euclid.json'), JSON.stringify([{ version: '1.0.0', date: '2026-10-07', changes: ['Correct the clock reset during playback.'] }]))
  const git = (...args: string[]) => execFileSync('git', args, { cwd: folder, stdio: 'pipe' })
  try {
    git('init'); git('config', 'user.name', 'Test'); git('config', 'user.email', 'test@example.com')
    writeFileSync(join(folder, 'README.md'), 'Old'); git('add', '.'); git('commit', '-m', 'base')
    writeFileSync(join(folder, 'README.md'), 'Better')
    if (!missingNotes) {
      const notesPath = join(folder, 'src/community/module-changelogs/euclid.json')
      writeFileSync(notesPath, readFileSync(notesPath, 'utf8').replace('Correct the clock reset during playback.', 'Documentation-only: clarify the playback reset guide.'))
    }
    const result = spawnSync(process.execPath, [join(scripts, 'check.mjs'), '--base', 'HEAD'], {
      encoding: 'utf8', env: { ...process.env, npm_execpath: npm, CHECK_TEST_LOG: log, CHECK_TEST_FAIL: failure },
    })
    return { ...result, scripts: readFileSync(log, 'utf8').trim().split('\n') }
  } finally { rmSync(folder, { recursive: true, force: true }) }
}

it('checks documentation without starting the full application suite, build or generators', () => {
  const result = documentationCheck()
  expect(result.status, result.stderr).toBe(0)
  expect(result.stdout).toContain('Documentation check passed')
  expect(result.stdout).toContain('Module changelogs: 1 modules, 1 releases')
  expect(result.scripts).toEqual(['prepare', 'licenses:check', 'machines:check', 'modules:check', 'sdk:imports:check', 'test'])
})

it('catches imported-source drift before a documentation PR can reach publication', () => {
  const result = documentationCheck(false, 'sdk:imports:check')
  expect(result.status).toBe(1)
  expect(result.stdout).toContain('Documentation check FAILED')
  expect(result.scripts).toEqual(['prepare', 'licenses:check', 'machines:check', 'modules:check', 'sdk:imports:check'])
})

it('runs the catalogue tests that read Markdown, so a prose-only change cannot break main unseen', () => {
  const result = documentationCheck(false, 'test')
  expect(result.status).toBe(1)
  expect(result.stdout).toContain('Documentation check FAILED')
  expect(result.scripts).toEqual(['prepare', 'licenses:check', 'machines:check', 'modules:check', 'sdk:imports:check', 'test'])
})

it('requires current-version release notes even on the documentation-only validation path', () => {
  const result = documentationCheck(true)
  expect(result.status).toBe(1)
  expect(result.stderr).toContain('Missing release notes for euclid v1.0.0')
  expect(result.scripts).toEqual(['prepare', 'licenses:check', 'machines:check', 'modules:check'])
})
