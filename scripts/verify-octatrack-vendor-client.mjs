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
import { sha } from '../vendor/elekloader/kit/src/bytes.ts'
import { UploadDeviceError, UploadSession } from '../src/engine/elekloader/upload-session.ts'
import { findVendorInterface, UsbVendorTransport } from '../src/engine/elekloader/upload-usb.ts'

const [socketPath, proofsPath] = process.argv.slice(2)
if (!socketPath || !proofsPath) throw new Error('Usage: verify-octatrack-vendor-client.mjs SOCKET PROOFS_JSON')
const base = JSON.parse(readFileSync(proofsPath, 'utf8')).configurationHash

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

/** The WebUSB calls UsbVendorTransport makes, carried by the bench. */
const device = bench => ({
  async controlTransferIn(setup, length) {
    const data = await bench.controlIn(0xc1, setup.request, setup.value, setup.index, length)
    return data ? { status: 'ok', data: new DataView(data.buffer, data.byteOffset, data.byteLength) } : { status: 'stall' }
  },
  async controlTransferOut(setup, data) {
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
assert.equal(session.status.capacity, 4); assert.equal(session.status.activeKnown, true)
pass('HELLO status through SUBMIT, the engine task and RESULT')
const data = Uint8Array.from([1, 2, 3, 4])
await assert.rejects(session.stage({ base, data, sha256: sha(data) }), UploadDeviceError)
assert.equal(session.status.phase, 'normal'); assert.equal(session.connectionTrusted, true)
pass('staging is positively refused by the read-only base and the session stays trusted')
const again = await UploadSession.connect(new UsbVendorTransport(device(bench), number, { pollMs: 5 }), base)
assert.deepEqual(again.status.session, session.status.session); pass('a fresh transport continues the sequence and the session')
bench.socket.end()
console.log(`Browser client against the emulated base: ${checks} checks passed; protocol evidence only, no host driver, WebUSB or hardware.`)
