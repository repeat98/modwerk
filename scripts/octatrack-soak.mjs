#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-or-later
// A fast seeded soak of the Octatrack: program changes, START and STOP, the crossfader, scenes, mutes, levels and FX
// knobs go to the unit as USB MIDI as fast as it takes them, its health is read after every operation, and the run
// stops at the first failure. The same seed gives the same operations at the same times, so a failure replays.
//
//   node scripts/octatrack-soak.mjs [--seconds 180] [--rate 20] [--seed N] [--profile mix] [--programs 0-15] [--log FILE]
//   node scripts/octatrack-soak.mjs --replay FILE.json [--until N]               # the same operations again, up to N
//   node scripts/octatrack-soak.mjs --replay FILE.json --shrink --reset DIR     # the shortest prefix that still fails
//
// Needs `npm run device -- serve` (in its loop) on a development base, which answers the `health` step
// (MODWERK_DEV_SOCKET, default /tmp/modwerk-dev.sock), and scripts/octatrack-midi-bridge.py on the computer the unit is
// plugged into (--midi HOST:PORT, default 127.0.0.1:50124). The project's MIDI settings: track channels 1-8 (stock's
// default), PROG CH RECEIVE on the channel --pc-channel names, CC and transport receive on. A program change while
// playing lands at the pattern's end, so short patterns at a high tempo give the most transitions a minute
// (docs/OCTATRACK_DRIVING.md, "A fast soak"). Nothing is installed, kept or flashed; --shrink RAM-boots DIR (a
// development twin) before each replay.
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { createConnection } from 'node:net'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'

/** Operation kinds and how often each comes, per profile. Transitions (program changes, START/STOP) weigh most in
 * `mix`: octabam's stalls on a unit came at program changes that load DSP code, at START and at reloads. */
export const PROFILES = {
  mix: { pc: 30, burst: 10, startstop: 10, start: 4, stop: 4, xfade: 10, scene: 6, mute: 6, level: 5, knob: 15 },
  pc: { pc: 55, burst: 25, startstop: 12, start: 4, stop: 4 },
  transport: { startstop: 50, start: 15, stop: 15, pc: 20 },
  knobs: { knob: 60, level: 15, xfade: 15, scene: 10 },
}

