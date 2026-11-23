#!/usr/bin/env node
// SPDX-License-Identifier: Elastic-2.0
// Copyright (c) 2026 Jannik Aßfalg (repeat98)
// What a module costs an Octatrack, measured on a unit: the frame interrupt's share, the CPU meter and both DSPs,
// before the module, with it installed but used nowhere (at rest), and for an effect on one slot (in use).
//   npm run device:price -- [--memory] [--out FILE.json] [--base ID --scene TEXT] [--seconds 8] [--slot T1] [--fx-name ID=NAME…] ID|FILE.mwrm…   (none: every USB package)
//   --curve T1,T3,T6,T7 [--pick-pattern 2] [--measure-pattern 1] [--limit 125] [--write-costs]: what the longest frame gains with the module on
//   1, 2, 3… of those empty tracks (machines) or their slots (effects), each picked on the empty pattern and read on the busy one,
//   and the next-instance cost from it (curveFit: `first`, then `each`); it stops at the first skipped render or past --limit % (lower it
//   for a run nobody watches: a frame interrupt past about 130 % can stop the DSP frames until a power cycle); --write saves it as the module's evidence/frame-cost.json, --write-costs into the base's own frame-costs-base.json;
//   either regenerates frame-costs.json (as npm run modules:generate does), which admission charges.
//   --write (needs --base and --scene): each module measured cleanly gets its price in octamod.module.json (resources.cpuPrice) and
//   its readings in evidence/cpu-price.json, and leaves the pending list; modules:check recomputes the price from those readings.
// It needs a development twin of the base (the guard request) behind `npm run device -- serve --share
// /tmp/modwerk-share.sock`, and the scene is the caller's: select the pattern, leave the transport stopped, and say in
// the record which (--scene). The unit takes a module only while stopped, so each reading is PLAY, the reading, STOP.
// Each module runs as a trial that is rolled back; nothing is kept. Base-bound packages are left out:
// a twin does not trust them (docs/OCTATRACK_DRIVING.md).
// A machine's in-use cost is read only by --curve, as the only module of its trial (its row in the list is then the sixth).
// shortcut: a machine's price for octamod.module.json is not written here, read it with `cpu` on the track. Nor is its meter cost
// (resources.cpuMeter): read `health` against the track on Flex by hand (docs/MODULE_PERFORMANCE.md); add it with the same step.
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { connect } from 'node:net'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, dirname, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { CPU_PRICE_PENDING_PATH, CPU_PRICE_RECORD, FRAME_COSTS_BASE_PATH, FRAME_COSTS_PATH, FRAME_COST_RECORD, frameCostsJson, generateFrameCosts, machineDescriptors, manifestJson, measuredPrice, curveProblem } from './module-cpu-price.mjs'
import { takeUnitTurn } from './unit-queue.mjs'

const mean = values => values.reduce((sum, value) => sum + value, 0) / values.length, tenth = value => Math.round(value * 10) / 10
/** One reading from the session's `guard` line and `stats` lines: percent of a frame, percent of the meter, per mille of a DSP. */
export function reading(text) {
  const guard = /frame max ([\d.]+) %, latest start ([\d.]+) %, in the frame interrupt ([\d.]+) % over (\d+) frames, skipped (\d+)/.exec(text)
  const stats = [...text.matchAll(/stats cpu (\d+) T1-4 (\d+)\/\d+ T5-8 (\d+)\/\d+/g)]
  if (!guard || !stats.length) throw new Error('No guard and stats reading in: ' + text.slice(0, 200))
  return { frame: Number(guard[3]), frameMax: Number(guard[1]), frames: Number(guard[4]), skipped: Number(guard[5]),
    cpu: tenth(mean(stats.map(m => m[1] / 10))), dsp1to4: tenth(mean(stats.map(m => m[2] / 10))), dsp5to8: tenth(mean(stats.map(m => m[3] / 10))) }
}
/** Tracked allocation only. The module pool and each DSP program arena have distinct units and capacities. */
export function allocationReading(text) {
  const pool = /^pool: (\d+) of \d+ bytes used;/m.exec(text)
  const core1 = /^core 1 \(T1-4\): (\d+) of \d+ words/m.exec(text)
  const core0 = /^core 0 \(T5-8\): (\d+) of \d+ words/m.exec(text)
  if (!pool || !core1 || !core0) return { unavailable: 'The development base did not report the module pool and both DSP program arenas.' }
  return { modulePoolBytes: Number(pool[1]), dspProgramWordsT1to4: Number(core1[1]), dspProgramWordsT5to8: Number(core0[1]) }
}
/** What the second reading added to the first, in points, one decimal. */
/** What went wrong with a pick, from the session's reply (device.mjs pick's errors), or null when the slot runs it. */
export const pickFailure = reply => /error|refused|not admitted|timed out/i.test(reply) ? reply.trim().split('\n').find(line => /error|refused|not admitted|timed out/i.test(line)).slice(0, 200) : null
export const added = (before, after) => Object.fromEntries(['frame', 'cpu', 'dsp1to4', 'dsp5to8'].map(key => [key, tenth(after[key] - before[key])]))

