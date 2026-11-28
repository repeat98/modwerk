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
// With `setting`, on a development base (--dev) booted with a card (ot_emu --card): the panel opens PROJ > MODWERK >
// SETTINGS, open USB AUDIO and select OFF and, in the twenty-channel layout, MAIN + CUE ONLY; each choice is in the base's battery-RAM
// store, and the stream goes on under it with whole packets: of zeros under OFF, with silent track channels under
// MAIN + CUE ONLY.
// The emulated unit runs as the bench drives it, so the key presses and RAM reads between the bursts advance its
// producer while nothing polls EP3: the ring then runs past its 1024 frames and the counters show an overrun or
// two. The same control traffic with no setting change does it too (20 November 2026); a host polls all the time.
// Emulator evidence of the package's and the base's code only: no host driver, no audio content check, no hardware.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { sha } from '../src/engine/elektron/bytes.ts'
import { UploadSession } from '../src/engine/elekloader/upload-session.ts'
import { findVendorInterface, UsbVendorTransport } from '../src/engine/elekloader/upload-usb.ts'
import { diagnostics } from '../src/dev/octatrack-usb-lifecycle.ts'
import { Bench, device } from './usb-bench.mjs'
import registry from '../sdk/machines/octatrack/events.json' with { type: 'json' }

const [socket, file, frame = '80', setting] = process.argv.slice(2)
if (!socket || !file || ![8, 16, 32, 64, 80].includes(Number(frame)) || (setting && setting !== 'setting')) throw new Error('Usage: verify-octatrack-usb-audio-package.mjs BENCH-SOCKET usb-audio.mwrm [FRAME-BYTES: 80 (default, 20 channels), 64 TRACKS, 32 OUTBOX, 16 MAIN CUE, 8 MASTER or MAIN] [setting]')
const AC = 4, AS = 5, CLOCK = 0x10, FRAME_BYTES = Number(frame) // a frame: 4 bytes a sample for each channel of the layout
const wait = ms => new Promise(resolve => setTimeout(resolve, ms))
const bench = new Bench(socket)
await bench.ready()
const unit = device(bench)

