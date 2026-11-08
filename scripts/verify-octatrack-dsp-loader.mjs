// SPDX-License-Identifier: GPL-3.0-or-later
// DSP effects loaded on demand in the emulator (base built with build_core.py --dsp-loader):
// install the pilot module (E-Verb) over USB, then pick it on tracks through the stock FX2
// selector, as the panel would (dsp.c's test pick, which a USB test command will call),
// and check what each DSP core runs. Three steps, because
// ot_emu writes its memory dumps when the client hangs up:
//
//   ARGS=$(node scripts/verify-octatrack-dsp-loader.mjs dumps BUILD OUT)
//   ot_emu --image BUILD/MAIN.raw --card CARD --set SET --project PROJECT --mount --load-ms 20000 --frame --dsp \
//     --usb-host SOCK --usb-hold-ms 600000 $ARGS > OUT/log.txt &      # docker run --shm-size=128m
//   node scripts/verify-octatrack-dsp-loader.mjs drive SOCK BUILD SCENARIO PACKAGE
//   node scripts/verify-octatrack-dsp-loader.mjs check BUILD OUT SCENARIO
//
// Scenarios: pick (T1 and T5, one per core), remove (refused while T1 runs it, then freed),
// cycles (a package declaring the most a module may, 491: T1 admitted, T2 refused on the same core),
// missing (T1's FX2 names E-Verb, as a saved project would, before it is installed: dry and
// reported, then restored by installing it), restore (install only, for
// sdk/machines/octatrack/elekloader/old_projects.py), probe (one PROBE packet to each core,
// no module: answered on a full or --dsp-probe B base, timed out on --dsp-probe A), stock (no module: the project's
// stock effects load from boot, PLATE REV and DARK REV picked on T1 and T5, each bound into its core's arena), meter
// (the load meter's last window read back; the emulator's timing, so the plumbing only), beside (the module on T1
// and T5, FX2 where it has a row, FX1 on T5 when it has both, then PLATE REV on T2 and DARK REV on T6: every effect
// each core runs is bound in its arena, the module word for word), queue (the module on T1, then on T5, on T6 and
// FILTER on T6 on the next ticks, while T1's upload runs: they wait, the latest per slot, and none is dropped),
// union (more modules as SECOND, comma-separated, a last argument to drive: what an inactive Part names is
// preloaded, a Part change to it sends nothing to the DSPs, and a pick of the module that the union of Parts cannot
// hold is refused although nothing live holds the others), save (no install: once the project is up, PROJECT > SYNC TO
// CARD by keys, on a development base; the project file's map lines go out through the writer's seam; ot_emu needs
// --mkii, whose panel has PROJ, and --card-rw to keep the file).
// parts (no module: Parts 2, 3, 4 and 1 in turn, so every effect the bank's Parts name runs; for memory censuses).
// sites (a package with stock-code sites, ABI 8 or earlier, any module: installed, then removed; RAM, read a long at a
// time, must hold each site's new bytes while it is live (kept bytes as stock, relocated words at one base) and its
// image's first 64 bytes, every relocation word and every original stock copy there,
// and every site the bytes from before once it is removed).
// Additional sites packages can be passed in SECOND, comma-separated; each is installed then removed in turn. A removal
// the base answers RUNTIME_BUSY (5: a resident controller's hooks are still being disabled) is staged again.
// controllers (PACKAGE Sidechain's, SECOND Output Matrix's encoded controller packages, stock_hook_controllers.py, for
// a base built with their trust rows): each alone, then both: installed and kept, its registry slot ACTIVE (every
// reset and enable ACKed by the emulated DSPs), Sidechain's COMPRESSOR page applied in place and restored, MATRIX
// entered and left through the AUDIO page's actions, removal refused in MATRIX and taken once disabled, and a trial
// undone (rollback) after activation, retried while the base disables it.
// SCENARIO:MODULE names the module by its catalogue id (src/engine/assets/dsp-packages.json); E-Verb by default.
// The card needs a project whose Part 1 has no module effect on T1, T2, T5 or T6.
// Emulator evidence only: executed instructions, no hardware timing or audio.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { sha } from '../vendor/elekloader/kit/src/bytes.ts'
import { UploadSession } from '../src/engine/elekloader/upload-session.ts'
import { findVendorInterface, UsbVendorTransport } from '../src/engine/elekloader/upload-usb.ts'
import { diagnostics, removal } from '../src/dev/octatrack-usb-lifecycle.ts'
import { Bench, device, enumerate } from './usb-bench.mjs'
import { captureStockCopies, verifyRuntimeRelocations } from './octatrack-runtime-verifier.mjs'

const [mode, ...args] = process.argv.slice(2)
const LIVE_FX = 0x80000ec4
const COUNTERS = { dl_residency_words: 8, dl_pool_base: 8, dl_selection_requested: 4, dl_selection_completed: 4,
  dl_selection_refused: 4, dl_errors: 4, dl_modal_shown: 4, dl_parked: 4, dl_reinit: 4, modwerk_dsp_missing: 4,
  modwerk_dsp_probes_ok: 4, modwerk_dsp_probes_failed: 4, dl_frames: 4, modwerk_dsp_meter_core: 4, modwerk_dsp_meter_bits: 4,
  modwerk_dsp_meter: 20, dl_selection_queued: 4, dl_selection_cancelled: 4, modwerk_fxmap_written: 4 }