/** A file trial uses the package header for its name and slots (loader.c). Its runtime id
 * also identifies a published module when the filename is a version or was renamed. */
export function priceFileTarget(file, data, catalogue) {
  if (data.length < 68 || data.toString('ascii', 0, 4) !== 'MWRM') throw new Error('Not an Octatrack runtime package: ' + file)
  const row = catalogue.find(entry => entry.module === data.toString('hex', 28, 32))
  const id = row?.id ?? basename(file, '.mwrm')
  const name = data.toString('latin1', 50, 66).split('\0', 1)[0] || row?.name || id
  const slots = data.readUInt32BE(32) ? { 1: 'fx1', 2: 'fx2', 3: 'both' }[data[39]] : undefined
  const version = row && createHash('sha256').update(data).digest('hex') === row.sha256 ? row.version : 'file'
  return { id, name, slots, version, file }
}

const OVERLOAD = 125 // percent of a frame: no skips up to ~115 on an MKII, drops from ~120 (22 Nov 2026)
/** What a module adds to the longest frame while installed on no track or slot (its `rest`), in percent: the reading
 * installed less the one before it. Under REST_NOISE it is the readings' own scatter (±2.5 between two 8-s readings of one
 * scene on the owner's MKII, 22 November 2026) and counts 0, since the base adds every installed module's rest to the
 * reserve: scatter would charge every set. FM Synth 0.1.4 read +20.3 on a medium pattern. */
export const REST_NOISE = 2
export function restCost(before, atRest) {
  const rest = Math.round(((atRest?.frameMax ?? 0) - (before?.frameMax ?? 0)) * 10) / 10
  return rest >= REST_NOISE ? rest : 0
}
/** The next-instance cost from a curve: `adds` is what the longest frame gained with 1, 2, 3… instances. `each` is the
 * steepest step from the third instance on (a lone second step can be steep while later ones are cheap: Tape Echo 9.2,
 * 16.7, 16.8, 20.5 on a busy Part), `first` the least that, with `each` after it, covers every measured point. */
export function curveFit(adds) {
  const c = adds.map(value => Math.max(0, value)), steps = c.slice(2).map((value, i) => value - c[i + 1])
  const each = Math.max(0, steps.length ? Math.max(...steps) : c.length > 1 ? c[1] - c[0] : c[0] ?? 0)
  const first = Math.max(each, ...c.map((value, n) => value - n * each))
  return { first: tenth(first), each: tenth(each) }
}
/** Stock's own room from three longest-frame readings: the reserve is the busy pattern with every delay awake, and one track's
 *  share is what eight playing tracks add over the empty pattern, divided by eight (a machine is charged net of it). */
export const stockFit = ({ empty, quiet, awake }) => ({ reserve: tenth(Math.max(quiet, awake)), trackStock: tenth(Math.max(0, quiet - empty) / 8) })
// A module machine's row in the machine list when it is the only one installed: STATIC, FLEX, THRU, NEIGHBOR, PICKUP, then it.
export const machinePick = (track, row = 5) => `NO w200 ${track} w300 ${track} ${track} w500 LEFT w400 UP*12 w200 DOWN*${row} w200 YES w800 NO w300`
export const machineToStatic = track => `NO w200 ${track} w300 ${track} ${track} w500 LEFT w400 UP*12 w200 YES w800 NO w300`

