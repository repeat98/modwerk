// SPDX-License-Identifier: GPL-3.0-or-later
// USB Audio as a runtime package on a private Octatrack base in ot_emu (usb_audio_package.py, usb_function.c).
//
//   python3 -B sdk/machines/octatrack/module-adapters/usb_audio_package.py -o /private/usb-audio.mwrm
//   ot_emu --image BUILD/MAIN.raw --usb-host /tmp/ot-usb.sock --frame --ms 900000 &   # the adapted ot_emu; --frame runs the producer
//   node scripts/verify-octatrack-usb-audio-package.mjs /tmp/ot-usb.sock /private/usb-audio.mwrm
//
// On a base with USB MIDI alone: a trial of the package makes the base reconnect; the host then reads a configuration
// with AudioControl and AudioStreaming behind the base's own interfaces, the clock source answers its sample rate,
// alternate setting 1 opens the stream and EP3 IN sends packets of whole frames of the layout at the high-speed rate;
// alternate setting 0 closes it; a rollback takes the function out again and the configuration is the first one.
// Emulator evidence of the package's and the base's code only: no host driver, no audio content check, no hardware.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { sha } from '../vendor/elekloader/kit/src/bytes.ts'
import { UploadSession } from '../src/engine/elekloader/upload-session.ts'
import { findVendorInterface, UsbVendorTransport } from '../src/engine/elekloader/upload-usb.ts'
import { diagnostics } from '../src/dev/octatrack-usb-lifecycle.ts'
import { Bench, device } from './usb-bench.mjs'

const [socket, file, frame = '80'] = process.argv.slice(2)
if (!socket || !file || ![8, 16, 64, 80].includes(Number(frame))) throw new Error('Usage: verify-octatrack-usb-audio-package.mjs BENCH-SOCKET usb-audio.mwrm [FRAME-BYTES: 80 (default, 20 channels), 64 TRACKS, 16 MAIN CUE, 8 MASTER or MAIN]')
const AC = 4, AS = 5, CLOCK = 0x10, FRAME_BYTES = Number(frame) // a frame: 4 bytes a sample for each channel of the layout
const wait = ms => new Promise(resolve => setTimeout(resolve, ms))
const bench = new Bench(socket)
await bench.ready()
const unit = device(bench)

async function enumerate() {
  await bench.command('speed hs'); await bench.command('reset'); await wait(300)
  assert.equal((await bench.controlIn(0x80, 6, 0x0100, 0, 18))?.length, 18)
  await bench.transaction(async () => { await bench.setup(0x00, 5, 1, 0, 0); await bench.command('in 0 64') })
  const header = await bench.controlIn(0x80, 6, 0x0200, 0, 9)
  const cfg = await bench.controlIn(0x80, 6, 0x0200, 0, header.readUInt16LE(2))
  const other = await bench.controlIn(0x80, 6, 0x0700, 0, 512)
  await bench.transaction(async () => { await bench.setup(0x00, 9, 1, 0, 0); await bench.command('in 0 64') })
  const interfaces = []
  for (let i = 0; i + 2 <= cfg.length && cfg[i] >= 2; i += cfg[i]) if (cfg[i + 1] === 4) interfaces.push({ interfaceNumber: cfg[i + 2], alternate: cfg[i + 3], alternates: [{
    interfaceClass: cfg[i + 5], interfaceSubclass: cfg[i + 6], interfaceProtocol: cfg[i + 7], endpoints: Array.from({ length: cfg[i + 4] }) }] })
  return { cfg, other, interfaces, total: header.readUInt16LE(2), count: header[4] }
}
const first = await enumerate(), index = findVendorInterface(first)
const transport = new UsbVendorTransport(unit, index, { pollMs: 5 })
const identity = await transport.identify()
console.log(`base ${identity.base.slice(0, 16)}…: configuration ${first.total} bytes, ${first.count} interfaces`)
assert.equal(first.count, 4, 'a base with USB MIDI alone')
const usb = async () => { const reply = await bench.controlIn(0xc1, 41, 0, index, 8); return reply ? [...reply] : null }
assert.deepEqual(await usb(), [0, 0, 0, 0, 0, 0, 0, 0])
const data = new Uint8Array(readFileSync(file)), pkg = { base: identity.base, data, sha256: sha(data) }

