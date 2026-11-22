import { execFileSync } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { existsSync, linkSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { cases, findCase } from './cases.mjs'
import { grade } from './grade.mjs'

const root = fileURLToPath(new URL('../../', import.meta.url))
const git = (...args) => execFileSync('git', args, { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] })
const suite = createHash('sha256')
const guides = new Set(cases.map(item => item.guide).filter(Boolean))
for (const file of ['cases.mjs', 'grade.mjs', 'run.mjs', ...guides]) suite.update(readFileSync(new URL(file, import.meta.url)))
const suiteId = suite.digest('hex')

function revision(item, fixed, remote) {
  const ref = fixed ? item.merge : item.merge + '^1'
  try { return git('rev-parse', '--verify', `${ref}^{commit}`).toString().trim() } catch {
    if (!remote) throw new Error(`Missing replay history for ${item.id}. Fetch the full main branch history.`)
    git('fetch', '--no-tags', '--depth=2', remote, item.merge)
    return git('rev-parse', '--verify', `${ref}^{commit}`).toString().trim()
  }
}

function prepare(item, directory, fixed = false, remote) {
  const ref = revision(item, fixed, remote)
  mkdirSync(dirname(directory), { recursive: true })
  const stage = mkdtempSync(join(dirname(directory), '.prepare-'))
  try {
    for (const name of item.files) {
      mkdirSync(dirname(join(stage, name)), { recursive: true })
      writeFileSync(join(stage, name), git('show', `${ref}:${name}`))
    }
    const guide = item.guide ? '\n' + readFileSync(new URL(item.guide, import.meta.url), 'utf8') : ''
    writeFileSync(join(stage, 'TASK.md'), `${item.task}\n\nWork only with this snapshot. Make the fix in ${item.files[0]}. Use the supplied files and your own checks. Finish after editing the snapshot.\n${guide}`)
    renameSync(stage, directory)
  } finally { rmSync(stage, { recursive: true, force: true }) }
}

/** The replay folders of this checkout's other worktrees: one computer keeps one score per case. */
function otherWorktrees() {
  const paths = git('worktree', 'list', '--porcelain').toString().split('\n').filter(line => line.startsWith('worktree ')).map(line => line.slice(9))
  return paths.filter(path => resolve(path) !== resolve(root)).map(path => join(path, '.claude/agent-evals'))
}

/** A score this computer already has for the case on this suite, from any tree: the same snapshot, solved before. */
function solvedBefore(directories, id) {
  for (const directory of directories) {
    if (!existsSync(directory)) continue
    for (const tree of readdirSync(directory)) {
      const file = join(directory, tree, suiteId, 'result.json')
      const record = existsSync(file) && JSON.parse(readFileSync(file, 'utf8'))
      if (record?.case === id) return { ...record, file }
    }
  }
}

// The same tree reaches this point both before and after --commit. Keep the first observation on retries, and on a new
// tree whose case this computer has already scored on this suite (owner, 21 November 2026: one session got eight
// assignments of three cases as its tree and main moved).
export function localReplay(tree, remote, agent, { directory = join(root, '.claude/agent-evals'), snapshot = prepare, elsewhere = otherWorktrees } = {}) {
  const item = cases[parseInt(tree.slice(0, 8), 16) % cases.length]
  const attempt = join(directory, tree, suiteId), workspace = join(attempt, 'work'), resultFile = join(attempt, 'result.json')
  const earlier = !existsSync(resultFile) && !existsSync(workspace) && solvedBefore([directory, ...elsewhere()], item.id)
  if (earlier) {
    console.log(`Agent replay ${item.id}: ${earlier.passed ? 'pass' : 'fail'}, scored before on this computer (${earlier.file})`)
    return true
  }
  if (!existsSync(workspace)) {
    try { snapshot(item, workspace, false, remote) } catch (error) {
      if (!['EEXIST', 'ENOTEMPTY'].includes(error.code) || !existsSync(workspace)) throw error
    }
    // A model label carried over from an earlier tree cannot submit a fresh, untouched assignment.
    agent = null
  }
  if (!existsSync(resultFile) && !agent?.trim()) {
    console.log(`Coding agent replay: read ${join(workspace, 'TASK.md')} and solve it in that directory. Then repeat the same pr:ready command with --eval-agent "<your tool and model>". An unsuccessful attempt counts. The first score is kept locally.`)
    return false
  }
  if (!existsSync(resultFile)) {
    const report = { suite: suiteId, tree, agent: agent.trim(), ...grade(item.id, workspace) }
    const file = join(attempt, `result-${randomUUID()}.tmp`)
    writeFileSync(file, JSON.stringify(report, null, 2) + '\n')
    try { linkSync(file, resultFile) } catch (error) { if (error.code !== 'EEXIST') throw error } finally { rmSync(file) }
  }
  const record = JSON.parse(readFileSync(resultFile, 'utf8'))
  console.log(`Agent replay ${item.id}: ${record.passed ? 'pass' : 'fail'} (${resultFile})`)
  return true
}

function verify() {
  const folder = mkdtempSync(join(tmpdir(), 'modwerk-eval-'))
  try {
    for (const item of cases) {
      const observed = []
      for (const fixed of [false, true]) {
        const dir = join(folder, `${item.id}-${fixed}`)
        prepare(item, dir, fixed)
        observed.push(grade(item.id, dir))
      }
      const [before, after] = observed
      console.log(`${item.id}: before ${before.checks.filter(c => c.passed).length}/${before.checks.length}, merged ${after.checks.filter(c => c.passed).length}/${after.checks.length}`)
      if (before.passed || !before.checks.some(c => c.passed) || !after.passed) throw new Error(`Invalid controls: ${JSON.stringify(observed)}`)
    }
  } finally { rmSync(folder, { recursive: true, force: true }) }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const [command, id, directory] = process.argv.slice(2)
  if (command === 'list') console.log(JSON.stringify(cases.map(c => c.id)))
  else if (command === 'suite') console.log(suiteId)
  else if (command === 'verify') verify()
  else if (command === 'prepare' && directory && !existsSync(directory)) prepare(findCase(id), resolve(directory))
  else throw new Error('Usage: agent:eval -- list | verify | suite | prepare CASE NEW_DIRECTORY')
}
