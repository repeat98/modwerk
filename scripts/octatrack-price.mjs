#!/usr/bin/env node
// SPDX-License-Identifier: Elastic-2.0
// Copyright (c) 2026 Jannik Aßfalg (repeat98)
// What a module costs an Octatrack, measured on a unit: the frame interrupt's share, the CPU meter and both DSPs,
// before the module, with it installed but used nowhere (at rest), and for an effect on one slot (in use).
//   npm run device:price -- [--out FILE.json] [--base ID --scene TEXT] [--seconds 8] [--slot T1] ID|FILE.mwrm…   (none: every USB package)
// It needs a development twin of the base (the guard request) behind `npm run device -- serve --share
// /tmp/modwerk-share.sock`, and the scene is the caller's: select the pattern, leave the transport stopped, and say in
// the record which (--scene). The unit takes a module only while stopped, so each reading is PLAY, the reading, STOP.
// Each module runs as a trial that is rolled back; nothing is kept. Base-bound packages are left out:
// a twin does not trust them (docs/OCTATRACK_DRIVING.md).
// shortcut: a machine's in-use price is not measured here (picking one is key presses that differ by list), read it
// with `cpu` on the track; add it when the machine chooser has a step like pick:.
import { spawn } from 'node:child_process'
import { connect } from 'node:net'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, resolve } from 'node:path'
import { parseArgs } from 'node:util'

const mean = values => values.reduce((sum, value) => sum + value, 0) / values.length, tenth = value => Math.round(value * 10) / 10
/** One reading from the session's `guard` line and `stats` lines: percent of a frame, percent of the meter, per mille of a DSP. */
export function reading(text) {
  const guard = /frame max ([\d.]+) %, latest start ([\d.]+) %, in the frame interrupt ([\d.]+) % over (\d+) frames, skipped (\d+)/.exec(text)
  const stats = [...text.matchAll(/stats cpu (\d+) T1-4 (\d+)\/\d+ T5-8 (\d+)\/\d+/g)]
  if (!guard || !stats.length) throw new Error('No guard and stats reading in: ' + text.slice(0, 200))
  return { frame: Number(guard[3]), frameMax: Number(guard[1]), frames: Number(guard[4]), skipped: Number(guard[5]),
    cpu: tenth(mean(stats.map(m => m[1] / 10))), dsp1to4: tenth(mean(stats.map(m => m[2] / 10))), dsp5to8: tenth(mean(stats.map(m => m[3] / 10))) }
}
/** What the second reading added to the first, in points, one decimal. */
export const added = (before, after) => Object.fromEntries(['frame', 'cpu', 'dsp1to4', 'dsp5to8'].map(key => [key, tenth(after[key] - before[key])]))

if (import.meta.filename === process.argv[1]) {
  const { values: args, positionals } = parseArgs({ allowPositionals: true, options: { out: { type: 'string' }, seconds: { type: 'string', default: '8' },
    slot: { type: 'string', default: 'T1' }, base: { type: 'string' }, scene: { type: 'string' }, socket: { type: 'string', default: '/tmp/modwerk-dev.sock' }, share: { type: 'string', default: '/tmp/modwerk-share.sock' } } })
  const root = resolve(import.meta.dirname, '..'), seconds = Number(args.seconds)
  const catalogue = JSON.parse(readFileSync(resolve(root, 'src/engine/assets/octatrack-module-packages.json'), 'utf8')).packages
  // An ID is a catalogue row; a path to a .mwrm is that file, for a build that is not published yet. In the order given.
  const files = positionals.filter(name => name.endsWith('.mwrm')), ids = positionals.filter(name => !name.endsWith('.mwrm'))
  const chosen = positionals.length ? positionals.map(name => name.endsWith('.mwrm') ? { id: basename(name, '.mwrm'), version: 'file', file: resolve(name) } : catalogue.find(row => row.id === name)).filter(Boolean)
    : catalogue.filter(row => !row.requiredBase)
  const unknown = ids.filter(id => !catalogue.some(row => row.id === id)).concat(files.filter(file => !existsSync(file)))
  if (unknown.length) throw new Error('No USB package for ' + unknown.join(', '))
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
    return reading(text2 + text)
  }
  const slotNames = async () => /^(.+?)\s{2,}(.+)$/.exec((await send('ui')).split('\n').map(line => line.replace(/^[> ]+/, '')).find(line => line.startsWith(args.slot + ' '))?.slice(args.slot.length + 1).trim() ?? '') ?? [] // [, FX1, FX2]
  const results = []
  for (const row of chosen) {
    const before = await measure(), result = { id: row.id, version: row.version, before }
    const trial = spawn(process.execPath, [resolve(root, 'scripts/device.mjs'), 'try', row.file ?? resolve(root, 'public', row.path), '--seconds', '600', '--socket', args.share])
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
        await send(`pick:${args.slot}:FX${fx}:${row.name.replaceAll(' ', '_')}`)
        result.inUse = await measure(); result.inUseAdds = added(before, result.inUse)
        const back = await send(`pick:${args.slot}:FX${fx}:${was.replaceAll(' ', '_')}`)
        if (/error|refus|timed out/i.test(back)) result.restore = 'picking ' + was + ' back: ' + back.trim().slice(0, 120)
      } catch (error) { result.inUseError = error.message.slice(0, 200) }
    }
    await send('STOP w500')
    trial.kill('SIGINT') // rolls the trial back
    await ended
    result.rolledBack = /rolled back/.test(log) || Boolean(result.refused) // a refused module was never in
    results.push(result)
    const signed = value => (value >= 0 ? '+' : '') + value
    console.log(row.id.padEnd(28) + (result.refused ? 'not installed: ' + result.refused : `at rest frame ${signed(result.atRestAdds.frame)}, cpu ${signed(result.atRestAdds.cpu)}` +
      (result.inUseAdds ? `; in use frame ${signed(result.inUseAdds.frame)}, cpu ${signed(result.inUseAdds.cpu)}, DSP ${signed(result.inUseAdds.dsp1to4)}/${signed(result.inUseAdds.dsp5to8)}` : '') + (result.inUseError ? '; in use: ' + result.inUseError : '') +
      (result.restore ? '; ' + result.restore : '') + (result.rolledBack ? '' : '; THE TRIAL DID NOT ROLL BACK: stop and look')))
    if (!result.rolledBack || result.restore) break // never go on over a unit left in a state nobody chose
  }
  if (args.out) writeFileSync(args.out, JSON.stringify({ base: args.base, scene: args.scene, seconds, slot: args.slot, measuredAt: new Date().toISOString(), results }, null, 1) + '\n')
}