const json = path => JSON.parse(readFileSync(path, 'utf8'))
const build = dir => ({ proofs: json(join(dir, 'proofs.json')), symbols: json(join(dir, 'symbols.json')) })
const [scenario, module = 'everb'] = (args[2] ?? '').split(':')
const pkg = json(new URL('../src/engine/assets/dsp-packages.json', import.meta.url)).packages.find(p => p.id === module)
const EFFECT = pkg?.fxId
// The module's slot (0 FX1, 1 FX2) and chooser row: the base lists an installed module after the stock rows
// (fxpage.c), and these scenarios install one. FX2 where it serves, or FX1 first.
const served = json(new URL('../src/engine/assets/chooser-metadata.json', import.meta.url)).modules.find(m => m.id === module)
const place = (proofs, fx1First) => {
  const serves = [!!served?.fx1, !served?.fx1Only], slot = fx1First ? (serves[0] ? 0 : 1) : (serves[1] ? 1 : 0)
  return [slot, (slot ? proofs.configuration.fx2 : proofs.configuration.fx1).length]
}

/** Runtime image, relocations, hashed sites, stock copies and authored initializers. */
function unpack(data) {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength), abi = view.getUint16(4), u32 = at => view.getUint32(at)
  let at = { 3: 28, 4: 32, 5: 50, 6: 68, 7: 72, 8: 76 }[abi] + 4 * u32(20)
  const image = data.subarray(at, at += u32(8)), relocations = Array.from({ length: u32(16) }, (_, i) => u32(at + 4 * i)), sites = []
  at += 4 * relocations.length
  for (let i = 0; i < u32(24); i++) {
    const hashed = abi >= 7, n = hashed ? data[at + 4] : view.getUint16(at + 4), r = hashed ? data[at + 7] : view.getUint16(at + 6)
    const code = at + 8 + (hashed ? 32 : n)
    sites.push({ address: u32(at), length: n, keep: hashed ? data[at + 5] : 0, code: data.subarray(code, code + n),
      relocations: Array.from({ length: r }, (_, k) => view.getUint16(code + n + 2 * k)) })
    at = code + n + 2 * r
  }
  const copies = Array.from({ length: abi >= 7 ? u32(68) : 0 }, (_, i) => ({ offset: u32(at + 44 * i), address: u32(at + 44 * i + 4), length: view.getUint16(at + 44 * i + 8) }))
  at += 44 * copies.length
  const fills = Array.from({ length: abi >= 8 ? u32(72) : 0 }, (_, i) => ({ offset: u32(at + 12 * i), length: u32(at + 12 * i + 4), value: data[at + 12 * i + 8] }))
  return { image, relocations, sites, copies, fills }
}

/** Where the dispatch tables are (init[ids], then proc[ids]): the receiver's since step 4, stock's X:$215 before. */
function dispatchTable(layout) {
  const number = v => typeof v === 'string' ? parseInt(v, 16) : v
  return { home: number(layout.A.dispatch ?? 0x215), ids: number(layout.A.ids ?? 32) }
}

