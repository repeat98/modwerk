import { expect, it } from 'vitest'
import { sha } from '../../../vendor/elekloader/kit/src/bytes.ts'
import { UploadDeviceError, UploadSession, UploadUnconfirmedError } from './upload-session'
import { UploadCommand, UploadPhase, UploadResult, type UploadPhaseName, type UploadResultName } from './upload-wire'

const base = '31'.repeat(32), session = '52'.repeat(32), old = '41'.repeat(32)
const names = Object.fromEntries(Object.entries(UploadCommand).map(([name, code]) => [code, name]))

/** The controller (sdk/runtime/upload/upload.c) as far as these tests reach it, with a publication the backend refuses
 * `refusals` times: as upload.c's commit does on MU_UNCHANGED, the staged package is discarded (phase ready). */
function controller(refusals: number, progress = 0) {
  const state = { phase: 'normal' as UploadPhaseName, generation: 0, last: 0, current: 0, received: 0, length: 0, active: old, digest: old, commits: 0 }
  const reply = (command: number, transaction: number, result: UploadResultName = 'ok') => {
    const out = new Uint8Array(144), view = new DataView(out.buffer)
    view.setUint32(0, 0x4d575552); view.setUint16(4, 1); view.setUint16(6, command); view.setUint32(8, transaction); view.setUint32(12, 128)
    ;[UploadResult.indexOf(result), UploadPhase.indexOf(state.phase), state.phase === 'publishing' ? 0 : 1, state.generation, state.last, state.current, state.received, 8192]
      .forEach((value, i) => view.setUint32(16 + 4 * i, value))
    out.set(Buffer.from(base, 'hex'), 48); out.set(Buffer.from(session, 'hex'), 80)
    if (state.phase !== 'publishing') out.set(Buffer.from(state.active, 'hex'), 112)
    return out
  }
  const exchange = async (frame: Uint8Array) => {
    const view = new DataView(frame.buffer, frame.byteOffset), command = view.getUint16(6), transaction = view.getUint32(8)
    switch (names[command]) {
      case 'enter': state.phase = state.phase === 'trial' ? 'pending' : 'ready'; break // a trial is held, stopped
      case 'leave': state.phase = state.phase === 'pending' ? 'trial' : 'normal'; break
      case 'rollback':
        if (!['pending', 'publishing'].includes(state.phase) || transaction !== state.current) return reply(command, transaction, 'state')
        state.phase = 'ready'; state.active = old; state.generation++; break
      case 'begin':
        if (state.phase !== 'ready' || transaction !== state.last + 1) return reply(command, transaction, 'state')
        state.last = state.current = transaction; state.phase = 'receiving'; state.received = 0
        state.length = view.getUint32(48 + 68); state.digest = Buffer.from(frame.subarray(80, 112)).toString('hex'); break
      case 'chunk': state.received += frame.length - 52; break
      case 'verify': state.phase = 'verified'; break
      case 'commit':
        if (!['verified', 'publishing'].includes(state.phase)) return reply(command, transaction, 'state')
        if (progress-- > 0) { state.phase = 'publishing'; return reply(command, transaction, 'progress') }
        if (state.commits++ < refusals) { state.phase = 'ready'; state.received = 0; return reply(command, transaction, 'backend') }
        state.phase = 'pending'; state.active = state.digest; state.generation++; break
      case 'abort': state.phase = 'ready'; state.received = 0; break
    }
    return reply(command, transaction)
  }
  return { state, transport: { exchange } }
}

it('stages a package again after the base dropped it at a refused publication', async () => {
  const unit = controller(1), data = new Uint8Array(100).fill(7), pkg = { base, data, sha256: sha(data) }
  const client = await UploadSession.connect(unit.transport, base)
  await client.stage(pkg)
  const refused = await client.activate().catch(error => error)
  expect(refused).toBeInstanceOf(UploadDeviceError)
  expect(refused.status).toMatchObject({ result: 'backend', phase: 'ready', active: old })
  await client.stage(pkg) // the base holds no package now: this session no longer owns one either
  expect(await client.activate()).toMatchObject({ result: 'ok', phase: 'pending', active: pkg.sha256 })
  expect(unit.state).toMatchObject({ last: 2, generation: 1 })
})

it('rolls back a trial whose page closed, from a new session', async () => {
  const unit = controller(0), data = new Uint8Array(100).fill(9), pkg = { base, data, sha256: sha(data) }
  const gone = await UploadSession.connect(unit.transport, base)
  await gone.stage(pkg); await gone.activate(); await gone.startTrial() // then the page closed
  const next = await UploadSession.connect(unit.transport, base)
  expect(next.status).toMatchObject({ phase: 'trial', active: pkg.sha256 })
  await expect(next.rollback()).rejects.toThrow('does not own')
  expect(next.adopt()).toBe(true)
  expect(await next.rollback()).toMatchObject({ result: 'ok', phase: 'ready', active: old, generation: 2 })
  expect(await next.leaveUploadMode()).toMatchObject({ phase: 'normal', active: old })
})

it('advances one publication transaction without reporting a prefix as the complete set', async () => {
  const unit = controller(0, 3), data = new Uint8Array(200).fill(9)
  const client = await UploadSession.connect(unit.transport, base)
  await client.stage({ base, data, sha256: sha(data) })
  const result = await client.activate()
  expect(result).toMatchObject({ phase: 'pending', generation: 1, active: sha(data), currentTransaction: 1 })
  expect(unit.state).toMatchObject({ last: 1, generation: 1, commits: 1 })
  expect(await client.rollback()).toMatchObject({ phase: 'ready', active: old, generation: 2 })
})

it('lets a long set keep publishing past the reply timeout within the budget it is given', async () => {
  const data = new Uint8Array(200).fill(9)
  for (const budget of [undefined, 2000]) {
    const unit = controller(0, 8), client = await UploadSession.connect(unit.transport, base, { timeoutMs: 100 })
    await client.stage({ base, data, sha256: sha(data) })
    if (budget) expect(await client.activate(budget)).toMatchObject({ phase: 'pending', active: sha(data) })
    else await expect(client.activate()).rejects.toThrow(/did not finish before its deadline/) // 8 rows at 25 ms each
  }
})

it('retains an unconfirmed prefix after a lost progress reply and sends no more commands on that connection', async () => {
  const unit = controller(0, 3), data = new Uint8Array(200).fill(9)
  let commits = 0, calls = 0
  const transport = { exchange: async (frame: Uint8Array) => {
    calls++
    const reply = await unit.transport.exchange(frame)
    if (new DataView(frame.buffer, frame.byteOffset).getUint16(6) === UploadCommand.commit && ++commits === 2)
      throw new Error('status stage lost')
    return reply
  } }
  const client = await UploadSession.connect(transport, base)
  await client.stage({ base, data, sha256: sha(data) })
  await expect(client.activate()).rejects.toBeInstanceOf(UploadUnconfirmedError)
  expect(client.status).toMatchObject({ phase: 'publishing', activeKnown: false, generation: 0 })
  const before = calls
  await expect(client.rollback()).rejects.toBeInstanceOf(UploadUnconfirmedError)
  expect(calls).toBe(before)
})
