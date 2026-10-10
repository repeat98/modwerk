// SPDX-License-Identifier: GPL-3.0-or-later
// Browser TypeScript client against the actual C controller/decoder. No firmware or device.
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { sha } from '../vendor/elekloader/kit/src/bytes.ts'
import { UploadSession, UploadDeviceError, UploadUnconfirmedError } from '../src/engine/elekloader/upload-session.ts'
import { UPLOAD_MAX_BYTES, UPLOAD_MAX_CHUNK, UPLOAD_RESPONSE, UploadCommand } from '../src/engine/elekloader/upload-wire.ts'

const executable = process.argv[2]
if (!executable) throw new Error('Supply the authored-only C wire probe executable.')
const base = '31'.repeat(32), previous = '41'.repeat(32)
const payload = (n = 8201) => {
  const data = Uint8Array.from({ length: n }, (_, i) => i * 17 + 3)
  return { base, data, sha256: sha(data) }
}

class NativeTransport {
  frames = []
  pending
  closed = false
  bytes = Buffer.alloc(0)
  mutate
  constructor(fault = 'none', generation = 0) {
    this.child = spawn(executable, [fault, String(generation)], { stdio: ['pipe', 'pipe', 'pipe'] })
    this.child.stdout.on('data', chunk => {
      this.bytes = Buffer.concat([this.bytes, chunk])
      if (this.bytes.length < UPLOAD_RESPONSE) return
      const pending = this.pending; this.pending = undefined
      if (!pending || this.bytes.length !== UPLOAD_RESPONSE) {
        pending?.reject(new Error('Unexpected native reply framing.')); this.child.kill(); return
      }
      let reply = new Uint8Array(this.bytes); this.bytes = Buffer.alloc(0)
      if (this.mutate) reply = this.mutate(reply, pending.frame)
      pending.cleanup(); pending.resolve(reply)
    })
    const failed = error => { this.closed = true; this.pending?.cleanup(); this.pending?.reject(error); this.pending = undefined }
    this.child.on('error', failed)
    this.child.on('exit', code => failed(new Error('C probe exited: ' + code)))
    this.child.stdin.on('error', failed)
  }
  exchange(frame, signal) {
    if (this.pending || this.closed || signal.aborted) return Promise.reject(new Error('Transport is unavailable.'))
    this.frames.push(frame.slice())
    return new Promise((resolve, reject) => {
      const aborted = () => {
        this.pending = undefined; this.closed = true; this.child.kill(); reject(new Error('Transport aborted.'))
      }
      this.pending = { resolve, reject, frame, cleanup: () => signal.removeEventListener('abort', aborted) }
      signal.addEventListener('abort', aborted, { once: true })
      const header = Buffer.alloc(4); header.writeUInt32BE(frame.length)
      this.child.stdin.write(Buffer.concat([header, frame]))
    })
  }
  get commands() { return this.frames.map(frame => new DataView(frame.buffer, frame.byteOffset).getUint16(6)) }
  async close() {
    if (this.child.exitCode !== null || this.child.signalCode !== null) return
    const exited = once(this.child, 'exit')
    this.child.stdin.end()
    const timer = setTimeout(() => this.child.kill(), 1000)
    try { await exited } finally { clearTimeout(timer) }
  }
}

let checks = 0
async function scenario(name, run, fault = 'none', generation = 0) {
  const transport = new NativeTransport(fault, generation)
  try {
    const session = await UploadSession.connect(transport, base)
    await run(session, transport); checks++; console.log(name + ': passed')
  } finally { await transport.close() }
}

await scenario('stage -> stopped publication -> playback trial -> stopped acceptance', async (s, t) => {
  const pkg = payload(), progress = []
  await s.stage(pkg, { progress: n => progress.push(n) })
  assert.deepEqual(progress, [4096, 8192, pkg.data.length])
  assert.equal(s.status.phase, 'verified'); assert.equal(s.status.active, previous); assert.equal(s.status.generation, 0)
  assert(!t.commands.includes(UploadCommand.commit)); assert(!t.commands.includes(UploadCommand.accept))
  await s.activate(); assert.equal(s.status.active, pkg.sha256); assert.equal(s.status.phase, 'pending')
  await s.startTrial(); assert.equal(s.status.phase, 'trial')
  const before = t.frames.length
  await assert.rejects(s.accept(), /Stop the trial/)
  await assert.rejects(s.stage(pkg), /existing device transaction/)
  assert.equal(t.frames.length, before)
  await s.holdTrial(); await s.accept(); await s.leaveUploadMode()
  assert.equal(s.status.phase, 'normal'); assert.equal(s.status.active, pkg.sha256); assert.equal(s.status.generation, 1)
  await assert.rejects(s.rollback(), /does not own/)
})

