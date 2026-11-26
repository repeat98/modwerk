import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'
import { classifyChanges, readChangeScope } from './change-scope.mjs'
import { affectedTests, filesForShard, planPrChecks } from './pr-check-plan.mjs'
import { gateEdits } from './pr-ready.mjs'

function plan(...files) {
  const changes = files.map(path => ({ path, before: '', after: '' }))
  return planPrChecks({ ...classifyChanges(changes), files })
}

it('runs a site bundle and inline tests for a stylesheet with its release note', () => {
  expect(plan('src/navigation.css', 'changelog/2026-11-19-navigation.md')).toMatchObject({
    full: false, parts: [], inline: true, bundle: true, types: false, lint: false, metadata: false, sdk: false, doctor: false,
  })
})

it.each([
  ['src/community/AccountMenu.tsx', true, true, true, false],
  ['server/account-confirmation.ts', false, true, true, false],
  ['migrations/0101_message_read_cursor.sql', false, false, false, false],
  ['desktop/src/main.mjs', false, false, true, false],
  ['scripts/agent-board.mjs', false, false, true, false],
  ['scripts/module-pages.ts', true, true, true, false],
  ['sdk/octatrack/modules/demo/src/demo.c', false, false, false, true],
  ['server/module-update-catchup-content.json', false, true, false, false],
  ['public/zoom-effects/demo/1.0.0/Demo.ZDL', true, true, false, true],
  ['public/favicon.svg', true, false, false, false],
  ['src/engine/rom-package.ts', true, true, true, true],
  ['scripts/changelog.test.mjs', false, false, true, false],
])('selects the checks for %s', (file, bundle, types, lint, sdk) => {
  expect(plan(file)).toMatchObject({ full: false, bundle, types, lint, sdk, lintFiles: lint ? [file] : [] })
})

it('combines the checks for mixed changes and keeps module checks on code changes', () => {
  expect(plan('src/navigation.css', 'server/accounts.ts', 'docs/ADD_A_MODULE.md')).toMatchObject({
    bundle: true, types: true, lint: true, docContracts: true, metadata: true, parts: ['test:1/2', 'test:2/2'],
  })
  expect(plan('sdk/octatrack/modules/demo/src/demo.c', 'src/components/Card.tsx')).toMatchObject({
    doctor: true, metadata: true, sdk: true, parts: ['test:1/2', 'test:2/2', 'sdk'],
  })
  expect(plan('scripts/module-doctor.test.mjs').doctor).toBe(true)
  expect(plan('README.md')).toMatchObject({ docs: true, parts: [], metadata: true })
  expect(plan('changelog/2026-11-19-entry.md')).toMatchObject({ docs: false, metadata: false, parts: [] })
})

it.each([[], ['unclassified/input.toml'], ['package-lock.json'], ['vitest.config.ts'], ['.github/workflows/module-pr.yml'], ['scripts/pr-check-plan.mjs']])('uses all suites for shared inputs or an unavailable scope (%s)', (...files) => {
  expect(plan(...files)).toMatchObject({ full: true, sdk: true, types: true, lint: true, bundle: true, metadata: true, parts: ['test:1/2', 'test:2/2', 'sdk'] })
})

it('protects the selector in module PRs', () => {
  expect(gateEdits(['sdk/octatrack/modules/demo/src/demo.c', 'scripts/pr-check-plan.mjs'])).toEqual(['scripts/pr-check-plan.mjs'])
})

