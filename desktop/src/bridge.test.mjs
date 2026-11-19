// SPDX-License-Identifier: GPL-3.0-or-later
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { createConnection } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { Bench } from '../../scripts/usb-bench.mjs'
import { UnitHolder, parseSetup, session, startBridge, webUsbSetup } from './bridge.mjs'

/** A WebUSB device that answers vendor IN with `reply` and records every transfer. */
function fakeUnit({ reply = Buffer.from('hello'), stall = false, hang = false } = {}) {
  const unit = {
    transfers: [], closed: 0,
    async controlTransferIn(setup, length) {
      unit.transfers.push({ in: setup, length })
      if (hang) return new Promise(() => {})
      if (stall) return { status: 'stall' }
      const bytes = reply.subarray(0, length)
      return { status: 'ok', data: new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength) }
    },
    async controlTransferOut(setup, data) {
      unit.transfers.push({ out: setup, data: Buffer.from(data).toString('hex') })
      return stall ? { status: 'stall', bytesWritten: 0 } : { status: 'ok', bytesWritten: data.length }
    },
    async close() { unit.closed++ },
  }
  return unit
}

const open = []
afterEach(async () => { for (const close of open.splice(0)) await close() })

describe('the agent bridge line protocol', () => {
  it('reads a SETUP in WebUSB terms', () => {
    const setup = parseSetup('c1200100020040' + '00')
    expect(setup).toEqual({ requestType: 0xc1, request: 0x20, value: 1, index: 2, length: 64 })
    expect(webUsbSetup(setup)).toEqual({ requestType: 'vendor', recipient: 'interface', request: 0x20, value: 1, index: 2 })
    expect(parseSetup('c120')).toBeNull()
  })

  it('performs an IN transfer at its data stage and answers the status stage itself', async () => {
    const unit = fakeUnit(), reply = session(new UnitHolder(async () => unit))
    expect(await reply('setup c120010002000400')).toBe('ok')
    expect(await reply('in 0 64')).toBe('in 0 ' + Buffer.from('hell').toString('hex'))
    expect(await reply('out 0')).toBe('out 0 0')
    expect(unit.transfers).toEqual([{ in: { requestType: 'vendor', recipient: 'interface', request: 0x20, value: 1, index: 2 }, length: 4 }])
  })

  it('performs an OUT transfer once and reports a stall', async () => {
    const unit = fakeUnit(), reply = session(new UnitHolder(async () => unit))
    await reply('setup 4121000000000300')
    expect(await reply('out 0 0a0b0c')).toBe('out 0 3')
    expect(await reply('in 0 64')).toBe('in 0')
    expect(await reply('out 0 0a0b0c')).toBe('out 0 0') // a repeated stage is never sent to the unit again
    expect(unit.transfers).toHaveLength(1)
    const stalled = session(new UnitHolder(async () => fakeUnit({ stall: true })))
    await stalled('setup c120000000004000')
    expect(await stalled('in 0 64')).toBe('in 0 stall')
  })

  it('refuses SET_ADDRESS, SET_CONFIGURATION, stray stages and malformed lines', async () => {
    const unit = fakeUnit(), reply = session(new UnitHolder(async () => unit))
    expect(await reply('setup 0005010000000000')).toMatch(/^err .*SET_ADDRESS/)
    expect(await reply('in 0 64')).toMatch(/^err unsupported/)
    expect(await reply('setup 0009010000000000')).toMatch(/^err/)
    expect(await reply('setup zz')).toMatch(/^err malformed/)
    expect(await reply('reset')).toMatch(/^err unsupported/)
    await reply('setup 4121000000000100')
    expect(await reply('out 0 xyz')).toMatch(/^err malformed/)
    expect(unit.transfers).toHaveLength(0)
  })

  it('says when no unit is there, and drops a unit that stops answering', async () => {
    const away = session(new UnitHolder(async () => null))
    await away('setup c120000000004000')
    expect(await away('in 0 64')).toBe('err the unit is away')

    const unit = fakeUnit({ hang: true }), units = new UnitHolder(async () => unit)
    const reply = session(units, { timeoutMs: 20 })
    await reply('setup c120000000004000')
    expect(await reply('in 0 64')).toBe('err the unit went away: timed out')
    expect(unit.closed).toBe(1)
    expect(units.unit).toBeNull()
  })

  it('drains a late USB open on shutdown and skips its queued transfers', async () => {
    const unit = fakeUnit(), started = Promise.withResolvers(), opening = Promise.withResolvers()
    const units = new UnitHolder(() => { started.resolve(); return opening.promise })
    const bridge = await startBridge({ address: '0', units })
    const socket = createConnection(bridge.port, '127.0.0.1')
    socket.write('setup c120010002000400\nin 0 64\nsetup c120010002000400\nin 0 64\n')
    await started.promise
    const closing = bridge.close()
    opening.resolve(unit)
    await closing
    expect(unit.transfers).toEqual([])
    expect(unit.closed).toBe(1)
    expect(units.unit).toBeNull()
  })

  it('serves the repository bench client on a TCP port of this computer', async () => {
    const unit = fakeUnit()
    const bridge = await startBridge({ address: '0', units: new UnitHolder(async () => unit), timeoutMs: 100 })
    open.push(() => bridge.close())
    const bench = new Bench(String(bridge.port), { timeoutMs: 2000 })
    await bench.ready()
    open.unshift(async () => bench.socket.destroy())
    expect((await bench.controlIn(0xc1, 0x20, 0, 0, 2)).toString()).toBe('he')
    await bridge.close()
    open.length = 0
    expect(unit.closed).toBe(1) // turning the bridge off releases the unit for the site
  })
})

describe('the bridge socket', () => {
  let folder
  afterEach(async () => { if (folder) await rm(folder, { recursive: true, force: true }) })

  it('carries Bench transfers over a Unix socket and turns away a second client', async () => {
    folder = await mkdtemp(join(tmpdir(), 'modwerk-bridge-'))
    const path = join(folder, 'ot.sock'), unit = fakeUnit()
    const bridge = await startBridge({ address: path, units: new UnitHolder(async () => unit) })
    open.push(() => bridge.close())
    const bench = new Bench(path, { timeoutMs: 2000 })
    await bench.ready()
    open.unshift(async () => bench.socket.destroy())
    expect((await bench.controlIn(0xc1, 0x20, 0, 0, 5)).toString()).toBe('hello')
    expect(await bench.controlOut(0x41, 0x21, 0, 0, Buffer.from([1, 2]))).toBe(true)

    const turnedAway = await new Promise((resolve, reject) => {
      let text = ''
      createConnection(path).setEncoding('utf8').on('data', chunk => { text += chunk }).on('close', () => resolve(text)).on('error', reject)
    })
    expect(turnedAway).toBe('err another client is using the bridge\n')
    expect((await bench.controlIn(0xc1, 0x20, 0, 0, 1)).toString()).toBe('h') // the first client keeps the unit
  })

  it('refuses a path that is not a socket', async () => {
    folder = await mkdtemp(join(tmpdir(), 'modwerk-bridge-'))
    const path = join(folder, 'notes.txt')
    await writeFile(path, 'keep me')
    await expect(startBridge({ address: path, units: new UnitHolder(async () => null) })).rejects.toThrow('not a socket')
  })
})