await scenario('trial rollback and a second transaction without restarting the C peer', async s => {
  await s.stage(payload()); await s.activate(); await s.startTrial(); await s.rollback(); await s.leaveUploadMode()
  assert.equal(s.status.active, previous); assert.equal(s.status.generation, 2)
  await s.stage(payload(17)); assert.equal(s.status.currentTransaction, 2)
  await s.cancel(); assert.equal(s.status.phase, 'normal'); assert.equal(s.status.active, previous)
})

await scenario('protocol maximum stages in bounded chunks', async (s, t) => {
  const pkg = payload(UPLOAD_MAX_BYTES)
  await s.stage(pkg)
  assert.equal(s.status.received, UPLOAD_MAX_BYTES)
  assert.equal(t.commands.filter(c => c === UploadCommand.chunk).length, UPLOAD_MAX_BYTES / UPLOAD_MAX_CHUNK)
  assert(t.frames.every(frame => frame.length <= 4148))
  await s.cancel()
})

await scenario('local pin, base and size failures never enter upload mode', async (s, t) => {
  const pkg = payload(1)
  for (const bad of [{ ...pkg, base: previous }, { ...pkg, sha256: previous }, payload(0), payload(UPLOAD_MAX_BYTES + 1)])
    await assert.rejects(s.stage(bad), /base, size or private build pin/)
  assert.deepEqual(t.commands, [UploadCommand.hello])
})

await scenario('copy protects the package from caller changes during transfer', async (s, t) => {
  const pkg = payload()
  t.mutate = (reply, frame) => { if (frame[7] === UploadCommand.enter) pkg.data.fill(0); return reply }
  await s.stage(pkg); assert.equal(s.status.phase, 'verified')
  await s.activate(); assert.equal(s.status.active, pkg.sha256)
  await s.rollback(); await s.leaveUploadMode()
})

await scenario('cancellation after an acknowledged chunk cleans up the old set', async (s, t) => {
  const abort = new AbortController()
  await assert.rejects(s.stage(payload(), { signal: abort.signal, progress: () => abort.abort() }), { name: 'AbortError' })
  assert.equal(t.commands.filter(c => c === UploadCommand.chunk).length, 1)
  assert.equal(s.status.active, previous); assert.equal(s.status.phase, 'normal')
  assert(!t.commands.includes(UploadCommand.commit))
})

for (const fault of ['enter', 'unsafe', 'prepare']) await scenario(fault + ' refusal preserves and resumes the old set', async s => {
  await assert.rejects(s.stage(payload()), UploadDeviceError)
  assert.equal(s.status.phase, 'normal'); assert.equal(s.status.active, previous); assert.equal(s.status.generation, 0)
}, fault)

await scenario('failed pre-publication cleanup stays held for recovery', async s => {
  await assert.rejects(s.stage(payload()), UploadDeviceError)
  assert.equal(s.status.phase, 'recovery'); assert.equal(s.status.active, previous)
  await assert.rejects(s.leaveUploadMode(), /Resolve staging/)
}, 'discard')

await scenario('uncertain publication requires confirmed rollback', async s => {
  await s.stage(payload()); await assert.rejects(s.activate(), UploadDeviceError)
  assert.equal(s.status.phase, 'recovery'); assert.equal(s.status.active, null)
  await assert.rejects(s.leaveUploadMode(), /Resolve staging/)
  await s.rollback(); await s.leaveUploadMode()
  assert.equal(s.status.phase, 'normal'); assert.equal(s.status.active, previous); assert.equal(s.status.generation, 1)
}, 'publish')

await scenario('positive unchanged publication can discard and resume', async s => {
  await s.stage(payload()); await assert.rejects(s.activate(), UploadDeviceError)
  assert.equal(s.status.phase, 'ready'); assert.equal(s.status.active, previous)
  await s.cancel(); assert.equal(s.status.phase, 'normal')
}, 'unchanged')

