import { spawn } from 'node:child_process'
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { availableParallelism, setPriority } from 'node:os'
import { performance } from 'node:perf_hooks'
import { skipsOf, skipReport } from './sdk-skips.mjs'
import { listedModuleTests, moduleTestCommand } from './module-tests.mjs'
import { fileURLToPath } from 'node:url'
import { resolve, dirname } from 'node:path'
import { takeSlot, workersFor } from './machine-slots.mjs'
import { mirrorOctatrackModules } from './mirror-octatrack-modules.mjs'
import { asanToolchain } from './asan-preflight.mjs'
import { m68kToolchainProblem } from './m68k-preflight.mjs'
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
// octabam's tools read the untracked mirror of sdk/octatrack/modules; make it current first.
mirrorOctatrackModules(root)
const python = process.platform === 'win32' ? 'python' : 'python3'
// Repository text is UTF-8, including on Windows hosts with an ANSI locale.
const unittest = { PYTHONDONTWRITEBYTECODE: '1', PYTHONUTF8: '1' }
// One unittest process per test file, up to four at once: in one process, the suite took minutes.
const jobs = readdirSync(resolve(root, 'sdk/tests')).filter(file => /^test.*\.py$/.test(file))
  .map(file => ({ name: file, command: python, args: ['-X', 'utf8', '-B', '-m', 'unittest', 'discover', '-s', 'sdk/tests', '-p', file, '-v'], env: unittest }))
// Each listed module's host tests (scripts/module-tests.mjs), so a shared-SDK change that breaks one fails itself. They compile with
// the host's C compiler, as the host checks below do.
if (process.platform !== 'win32') jobs.push(...listedModuleTests(root).map(file => ({ name: file, ...moduleTestCommand(file) })))
// Shared Octatrack host checks (no firmware, a few seconds): here, on every pull request, so a change that breaks them
// fails itself instead of every later module pull request (they ran only in module-pr.yml's octatrack-source before).
if (process.platform !== 'win32') jobs.push(
  { name: 'sdk/runtime/upload/tests/run_host.sh', command: 'sh', args: ['sdk/runtime/upload/tests/run_host.sh'], env: {} },
  { name: 'sdk/machines/octatrack/elekloader/test_recipe.py', command: python, args: ['-B', 'sdk/machines/octatrack/elekloader/test_recipe.py', '-v'], env: { PYTHONDONTWRITEBYTECODE: '1' } })
// The slowest jobs of the last run start first, so none starts last; a job without a time is new and starts before them.
const record = resolve(root, 'node_modules/.cache/sdk-check-times.json')
let times = {}
try { times = JSON.parse(readFileSync(record, 'utf8')) } catch { /* no earlier run */ }
jobs.sort((a, b) => (times[b.name] ?? Infinity) - (times[a.name] ?? Infinity))

const children = new Set()
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => {
  for (const child of children) child.kill(signal)
  process.exit(signal === 'SIGINT' ? 130 : 143)
})
// Alone it takes a slot (scripts/machine-slots.mjs); inside npm run check, which holds one, it takes none. Then up to four
// jobs, fewer when free memory is short: a test that starts a compiler or an emulator needs about a gigabyte.
await takeSlot('npm run sdk:check')
// Before any job: a compiler without its binutils would fail every ColdFire test, one file at a time (scripts/m68k-preflight.mjs).
const m68k = m68kToolchainProblem()
if (m68k) { console.error('SDK checks FAILED before any job: ' + m68k); process.exit(1) }
// Before any job: on macOS, tools whose AddressSanitizer programs hang would keep this from ever finishing (scripts/asan-preflight.mjs).
let toolchain
try { toolchain = asanToolchain() } catch (error) { console.error('SDK checks FAILED before any job: ' + error.message); process.exit(1) }
if (toolchain.note) console.log(toolchain.note)
const workers = workersFor({ most: Math.min(4, availableParallelism()), each: 1024 ** 3 }), started = performance.now(), failed = [], count = jobs.length, taken = {}
let executed = 0
const skips = []
async function worker() {
  for (let job; (job = jobs.shift());) {
    const output = [], begun = performance.now()
    const code = await new Promise(done => {
      const child = spawn(job.command, job.args, { cwd: root, env: { ...process.env, ...toolchain.env, ...job.env } })
      children.add(child)
      // Below normal priority (the compilers and emulators a test starts inherit it), so Vitest's five-second tests, from another
      // worktree's check too, get the cores first. Alone, these processes still take every free core.
      try { setPriority(child.pid, 10) } catch { /* already exited */ }
      child.stdout.on('data', chunk => output.push(chunk))
      child.stderr.on('data', chunk => output.push(chunk))
      child.on('error', error => { output.push(Buffer.from(error.message + '\n')); done(1) })
      child.on('close', code => { children.delete(child); done(code) })
    })
    taken[job.name] = Math.round(performance.now() - begun) / 1000
    // Each job's output whole, so concurrent results stay readable. A test may run unittest itself: its own count is the last.
    const text = Buffer.concat(output).toString()
    process.stdout.write(text)
    const total = Number([...text.matchAll(/^Ran (\d+) tests? in /gm)].at(-1)?.[1] ?? 0)
    const skipped = skipsOf(text)
    // unittest counts fixture skips separately from the individual cases in "Ran N tests".
    const skippedFixtures = [...text.matchAll(/^(?:setUp|tearDown)(?:Class|Module) .*? \.\.\. skipped /gm)].length
    executed += Math.max(0, total - skipped.length + skippedFixtures)
    skips.push(...skipped.map(reason => ({ job: job.name, reason })))
    if (code !== 0) failed.push(job.name)
  }
}
await Promise.all(Array.from({ length: workers }, worker))
try {
  mkdirSync(dirname(record), { recursive: true })
  writeFileSync(record, JSON.stringify(taken) + '\n')
} catch { /* the record only orders the next run */ }
for (const line of skipReport(skips).lines) console.log(line)
console.log(`SDK checks: ${executed} unittest cases executed, ${skips.length} skips in ${count} jobs, ${workers} at a time, in ${((performance.now() - started) / 1000).toFixed(1)}s`)
if (failed.length) {
  console.error('SDK checks FAILED: ' + failed.join(', '))
  process.exitCode = 1
}
