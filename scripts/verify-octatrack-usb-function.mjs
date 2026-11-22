// SPDX-License-Identifier: GPL-3.0-or-later
// A module's USB function on a private Octatrack base in ot_emu (events.json ot_usb_functions, usb_function.c).
//
//   python3 -B sdk/runtime/loader/build.py sdk/machines/octatrack/elekloader/examples/usb_function.c -o /private/usb_function.mwrm \
//     --subscribe ot_usb_functions:usb_function:50 --subscribe ev_usb_isr:usb_function_isr:50 \
//     --subscribe ev_usb_bus_end:usb_function_bus_end:50 --subscribe ev_usb_control:usb_function_control:50 \
//     --subscribe ev_usb_frame:usb_function_frame:50
//   ot_emu --image BUILD/MAIN.raw --usb-host /tmp/ot-usb.sock --ms 900000 &      # the adapted ot_emu, one run a check
//   node scripts/verify-octatrack-usb-function.mjs /tmp/ot-usb.sock /private/usb_function.mwrm [--linked]
//
// On a base with USB MIDI alone: a trial of the package makes the base reconnect by itself; the host, which resets
// the bus and enumerates when the unit is back, reads the configuration with the function behind the base's own
// interfaces at both speeds; the trial is still open and the module still runs; the three hooks ran; a rollback takes
// the function out again with a second reconnect; then the same with a kept install and its removal. With --linked,
// on a base that links USB Audio in (a development twin): the package is refused and the configuration stays.
// Emulator evidence of the base's code only: no host driver, no WebUSB, no hardware, and ot_emu does not take the
// unit off the bus when the controller stops.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { sha } from '../vendor/elekloader/kit/src/bytes.ts'
import { UploadSession } from '../src/engine/elekloader/upload-session.ts'
import { findVendorInterface, UsbVendorTransport } from '../src/engine/elekloader/upload-usb.ts'
import { diagnostics, removal } from '../src/dev/octatrack-usb-lifecycle.ts'
import { Bench, device } from './usb-bench.mjs'

const [socket, file, mode] = process.argv.slice(2)
if (!socket || !file || (mode && mode !== '--linked')) throw new Error('Usage: verify-octatrack-usb-function.mjs BENCH-SOCKET usb_function.mwrm [--linked]')
const wait = ms => new Promise(resolve => setTimeout(resolve, ms))
const bench = new Bench(socket)
await bench.ready()
const unit = device(bench)

/** What a host does when a device appears: bus reset, address, both configurations, SET_CONFIGURATION. */
async function enumerate() {
  await bench.command('speed hs'); await bench.command('reset'); await wait(300)
  assert.equal((await bench.controlIn(0x80, 6, 0x0100, 0, 18))?.length, 18)
  await bench.transaction(async () => { await bench.setup(0x00, 5, 1, 0, 0); await bench.command('in 0 64') })
  const header = await bench.controlIn(0x80, 6, 0x0200, 0, 9)
  const cfg = await bench.controlIn(0x80, 6, 0x0200, 0, header.readUInt16LE(2))
  const other = await bench.controlIn(0x80, 6, 0x0700, 0, 512)
  await bench.transaction(async () => { await bench.setup(0x00, 9, 1, 0, 0); await bench.command('in 0 64') })
  const interfaces = []
  for (let i = 0; i + 2 <= cfg.length && cfg[i] >= 2; i += cfg[i]) if (cfg[i + 1] === 4) interfaces.push({ interfaceNumber: cfg[i + 2], alternates: [{
    interfaceClass: cfg[i + 5], interfaceSubclass: cfg[i + 6], interfaceProtocol: cfg[i + 7], endpoints: Array.from({ length: cfg[i + 4] }) }] })
  return { cfg, other, interfaces, total: header.readUInt16LE(2), count: header[4] }
}
const first = await enumerate(), index = findVendorInterface(first)
const transport = new UsbVendorTransport(unit, index, { pollMs: 5 })
const identity = await transport.identify()
console.log(`base ${identity.base.slice(0, 16)}…: configuration ${first.total} bytes, ${first.count} interfaces`)
/** USB FUNCTION (usb_function.h): [state, in the configuration, in the table, reconnects, of them not waited for]. */
const usb = async () => { const reply = await bench.controlIn(0xc1, 41, 0, index, 8); return reply ? [...reply] : null }
const SETTLED = [0, 0, 0, 0, 0, 0, 0, 0]
assert.deepEqual(await usb(), SETTLED)
const data = new Uint8Array(readFileSync(file)), pkg = { base: identity.base, data, sha256: sha(data) }

if (mode === '--linked') {
  assert.deepEqual([first.total, first.count], [259, 6]) // mass storage, vendor, USB MIDI and the twenty-channel USB Audio
  const session = await UploadSession.connect(transport, identity.base, { timeoutMs: 10000 })
  let refused
  try { await session.stage(pkg); await session.activate() } catch (error) { refused = error }
  assert.equal(refused?.status?.result, 'rejected', 'the base refused the function')
  await wait(3000)
  assert.deepEqual(await usb(), SETTLED)
  const now = await enumerate()
  assert.equal(now.cfg.toString('hex'), first.cfg.toString('hex'))
  console.log('A base with USB Audio linked in refuses a contributed USB function and keeps its configuration.')
  process.exit(0)
}

