// SPDX-License-Identifier: GPL-3.0-or-later
// DSP effects loaded on demand in the emulator (base built with build_core.py --dsp-loader):
// install the pilot module (E-Verb) over USB, then pick it on tracks through the stock FX2
// selector, as the panel would (dsp.c's test pick, which a USB test command will call),
// and check what each DSP core runs. Three steps, because
// ot_emu writes its memory dumps when the client hangs up:
//
//   ARGS=$(node scripts/verify-octatrack-dsp-loader.mjs dumps BUILD OUT)
//   ot_emu --image BUILD/MAIN.raw --card CARD --set SET --project PROJECT --load-ms 20000 --frame --dsp \
//     --usb-host SOCK --usb-hold-ms 600000 $ARGS > OUT/log.txt &      # docker run --shm-size=128m
//   node scripts/verify-octatrack-dsp-loader.mjs drive SOCK BUILD SCENARIO PACKAGE
//   node scripts/verify-octatrack-dsp-loader.mjs check BUILD OUT SCENARIO
//
// Scenarios: pick (T1 and T5, one per core), remove (refused while T1 runs it, then freed),
// cycles (a package declaring 1,500 cycles: T1 admitted, T2 refused on the same core),
// missing (T1's FX2 names E-Verb, as a saved project would, before it is installed: dry and
// reported, then restored by installing it).
// The card needs a project whose Part 1 has no module effect on T1, T2 or T5's FX2.
// Emulator evidence only: executed instructions, no hardware timing or audio.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { sha } from '../vendor/elekloader/kit/src/bytes.ts'
import { UploadSession } from '../src/engine/elekloader/upload-session.ts'
import { findVendorInterface, UsbVendorTransport } from '../src/engine/elekloader/upload-usb.ts'
import { diagnostics, removal } from '../src/dev/octatrack-usb-lifecycle.ts'
import { Bench, device, enumerate } from './usb-bench.mjs'

const [mode, ...args] = process.argv.slice(2)
const EFFECT = 27, LIVE_FX = 0x80000ec4
const COUNTERS = { dl_residency_words: 8, dl_pool_base: 8, dl_selection_requested: 4, dl_selection_completed: 4,
  dl_selection_refused: 4, dl_errors: 4, dl_modal_shown: 4, dl_parked: 4, dl_reinit: 4, modwerk_dsp_missing: 4 }
const json = path => JSON.parse(readFileSync(path, 'utf8'))
const build = dir => ({ proofs: json(join(dir, 'proofs.json')), symbols: json(join(dir, 'symbols.json')) })
const row = proofs => proofs.configuration.fx2.indexOf('EVERB')

