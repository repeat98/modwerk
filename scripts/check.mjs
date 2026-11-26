import { execFileSync, spawn } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { performance } from 'node:perf_hooks'
import { fileURLToPath } from 'node:url'
import { stripVTControlCharacters } from 'node:util'
import { checkBaseBound } from './base-bound.mjs'
import { checkBaseSize } from './base-size.mjs'
import { readChangeScope } from './change-scope.mjs'
import { affectedTests, filesForShard, planPrChecks } from './pr-check-plan.mjs'
import { checkChangelog } from './changelog.mjs'
import { checkDocs } from './docs.mjs'
import { appStagesFit, takeSlot, vitestWorkerBytes, workersFor } from './machine-slots.mjs'
import { m68kToolchainProblem } from './m68k-preflight.mjs'
import { checkModuleChangelogs } from './module-changelogs.mjs'
import { localPythonProblem, moduleScopeProblems } from './pr-ready.mjs'

const root = fileURLToPath(new URL('../', import.meta.url))
const npmCli = process.env.npm_execpath
if (!npmCli) throw new Error('Run this script through npm run check or npm run build.')

const children = new Set()
let interrupted = false
const buildOnly = process.argv.includes('--build')
const requested = performance.now()
await takeSlot(buildOnly ? 'npm run build' : 'npm run check')
const started = performance.now()
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
      if (!passed) failures.set(key, [name, firstCause(name, Buffer.concat(output).toString('utf8'))])
      if (name === 'test') outputs.set(key, Buffer.concat(output).toString('utf8'))
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

process.env.MODWERK_TEST_WORKERS ??= String(workersFor({ most: 4, each: vitestWorkerBytes, keep: 2 * 1024 ** 3 }))
const baseIndex = process.argv.indexOf('--base'), base = baseIndex < 0 ? null : process.argv[baseIndex + 1]
if (baseIndex >= 0 && !base) throw new Error('--base requires a Git commit/ref')
// CI runs one check as parallel jobs (module-pr.yml): --part contract is everything but the two long suites, --part test:1/2
// one shard of Vitest, --part sdk the SDK suite. Together they run what a run without --part does, as every local check is.
const partIndex = process.argv.indexOf('--part'), part = partIndex < 0 ? null : process.argv[partIndex + 1]
if (partIndex >= 0 && !/^(?:contract|sdk|test:\d+\/\d+)$/.test(part ?? '')) throw new Error('--part is contract, sdk or test:<shard>/<shards>')
const suiteOnly = !!part && part !== 'contract'
// --rerun-failed skips the checks that passed in the last run against the same base. Steps that write files always run, since later
// steps read what they write. A rerun is a shortcut between fixes, never a pass: pr:ready and CI run everything.
const record = fileURLToPath(new URL('../node_modules/.cache/check-last.json', import.meta.url))
const WRITES = new Set(['prepare', 'licenses:generate', 'machines:generate', 'modules:generate'])
const results = new Map(), skipped = [], outputs = new Map(), flaky = []
// What failed, for the last lines of the run: a failed check's own output can sit thousands of lines above the verdict, behind
// the checks that ran beside it, and a reader of the end of the log (a developer, an agent, a CI summary) saw only "FAILED".
const failures = new Map()
const CAUSE = [/^SDK checks FAILED: .+/m, /^\s*(?:FAIL|×)\s+\S+\.test\.[cm]?[jt]sx?.*/m, /^✗ .+/m, /^.*\berror TS\d+: .+/m, /^\s*\d+:\d+\s+error\s+.+/m,
  /^(?:\w+Error|Error)\b.*: .+/m, /^.*\bError: .+/m]
