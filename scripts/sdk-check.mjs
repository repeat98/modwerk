import { spawn } from 'node:child_process'
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { availableParallelism } from 'node:os'
import { performance } from 'node:perf_hooks'
import { fileURLToPath } from 'node:url'
import { resolve, dirname } from 'node:path'
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const python = process.platform === 'win32' ? 'python' : 'python3'
// Repository text is UTF-8, including on Windows hosts with an ANSI locale.
const unittest = { PYTHONDONTWRITEBYTECODE: '1', PYTHONUTF8: '1' }
// One unittest process per test file, on half the cores (at most 4), since npm run check runs Vitest's workers beside it:
// in one process the suite took minutes, and more processes starve Vitest's timed tests on a 4-core CI runner.
const jobs = readdirSync(resolve(root, 'sdk/tests')).filter(file => /^test.*\.py$/.test(file))
  .map(file => ({ name: file, command: python, args: ['-X', 'utf8', '-B', '-m', 'unittest', 'discover', '-s', 'sdk/tests', '-p', file, '-v'], env: unittest }))
// Shared Octatrack host checks (no firmware, a few seconds): here, on every pull request, so a change that breaks them
// fails itself instead of every later module pull request (they ran only in module-pr.yml's octatrack-source before).
if (process.platform !== 'win32') jobs.push(
  { name: 'sdk/runtime/upload/tests/run_host.sh', command: 'sh', args: ['sdk/runtime/upload/tests/run_host.sh'], env: {} },
  { name: 'sdk/machines/octatrack/elekloader/test_recipe.py', command: python, args: ['-B', 'sdk/machines/octatrack/elekloader/test_recipe.py'], env: { PYTHONDONTWRITEBYTECODE: '1' } })
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
const workers = Math.max(1, Math.min(4, Math.floor(availableParallelism() / 2))), started = performance.now(), failed = [], count = jobs.length, taken = {}
let tests = 0
async function worker() {
  for (let job; (job = jobs.shift());) {
    const output = [], begun = performance.now()
    const code = await new Promise(done => {
      const child = spawn(job.command, job.args, { cwd: root, env: { ...process.env, ...job.env } })
      children.add(child)
      child.stdout.on('data', chunk => output.push(chunk))
      child.stderr.on('data', chunk => output.push(chunk))
      child.on('error', error => { output.push(Buffer.from(error.message + '\n')); done(1) })
      child.on('close', code => { children.delete(child); done(code) })
    })
    taken[job.name] = Math.round(performance.now() - begun) / 1000
    // Each job's output whole, so concurrent results stay readable. A test may run unittest itself: its own count is the last.
    const text = Buffer.concat(output).toString()
    process.stdout.write(text)
    tests += Number([...text.matchAll(/^Ran (\d+) tests? in /gm)].at(-1)?.[1] ?? 0)
    if (code !== 0) failed.push(job.name)
  }
}
await Promise.all(Array.from({ length: workers }, worker))
try {
  mkdirSync(dirname(record), { recursive: true })
  writeFileSync(record, JSON.stringify(taken) + '\n')
} catch { /* the record only orders the next run */ }
console.log(`SDK checks: ${tests} tests in ${count} jobs, ${workers} at a time, in ${((performance.now() - started) / 1000).toFixed(1)}s`)
if (failed.length) {
  console.error('SDK checks FAILED: ' + failed.join(', '))
  process.exitCode = 1
}
