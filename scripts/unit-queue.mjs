#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-or-later
// Taking turns on the connected unit. Every agent session and terminal of one user on one computer shares the one
// instrument on its USB, so whatever drives it (a trial, a RAM boot, a scripted pass, the owner playing it by hand) takes
// the turn here first. Everyone else waits in line in the order they came and starts by themselves when their turn comes
// (docs/UNIT_QUEUE.md).
//
//   npm run unit -- status [--json]                    # who has the unit, since when, for how long, and who waits
//   npm run unit -- hold [--for 30m] [--note "why"] [--priority "why"]   # keep it across several commands, or to play it by hand
//   npm run unit -- release [--force]                  # give this checkout's hold back (--force: end anyone's turn)
//   npm run unit -- run [--note "why"] [--expect 15m] [--keep 10m] [--priority "why"] -- COMMAND…
//                                                      # wait, run COMMAND, give the turn back however it ends
//
// --keep (or MODWERK_UNIT_KEEP for every command that takes the turn) keeps the turn this checkout's for that long after the
// command ends, so the session's next command (a rerun, the screenshots, the put-back) goes ahead and nobody else's starts
// in the gap; `release` gives it back sooner. --priority, the owner's call, puts the waiter first in line, ahead of everyone
// who came before it: they are told why, and whoever has the unit sees it in `status` (`priority` in --json) and in its
// command's output, to give the unit back at a safe point. Nothing is taken from a live turn; a kept turn with nothing of
// its own running gives way at once.
//
// The device commands take their turn by themselves (device.mjs, device-send.py, octatrack-test.py, octatrack-qualify.py,
// octatrack-price.mjs, octatrack-bootsoak.mjs and the frontend MCP's trial). A turn belongs to its process and to the
// processes it starts (MODWERK_UNIT_TURN); a hold belongs to its checkout, so the holder's later commands from the same
// worktree go ahead while everyone else's wait. A turn whose processes are gone ends at once. A live one past its expected
// end is reported, never taken over: that would end the trial it may be in the middle of. A hold past its time plus ten
// minutes, with nothing of its own running, ends once someone waits. MODWERK_UNIT_DIR moves the state (default: a
// per-user state folder, shared by every clone and worktree); MODWERK_UNIT=emulator skips the queue, since an emulator
// needs no turn.
import { execFileSync, spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, watch, writeFileSync } from 'node:fs'
import { constants, homedir } from 'node:os'
import { basename, join, resolve, win32 } from 'node:path'
import { fileURLToPath } from 'node:url'
// The signals that ask a running command to stop (below); SIGALRM only where the system has it.
const STOPS = ['SIGTERM', 'SIGHUP', 'SIGALRM'].filter(signal => signal in constants.signals)

const SECOND = 1000, MINUTE = 60 * SECOND
export const RUN_EXPECT = 15 * MINUTE, RUN_GRACE = 5 * MINUTE
export const HOLD_FOR = 30 * MINUTE, HOLD_GRACE = 10 * MINUTE, HOLD_MOST = 12 * 60 * MINUTE
const TURN = 'turn', HOLDER = 'holder.json', TICKET = /^wait-(\d{13})-(\d+)-([\da-f-]+)\.json$/

/** Where the queue lives: MODWERK_UNIT_DIR, else a per-user state folder outside every checkout. */
export function unitDirectory(env = process.env, platform = process.platform, home = homedir()) {
  if (env.MODWERK_UNIT_DIR) return resolve(env.MODWERK_UNIT_DIR)
  if (platform === 'win32') return join(env.LOCALAPPDATA || join(home, 'AppData', 'Local'), 'modwerk', 'unit-queue')
  if (platform === 'darwin') return join(home, 'Library', 'Application Support', 'modwerk', 'unit-queue')
  return join(env.XDG_STATE_HOME || join(home, '.local', 'state'), 'modwerk', 'unit-queue')
}

