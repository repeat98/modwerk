// SPDX-License-Identifier: GPL-3.0-or-later
// Read Synfact's fixed /mod-status Data object. Protocol and credit in sdk/machines/syntakt/README.md.
import { crc32 } from 'node:zlib'
import { randomInt } from 'node:crypto'
import { encode8in7 } from '../src/engine/elektron/codec/transport.ts'
import { unpack7 } from '../src/engine/elektron/dn2-link.ts'
import type { MidiIn, MidiOut, MidiPort } from '../src/engine/zoom/zoom-link.ts'
import { nodeMidiAccess } from './zoom-device.ts'

const HEADER = [0xf0, 0x00, 0x20, 0x3c, 0x10, 0x00] // Elektron Data service, distinct from the OS upgrade header.
const OPEN = 0x54, READ = 0x55, CLOSE = 0x56
const OBJECT_HEADER = 31, FOOTER = 12, MAX_OBJECT = OBJECT_HEADER + 128 + FOOTER
const BLOCK = 256

function words(...values: number[]) {
  const data = Buffer.alloc(4 * values.length)
  values.forEach((value, i) => data.writeUInt32BE(value, 4 * i))
  return data
}

function singlePort<T extends MidiPort>(ports: Iterable<T>, direction: string): T {
  const matches = [...ports].filter(p => p.state !== 'disconnected' && /syntakt/i.test(p.name ?? ''))
  if (matches.length !== 1) throw new Error(`Expected one Syntakt MIDI ${direction}, found ${matches.length}. Connect one Syntakt by USB and enable USB MIDI.`)
  return matches[0]
}

function request(input: MidiIn, output: MidiOut, seq: number, command: number, payload: Buffer, timeoutMs: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    let frame: number[] | undefined
    const timer = setTimeout(() => reject(new Error('No Synfact status reply. Check USB MIDI and that the Syntakt runs a core with /mod-status.')), timeoutMs)
    try {
      input.onmidimessage = ({ data }) => {
        for (const byte of data) {
          if (byte >= 0xf8) continue // MIDI clock and transport may arrive inside a fragmented SysEx message.
          if (byte === 0xf0) { frame = [byte]; continue }
          if (!frame) continue
          if (byte !== 0xf7) {
            if (byte >= 0x80 || frame.length >= 512) frame = undefined
            else frame.push(byte)
            continue
          }
          const message = frame
          frame = undefined
          if (!HEADER.every((value, i) => message[i] === value)) continue
          const packed = Uint8Array.from(message.slice(HEADER.length))
          if (packed.length % 8 === 1) continue
          const reply = Buffer.from(unpack7(packed))
          if (reply.length < 6 || reply.readUInt16BE(2) !== seq || reply[4] !== (command | 0x80)) continue
          clearTimeout(timer)
          if (reply[5] === 0) reject(new Error(`Syntakt declined the /mod-status read (command 0x${command.toString(16)}).`))
          else resolve(reply)
          return
        }
      }
      const body = Buffer.alloc(5)
      body.writeUInt16BE(seq)
      body[4] = command
      output.send([...HEADER, ...encode8in7(Buffer.concat([body, payload])), 0xf7])
    } catch (error) {
      clearTimeout(timer)
      reject(error)
    }
  })
}

