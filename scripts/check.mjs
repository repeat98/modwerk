import { execFileSync, spawn } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { performance } from 'node:perf_hooks'
import { fileURLToPath } from 'node:url'
import { readChangeScope } from './change-scope.mjs'
import { checkChangelog } from './changelog.mjs'
import { checkDocs } from './docs.mjs'
import { takeSlot, workersFor } from './machine-slots.mjs'
import { checkModuleChangelogs } from './module-changelogs.mjs'
import { moduleScopeProblems } from './pr-ready.mjs'

const root = fileURLToPath(new URL('../', import.meta.url))
const npmCli = process.env.npm_execpath
if (!npmCli) throw new Error('Run this script through npm run check or npm run build.')

const children = new Set()
let interrupted = false
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => {
  interrupted = true
  for (const child of children) child.kill(signal)
  process.exitCode = signal === 'SIGINT' ? 130 : 143
})

async function run(name, args = [], env = {}) {
  if (interrupted) return false
  const key = [name, ...args].join(' ')
  if (carried.has(key) && !WRITES.has(name)) {
    skipped.push(name)
    return skip(name, 'passed in the last run')
  }
  const started = performance.now()
  console.log(`Starting ${name}`)
  return new Promise(resolve => {
    // Use npm's current CLI and Node runtime, preserving each script's flags and lifecycle hooks.
    const child = spawn(process.execPath, [npmCli, 'run', name, ...(args.length ? ['--', ...args] : [])], {
      cwd: root,
      env: { ...process.env, ...env },
      stdio: ['inherit', 'pipe', 'pipe'],
    })
    children.add(child)
    const output = []
    child.stdout.on('data', chunk => output.push(chunk))
    child.stderr.on('data', chunk => output.push(chunk))
    child.on('error', error => output.push(Buffer.from(`${error.message}\n`)))
    child.on('close', code => {
      children.delete(child)
      // Group each task's diagnostics so concurrent failures remain readable.
      process.stdout.write(Buffer.concat(output))
      const passed = code === 0
      console.log(`${name}: ${passed ? 'passed' : 'FAILED'} (${((performance.now() - started) / 1000).toFixed(2)}s)`)
      results.set(key, passed)
      resolve(passed)
    })
  })
}

function skip(name, reason) {
  console.log(`${name}: skipped (${reason})`)
  return true
}

async function build() {
  // A type error must still prevent bundling, as in the original build command.
  return await run('typecheck') && await run('build:bundle')
}

const buildOnly = process.argv.includes('--build')
// One full check at a time per slot on this computer, whichever worktree or session starts it (scripts/machine-slots.mjs);
// then Vitest gets as many workers as the free memory carries, unless MODWERK_TEST_WORKERS says.
await takeSlot(buildOnly ? 'npm run build' : 'npm run check')
process.env.MODWERK_TEST_WORKERS ??= String(workersFor({ most: 4, each: 700 * 1024 ** 2, keep: 2 * 1024 ** 3 }))
const started = performance.now()
const baseIndex = process.argv.indexOf('--base'), base = baseIndex < 0 ? null : process.argv[baseIndex + 1]
if (baseIndex >= 0 && !base) throw new Error('--base requires a Git commit/ref')
// --rerun-failed skips the checks that passed in the last run against the same base. Steps that write files always run, since later
// steps read what they write. A rerun is a shortcut between fixes, never a pass: pr:ready and CI run everything.
const record = fileURLToPath(new URL('../node_modules/.cache/check-last.json', import.meta.url))
const WRITES = new Set(['prepare', 'licenses:generate', 'machines:generate', 'modules:generate'])
const results = new Map(), skipped = []
let previous = null
try { previous = JSON.parse(readFileSync(record, 'utf8')) } catch { /* no earlier run */ }
const carried = new Set(process.argv.includes('--rerun-failed') && previous?.base === base && previous?.build === buildOnly ? previous.passed : [])
if (process.argv.includes('--rerun-failed') && !carried.size) console.log('No earlier run against this base to carry: running every check.')
const scope = !buildOnly && base ? readChangeScope({ root, base }) : null
const documentationOnly = !!scope?.documentation
// The SDK suite takes minutes. Locally, a change it cannot read (site, Worker, release notes) skips it; CI always runs it.
const sdkSuite = !scope || scope.sdk || !!process.env.CI
async function changelogs() {
  let passed = true
  try {
    const notes = await checkModuleChangelogs(root, base)
    console.log(`Module changelogs: ${notes.modules} modules, ${notes.releases} releases`)
  } catch (error) { console.error(`Module changelogs: ${error.message}`); passed = false }
  try {
    console.log(`Application changelog: ${checkChangelog(root, base).entries} entries in changelog/`)
  } catch (error) { console.error(`Application changelog: ${error.message}`); passed = false }
  try {
    console.log(`Documents: ${checkDocs(root, base).documents} within the size limit, frozen logs unchanged`)
  } catch (error) { console.error(`Documents: ${error.message}`); passed = false }
  return passed
}
// Run every check of a stage even when one fails, so a pull request sees all its problems in one run.
async function all(...steps) {
  const results = []
  for (const step of steps) if (!interrupted) results.push(await step())
  return results.length === steps.length && results.every(Boolean)
}