/** A small seeded generator (mulberry32): the same seed, the same numbers on every computer. */
export function random(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** '0-15,32' -> [0..15, 32]: program numbers 0-127 (bank A pattern 1 is 0, bank B pattern 1 is 16). */
export function parsePrograms(text) {
  const out = []
  for (const part of String(text).split(',').map(s => s.trim()).filter(Boolean)) {
    const m = /^(\d+)(?:-(\d+))?$/.exec(part)
    if (!m) throw new Error(`Not a program list: ${text}`)
    const [a, b] = [Number(m[1]), Number(m[2] ?? m[1])]
    if (a > b || b > 127) throw new Error(`Programs run 0-127: ${part}`)
    for (let p = a; p <= b; p++) out.push(p)
  }
  if (!out.length) throw new Error('No programs given.')
  return [...new Set(out)]
}

const hex = bytes => bytes.map(b => b.toString(16).padStart(2, '0')).join('')

/** The whole run, made before it starts: {seed, profile, rate, seconds, programs, ops: [{i, t, op, send: [[ms, hex]], note}]}.
 * t is the operation's start in ms from the run's start; each `send` entry goes out `ms` after it. */
export function generate({ seed, seconds = 180, rate = 20, profile = 'mix', programs = [0, 1, 2, 3], pcChannel = 1, autoChannel = 1 }) {
  const weights = PROFILES[profile]
  if (!weights) throw new Error(`Unknown profile ${profile}: ${Object.keys(PROFILES).join(', ')}`)
  const rng = random(seed), pick = list => list[Math.floor(rng() * list.length)], int = (lo, hi) => lo + Math.floor(rng() * (hi - lo + 1))
  const kinds = Object.keys(weights), total = kinds.reduce((sum, k) => sum + weights[k], 0)
  const kind = () => { let r = rng() * total; for (const k of kinds) if ((r -= weights[k]) < 0) return k; return kinds.at(-1) }
  const pc = p => hex([0xc0 | (pcChannel - 1), p]), auto = (cc, v) => hex([0xb0 | (autoChannel - 1), cc, v])
  const ops = [], count = Math.max(1, Math.round(seconds * rate)), step = 1000 / rate
  for (let i = 0; i < count; i++) {
    const t = Math.round(i * step), k = kind(), track = int(0, 7)
    let send, note
    if (k === 'pc') { const p = pick(programs); send = [[0, pc(p)]]; note = `program ${p}` }
    else if (k === 'burst') { // several program changes inside one op: only the last should land
      const n = int(2, 5), list = Array.from({ length: n }, () => pick(programs))
      send = list.map((p, j) => [j * 15, pc(p)]); note = `burst ${list.join(' ')}`
    } else if (k === 'startstop') { const gap = int(20, Math.max(20, Math.floor(step * 0.8))); send = [[0, 'fc'], [gap, 'fa']]; note = `STOP, START after ${gap} ms` }
    else if (k === 'start') { send = [[0, 'fa']]; note = 'START' }
    else if (k === 'stop') { send = [[0, 'fc']]; note = 'STOP' }
    else if (k === 'xfade') { const v = rng() < 0.4 ? pick([0, 127]) : int(0, 127); send = [[0, auto(48, v)]]; note = `crossfader ${v}` }
    else if (k === 'scene') { const cc = pick([55, 56]), v = int(0, 15); send = [[0, auto(cc, v)]]; note = `scene ${cc === 55 ? 'A' : 'B'} ${v + 1}` }
    else if (k === 'mute') { const v = pick([0, 127]); send = [[0, hex([0xb0 | track, 49, v])]]; note = `${v ? 'mute' : 'unmute'} T${track + 1}` }
    else if (k === 'level') { const v = int(40, 127); send = [[0, hex([0xb0 | track, 7, v])]]; note = `level T${track + 1} ${v}` }
    else { const cc = int(34, 45), v = int(0, 127); send = [[0, hex([0xb0 | track, cc, v])]]; note = `T${track + 1} FX${cc < 40 ? 1 : 2} knob ${'ABCDEF'[(cc - 34) % 6]} ${v}` }
    ops.push({ i, t, op: k, send, note })
  }
  return { seed, profile, rate, seconds, programs, pcChannel, autoChannel, ops }
}

/** The `health` step's line -> an object, or {error} when the session answered an error or nothing usable. */
export function readHealth(reply) {
  const text = String(reply ?? '')
  const line = text.split('\n').find(l => l.startsWith('{"health"'))
  if (!line) return { error: text.trim().split('\n').at(-1) || 'no answer' }
  try { return JSON.parse(line).health } catch { return { error: 'unreadable health line' } }
}

/** A judge over successive health reads: null while the unit is well, else {reason, detail}. Counters in battery RAM
 * (crash and stall records) and the loader's stall and error counts must not move; the DSP frames must keep moving
 * (they stop only when a DSP stops: dsp.c) and so must the sys task's watch ticks (a frozen UI). */
export function monitor({ framesStillMs = 600, ticksStillMs = 1500 } = {}) {
  let last = null, framesAt = 0, ticksAt = 0
  return (h, now) => {
    if (h.error) return { reason: 'link', detail: h.error }
    if (!last) { last = h; framesAt = ticksAt = now; return null }
    const moved = key => h[key] !== last[key]
    let verdict = null
    if (moved('crash')) verdict = { reason: 'crash', detail: `crash record ${last.crash} -> ${h.crash}` }
    else if (moved('stall') || moved('stalls')) verdict = { reason: 'stall', detail: `stall record ${last.stall} -> ${h.stall}, loader stalls ${last.stalls} -> ${h.stalls}` }
    else if (moved('errors')) verdict = { reason: 'loader errors', detail: `${last.errors} -> ${h.errors}` }
    else {
      if (moved('frames')) framesAt = now
      else if (now - framesAt >= framesStillMs) verdict = { reason: 'frames stopped', detail: `DSP frames at ${h.frames} for ${now - framesAt} ms` }
      if (moved('ticks')) ticksAt = now
      else if (!verdict && now - ticksAt >= ticksStillMs) verdict = { reason: 'frozen', detail: `watch ticks at ${h.ticks} for ${now - ticksAt} ms` }
    }
    last = h
    return verdict
  }
}

/** The smallest n in 1..count for which fails(n) holds, by halving; fails(count) must hold. Assumes a prefix that
 * fails keeps failing when it grows, which a timing fault may not: the result is then a prefix that failed once. */
export async function shrink(count, fails) {
  let lo = 0, hi = count
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1
    if (await fails(mid)) hi = mid; else lo = mid
  }
  return hi
}

