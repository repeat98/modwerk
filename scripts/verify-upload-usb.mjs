// SPDX-License-Identifier: GPL-3.0-or-later
// Browser USB vendor transport and session client against the actual C transport,
// controller and decoder, through a byte-stream stand-in for EP0. No firmware or device.
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { sha } from '../vendor/elekloader/kit/src/bytes.ts'
import { UploadSession, UploadUnconfirmedError } from '../src/engine/elekloader/upload-session.ts'
import { UsbVendorTransport, VendorTransportError } from '../src/engine/elekloader/upload-usb.ts'

const executable = process.argv[2]
if (!executable) throw new Error('Supply the authored-only C vendor probe executable.')
const base = '31'.repeat(32)
const payload = (n = 8201) => {
  const data = Uint8Array.from({ length: n }, (_, i) => i * 17 + 3)
  return { base, data, sha256: sha(data) }
}

/** ControlDevice over the probe's stdin/stdout; one control transfer at a time, like EP0. */
class ProbeDevice {
  bytes = Buffer.alloc(0)
  waiting
  outs = 0
  constructor(fault = 'none') {
    this.child = spawn(executable, [fault], { stdio: ['pipe', 'pipe', 'inherit'] })
    this.child.stdout.on('data', chunk => { this.bytes = Buffer.concat([this.bytes, chunk]); this.pump() })
    this.child.on('exit', code => { this.exited = code; this.waiting?.reject(new Error('C probe exited: ' + code)) })
  }
  pump() {
    const w = this.waiting
    if (!w || this.bytes.length < w.need(this.bytes)) return
    const n = w.need(this.bytes); this.waiting = undefined
    const reply = this.bytes.subarray(0, n); this.bytes = this.bytes.subarray(n)
    w.resolve(reply)
  }
  transfer(message, need) {
    if (this.waiting) throw new Error('EP0 carries one control transfer at a time.')
    return new Promise((resolve, reject) => {
      this.waiting = { need, resolve, reject }
      this.child.stdin.write(message); this.pump()
    })
  }
  static setup(type, s, length) {
    const b = Buffer.alloc(8)
    assert.equal(s.requestType, 'vendor'); assert.equal(s.recipient, 'interface')
    b[0] = type; b[1] = s.request; b.writeUInt16LE(s.value, 2); b.writeUInt16LE(s.index, 4); b.writeUInt16LE(length, 6)
    return b
  }
  async controlTransferOut(s, data) {
    this.outs++
    const head = Buffer.alloc(2); head.writeUInt16BE(data.length)
    const [code] = await this.transfer(Buffer.concat([Buffer.from('O'), ProbeDevice.setup(0x41, s, data.length), head, data]), () => 1)
    if (code === 2) throw new Error('Synthetic transfer error: no status stage seen.')
    return code === 0 ? { status: 'ok', bytesWritten: data.length } : { status: 'stall', bytesWritten: 0 }
  }
  async controlTransferIn(s, length) {
    const reply = await this.transfer(Buffer.concat([Buffer.from('I'), ProbeDevice.setup(0xc1, s, length)]),
      b => b[0] === 1 ? 1 : b.length < 3 ? 3 : 3 + b.readUInt16BE(1))
    if (reply[0] === 1) return { status: 'stall' }
    const data = Uint8Array.from(reply.subarray(3))
    assert(data.length <= length)
    return { status: 'ok', data: new DataView(data.buffer) }
  }
  async executed() { return (await this.transfer(Buffer.from('X'), () => 4)).readUInt32BE(0) }
  async close() {
    if (this.exited !== undefined) return
    const exited = once(this.child, 'exit'); this.child.stdin.end()
    const timer = setTimeout(() => this.child.kill(), 1000)
    try { await exited } finally { clearTimeout(timer) }
  }
}

/** Counts the session's exchanges so device executions can be compared with them. */
const counted = transport => ({ calls: 0, exchange(frame, signal) { this.calls++; return transport.exchange(frame, signal) } })

let checks = 0
async function scenario(name, run, fault = 'none') {
  const device = new ProbeDevice(fault)
  try { await run(device); checks++; console.log(name + ': passed') } finally { await device.close() }
}

