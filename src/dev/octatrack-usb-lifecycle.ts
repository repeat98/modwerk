// SPDX-License-Identifier: GPL-3.0-or-later
// Runtime-module lifecycle against the private Octatrack base, shared by the
// emulator check (scripts/verify-octatrack-vendor-client.mjs) and the Chrome
// test page (dev/octatrack-usb.html). Developer tooling: not part of the site.
import { sha } from '../../vendor/elekloader/kit/src/bytes.ts'
import { UploadSession, type UploadPackage } from '../engine/elekloader/upload-session.ts'
import { UsbVendorTransport, type ControlDevice } from '../engine/elekloader/upload-usb.ts'

export interface Diagnostics { ticks: number; value: number; active: boolean; frames: number; refusals: number; resets: number }

/** The base's read-only DIAG request (sdk/machines/octatrack/elekloader/ep0.c). */
export async function diagnostics(device: ControlDevice, index: number): Promise<Diagnostics> {
  const reply = await device.controlTransferIn({ requestType: 'vendor', recipient: 'interface', request: 4, value: 0, index }, 32)
  const view = reply.data
  if (reply.status !== 'ok' || !view || view.byteLength !== 32 || view.getUint32(0) !== 0x4d575544 || view.getUint8(4) !== 1)
    throw new Error('The base did not answer DIAG.')
  const word = (i: number) => view.getUint32(8 + 4 * i)
  return { ticks: word(0), value: word(1), active: word(2) !== 0, frames: word(3), refusals: word(4), resets: word(5) }
}

/** "MWRM", ABI 1, entry 0, then movea.l 4(sp),a0; move.l #value,(a0); rts, plus optional padding. */
export function testModule(base: string, value: number, padding = 0): UploadPackage {
  const code = [0x20, 0x6f, 0x00, 0x04, 0x20, 0xbc, 0, 0, 0, value & 0xff, 0x4e, 0x75, ...new Array<number>(padding).fill(0)]
  const data = Uint8Array.from([0x4d, 0x57, 0x52, 0x4d, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, code.length >> 8, code.length & 0xff, ...code])
  return { base, data, sha256: sha(data) }
}
export function removal(base: string): UploadPackage {
  const data = Uint8Array.from([0x4d, 0x57, 0x52, 0x4d, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0])
  return { base, data, sha256: sha(data) }
}

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))
function expect(condition: boolean, what: string): asserts condition { if (!condition) throw new Error('Failed: ' + what) }

/** Load A, replace with B and roll back, then remove: no reboot, read back through DIAG. Ends with an empty slot. */
export async function runLifecycle(device: ControlDevice, index: number, log: (line: string) => void) {
  const transport = new UsbVendorTransport(device, index, { pollMs: 5 })
  const identity = await transport.identify()
  expect(identity.canSubmit, 'the base accepts frames'); log(`IDENTIFY: ${identity.model}, base ${identity.base.slice(0, 16)}…`)
  const session = await UploadSession.connect(transport, identity.base)
  expect(session.status.phase === 'normal', 'HELLO in normal phase'); log(`HELLO: generation ${session.status.generation}, capacity ${session.status.capacity}`)
  const before = await diagnostics(device, index); await wait(250)
  expect((await diagnostics(device, index)).ticks > before.ticks, 'the runtime tick advances'); log('the runtime tick advances')
  const settle = () => wait(250), read = () => diagnostics(device, index)
  const a = testModule(identity.base, 0xa1), b = testModule(identity.base, 0xb2)
  await session.stage(a); await session.activate(); await session.startTrial(); await settle()
  expect((await read()).value === 0xa1, 'module A runs in its trial')
  await session.holdTrial(); await session.accept(); await session.leaveUploadMode()
  log('module A loaded, ran in its trial and was accepted')
  await session.stage(b); await session.activate(); await session.startTrial(); await settle()
  expect((await read()).value === 0xb2, 'replacement B runs in its trial')
  await session.holdTrial(); await session.rollback(); await session.leaveUploadMode(); await settle()
  expect(session.status.active === a.sha256 && (await read()).value === 0xa1, 'rollback runs A again')
  log('replacement B ran in its trial and rolled back to A')
  await session.stage(removal(identity.base)); await session.activate(); await session.startTrial(); await settle()
  expect(!(await read()).active, 'removal empties the slot')
  await session.holdTrial(); await session.accept(); await session.leaveUploadMode()
  log(`module removed; DIAG ${JSON.stringify(await read())}`)
  return session
}