/** How many times the current bank and pattern changed over successive health reads (a program change that landed). */
export function landed(patterns) {
  let n = 0
  for (let i = 1; i < patterns.length; i++) if (patterns[i] && patterns[i - 1] && (patterns[i][0] !== patterns[i - 1][0] || patterns[i][1] !== patterns[i - 1][1])) n++
  return n
}

/** Achieved pace, pattern changes that landed and health-read times for the report. */
export function summarize({ done, ms, reads, cpu, patterns = [] }) {
  const sorted = [...reads].sort((a, b) => a - b), at = q => sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] : null
  const changes = landed(patterns)
  return { operations: done, seconds: Math.round(ms / 100) / 10, perSecond: ms ? Math.round(done * 10000 / ms) / 10 : 0,
    patternChanges: changes, patternChangesPerMinute: ms ? Math.round(changes * 600000 / ms) / 10 : 0,
    healthMs: { median: at(0.5), p95: at(0.95), most: sorted.at(-1) ?? null }, cpuMost: cpu.length ? Math.max(...cpu) : null }
}

// ---- input and output: the device session and the MIDI bridge ----

const wait = ms => new Promise(r => setTimeout(r, ms))

/** One line to `device.mjs serve` and its whole reply (one request per connection), or 'error: ...' after ms. */
export function request(socket, line, ms = 25000) {
  return new Promise(done => {
    let out = '', timer
    const c = createConnection(socket, () => c.write(line + '\n'))
    const end = text => { clearTimeout(timer); c.destroy(); done(text) }
    timer = setTimeout(() => end('error: no reply within ' + ms + ' ms'), ms)
    c.setEncoding('utf8').on('data', d => { out += d }).on('end', () => end(out)).on('error', e => end('error: ' + e.message))
  })
}

/** A kept connection to octatrack-midi-bridge.py: send(hexWords) resolves with its 'ok' or rejects with its error. */
function bridge(address) {
  const [host, port] = address.includes(':') ? [address.slice(0, address.lastIndexOf(':')), Number(address.slice(address.lastIndexOf(':') + 1))] : ['127.0.0.1', Number(address)]
  const c = createConnection({ host, port }), waiting = []
  let buffer = ''
  c.setNoDelay(true)
  c.setEncoding('utf8').on('data', d => {
    buffer += d
    for (let n; (n = buffer.indexOf('\n')) >= 0; buffer = buffer.slice(n + 1)) {
      const line = buffer.slice(0, n), w = waiting.shift()
      if (!w) continue
      if (line.startsWith('ok')) w.resolve(line)
      else w.reject(new Error(line))
    }
  })
  const opened = new Promise((resolve, reject) => { c.once('connect', resolve); c.once('error', reject) })
  c.on('error', e => { for (const w of waiting.splice(0)) w.reject(e) })
  return {
    opened,
    send: words => new Promise((resolve, reject) => { waiting.push({ resolve, reject }); c.write(words + '\n') }),
    close: () => c.end(),
  }
}