/** 90s, 20m, 1h30m; a bare number is minutes. */
export function parseDuration(text) {
  const value = String(text ?? '').trim().toLowerCase().replace(/\s+/g, '')
  if (/^\d+(\.\d+)?$/.test(value)) return Math.round(Number(value) * MINUTE)
  const parts = [...value.matchAll(/(\d+(?:\.\d+)?)(h|m|min|s)/g)]
  if (!value || parts.map(part => part[0]).join('') !== value) throw new Error(`Not a duration: ${text} (use 90s, 20m or 1h30m).`)
  return Math.round(parts.reduce((sum, [, n, unit]) => sum + Number(n) * { h: 60 * MINUTE, m: MINUTE, min: MINUTE, s: SECOND }[unit], 0))
}
export function formatDuration(ms) {
  const minutes = Math.round(ms / MINUTE)
  if (minutes < 1) return `${Math.max(1, Math.round(ms / SECOND))} s`
  return minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)} h${minutes % 60 ? ` ${minutes % 60} min` : ''}`
}
const clock = ms => new Date(ms).toTimeString().slice(0, 5)

/** Linux: when the process started, in clock ticks since boot, so a PID the system gave to a new process is not taken
 * for the old one. Elsewhere undefined, and the PID alone decides. */
function startTime(pid) {
  try { const stat = readFileSync(`/proc/${pid}/stat`, 'utf8'); return stat.slice(stat.lastIndexOf(')') + 2).split(' ')[19] } catch { return undefined }
}
export const processEntry = pid => ({ pid, start: startTime(pid) })
/** Whether the process an entry names still runs (EPERM: it runs, under another user). */
export function alive(entry) {
  const pid = entry?.pid
  if (!Number.isInteger(pid) || pid <= 0) return false // kill(0) would signal our own process group
  try { process.kill(pid, 0) } catch (error) { if (error.code !== 'EPERM') return false }
  if (!entry.start) return true
  const now = startTime(pid)
  return now === undefined || now === entry.start
}

/** The checkout a command runs in (its Git top level, else the folder) and its branch: a hold belongs to a checkout. */
export function checkoutOf(cwd = process.cwd()) {
  try {
    const [top, branch] = execFileSync('git', ['rev-parse', '--show-toplevel', '--abbrev-ref', 'HEAD'], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 5000 }).trim().split('\n')
    return { checkout: resolve(top), branch: branch === 'HEAD' ? '' : branch }
  } catch { return { checkout: resolve(cwd), branch: '' } }
}
const whoIs = ({ checkout, branch }, env) => env.MODWERK_UNIT_WHO || basename(checkout) + (branch ? ` (${branch})` : '')

function readJson(path) { try { return JSON.parse(readFileSync(path, 'utf8')) } catch { return null } }
/** Write by rename, so a reader never sees half a file (Windows refuses a rename onto a file being read: try again). */
function writeJson(path, value) {
  const temporary = `${path}.${randomUUID()}`
  writeFileSync(temporary, JSON.stringify(value) + '\n')
  for (let attempt = 0; ; attempt++) {
    try { renameSync(temporary, path); return } catch (error) {
      if (attempt >= 20 || !['EPERM', 'EBUSY', 'EACCES'].includes(error.code)) { rmSync(temporary, { force: true }); throw error }
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10)
    }
  }
}

/** The turn as it stands: its folder's age, its holder (null while it is being written) and the runs nested in it. */
export function readTurn(directory) {
  const folder = join(directory, TURN)
  let made
  try { made = statSync(folder).mtimeMs } catch { return null }
  const nested = []
  try {
    for (const name of readdirSync(folder)) if (/^nested-.+\.json$/.test(name)) { const entry = readJson(join(folder, name)); if (entry) nested.push(entry) }
  } catch { /* ended meanwhile */ }
  return { made, holder: readJson(join(folder, HOLDER)), nested }
}

/** What a turn means for everyone else: free, starting, dead (its processes are gone), or held, and if held, whether it is
 * past its end (late) and whether a waiter may end it (expired: a hold past its time and grace with nothing running). A
 * kept turn (run --keep) has no grace, and gives way at once to a priority waiter first in `line` (yields). */
export function judge(turn, now = Date.now(), line = []) {
  if (!turn) return { state: 'free' }
  const { holder, nested } = turn
  if (!holder) return now - turn.made > 30 * SECOND ? { state: 'dead', why: 'its holder never wrote itself down' } : { state: 'starting' }
  const running = nested.filter(entry => alive(entry) || alive(entry.child))
  if (holder.kind === 'hold') {
    const over = now - holder.until, yields = Boolean(holder.kept && line[0]?.priority && !running.length)
    return { state: 'held', running: running.length, over, late: over > 0, expired: yields || over > (holder.kept ? 0 : HOLD_GRACE) && !running.length, ...(yields ? { yields } : {}) }
  }
  if (!alive(holder) && !alive(holder.child)) return { state: 'dead', why: 'its process ended without giving the turn back' }
  const over = now - holder.since - holder.expectMs
  return { state: 'held', running: running.length, over, late: over > RUN_GRACE, expired: false }
}

/** End the turn whose holder has this id (null: one whose holder was never written). Moved aside first, so of two
 * processes ending it at once only one does, and a turn that changed hands meanwhile is put back. */
export function endTurn(directory, id) {
  const aside = join(directory, `ended-${randomUUID()}`)
  try { renameSync(join(directory, TURN), aside) } catch { return false }
  const moved = readJson(join(aside, HOLDER))?.id ?? null
  if (moved !== id) { try { renameSync(aside, join(directory, TURN)); return false } catch { /* a new turn exists: this one ended anyway */ } }
  rmSync(aside, { recursive: true, force: true })
  return true
}

/** The waiting line, oldest first; tickets of processes that are gone are dropped on the way. */
export function waiting(directory) {
  let names
  try { names = readdirSync(directory) } catch { return [] }
  const line = []
  for (const name of names.filter(name => TICKET.test(name)).sort()) {
    const [, since, pid] = TICKET.exec(name), entry = readJson(join(directory, name)) ?? { pid: Number(pid), since: Number(since) }
    if (!alive(entry)) { rmSync(join(directory, name), { force: true }); continue }
    line.push({ ticket: name, ...entry })
  }
  return line
}

const placeOf = entry => Number(TICKET.exec(entry.ticket)?.[1] ?? entry.since)
/** Where a priority ticket goes: behind the priority tickets already waiting, ahead of everyone else. The line is sorted by
 * the number in the ticket's name, in every version of this script, so a checkout on an older main keeps the order too. */
function priorityPlace(line, since) {
  const last = line.filter(entry => entry.priority).at(-1), next = line.find(entry => !entry.priority)
  if (!next) return since
  return Math.max(1, Math.min(last ? placeOf(last) + 1 : placeOf(next) - MINUTE, placeOf(next) - 1))
}

/** The waiter first in line when it waits with priority (the owner's call), else null. Whoever has the unit is asked to
 * give it back at a safe point: a script can read this between its steps (or `npm run unit -- status --json`, `priority`). */
export function priorityRequest(directory = unitDirectory(), line = waiting(directory)) {
  const first = line[0]
  return first?.priority ? { who: first.who, priority: first.priority, doing: doing(first), since: first.since, checkout: first.checkout } : null
}
const askedText = asked => `${asked.who} waits first in line with priority (${asked.priority})`

/** While a turn runs: say once per request when a priority waiter is first in line, so whoever reads this process's output
 * gives the unit back at a safe point. Nothing is stopped. Returns the function that stops watching. */
export function watchPriority(directory, log, every = 2 * SECOND) {
  let told = ''
  const timer = setInterval(() => {
    const asked = priorityRequest(directory), key = asked ? `${asked.since} ${asked.who}` : ''
    if (asked && key !== told) log(`The unit is asked for: ${askedText(asked)}. Give it back at a safe point: let this command finish, or stop it the usual way. Nothing takes the unit from it (npm run unit -- status).`)
    told = key
  }, every)
  timer.unref?.()
  return () => clearInterval(timer)
}

/** After a run's command ended: the run's turn becomes a hold of its checkout for `ms` (kept), so the checkout's next command
 * goes ahead and nobody else's starts in the gap. A priority waiter first in line gets the unit instead. */
function keepTurn(directory, id, ms) {
  const asked = priorityRequest(directory)
  if (asked) { endTurn(directory, id); return { kept: false, asked } }
  const file = join(directory, TURN, HOLDER), holder = readJson(file)
  if (holder?.id !== id) return { kept: false } // ended or changed hands meanwhile
  const until = Date.now() + ms, hold = { ...holder, kind: 'hold', kept: true, until }
  delete hold.child; delete hold.expectMs // a hold belongs to its checkout, not to the run's processes
  try { writeJson(file, hold) } catch { return { kept: false } }
  return { kept: true, until }
}

const doing = entry => entry.note || entry.command || 'no note'
function holderLines(turn, verdict, now, asked) {
  const h = turn.holder, lines = []
  lines.push(`The unit is in use: ${h.who} has it since ${clock(h.since)} (${formatDuration(now - h.since)}).`)
  lines.push(`  doing: ${doing(h)}${h.command && h.note ? `  [${h.command}]` : ''}`)
  lines.push(`  in ${h.checkout}`)
  if (h.kind === 'hold' && h.kept) {
    lines.push(`  kept for this checkout's next command until ${clock(h.until)}${verdict.running ? `, with ${verdict.running} command(s) of its own running` : ''}`)
    if (verdict.yields) lines.push(`  It gives way to ${asked.who}'s priority: nothing of its own runs.`)
    else if (verdict.late) lines.push(`  OVER ITS TIME by ${formatDuration(verdict.over)}. ${verdict.expired ? 'The next one in line takes over.' : 'Something of its own still runs, so it keeps the unit.'}`)
  } else if (h.kind === 'hold') {
    lines.push(`  a hold until ${clock(h.until)}${verdict.running ? `, with ${verdict.running} command(s) of its own running` : ''}`)
    if (verdict.late) lines.push(`  OVER ITS TIME by ${formatDuration(verdict.over)}. ${verdict.expired ? 'The next one in line takes over.' : verdict.running ? 'Something of its own still runs, so it keeps the unit.' : `Once ${formatDuration(HOLD_GRACE - verdict.over)} more pass, the next one in line takes over.`}`)
  } else {
    lines.push(`  run by PID ${h.pid}${h.child ? ` (command PID ${h.child.pid})` : ''}, expected ${formatDuration(h.expectMs)}, until about ${clock(h.since + h.expectMs)}`)
    if (verdict.late) lines.push(`  LATE: ${formatDuration(verdict.over)} past its expected end. Its process still runs, so it keeps the unit: a live turn is never taken over, since that would end the trial it may be in. Ask the owner if it looks stuck.`)
  }
  for (const entry of turn.nested) lines.push(`  also running under it: ${doing(entry)} (PID ${entry.child?.pid ?? entry.pid})`)
  if (asked && !verdict.yields) lines.push(`  ASKED TO GIVE IT BACK: ${askedText(asked)}. Finish at a safe point and give the unit back; nothing takes it from this turn.`)
  return lines
}

