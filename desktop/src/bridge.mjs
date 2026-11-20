// SPDX-License-Identifier: GPL-3.0-or-later
// The desktop app's agent bridge: the USB bench line protocol (scripts/usb-bench.mjs)
// carried to a unit through WebUSB calls, as scripts/octatrack-usb-bridge.py
// carries it with libusb. Control transfers only: a SETUP is held until its data
// stage performs the whole transfer; the status stage the client sends next is
// answered here. It never sends SET_ADDRESS or SET_CONFIGURATION and never resets
// the bus. One client at a time, on this computer only.
import { lstat, chmod, unlink } from 'node:fs/promises'
import { createConnection, createServer } from 'node:net'

export const TRANSFER_TIMEOUT_MS = 2000
const MAX_LINE = 1 << 16 // a 4 KiB transfer is 8 KiB of hex
const REQUEST_TYPES = ['standard', 'class', 'vendor']
const RECIPIENTS = ['device', 'interface', 'endpoint', 'other']
const message = error => String(error?.message ?? error).replace(/\s+/g, ' ')

export function parseSetup(hex) {
  if (!/^[0-9a-f]{16}$/i.test(hex ?? '')) return null
  const bytes = Buffer.from(hex, 'hex')
  return { requestType: bytes[0], request: bytes[1], value: bytes.readUInt16LE(2), index: bytes.readUInt16LE(4), length: bytes.readUInt16LE(6) }
}

/** A SETUP's bmRequestType in WebUSB's words; null for a reserved type or recipient. */
export function webUsbSetup(setup) {
  const requestType = REQUEST_TYPES[(setup.requestType >> 5) & 3], recipient = RECIPIENTS[setup.requestType & 0x1f]
  return requestType && recipient ? { requestType, recipient, request: setup.request, value: setup.value, index: setup.index } : null
}

function withTimeout(promise, ms) {
  let timer
  return Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('timed out')), ms) })])
    .finally(() => clearTimeout(timer))
}

/** The claimed unit, opened on first use and found again after it went away (a RAM boot or a replug). */
export class UnitHolder {
  constructor(open) { this.open = open; this.unit = null }
  async get() { return this.unit ??= await this.open() }
  async drop() {
    const unit = this.unit
    this.unit = null
    if (unit) await unit.close().catch(() => {}) // closing releases the claimed interface
  }
}

/** One client's conversation: each line in, one reply line out. */
export function session(units, { timeoutMs = TRANSFER_TIMEOUT_MS, active = () => true } = {}) {
  let held = null
  return async function reply(line) {
    const words = line.trim().split(/\s+/)
    if (words[0] === 'setup') {
      const setup = parseSetup(words[1])
      held = null
      if (!setup || !webUsbSetup(setup)) return 'err malformed setup: ' + line
      if (setup.requestType === 0 && (setup.request === 5 || setup.request === 9)) return 'err the bridge never sends SET_ADDRESS or SET_CONFIGURATION'
      held = { setup, done: false }
      return 'ok'
    }
    if ((words[0] === 'in' || words[0] === 'out') && words[1] === '0' && held) {
      const isIn = words[0] === 'in'
      if (held.done || isIn !== Boolean(held.setup.requestType & 0x80)) return isIn ? 'in 0' : 'out 0 0' // status stage
      held.done = true
      const data = isIn ? null : words[2] ?? ''
      if (data !== null && !/^([0-9a-f]{2})*$/i.test(data)) return 'err malformed data: ' + line
      let unit
      try { unit = await units.get() } catch (error) { return 'err could not open the unit: ' + message(error) }
      if (!active()) return 'err the bridge connection closed'
      if (!unit) return 'err the unit is away'
      try {
        const setup = webUsbSetup(held.setup)
        const result = await withTimeout(isIn ? unit.controlTransferIn(setup, held.setup.length) : unit.controlTransferOut(setup, Buffer.from(data, 'hex')), timeoutMs)
        if (result.status === 'stall') return words[0] + ' 0 stall'
        if (result.status !== 'ok') throw new Error(result.status)
        if (!isIn) return 'out 0 ' + result.bytesWritten
        const bytes = result.data ? Buffer.from(result.data.buffer, result.data.byteOffset, result.data.byteLength) : Buffer.alloc(0)
        return bytes.length ? 'in 0 ' + bytes.toString('hex') : 'in 0'
      } catch (error) {
        await units.drop() // never replay a hardware write: the client decides what comes next
        return 'err the unit went away: ' + message(error)
      }
    }
    return 'err unsupported on hardware: ' + line
  }
}

/** A port number listens on 127.0.0.1; anything else is a Unix socket path (scripts/usb-bench.mjs benchEndpoint). */
const endpoint = address => /^\d+$/.test(address) ? { port: Number(address), host: '127.0.0.1' } : { path: address }

/** Is another bridge (the Python one, a second app) already answering at a socket path? */
const answering = path => new Promise(resolve => {
  const probe = createConnection(path, () => { probe.end(); resolve(true) })
  probe.on('error', () => resolve(false))
})

async function clearStaleSocket(path) {
  let stats
  try { stats = await lstat(path) } catch (error) { if (error.code === 'ENOENT') return; throw error }
  if (!stats.isSocket()) throw new Error(path + ' exists and is not a socket')
  if (await answering(path)) throw new Error('Another bridge already answers at ' + path)
  await unlink(path)
}

/** Serve the line protocol at `address` until close(). */
export async function startBridge({ address, units, timeoutMs, log = () => {} }) {
  const where = endpoint(address)
  if (where.path) await clearStaleSocket(where.path)
  let client = null, closing = false, closePromise, queue = Promise.resolve()
  const server = createServer(socket => {
    if (closing) { socket.destroy(); return }
    if (client) { socket.end('err another client is using the bridge\n'); return }
    client = socket
    const active = () => !closing && !socket.destroyed
    const reply = session(units, { timeoutMs, active })
    let buffer = ''
    socket.setEncoding('utf8')
    socket.on('data', chunk => {
      buffer += chunk
      if (buffer.length > MAX_LINE && !buffer.includes('\n')) { socket.destroy(); return }
      for (let i; (i = buffer.indexOf('\n')) >= 0;) {
        const line = buffer.slice(0, i)
        buffer = buffer.slice(i + 1)
        if (!line.trim()) continue
        queue = queue.then(async () => {
          if (!active()) return
          const answer = await reply(line)
          if (active()) socket.write(answer + '\n')
        }).catch(() => socket.destroy())
      }
    })
    socket.on('error', () => {}) // a client hanging up (Windows resets the socket)
    socket.on('close', () => { if (client === socket) client = null })
  })
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(where, () => { server.off('error', reject); resolve() }) })
  if (where.path) await chmod(where.path, 0o600)
  log('agent bridge on ' + address)
  return {
    address,
    port: where.path ? undefined : server.address().port,
    close() {
      closing = true
      return closePromise ??= (async () => {
        client?.destroy()
        await new Promise(resolve => server.close(() => resolve()))
        await queue
        if (where.path) await unlink(where.path).catch(() => {})
        await units.drop()
        log('agent bridge off')
      })()
    },
  }
}