/** Plays ops (from the run's start) against the unit, judging health after each; stops at the first failure. */
async function play(run, { socket, midi, until = run.ops.length, settleMs = 2000, log = () => {} }) {
  const judge = monitor(), reads = [], cpu = [], patterns = [], ops = run.ops.slice(0, until)
  const health = async () => {
    const t0 = Date.now(), h = readHealth(await request(socket, 'health', 5000)); reads.push(Date.now() - t0)
    if (h.cpu !== undefined) cpu.push(h.cpu)
    if (h.pattern) patterns.push(h.pattern)
    return h
  }
  let failure = judge(await health(), Date.now())
  if (failure) return { failure: { at: -1, ...failure }, summary: summarize({ done: 0, ms: 0, reads, cpu, patterns }) }
  const start = Date.now()
  let done = 0
  for (const op of ops) {
    const lag = start + op.t - Date.now()
    if (lag > 0) await wait(lag)
    try {
      let prev = 0
      for (const [ms, words] of op.send) { if (ms > prev) await wait(ms - prev); prev = ms; await midi.send(words) }
    } catch (error) { failure = { at: op.i, reason: 'midi', detail: error.message }; break }
    done++
    const v = judge(await health(), Date.now())
    if (v) { failure = { at: op.i, ...v }; break }
    if (op.i % 200 === 0) log(`  ${op.i}/${ops.length} ${op.note}`)
  }
  // The last operation's effect can show a little later: keep reading for settleMs with nothing sent.
  for (const end = Date.now() + settleMs; !failure && Date.now() < end; await wait(100)) {
    const v = judge(await health(), Date.now())
    if (v) failure = { at: ops.at(-1)?.i ?? -1, after: true, ...v }
  }
  return { failure, summary: summarize({ done, ms: Date.now() - start, reads, cpu, patterns }) }
}

/** Reads the unit's own records of what went wrong: the stall and crash records and the diagnostics log. */
async function evidence(socket) {
  const out = {}
  for (const step of ['stall', 'crash', 'diaglog']) out[step] = (await request(socket, step, 20000)).trim()
  return out
}

/** RAM-boots DIR through the session (which exits and is restarted by its loop), then waits until health answers
 * and the base has let go of the panel (status.c holds it 25 s after a RAM boot). */
