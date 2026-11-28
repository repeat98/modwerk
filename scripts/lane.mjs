// Lanes: a few worktrees you keep and reuse, instead of a new worktree with its own npm ci for every task.
//
//   npm run lane -- <name> [--branch <new-branch>] [--base <ref>]   # make the lane, or reset a clean one to current main
//   npm run lane -- list [--all]                                    # lanes (--all: every worktree of this clone)
//   npm run lane -- prune [--all] [--yes]                           # remove clean lanes whose work is all pushed
//   npm run lane -- tidy                                            # when the disk runs low, prune --all --yes the ones idle for a day
//
// Lanes live in the clone's ignored .claude/worktrees/. A new lane borrows node_modules from a worktree whose install
// matches its package-lock.json, as hard links (Linux) or APFS clones (macOS), seconds and almost no disk, else runs npm ci.
// Never npm install in a lane with borrowed modules: remove its node_modules and run npm ci instead.
import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync, readlinkSync, rmSync, statSync, statfsSync } from 'node:fs'
import { dirname, join, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { takeSlot } from './machine-slots.mjs'

const GB = 1024 ** 3
// GIT_OPTIONAL_LOCKS=0: git status never rewrites a worktree's index, whose age tells tidy when it was last used.
const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' } }).trim()
const freeGb = path => { const { bavail, bsize } = statfsSync(path); return bavail * bsize / GB }

/** Whether npm's record of an installed tree (node_modules/.package-lock.json) is the install of this package-lock.json. */
export function installMatches(lock, installed) {
  const want = lock?.packages, have = installed?.packages
  if (!want || !have) return false
  const same = (a, b) => a.version === b.version && (a.link ? a.resolved === b.resolved : true)
  for (const [path, entry] of Object.entries(want)) {
    if (path === '') continue
    // An optional package for another platform (an esbuild or rolldown binary) is in the lock file but never installed.
    if (!have[path]) { if (entry.optional || entry.devOptional && entry.os) continue; return false }
    if (!same(entry, have[path])) return false
  }
  return Object.keys(have).every(path => want[path])
}

/** The refusal for resetting a worktree, or null when it is safe: nothing uncommitted, every commit on a remote. */
export function resetProblem({ dirty, unpushed }) {
  if (dirty) return 'it has uncommitted changes: commit or remove them first'
  if (unpushed) return `it has ${unpushed} commit(s) that are on no remote: push them first`
  return null
}

function worktrees(cwd) {
  const out = git(cwd, 'worktree', 'list', '--porcelain'), list = []
  for (const block of out.split('\n\n')) {
    const path = block.match(/^worktree (.+)$/m)?.[1]
    if (path) list.push({ path, branch: block.match(/^branch refs\/heads\/(.+)$/m)?.[1] ?? null, locked: /^locked/m.test(block), bare: /^bare$/m.test(block) })
  }
  return list
}

function state(path, main) {
  const dirty = !!git(path, 'status', '--porcelain')
  let unpushed = Number(git(path, 'rev-list', '--count', 'HEAD', '--not', '--remotes'))
  // A squash-merged branch whose remote branch GitHub deleted: its commits are on no remote, but main already holds all of it.
  if (unpushed && main && inMain(path, main)) unpushed = 0
  return { dirty, unpushed }
}

/** Whether merging HEAD into main changes nothing (a conflict counts as a change). */
function inMain(path, main) {
  try { return git(path, 'merge-tree', '--write-tree', main, 'HEAD').split('\n')[0] === git(path, 'rev-parse', `${main}^{tree}`) } catch { return false }
}

// Working directories of running processes, so prune never takes a worktree a server or session works in.
function busyPaths() {
  const paths = new Set()
  if (process.platform === 'darwin') {
    const out = spawnSync('lsof', ['-a', '-d', 'cwd', '-Fn'], { encoding: 'utf8' }).stdout ?? '' // one n<path> line per process
    for (const line of out.split('\n')) if (line.startsWith('n')) paths.add(line.slice(1))
    return paths
  }
  let pids
  try { pids = readdirSync('/proc').filter(name => /^\d+$/.test(name)) } catch { return paths }
  for (const pid of pids) try { paths.add(readlinkSync(`/proc/${pid}/cwd`)) } catch { /* gone or not ours */ }
  return paths
}
const inside = (path, root) => path === root || path.startsWith(root + sep)

function baseRef(cwd) {
  const remote = git(cwd, 'remote').split('\n').includes('upstream') ? 'upstream' : 'origin'
  return { remote, ref: `${remote}/main` }
}

function npm(cwd, args) {
  const cli = process.env.npm_execpath
  const result = cli ? spawnSync(process.execPath, [cli, ...args], { cwd, stdio: 'inherit' }) : spawnSync('npm', args, { cwd, stdio: 'inherit', shell: process.platform === 'win32' })
  if (result.status !== 0) throw new Error(`npm ${args.join(' ')} failed in ${cwd}`)
}

async function modules(lane, all) {
  const lock = JSON.parse(readFileSync(join(lane, 'package-lock.json'), 'utf8'))
  const readInstall = dir => { try { return JSON.parse(readFileSync(join(dir, 'node_modules', '.package-lock.json'), 'utf8')) } catch { return null } }
  if (installMatches(lock, readInstall(lane))) return 'current'
  rmSync(join(lane, 'node_modules'), { recursive: true, force: true })
  const donor = all.find(w => w.path !== lane && installMatches(lock, readInstall(w.path)))
  const copy = { linux: ['-al'], darwin: ['-cR'] }[process.platform] // hard links; APFS clones, copy-on-write
  if (donor && copy) {
    const copied = spawnSync('cp', [...copy, join(donor.path, 'node_modules'), join(lane, 'node_modules')], { stdio: 'inherit' })
    if (copied.status === 0) {
      // Caches stay per worktree: the last check's results and the build caches describe the donor's files, not the lane's.
      for (const cache of ['.cache', '.vite', '.vitest']) rmSync(join(lane, 'node_modules', cache), { recursive: true, force: true })
      return `${copy[0] === '-al' ? 'hard links' : 'APFS clones'} from ${donor.path}`
    }
    rmSync(join(lane, 'node_modules'), { recursive: true, force: true })
  }
  const release = await takeSlot('npm ci (lane)')
  try { npm(lane, ['ci']) } finally { release() }
  return 'npm ci'
}

async function lane(root, name, { branch, base }) {
  if (!/^[a-z0-9][a-z0-9._-]*$/i.test(name)) throw new Error('Name a lane with letters, digits, dots, dashes or underscores.')
  tidy(root)
  const minimum = Number(process.env.MODWERK_LANE_MIN_FREE_GB ?? 5)
  const free = freeGb(root)
  if (free < minimum) throw new Error(`Only ${free.toFixed(1)} GB free on this disk (a lane wants ${minimum}, MODWERK_LANE_MIN_FREE_GB to change). Prune lanes first: npm run lane -- prune --all`)
  const { remote, ref } = baseRef(root)
  const target = base ?? ref
  git(root, 'fetch', '--quiet', remote, 'main')
  const path = join(root, '.claude', 'worktrees', name)
  if (existsSync(path)) {
    const problem = resetProblem(state(path, target))
    if (problem) throw new Error(`Lane ${name} was left as it is: ${problem}.`)
    git(path, 'switch', '--quiet', ...(branch ? ['-c', branch] : ['--detach']), target)
  } else {
    git(root, 'worktree', 'add', '--quiet', ...(branch ? ['-b', branch] : ['--detach']), path, target)
  }
  const how = await modules(path, worktrees(root))
  npm(path, ['run', 'prepare'])
  console.log(`Lane ${name} is at ${target}${branch ? ` on ${branch}` : ''}: ${path} (node_modules: ${how}).`)
}

const cloneRoot = cwd => dirname(resolve(cwd, git(cwd, 'rev-parse', '--git-common-dir')))

function list(root, all) {
  const lanes = join(root, '.claude', 'worktrees')
  return worktrees(root).filter(w => !w.bare && w.path !== root && (all || inside(w.path, lanes)))
}

// Hours since a worktree's HEAD, index or reflog last changed.
function idleHours(path) {
  const dir = resolve(path, git(path, 'rev-parse', '--git-dir'))
  const newest = Math.max(...['HEAD', 'index', 'logs/HEAD'].map(file => { try { return statSync(join(dir, file)).mtimeMs } catch { return 0 } }))
  return (Date.now() - newest) / 3600e3
}

function prune(root, { all, yes, idle = 0, quiet = false }) {
  const busy = [...busyPaths()], removed = [], { ref } = baseRef(root)
  for (const w of list(root, all)) {
    let why = w.locked ? 'locked' : busy.some(p => inside(p, w.path)) ? 'a running process works in it' : null
    if (!why) try { why = idle && idleHours(w.path) < idle ? `used in the last ${idle} h` : resetProblem(state(w.path, ref)) } catch (error) { why = error.message.split('\n')[0] }
    if (!why && yes) try { git(root, 'worktree', 'remove', w.path) } catch (error) { why = error.message.split('\n')[0] }
    if (why) { if (!quiet) console.log(`keep    ${w.path} (${why})`); continue }
    removed.push(w.path)
    console.log(`${yes ? 'removed' : 'remove '} ${w.path}${w.branch ? ` (${w.branch})` : ''}`)
  }
  if (!yes && removed.length) console.log(`Nothing removed yet: run again with --yes to remove these ${removed.length}.`)
}

// Run by Claude Code's SessionStart hook (.claude/settings.json), pr:ready and every new lane, so any agent's session cleans
// up, with the owner's standing OK (21 November 2026): a disk that runs low loses the worktrees nobody can miss, whose work
// is all pushed or already in main and which nobody used for a day.
export function tidy(root = cloneRoot(process.cwd())) {
  const below = Number(process.env.MODWERK_TIDY_BELOW_GB ?? 30)
  if (freeGb(root) >= below) return
  console.log(`Only ${freeGb(root).toFixed(1)} GB free: removing the worktrees that are clean, pushed and unused for 24 h.`)
  prune(root, { all: true, yes: true, idle: 24, quiet: true })
  const free = freeGb(root)
  if (free < below) console.log(`Still only ${free.toFixed(1)} GB free. Tell the developer, and show them the worktrees with uncommitted or unpushed work: npm run lane -- list --all`)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2), flag = name => args.includes(name)
  const value = name => { const i = args.indexOf(name); return i < 0 ? undefined : args[i + 1] }
  const root = cloneRoot(process.cwd())
  try {
    if (args[0] === 'list') for (const w of list(root, flag('--all'))) {
      const s = state(w.path, baseRef(root).ref)
      console.log(`${w.path}  ${w.branch ?? '(detached)'}${s.dirty ? '  uncommitted' : ''}${s.unpushed ? `  ${s.unpushed} unpushed` : ''}`)
    }
    else if (args[0] === 'prune') prune(root, { all: flag('--all'), yes: flag('--yes') })
    else if (args[0] === 'tidy') tidy(root)
    else if (args[0] && !args[0].startsWith('-')) await lane(root, args[0], { branch: value('--branch'), base: value('--base') })
    else { console.error('Usage: npm run lane -- <name> [--branch <b>] [--base <ref>] | list [--all] | prune [--all] [--yes] | tidy'); process.exitCode = 2 }
  } catch (error) {
    console.error(error.message)
    process.exitCode = 1
  }
}