async function enumerate(speed = 'hs') {
  await bench.command('speed ' + speed); await bench.command('reset'); await wait(300)
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

const configurable = Buffer.from(data).readUInt16BE(66) === 7

async function stopping(step) {
  for (const start = Date.now(); ; await wait(200)) {
    try { return await step() } catch (error) { if (!['unsafe', 'needs-recovery'].includes(error.status?.result) || Date.now() - start > 5000) throw error }
  }
}
let reconnectCount = 0
async function settle(label, live, speed = 'hs') {
  const expected = (reconnectCount + 1) & 255
  const seen = []
  let now
  for (const start = Date.now(); Date.now() - start < 240000; await wait(20)) {
    const s = await usb(), key = JSON.stringify(s?.slice(0, 5))
    if (seen.at(-1) !== key) { seen.push(key); console.log(`  ${label}: USB FUNCTION ${key}`) }
    if (s?.[3] !== expected) continue // a panel key can arrive before the UI tick handles it
    if (s[0] === 3 && !now) now = await enumerate(speed)
    if (s[0] === 0 && s[1] === live && s[2] === live) {
      assert.ok(now, label + ': the unit went off the bus and came back')
      reconnectCount = expected
      return now
    }
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
if (configurable) {
  const bytes = Buffer.from(data), hook = registry.events.find(event => event.event === 'ot_settings').index
  const record = 76 + 4*bytes.readUInt32BE(20) + (bytes.readUInt32BE(76 + 4*hook) & 0xffffff)
  if (bytes.readUInt32BE(record) === 3) {
    const expected = bytes.readUInt32BE(record + 20)
    let initial
    for (let i=0; i<100 && initial === undefined; ++i) {
      initial = (await transport.settingPresets())?.get(0x8c3a257f)
      if (initial === undefined) await wait(80)
    }
    assert.equal(initial, expected, 'the release base reports the installed set preset')
    const records=[]
    for (let at=0; at<now.cfg.length; at+=now.cfg[at]) { assert.ok(now.cfg[at]>=2); records.push(now.cfg.subarray(at,at+now.cfg[at])) }
    const stream = records.find(r=>r[0]===16 && r[1]===0x24 && r[2]===1)
    assert.equal(stream[10], FRAME_BYTES/4, 'the USB descriptor matches the imported layout')
    console.log('  migrated preset', expected.toString(16), 'channels', stream[10])
  }
}
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
if (configurable) {
  const setRate = rate => {
    const payload = Buffer.alloc(4)
    payload.writeUInt32LE(rate)
    return bench.controlOut(0x21, 1, 0x0100, CLOCK << 8 | AC, payload)
  }
  assert.equal(await setRate(44100), true, 'fixed clock acknowledges its supported rate')
  assert.equal(await setRate(48000), false, 'fixed clock stalls an unsupported rate')
}
assert.equal((await transport.identify()).base, identity.base)

// dev.c: keys as the panel reports them (request 5), RAM read-only (15 and 16).
const dev = async (request, value, length) => {
  const reply = await unit.controlTransferIn({ requestType: 'vendor', recipient: 'interface', request, value, index }, length)
  assert.equal(reply.status, 'ok', 'a development base answers request ' + request)
  return new Uint8Array(reply.data.buffer, reply.data.byteOffset, reply.data.byteLength)
}
const KEY = { UP: 0x33, DOWN: 0x20, RIGHT: 0x21, YES: 0x31, NO: 0x32, PROJ: 0x1c }
const press = async (...names) => { for (const name of names) { await dev(5, KEY[name] | 0x100, 1); await wait(120); await dev(5, KEY[name], 1); await wait(1200) } }
const STORE = 0x100f9000 // settings.c: 'MWS1', then eight entries of a label's hash and its choice
const kept = async () => { await dev(15, STORE >>> 16, 1); const m = Buffer.from(await dev(16, STORE & 0xffff, 68)); return m }
let hash = 2166136261
for (const c of 'USB AUDIO') hash = Math.imul(hash ^ c.charCodeAt(0), 16777619) >>> 0
const choice = async () => { const m = await kept(); if (m.readUInt32BE(0) !== 0x4d575331) return undefined
  for (let i = 0; i < 8; ++i) if (m.readUInt32BE(4 + 8 * i) === hash) return m.readUInt32BE(8 + 8 * i) }
/** YES on the open page, then the kept choice once it is `want`: the emulated panel runs far below real time. */
const take = async (want, label) => {
  await press('YES')
  for (const start = Date.now(); Date.now() - start < 60000; await wait(500)) if (await choice() === want) return
  assert.equal(await choice(), want, label)
}
if (setting) { // the page is opened before the stream: it never holds the panel, and stays open under it
  assert.equal(await choice(), undefined, 'nothing kept before the player chooses')
  await press('PROJ', 'DOWN', 'DOWN', 'DOWN', 'DOWN', 'RIGHT', 'DOWN', 'DOWN', 'DOWN', 'DOWN', 'DOWN', 'YES', 'YES') // MODWERK, SETTINGS, USB AUDIO
  if (configurable) await press('DOWN', 'DOWN', 'DOWN', 'YES') // OUTPUT MODE
}

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
const first16 = async (label, bytes = FRAME_BYTES, sizes = [10, 11, 12]) => {
  const packets = []
  for (let i = 0; i < 256 && packets.length < 16; ++i) {
    const packet = Buffer.from((await bench.command('in 3 1024'))[2] ?? '', 'hex')
    if (!packet.length) continue
    assert.ok(packet.length % bytes === 0 && sizes.includes(packet.length / bytes), `${label}: a packet of ${packet.length} bytes`)
    packets.push(packet)
  }
  assert.equal(packets.length, 16, label + ': sixteen packets')
  return packets
}
if (setting) {
  await press('DOWN')
  assert.equal(await choice(), undefined, 'browsing leaves the stored choice untouched')
  await take(1, 'selecting OFF stores it')
  for (const packet of await first16('OFF')) assert.ok(packet.every(byte => byte === 0), 'OFF sends packets of zeros')
  console.log('  setting: OFF kept in battery RAM; 16 whole packets of zeros')
  if (FRAME_BYTES === 80) {
    await press('DOWN')
    await take(2, 'the twenty-channel layout offers MAIN + CUE ONLY')
    for (const packet of await first16('MAIN + CUE ONLY')) for (let at = 0; at < packet.length; at += 80)
      assert.ok(packet.subarray(at, at + 64).every(byte => byte === 0), 'MAIN + CUE ONLY: the sixteen track channels are silent')
    console.log('  setting: MAIN + CUE ONLY kept; 16 whole packets with silent track channels')
  }
  await press('UP')
  if (FRAME_BYTES === 80) await press('UP')
  await take(0, 'select ALL CHANNELS')
  await first16('ALL CHANNELS')
  if (configurable) {
    const openFormat = async (channels, speed) => {
      const { cfg } = await settle('panel format', 1, speed)
      const records = []
      for (let i = 0; i < cfg.length; i += cfg[i]) { assert.ok(cfg[i] >= 2); records.push(cfg.subarray(i, i + cfg[i])) }
      assert.equal(records.find(r => r[0] === 16 && r[1] === 0x24 && r[2] === 1)[10], channels)
      await bench.command('isohz ' + (speed === 'fs' ? 1000 : 4000))
      assert.ok(await noData(0x01, 11, 1, AS))
      await first16('panel format', channels * 4, speed === 'fs' ? [43,44,45] : [10,11,12])
    }
    await press('NO', 'UP', 'YES', 'DOWN')
    await take(0x80432120, 'POST LEVEL on 20 channels')
    await first16('20 channels post')
    await press('NO', 'UP', 'YES', 'DOWN', 'YES')
    await openFormat(16, 'hs')
    assert.equal(await choice(), 0x80432124, 'same eight post-level stems in the 16-channel layout')
    await press('NO', 'UP', 'YES', 'DOWN', 'YES')
    await openFormat(8, 'hs')
    await press('NO', 'DOWN', 'DOWN', 'DOWN', 'DOWN', 'YES', 'UP')
    await take(0x80432064, 'Outbox pair 1 set to OFF')
    for (const packet of await first16('Outbox pair 1 off', 32)) {
      for (let i = 0; i < packet.length; i += 32) assert.ok(packet.subarray(i,i+8).every(b => b === 0))
    }
    await press('NO', 'UP', 'UP', 'UP', 'UP', 'YES', 'UP', 'YES')
    await openFormat(2, 'fs')
    console.log('  same package: 20 and 16 post, 8 routed Outbox channels, stereo at full speed')
  }
  await press('NO', 'NO')
  console.log('  setting: back to ALL CHANNELS; the stream goes on')
}
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