async function reset(socket, dir, holdMs) {
  await request(socket, 'boot ' + dir, 400000)
  for (const end = Date.now() + 120000; Date.now() < end; await wait(1000)) {
    if (!readHealth(await request(socket, 'health', 5000)).error) { await wait(holdMs); return }
  }
  throw new Error('The session did not answer within 120 s of the RAM boot: is serve running in its loop? A power cycle may be needed.')
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { values } = parseArgs({ options: {
    seconds: { type: 'string', default: '180' }, rate: { type: 'string', default: '20' }, seed: { type: 'string' },
    profile: { type: 'string', default: 'mix' }, programs: { type: 'string', default: '0-3' },
    'pc-channel': { type: 'string', default: '1' }, 'auto-channel': { type: 'string', default: '1' },
    midi: { type: 'string', default: '127.0.0.1:50124' }, log: { type: 'string' }, replay: { type: 'string' }, until: { type: 'string' },
    shrink: { type: 'boolean' }, reset: { type: 'string' }, hold: { type: 'string', default: '26' }, settle: { type: 'string', default: '2' },
  } })
  const socket = process.env.MODWERK_DEV_SOCKET ?? '/tmp/modwerk-dev.sock'
  const usage = 'Usage: octatrack-soak.mjs [--seconds 1-3600] [--rate 1-100] [--seed N] [--profile ' + Object.keys(PROFILES).join('|') + '] [--programs 0-3] ' +
    '[--pc-channel 1-16] [--auto-channel 1-16] [--midi HOST:PORT] [--log FILE]\n       octatrack-soak.mjs --replay FILE [--until N] [--shrink --reset BUILD_DIR [--hold S]]'
  const num = (v, lo, hi) => { const n = Number(v); if (!Number.isFinite(n) || n < lo || n > hi) { console.error(usage); process.exit(2) } return n }
  if (values.shrink && !values.replay) { console.error('--shrink needs --replay FILE (a failed run\'s log).'); process.exit(2) }
  if (values.shrink && !(values.reset && existsSync(join(values.reset, 'MAIN.raw')))) { console.error('--shrink needs --reset BUILD_DIR, a development twin to RAM-boot before each replay.'); process.exit(2) }

  const run = values.replay ? JSON.parse(readFileSync(values.replay, 'utf8')).run : generate({
    seed: values.seed !== undefined ? num(values.seed, 0, 2 ** 32 - 1) : Math.floor(Math.random() * 2 ** 31),
    seconds: num(values.seconds, 1, 3600), rate: num(values.rate, 1, 100), profile: values.profile, programs: parsePrograms(values.programs),
    pcChannel: num(values['pc-channel'], 1, 16), autoChannel: num(values['auto-channel'], 1, 16) })
  const logFile = values.log ?? (values.replay ? values.replay.replace(/\.json$/, '') + (values.shrink ? '.shrink.json' : '.replay.json') : `soak-${run.seed}.json`)
  const until = values.until !== undefined ? num(values.until, 1, run.ops.length) : run.ops.length
  const midi = bridge(values.midi)
  try { await midi.opened } catch (error) { console.error(`No MIDI bridge on ${values.midi} (${error.message}): start scripts/octatrack-midi-bridge.py on the computer the unit is plugged into.`); process.exit(1) }
  const options = { socket, midi, settleMs: 1000 * num(values.settle, 0, 60), log: line => console.log(line) }
  console.log(`soak: seed ${run.seed}, profile ${run.profile}, ${until} operations at ${run.rate} a second, log ${logFile}`)

  let result
  if (values.shrink) {
    const failedAt = JSON.parse(readFileSync(values.replay, 'utf8')).failure?.at
    const count = Number.isInteger(failedAt) && failedAt >= 0 ? Math.min(until, failedAt + 1) : until
    const tries = []
    const fails = async n => {
      await reset(socket, values.reset, 1000 * num(values.hold, 0, 120))
      const r = await play(run, { ...options, until: n })
      tries.push({ n, failure: r.failure }); console.log(JSON.stringify({ n, failure: r.failure }))
      return !!r.failure
    }
    if (!await fails(count)) result = { status: 'not reproduced', tries, note: `the first ${count} operations ran clean after a fresh RAM boot` }
    else { const n = await shrink(count, fails); result = { status: 'shrunk', shortest: n, last: run.ops.slice(Math.max(0, n - 5), n), tries } }
  } else {
    const r = await play(run, { ...options, until })
    result = { status: r.failure ? 'failed' : 'passed', failure: r.failure, summary: r.summary }
    if (r.failure) {
      result.operation = run.ops[r.failure.at] ?? null
      if (r.failure.reason !== 'link') result.evidence = await evidence(socket)
    }
  }
  midi.close()
  writeFileSync(logFile, JSON.stringify({ run, ...result, failure: result.failure }, null, 1) + '\n')
  console.log(JSON.stringify({ status: result.status, failure: result.failure, shortest: result.shortest, summary: result.summary }))
  if (result.status === 'failed') console.error(`Failed at operation ${result.failure.at} (${result.failure.reason}). Replay: node scripts/octatrack-soak.mjs --replay ${logFile} ; shortest prefix: add --shrink --reset BUILD_DIR.`)
  process.exit(result.status === 'passed' || result.status === 'shrunk' ? 0 : 1)
}
