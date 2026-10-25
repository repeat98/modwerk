// SPDX-License-Identifier: Elastic-2.0
// Copyright (c) 2026 Jannik Aßfalg (repeat98)
// Pulls the private Octatrack diagnostics members chose to share, for the owner and the owner's agents.
// It uses a read-only key that opens only GET /api/admin/octatrack/diagnostics; the Worker holds its SHA-256.
// Not part of npm run check. See docs/APP_DEVELOPMENT.md#private-diagnostics.
//
//   npm run diagnostics:pull -- --init   # once: put a key in the macOS Keychain and print the Worker secret
//   npm run diagnostics:pull             # write every retained record to ~/.cache/modwerk-local/diagnostics/latest.json
import { createHash, randomBytes } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { chmodSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = new URL('..', import.meta.url)
const SERVICE = 'modwerk-diagnostics-read'
const API = process.env.MODWERK_API_URL ?? 'https://octamod-community.octamod.workers.dev/api'
const OUT = join(homedir(), '.cache/modwerk-local/diagnostics')
/** Module ids (the package's `module`, 8 hex digits) to names, for the unit's `set` records. */
const MODULE_NAMES = new Map((() => { try { return JSON.parse(readFileSync(new URL('src/engine/assets/octatrack-module-packages.json', ROOT), 'utf8')).packages.map(p => [p.module, p.name ?? p.id]) } catch { return [] } })())
const PAGE = 500
const PROBLEMS = ['sync_failed', 'build_failed', 'browser_error', 'unhandled_rejection', 'unresponsive']

/** Pages through every retained record, oldest first; `page(since)` answers with the endpoint's JSON. */
export async function pullAll(page, from) {
  const events = new Map()
  let since = from, counts
  for (;;) {
    const body = await page(since)
    counts = body.counts
    for (const entry of body.events) events.set(entry.username + '/' + entry.eventId, entry)
    const last = body.events.at(-1)?.createdAt
    // shortcut: a full page sharing one timestamp ends the pull early; uploads are capped at 120 an hour per member.
    if (body.events.length < PAGE || !last || last === since) break
    since = last
  }
  return { events: [...events.values()], counts }
}

/** This computer's local time, as Discord shows it. */
export const when = iso => new Date(iso).toLocaleString('sv-SE', { dateStyle: 'short', timeStyle: 'short' })
const line = ({ createdAt, username, data }) => [when(createdAt), '@' + username, data.event, data.phase,
  data.error && 'error=' + data.error, data.result && 'result=' + data.result, data.refusal !== undefined && 'refusal=' + data.refusal,
  data.buildKind, data.area && 'area=' + data.area, data.kind && 'type=' + data.kind, data.reason && 'reason=' + data.reason,
  data.live?.cpu && 'cpu ' + data.live.cpu.map(percent).join('/'), data.modules?.map(module => module.id + '@' + module.catalogVersion).join(',')].filter(Boolean).join(' ')
function percent(permille) { return (permille / 10).toFixed(1) + '%' }
/** The loader's refusals (loader.h runtime_refusal), as a restore's set record names its first refused package's (modset.c). */
const REFUSALS = ['no refusal', 'malformed', 'module memory', 'conflict', 'no free handle', 'busy', 'DSP time', 'in use', 'stock bytes differ', 'a base event', 'a base feature down']
/** An incident from the unit's own log (diag.c): when in its session, what, and what the unit was doing. */
const ids = r => [...r.machines, ...r.fx, ...r.keys].slice(0, 4 * r.a).map((b, i, all) => i % 4 ? '' : all.slice(i, i + 4).map(x => x.toString(16).padStart(2, '0')).join('')).filter(Boolean)
const STATELESS = ['crash', 'stall', 'set', 'base'] // records that carry no cpu, keys or screen
const incident = r => `#${r.seq} start ${r.boot} +${Math.floor(r.second / 60)}m${r.second % 60}s ${r.kind}` +
  (r.kind === 'base' ? ` ${r.a.toString(16).padStart(8, '0')}` : r.kind === 'set' ? ` ${r.a} installed: ${ids(r).map(id => MODULE_NAMES.get(id) ?? id).join(', ') || 'none'}` +
    (r.screen ? `; refused ${MODULE_NAMES.get(r.screen.toString(16).padStart(8, '0')) ?? r.screen.toString(16).padStart(8, '0')} (${REFUSALS[r.tempo24] ?? 'refusal ' + r.tempo24})` : '') : '') +
  (r.kind === 'freeze' ? (r.a ? ` ${(r.a * 16 / 44100).toFixed(1)} s` : ' until a restart') : r.kind === 'hot' ? ` (${r.a} half-seconds at 90 %+)` : r.kind === 'crash' ? ` pc 0x${r.a.toString(16)}` : r.kind === 'stall' ? ` reason ${r.a}` : r.kind === 'shed' ? ` ${r.a & 0xffffff} renders skipped, tracks ${[...Array(8).keys()].filter(t => r.a >>> 24 >> t & 1).map(t => t + 1).join(',')}` : '') +
  (STATELESS.includes(r.kind) ? '' : `, cpu ${percent(r.cpu)} T1-4 ${percent(r.dsp1to4)} T5-8 ${percent(r.dsp5to8)}, ${r.playing ? 'playing' : 'stopped'} at ${(r.tempo24 / 24).toFixed(1)} BPM, screen 0x${r.screen.toString(16)}` +
    `, keys ${r.keys.filter(k => k !== 255).map(k => k.toString(16)).join(' ') || '-'}, fx ${r.fx.map(f => f.toString(16)).join(' ')}, machines ${r.machines.join(' ')}`)

/** The base a log began on: its first base record (diag.c writes one after each start), else the base the site saw
 * when it first uploaded from it (logs written before the base records). */
const logBase = (incidents, epoch) => {
  const mine = incidents.filter(r => r.epoch === epoch), first = mine.find(r => r.kind === 'base')
  return first ? first.a.toString(16).padStart(8, '0') : mine[0]?.upload?.slice(0, 8) ?? 'unknown'
}
const PROJ = 0x1c, RIGHT = 0x21, YES = 0x31 // stock key codes (scripts/device.mjs)

/** The unit's last incidents, oldest first, each log's in turn; an earlier log's name the base they ran on. A stall
 * found at a start that runs another base than the session before is an OS upgrade (stock halts the DSPs for it while
 * the loader may have a job open; beta finding 55), not a hang: said so. One after a session that ended stopped at
 * 95 % CPU or more after PROJ … RIGHT YES (PROJ may have left the 16 keys the unit keeps), with the log's last set record
 * showing none installed, is likely one too, or USB disk mode (beta finding 72): only a hint, since the base stayed the same. */
export function unitLines(incidents) {
  const all = [...incidents].map(r => ({ epoch: 0, ...r })).sort((a, b) => a.epoch - b.epoch || a.seq - b.seq)
  const at = (r, boot = r.boot) => r.epoch + '/' + boot
  const base = new Map(all.filter(r => r.kind === 'base').map(r => [at(r), r.a]))
  const upgrade = r => r.kind === 'stall' && base.has(at(r)) && base.has(at(r, r.boot - 1)) && base.get(at(r)) !== base.get(at(r, r.boot - 1))
  const system = r => {
    if (r.kind !== 'stall') return false
    const last = all.findLast(p => at(p) === at(r, r.boot - 1) && !STATELESS.includes(p.kind))
    const set = all.findLast(p => p.epoch === r.epoch && p.seq < r.seq && p.kind === 'set')
    const keys = last?.keys.filter(k => k !== 255) ?? [], from = keys.lastIndexOf(PROJ), walk = from >= 0 ? keys.slice(from) : keys.length === 16 ? keys : []
    return last?.cpu >= 950 && !last.playing && walk.some((k, i) => k === RIGHT && walk[i + 1] === YES) && set?.a === 0
  }
  const latest = Math.max(...all.map(r => r.epoch)), on = r => base.has(at(r)) ? base.get(at(r)).toString(16).padStart(8, '0') : logBase(all, r.epoch)
  return all.filter(r => r.kind !== 'start').slice(-12).map(r => '  unit: ' + incident(r) +
    (upgrade(r) ? ' (an OS upgrade: this start runs another base; not a hang)' : system(r) ? ' (likely an OS upgrade or USB disk mode, beta finding 72: the session before ended stopped at 95 %+ CPU after PROJ … RIGHT YES, no module installed)' : '') +
    (r.epoch < latest ? ` (an earlier log, base ${on(r)})` : ''))
}

/** The base's saved-set result (modset.c) as a reading's `saved` reports it; 1-6 are what a boot's restore found. */
const SAVED = ['', 'RESTORED', 'nothing saved', 'skipped (FUNC held)', 'another base’s set', 'damaged', 'refused', 'saved', 'save failed', 'too big']

/** Each member's records in order: the bases, set reloads, the last finished self-test and the event counts. */
export function members(events) {
  const found = new Map()
  for (const { username, createdAt, data } of [...events].sort((a, b) => a.createdAt.localeCompare(b.createdAt))) {
    const member = found.get(username) ?? { last: '', kinds: {}, bases: [], reloads: [], selftest: undefined }
    member.last = createdAt
    member.kinds[data.event] = (member.kinds[data.event] ?? 0) + 1
    if (data.base && member.bases.at(-1) !== data.base) member.bases.push(data.base)
    // A connection's first reading says what the boot's restore did, until a save replaces it (7, 8, 9).
    if (data.event === 'connected') member.connected = true
    else if (member.connected && data.reading) {
      member.connected = false
      const { saved, savedCount, live } = data.reading, last = member.reloads.at(-1)
      // A refused restore (6) names what it dropped: the modules the site saw before, missing now.
      const missing = saved === 6 && data.modules?.length && member.modules ? member.modules.filter(id => !data.modules.some(m => m.id === id)) : []
      if (saved >= 1 && saved <= 6 && !(last && last.saved === saved && last.savedCount === savedCount && last.live === live))
        member.reloads.push({ at: createdAt, saved, savedCount, live, missing })
    }
    if (data.modules?.length) member.modules = data.modules.map(m => m.id)
    if (data.event === 'load' && data.live) member.live = { ...data.live, at: createdAt }
    // The unit's log arrives in pieces and can arrive twice: keep each record once, by its log and seq. A base that
    // brings a new log restarts it at start 1, seq 1 (diag.c), and the site uploads each log in rising seqs, so a
    // piece holding a seq this log has with other content, or a new one below its highest, is the next log's.
    // shortcut: a piece lost in upload and sent again later by another browser also opens a log; upload a hash of the log's nonce if that shows.
    for (const kind of ['incidents', 'loads']) {
      const records = data.log?.[kind] ?? []
      if (!records.length) continue
      const log = (member.logs ??= {})[kind] ??= { epoch: 0, seen: new Map(), last: 0 }, kept = member[kind] ??= new Map()
      const same = r => JSON.stringify([r.boot, r.kind, r.second ?? r.minute, r.a, r.cpu])
      if (records.some(r => log.seen.has(r.seq) ? log.seen.get(r.seq) !== same(r) : r.seq < log.last)) Object.assign(log, { epoch: log.epoch + 1, seen: new Map(), last: 0 })
      for (const r of records) {
        log.seen.set(r.seq, same(r))
        log.last = Math.max(log.last, r.seq)
        // `upload`: the base the site saw, for logs written before the base records.
        kept.set(log.epoch + '/' + r.seq, { ...r, epoch: log.epoch, upload: data.base })
      }
    }
    if (data.log?.crash) member.crash = data.log.crash
    if (data.log?.stall) member.stall = data.log.stall
    if (data.event === 'selftest' && data.reading?.state >= 2) {
      member.selftest = data.reading
      // Peaks are measured only while DSP modules run; a test without them leaves zeros.
      if (data.reading.ran && data.reading.cpu >= (member.peak?.cpu ?? 0)) member.peak = { ...data.reading, at: createdAt }
    }
    found.set(username, member)
  }
  return found
}

/** Site reports by the Modwerk username their body links to, from `gh issue list --json number,title,state,body`. */
export function reportsByMember(issues) {
  const found = new Map()
  for (const issue of issues) {
    const name = issue.body?.match(/modwerk\.app\/forum\/profile\/([A-Za-z0-9_]+)\//)?.[1]
    if (name) found.set(name, [...found.get(name) ?? [], issue])
  }
  return found
}

/** Restarts as the unit's own log counts them: each start after the first it still holds, per log. */
function restarts(member) {
  const incidents = [...member.incidents?.values() ?? []], latest = Math.max(0, ...incidents.map(r => r.epoch))
  return [...Map.groupBy(incidents.filter(r => r.kind === 'start'), r => r.epoch)].sort(([a], [b]) => a - b).flatMap(([epoch, starts]) => {
    const boots = starts.map(r => r.boot).sort((a, b) => a - b)
    return boots.length > 1 ? [`  restarts ${boots.length - 1} (the unit's ${epoch < latest ? 'earlier ' : ''}log` +
      (latest ? ', from base ' + logBase(incidents, epoch) : '') + `, starts ${boots[0]}-${boots.at(-1)})`] : []
  })
}

export function summary({ events, counts }, { base = '', reports = new Map() } = {}) {
  const found = members(events)
  // The configuration page checks the card build on every module change: a refused selection is not a failure.
  const selection = ({ data }) => data.event === 'build_failed' && data.error === 'selection'
  const problems = events.filter(entry => !selection(entry) && (PROBLEMS.includes(entry.data.event) || entry.data.error || (entry.data.result && entry.data.result !== 'ok')))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  const checks = Object.entries(Object.groupBy(events.filter(selection), entry => entry.username)).sort((a, b) => b[1].length - a[1].length)
  const days = Map.groupBy(counts, row => row.day)
  const baseName = hash => hash.slice(0, 8) + (!base ? '' : hash === base ? ' (the site’s current base)' : ' (older than the site’s ' + base.slice(0, 8) + ')')
  return [
    `${events.length} records from ${found.size} members (last 30 days; times are this computer's)`,
    ...[...found].sort((a, b) => b[1].last.localeCompare(a[1].last)).flatMap(([name, member]) => [
      '', `@${name}  last ${when(member.last)}` + (member.bases.length ? '  base ' + member.bases.map(baseName).join(' → ') : ''),
      ...(reports.get(name) ?? []).map(issue => `  report #${issue.number} ${issue.state.toLowerCase()}: ${issue.title}`),
      ...restarts(member),
      ...member.reloads.length ? ['  set reloads at boot: ' + member.reloads.map(r => `${when(r.at)} ${SAVED[r.saved]}` + (r.saved === 1 ? ` ${r.live}/${r.savedCount}` : '') + (r.missing?.length ? ` (missing ${r.missing.join(', ')})` : '')).join(', ')] : [],
      ...member.selftest ? [`  last self-test ${member.selftest.state === 2 ? 'passed' : 'failed (bits ' + member.selftest.failed + ')'}` + (member.selftest.ran ? '' : ', no DSP module ran')] : [],
      ...member.peak ? [`  highest self-test peaks ${when(member.peak.at)}: CPU ${percent(member.peak.cpu)}, DSP T1-4 ${percent(member.peak.tracks1to4)}, T5-8 ${percent(member.peak.tracks5to8)}`] : [],
      ...member.live ? [`  live load ${when(member.live.at)}: CPU ${member.live.cpu?.map(percent).join(' mean, ') ?? '-'} peak, T1-4 ${member.live.dsp1to4?.map(percent).join('/') ?? '-'}, T5-8 ${member.live.dsp5to8?.map(percent).join('/') ?? '-'} (${member.live.samples} readings)`] : [],
      ...member.loads?.size ? [`  unit's load log: ${member.loads.size} five-minute records, CPU peak ${percent(Math.max(...[...member.loads.values()].map(r => r.cpu[1])))}, mean ${percent([...member.loads.values()].reduce((a, r) => a + r.cpu[0], 0) / member.loads.size)}`] : [],
      ...(member.loads && [...member.loads.values()].some(r => r.frameGap !== undefined) ? [`  longest frame gap ${Math.max(...[...member.loads.values()].map(r => r.frameGap ?? 0))} us (frames are 363, DSPs starve past about 515), longest UI-tick gap ${Math.max(...[...member.loads.values()].map(r => r.tickGap ?? 0))} frames (freeze at 13,781)`] : []),
      ...member.crash ? [`  crash record ${member.crash.count}: vector ${member.crash.vector} pc 0x${member.crash.pc.toString(16)} code ${member.crash.code.map(w => w.toString(16).padStart(8, '0')).join(' ')} uncached ${member.crash.memory.map(w => w.toString(16).padStart(8, '0')).join(' ')}`] : [],
      ...member.stall ? [`  stall record ${member.stall.count}: reason ${member.stall.reason} (1 frames stopped, 2 eDMA refused) at tick ${member.stall.ticks}`] : [],
      ...unitLines([...member.incidents?.values() ?? []]),
      '  ' + Object.entries(member.kinds).map(([kind, n]) => kind + ' ' + n).join(', '),
    ]),
    '', 'Self-test peaks are measured only while DSP modules run. Live load comes from the site while connected; the unit\'s log covers the time without it. Screen codes are stock input layers, keys stock key codes.',
    '', `Problems (${problems.length}, newest first, up to 30):`, ...problems.slice(0, 30).map(entry => '  ' + line(entry)),
    ...checks.length ? ['', 'Card-build checks that refused a selection (on every module change; not failures): ' + checks.map(([name, rows]) => `@${name} ${rows.length}`).join(', ')] : [],
    '', 'Daily USB sync counts (everyone, sharing or not):',
    ...[...days].map(([day, rows]) => '  ' + day + '  ' + rows.map(row => row.event.replace('usb_sync_', '') + ' ' + row.count).join(', ')),
  ].join('\n')
}

function keychainKey() {
  try { return execFileSync('security', ['find-generic-password', '-s', SERVICE, '-w'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() }
  catch { return '' }
}

async function main() {
  if (process.argv.includes('--init')) {
    let key = keychainKey()
    if (!key) {
      key = randomBytes(32).toString('hex')
      execFileSync('security', ['add-generic-password', '-s', SERVICE, '-a', 'modwerk', '-w', key])
    }
    console.log(`The read key is in the macOS Keychain as "${SERVICE}". Set this Worker secret on octamod-community`)
    console.log('(Cloudflare dashboard: Workers & Pages > octamod-community > Settings > Variables and Secrets, type Secret):')
    console.log('  DIAGNOSTICS_READ_KEY_SHA256 = ' + createHash('sha256').update(key).digest('hex'))
    return
  }
  const key = process.env.MODWERK_DIAGNOSTICS_KEY || keychainKey()
  if (!/^[a-f0-9]{64}$/.test(key)) throw new Error('No read key. Run npm run diagnostics:pull -- --init first.')
  const page = async since => {
    const response = await fetch(API + '/admin/octatrack/diagnostics?since=' + encodeURIComponent(since), { headers: { 'X-Modwerk-Diagnostics': key } })
    const body = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${body.error ?? 'not JSON'}` + (response.status === 403 ? ' Is DIAGNOSTICS_READ_KEY_SHA256 the hash --init printed, and is the Worker deployed with this change?' : ''))
    return body
  }
  const from = new Date(Date.now() - 30 * 86400000).toISOString()
  const data = await pullAll(page, from)
  // Replaced on every pull, so the copy never keeps records the server has expired or a member withdrew.
  mkdirSync(OUT, { recursive: true, mode: 0o700 })
  const file = join(OUT, 'latest.json')
  writeFileSync(file, JSON.stringify({ pulledAt: new Date().toISOString(), ...data }, null, 2), { mode: 0o600 })
  chmodSync(file, 0o600)
  // The site serves main's base; a checkout on an older commit would name current bases older.
  let binding
  try { binding = execFileSync('git', ['show', 'origin/main:sdk/machines/octatrack/base-binding.json'], { cwd: fileURLToPath(ROOT), encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }) }
  catch { binding = readFileSync(new URL('sdk/machines/octatrack/base-binding.json', ROOT), 'utf8') }
  const base = JSON.parse(binding).identity
  let reports = new Map(), note = ''
  try {
    reports = reportsByMember(JSON.parse(execFileSync('gh', ['issue', 'list', '--label', 'issue-report', '--state', 'all', '--limit', '300',
      '--search', 'created:>=' + from.slice(0, 10), '--json', 'number,title,state,body'], { cwd: fileURLToPath(ROOT), encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })))
  } catch (error) { note = '\n\nGitHub reports not matched: ' + (error.stderr?.toString().trim() || error.message) }
  console.log(summary(data, { base, reports }) + note + '\n\nEvery record: ' + file)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => { console.error(error.message); process.exit(1) })
}
