// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from 'vitest'
import { once } from 'node:events'
import { createConnection } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Bench, device, shareBench } from './usb-bench.mjs'

const deferred = () => {
  let resolve
  const promise = new Promise(done => { resolve = done })
  return { promise, resolve }
}

// Exercise the real Bench transfer methods against the bridge's single pending
// SETUP model. Delaying its reply deterministically exposes stage interleaving.
function endpoint({ request, stall, fail } = {}) {
  const bench = Object.create(Bench.prototype)
  const entered = deferred(), release = deferred(), lines = []
  let held
  bench.command = async line => {
    lines.push(line)
    if (line.startsWith('setup ')) {
      const bytes = Buffer.from(line.slice(6), 'hex')
      held = { type: bytes[0], request: bytes[1], length: bytes.readUInt16LE(6) }
      if (held.request === request) { entered.resolve(); await release.promise }
      return ['ack', '0']
    }
    if (line === fail) throw new Error('injected transfer failure')
    if (line === stall) return ['ack', '0', 'stall']
    if (line.startsWith('in ') && held.type & 0x80) return ['ack', '0', Buffer.alloc(held.length, held.request).toString('hex')]
    return ['ack', '0']
  }
  return { bench, lines, entered: entered.promise, release: release.resolve }
}

const setup = request => ({ request, value: 0, index: 0 })
const setupLine = (type, request, length) => {
  const bytes = Buffer.alloc(8); bytes[0] = type; bytes[1] = request; bytes.writeUInt16LE(length, 6)
  return 'setup ' + bytes.toString('hex')
}

describe('bench EP0 transaction ownership', () => {
  it('keeps SELFTEST96 and concurrent keepalive IDENTIFY72 intact across two adapters', async () => {
    const { bench, lines, entered, release } = endpoint({ request: 21 })
    const selftest = device(bench).controlTransferIn(setup(21), 96)
    await entered
    const identify = device(bench).controlTransferIn(setup(3), 72)
    await Promise.resolve()
    expect(lines).toEqual([setupLine(0xc1, 21, 96)])
    release()
    const [test, identity] = await Promise.all([selftest, identify])
    expect(test.data.byteLength).toBe(96)
    expect(identity.data.byteLength).toBe(72)
    expect(test.data.getUint8(0)).toBe(21)
    expect(identity.data.getUint8(0)).toBe(3)
    expect(lines).toEqual([setupLine(0xc1, 21, 96), 'in 0 96', 'out 0', setupLine(0xc1, 3, 72), 'in 0 72', 'out 0'])
  })

  it.each(['in', 'out'])('serializes an overlapping IN and OUT when %s starts first', async first => {
    const { bench, lines, entered, release } = endpoint({ request: first === 'in' ? 21 : 22 })
    const read = () => device(bench).controlTransferIn(setup(21), 96)
    const write = () => device(bench).controlTransferOut(setup(22), new Uint8Array([1, 2, 3]))
    const started = first === 'in' ? read() : write()
    await entered
    const queued = first === 'in' ? write() : read()
    await Promise.resolve()
    expect(lines).toHaveLength(1)
    release()
    const results = await Promise.all([started, queued])
    expect(results.every(result => result.status === 'ok')).toBe(true)
    expect(results.find(result => result.data)?.data.byteLength).toBe(96)
    expect(results.find(result => result.bytesWritten)?.bytesWritten).toBe(3)
    const input = [setupLine(0xc1, 21, 96), 'in 0 96', 'out 0']
    const output = [setupLine(0x41, 22, 3), 'out 0 010203', 'in 0 64']
    expect(lines).toEqual(first === 'in' ? [...input, ...output] : [...output, ...input])
  })

  it('releases a stalled IN without sending its status stage or replaying it', async () => {
    const { bench, lines } = endpoint({ stall: 'in 0 96' })
    const stalled = device(bench).controlTransferIn(setup(21), 96)
    const next = device(bench).controlTransferIn(setup(3), 72)
    expect(await stalled).toEqual({ status: 'stall' })
    expect((await next).data.byteLength).toBe(72)
    expect(lines).toEqual([setupLine(0xc1, 21, 96), 'in 0 96', setupLine(0xc1, 3, 72), 'in 0 72', 'out 0'])
  })

  it('reports a failed transfer once and allows the next explicit transfer', async () => {
    const { bench, lines } = endpoint({ fail: 'in 0 96' })
    const failed = device(bench).controlTransferIn(setup(21), 96)
    const next = device(bench).controlTransferOut(setup(22), new Uint8Array([4]))
    await expect(failed).rejects.toThrow('injected transfer failure')
    expect(await next).toEqual({ status: 'ok', bytesWritten: 1 })
    expect(lines).toEqual([setupLine(0xc1, 21, 96), 'in 0 96', setupLine(0x41, 22, 1), 'out 0 04', 'in 0 64'])
  })

  it('propagates an OUT status stall and releases the queue without replay', async () => {
    const { bench, lines } = endpoint({ stall: 'in 0 64' })
    const stalled = device(bench).controlTransferOut(setup(22), new Uint8Array([4]))
    const next = device(bench).controlTransferIn(setup(3), 72)
    expect(await stalled).toEqual({ status: 'stall', bytesWritten: 0 })
    expect((await next).data.byteLength).toBe(72)
    expect(lines).toEqual([setupLine(0x41, 22, 1), 'out 0 04', 'in 0 64', setupLine(0xc1, 3, 72), 'in 0 72', 'out 0'])
  })
})