/** The queue as text (status) and as data (--json). */
export function describe(directory = unitDirectory(), now = Date.now()) {
  const line = waiting(directory), turn = readTurn(directory), verdict = judge(turn, now, line), asked = priorityRequest(directory, line), lines = []
  if (verdict.state === 'held') lines.push(...holderLines(turn, verdict, now, asked))
  else if (verdict.state === 'starting') lines.push('The unit is being taken right now.')
  else if (verdict.state === 'dead') lines.push(`The unit is free: the last turn (${turn.holder?.who ?? 'unknown'}) ended because ${verdict.why}. The next command that needs the unit takes it.`)
  else lines.push('The unit is free.')
  if (line.length) {
    lines.push('Waiting, in order:')
    line.forEach((entry, i) => lines.push(`  ${i + 1}. ${entry.who}: ${doing(entry)}, waiting ${formatDuration(now - entry.since)}${entry.priority ? `, first by priority: ${entry.priority}` : ''}`))
  } else lines.push('Nobody is waiting.')
  return { text: lines.join('\n'), state: verdict.state === 'held' || verdict.state === 'starting' ? 'held' : 'free', verdict, holder: turn?.holder ?? null,
    nested: turn?.nested ?? [], waiting: line, priority: asked, directory }
}

export class UnitBusyError extends Error {}