const oneLine = line => { const text = line.trim().replace(/\s+/g, ' '); return text.length > 240 ? text.slice(0, 239) + '…' : text }
function firstCause(name, text) {
  const plain = stripVTControlCharacters(text)
  const files = name === 'test' ? failedTestFiles(plain) : []
  if (files.length > 1) return `${files.length} test files: ${files.slice(0, 4).join(', ')}${files.length > 4 ? ', …' : ''}`
  return oneLine(CAUSE.map(pattern => plain.match(pattern)?.[0]).find(Boolean) ?? plain.trim().split('\n').at(-1) ?? '')
}
/** A failure outside an npm script (release notes, document sizes, the base): printed where it happens and named at the end. */
function problem(name, message) {
  console.error(message)
  if (!failures.has(name)) failures.set(name, [name, oneLine(message.trim().split('\n')[0].replace(name + ': ', ''))])
}
// A Vitest file that fails in the full run but passes when rerun alone on one worker timed out under load (other sessions' checks
// on this computer) or leans on another file's state: it is reported, not failed (owner, 21 November 2026). A file that fails alone
// too fails the check, and more than RERUN_LIMIT failed files is a real break, so they are not rerun.
const RERUN_LIMIT = 12
const failedTestFiles = text => [...new Set([...stripVTControlCharacters(text).matchAll(/^\s*FAIL\s+(\S+\.test\.[cm]?[jt]sx?)\b/gm)].map(match => match[1]))]
async function rerunAlone(args) {
  const failed = failedTestFiles(outputs.get(['test', ...args].join(' ')) ?? '')
  if (!failed.length || failed.length > RERUN_LIMIT || interrupted) return false
  console.log(`Rerunning the ${failed.length} failed test file(s) alone on one worker: ${failed.join(', ')}`)
  if (!await run('test', failed, { MODWERK_DEFER_DRAFT_DOCTOR: '1', MODWERK_TEST_WORKERS: '1' })) return false
  flaky.push(...failed)
  failures.delete(['test', ...args].join(' '))
  return true
}
let previous = null
try { previous = JSON.parse(readFileSync(record, 'utf8')) } catch { /* no earlier run */ }
const carried = new Set(process.argv.includes('--rerun-failed') && previous?.base === base && previous?.build === buildOnly ? previous.passed : [])
if (process.argv.includes('--rerun-failed') && !carried.size) console.log('No earlier run against this base to carry: running every check.')
const scope = !buildOnly && base ? readChangeScope({ root, base, head: part && process.env.GITHUB_ACTIONS ? 'HEAD' : null, includeFiles: true }) : null
const plan = planPrChecks(scope)
const documentationOnly = plan.docs
if (scope) console.log('PR check scope: ' + (plan.full ? 'full (shared, removed or unknown inputs)' : plan.areas.join(', ')))
async function changelogs() {
  let passed = true
  try {
    if (plan.metadata) {
      const notes = await checkModuleChangelogs(root, base)
      console.log(`Module changelogs: ${notes.modules} modules, ${notes.releases} releases`)
    }
  } catch (error) { problem('Module changelogs', `Module changelogs: ${error.message}`); passed = false }
  try {
    console.log(`Application changelog: ${checkChangelog(root, base).entries} entries in changelog/`)
  } catch (error) { problem('Application changelog', `Application changelog: ${error.message}`); passed = false }
  try {
    if (plan.guides) console.log(`Documents: ${checkDocs(root, base).documents} within the size limit, frozen logs unchanged`)
  } catch (error) { problem('Documents', `Documents: ${error.message}`); passed = false }
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
// The module gates and sdk:check run in Python 3.12+; an older python3 (macOS's own is 3.9) would crash inside them with no word on why.
if (!buildOnly && !suiteOnly && passed && (plan.metadata || plan.native)) {
  const python = localPythonProblem(root)
  if (python) { problem('Python', python); passed = false }
}
// sdk:check stops on a compiler without its binutils (scripts/m68k-preflight.mjs), but here it runs last, after the whole test
// suite: say so in the first seconds instead. CI's parts leave it to sdk:check itself.
if (!buildOnly && !part && !documentationOnly && passed && plan.sdk) {
  const toolchain = m68kToolchainProblem()
  if (toolchain) { problem('ColdFire toolchain', toolchain); passed = false }
}
// Reject stale notices/catalog before generation can overwrite the evidence of staleness.
if (!buildOnly && !suiteOnly && passed) {
  if (plan.metadata) passed = await all(() => run('licenses:check'), () => run('machines:check'), () => run('modules:check', base ? ['--base', base] : []))
  // Report release-note problems with the catalogue's, from the committed catalogue, rather than one push later.
  if (!passed) await changelogs()
}
// Every active Octatrack module must still install beside every other (declarations only, no firmware).
if (!buildOnly && !suiteOnly && plan.native && passed) passed = await all(() => run('elekloader:check'), () => run('modules:compat'))
// How full the committed Octatrack base is, against the buffer a base on a unit writes it through (scripts/base-size.mjs), and
// whether its base-bound packages name it (scripts/base-bound.mjs): both follow a base change, so one run names both.
if (!buildOnly && !suiteOnly && !documentationOnly && passed && (!scope || scope.base)) {
  try { console.log(checkBaseSize(root)) } catch (error) { problem('Base size', 'Base size: ' + error.message); passed = false }
  try { console.log(checkBaseBound(root)) } catch (error) { problem('Base bound', error.message); passed = false }
}
// Finish generated notice/catalog/media writes before lint, tests, typecheck or bundling read them.
// The bundle imports the generated media too, so a frontend-only change needs the writes as much as a module change does.
if (passed && !documentationOnly && (plan.metadata || plan.bundle)) passed = await run('licenses:generate') && await run('machines:generate') && await run('modules:generate')
// Every path, including documentation-only checks and release builds, requires current-version notes and documents within their size.
if (passed && !suiteOnly) passed = await changelogs()
// In a pull request's CI run, a contributor's module pull request carries no check that judges modules and no base change;
// pr:ready says the same to everyone before they push.
if (passed && !suiteOnly && base && process.env.GITHUB_EVENT_PATH) {
  const pull = (() => { try { return JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8')).pull_request ?? null } catch { return null } })()
  const files = execFileSync('git', ['diff', '--name-only', '--no-renames', base + '...HEAD'], { cwd: root, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 }).split('\n').filter(Boolean)
  const problems = pull ? moduleScopeProblems(files, { author: pull.user?.login, owner: process.env.GITHUB_REPOSITORY_OWNER, openedAt: pull.created_at }) : []
  for (const line of problems) problem('Module scope', 'Module scope: ' + line)
  if (problems.length) passed = false
}
// The agent board's claims (docs/AGENT_BOARD.md): a module, hook or migration this branch adds that someone else holds fails it;
// an unreachable board only warns, so an outage never blocks a pull request.
if (passed && !suiteOnly && base) passed = await run('board', ['check', '--base', base])
// Documentation uses the same import policy as publication without running firmware gates. The catalogue tests read Markdown
// (the module guides' links, the agent files, the pull request template), so a prose-only change can break them and must run them;
// so does the starter-prompts test, which holds AGENTS.md and the skills to their contributor-protecting rules.
if (passed && !suiteOnly && plan.docContracts && !plan.sdk) passed = await run('sdk:imports:check')
if (passed && !suiteOnly && documentationOnly) passed = await run('test', ['src/catalog', 'src/community/starter-prompts.test.ts'])
// module:doctor --draft copies a draft under sdk/octatrack/modules/ for its run, where the SDK suite, the other test files and the
// build would read it as a listed module. Its test waits out that parallel stage and runs alone after it.
const DRAFT_DOCTOR = ['scripts/module-doctor.test.mjs', '-t', 'checks a draft where every gate looks']
if (passed && !documentationOnly) {
  const tests = async (args = []) => {
    const files = plan.full ? [] : filesForShard(await affectedTests(root, scope, plan), part)
    if (!plan.full && !files.length) return skip('test', 'no affected Vitest files')
    if (!plan.full) console.log('Affected Vitest files (' + files.length + '): ' + files.join(', '))
    const testArgs = plan.full ? args : files
    return await run('test', testArgs, { MODWERK_DEFER_DRAFT_DOCTOR: '1' }) || rerunAlone(testArgs)
  }
  const sdk = () => plan.sdk ? run('sdk:check') : skip('sdk:check', 'no changed path reaches it')
  async function appChecks() {
    const steps = []
    if (plan.lint) steps.push(() => run('lint', plan.full ? [] : plan.lintFiles))
    if (plan.types || plan.bundle) steps.push(async () =>
      (!plan.types || await run('typecheck')) && (!plan.bundle || await run('build:bundle')))
    if (part === 'contract' && plan.inline) steps.push(() => tests())
    // The SDK runs after Vitest even if a test failed so the check reports both suites' results.
    if (!part) steps.push(async () => {
      const tested = await tests()
      const sdkPassed = await sdk()
      return tested && sdkPassed
    })
    if (!process.env.CI && !appStagesFit(part ? 0 : Number(process.env.MODWERK_TEST_WORKERS))) {
      console.log('Running the app check stages one at a time to fit available memory.')
      return all(...steps)
    }
    return (await Promise.all(steps.map(step => step()))).every(Boolean)
  }
  const results = buildOnly ? [await build()]
    : part === 'sdk' ? [await run('sdk:check')]
    : suiteOnly ? [await tests(['--shard=' + part.slice(5)])]
    : [await appChecks()]
  if (!buildOnly && !suiteOnly && plan.doctor) results.push(await run('test', DRAFT_DOCTOR))
  passed = results.every(Boolean) && !interrupted
}
const passedNow = [...carried, ...[...results].filter(([, ok]) => ok).map(([key]) => key)].filter(key => results.get(key) !== false)
try {
  mkdirSync(fileURLToPath(new URL('../node_modules/.cache/', import.meta.url)), { recursive: true })
  writeFileSync(record, JSON.stringify({ base, build: buildOnly, passed: [...new Set(passedNow)] }) + '\n')
} catch { /* the record only speeds up a rerun */ }
const queued = (started - requested) / 1000
console.log(`${buildOnly ? 'Build' : documentationOnly ? 'Documentation check' : 'Check'} ${passed ? 'passed' : 'FAILED'} in ${((performance.now() - requested) / 1000).toFixed(2)}s${queued >= 1 ? ` (including ${queued.toFixed(1)}s waiting for a slot)` : ''}`)
// The verdict's own lines say what failed and each one's first error; the rest of that check's output is above, under its name.
// Vitest can fail twice (the full run, then its failed files alone): the first run's cause stands for both.
const failed = new Map()
for (const [name, cause] of failures.values()) if (!failed.has(name)) failed.set(name, cause)
if (!passed && failed.size) {
  console.log(`Failed: ${[...failed.keys()].join(', ')}`)
  for (const [name, cause] of failed) console.log(`${process.env.GITHUB_ACTIONS ? `::error title=${name} failed::` : `  ${name}: `}${cause}`)
} else if (!passed && interrupted) console.log('Stopped before it finished: no check failed.')
if (flaky.length) console.log(`${process.env.GITHUB_ACTIONS ? '::warning title=Flaky tests::' : ''}Failed in the full run and passed alone, so they did not fail the check: ${flaky.join(', ')}. A file listed here run after run needs its own fix.`)
if (skipped.length) console.log(`Rerun: ${skipped.join(', ')} passed in the last run and did not run now. Run the full check (or pr:ready) before you push.`)
if (!passed && !process.exitCode) process.exitCode = 1
