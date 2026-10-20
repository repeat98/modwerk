import { expect, it } from 'vitest'
import { sha } from '../../../vendor/elekloader/kit/src/bytes.ts'
import { UploadDeviceError, UploadSession } from './upload-session'
import { UploadCommand, UploadPhase, UploadResult, type UploadPhaseName, type UploadResultName } from './upload-wire'

const base = '31'.repeat(32), session = '52'.repeat(32), old = '41'.repeat(32)
const names = Object.fromEntries(Object.entries(UploadCommand).map(([name, code]) => [code, name]))

/** The controller (sdk/runtime/upload/upload.c) as far as these tests reach it, with a publication the backend refuses
 * `refusals` times: as upload.c's commit does on MU_UNCHANGED, the staged package is discarded (phase ready). */
function controller(refusals: number) {
  const state = { phase: 'normal' as UploadPhaseName, generation: 0, last: 0, current: 0, received: 0, length: 0, active: old, digest: old, commits: 0 }
  const reply = (command: number, transaction: number, result: UploadResultName = 'ok') => {
    const out = new Uint8Array(144), view = new DataView(out.buffer)
    view.setUint32(0, 0x4d575552); view.setUint16(4, 1); view.setUint16(6, command); view.setUint32(8, transaction); view.setUint32(12, 128)
    ;[UploadResult.indexOf(result), UploadPhase.indexOf(state.phase), 1, state.generation, state.last, state.current, state.received, 8192]
      .forEach((value, i) => view.setUint32(16 + 4 * i, value))
    out.set(Buffer.from(base, 'hex'), 48); out.set(Buffer.from(session, 'hex'), 80); out.set(Buffer.from(state.active, 'hex'), 112)
    return out
  }
  const exchange = async (frame: Uint8Array) => {
    const view = new DataView(frame.buffer, frame.byteOffset), command = view.getUint16(6), transaction = view.getUint32(8)
    switch (names[command]) {
      case 'enter': state.phase = state.phase === 'trial' ? 'pending' : 'ready'; break // a trial is held, stopped
      case 'leave': state.phase = state.phase === 'pending' ? 'trial' : 'normal'; break
      case 'rollback':
        if (state.phase !== 'pending' || transaction !== state.current) return reply(command, transaction, 'state')
        state.phase = 'ready'; state.active = old; state.generation++; break
      case 'begin':
        if (state.phase !== 'ready' || transaction !== state.last + 1) return reply(command, transaction, 'state')
        state.last = state.current = transaction; state.phase = 'receiving'; state.received = 0
        state.length = view.getUint32(48 + 68); state.digest = Buffer.from(frame.subarray(80, 112)).toString('hex'); break
      case 'chunk': state.received += frame.length - 52; break
      case 'verify': state.phase = 'verified'; break
      case 'commit':
        if (state.phase !== 'verified') return reply(command, transaction, 'state')
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