await scenario('read-only identity comes from the interrupt, before any frame', async device => {
  const transport = new UsbVendorTransport(device, 6, { pollMs: 0 })
  assert.deepEqual(await transport.identify(), { canSubmit: true, base, model: 'MODWERK PROBE' })
  assert.equal(device.outs, 0); assert.equal(await device.executed(), 0)
  const s = await UploadSession.connect(transport, (await transport.identify()).base)
  assert.equal(s.status.phase, 'normal')
})

await scenario('a device without a connected data stage only identifies itself', async device => {
  const transport = new UsbVendorTransport(device, 6, { pollMs: 0 })
  assert.equal((await transport.identify()).canSubmit, false)
  await assert.rejects(UploadSession.connect(transport, base), UploadUnconfirmedError)
  assert.equal(await device.executed(), 0)
}, 'no-submit')

await scenario('stage, publish, trial and accept over EP0; one execution per exchange', async device => {
  const transport = counted(new UsbVendorTransport(device, 6, { pollMs: 0 }))
  const s = await UploadSession.connect(transport, base)
  const pkg = payload()
  await s.stage(pkg); await s.activate(); await s.startTrial(); await s.holdTrial(); await s.accept(); await s.leaveUploadMode()
  assert.equal(s.status.phase, 'normal'); assert.equal(s.status.active, pkg.sha256); assert.equal(s.status.generation, 1)
  assert.equal(await device.executed(), transport.calls)
  assert.equal(device.outs, transport.calls)
  // A fresh transport continues the device's sequence instead of colliding with it.
  const again = counted(new UsbVendorTransport(device, 6, { pollMs: 0 }))
  const second = await UploadSession.connect(again, base)
  assert.equal(second.status.generation, 1); assert.equal(await device.executed(), transport.calls + again.calls)
})

await scenario('a lost status stage is reconciled by reading, not resubmitted', async device => {
  const transport = counted(new UsbVendorTransport(device, 6, { pollMs: 0 }))
  const s = await UploadSession.connect(transport, base)
  await s.stage(payload(5000)); await s.cancel()
  assert.equal(await device.executed(), transport.calls); assert.equal(device.outs, transport.calls)
}, 'lost-status')

for (const [label, fault] of [['an unhandled bus reset', 'reset-first'], ['a short data stage', 'short']])
  await scenario(label + ' is refused before execution and retried under a new sequence', async device => {
    const transport = counted(new UsbVendorTransport(device, 6, { pollMs: 0 }))
    const s = await UploadSession.connect(transport, base)
    assert.equal(s.status.phase, 'normal')
    assert.equal(await device.executed(), transport.calls); assert.equal(device.outs, transport.calls + 1)
  }, fault)

await scenario('repeated refusals stop with a positive not-executed error', async device => {
  await assert.rejects(UploadSession.connect(new UsbVendorTransport(device, 6, { pollMs: 0, retries: 3 }), base),
    error => error instanceof UploadUnconfirmedError && error.cause instanceof VendorTransportError && error.cause.notExecuted)
  assert.equal(await device.executed(), 0); assert.equal(device.outs, 4)
}, 'always-short')

await scenario('another client\'s submission stops the connection', async device => {
  await assert.rejects(UploadSession.connect(new UsbVendorTransport(device, 6, { pollMs: 0 }), base),
    error => error instanceof UploadUnconfirmedError && /different submission/.test(error.cause?.message))
}, 'other')

await scenario('a frame that never completes ends at the session deadline as unconfirmed', async device => {
  const s = await UploadSession.connect(new UsbVendorTransport(device, 6, { pollMs: 1 }), base, { timeoutMs: 50 })
  await assert.rejects(s.stage(payload()), UploadUnconfirmedError)
  assert.equal(s.connectionTrusted, false); assert.equal(s.status.phase, 'normal')
}, 'stuck')

console.log(`TypeScript/C EP0 vendor transport: ${checks} scenarios passed; synthetic backend only, no USB stack or hardware.`)