// The combined module list and changelog are generated, never committed; write them as npm ci does before anything reads them.
let passed = await run('prepare')
// Reject stale notices/catalog before generation can overwrite the evidence of staleness.
if (!buildOnly && passed) {
  passed = await all(() => run('licenses:check'), () => run('machines:check'), () => run('modules:check', base ? ['--base', base] : []))
  // Report release-note problems with the catalogue's, from the committed catalogue, rather than one push later.
  if (!passed) await changelogs()
}
// Every active Octatrack module must still install beside every other (declarations only, no firmware), and the card
// builder's native pair checks must be current, proved and flagged.
if (!buildOnly && !documentationOnly && passed) passed = await all(() => run('elekloader:check'), () => run('modules:compat'), () => run('modules:pairs'))
// Finish generated notice/catalog/media writes before lint, tests, typecheck or bundling read them.
if (passed && !documentationOnly) passed = await run('licenses:generate') && await run('machines:generate') && await run('modules:generate')
// Every path, including documentation-only checks and release builds, requires current-version notes and documents within their size.
if (passed) passed = await changelogs()
// In a pull request's CI run, a contributor's module pull request carries no check that judges modules and no base change;
// pr:ready says the same to everyone before they push.
if (passed && base && process.env.GITHUB_EVENT_PATH) {
  const pull = (() => { try { return JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8')).pull_request ?? null } catch { return null } })()
  const files = execFileSync('git', ['diff', '--name-only', '--no-renames', base + '...HEAD'], { cwd: root, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 }).split('\n').filter(Boolean)
  const problems = pull ? moduleScopeProblems(files, { author: pull.user?.login, owner: process.env.GITHUB_REPOSITORY_OWNER, openedAt: pull.created_at }) : []
  for (const problem of problems) console.error('Module scope: ' + problem)
  if (problems.length) passed = false
}
// The agent board's claims (docs/AGENT_BOARD.md): a module, hook or migration this branch adds that someone else holds fails it;
// an unreachable board only warns, so an outage never blocks a pull request.
if (passed && base) passed = await run('board', ['check', '--base', base])
// Documentation uses the same import policy as publication without running firmware gates. The catalogue tests read Markdown
// (the module guides' links, the agent files, the pull request template), so a prose-only change can break them and must run them.
if (passed && documentationOnly) passed = await run('sdk:imports:check') && await run('test', ['src/catalog'])
// module:doctor --draft copies a draft under sdk/octabam/modules/ for its run, where the SDK suite, the other test files and the
// build would read it as a listed module. Its test waits out that parallel stage and runs alone after it.
const DRAFT_DOCTOR = ['scripts/module-doctor.test.mjs', '-t', 'checks a draft where every gate looks']
if (passed && !documentationOnly) {
  const results = buildOnly
    ? [await build()]
    // The SDK suite starts once the app tests are done, whatever their result: its processes beside Vitest's workers starved
    // Vitest's five-second tests.
    : await Promise.all([run('lint'), run('test', [], { MODWERK_DEFER_DRAFT_DOCTOR: '1' }).then(async tested =>
      (sdkSuite ? await run('sdk:check') : skip('sdk:check', 'no changed path reaches it; CI runs it')) && tested), build()])
  if (!buildOnly) results.push(await run('test', DRAFT_DOCTOR))
  passed = results.every(Boolean) && !interrupted
}
const passedNow = [...carried, ...[...results].filter(([, ok]) => ok).map(([key]) => key)].filter(key => results.get(key) !== false)
try {
  mkdirSync(fileURLToPath(new URL('../node_modules/.cache/', import.meta.url)), { recursive: true })
  writeFileSync(record, JSON.stringify({ base, build: buildOnly, passed: [...new Set(passedNow)] }) + '\n')
} catch { /* the record only speeds up a rerun */ }
console.log(`${buildOnly ? 'Build' : documentationOnly ? 'Documentation check' : 'Check'} ${passed ? 'passed' : 'FAILED'} in ${((performance.now() - started) / 1000).toFixed(2)}s`)
if (skipped.length) console.log(`Rerun: ${skipped.join(', ')} passed in the last run and did not run now. Run the full check (or pr:ready) before you push.`)
if (!passed && !process.exitCode) process.exitCode = 1
