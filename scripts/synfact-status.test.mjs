import { describe, expect, it, vi } from 'vitest'
import { crc32 } from 'node:zlib'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createFrontendTools } from './frontend-mcp.mjs'
import { readSynfactStatus } from './synfact-status.ts'
import { pack7, unpack7 } from '../src/engine/zoom/zoom-protocol.ts'

const header = [0xf0, 0, 0x20, 0x3c, 0x10, 0], job = 29
function statusObject(version, contract = 0) {
  const body = Buffer.alloc(version === 1 ? 64 : 128)
  const fields = { 0: 0x454c5331, 1: version, 2: 0, 3: 4500, 6: 1, 7: 3, 8: 25 }
  if (contract) Object.assign(fields, { 22: contract, 23: 1, 24: 1, 25: 4321, 26: 1 })
  for (const [word, value] of Object.entries(fields)) body.writeUInt32BE(value, 4 * Number(word))
  const envelope = Buffer.from('ac11d303020008000d3030393400000008ffffffff0000000100000000000c', 'hex')
  envelope.writeUInt32BE(body.length, 25)
  const trailer = Buffer.alloc(12)
  trailer.writeUInt32BE(crc32(body, 0xffffffff)); trailer.writeUInt32BE(body.length, 4); trailer.writeUInt32BE(0xaaa1daaa, 8)
  return Buffer.concat([envelope, body, trailer])
}

// A simulated native Data reader. Validate the sole path and every outbound command, job and chunk index.
function unit(object, { refuse = false, wrongJob = false, wrongPart = false, silent = false } = {}) {
  const input = { name: 'Elektron Syntakt', onmidimessage: null }, commands = []
  let index = 0
  const output = { name: input.name, send(frame) {
    expect(frame.slice(0, 6)).toEqual(header); expect(frame.at(-1)).toBe(0xf7)
    const raw = Buffer.from(unpack7(frame.slice(6, -1))), cmd = raw[4]
    expect(raw.readUInt16BE(2)).toBe(0); commands.push(cmd)
    let reply = Buffer.alloc(10)
    if (cmd === 0x54) {
      expect(raw.subarray(5).toString('hex')).toBe('2f6d6f642d737461747573000000010000')
      reply.writeUInt32BE(job, 6)
    } else if (cmd === 0x55) {
      expect(raw.length).toBe(13); expect(raw.readUInt32BE(5)).toBe(job); expect(raw.readUInt32BE(9)).toBe(index)
      const chunk = object.subarray(53 * index, 53 * ++index)
      reply = Buffer.alloc(27 + chunk.length)
      reply.writeUInt32BE(wrongPart ? index : index - 1, 10)
      reply.writeUInt32BE(wrongJob ? job + 1 : job, 6); reply[18] = Number(53 * index >= object.length)
      reply.writeUInt32BE(chunk.length, 23); chunk.copy(reply, 27)
    } else {
      expect(cmd).toBe(0x56); expect(raw.length).toBe(9); expect(raw.readUInt32BE(5)).toBe(job)
    }
    if (silent) return
    reply.writeUInt16BE(raw.readUInt16BE(0), 2); reply[4] = cmd | 0x80; reply[5] = Number(!refuse)
    const send = data => input.onmidimessage({ data: Uint8Array.from(data) })
    // A complete response to another client, followed by ours in fragments with MIDI clock between them.
    const stale = Buffer.from(reply); stale.writeUInt16BE(0, 2)
    send([...header, ...pack7(stale), 0xf7])
    const message = [...header, ...pack7(reply), 0xf7]
    send(message.slice(0, 9)); send([0xf8]); send(message.slice(9))
  } }
  const access = { inputs: new Map([['in', input]]), outputs: new Map([['out', output]]), close: vi.fn() }
  return { read: () => readSynfactStatus(async () => access, 30), commands, access }
}

describe('Synfact loader status over USB MIDI', () => {
  it('reads and closes the fixed status object, including bank contract and A/B result', async () => {
    const peer = unit(statusObject(2, 0x53594606))
    expect(await peer.read()).toMatchObject({ statusVersion: 2, contract: '0x53594606', machines: 3, loaderStatus: 'loaded',
      active: true, trial: { slot: 1, generation: 4321 }, rolledBack: true })
    expect(peer.commands).toEqual([0x54, 0x55, 0x55, 0x55, 0x55, 0x56])
    expect(peer.access.close).toHaveBeenCalledOnce()
  })
  it('reads the selected Syntakt through the existing MCP device_status tool', async () => {
    const dataDir = await mkdtemp(join(tmpdir(), 'synfact-mcp-'))
    const peer = unit(statusObject(2, 0x53594606))
    let service
    try {
      service = await createFrontendTools({ dataDir, syntaktMidi: true }, undefined, { syntaktAccess: async () => peer.access })
      expect(await service.call('device_status', { machine: 'syntakt' })).toMatchObject({ base: 'Synfact', machines: 3 })
    } finally {
      await service?.close()
      await rm(dataDir, { recursive: true, force: true })
    }
  }, 30000)
  it.each([1, 2])('does not infer rollback or a contract on legacy v%i', async version => {
    expect(await unit(statusObject(version)).read()).toMatchObject({ statusVersion: version, contract: null, trial: null, rolledBack: null })
  })
  it.each([
    ['bad checksum', b => { b[60] ^= 1; return b }, /checksum/],
    ['oversize length', b => { b.writeUInt32BE(0xffffffff, 25); return b }, /length/],
    ['truncated record', b => b.subarray(0, 100), /Truncated/],
    ['trailing data', b => Buffer.concat([b, Buffer.of(0)]), /Oversized/],
    ['wrong object id', b => { b.writeUInt32BE(2, 21); return b }, /object/],
  ])('rejects %s and releases the reader', async (_name, change, message) => {
    const peer = unit(change(statusObject(2)))
    await expect(peer.read()).rejects.toThrow(message)
    expect(peer.commands.at(-1)).toBe(0x56)
    expect(peer.access.close).toHaveBeenCalledOnce()
  })
  it('rejects a chunk from a different job and only closes its own job', async () => {
    const peer = unit(statusObject(1), { wrongJob: true })
    await expect(peer.read()).rejects.toThrow(/chunk/)
    expect(peer.commands).toEqual([0x54, 0x55, 0x56])
  })
  it('rejects a stale chunk from the same job', async () => {
    const peer = unit(statusObject(1), { wrongPart: true })
    await expect(peer.read()).rejects.toThrow(/sequence/)
    expect(peer.commands).toEqual([0x54, 0x55, 0x56])
  })
  it.each([[{ refuse: true }, /declined/], [{ silent: true }, /No Synfact status reply/]])('closes the ports after a refusal or timeout (%j)', async (opts, message) => {
    const peer = unit(statusObject(1), opts)
    await expect(peer.read()).rejects.toThrow(message)
    expect(peer.commands).toEqual([0x54])
    expect(peer.access.close).toHaveBeenCalledOnce()
  })
  it('does not guess between MIDI ports', async () => {
    const peer = unit(statusObject(1))
    peer.access.outputs.set('another', { name: 'Elektron Syntakt 2' })
    await expect(peer.read()).rejects.toThrow(/found 2/)
    expect(peer.commands).toEqual([])
    expect(peer.access.close).toHaveBeenCalledOnce()
  })
})