/**
 * Take the turn on the unit, waiting in line for it. Resolves to { id, nested, release(), setChild(pid), keep(ms) }.
 * - Inside a turn already (MODWERK_UNIT_TURN names it, or it is a hold of this checkout): nested, nothing waits, and
 *   release() only says this run ended. A hold asked for inside a hold of the same checkout extends it.
 * - kind 'run' belongs to this process (and the child set with setChild); kind 'hold' to the checkout, for `forMs`.
 * - keep(ms), in place of release() when a run ends: the turn stays this checkout's for `ms` ({ kept, until }), unless a
 *   priority waiter is first in line ({ kept: false, asked }).
 * - priority: why this waiter goes first in line (the owner's call); everyone it overtakes is told.
 * - waitMs: give up after that long in line with UnitBusyError, whose message is the queue's status.
 */
export async function acquire({ directory = unitDirectory(), env = process.env, cwd = process.cwd(), kind = 'run', note = '', command = '', priority = '',
  expectMs = RUN_EXPECT, forMs = HOLD_FOR, waitMs = Infinity, poll = 500, log = line => console.error(line), now = Date.now } = {}) {
  mkdirSync(directory, { recursive: true })
  const place = checkoutOf(cwd), me = { ...place, who: whoIs(place, env), note, command }
  const turnFolder = join(directory, TURN)
  const queued = waiting(directory), current = readTurn(directory), verdict = judge(current, now(), queued)
  // A kept turn past its time, or giving way to a priority waiter, is no longer this checkout's to go ahead in while
  // someone waits: its next command waits in line like everyone else's.
  const kept = current?.holder?.kept && verdict.expired && queued.length
  if (verdict.state === 'held' && !kept && (env.MODWERK_UNIT_TURN === current.holder.id || current.holder.kind === 'hold' && current.holder.checkout === me.checkout)) {
    if (kind === 'hold' && current.holder.kind === 'hold') { // the same checkout asks again: a longer hold, the newest note
      const hold = { ...current.holder, until: now() + forMs, note: note || current.holder.note }
      delete hold.kept // a kept turn held on purpose is an ordinary hold from now on
      writeJson(join(turnFolder, HOLDER), hold)
      return { id: current.holder.id, nested: false, extended: true, release: () => endTurn(directory, current.holder.id), setChild() {} }
    }
    const file = join(turnFolder, `nested-${process.pid}-${randomUUID()}.json`), entry = { ...processEntry(process.pid), who: me.who, note, command, since: now() }
    try { writeJson(file, entry) } catch { /* the turn ended meanwhile: run anyway, as its own process would have */ }
    return { id: current.holder.id, nested: true, release: () => rmSync(file, { force: true }),
      setChild(pid) { try { writeJson(file, { ...entry, child: processEntry(pid) }) } catch { /* ended */ } },
      // Inside a hold of this checkout, keeping extends the hold to at least `ms` from now; inside another command's turn
      // that command decides.
      keep(ms) {
        rmSync(file, { force: true })
        if (current.holder.kind !== 'hold' || current.holder.checkout !== me.checkout) return { kept: false }
        const asked = priorityRequest(directory)
        if (asked) return { kept: false, asked }
        const holder = readJson(join(turnFolder, HOLDER))
        if (holder?.id !== current.holder.id) return { kept: false }
        const until = Math.max(holder.until, Date.now() + ms)
        try { writeJson(join(turnFolder, HOLDER), { ...holder, until }) } catch { return { kept: false } }
        return { kept: true, until }
      } }
  }

  // A priority waiter goes ahead of everyone who waits without it, behind earlier priority waiters.
  const since = now(), order = priority ? priorityPlace(queued, since) : since
  const ticket = `wait-${String(order).padStart(13, '0')}-${process.pid}-${randomUUID()}.json`, mine = { ...processEntry(process.pid), ...me, kind, since, ...(priority ? { priority } : {}) }
  writeFileSync(join(directory, ticket), JSON.stringify(mine) + '\n', { flag: 'wx' })
  const leave = () => rmSync(join(directory, ticket), { force: true })
  process.once('exit', leave)
  let watcher, wake, said = '', lastLoop = Date.now()
  const told = new Set()
  try {
    try {
      watcher = watch(directory, { persistent: false }, () => wake?.())
      watcher.on('error', () => watcher.close())
    } catch { /* the timer still wakes the loop */ }
    for (;;) {
      const loopGap = Date.now() - lastLoop > 5 * SECOND // this process slept (a suspended computer): judge others next round
      lastLoop = Date.now()
      const line = waiting(directory)
      if (!line.some(entry => entry.ticket === ticket)) writeFileSync(join(directory, ticket), JSON.stringify(mine) + '\n') // dropped by mistake: back in place
      const position = Math.max(1, line.findIndex(entry => entry.ticket === ticket) + 1), first = position === 1 && line[0]?.ticket === ticket
      for (const entry of line.slice(0, position - 1)) {
        if (!entry.priority || told.has(entry.ticket)) continue
        told.add(entry.ticket)
        log(`${entry.who} waits ahead of you with priority, the owner's call: ${entry.priority}. You are number ${position} in line.`)
      }
      const turn = readTurn(directory), state = judge(turn, now(), line)
      if (first && state.state === 'free') {
        let made = false
        try { mkdirSync(turnFolder); made = true } catch (error) { if (error.code !== 'EEXIST') throw error }
        if (made) {
          const id = randomUUID(), taken = now()
          const holder = { id, ...mine, since: taken, ...(kind === 'hold' ? { until: taken + forMs } : { expectMs }) }
          writeJson(join(turnFolder, HOLDER), holder)
          if (Date.now() - since > 2 * SECOND) log(`Your turn on the unit, after ${formatDuration(Date.now() - since)} in line.`)
          return {
            id, nested: false, holder,
            release: () => endTurn(directory, id),
            setChild(pid) { holder.child = processEntry(pid); try { writeJson(join(turnFolder, HOLDER), holder) } catch { /* ended */ } },
            keep: ms => kind === 'run' ? keepTurn(directory, id, ms) : { kept: false },
          }
        }
        continue
      }
      if (first && !loopGap && (state.state === 'dead' || state.expired)) {
        const who = turn.holder?.who ?? 'a session'
        log(state.state === 'dead'
          ? `${who}'s turn on the unit ended: ${state.why}. Taking over. Check the unit before you change it: a trial it started may still be running (npm run device -- do inventory; npm run device -- recover rolls a trial back).`
          : state.yields ? `${who}'s kept turn gives way to your priority: nothing of its own runs. Taking over.`
            : `${who}'s ${turn.holder.kept ? 'kept turn' : 'hold'} on the unit ran out ${formatDuration(state.over)} ago with nothing of its own running. Taking over.`)
        endTurn(directory, turn.holder?.id ?? null)
        continue
      }
      if (state.state === 'held') {
        const h = turn.holder, key = `${h.id} ${position} ${state.late}`
        if (key !== said) {
          said = key
          log(`Waiting for the unit: ${h.who} has it (${doing(h)}) since ${clock(h.since)}, ${h.kind === 'hold' ? `${h.kept ? 'kept for its next command' : 'held'} until ${clock(h.until)}` : `expected until about ${clock(h.since + h.expectMs)}`}. ` +
            `You are number ${position} in line; this goes ahead by itself when the turn comes (npm run unit -- status shows the queue).`)
          if (first && priority) log(`  You wait first in line with priority. ${h.who} is asked to give the unit back at a safe point (it shows in status and in its command's output); a live turn is never taken over.`)
          if (state.late) log(h.kind === 'hold'
            ? `  That hold is ${formatDuration(state.over)} over its time; ${state.running ? 'something of its own still runs, so it keeps the unit.' : `it ends ${formatDuration(Math.max(0, (h.kept ? 0 : HOLD_GRACE) - state.over))} from now unless it is renewed.`}`
            : `  It is ${formatDuration(state.over)} past its expected end and its process still runs, so it keeps the unit: a live turn is never taken over. Ask the owner if it looks stuck.`)
        }
      }
      if (Date.now() - since >= waitMs) throw new UnitBusyError(describe(directory, now()).text)
      await new Promise(done => {
        const timer = setTimeout(done, Math.max(1, Math.min(poll, waitMs - (Date.now() - since))))
        wake = () => { clearTimeout(timer); done() }
      })
    }
  } finally {
    wake = undefined
    watcher?.close()
    process.off('exit', leave)
    leave()
  }
}