describe('a shared bench (test plan T1: the frontend MCP beside the development session)', () => {
  async function shared(options) {
    const owner = endpoint(options), path = join(tmpdir(), `modwerk-bench-share-${process.pid}-${Math.random().toString(16).slice(2)}.sock`)
    const server = shareBench(owner.bench, path)
    await once(server, 'listening')
    const client = new Bench(path, { timeoutMs: 2000 })
    await client.ready()
    return { ...owner, path, server, client, close: () => { client.socket.destroy(); server.close() } }
  }
  it('runs the second client\'s control transfer after the owner\'s, never inside it', async () => {
    const { bench, lines, entered, release, client, close } = await shared({ request: 21 })
    try {
      const mine = device(bench).controlTransferIn(setup(21), 96)
      await entered
      const theirs = device(client).controlTransferIn(setup(3), 72)
      await new Promise(resolve => setTimeout(resolve, 50))
      expect(lines).toEqual([setupLine(0xc1, 21, 96)])
      release()
      const [a, b] = await Promise.all([mine, theirs])
      expect([a.data.getUint8(0), b.data.byteLength, b.data.getUint8(0)]).toEqual([21, 72, 3])
      expect(await device(client).controlTransferOut(setup(22), new Uint8Array([1, 2]))).toEqual({ status: 'ok', bytesWritten: 2 })
      expect(lines).toEqual([setupLine(0xc1, 21, 96), 'in 0 96', 'out 0', setupLine(0xc1, 3, 72), 'in 0 72', 'out 0',
        setupLine(0x41, 22, 2), 'out 0 0102', 'in 0 64'])
    } finally { close() }
  })
  it('ends a transfer at a stall, keeps reset to the owner, and frees the bench when the client leaves mid-transfer', async () => {
    const { bench, lines, client, path, close } = await shared({ stall: 'out 0 0102' })
    try {
      expect(await device(client).controlTransferOut(setup(22), new Uint8Array([1, 2]))).toEqual({ status: 'stall', bytesWritten: 0 })
      await expect(client.command('reset')).rejects.toThrow(/err reset outside a control transfer/)
      const raw = createConnection(path)
      await once(raw, 'connect')
      raw.write(setupLine(0xc1, 7, 8) + '\n')
      await new Promise(resolve => setTimeout(resolve, 50))
      raw.destroy()
      expect((await device(bench).controlTransferIn(setup(3), 72)).data.byteLength).toBe(72)
      expect(lines.slice(-4)).toEqual([setupLine(0xc1, 7, 8), setupLine(0xc1, 3, 72), 'in 0 72', 'out 0'])
    } finally { close() }
  })
})