/** --write for one module's result: its price into its manifest, its readings beside it, its line off the pending list. What it did. */
export function writePrice({ root, result, base, scene, seconds, measuredAt }) {
  const id = result.id, folder = resolve(root, 'sdk/octatrack/modules', id), manifest = resolve(folder, 'octamod.module.json')
  if (!existsSync(manifest)) return 'not written: no sdk/octatrack/modules/' + id
  if (result.refused || !result.rolledBack || result.restore || result.inUseError || !result.atRestAdds) return 'not written: the run was not clean'
  const text = readFileSync(manifest, 'utf8'), document = JSON.parse(text)
  if (document.compatibility?.location === 'Track machine' || machineDescriptors({ root, id }).length) return 'not written: a machine\'s price is what one playing track adds ("machine-render"), read on a track (docs/MODULE_PERFORMANCE.md)'
  if (document.compatibility?.effectId != null && !result.inUseAdds) return 'not written: an effect is priced on a slot too, and this run has no reading on one'
  if (result.version !== 'file' && result.version !== document.version) return 'not written: this measured the published ' + result.version + ' but the manifest is ' + document.version + '; measure the new build\'s .mwrm'
  const record = { module: id, version: document.version, base, scene, seconds, measuredAt, result }
  mkdirSync(dirname(resolve(folder, CPU_PRICE_RECORD)), { recursive: true })
  writeFileSync(resolve(folder, CPU_PRICE_RECORD), JSON.stringify(record, null, 2) + '\n')
  const { before, atRest, inUse } = result
  document.resources.cpuPrice = { value: measuredPrice(result), unit: 'percent-of-frame', measure: 'frame-interrupt', tool: 'npm run device:price -- --write', date: measuredAt.slice(0, 10),
    conditions: (scene + '; base ' + base + '; ' + seconds + ' s per reading. Frame interrupt ' + before.frame + ' % before, ' + atRest.frame + ' % installed and used nowhere' + (inUse ? ', ' + inUse.frame + ' % on ' + result.inUseOn : '') +
      '; CPU meter ' + before.cpu + ' % before, ' + atRest.cpu + ' % at rest' + (inUse ? ', ' + inUse.cpu + ' % in use' : '') + '.').slice(0, 1000),
    source: CPU_PRICE_RECORD }
  // shortcut: a hand-formatted manifest (an object on one line) comes back as plain two-space JSON; keep it if review asks.
  // modules:check strips the price with the same serialiser to see that nothing else changed (manifestWithoutPrice).
  writeFileSync(manifest, manifestJson(document, text))
  const pendingPath = resolve(root, CPU_PRICE_PENDING_PATH), pending = existsSync(pendingPath) ? JSON.parse(readFileSync(pendingPath, 'utf8')) : null
  const wasPending = Boolean(pending?.pending?.[id])
  if (wasPending) { delete pending.pending[id]; writeFileSync(pendingPath, JSON.stringify(pending, null, 1) + '\n') }
  return 'wrote ' + document.resources.cpuPrice.value + ' % of a frame into octamod.module.json and its readings into ' + CPU_PRICE_RECORD + (wasPending ? ', and took it off the pending list' : '')
}

