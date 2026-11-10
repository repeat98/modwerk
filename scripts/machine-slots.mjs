// Heavy local checks share one computer: every worktree and agent session of this clone takes a slot here before it starts
// one (npm run check, pr:ready, sdk:check), so two full checks never run at once on a laptop and run out of memory.
//
//   node scripts/machine-slots.mjs status    # who holds a slot, who waits, how much memory is free
//
// The number of slots follows the computer: one per 6 GB of memory and per 4 cores, at least one. A check that starts also
// sizes its own worker count to the memory that is free then (workersFor). MODWERK_SLOTS sets the number of slots
// (0 turns them off); CI runners are machines of their own and never wait.
import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { availableParallelism, freemem, tmpdir, totalmem } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const GB = 1024 ** 3, MB = 1024 ** 2
const HELD = 'MODWERK_SLOT_HELD'

/** How many heavy checks may run at once on a computer with this much memory and this many cores. */
export function slotCount({ memory = totalmem(), cores = availableParallelism(), env = process.env } = {}) {
  if (env.MODWERK_SLOTS !== undefined && env.MODWERK_SLOTS !== '') {
    const set = Number(env.MODWERK_SLOTS)
    if (!Number.isInteger(set) || set < 0) throw new Error('MODWERK_SLOTS must be a whole number (0 turns the slots off).')
    return set
  }
  return Math.max(1, Math.min(Math.floor(memory / (6 * GB)), Math.floor(cores / 4)))
}

/** Memory the system can still give a new process, in bytes: Linux's MemAvailable (free memory counts no page cache). */
export function availableMemory(meminfo = readMeminfo()) {
  const kb = meminfo?.match(/^MemAvailable:\s+(\d+) kB/m)?.[1]
  return kb ? Number(kb) * 1024 : freemem()
}
function readMeminfo() { try { return readFileSync('/proc/meminfo', 'utf8') } catch { return null } }

/** Workers for a parallel stage that needs about `each` bytes per worker beside `keep` bytes for the rest, from 1 to `most`. */
export function workersFor({ most, each, keep = GB, available = availableMemory(), cores = availableParallelism() }) {
  return Math.max(1, Math.min(most, cores, Math.floor((available - keep) / each)))
}

/** The slot directory, shared by every worktree of this clone (it lives in the clone's common Git directory). */
export function slotDirectory(cwd = process.cwd()) {
  try {
    const common = execFileSync('git', ['rev-parse', '--git-common-dir'], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
    return join(resolve(cwd, common), 'modwerk-slots')
  } catch {
    return join(tmpdir(), 'modwerk-slots')
  }
}

const alive = pid => {
  if (!Number.isInteger(pid) || pid <= 0) return false // kill(0) would signal our own process group
  try { process.kill(pid, 0); return true } catch (error) { return error.code === 'EPERM' }
}
function holder(slot) {
  try { return JSON.parse(readFileSync(join(slot, 'holder.json'), 'utf8')) } catch { /* not written yet, or never */ }
  // A taker writes its holder right after making the slot; one that died in between left a slot nobody holds.
  try { if (Date.now() - statSync(slot).mtimeMs > 30000) return { pid: 0 } } catch { /* already gone */ }
  return null
}

/** The current holders, one per taken slot, with stale ones (their process is gone) cleared. */
export function holders(directory = slotDirectory()) {
  let names
  try { names = readdirSync(directory).filter(name => /^slot-\d+$/.test(name)) } catch { return [] }
  const found = []
  for (const name of names.sort()) {
    const slot = join(directory, name), who = holder(slot)
    if (who && !alive(who.pid)) { rmSync(slot, { recursive: true, force: true }); continue }
    if (who) found.push({ slot: name, ...who })
  }
  return found
}

function tryTake(directory, count, what) {
  for (let i = 0; i < count; i++) {
    const slot = join(directory, `slot-${i}`)
    try { mkdirSync(slot) } catch (error) {
      if (error.code !== 'EEXIST') throw error
      const who = holder(slot)
      // A slot whose holder is gone is taken over; one just made, whose holder is not written yet, is busy.
      if (who && !alive(who.pid)) { rmSync(slot, { recursive: true, force: true }); i--; }
      continue
    }
    writeFileSync(join(slot, 'holder.json'), JSON.stringify({ pid: process.pid, cwd: process.cwd(), what, since: Date.now() }) + '\n')
    return slot
  }
  return null
}

/**
 * Waits for a slot and returns its release function (also called when the process exits). A check started by a check that
 * already holds a slot (sdk:check inside npm run check) takes none, so it never waits on its own parent.
 */
export async function takeSlot(what, { directory = slotDirectory(), env = process.env, poll = 3000, log = message => console.log(message) } = {}) {
  const count = slotCount({ env })
  if (env.CI || env[HELD] || count === 0) return () => {}
  mkdirSync(directory, { recursive: true })
  let said = false
  for (;;) {
    const slot = tryTake(directory, count, what)
    if (slot) {
      env[HELD] = '1'
      const release = () => rmSync(slot, { recursive: true, force: true })
      process.once('exit', release)
      if (said) log(`${what}: got a slot, starting.`)
      return () => { process.off('exit', release); release(); delete env[HELD] }
    }
    if (!said) {
      said = true
      const busy = holders(directory).map(h => `${h.what} in ${h.cwd} (pid ${h.pid}, ${Math.round((Date.now() - h.since) / 60000)} min)`)
      log(`${what}: waiting for a free slot (${count} on this computer, MODWERK_SLOTS to change). Running: ${busy.join('; ') || 'starting up'}.`)
    }
    await new Promise(done => setTimeout(done, poll))
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const command = process.argv[2] ?? 'status'
  if (command !== 'status') { console.error('Usage: node scripts/machine-slots.mjs status'); process.exit(2) }
  const directory = slotDirectory(), taken = holders(directory)
  console.log(`${slotCount()} slot(s) for heavy checks on this computer; ${Math.round(availableMemory() / MB)} MB memory available. Slots: ${directory}`)
  for (const h of taken) console.log(`  ${h.slot}  ${Math.round((Date.now() - h.since) / 60000)} min  pid ${h.pid}  ${h.what}  ${h.cwd}`)
  if (!taken.length) console.log('  all free')
}