assert.equal(first.count, 4)
const diag = () => diagnostics(unit, index)
/** As device.mjs: a step the loader cannot switch yet answers unsafe or needs-recovery; a few seconds of retries. */
async function stopping(step) {
  for (const start = Date.now(); ; await wait(200)) {
    try { return await step() } catch (error) { if (!['unsafe', 'needs-recovery'].includes(error.status?.result) || Date.now() - start > 5000) throw error }
  }
}
/** Until USB FUNCTION is settled: the states it went through, and what the host read when the unit was back. */
async function settle(label, live) {
  const seen = []
  let now
  for (const start = Date.now(); Date.now() - start < 120000; await wait(20)) {
    const s = await usb(), key = JSON.stringify(s?.slice(0, 5))
    if (seen.at(-1) !== key) { seen.push(key); console.log(`  ${label}: USB FUNCTION ${key}`) }
    // Back on the bus: a host resets it and enumerates before any driver or page reaches the vendor interface. A
    // request on the vendor interface alone must not end the reconnect: this loop's own requests come first here.
    if (s?.[0] === 3 && !now) now = await enumerate()
    if (s?.[0] === 0 && s[1] === live) { assert.ok(now, label + ': the unit went off the bus and came back'); return { seen, now } }
  }
  throw new Error(label + ': the reconnect did not settle')
}
// examples/usb_function.c: its block at high speed, and the same with full speed's packet size.
const HIGH = '080b0402ff550000' + '0904040000ff550100' + '0904050001ff550200' + '07058302000200'
const FULL = HIGH.replace('07058302000200', '07058302400000')
function describes(now, live) {
  assert.equal(now.count, live ? 6 : 4)
  assert.equal(now.total, first.total + (live ? HIGH.length / 2 : 0))
  assert.equal(now.cfg.subarray(5, first.total).toString('hex'), first.cfg.subarray(5).toString('hex')) // the base's own part
  assert.equal(now.cfg.subarray(first.total).toString('hex'), live ? HIGH : '')
  assert.equal(now.other.length, now.total)
  assert.equal(now.other.subarray(first.total).toString('hex'), live ? FULL : '')
}

// A trial across the reconnect.
let session = await UploadSession.connect(transport, identity.base, { timeoutMs: 10000 })
await session.stage(pkg); await session.activate(); await session.startTrial()
let { seen, now } = await settle('trial', 1)
assert.deepEqual(seen.map(s => JSON.parse(s)[0]), [1, 2, 3, 0]) // due, off the bus, back, settled
describes(now, true)
let d = await diag()
assert.ok(d.active, 'the trial is still open and the module still runs after the base’s own reconnect')
assert.ok(d.value >>> 24 >= 1 && (d.value & 1) === 1, 'ev_usb_bus_end and ev_usb_isr ran')
assert.equal(d.value & 2, 2, 'ev_usb_frame ran: the frame interrupt reaches the module')
// A class request to interface 4 is the function's, one to interface 5 is nobody's: both stall, one by its own hand.
assert.equal(await bench.controlIn(0xa1, 0x70, 0, 4, 1), null)
assert.equal(await bench.controlIn(0xa1, 0x70, 0, 5, 1), null)
await wait(300)
d = await diag()
assert.deepEqual([d.value >>> 16 & 0xff, d.value >>> 8 & 0xff], [1, 2], 'ev_usb_control: asked twice, answered once')
assert.equal((await transport.identify()).base, identity.base) // the control endpoint answers after the function's stall
await stopping(() => session.holdTrial()); await stopping(() => session.rollback())
;({ now } = await settle('rollback', 0))
describes(now, false)
assert.equal(now.cfg.toString('hex'), first.cfg.toString('hex'))
await session.leaveUploadMode()

// Kept, then removed.
session = await UploadSession.connect(transport, identity.base, { timeoutMs: 10000 })
await session.stage(pkg); await session.activate(); await session.startTrial(); await stopping(() => session.holdTrial()); await session.accept()
await session.leaveUploadMode()
;({ now } = await settle('kept', 1))
describes(now, true)
session = await UploadSession.connect(transport, identity.base, { timeoutMs: 10000 })
await stopping(() => session.stage(removal(identity.base, new DataView(data.buffer).getUint32(28)))); await session.activate(); await session.startTrial()
await stopping(() => session.holdTrial()); await session.accept()
await session.leaveUploadMode()
;({ now } = await settle('removed', 0))
describes(now, false)
assert.deepEqual((await usb()).slice(0, 5), [0, 0, 0, 4, 0]) // four reconnects, each after an idle control endpoint
console.log('A module’s USB function in the emulator: the trial stayed open across the reconnect, the configuration followed at both speeds, the hooks ran; rollback, keep and removal pass.')
process.exit(0)
