// SPDX-License-Identifier: GPL-3.0-or-later
// The browser's USB transport and session client against the private base in
// the emulator, through ot_emu's USB bench socket (sdk/octabam/tools/emu/ot_emu/usb.h).
//
//   ot_emu --image MAIN.raw --usb-host /tmp/ot-usb.sock --ms 300000 &
//   node scripts/verify-octatrack-vendor-client.mjs /tmp/ot-usb.sock NEW-core-output/proofs.json
//
// Emulator protocol evidence only: no host OS driver, WebUSB claim, timing or hardware.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createConnection } from 'node:net'
import { dirname, join } from 'node:path'
import { sha } from '../vendor/elekloader/kit/src/bytes.ts'
import { UploadSession } from '../src/engine/elekloader/upload-session.ts'
import { findVendorInterface, UsbVendorTransport } from '../src/engine/elekloader/upload-usb.ts'

const [socketPath, proofsPath] = process.argv.slice(2)
if (!socketPath || !proofsPath) throw new Error('Usage: verify-octatrack-vendor-client.mjs SOCKET PROOFS_JSON')
const base = JSON.parse(readFileSync(proofsPath, 'utf8')).configurationHash
const symbols = JSON.parse(readFileSync(join(dirname(proofsPath), 'symbols.json'), 'utf8'))
const delay = ms => new Promise(resolve => setTimeout(resolve, ms))

/** The bench's line protocol: one command, one reply line, in order. */
class Bench {
  constructor(path) {
    this.lines = []; this.waiters = []; this.buffer = ''
    this.socket = createConnection(path)
    this.socket.setEncoding('utf8')
    this.socket.on('data', chunk => {
      this.buffer += chunk
      for (let i; (i = this.buffer.indexOf('\n')) >= 0;) {
        const line = this.buffer.slice(0, i); this.buffer = this.buffer.slice(i + 1)
        const waiter = this.waiters.shift()
        if (waiter) waiter(line); else this.lines.push(line)
      }
    })
  }
  ready() { return new Promise((resolve, reject) => { this.socket.once('connect', resolve); this.socket.once('error', reject) }) }
  async command(line) {
    this.socket.write(line + '\n')
    const reply = this.lines.length ? this.lines.shift() : await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('No reply to ' + line)), 60000)
      this.waiters.push(value => { clearTimeout(timer); resolve(value) })
    })
    if (reply.startsWith('err')) throw new Error('Bench: ' + reply)
    return reply.split(' ')
  }
  setup(type, request, value, index, length) {
    const bytes = Buffer.alloc(8)
    bytes[0] = type; bytes[1] = request; bytes.writeUInt16LE(value, 2); bytes.writeUInt16LE(index, 4); bytes.writeUInt16LE(length, 6)
    return this.command('setup ' + bytes.toString('hex'))
  }
  /** IN data stage then the OUT status stage; null on a stall. */
  async controlIn(type, request, value, index, length) {
    await this.setup(type, request, value, index, length)
    const reply = await this.command(`in 0 ${length}`)
    if (reply[2] === 'stall') return null
    await this.command('out 0')
    return Buffer.from(reply[2] ?? '', 'hex')
  }
}

/** The WebUSB calls UsbVendorTransport makes, carried by the bench. `fault` runs first, once. */
const device = (bench, faults = {}) => ({
  async controlTransferIn(setup, length) {
    if (faults.before) { const fault = faults.before; faults.before = undefined; await fault() }
    const data = await bench.controlIn(0xc1, setup.request, setup.value, setup.index, length)
    return data ? { status: 'ok', data: new DataView(data.buffer, data.byteOffset, data.byteLength) } : { status: 'stall' }
  },
  async controlTransferOut(setup, data) {
    if (faults.before) { const fault = faults.before; faults.before = undefined; await fault() }
    await bench.setup(0x41, setup.request, setup.value, setup.index, data.length)
    if ((await bench.command('out 0 ' + Buffer.from(data).toString('hex')))[2] === 'stall') return { status: 'stall', bytesWritten: 0 }
    if ((await bench.command('in 0 64'))[2] === 'stall') return { status: 'stall', bytesWritten: 0 }
    return { status: 'ok', bytesWritten: data.length }
  },
})