it('reads staged and unstaged changes locally, detects renames, and compares only committed trees in CI', () => {
  const root = mkdtempSync(join(tmpdir(), 'modwerk-plan-'))
  const git = (...args) => execFileSync('git', args, { cwd: root, stdio: 'pipe', encoding: 'utf8' }).trim()
  const scope = (head = null) => readChangeScope({ root, base: 'HEAD', head, includeFiles: true })
  try {
    git('init')
    git('config', 'user.name', 'Test')
    git('config', 'user.email', 'test@example.org')
    mkdirSync(join(root, 'src'))
    writeFileSync(join(root, 'src/nav.css'), 'a{}')
    git('add', '.')
    git('commit', '-m', 'base')
    writeFileSync(join(root, 'src/nav.css'), 'b{}')
    git('add', 'src/nav.css')
    writeFileSync(join(root, 'src/new.ts'), 'export const x = 1')
    expect(scope()).toMatchObject({ files: ['src/nav.css', 'src/new.ts'], wide: false })
    expect(scope('HEAD').files).toEqual([])
    renameSync(join(root, 'src/nav.css'), join(root, 'src/new.css'))
    expect(planPrChecks(scope()).full).toBe(true)
    git('add', '.')
    git('commit', '-m', 'rename')
    expect(readChangeScope({ root, base: 'HEAD~1', head: 'HEAD', includeFiles: true }).wide).toBe(true)
  } finally { rmSync(root, { recursive: true, force: true }) }
})

it('selects a transitive importer, a raw stylesheet reader and a changed test in a scratch project', async () => {
  const root = mkdtempSync(join(tmpdir(), 'modwerk-related-'))
  try {
    execFileSync('git', ['init'], { cwd: root, stdio: 'pipe' })
    mkdirSync(join(root, 'src'))
    for (const [name, source] of Object.entries({
      'nav.css': 'a {}', 'model.ts': 'export const a = 1', 'bridge.ts': "export { a } from './model'",
      'reader.test.ts': "new URL('./nav.css', import.meta.url)", 'model.test.ts': "import './bridge'",
      'new.test.ts': '', 'other.test.ts': '',
    })) writeFileSync(join(root, 'src', name), source)
    const files = ['src/model.ts', 'src/nav.css', 'src/new.test.ts']
    expect(await affectedTests(root, { files }, plan(...files))).toEqual(['src/model.test.ts', 'src/new.test.ts', 'src/reader.test.ts'])
  } finally { rmSync(root, { recursive: true, force: true }) }
}, 20_000)

it('assigns each affected test to one CI job, including a single-file selection', () => {
  expect(filesForShard(['a'], 'test:1/2')).toEqual(['a'])
  expect(filesForShard(['a'], 'test:2/2')).toEqual([])
  expect(filesForShard(['a', 'b', 'c'], 'test:1/2')).toEqual(['a', 'c'])
  expect(filesForShard(['a', 'b', 'c'], 'test:2/2')).toEqual(['b'])
})

it('starts the workflow’s scope command as a fresh Node process', () => {
  const root = fileURLToPath(new URL('..', import.meta.url))
  const workflow = readFileSync(join(root, '.github/workflows/module-pr.yml'), 'utf8')
  const command = workflow.match(/run: node (scripts\/[\w.-]+) --base "\$OCTAMOD_PR_BASE" --head HEAD >> "\$GITHUB_OUTPUT"/)
  expect(command).toBeTruthy()
  // The base is the merge commit's parent, which the two-commit checkout holds; the event's base.sha may not be in it.
  expect(workflow).toMatch(/- id: scope\n {8}env:\n(?: {10}#.*\n)* {10}OCTAMOD_PR_BASE: HEAD\^1\n/)
  // Every later check compares against the same parent: none takes the event's base.sha.
  expect(workflow).not.toMatch(/pull_request\.base\.sha \}\}\n/)
  expect(workflow.match(/--base "\$\(git rev-parse HEAD\^1\)"/g)).toHaveLength(3)
  const output = execFileSync(process.execPath, [command[1], '--base', 'HEAD', '--head', 'HEAD'], { cwd: root, encoding: 'utf8' })
  expect(output.trim().split('\n')).toEqual([
    'parts=["test:1/2","test:2/2","sdk"]', 'modules=false', 'windows=false', 'elemod=false', 'logger=false',
  ])
})
