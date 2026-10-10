// SPDX-License-Identifier: GPL-3.0-or-later
// Runtime-module lifecycle against the private Octatrack base, shared by the
// emulator check (scripts/verify-octatrack-vendor-client.mjs) and the Chrome
// test page (dev/octatrack-usb.html). Developer tooling: not part of the site.
import { sha } from '../../vendor/elekloader/kit/src/bytes.ts'
import { UploadSession, type UploadPackage } from '../engine/elekloader/upload-session.ts'
import { UsbVendorTransport, type ControlDevice } from '../engine/elekloader/upload-usb.ts'

export interface Diagnostics {
  ticks: number; value: number; active: boolean; frames: number; refusals: number; resets: number
  primes: number; completions: number; submitState: number; submitAwaited: boolean
  lastToken: string; lastReceived: number; primeStatus: string; queueNext: string; frameHead: string; abandons: number
}

/** The base's read-only DIAG request, version 3 (sdk/machines/octatrack/elekloader/ep0.c). */
export async function diagnostics(device: ControlDevice, index: number): Promise<Diagnostics> {
  const reply = await device.controlTransferIn({ requestType: 'vendor', recipient: 'interface', request: 4, value: 0, index }, 68)
  const view = reply.data
  if (reply.status !== 'ok' || !view || view.byteLength !== 68 || view.getUint32(0) !== 0x4d575544 || view.getUint8(4) !== 3)
    throw new Error('The base did not answer DIAG version 3.')
  const word = (i: number) => view.getUint32(8 + 4 * i), hex = (i: number) => '0x' + word(i).toString(16).padStart(8, '0')
  return {
    ticks: word(0), value: word(1), active: word(2) !== 0, frames: word(3), refusals: word(4), resets: word(5),
    primes: word(6), completions: word(7), submitState: word(8) >>> 16, submitAwaited: (word(8) & 1) !== 0,
    lastToken: hex(9), lastReceived: word(10), primeStatus: hex(11), queueNext: hex(12), frameHead: hex(13), abandons: word(14),
  }
}

const u32 = (n: number) => [n >>> 24, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff]
/** "MWRM" (sdk/runtime/loader/README.md) without bss or relocations: a tick hook at 0, or nothing for empty code.
 *  ABI 3 is module 0; ABI 4 names the module `id`. Sites are [address, stock bytes] that keep their stock bytes. */
function runtimePackage(base: string, code: number[], id?: number, sites: [number, number[]][] = []): UploadPackage {
  const hooks = code.length ? [0, 0xffffffff, 0xffffffff, 0xffffffff] : []
  const data = Uint8Array.from([0x4d, 0x57, 0x52, 0x4d, 0, id === undefined ? 3 : 4, 0, 0, ...u32(code.length), ...u32(0), ...u32(0),
    ...u32(hooks.length), ...u32(sites.length), ...(id === undefined ? [] : u32(id)), ...hooks.flatMap(u32), ...code,
    ...sites.flatMap(([at, bytes]) => [...u32(at), bytes.length >> 8, bytes.length & 0xff, 0, 0, ...bytes, ...bytes])])
  return { base, data, sha256: sha(data) }
}
/** module_tick: movea.l 4(sp),a0; move.l #value,(a0); rts, plus optional padding. */
export function testModule(base: string, value: number, padding = 0): UploadPackage {
  return runtimePackage(base, [0x20, 0x6f, 0x00, 0x04, 0x20, 0xbc, 0, 0, 0, value & 0xff, 0x4e, 0x75, ...new Array<number>(padding).fill(0)])
}
const tick = (value: number) => [0x20, 0x6f, 0x00, 0x04, 0x20, 0xbc, 0, 0, 0, value & 0xff, 0x4e, 0x75]
/** The OS entry, `lea (-28,%sp),%sp` at 0x40000400 in every base (build_core.py's OS_FIRST), runs once at boot:
 *  a site there that keeps its bytes changes nothing but claims them. */
const ENTRY: [number, number[]] = [0x40000400, [0x4f, 0xef, 0xff, 0xe4]]
/** Removes module `id` (module 0 when omitted); the other live modules stay. */
export const removal = (base: string, id?: number) => runtimePackage(base, [], id)

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))
function expect(condition: boolean, what: string): asserts condition { if (!condition) throw new Error('Failed: ' + what) }

/** Several modules at once (ABI 4): Q, then P claiming the OS entry's bytes, both kept; R claiming bytes P holds is
 *  refused with both still live; removing P keeps Q and frees the bytes for R. DIAG's value is the last position's tick.
 *  Ends with Q, P and R removed. */
export async function runModuleSet(device: ControlDevice, index: number, log: (line: string) => void) {
  const transport = new UsbVendorTransport(device, index, { pollMs: 5 })
  const identity = await transport.identify(), base = identity.base
  const session = await UploadSession.connect(transport, base)
  const value = async () => { await wait(250); return (await diagnostics(device, index)).value }
  const keep = async (pkg: UploadPackage) => {
    await session.stage(pkg); await session.activate(); await session.startTrial(); await wait(250)
    await session.holdTrial(); await session.accept(); await session.leaveUploadMode()
  }
  const Q = 0x6d770001, P = 0x6d770002, R = 0x6d770003
  await keep(runtimePackage(base, tick(0x51), Q))
  await keep(runtimePackage(base, tick(0x50), P, [ENTRY]))
  expect(await value() === 0x50, 'P runs after Q'); log('modules Q and P loaded and kept')
  const refused = await session.stage(runtimePackage(base, tick(0x52), R, [[0x40000402, [0xff, 0xe4]]])).then(() => false,
    (error: unknown) => (error as { status?: { result?: string } }).status?.result === 'rejected')
  expect(refused, 'R, claiming bytes P patches, is refused')
  expect(await value() === 0x50, 'the refusal leaves P live'); log('R, patching bytes P holds, refused before activation; P still runs')
  await keep(removal(base, P))
  expect(await value() === 0x51, 'Q still runs after P is removed'); log('P removed; Q still runs')
  await keep(runtimePackage(base, tick(0x52), R, [[0x40000402, [0xff, 0xe4]]]))
  expect(await value() === 0x52, 'R runs once P released its bytes'); log("R loaded once P released the bytes")
  await keep(removal(base, R)); await keep(removal(base, Q))
  log('R and Q removed')
  return session
}

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
  const c = testModule(identity.base, 0xc3)
  await session.stage(c); await session.activate(); await session.startTrial(); await settle()
  expect((await read()).value === 0xc3, 'module C runs its own code')
  await session.holdTrial(); await session.rollback(); await session.leaveUploadMode()
  log('module C ran its own code and rolled back')
  return session
}