function parseStatus(object: Buffer) {
  const size = object.length - OBJECT_HEADER - FOOTER
  if ((size !== 64 && size !== 128) || object.readUInt32BE(0) !== 0xac11d303 || object[4] !== 2 ||
      object.readUInt16BE(5) !== 8 || object.readUInt16BE(7) !== 13 || object.readUInt32BE(13) !== 8 ||
      object.readUInt32BE(21) !== 1 || object.readUInt32BE(25) !== size || object.readUInt16BE(29) !== 12)
    throw new Error('Invalid Synfact status object.')
  const body = object.subarray(OBJECT_HEADER, OBJECT_HEADER + size), footer = OBJECT_HEADER + size
  if (object.readUInt32BE(footer) !== crc32(body, 0xffffffff) || object.readUInt32BE(footer + 4) !== size ||
      object.readUInt32BE(footer + 8) !== 0xaaa1daaa) throw new Error('Invalid Synfact status checksum or footer.')
  const word = (index: number) => body.readUInt32BE(index * 4)
  const version = word(1)
  if (word(0) !== 0x454c5331 || version !== (size === 64 ? 1 : 2)) throw new Error('Unknown Synfact status format.')
  const states = ['loaded', 'no committed bank', 'bank rejected', 'bank read failed', 'insufficient MAIN memory',
    'machine initialization failed', 'missing AUDIO ABI', 'missing sample pool service', 'storage metadata read failed',
    'startup hook pending', 'incompatible bank contract', 'resident hook mismatch']
  // The first v2 cores left the contract and A/B fields reserved and zero.
  const hasContract = version === 2 && word(22) !== 0
  return {
    machine: 'syntakt', base: 'Synfact', statusVersion: version,
    loaderState: word(2), loaderStatus: states[word(2)] ?? 'unknown', bankBytes: word(3),
    active: Boolean(word(6)), machines: word(7), audioPages: word(8),
    contract: hasContract ? '0x' + word(22).toString(16).padStart(8, '0') : null,
    trial: hasContract && word(23) ? { slot: word(24), generation: word(25) } : null,
    rolledBack: hasContract ? Boolean(word(26)) : null,
  }
}

export async function readSynfactStatus(openMidi = nodeMidiAccess, timeoutMs = 3000) {
  const access = await openMidi()
  try {
    const input = singlePort([...access.inputs].map(([, port]) => port), 'input')
    const output = singlePort([...access.outputs].map(([, port]) => port), 'output')
    let seq = randomInt(1, 0x4000)
    const call = (command: number, payload: Buffer) => {
      seq = seq % 0x3fff + 1
      return request(input, output, seq, command, payload, timeoutMs)
    }
    const opened = await call(OPEN, Buffer.concat([Buffer.from('/mod-status\0'), words(BLOCK), Buffer.of(0)]))
    if (opened.length < 10) throw new Error('Truncated Syntakt Data open reply.')
    const job = opened.readUInt32BE(6)
    const object = Buffer.alloc(MAX_OBJECT)
    let used = 0, expected = 0
    let status: ReturnType<typeof parseStatus> | undefined
    try {
      // Allow short chunks and transient empty replies, but bound the whole transaction.
      const deadline = Date.now() + 4 * timeoutMs
      for (let part = 0; part < MAX_OBJECT + 64 && Date.now() < deadline; part++) {
        const reply = await call(READ, words(job, part))
        if (reply.length < 27 || reply.readUInt32BE(6) !== job || reply.readUInt32BE(23) !== reply.length - 27)
          throw new Error('Invalid Syntakt Data chunk.')
        // Empty polls may have no initialized sequence; a payload must be for the requested part.
        if (reply.length > 27 && reply.readUInt32BE(10) !== part) throw new Error('Unexpected Syntakt Data chunk sequence.')
        if (used + reply.length - 27 > MAX_OBJECT) throw new Error('Oversized Synfact status record.')
        used += reply.copy(object, used, 27)
        if (used >= OBJECT_HEADER && !expected) {
          const size = object.readUInt32BE(25)
          if (size !== 64 && size !== 128) throw new Error('Unsupported Synfact status length.')
          expected = OBJECT_HEADER + size + FOOTER
        }
        if (expected && used >= expected) {
          status = parseStatus(object.subarray(0, used))
          break
        }
        if (reply.length > 27 && reply[18]) throw new Error('Truncated Synfact status record.')
      }
      if (!status) throw new Error('Syntakt did not finish the status read.')
    } catch (error) {
      // Closing a partial read can itself fail. Keep the original diagnosis in that case.
      await call(CLOSE, words(job)).catch(() => {})
      throw error
    }
    await call(CLOSE, words(job))
    return status
  } finally {
    access.close()
  }
}