if (mode === 'dumps') {
  const [dir, out] = args, { proofs, symbols } = build(dir), layout = proofs.dspLoader, { home, ids } = dispatchTable(layout)
  const dumps = [...Object.entries(COUNTERS).filter(([name]) => name in symbols).map(([name, n]) => `0x${symbols[name].toString(16)},${n}=${out}/${name}.bin`),
    `0x${LIVE_FX.toString(16)},16=${out}/ids.bin`]
  console.log(`--mem-dump ${dumps.join(';')} --dsp-peek 0:X:${home.toString(16)},${2 * ids};1:X:${home.toString(16)},${2 * ids};0:P:${layout.A.table.slice(2)},${parseInt(layout.A.tableWords, 16)};1:P:${layout.B.table.slice(2)},${parseInt(layout.B.tableWords, 16)}`)
} else if (mode === 'drive') {
  const [socket, dir, , file, second] = args, { proofs, symbols } = build(dir)
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms))
  const bench = new Bench(socket, { timeoutMs: 600000 }); await bench.ready()
  const index = findVendorInterface(await enumerate(bench, false))
  const transport = new UsbVendorTransport(device(bench), index, { pollMs: 5 })
  const base = (await transport.identify()).base
  // The unit's own time: the emulator runs far slower than the wall clock under --dsp.
  const settle = async ticks => {
    const start = (await diagnostics(device(bench), index)).ticks
    while ((await diagnostics(device(bench), index)).ticks - start < ticks) await wait(200)
  }
  // The base holds host frames until its boot restore is over (ep0.c, at most 10 s of the unit's time): on a slow
  // host the hello would wait that out in wall time and time out. Let the unit's own time pass first.
  while ((await diagnostics(device(bench), index)).ticks < 900) await wait(500)
  const session = await UploadSession.connect(transport, base, { timeoutMs: 60000 }) // the most it allows: a 110 KB package commits slowly under --dsp
  const call = async (address, ...values) => Number((await bench.command(`call 0x${address.toString(16)} ${values.join(' ')}`.trim()))[1])
  const keep = async data => {
    await session.stage({ base, data, sha256: sha(data) }); await session.activate(); await session.startTrial()
    await session.holdTrial(); await session.accept(); await session.leaveUploadMode()
  }
  const refusal = async () => (await transport.selftest(false))?.refusal
  // Stage, publish and keep, again while the base answers RUNTIME_BUSY (a resident controller still disabling).
  const keepRetry = async (data, what) => {
    for (let tries = 0; ; tries++) {
      try { await keep(data); return tries } catch (error) {
        const why = await refusal()
        if (why !== 5 || tries >= 60) throw new Error(`${what}: ${error.message} (loader refusal ${why})`, { cause: error })
        await session.cancel().catch(() => {}); await settle(30)
      }
    }
  }
  const pick = async (track, slot, chooserRow) => {
    const [, queued] = await bench.command(`call 0x${symbols.modwerk_dsp_pick.toString(16)} ${slot} ${track} ${chooserRow}`)
    assert.equal(Number(queued), 1, 'the base queues the pick')
    await settle(300)
    console.log(`picked FX${slot + 1} row ${chooserRow} on track ${track + 1}`)
  }
  if (scenario === 'meter') { // the load meter's last window, read back through PEEK
    await settle(120)
    assert.equal(await call(symbols.modwerk_dsp_meter_read, 0), 1, 'the base starts the read')
    await settle(300); bench.socket.end(); process.exit(0)
  }
  if (scenario === 'probe') {
    for (const core of [0, 1]) {
      assert.equal(await call(symbols.modwerk_dsp_probe, core), 1, 'the base sends the probe')
      await settle(120); console.log('probed core', core)
    }
    bench.socket.end(); process.exit(0)
  }
  const data = new Uint8Array(readFileSync(file)), id = new DataView(data.buffer).getUint32(28)
  // Emulator-only reads: a three-instruction routine in the unused end of the boot stage returns a long.
  const at = symbols.modwerk_boot_stage + 0x130000, hex = n => n.toString(16), long = async address => {
    await bench.command(`poke 0x${at.toString(16)} 2079${address.toString(16).padStart(8, '0')}20084e75`) // movea.l (addr).l,a0; move.l a0,d0; rts
    const value = (await call(at)) >>> 0
    await settle(5) // ot_emu serves the next poke once its run loop has turned again
    return value
  }
  const byte = async address => ((await long(address - address % 4)) >>> 8 * (3 - address % 4)) & 0xff
  if (scenario === 'restore' || scenario === 'save') { // once the loaded project names the module and the unit has said it is missing
    for (let tries = 0; tries < 120 && !(await long(symbols.modwerk_dsp_missing)); tries++) await settle(10)
  }
  if (scenario === 'save') { // NO (the date prompt), PROJ, RIGHT, DOWN x3 (SYNC TO CARD), YES; each key held for unit ticks
    for (const code of [0x32, 0x1c, 0x21, 0x20, 0x20, 0x20, 0x31]) for (const value of [code | 0x100, code]) {
      const reply = await device(bench).controlTransferIn({ requestType: 'vendor', recipient: 'interface', request: 5, value, index }, 1)
      assert.equal(reply.status, 'ok', 'a development base takes keys'); await settle(10)
    }
    for (let tries = 0; tries < 120 && !(await long(symbols.modwerk_fxmap_written)); tries++) await settle(10)
    bench.socket.end(); process.exit(0)
  }
  if (scenario === 'missing') {
    const bank = await long(0x46c82456)
    assert(bank, 'a project is loaded')
    for (let part = 0; part < 4; part++) await bench.command(`poke 0x${hex(bank + 0x8ed80 + part * 6322 + 8)} ${hex(EFFECT)}`) // T1's FX2 in every Part
    await bench.command(`poke 0x${hex(LIVE_FX + 8)} ${hex(EFFECT)}`)
    await settle(120)
    assert(await call(symbols.modwerk_dsp_used) & 1 << EFFECT, 'the bank reports the effect in use')
    console.log(`T1 names ${pkg.key} before it is installed; the bank reports it in use`)
  }
  if (scenario === 'parts') { // no module: each of the bank's four Parts in turn, so every effect the Parts name runs
    for (const part of [1, 2, 3, 0]) { assert.equal(await call(symbols.modwerk_dsp_pick, 2, 0, part), 1); await settle(240) }
    bench.socket.end(); process.exit(0)
  }
  if (scenario === 'stock') { // no module: the project's stock effects load at boot, then two reverbs are picked
    await settle(60)
    await pick(0, 1, proofs.configuration.fx2.indexOf('PLATE REV')); await pick(4, 1, proofs.configuration.fx2.indexOf('DARK REV'))
    bench.socket.end(); process.exit(0)
  }
  // Install once the project load has set the map (fxmap.c, battery RAM 0x100fe000), as a user would: handles follow
  // the project, and a large package's commit does not wait behind the load's engine work.
  for (let tries = 0; tries < 120 && (await long(0x100fe000)) >>> 8 !== 0x4d5746; tries++) await settle(10) // 'MWFX', or 'MWF' and the id count
  if (scenario === 'controllers') {
    const peek = async (address, n) => {
      const out = Buffer.alloc(n + 8), from = address - address % 4
      for (let a = from; a < address + n; a += 4) out.writeUInt32BE(await long(a), a - from)
      return out.subarray(address - from, address - from + n)
    }
    const SLOT = 180, STATE = 172, MODULE = 64, ACTIVE = 6, RELEASED = 10, CUE_CFG = 0x80000037, CUE_CFG_CS1 = 0x100b1497
    const COMP = 0x400d5a82, FIELDS = [[70, 24], [102, 4], [186, 16], [234, 4], [394, 8]] // names, defaults, counts, KEY formatter, enables
    const registry = symbols.modwerk_controller_registry
    const states = async module => {
      const out = []
      for (let i = 0; i < 6; i++) if (await long(registry + SLOT * i + MODULE) === module) out.push(await byte(registry + SLOT * i + STATE))
      return out
    }
    const until = async (module, state, what) => {
      for (let tries = 0; tries < 200; tries++) { if ((await states(module)).includes(state)) return; await settle(20) }
      throw new Error(`${what}: slot states ${await states(module)}`)
    }
    const page = async () => Buffer.concat(await Promise.all(FIELDS.map(([o, n]) => peek(COMP + o, n))))
    const stockPage = await page()
    const packages = [file, second].map(path => {
      const data = new Uint8Array(readFileSync(path)), view = new DataView(data.buffer)
      return { data, id: view.getUint32(28), ...unpack(data) }
    })
    const [sc, matrix] = packages
    const imageAt = async p => { // the live image: a site's relocated word less the offset the package holds
      const site = p.sites.find(s => s.relocations.length), o = site.relocations[0]
      return (await long(site.address + o) - Buffer.from(site.code).readUInt32BE(o)) >>> 0
    }
    const checkPage = async live => {
      const now = await page()
      if (!live) return assert.deepEqual(now, stockPage, 'COMPRESSOR\'s page is stock again')
      const at = await imageAt(sc), formatter = now.readUInt32BE(24 + 4 + 16)
      assert.equal(now.toString('latin1', 0, 24).replace(/\0+/g, ' ').trim(), 'KEY KGN KBAS KWID', 'the KEY page names')
      assert(formatter >= at && formatter < at + sc.image.length, 'the KEY formatter is the package\'s own')
    }
    const install = async (p, name) => {
      await keepRetry(p.data, name + ' install'); await until(p.id, ACTIVE, name + ' activation')
      console.log(`${name}: installed and kept; its controller is ACTIVE`)
    }
    const remove = async (p, name) => {
      const tries = await keepRetry(removal(base, p.id).data, name + ' removal')
      await until(p.id, RELEASED, name + ' retirement')
      for (const site of p.sites) assert.notDeepEqual(await peek(site.address, Math.min(site.length, 4)), Buffer.from(site.code).subarray(0, 4))
      console.log(`${name}: removed after ${tries} RUNTIME_BUSY answer(s); released`)
    }
    const undo = async (p, name) => {
      await session.stage({ base, data: p.data, sha256: sha(p.data) }); await session.activate(); await session.startTrial()
      await until(p.id, ACTIVE, name + ' activation in the trial')
      let tries = 0
      for (;; tries++) {
        try { await session.rollback(); break } catch (error) {
          if (session.status?.phase !== 'recovery' || tries >= 60) throw error
          await settle(30)
        }
      }
      await session.leaveUploadMode()
      await until(p.id, RELEASED, name + ' undo retirement')
      console.log(`${name}: trial undone after activation (${tries} retried rollback(s)); released`)
    }
    const action = async index => { // NORMAL, STUDIO, MATRIX rows of the AUDIO page's CUE CFG actions (cue_actions)
      const table = await long(0x400654c0)
      return call(await long(table + 4 * index))
    }
    // Sidechain alone
    await install(sc, 'Sidechain'); await checkPage(true)
    await remove(sc, 'Sidechain'); await checkPage(false)
    await undo(sc, 'Sidechain'); await checkPage(false)
    // Output Matrix alone
    await install(matrix, 'Output Matrix')
    await action(2); assert.equal(await byte(CUE_CFG), 2); assert.equal(await byte(CUE_CFG_CS1), 2)
    console.log('Output Matrix: MATRIX entered under its lease (CUE CFG and its CS1 mirror 2)')
    await assert.rejects(keep(removal(base, matrix.id).data)); assert.equal(await refusal(), 7, 'RUNTIME_IN_USE in MATRIX')
    await session.cancel().catch(() => {})
    console.log('Output Matrix: removal refused while MATRIX is selected')
    await action(0); assert.equal(await byte(CUE_CFG), 0); assert.equal(await byte(CUE_CFG_CS1), 0)
    console.log('Output Matrix: MATRIX left for NORMAL under its lease')
    await remove(matrix, 'Output Matrix')
    await undo(matrix, 'Output Matrix')
    // Both
    await install(sc, 'Sidechain'); await install(matrix, 'Output Matrix'); await checkPage(true)
    await action(2); assert.equal(await byte(CUE_CFG), 2); await action(1); assert.equal(await byte(CUE_CFG), 1)
    console.log('both: MATRIX entered and left for STUDIO beside Sidechain')
    await remove(matrix, 'Output Matrix'); assert.deepEqual(await states(sc.id), [ACTIVE]); await checkPage(true)
    await undo(matrix, 'Output Matrix'); assert.deepEqual(await states(sc.id), [ACTIVE])
    await remove(sc, 'Sidechain'); await checkPage(false)
    console.log('controllers: install, activation, page, MATRIX, removal and undo passed, alone and together')
    bench.socket.end(); process.exit(0)
  }
  if (scenario === 'sites') {
    const peek = async (address, n) => { // ot_emu's USB bench reads no memory: a long at a time through `long`
      const out = Buffer.alloc(n + 8), from = address - address % 4
      for (let a = from; a < address + n; a += 4) out.writeUInt32BE(await long(a), a - from)
      return out.subarray(address - from, address - from + n)
    }
    for (const path of [file, ...(second ? second.split(',') : [])]) {
      const data = new Uint8Array(readFileSync(path)), id = new DataView(data.buffer).getUint32(28)
      const { image, relocations, sites, copies, fills } = unpack(data), before = []
      if (new DataView(data.buffer).getUint16(4) >= 8) {
        const caps = await bench.controlIn(0xc1, 29, 0, index, 12)
        assert(caps && caps.length === 12, 'ABI 8 capabilities are readable')
        assert.equal(caps.toString('ascii', 0, 4), 'MWCP')
        assert.equal(caps[4], 1); assert(caps[5] >= 8, 'the base takes ABI 8 packages') // ABI 9 bases since base features
        assert.equal(caps.readUInt16BE(6), 7, 'only CF, copies and fills are supported')
        assert.equal(caps.readUInt16BE(8), 128); assert.equal(caps.readUInt16BE(10), 128)
        console.log(`capabilities: ${caps.toString('hex')}`)
      }
      for (const site of sites) before.push(await peek(site.address, site.length))
      const originalCopies = await captureStockCopies(copies, peek)
      await keep(data).catch(async error => { // loader.h runtime_refusal: 8, the stock bytes under a site are not the ones it names
        throw new Error(`${error.message} (loader refusal ${(await transport.selftest(false))?.refusal})`)
      })
      let at
      for (const [i, site] of sites.entries()) {
        const now = await peek(site.address, site.length), want = Buffer.from(site.code)
        before[i].copy(want, 0, 0, site.keep)
        for (const o of site.relocations) {
          const placed = now.readUInt32BE(o) - want.readUInt32BE(o) >>> 0
          assert(at === undefined || placed === at, `site 0x${hex(site.address)}: relocated to another base`)
          at = placed; want.writeUInt32BE(now.readUInt32BE(o), o)
        }
        assert.deepEqual(now, want, `site 0x${hex(site.address)} while the module is live`)
      }
      if (at !== undefined) { // its code, relocated, and the stock bytes it copied
        const code = Buffer.from(image)
        for (const o of relocations) code.writeUInt32BE(code.readUInt32BE(o) + at >>> 0, o)
        for (const [i, c] of copies.entries()) {
          originalCopies[i].copy(code, c.offset)
          assert.deepEqual(await peek(at + c.offset, c.length), code.subarray(c.offset, c.offset + c.length), `stock copy of 0x${hex(c.address)}`)
        }
        for (const f of fills) {
          code.fill(f.value, f.offset, f.offset + f.length)
          assert.deepEqual(await peek(at + f.offset, f.length), code.subarray(f.offset, f.offset + f.length), `authored initializer at ${f.offset}`)
        }
        if (new DataView(data.buffer).getUint16(6) & 1) { // fxpage_build records its destination descriptor in MWPG+48
          assert.equal(code.toString('ascii', 0, 4), 'MWPG')
          const item = (await transport.inventory())?.find(item => item.module === id.toString(16).padStart(8, '0'))
          assert(item && item.handle !== 0xff, 'the live effect is present in inventory')
          code.writeUInt32BE(symbols.pages + 0x1a0 * item.handle, 48)
        }
        assert.deepEqual(await peek(at, Math.min(64, code.length)), code.subarray(0, 64), `code at 0x${hex(at)}`)
        await verifyRuntimeRelocations(code, relocations, at, peek)
      }
      console.log(`installed: ${sites.length} sites hold, code and ${copies.length} stock copies at 0x${hex(at ?? 0)}; ${fills.length} authored initializers`)
      await keepRetry(removal(base, id).data, 'removal')
      for (const [i, site] of sites.entries()) assert.deepEqual(await peek(site.address, site.length), before[i], `site 0x${hex(site.address)} after removal`)
      console.log(`removed: every site holds what it held before`)
    }
    bench.socket.end(); process.exit(0)
  }
  await keep(data); console.log('module installed')
  await settle(60) // the manager handles the project's own effects in its first ticks
  // missing: what the project named is restored; restore: install only (old_projects.py checks the result).
  if (scenario === 'missing' || scenario === 'restore') { await settle(300); bench.socket.end(); process.exit(0) }
  if (scenario === 'queue') {
    // One pick a tick (dsp.c holds four; older bases one): T1's upload is still running when the others arrive.
    const [slot, chooserRow] = place(proofs)
    for (const [track, at] of [[0, chooserRow], [4, chooserRow], [5, chooserRow], [5, 1]]) // row 1: FILTER
      while (await call(symbols.modwerk_dsp_pick, slot, track, at) !== 1) await wait(20)
    console.log(`picked ${pkg.key} on FX${slot + 1} of T1, T5 and T6, then FILTER on T6, on consecutive ticks`)
    await settle(600); bench.socket.end(); process.exit(0)
  }
  if (scenario === 'wide') {
    // Past 31 ids (docs/OCTATRACK_MORE_EFFECT_IDS.md): the module, then more under their own ids (SECOND, comma-separated),
    // until the last takes a handle past 31; T5's FX2 names it, as a project would, and core 0 runs it.
    for (const path of second.split(',')) { // the base refuses as busy (5) while it rebinds or moves code: wait, then again
      for (let tries = 1; ; tries++) {
        try { await keep(new Uint8Array(readFileSync(path))); break } catch (error) {
          const refusal = await call(symbols.modwerk_runtime_refusal)
          console.log(`${path.split('/').at(-1)} refused (loader refusal ${refusal}), try ${tries}`)
          if (refusal !== 5 || tries === 5) throw error
          await settle(240)
        }
      }
    }
    const last = new Uint8Array(readFileSync(second.split(',').at(-1))), handle = await call(symbols.modwerk_fxmap_handle, new DataView(last.buffer).getUint32(28))
    assert(handle >= 32 && handle < 128, `the last module took handle ${handle}, not one past 31`)
    const bank = await long(0x46c82456)
    for (const address of [bank + 0x8ed80 + 12, LIVE_FX + 12]) await bench.command(`poke 0x${hex(address)} ${hex(handle).padStart(2, '0')}`)
    await settle(300)
    console.log(`${second.split(',').length} more modules installed; T5's FX2 names the last, at handle ${handle}`)
    bench.socket.end(); process.exit(0)
  }
  if (scenario === 'union') {
    const [slot, chooserRow] = place(proofs), a = slot ? 8 : 0
    const accepted = async () => [await long(symbols.dl_accepted), await long(symbols.dl_accepted + 4)]
    const words = async core => long(symbols.dl_residency_words + 4 * core), size = data => new DataView(data.buffer).getUint32(32)
    const others = second.split(',').map(path => new Uint8Array(readFileSync(path))) // DSP header: effect id at byte 38, slots at 39
    const bank = await long(0x46c82456), part = async () => (await long(0x80000000)) & 0xff
    assert(bank && await part() === 0, 'a project is loaded on Part 1')
    // Each install after a bench command: in ot_emu, an install right after another timed out at ENTER (dsp2-AB3 too; not understood).
    for (const other of others) { await keep(other); await long(0x46c82456) }
    console.log(`${others.length} more modules installed`)
    await settle(60)
    // Part 2: Part 1's effects with the module on T5 (core 0), written as a paste or a project load would.
    const part1 = [], from = bank + 0x8ed80, words0 = await words(0)
    for (let i = 0; i < 16; i += 4) { const value = await long(from + i); part1.push(...[24, 16, 8, 0].map(shift => value >>> shift & 0xff)) }
    part1[a + 4] = EFFECT
    await bench.command(`poke 0x${hex(from + 6322)} ${Buffer.from(part1).toString('hex')}`)
    await settle(120)
    assert.equal(await words(0), words0 + size(data), `core 0 preloaded ${pkg.key} for Part 2`)
    assert.notEqual(await byte(LIVE_FX + a + 4), EFFECT, 'T5 still runs Part 1')
    const before = await accepted()
    assert.equal(await call(symbols.modwerk_dsp_pick, 2, 0, 1), 1); await settle(60)
    assert.equal(await part(), 1, 'Part 2 is active'); assert.equal(await byte(LIVE_FX + a + 4), EFFECT, `T5 runs ${pkg.key}`)
    assert.deepEqual(await accepted(), before, 'the Part change sent nothing to the DSPs')
    console.log(`${pkg.key} preloaded for Part 2 on core 0; the Part change to it sent no packet`)
    // Part 1, now inactive, names the other modules on T1, T3 and T4 (core 1); then the module is picked on T2.
    const words1 = await words(1)
    for (const [n, other] of others.entries()) await bench.command(`poke 0x${hex(from + (other[39] & 1 ? 0 : 8) + [0, 2, 3][n])} ${hex(other[38]).padStart(2, '0')}`)
    await settle(120)
    const held = others.reduce((sum, other) => sum + size(other), 0)
    assert.equal(await words(1), words1 + held, 'core 1 preloaded them for Part 1')
    assert(words1 + held + size(data) > parseInt(proofs.dspLoader.B.tableWords, 16) - 64, `${pkg.key} would not fit beside them`)
    const t2 = await byte(LIVE_FX + a + 1)
    assert.equal(await call(symbols.modwerk_dsp_pick, slot, 1, chooserRow), 1); await settle(120)
    assert.equal(await byte(LIVE_FX + a + 1), t2, 'T2 kept its effect')
    console.log(`${pkg.key} on T2 refused: it does not fit core 1 beside what Part 1 names, though nothing live holds that`)
    bench.socket.end(); process.exit(0)
  }
  await pick(0, ...place(proofs))
  if (scenario === 'pick') await pick(4, ...place(proofs))
  if (scenario === 'cycles') await pick(1, ...place(proofs))
  if (scenario === 'beside') {
    await pick(4, ...place(proofs, true))
    await pick(1, 1, proofs.configuration.fx2.indexOf('PLATE REV')); await pick(5, 1, proofs.configuration.fx2.indexOf('DARK REV'))
  }
  if (scenario === 'remove') {
    await assert.rejects(session.stage(removal(base, id)), e => e.status?.result === 'rejected')
    console.log('removal refused while track 1 runs the effect')
    await pick(0, 1, 1) // FILTER
    await keep(removal(base, id).data); console.log('module removed')
  }
  bench.socket.end()
} else if (mode === 'check') {
  const [dir, out] = args, { proofs } = build(dir)
  if (scenario === 'controllers') {
    const drive = readFileSync(join(out, 'drive.txt'), 'utf8')
    assert.match(drive, /controllers: install, activation, page, MATRIX, removal and undo passed, alone and together/)
    assert.equal(readFileSync(join(out, 'dl_errors.bin')).readUInt32BE(0), 0, 'transport errors')
    console.log('controllers: passed')
    process.exit(0)
  }
  if (scenario === 'sites') {
    const drive = readFileSync(join(out, 'drive.txt'), 'utf8'), log = readFileSync(join(out, 'log.txt'), 'utf8')
    assert.match(log, /M6a gate\s+: PASS/, 'all stock tasks, including the displaced idle initialization, must run')
    assert.match(drive, /installed: \d+ sites hold, code and \d+ stock copies at 0x[0-9a-f]+/)
    assert.match(drive, /removed: every site holds what it held before/)
    console.log('sites: task initialization, installation, stock copies and restoration passed')
    process.exit(0)
  }
  const words = Array.from({ length: pkg.words }, (_, i) => parseInt(pkg.code.slice(i * 6, i * 6 + 6), 16))
  const log = readFileSync(join(out, 'log.txt'), 'utf8'), bytes = name => readFileSync(join(out, name + '.bin'))
  const u32 = name => Array.from({ length: bytes(name).length / 4 }, (_, i) => bytes(name).readUInt32BE(4 * i))
  const ids = [...bytes('ids')], peek = (core, space, at, n) => {
    const m = log.match(new RegExp(`core ${core} ${space}:0x${at.toString(16).padStart(5, '0')}:((?: [0-9a-f]{6}){${n}})`))
    assert(m, `no ${space} memory of core ${core} in the log`)
    return m[1].trim().split(' ').map(w => parseInt(w, 16))
  }
  // What core `core` runs for the effect: its code word for word where its dispatch points, inside the arena, or the null stub.
  const core = (number, tag, bound) => {
    const layout = proofs.dspLoader[tag], { home, ids } = dispatchTable(proofs.dspLoader), dispatch = peek(number, 'X', home, 2 * ids)
    const entry = [dispatch[EFFECT], dispatch[ids + EFFECT]]
    if (!bound) return assert.deepEqual(entry, layout.null, `core ${number} still dispatches the effect`)
    const table = parseInt(layout.table, 16), size = parseInt(layout.tableWords, 16), at = entry[0] - pkg.init
    assert(at >= table + 64 && at + words.length <= table + size, `core ${number} runs the effect outside the arena`)
    const placed = words.map((w, i) => pkg.relocations.includes(i) ? (w + at) & 0xffffff : w)
    assert.deepEqual(peek(number, 'P', table, size).slice(at - table, at - table + words.length), placed, `core ${number} code`)
    assert.equal(entry[1], at + pkg.proc, `core ${number} dispatch`)
  }
  // Resident words per core: each distinct effect its four tracks run, stock packages loaded on demand too.
  const resident = () => [[4, 5, 6, 7], [0, 1, 2, 3]].map((tracks, n) => [...new Set(tracks.flatMap(t => [ids[t], ids[8 + t]]))]
    .reduce((sum, fx) => sum + (fx === EFFECT ? pkg.words : proofs.dspLoader['AB'[n]].stock[fx]?.count ?? 0), 0))
  // Every stock effect core `number` runs on `tracks` is bound in its arena, entries as its package says.
  const stockBound = (number, tag, tracks) => {
    const layout = proofs.dspLoader[tag], table = parseInt(layout.table, 16), end = table + parseInt(layout.tableWords, 16)
    const width = dispatchTable(proofs.dspLoader), dispatch = peek(number, 'X', width.home, 2 * width.ids)
    for (const fx of new Set(tracks.flatMap(t => [ids[t], ids[8 + t]]))) {
      if (!layout.stock[fx]) continue
      assert(dispatch[fx] >= table + 64 && dispatch[fx] < end && dispatch[width.ids + fx] < end, `core ${number} does not run effect ${fx} from its arena`)
      assert.equal(dispatch[width.ids + fx] - dispatch[fx], layout.stock[fx].proc - layout.stock[fx].init, `core ${number} effect ${fx} entries`)
    }
  }
  if (scenario !== 'probe') assert.equal(u32('dl_errors')[0], 0, 'transport errors')
  if (scenario === 'pick') {
    assert.equal(ids[8], EFFECT); assert.equal(ids[12], EFFECT)
    assert.deepEqual(u32('dl_residency_words'), resident()); assert.equal(u32('dl_selection_refused')[0], 0)
    core(0, 'A', true); core(1, 'B', true)
    console.log(`${pkg.key} picked on T1 and T5: each core holds its code word for word and dispatches to it: passed`)
  } else if (scenario === 'remove') {
    assert.equal(ids[8], 4); assert.deepEqual(u32('dl_residency_words'), resident()); core(1, 'B', false)
    console.log('removal refused while T1 ran E-Verb; after FILTER was picked it was removed and core 1 freed its code: passed')
  } else if (scenario === 'cycles') {
    assert.equal(ids[8], EFFECT); assert.notEqual(ids[9], EFFECT)
    assert.equal(u32('dl_selection_refused')[0], 1); assert.equal(u32('dl_modal_shown')[0], 1)
    assert.deepEqual(u32('dl_residency_words'), resident()); core(1, 'B', true)
    console.log('declared the most cycles a module may: T1 admitted, T2 on the same core refused with a message and left as it was: passed')
  } else if (scenario === 'queue') {
    const a = place(proofs)[0] ? 8 : 0
    assert.equal(ids[a], EFFECT, 'T1 kept its pick'); assert.equal(ids[a + 4], EFFECT, 'T5 got its waiting pick')
    assert.equal(ids[a + 5], 4, 'T6 got its latest pick, FILTER')
    assert(u32('dl_selection_queued')[0] >= 2, 'picks waited'); assert.equal(u32('dl_selection_cancelled')[0], 0, 'none dropped')
    assert.equal(u32('dl_selection_refused')[0], 0)
    assert.deepEqual(u32('dl_residency_words'), resident()); core(0, 'A', true); core(1, 'B', true)
    console.log(`picks meeting T1's upload waited (${u32('dl_selection_queued')[0]} queued, none dropped): T1 and T5 run ${pkg.key}, T6 its latest pick, FILTER: passed`)
  } else if (scenario === 'wide') {
    const handle = ids[12], { home, ids: n } = dispatchTable(proofs.dspLoader), layout = proofs.dspLoader.A
    assert(handle >= 32 && handle < n, `T5 runs effect ${handle}, not one past 31`)
    const dispatch = peek(0, 'X', home, 2 * n), table = parseInt(layout.table, 16), size = parseInt(layout.tableWords, 16), at = dispatch[handle] - pkg.init
    assert(at >= table + 64 && at + words.length <= table + size, 'core 0 runs the effect outside the arena')
    const placed = words.map((w, i) => pkg.relocations.includes(i) ? (w + at) & 0xffffff : w)
    assert.deepEqual(peek(0, 'P', table, size).slice(at - table, at - table + words.length), placed, 'core 0 code')
    assert.equal(dispatch[n + handle], at + pkg.proc, 'core 0 dispatch')
    assert.equal(u32('dl_errors')[0], 0)
    console.log(`a module at effect id ${handle} of ${n}: core 0 holds its code word for word and dispatches to it from X:$${(home + handle).toString(16)}: passed`)
  } else if (scenario === 'union') {
    const a = place(proofs)[0] ? 8 : 0
    assert.equal(ids[a + 4], EFFECT, 'T5 runs the module in Part 2'); assert.notEqual(ids[a + 1], EFFECT, 'T2 kept its effect')
    assert.equal(u32('dl_selection_refused')[0], 1); assert.equal(u32('dl_modal_shown')[0], 1)
    const [core0, core1] = u32('dl_residency_words')
    assert.equal(core0, resident()[0]); assert(core1 > resident()[1], 'core 1 holds what Part 1 names beside what runs')
    core(0, 'A', true); core(1, 'B', false)
    console.log('the union of Parts is preloaded, a Part change into it loads nothing, a pick it cannot hold is refused with a message: passed')
  } else if (scenario === 'missing') {
    assert.equal(ids[8], EFFECT, 'T1 runs E-Verb again'); assert(u32('modwerk_dsp_missing')[0] >= 1, 'the unit said it was missing')
    assert(u32('dl_parked')[0] >= 1 && u32('dl_reinit')[0] >= 1, 'the slot waited for the code, then started from its init')
    assert.deepEqual(u32('dl_residency_words'), resident()); core(1, 'B', true)
    console.log('a project naming E-Verb before it was installed ran dry and said so; installing it restored T1 from its init: passed')
  } else if (scenario === 'beside') {
    const [a, b] = [place(proofs), place(proofs, true)].map(([slot]) => slot ? 8 : 0)
    assert.equal(ids[a], EFFECT); assert.equal(ids[b + 4], EFFECT); assert.equal(ids[9], 20); assert.equal(ids[13], 22)
    assert.equal(u32('dl_selection_refused')[0], 0); assert.deepEqual(u32('dl_residency_words'), resident())
    core(0, 'A', true); core(1, 'B', true); stockBound(0, 'A', [4, 5, 6, 7]); stockBound(1, 'B', [0, 1, 2, 3])
    const held = [[4, 5, 6, 7], [0, 1, 2, 3]].map((tracks, n) => [...new Set(tracks.flatMap(t => [ids[t], ids[8 + t]]))]
      .map(fx => fx === EFFECT ? pkg.key : proofs.dspLoader['AB'[n]].stock[fx]?.key).filter(Boolean).join(', '))
    console.log(`${pkg.key} on T1 and T5 beside stock effects, every one bound in its core's arena (core 1: ${held[1]}; core 0: ${held[0]}), ` +
      `residency ${u32('dl_residency_words').join('/')} words: passed`)
  } else if (scenario === 'stock') {
    assert.equal(ids[8], 20); assert.equal(ids[12], 22); assert.equal(u32('dl_selection_refused')[0], 0)
    stockBound(0, 'A', [4, 5, 6, 7]); stockBound(1, 'B', [0, 1, 2, 3])
    assert.deepEqual(u32('dl_residency_words'), resident())
    const loaded = [...new Set(ids)].filter(fx => proofs.dspLoader.A.stock[fx]).map(fx => proofs.dspLoader.A.stock[fx].key)
    console.log(`stock effects on demand: ${loaded.join(', ')} each run from their core's arena (PLATE REV picked on T1, DARK REV on T5): passed`)
  } else if (scenario === 'meter') {
    const [serial, least, most, sum, missed] = u32('modwerk_dsp_meter')
    assert.equal(u32('modwerk_dsp_meter_core')[0], 0); assert.equal(u32('modwerk_dsp_meter_bits')[0], 120, 'all 120 bits read')
    assert(serial >= 1 && least <= sum / 1024 && sum / 1024 <= most, 'a whole window')
    console.log(`load meter: window ${serial}, idle iterations least ${least}, mean ${(sum / 1024).toFixed(1)}, most ${most}, missed ${missed} (emulator timing): passed`)
  } else if (scenario === 'probe') {
    const answered = proofs.configuration.dsp.probe !== 'A'
    assert.equal(u32('modwerk_dsp_probes_ok')[0], answered ? 2 : 0); assert.equal(u32('modwerk_dsp_probes_failed')[0], answered ? 0 : 2)
    assert(u32('dl_frames')[0] > 1000, 'frames kept running')
    console.log(`probe ${proofs.configuration.dsp.probe ?? 'none (whole receiver)'}: each core ${answered ? 'answered' : 'took the packet and never answered, as built'}, frames kept running: passed`)
  } else if (scenario === 'parts') {
    console.log('Parts 2, 3, 4 and 1 ran in turn: passed')
  } else if (scenario === 'save') {
    assert(u32('modwerk_fxmap_written')[0] >= 1, 'SYNC TO CARD wrote the map line')
    console.log(`SYNC TO CARD: the writer wrote ${u32('modwerk_fxmap_written')[0]} map line(s) through its seam, no transport errors: passed`)
  } else throw new Error('Unknown scenario ' + scenario)
} else {
  console.error('Usage: verify-octatrack-dsp-loader.mjs dumps BUILD OUT | drive SOCK BUILD SCENARIO PACKAGE [SECOND] | check BUILD OUT SCENARIO[:MODULE] (pick, remove, cycles, missing, restore, probe, stock, beside, queue, union, save)')
  process.exit(2)
}