async function stopping(step) {
  for (const start = Date.now(); ; await wait(200)) {
    try { return await step() } catch (error) { if (!['unsafe', 'needs-recovery'].includes(error.status?.result) || Date.now() - start > 5000) throw error }
  }
}
async function settle(label, live) {
  const seen = []
  let now
  for (const start = Date.now(); Date.now() - start < 240000; await wait(20)) {
    const s = await usb(), key = JSON.stringify(s?.slice(0, 5))
    if (seen.at(-1) !== key) { seen.push(key); console.log(`  ${label}: USB FUNCTION ${key}`) }
    if (s?.[0] === 3 && !now) now = await enumerate()
    if (s?.[0] === 0 && s[1] === live) { assert.ok(now, label + ': the unit went off the bus and came back'); return now }
  }
  throw new Error(label + ': the reconnect did not settle')
}
const noData = (type, request, value, target) => bench.transaction(async () => {
  await bench.setup(type, request, value, target, 0)
  return (await bench.command('in 0 64'))[2] !== 'stall'
})
const alternate = async () => (await bench.controlIn(0x81, 10, 0, AS, 1))?.[0]

const session = await UploadSession.connect(transport, identity.base, { timeoutMs: 30000 })
await session.stage(pkg); await session.activate(); await session.startTrial()
let now = await settle('trial', 1)
assert.equal(now.count, 6)
assert.ok(now.total > first.total && now.other.length === now.total)
assert.equal(now.cfg.subarray(5, first.total).toString('hex'), first.cfg.subarray(5).toString('hex'), 'the base’s own part is unchanged')
const audio = now.interfaces.filter(i => i.interfaceNumber >= AC)
assert.deepEqual(audio.map(i => [i.interfaceNumber, i.alternate, i.alternates[0].interfaceClass, i.alternates[0].interfaceSubclass, i.alternates[0].endpoints.length]),
  [[AC, 0, 1, 1, 0], [AS, 0, 1, 2, 0], [AS, 1, 1, 2, 1]], 'AudioControl, and AudioStreaming with its streaming alternate')
console.log(`  configuration ${now.total} bytes, ${now.count} interfaces: AudioControl ${AC}, AudioStreaming ${AS}`)
assert.ok((await diagnostics(unit, index)).active, 'the trial is still open after the base’s own reconnect')

// The clock source: 44.1 kHz, valid; its range has one entry. A control nobody implements stalls.
assert.equal((await bench.controlIn(0xa1, 1, 0x0100, CLOCK << 8 | AC, 4))?.toString('hex'), '44ac0000')
assert.equal((await bench.controlIn(0xa1, 1, 0x0200, CLOCK << 8 | AC, 1))?.toString('hex'), '01')
assert.equal((await bench.controlIn(0xa1, 2, 0x0100, CLOCK << 8 | AC, 14))?.subarray(0, 2).toString('hex'), '0100')
assert.equal(await bench.controlIn(0xa1, 1, 0x0300, CLOCK << 8 | AC, 1), null)
assert.equal((await transport.identify()).base, identity.base)

// The stream: alternate setting 1, then EP3 IN at the high-speed poll rate.
assert.equal(await alternate(), 0)
await bench.command('isohz 4000')
assert.ok(await noData(0x01, 11, 1, AS), 'SET_INTERFACE alternate 1')
assert.equal(await alternate(), 1)
const lengths = []
let nonempty = 0
for (let i = 0; i < 256 && nonempty < 16; ++i) {
  const reply = await bench.command('in 3 1024')
  assert.notEqual(reply[2], 'stall')
  const packet = Buffer.from(reply[2] ?? '', 'hex')
  lengths.push(packet.length)
  if (!packet.length) continue
  assert.ok(packet.length % FRAME_BYTES === 0 && [10, 11, 12].includes(packet.length / FRAME_BYTES), `a packet of ${packet.length} bytes is not 10 to 12 whole frames`)
  ++nonempty
}
assert.equal(nonempty, 16, 'sixteen packets with audio frames; lengths ' + lengths.join(','))
console.log(`  stream: ${lengths.length} polls, 16 packets of ${[...new Set(lengths.filter(Boolean))].sort().join(' or ')} bytes`)
const counters = await bench.controlIn(0xc0, 0x55, 0, 0, 60)
assert.equal(counters?.length, 60)
console.log(`  counters: consumed ${counters.readUInt32BE(0)}, overruns ${counters.readUInt32BE(8)}, underruns ${counters.readUInt32BE(12)}`)
assert.ok(counters.readUInt32BE(0) > 0, 'frames were pulled from the ring')
assert.ok(await noData(0x01, 11, 0, AS), 'SET_INTERFACE alternate 0')
assert.equal(await alternate(), 0)
assert.ok((await diagnostics(unit, index)).active, 'the trial is still open after the stream')

await stopping(() => session.holdTrial()); await stopping(() => session.rollback())
now = await settle('rollback', 0)
assert.equal(now.count, 4)
assert.equal(now.cfg.toString('hex'), first.cfg.toString('hex'))
assert.equal(await bench.controlIn(0xa1, 1, 0x0100, CLOCK << 8 | AC, 4), null, 'no clock source without the module')
await session.leaveUploadMode()
console.log('USB Audio as a package in the emulator: it enumerates behind the base’s interfaces, answers its clock, streams packets of whole frames at high speed, closes, and a rollback takes it out.')
process.exit(0)