/** For a device command: take the turn (unless MODWERK_UNIT says this is an emulator, or a session that already took it
 * runs this), pass it to the processes this one starts, and give it back when this process exits (MODWERK_UNIT_KEEP:
 * keep it this checkout's that long, as run --keep does). Says so when a priority waiter asks for the unit meanwhile. */
export async function takeUnitTurn(options = {}) {
  const env = options.env ?? process.env
  if (['emulator', 'served'].includes(env.MODWERK_UNIT)) return null
  const keepMs = env.MODWERK_UNIT_KEEP ? parseDuration(env.MODWERK_UNIT_KEEP) : 0
  const turn = await acquire({ ...options, env })
  env.MODWERK_UNIT_TURN = turn.id
  const stopWatching = watchPriority(options.directory ?? unitDirectory(env), options.log ?? (line => console.error(line)))
  process.once('exit', () => { stopWatching(); if (keepMs && turn.keep) turn.keep(keepMs); else turn.release() })
  return turn
}

// Device steps (device.mjs do, a line to `serve`) that only read: beside someone else's turn they change nothing it relies
// on. Everything else drives the unit: keys, encoders and the fader, a pick, a Part, a trial, a boot, the self-test, and
// the readings that restart a measurement window (guard, cpu, gap) or occupy the session for seconds (profile, a watch).
const READ_STEPS = [/^(ui|screen|state|stats|report|loader|missing|inventory|crash|stall|diaglog|saved|memory|dspmap)$/, /^png:\S+$/, /^mem:0x[0-9a-f]+:\d+$/i, /^w\d+$/]
/** Whether a device step sequence drives the unit (needs the turn) or only reads it. */
export function sequenceDrives(line) {
  const steps = String(line ?? '').trim().split(/\s+/).filter(Boolean)
  if (!steps.length) return false
  if (/^(try|remove|recover|boot|flash)$/.test(steps[0])) return true // serve's own verbs
  const waits = steps.reduce((sum, step) => sum + (Number(/^w(\d+)$/.exec(step)?.[1]) || 0), 0)
  return waits > 1000 || !steps.every(step => READ_STEPS.some(pattern => pattern.test(step))) // a long wait holds serve's queue
}