if (mode === 'dumps') {
  const [dir, out] = args, { proofs, symbols } = build(dir), layout = proofs.dspLoader
  const dumps = [...Object.entries(COUNTERS).map(([name, n]) => `0x${symbols[name].toString(16)},${n}=${out}/${name}.bin`),
    `0x${LIVE_FX.toString(16)},16=${out}/ids.bin`]
  console.log(`--mem-dump ${dumps.join(';')} --dsp-peek 0:X:215,64;1:X:215,64;0:P:${layout.A.table.slice(2)},1700;1:P:${layout.B.table.slice(2)},1700`)
} else if (mode === 'drive') {
  const [socket, dir, scenario, file] = args, { proofs, symbols } = build(dir)
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms))
  const bench = new Bench(socket); await bench.ready()
  const index = findVendorInterface(await enumerate(bench, false))
  const transport = new UsbVendorTransport(device(bench), index, { pollMs: 5 })
  const base = (await transport.identify()).base
  const session = await UploadSession.connect(transport, base, { timeoutMs: 30000 })
  // The unit's own time: the emulator runs far slower than the wall clock under --dsp.
  const settle = async ticks => {
    const start = (await diagnostics(device(bench), index)).ticks
    while ((await diagnostics(device(bench), index)).ticks - start < ticks) await wait(200)
  }
  const keep = async data => {
    await session.stage({ base, data, sha256: sha(data) }); await session.activate(); await session.startTrial()
    await session.holdTrial(); await session.accept(); await session.leaveUploadMode()
  }
  const pick = async (track, chooserRow) => {
    const [, queued] = await bench.command(`call 0x${symbols.modwerk_dsp_pick.toString(16)} 1 ${track} ${chooserRow}`)
    assert.equal(Number(queued), 1, 'the base queues the pick')
    await settle(300)
    console.log(`picked FX2 row ${chooserRow} on track ${track + 1}`)
  }
  const data = new Uint8Array(readFileSync(file)), id = new DataView(data.buffer).getUint32(28)
  const call = async (address, ...values) => Number((await bench.command(`call 0x${address.toString(16)} ${values.join(' ')}`.trim()))[1])
  if (scenario === 'missing') {
    // Emulator-only reads: a three-instruction routine in the unused end of the boot stage returns a long.
    const at = symbols.modwerk_boot_stage + 0x130000, long = async address => {
      await bench.command(`poke 0x${at.toString(16)} 2079${address.toString(16).padStart(8, '0')}20084e75`) // movea.l (addr).l,a0; move.l a0,d0; rts
      return (await call(at)) >>> 0
    }
    const bank = await long(0x46c82456), hex = n => n.toString(16)
    assert(bank, 'a project is loaded')
    await settle(5) // ot_emu serves the next poke once its run loop has turned again
    for (let part = 0; part < 4; part++) await bench.command(`poke 0x${hex(bank + 0x8ed80 + part * 6322 + 8)} 1b`) // T1's FX2 in every Part
    await bench.command(`poke 0x${hex(LIVE_FX + 8)} 1b`)
    await settle(120)
    assert(await call(symbols.modwerk_dsp_used) & 1 << EFFECT, 'the bank reports the effect in use')
    console.log('T1 names E-Verb before it is installed; the bank reports it in use')
  }
  await keep(data); console.log('module installed')
  await settle(60) // the manager handles the project's own effects in its first ticks
  if (scenario === 'missing') { await settle(300); bench.socket.end(); process.exit(0) }
  await pick(0, row(proofs))
  if (scenario === 'pick') await pick(4, row(proofs))
  if (scenario === 'cycles') await pick(1, row(proofs))
  if (scenario === 'remove') {
    await assert.rejects(session.stage(removal(base, id)), e => e.status?.result === 'rejected')
    console.log('removal refused while track 1 runs the effect')
    await pick(0, 1) // FILTER
    await keep(removal(base, id).data); console.log('module removed')
  }
  bench.socket.end()
} else if (mode === 'check') {
  const [dir, out, scenario] = args, { proofs } = build(dir)
  const pkg = json(new URL('../src/engine/assets/dsp-packages.json', import.meta.url)).packages.find(p => p.id === 'everb')
  const words = Array.from({ length: pkg.words }, (_, i) => parseInt(pkg.code.slice(i * 6, i * 6 + 6), 16))
  const log = readFileSync(join(out, 'log.txt'), 'utf8'), bytes = name => readFileSync(join(out, name + '.bin'))
  const u32 = name => Array.from({ length: bytes(name).length / 4 }, (_, i) => bytes(name).readUInt32BE(4 * i))
  const ids = [...bytes('ids')], peek = (core, space, at, n) => {
    const m = log.match(new RegExp(`core ${core} ${space}:0x${at.toString(16).padStart(5, '0')}:((?: [0-9a-f]{6}){${n}})`))
    assert(m, `no ${space} memory of core ${core} in the log`)
    return m[1].trim().split(' ').map(w => parseInt(w, 16))
  }
  // What core `core` runs for the effect: its code word for word at the arena's first code word, or the null stub.
  const core = (number, tag, bound) => {
    const layout = proofs.dspLoader[tag], dispatch = peek(number, 'X', 0x215, 64), entry = [dispatch[EFFECT], dispatch[32 + EFFECT]]
    if (!bound) return assert.deepEqual(entry, layout.null, `core ${number} still dispatches the effect`)
    const at = parseInt(layout.table, 16) + 64, placed = words.map((w, i) => pkg.relocations.includes(i) ? (w + at) & 0xffffff : w)
    assert.deepEqual(peek(number, 'P', parseInt(layout.table, 16), 1700).slice(64, 64 + words.length), placed, `core ${number} code`)
    assert.deepEqual(entry, [at + pkg.init, at + pkg.proc], `core ${number} dispatch`)
  }
  assert.equal(u32('dl_errors')[0], 0, 'transport errors')
  if (scenario === 'pick') {
    assert.equal(ids[8], EFFECT); assert.equal(ids[12], EFFECT)
    assert.deepEqual(u32('dl_residency_words'), [pkg.words, pkg.words]); assert.equal(u32('dl_selection_refused')[0], 0)
    core(0, 'A', true); core(1, 'B', true)
    console.log('E-Verb picked on FX2 of T1 and T5: each core holds its code word for word and dispatches to it: passed')
  } else if (scenario === 'remove') {
    assert.equal(ids[8], 4); assert.deepEqual(u32('dl_residency_words'), [0, 0]); core(1, 'B', false)
    console.log('removal refused while T1 ran E-Verb; after FILTER was picked it was removed and core 1 freed its code: passed')
  } else if (scenario === 'cycles') {
    assert.equal(ids[8], EFFECT); assert.notEqual(ids[9], EFFECT)
    assert.equal(u32('dl_selection_refused')[0], 1); assert.equal(u32('dl_modal_shown')[0], 1)
    assert.deepEqual(u32('dl_residency_words'), [0, pkg.words]); core(1, 'B', true)
    console.log('declared 1,500 cycles: T1 admitted, T2 on the same core refused with a message and left as it was: passed')
  } else if (scenario === 'missing') {
    assert.equal(ids[8], EFFECT, 'T1 runs E-Verb again'); assert(u32('modwerk_dsp_missing')[0] >= 1, 'the unit said it was missing')
    assert(u32('dl_parked')[0] >= 1 && u32('dl_reinit')[0] >= 1, 'the slot waited for the code, then started from its init')
    assert.deepEqual(u32('dl_residency_words'), [0, pkg.words]); core(1, 'B', true)
    console.log('a project naming E-Verb before it was installed ran dry and said so; installing it restored T1 from its init: passed')
  } else throw new Error('Unknown scenario ' + scenario)
} else {
  console.error('Usage: verify-octatrack-dsp-loader.mjs dumps BUILD OUT | drive SOCK BUILD SCENARIO PACKAGE | check BUILD OUT SCENARIO (pick, remove, cycles, missing)')
  process.exit(2)
}