await scenario('retirement refusal retains rollback', async s => {
  await s.stage(payload()); await s.activate(); await assert.rejects(s.accept(), UploadDeviceError)
  assert.equal(s.status.phase, 'pending')
  await s.rollback(); await s.leaveUploadMode(); assert.equal(s.status.active, previous)
}, 'retire')

await scenario('failed restore cannot claim the old set until a later positive acknowledgement', async s => {
  await s.stage(payload()); await s.activate(); await assert.rejects(s.rollback(), UploadDeviceError)
  assert.equal(s.status.phase, 'recovery'); assert.equal(s.status.active, null)
  await assert.rejects(s.leaveUploadMode(), /Resolve staging/)
  await s.rollback(); assert.equal(s.status.active, previous); assert.equal(s.status.generation, 2)
}, 'restore')

await scenario('failed leave cannot claim playback resumed', async s => {
  await s.stage(payload()); await s.activate(); await assert.rejects(s.startTrial(), UploadDeviceError)
  assert.equal(s.status.phase, 'pending')
  await s.rollback(); await assert.rejects(s.leaveUploadMode(), UploadDeviceError)
  assert.equal(s.status.phase, 'ready'); assert.equal(s.status.active, previous)
}, 'leave')

await scenario('generation exhaustion is refused before entering upload mode', async (s, t) => {
  await assert.rejects(s.stage(payload()), /counter is exhausted/)
  assert.deepEqual(t.commands, [UploadCommand.hello])
}, 'none', 0xfffffffe)

for (const [label, mutate] of [
  ['wrong transaction', reply => { new DataView(reply.buffer).setUint32(8, 77); return reply }],
  ['stale session', reply => { reply[80] ^= 1; return reply }],
  ['short acknowledgement', reply => reply.subarray(0, 143)],
  ['unexpected active identity', reply => { reply[112] ^= 1; return reply }],
  ['unexpected generation', reply => { new DataView(reply.buffer).setUint32(28, 4); return reply }],
]) await scenario(label + ' stops the connection without reporting unconfirmed state', async (s, t) => {
  t.mutate = (reply, frame) => frame[7] === UploadCommand.chunk ? mutate(reply) : reply
  await assert.rejects(s.stage(payload()), UploadUnconfirmedError)
  assert.equal(s.connectionTrusted, false); assert.equal(s.status.active, previous)
  assert.equal(s.status.received, 0); assert.equal(s.status.phase, 'receiving')
  const count = t.frames.length
  await assert.rejects(s.cancel(), UploadUnconfirmedError); assert.equal(t.frames.length, count)
})

await scenario('lost publication acknowledgement is not retried or reported as success', async (s, t) => {
  await s.stage(payload())
  t.mutate = (reply, frame) => frame[7] === UploadCommand.commit ? reply.subarray(0, 143) : reply
  await assert.rejects(s.activate(), UploadUnconfirmedError)
  assert.equal(s.status.phase, 'verified'); assert.equal(s.status.active, previous)
  const count = t.frames.length
  await assert.rejects(s.activate(), UploadUnconfirmedError); assert.equal(t.frames.length, count)
})

// No transport reply: check deadline and exclusion without a fake device FSM.
{
  const t = new NativeTransport()
  try {
    const hello = await t.exchange(new Uint8Array([0x4d,0x57,0x55,0x50,0,1,0,0,0,0,0,0,0,0,0,0,...new Uint8Array(32)]), new AbortController().signal)
    let calls = 0, aborted = false
    const s = await UploadSession.connect({ exchange: async (_, signal) => {
      if (!calls++) return hello
      return new Promise(() => signal.addEventListener('abort', () => { aborted = true }, { once: true }))
    } }, base, { timeoutMs: 25 })
    const staged = s.stage(payload())
    await assert.rejects(s.leaveUploadMode(), /in progress/)
    await assert.rejects(staged, UploadUnconfirmedError)
    assert.equal(aborted, true); assert.equal(s.connectionTrusted, false)
    await assert.rejects(s.stage(payload()), UploadUnconfirmedError); assert.equal(calls, 2)
    checks++; console.log('bounded deadline and single-operation exclusion: passed')
  } finally { await t.close() }
}
console.log(`TypeScript/C upload interoperability: ${checks} scenarios passed; synthetic backend only, no hardware qualification.`)
