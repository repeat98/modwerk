// SPDX-License-Identifier: GPL-3.0-or-later
import { expect, it } from 'vitest'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { createServer } from 'node:net'
import { fileURLToPath } from 'node:url'
import { panelInput, panelKeys } from './device-panel.mjs'

function clock() {
  let time = 0
  return { now: () => time, wait: async ms => { time += ms }, timeoutMs: 20 }
}

it.each([5, 8])('retries only an explicitly refused event, request %i', async request => {
  const calls = [], replies = [0, 0, 1]
  await panelInput(async (...args) => { calls.push(args); return [replies.shift()] }, request, 0x134, clock())
  expect(calls).toEqual(Array(3).fill([request, 0x134, 1]))
})

it('bounds a permanently full queue', async () => {
  let calls = 0
  await expect(panelInput(async () => { calls++; return [0] }, 5, 1, clock())).rejects.toThrow('stayed full')
  expect(calls).toBe(3)
})

it('never retries a transport failure or an invalid acknowledgement', async () => {
  let calls = 0
  await expect(panelInput(async () => { calls++; throw new Error('lost transfer') }, 5, 1, clock())).rejects.toThrow('lost transfer')
  expect(calls).toBe(1)
  await expect(panelInput(async () => [2], 5, 1, clock())).rejects.toThrow('Invalid panel')
})

it('keeps chord order and accepts each press and release exactly once', async () => {
  const calls = [], seen = new Set(), accepted = []
  const send = async (request, value) => {
    calls.push(value)
    if (!seen.has(value)) { seen.add(value); return [0] }
    accepted.push(value); return [1]
  }
  await panelKeys(send, [0x1d, 0x2b], { wait: async () => {}, input: clock() })
  expect(accepted).toEqual([0x11d, 0x12b, 0x2b, 0x1d])
  expect(calls).toHaveLength(8)
})

it('releases the earlier modifier and the uncertain press after a transfer error', async () => {
  const calls = []
  await expect(panelKeys(async (request, value) => {
    calls.push(value)
    if (value === 0x12b) throw new Error('lost transfer')
    return [1]
  }, [0x1d, 0x2b], { wait: async () => {}, input: clock() })).rejects.toThrow('lost transfer')
  expect(calls).toEqual([0x11d, 0x12b, 0x2b, 0x1d])
})

it('tries every release even when one fails, and reports the failure', async () => {
  const calls = []
  await expect(panelKeys(async (request, value) => {
    calls.push(value)
    if (value === 0x2b) throw new Error('release failed')
    return [1]
  }, [0x1d, 0x2b], { wait: async () => {}, input: clock() })).rejects.toThrow('did not finish cleanly')
  expect(calls).toEqual([0x11d, 0x12b, 0x2b, 0x1d])
})

// A separate CLI process exercises enumeration, devIn and every panel caller.
// This is a protocol fixture, not an emulator or hardware qualification.
it('delivers CLI chords, held keys, encoders and the fader through queue refusals', async () => {
  const accepted = [], attempts = new Map(), clients = new Set()
  const configuration = Buffer.from('0902120001010080320904000000ff4d0100', 'hex')
  const identity = Buffer.from('4d575549010100011034009800000000' + '31'.repeat(32) +
    Buffer.from('OCTATRACK').toString('hex').padEnd(32, '0') + '00'.repeat(8), 'hex')
  const server = createServer(client => {
    clients.add(client); client.on('close', () => clients.delete(client))
    let buffer = '', setup
    client.setEncoding('utf8')
    client.on('data', chunk => {
      buffer += chunk
      for (let at; (at = buffer.indexOf('\n')) >= 0;) {
        const line = buffer.slice(0, at); buffer = buffer.slice(at + 1)
        let data
        if (line.startsWith('setup ')) setup = Buffer.from(line.slice(6), 'hex')
        else if (line.startsWith('in ') && setup[0] & 0x80) {
          const request = setup[1], value = setup.readUInt16LE(2), length = setup.readUInt16LE(6)
          if (setup[0] === 0x80) data = value === 0x200 ? configuration.subarray(0, length) : Buffer.alloc(18)
          else if (request === 3) data = identity
          else if (request === 5 || request === 8) {
            const key = request + ':' + value, count = attempts.get(key) ?? 0
            attempts.set(key, count + 1)
            data = Buffer.from([count % 2])
            if (count % 2) accepted.push([request, value])
          }
        }
        client.write('ack 0' + (data ? ' ' + data.toString('hex') : '') + '\n')
      }
    })
  })
  server.listen(0, '127.0.0.1'); await once(server, 'listening')
  try {
    const cases = [
      ['do', 'FUNC+PLAY +T1 -T1 encC+3 fader128'],
      ['key', 'NO'], ['enc', 'LEVEL-2'], ['fader', '255'],
    ]
    for (const args of cases) {
      const child = spawn(process.execPath, [fileURLToPath(new URL('./device.mjs', import.meta.url)),
        ...args, '--emulator', '--socket', String(server.address().port)])
      let stderr = ''; child.stderr.on('data', chunk => { stderr += chunk })
      const [code] = await once(child, 'exit')
      expect(code, stderr).toBe(0)
    }
    expect(accepted).toEqual([[5, 0x12d], [5, 0x128], [5, 0x28], [5, 0x2d],
      [5, 0x110], [5, 0x10], [8, 0x332], [8, 0x8040], [5, 0x132], [5, 0x32],
      [8, 0xfe36], [8, 0xff40]])
    expect([...attempts.values()]).toEqual(Array(12).fill(2))
  } finally {
    for (const client of clients) client.destroy()
    server.close(); await once(server, 'close')
  }
}, 15000)