// cmd.exe's own characters. Inside the quoted argument each gets a caret, and a second one for a .cmd or .bat file,
// which reads its arguments once more (%*), as cross-spawn does it.
const CMD_META = /([()\][%!^"`<>&|;, *?])/g
const cmdArgument = (arg, batch) => {
  const quoted = ('"' + String(arg).replace(/(\\*)"/g, '$1$1\\"').replace(/(\\*)$/, '$1$1') + '"').replace(CMD_META, '^$1')
  return batch ? quoted.replace(CMD_META, '^$1') : quoted
}
/** How Windows runs COMMAND ARGS… with each argument arriving as it was given. An .exe (or .com) starts directly and Node
 * quotes its arguments. A .cmd or .bat (npm, npx) can start only through cmd.exe: one verbatim command line, each argument
 * quoted for the program and escaped for cmd and the batch file, never a shell's plain join of the words. */
export function windowsLaunch(argv, env = process.env, exists = existsSync) {
  const [command, ...args] = argv, extensions = (env.PATHEXT || '.COM;.EXE;.BAT;.CMD').split(';').filter(Boolean)
  const folders = /[\\/:]/.test(command) ? [''] : ['', ...(env.PATH ?? env.Path ?? '').split(';').filter(Boolean)]
  let found
  for (const folder of folders) {
    for (const extension of /\.\w+$/.test(command) ? ['', ...extensions] : extensions) {
      const candidate = folder ? win32.join(folder, command + extension) : command + extension
      if (exists(candidate)) { found = candidate; break }
    }
    if (found) break
  }
  if (!found || !/\.(bat|cmd)$/i.test(found)) return { file: found ?? command, args }
  return { file: env.ComSpec || 'cmd.exe', args: ['/d', '/s', '/c', `"${[found.replace(CMD_META, '^$1'), ...args.map(arg => cmdArgument(arg, true))].join(' ')}"`], verbatim: true }
}

const USAGE = 'Usage: npm run unit -- status [--json] | hold [--for 30m] [--note TEXT] [--priority WHY] [--wait D] | release [--force] | ' +
  'run [--note TEXT] [--expect 15m] [--keep 10m] [--priority WHY] [--wait D] [--steps LINE] -- COMMAND…'

/** The command line; returns the exit status. */
export async function main(argv, { env = process.env, out = line => console.log(line), err = line => console.error(line), cwd = process.cwd() } = {}) {
  const split = argv.indexOf('--'), words = split < 0 ? argv : argv.slice(0, split), commandLine = split < 0 ? [] : argv.slice(split + 1)
  const [verb, ...rest] = words, options = {}
  for (let i = 0; i < rest.length; i++) {
    const m = /^--(json|force|for|note|expect|wait|steps|keep|priority)$/.exec(rest[i])
    if (!m) { err(USAGE); return 2 }
    if (['json', 'force'].includes(m[1])) options[m[1]] = true
    else if (i + 1 < rest.length) options[m[1]] = rest[++i]
    else { err(USAGE); return 2 }
  }
  const directory = unitDirectory(env)
  let waitMs = Infinity, expectMs = RUN_EXPECT, forMs = HOLD_FOR, keepMs = 0
  try {
    if (options.wait) waitMs = parseDuration(options.wait)
    if (options.expect) expectMs = parseDuration(options.expect)
    if (options.for) forMs = parseDuration(options.for)
    const keep = options.keep ?? env.MODWERK_UNIT_KEEP
    if (keep) keepMs = parseDuration(keep)
  } catch (error) { err(error.message); return 2 }
  if (forMs > HOLD_MOST || keepMs > HOLD_MOST) { err(`A hold or a keep lasts at most ${formatDuration(HOLD_MOST)}; hold again to extend it.`); return 2 }
  if (options.priority !== undefined && !options.priority.trim()) { err('--priority needs the reason the owner gave, which everyone it overtakes reads.'); return 2 }
  const priority = options.priority?.trim().slice(0, 200) ?? ''

  if (verb === 'status' && !commandLine.length) {
    const queue = describe(directory)
    out(options.json ? JSON.stringify({ state: queue.state, holder: queue.holder, late: queue.verdict.late ?? false, nested: queue.nested, waiting: queue.waiting,
      priority: queue.priority, directory }, null, 1) : queue.text)
    return 0
  }

  if (verb === 'hold' && !commandLine.length) {
    let turn
    try { turn = await acquire({ directory, env, cwd, kind: 'hold', note: options.note ?? 'held', command: 'npm run unit -- hold', priority, forMs, waitMs, log: err }) }
    catch (error) { if (error instanceof UnitBusyError) { err('Gave up waiting.\n' + error.message); return 3 } throw error }
    if (turn.nested) { turn.release(); err(`This runs inside a turn already (${turn.id.slice(0, 8)}); a hold would wait for itself. Nothing changed.`); return 1 }
    const until = Date.now() + forMs
    out(`${turn.extended ? 'Hold extended' : 'You hold the unit'} until ${clock(until)} (${formatDuration(forMs)}). Commands from this checkout use it without waiting; everyone else waits in line. ` +
      `Give it back with npm run unit -- release; hold again to extend it. Past its time, and ${formatDuration(HOLD_GRACE)} more, the next one in line takes over.`)
    return 0
  }

  if (verb === 'release' && !commandLine.length) {
    const turn = readTurn(directory), verdict = judge(turn), { checkout } = checkoutOf(cwd)
    if (!turn || verdict.state === 'free') { out('Nothing to release: the unit is free.'); return 0 }
    const h = turn.holder
    if (options.force) {
      if (!endTurn(directory, h?.id ?? null)) { err('The turn changed hands while ending it; nothing was ended. Look again: npm run unit -- status'); return 1 }
      out(`Ended ${h?.who ?? 'an unwritten'} turn (${h ? doing(h) : 'never written'}). A command of theirs that still runs goes on, but no longer holds the unit.`)
      return 0
    }
    if (h?.kind === 'hold' && h.checkout === checkout) { endTurn(directory, h.id); out(`Released. ${describe(directory).text}`); return 0 }
    if (h && h.checkout === checkout) { err(`This checkout's turn is a running command (${doing(h)}, PID ${h.pid}); it gives the turn back when it ends.`); return 1 }
    err(`This checkout holds no turn. ${describe(directory).text}\nnpm run unit -- release --force ends anyone's turn: the owner's call, and only for a turn that is stuck.`)
    return 1
  }

  if (verb === 'run' && commandLine.length) {
    // --steps LINE (device-send.py): take the turn only when those device steps drive the unit.
    const reads = options.steps !== undefined && !sequenceDrives(options.steps)
    let turn = null
    if (!reads && !['emulator', 'served'].includes(env.MODWERK_UNIT)) {
      try { turn = await acquire({ directory, env, cwd, kind: 'run', note: options.note ?? basename(commandLine[0]), command: commandLine.join(' ').slice(0, 300), priority, expectMs, waitMs, log: err }) }
      catch (error) { if (error instanceof UnitBusyError) { err('Gave up waiting.\n' + error.message); return 3 } throw error }
    }
    const stopWatching = turn ? watchPriority(directory, err) : () => {}
    // Ctrl-C reaches the command from the terminal by itself, and a second SIGINT would cut its rollback short, so this
    // process keeps waiting for it. SIGTERM, SIGHUP or SIGALRM (a closed terminal, a stopped task, the `perl -e 'alarm N'`
    // time limit docs/OCTATRACK_DRIVING.md puts around device-send.py) ask the command to stop the way Ctrl-C does, so a
    // trial rolls back, and stop it outright 90 s on. Without SIGALRM the time limit ended only this process, and the
    // command it started waited for its reply forever (MKII, 21 November 2026: a mem read left running past 2 min).
    const launch = process.platform === 'win32' ? windowsLaunch(commandLine, env) : { file: commandLine[0], args: commandLine.slice(1) }
    const child = spawn(launch.file, launch.args, { stdio: 'inherit', cwd, windowsVerbatimArguments: Boolean(launch.verbatim),
      env: { ...env, MODWERK_UNIT_TURN: turn?.id ?? env.MODWERK_UNIT_TURN ?? 'none' } })
    if (child.pid) turn?.setChild(child.pid)
    const onInt = () => {}, onTerm = () => { child.kill('SIGINT'); setTimeout(() => child.kill('SIGTERM'), 90 * SECOND).unref() }
    process.on('SIGINT', onInt)
    for (const signal of STOPS) process.on(signal, onTerm)
    const status = await new Promise(done => {
      child.once('error', error => { err(`Could not start ${commandLine[0]}: ${error.message}`); done(127) })
      child.once('exit', (code, signal) => done(code ?? 128 + ({ SIGINT: 2, SIGKILL: 9, SIGTERM: 15 }[signal] ?? 1)))
    })
    process.off('SIGINT', onInt)
    for (const signal of STOPS) process.off(signal, onTerm)
    stopWatching()
    if (turn && keepMs) {
      const kept = turn.keep(keepMs)
      if (kept.kept) err(`The turn stays this checkout's until ${clock(kept.until)} (--keep ${formatDuration(keepMs)}): its next command goes ahead, everyone else's waits. npm run unit -- release gives it back sooner.`)
      else if (kept.asked) err(`Not kept: ${askedText(kept.asked)}, so the unit is theirs now.`)
    } else turn?.release()
    return status
  }
  err(USAGE)
  return 2
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = await main(process.argv.slice(2))
