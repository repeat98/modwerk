import { spawn } from 'node:child_process'
import { performance } from 'node:perf_hooks'
import { fileURLToPath } from 'node:url'
import { readChangeScope } from './change-scope.mjs'
import { checkChangelog } from './changelog.mjs'
import { checkDocs } from './docs.mjs'
import { checkModuleChangelogs } from './module-changelogs.mjs'

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

async function run(name, args = []) {
  if (interrupted) return false
  const started = performance.now()
  console.log(`Starting ${name}`)
  return new Promise(resolve => {
    // Use npm's current CLI and Node runtime, preserving each script's flags and lifecycle hooks.
    const child = spawn(process.execPath, [npmCli, 'run', name, ...(args.length ? ['--', ...args] : [])], {
      cwd: root,
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
      resolve(passed)
    })
  })
}

async function build() {
  // A type error must still prevent bundling, as in the original build command.
  return await run('typecheck') && await run('build:bundle')
}

const started = performance.now()
const buildOnly = process.argv.includes('--build')
const baseIndex = process.argv.indexOf('--base'), base = baseIndex < 0 ? null : process.argv[baseIndex + 1]
if (baseIndex >= 0 && !base) throw new Error('--base requires a Git commit/ref')
const documentationOnly = !buildOnly && !!base && readChangeScope({ root, base }).documentation
async function changelogs() {
  let passed = true
  try {
    const notes = await checkModuleChangelogs(root)
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
// Documentation uses the same import policy as publication without running firmware gates. The catalogue tests read Markdown
// (the module guides' links, the agent files, the pull request template), so a prose-only change can break them and must run them.
if (passed && documentationOnly) passed = await run('sdk:imports:check') && await run('test', ['src/catalog'])
if (passed && !documentationOnly) {
  const results = buildOnly
    ? [await build()]
    : await Promise.all([run('sdk:check'), run('lint'), run('test'), build()])
  passed = results.every(Boolean) && !interrupted
}
console.log(`${buildOnly ? 'Build' : documentationOnly ? 'Documentation check' : 'Check'} ${passed ? 'passed' : 'FAILED'} in ${((performance.now() - started) / 1000).toFixed(2)}s`)
if (!passed && !process.exitCode) process.exitCode = 1