/** Enumerate as a host does and describe the configuration as WebUSB would. */
async function enumerate(bench) {
  await bench.command('speed hs'); await bench.command('reset')
  await new Promise(resolve => setTimeout(resolve, 300))
  assert.equal((await bench.controlIn(0x80, 6, 0x0100, 0, 18))?.length, 18)
  await bench.setup(0x00, 5, 1, 0, 0); await bench.command('in 0 64')
  const header = await bench.controlIn(0x80, 6, 0x0200, 0, 9)
  const cfg = await bench.controlIn(0x80, 6, 0x0200, 0, header.readUInt16LE(2))
  await bench.setup(0x00, 9, 1, 0, 0); await bench.command('in 0 64')
  const interfaces = []
  for (let i = 0; i + 2 <= cfg.length && cfg[i] >= 2; i += cfg[i]) {
    if (cfg[i + 1] === 4) interfaces.push({ interfaceNumber: cfg[i + 2], alternates: [{
      interfaceClass: cfg[i + 5], interfaceSubclass: cfg[i + 6], interfaceProtocol: cfg[i + 7],
      endpoints: Array.from({ length: cfg[i + 4] }) }] })
  }
  return { interfaces }
}

const bench = new Bench(socketPath)
await bench.ready()
let checks = 0
const pass = name => { checks++; console.log(name + ': passed') }

const number = findVendorInterface(await enumerate(bench))
assert.equal(number, 1); pass('the client finds the vendor interface in the device\'s own configuration')
const transport = new UsbVendorTransport(device(bench), number, { pollMs: 5 })
const identity = await transport.identify()
assert.deepEqual(identity, { canSubmit: true, base, model: 'OCTATRACK 1.40C' }); pass('IDENTIFY from the firmware')
const session = await UploadSession.connect(transport, identity.base)
assert.equal(session.status.phase, 'normal'); assert.equal(session.status.active, base)
assert.equal(session.status.capacity, 16400); assert.equal(session.status.activeKnown, true)
pass('HELLO status through SUBMIT, the engine task and RESULT')

// Runtime modules: "MWRM", ABI 1, entry 0, then movea.l 4(sp),a0; move.l #value,(a0); rts.
const module = (value, padding = 0) => {
  const code = [0x20, 0x6f, 0x00, 0x04, 0x20, 0xbc, 0, 0, 0, value, 0x4e, 0x75, ...new Array(padding).fill(0)]
  const data = Uint8Array.from([0x4d, 0x57, 0x52, 0x4d, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, code.length >> 8, code.length & 0xff, ...code])
  return { base, data, sha256: sha(data) }
}
const removal = (() => { const data = Uint8Array.from([0x4d, 0x57, 0x52, 0x4d, 0, 1, 0, 0, ...new Array(8).fill(0)]); return { base, data, sha256: sha(data) } })()
const call = async name => Number((await bench.command('call 0x' + symbols[name].toString(16)))[1])
const value = () => call('modwerk_runtime_value')
const settle = () => delay(200)

assert.equal(await value(), 0)
const a = module(0xa1), b = module(0xb2)
await session.stage(a); await session.activate(); await session.startTrial(); await settle()
assert.equal(await value(), 0xa1); assert.equal(session.status.active, a.sha256)
await session.holdTrial(); await session.accept(); await session.leaveUploadMode()
assert.equal(session.status.generation, 1); pass('module A loads, runs in its trial and is accepted without a reboot')
await session.stage(b); await session.activate(); await session.startTrial(); await settle()
assert.equal(await value(), 0xb2)
await session.holdTrial(); await session.rollback(); await session.leaveUploadMode(); await settle()
assert.equal(session.status.active, a.sha256); assert.equal(await value(), 0xa1)
pass('replacement B runs in its trial and rolls back to A')
await session.stage(removal); await session.activate(); await session.startTrial(); await settle()
assert.equal(await call('modwerk_runtime_active'), 0)
await session.holdTrial(); await session.rollback(); await session.leaveUploadMode(); await settle()
assert.notEqual(await call('modwerk_runtime_active'), 0); pass('removal empties the slot and rollback restores A')

// Interrupted staging: a bus reset after the first chunk of a two-chunk package.
const faults = {}
const staging = await UploadSession.connect(new UsbVendorTransport(device(bench, faults), number, { pollMs: 5 }), base)
await assert.rejects(staging.stage(module(0xc3, 5000), { progress: () => { faults.before = () => bench.command('reset') } }))
await enumerate(bench)
const after = await UploadSession.connect(new UsbVendorTransport(device(bench), number, { pollMs: 5 }), base)
assert.equal(after.status.phase, 'normal'); assert.equal(after.status.active, a.sha256)
assert.deepEqual(after.status.session, session.status.session); await settle()
assert.equal(await value(), 0xa1); pass('a bus reset mid-staging discards the candidate and keeps A running')
bench.socket.end()
console.log(`Browser client against the emulated base: ${checks} checks passed; protocol evidence only, no host driver, WebUSB or hardware.`)