if (import.meta.filename === process.argv[1]) {
  const { values: args, positionals } = parseArgs({ allowPositionals: true, options: { out: { type: 'string' }, seconds: { type: 'string', default: '8' },
    slot: { type: 'string', default: 'T1' }, 'fx-name': { type: 'string', multiple: true }, base: { type: 'string' }, scene: { type: 'string' }, write: { type: 'boolean' }, memory: { type: 'boolean' },
    curve: { type: 'string' }, 'pick-pattern': { type: 'string', default: '2' }, 'measure-pattern': { type: 'string', default: '1' }, limit: { type: 'string', default: String(OVERLOAD) }, 'write-costs': { type: 'boolean' }, stock: { type: 'boolean' }, socket: { type: 'string', default: '/tmp/modwerk-dev.sock' }, share: { type: 'string', default: '/tmp/modwerk-share.sock' } } })
  const root = resolve(import.meta.dirname, '..'), seconds = Number(args.seconds), measuredAt = new Date().toISOString()
  const fxNames = new Map((args['fx-name'] ?? []).map(pair => { const at = pair.indexOf('='); if (at < 1) throw new Error('--fx-name takes ID=NAME, the name the FX chooser shows'); return [pair.slice(0, at), pair.slice(at + 1)] }))
  if ((args.write || args['write-costs']) && !(args.base && args.scene)) throw new Error('--write and --write-costs need --base and --scene: the price names the base and what played (model, project, pattern)')
  if (args['write-costs'] && !args.curve && !args.stock) throw new Error('--write-costs writes a curve (--curve T1,T3,T6,T7) or the stock reserve (--stock)')
  // --write with --curve also writes each effect's or machine's curve: its evidence/frame-cost.json and its frame-costs.json line.
  const catalogue = JSON.parse(readFileSync(resolve(root, 'src/engine/assets/octatrack-module-packages.json'), 'utf8')).packages
  // An ID is a catalogue row; a path to a .mwrm is that file, for a build that is not published yet. In the order given.
  const files = positionals.filter(name => name.endsWith('.mwrm')), ids = positionals.filter(name => !name.endsWith('.mwrm'))
  const unknown = ids.filter(id => !catalogue.some(row => row.id === id)).concat(files.filter(file => !existsSync(file)))
  if (unknown.length) throw new Error('No USB package for ' + unknown.join(', '))
  const chosen = positionals.length
    ? positionals.map(name => name.endsWith('.mwrm') ? priceFileTarget(resolve(name), readFileSync(name), catalogue) : catalogue.find(row => row.id === name))
    : catalogue.filter(row => !row.requiredBase)
  // All the readings are one turn on the unit (scripts/unit-queue.mjs); the trials below run inside it.
  await takeUnitTurn({ note: 'device:price ' + chosen.map(row => row.id).join(' ').slice(0, 100), command: 'npm run device:price -- ' + process.argv.slice(2).join(' ').slice(0, 300),
    expectMs: Math.max(10, 3 * chosen.length) * 60000 })
  const wait = ms => new Promise(done => setTimeout(done, ms))
  const send = line => new Promise((done, fail) => { // one line to the session, its whole reply
    let reply = ''; const socket = connect(args.socket, () => socket.write(line + '\n'))
    socket.setTimeout(30000, () => socket.destroy(new Error('The session did not answer "' + line + '" in 30 s.')))
    socket.on('data', chunk => { reply += chunk }).on('end', () => done(reply)).on('error', fail)
  })
  const measure = async () => { // playing: a new guard window, then its mean beside three meter readings
    await send('PLAY w2000 guard')
    let text = ''
    for (let i = 0; i < 3; i++) { await wait(seconds * 1000 / 3); text += await send('stats') }
    const text2 = await send('guard')
    await send('STOP w500')
    const load = reading(text2 + text)
    if (!args.memory) return load
    try {
      return { ...load, allocation: allocationReading(await send('memory')) }
    } catch {
      return { ...load, allocation: { unavailable: 'The development base did not answer the allocation read.' } }
    }
  }
  const slotNames = async (track = args.slot) => /^(.+?)\s{2,}(.+)$/.exec((await send('ui')).split('\n').map(line => line.replace(/^[> ]+/, '')).find(line => line.startsWith(track + ' '))?.slice(track.length + 1).trim() ?? '') ?? [] // [, FX1, FX2]
  // The guard's refusal count, from the symbols of the build `boot DIR` last started (device.mjs keeps its path): a refused
  // machine pick shows nothing else over USB. Undefined when that build is not the one running.
  const refusals = async () => {
    try {
      const dir = readFileSync(resolve(homedir(), '.cache/modwerk-octatrack/last-boot'), 'utf8').trim()
      const at = JSON.parse(readFileSync(resolve(dir, 'symbols.json'), 'utf8'))['core:mw_cpu_refusals']
      const word = (await send('mem:0x' + at.toString(16) + ':4')).trim()
      return /^[0-9a-f]{8}$/.test(word) ? parseInt(word, 16) : undefined
    } catch { return undefined }
  }
  // The trig masks of a pattern of the current bank (1 to 16; machine_registry.c's PATTERN_STRIDE and PATTERN_TRACK): a module
  // that writes trigs (VECTOR) leaves them after its trial's rollback, and the next reading would measure them as stock.
  const trigMasks = async pattern => {
    const bank = parseInt((await send('mem:0x46c82456:4')).trim(), 16), masks = []
    for (let track = 0; track < 8; track++) masks.push((await send('mem:0x' + (bank + (Number(pattern) - 1) * 0x8ed8 + track * 0x91a).toString(16) + ':8')).trim())
    return masks.join(' ')
  }
  const patternTrigs = async () => (await trigMasks(args['pick-pattern'])) + ' | ' + (await trigMasks(args['measure-pattern']))
  // --curve: the module on 1, 2, 3… of these empty tracks (their slots for an effect), each picked on the empty pattern
  // (--pick-pattern, where admission has room) and read on the busy one (--measure-pattern): what the longest frame gains.
  const curve = async (row, result) => {
    const tracks = args.curve.split(',').map(track => track.trim().toUpperCase()), fx = { fx1: '1', fx2: '2', both: '2' }[row.slots]
    const machine = !fx && machineDescriptors({ root, id: row.id }).length > 0
    if (!fx && !machine) return { error: 'not an effect or a machine: no curve' }
    const name = (fxNames.get(row.id) ?? row.name).replaceAll(' ', '_'), was = {}, points = [result.atRest.frameMax], placed = [], notes = []
    if (fx) for (const track of tracks) { was[track] = (await slotNames(track))[Number(fx)]; if (!was[track]) return { error: 'could not read what ' + track + ' FX' + fx + ' runs' } }
    let skipped = result.atRest.skipped // the guard's count runs since boot: a reading skipped only when it grew
    for (const track of tracks) {
      // Stopped, admission judges a pick by what the unit last played: play the empty pattern first, so it has room.
      await send(`PATTERN+TRIG${args['pick-pattern']} w600 PLAY w5000 STOP w600`)
      const before = await refusals()
      if (fx) { const failed = pickFailure(await send(`pick:${track}:FX${fx}:${name}`)); if (failed) { notes.push(track + ': ' + failed); break } }
      else {
        await send(machinePick(track))
        const after = await refusals()
        if (before === undefined || after === undefined) notes.push(track + ': not verified (no symbols for the running base)')
        else if (after !== before) { notes.push(track + ': refused'); await send(machineToStatic(track)); break }
      }
      placed.push(track)
      await send(`PATTERN+TRIG${args['measure-pattern']} w600`)
      const load = await measure()
      points.push(load.frameMax)
      // Past where renders drop the guard's skips distort the reading, and the unit should not sit in overload: stop there.
      const dropped = load.skipped - skipped; skipped = load.skipped
      if (dropped > 0 || load.frameMax > Number(args.limit)) { notes.push(`stopped after ${track}: longest frame ${load.frameMax} %, ${dropped} renders skipped`); break }
    }
    for (const track of placed) {
      if (!fx) { await send(machineToStatic(track)); continue }
      const back = await send(`pick:${track}:FX${fx}:${was[track].replaceAll(' ', '_')}`)
      if (pickFailure(back)) notes.push('restore ' + track + ': ' + pickFailure(back))
    }
    // The admission run (owner, 23 November 2026: a refused pick, a silent module, a stall and a crash all cost the player): the
    // module alone on the first track, picked stopped after the pattern has played, as a player would, on the empty pattern and
    // on the medium one; an admitted pick then plays a reading. modules:check holds a release to both, with nothing dropped.
    const admission = []
    const troubles = async () => { try { const h = JSON.parse((await send('health')).trim().split('\n').pop()).health; return h.stalls + h.stall + h.crash } catch { return undefined } }
    for (const [pattern, number] of [['empty', args['pick-pattern']], ['medium', args['measure-pattern']]]) {
      const track = tracks[0], run = { pattern, number: Number(number), track, seconds }
      await send(`PATTERN+TRIG${number} w600 PLAY w5000 STOP w600`)
      const before = await refusals()
      if (fx) { const failed = pickFailure(await send(`pick:${track}:FX${fx}:${name}`)); run.admitted = !failed; if (failed) run.why = failed }
      else {
        await send(machinePick(track))
        const after = await refusals()
        run.admitted = before === undefined || after === undefined ? null : after === before
        if (run.admitted === null) run.why = 'no symbols for the running base, so a refusal cannot be read'
        if (run.admitted === false) await send(machineToStatic(track))
      }
      if (run.admitted) {
        const was0 = await troubles(), load = await measure(), now = await troubles()
        Object.assign(run, { frameMax: load.frameMax, frame: load.frame, dropped: load.skipped - skipped, stalls: was0 === undefined || now === undefined ? null : now - was0 })
        skipped = load.skipped
        if (!fx) await send(machineToStatic(track))
        else { const back = await send(`pick:${track}:FX${fx}:${was[track].replaceAll(' ', '_')}`); if (pickFailure(back)) notes.push('restore ' + track + ': ' + pickFailure(back)) }
      }
      admission.push(run)
    }
    await send(`PATTERN+TRIG${args['measure-pattern']} w600`)
    const adds = points.slice(1).map(point => tenth(point - points[0]))
    return { tracks: placed, points, adds, ...curveFit(adds), notes, admission }
  }
  // --stock: what stock alone needs, so module admission leaves it room (owner, 22 November 2026) and a base that makes stock
  // cheaper gives modules more by itself: the longest frame on the empty pattern, on the busy one (eight tracks playing samples,
  // the caller's scene) with the delays quiet, and with every delay's send open (the reserve). The Part is reloaded after, so
  // run it on a Part whose working copy equals its saved one.
  if (args.stock) {
    await send(`PATTERN+TRIG${args['pick-pattern']} w600`); const empty = await measure()
    await send(`PATTERN+TRIG${args['measure-pattern']} w600`); const quiet = await measure()
    await send([1, 2, 3, 4, 5, 6, 7, 8].map(t => `T${t} w150 FX2 w250 encF+40 w150`).join(' ') + ' w2000')
    const awake = await measure()
    await send('reload'); await send('part2 part1')
    const stock = stockFit({ empty: empty.frameMax, quiet: quiet.frameMax, awake: awake.frameMax })
    console.log(`stock: empty ${empty.frameMax} %, eight tracks ${quiet.frameMax} %, delays awake ${awake.frameMax} % -> reserve ${stock.reserve}, a track ${stock.trackStock}` +
      (awake.skipped > quiet.skipped ? ' (the delays-awake reading skipped renders: the scene is past what stock holds)' : ''))
    if (args['write-costs']) {
      const path = resolve(root, FRAME_COSTS_BASE_PATH), list = JSON.parse(readFileSync(path, 'utf8'))
      writeFileSync(path, frameCostsJson({ ...list, stock: { ...list.stock, ...stock, measured: `${args.scene}; base ${args.base}; ${seconds} s a reading; ${measuredAt.slice(0, 10)} (npm run device:price -- --stock)` } }))
      writeFileSync(resolve(root, FRAME_COSTS_PATH), generateFrameCosts(root))
      console.log('stock: wrote the reserve into ' + FRAME_COSTS_BASE_PATH + ' and regenerated ' + FRAME_COSTS_PATH)
    }
    if (!positionals.length) process.exit(0)
  }
  const results = []
  if (args.curve) await send(`PATTERN+TRIG${args['measure-pattern']} w600`) // the baseline on the pattern the curve is read on
  for (const row of chosen) {
    const packagePath = row.file ?? resolve(root, 'public', row.path)
    const packageSha256 = createHash('sha256').update(readFileSync(packagePath)).digest('hex')
    if (row.sha256 && packageSha256 !== row.sha256) throw new Error('Package SHA-256 differs from the release catalogue for ' + row.id)
    const trigs = await patternTrigs(), before = await measure(), result = { id: row.id, version: row.version, packageSha256, before }
    const trial = spawn(process.execPath, [resolve(root, 'scripts/device.mjs'), 'try', packagePath, '--seconds', '600', '--socket', args.share])
    let log = ''; trial.stdout.on('data', chunk => { log += chunk }); trial.stderr.on('data', chunk => { log += chunk })
    const ended = new Promise(done => trial.on('exit', done))
    // A large package uploads for a minute: wait for the trial or the try's own end, never cut an upload short
    // (a 30 s limit here once interrupted Tape Echo's at 57 % and left the unit's sync dialog standing).
    let over = false; ended.then(() => { over = true })
    for (let i = 0; i < 600 && !over && !/slot running/.test(log); i++) await wait(500)
    if (!/slot running/.test(log)) {
      result.refused = log.split('\n').find(line => /refused|rejected/i.test(line))?.trim().slice(0, 200)
      if (!over || !result.refused) { // not a plain refusal: the unit may hold half an upload
        console.log(row.id + ': the trial neither started nor was refused. Stopped; run `npm run device -- recover --socket ' + args.share + '`.\n' + log.slice(-400))
        break
      }
    }
    if (!result.refused) {
      await wait(2000)
      result.atRest = await measure(); result.atRestAdds = added(before, result.atRest)
      const fx = { fx1: '1', fx2: '2', both: '2' }[row.slots]
      if (fx) try { // an effect: on the slot, measured, and the slot's own effect picked back
        const was = (await slotNames())[Number(fx)]
        if (!was) throw new Error('could not read what ' + args.slot + ' FX' + fx + ' runs, so nothing was picked')
        // The chooser shows the effect descriptor's name, which can differ from the package's (Ring SC: "RINGMOD SC", its
        // package "SC Ringmod"): --fx-name ID=NAME names it. A pick that fails must not be measured as the effect in use.
        const name = fxNames.get(row.id) ?? row.name, failed = pickFailure(await send(`pick:${args.slot}:FX${fx}:${name.replaceAll(' ', '_')}`))
        if (failed) throw new Error('picking ' + name + ': ' + failed)
        result.inUse = await measure(); result.inUseAdds = added(before, result.inUse); result.inUseOn = args.slot + ' FX' + fx
        const back = await send(`pick:${args.slot}:FX${fx}:${was.replaceAll(' ', '_')}`)
        if (/error|refus|timed out/i.test(back)) result.restore = 'picking ' + was + ' back: ' + back.trim().slice(0, 120)
      } catch (error) { result.inUseError = error.message.slice(0, 200) }
      if (args.curve) {
        result.curve = await curve(row, result)
        if (result.curve.notes?.some(note => note.startsWith('restore'))) result.restore = result.curve.notes.join('; ')
      }
    }
    await send('STOP w500')
    trial.kill('SIGINT') // rolls the trial back
    await ended
    result.rolledBack = /rolled back/.test(log) || Boolean(result.refused) // a refused module was never in
    if ((await patternTrigs()) !== trigs) result.restore = 'it wrote trigs into pattern ' + args['pick-pattern'] + ' or ' + args['measure-pattern'] +
      ', which its rollback left: clear them (or reload the project without saving) and measure it on a scratch pattern'
    results.push(result)
    // Written after every module: a unit that hangs on the next one must not take the finished readings with it.
    if (args.out) writeFileSync(args.out, JSON.stringify({ base: args.base, scene: args.scene, seconds, slot: args.slot, measuredAt, results }, null, 1) + '\n')
    const signed = value => (value >= 0 ? '+' : '') + value
    console.log(row.id.padEnd(28) + (result.refused ? 'not installed: ' + result.refused : `at rest frame ${signed(result.atRestAdds.frame)}, cpu ${signed(result.atRestAdds.cpu)}` +
      (result.inUseAdds ? `; in use frame ${signed(result.inUseAdds.frame)}, cpu ${signed(result.inUseAdds.cpu)}, DSP ${signed(result.inUseAdds.dsp1to4)}/${signed(result.inUseAdds.dsp5to8)}` : '') + (result.inUseError ? '; in use: ' + result.inUseError : '') +
      (result.restore ? '; ' + result.restore : '') + (result.rolledBack ? '' : '; THE TRIAL DID NOT ROLL BACK: stop and look')))
    if (!result.rolledBack || result.restore) break // never go on over a unit left in a state nobody chose
  }
  if (args.out) writeFileSync(args.out, JSON.stringify({ base: args.base, scene: args.scene, seconds, slot: args.slot, measuredAt, results }, null, 1) + '\n')
  if (args.write) for (const result of results) console.log(result.id.padEnd(28) + writePrice({ root, result, base: args.base, scene: args.scene, seconds, measuredAt }))
  for (const result of results.filter(result => result.curve && !result.curve.error)) {
    const { first, each, adds, tracks, notes } = result.curve, wanted = args.curve.split(',').length
    const rest = restCost(result.before, result.atRest)
    console.log(result.id.padEnd(28) + `curve on ${tracks.join(' ')}: +${adds.join(', +')} -> rest ${rest}, first ${first}, each ${each}` + (notes.length ? ' (' + notes.join('; ') + ')' : ''))
    const problem = curveProblem({ points: result.curve.points, admission: result.curve.admission })
    console.log(result.id.padEnd(28) + 'admission: ' + result.curve.admission.map(run => run.pattern + ' ' + (run.admitted ? `admitted, longest frame ${run.frameMax} %, ${run.dropped} dropped, ${run.stalls} stalls` : run.admitted === false ? 'REFUSED' : 'not verified')).join('; ') +
      (problem ? '\n' + ''.padEnd(28) + 'NOT RELEASABLE: ' + problem : ''))
    if (problem) process.exitCode = 1 // the test procedure's step 9 stops here: this build does not carry a release
    if (!args['write-costs'] && !args.write) continue
    // Fewer than three placed is fine when the curve stopped at overload: the module costs what it measured up to there.
    const overloaded = notes.some(note => note.startsWith('stopped after'))
    if ((tracks.length < Math.min(3, wanted) && !overloaded) || !tracks.length || !result.rolledBack || result.restore) { console.log(result.id.padEnd(28) + 'curve not written: fewer than three instances, or the run was not clean'); continue }
    const manifestPath = resolve(root, 'sdk/octatrack/modules', result.id, 'octamod.module.json')
    const version = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf8')).version : result.version
    if (result.version !== 'file' && result.version !== version) { console.log(result.id.padEnd(28) + 'curve not written: this measured the published ' + result.version + ' but the manifest is ' + version); continue }
    const measured = `${result.id} ${version} on ${tracks.join(' ')}: ${args.scene}; base ${args.base}; ${seconds} s a reading; ${measuredAt.slice(0, 10)} (npm run device:price -- --curve)`
    let wrote
    if (args.write && existsSync(manifestPath)) { // the release's own record, which module:doctor and modules:check hold its version to
      const record = resolve(root, 'sdk/octatrack/modules', result.id, FRAME_COST_RECORD)
      mkdirSync(dirname(record), { recursive: true })
      writeFileSync(record, JSON.stringify({ module: result.id, version, base: args.base, scene: args.scene, seconds, measuredAt, tracks, rest, first, each, points: result.curve.points, adds, admission: result.curve.admission, notes }, null, 2) + '\n')
      wrote = 'wrote first ' + first + ', each ' + each + ' into ' + FRAME_COST_RECORD
    } else { // --write-costs: the base's own list (a base-bound module, or the base owner's reading of a published version)
      const path = resolve(root, FRAME_COSTS_BASE_PATH), list = JSON.parse(readFileSync(path, 'utf8'))
      writeFileSync(path, frameCostsJson({ ...list, costs: { ...list.costs, [result.id]: { rest, first, each, points: adds, measured } } }))
      wrote = 'wrote first ' + first + ', each ' + each + ' into ' + FRAME_COSTS_BASE_PATH
    }
    writeFileSync(resolve(root, FRAME_COSTS_PATH), generateFrameCosts(root)) // as npm run modules:generate would
    console.log(result.id.padEnd(28) + wrote + ', and regenerated ' + FRAME_COSTS_PATH)
  }
}
