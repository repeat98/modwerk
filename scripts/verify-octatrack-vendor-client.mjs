// SPDX-License-Identifier: GPL-3.0-or-later
// The browser's USB transport and session client against the private base in
// the emulator, through ot_emu's USB bench socket (sdk/octabam/tools/emu/ot_emu/usb.h).
//
//   ot_emu --image MAIN.raw --usb-host /tmp/ot-usb.sock --ms 300000 &
//   node scripts/verify-octatrack-vendor-client.mjs /tmp/ot-usb.sock NEW-core-output/proofs.json
//
// Emulator protocol evidence only: no host OS driver, WebUSB claim, timing or hardware.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { UploadSession } from '../src/engine/elekloader/upload-session.ts'
import { findVendorInterface, UsbVendorTransport } from '../src/engine/elekloader/upload-usb.ts'
import { diagnostics, removal, runLifecycle, testModule } from '../src/dev/octatrack-usb-lifecycle.ts'
import { Bench, device, enumerate } from './usb-bench.mjs'

// --hardware: a real unit through sdk/machines/octatrack/elekloader/usb_bridge.py; the host OS has
// enumerated it, and the emulator-only bus reset case is skipped.
const hardware = process.argv.includes('--hardware')
const [socketPath, proofsPath] = process.argv.slice(2).filter(arg => arg !== '--hardware')
if (!socketPath || !proofsPath) throw new Error('Usage: verify-octatrack-vendor-client.mjs SOCKET PROOFS_JSON')
const base = JSON.parse(readFileSync(proofsPath, 'utf8')).configurationHash

const bench = new Bench(socketPath)
await bench.ready()
const number = findVendorInterface(await enumerate(bench, hardware))
assert.equal(number, 1)
console.log("the client finds the vendor interface in the device's own configuration: passed")
const session = await runLifecycle(device(bench), number, line => console.log(line + ': passed'))
assert.equal(session.status.active, removal(base).sha256)
if (hardware) {
  bench.socket.end()
  console.log('Browser client against the unit: lifecycle passed.')
  process.exit(0)
}

// Emulator only: a bus reset after the first chunk of a two-chunk package.
const a = testModule(base, 0xa1)
await session.stage(a); await session.activate(); await session.startTrial()
await new Promise(resolve => setTimeout(resolve, 250)) // retirement waits for the tick to pass the swap
await session.holdTrial(); await session.accept(); await session.leaveUploadMode()
const faults = {}
const staging = await UploadSession.connect(new UsbVendorTransport(device(bench, faults), number, { pollMs: 5 }), base)
await assert.rejects(staging.stage(testModule(base, 0xc3, 5000), { progress: () => { faults.before = () => bench.command('reset') } }))
await enumerate(bench, hardware)
const after = await UploadSession.connect(new UsbVendorTransport(device(bench), number, { pollMs: 5 }), base)
assert.equal(after.status.phase, 'normal'); assert.equal(after.status.active, a.sha256)
assert.deepEqual(after.status.session, session.status.session)
await new Promise(resolve => setTimeout(resolve, 250))
const diag = await diagnostics(device(bench), number)
assert.equal(diag.value, 0xa1); assert.equal(diag.active, true); assert(diag.resets >= 1)
console.log('a bus reset mid-staging discards the candidate and keeps A running: passed')
bench.socket.end()
console.log('Browser client against the emulated base: lifecycle passed; protocol evidence only, no host driver, WebUSB or hardware.')
