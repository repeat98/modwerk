// SPDX-License-Identifier: GPL-3.0-or-later
// Work directly on a unit running a Modwerk base, without a reboot: read its
// state, try a runtime module, then keep or roll it back. Speaks the USB bench
// protocol, so a real unit needs the bridge (Octatrack only so far):
//
//   ~/.cache/modwerk-upstream/venv/bin/python -B sdk/machines/octatrack/elekloader/usb_bridge.py /tmp/modwerk-ot.sock &
//   npm run device -- status
//   npm run device -- try MODULE.mwrm [--seconds 5] [--accept]
//   npm run device -- remove [MODULE.mwrm] [--accept]   # that file's module, else module 0
//   npm run device -- lifecycle
//   npm run device -- boot BUILD_DIR       # RAM boot: build_core.py's output, no flashing
//
// --emulator drives ot_emu's USB bench socket instead (it enumerates the device
// first; ot_emu takes one connection, so one command per emulator run).
// Each command is one whole transaction. A trial is rolled back unless --accept
// is given; Ctrl-C rolls back early. If this process dies mid-trial, unplug USB:
// the base rolls back any module that was not accepted.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseArgs } from 'node:util'
import { sha } from '../vendor/elekloader/kit/src/bytes.ts'
import { UploadSession } from '../src/engine/elekloader/upload-session.ts'
import { findVendorInterface, UsbVendorTransport } from '../src/engine/elekloader/upload-usb.ts'
import { diagnostics, removal, runLifecycle } from '../src/dev/octatrack-usb-lifecycle.ts'
import { Bench, device, enumerate } from './usb-bench.mjs'

const { values, positionals: [command, file] } = parseArgs({ allowPositionals: true, options: {
  socket: { type: 'string', default: '/tmp/modwerk-ot.sock' },
  seconds: { type: 'string', default: '5' },
  accept: { type: 'boolean', default: false },
  emulator: { type: 'boolean', default: false },
} })
const seconds = Number(values.seconds)
if (!['status', 'try', 'remove', 'lifecycle', 'boot'].includes(command) || (['try', 'boot'].includes(command) && !file) ||
  (['status', 'lifecycle'].includes(command) && file) ||
  !Number.isInteger(seconds) || seconds < 1 || seconds > 3600) {
  console.error('Usage: device.mjs status | try MODULE.mwrm [--seconds 1-3600] [--accept] | remove [MODULE.mwrm] [--accept] | lifecycle | boot BUILD_DIR [--socket PATH] [--emulator]')
  process.exit(2)
}

const wait = ms => new Promise(resolve => setTimeout(resolve, ms))
const bench = new Bench(values.socket)
await bench.ready()
const unit = device(bench), index = findVendorInterface(await enumerate(bench, !values.emulator))
const transport = new UsbVendorTransport(unit, index, { pollMs: 5 })
const identity = await transport.identify()
// DIAG is the Octatrack base's own request; other bases may not answer it.
const diag = () => diagnostics(unit, index).catch(() => undefined)
const state = s => `${s.phase}, generation ${s.generation}, active ${s.active?.slice(0, 16) ?? 'unknown'}…`
console.log(`${identity.model}, base ${identity.base.slice(0, 16)}…`)

const interrupt = new AbortController()
process.once('SIGINT', () => { console.log('interrupted: rolling back'); process.exitCode = 130; interrupt.abort() })

/** While the unit plays, the base presses STOP and refuses with `unsafe`; retry for 3 s as the site does. */
async function stopping(step) {
  for (const start = Date.now(); ; await wait(200)) {
    try { return await step() } catch (error) { if (error.status?.result !== 'unsafe' || Date.now() - start > 3000) throw error }
  }
}

/** Stage, publish and run `pkg` in a trial for `seconds`, then accept or roll back. */
async function trial(session, pkg) {
  await stopping(() => session.stage(pkg, { signal: interrupt.signal })); await session.activate(); await session.startTrial()
  console.log(`trial: ${pkg.sha256.slice(0, 16)}… running`)
  for (let second = 1; second <= seconds && !interrupt.signal.aborted; second++) {
    await wait(1000)
    const d = await diag()
    if (d) console.log(`  ${second}s: ticks ${d.ticks}, value 0x${d.value.toString(16)}, slot ${d.active ? 'running' : 'empty'}, refusals ${d.refusals}`)
  }
  await stopping(() => session.holdTrial())
  if (values.accept && !interrupt.signal.aborted) { await session.accept(); console.log('accepted') }
  else { await session.rollback(); console.log('rolled back' + (values.accept ? '' : ' (pass --accept to keep it)')) }
  return session.leaveUploadMode()
}

/** After a RAM boot: wait until the unit has gone away and come back far enough to answer HELLO. */
let backBench
async function rebooted() {
  let gone = false
  for (const start = Date.now(); Date.now() - start < 60000; await wait(500)) {
    const again = backBench = new Bench(values.socket)
    try {
      await again.ready()
      const d = device(again), i = findVendorInterface(await enumerate(again, true))
      const t = new UsbVendorTransport(d, i, { pollMs: 5 }), base = (await t.identify()).base
      if (gone) return { base, session: await UploadSession.connect(t, base, { timeoutMs: 60000 }) } // the engine refuses until it runs
      again.socket.end()
    } catch { gone = true; again.socket.end() }
  }
  throw new Error('The unit did not come back within 60 s; a power cycle boots the flashed base.')
}

try {
  // A whole OS image takes the unit (and far longer the emulator) a while to hash.
  const session = await UploadSession.connect(transport, identity.base, { timeoutMs: command === 'boot' ? 60000 : 10000 })
  if (command === 'status') console.log(state(session.status), '\nDIAG', await diag() ?? 'not answered')
  if (command === 'lifecycle') await runLifecycle(unit, index, console.log)
  if (command === 'remove') {
    // An ABI 4 file names its module (sdk/runtime/loader/README.md); ABI 3 modules are module 0.
    const view = file ? new DataView(new Uint8Array(readFileSync(file)).buffer) : undefined
    if (view && (view.byteLength < 32 || view.getUint32(0) !== 0x4d57524d)) throw new Error(file + ' is not a runtime module.')
    console.log(state(await trial(session, removal(identity.base, view?.getUint16(4) === 4 ? view.getUint32(28) : undefined))))
  }
  if (command === 'try') {
    const data = new Uint8Array(readFileSync(file))
    // shortcut: runtime module files do not name their base yet, so any file is offered to the connected base,
    // whose loader validates it; bind the base once the hook ABI defines module files.
    console.log(state(await trial(session, { base: identity.base, data, sha256: sha(data) })))
  }
  if (command === 'boot') {
    const image = new Uint8Array(readFileSync(join(file, 'MAIN.raw')))
    const expected = JSON.parse(readFileSync(join(file, 'proofs.json'), 'utf8')).configurationHash
    if (image.length < 4 || new DataView(image.buffer, image.byteOffset).getUint32(0) !== 0x4fefffe4)
      throw new Error(join(file, 'MAIN.raw') + ' is not an OS image.')
    const arm = async (s, base) => {
      let shown = 0
      await s.stage({ base, data: image, sha256: sha(image) }, { signal: interrupt.signal, progress: (done, total) => {
        if (Math.floor(10 * done / total) > shown) console.log(`  staged ${10 * (shown = Math.floor(10 * done / total))}%`)
      } })
      await s.activate() // the base arms the boot and resets half a second later
      console.log(`armed: the unit restarts into ${expected.slice(0, 16)}… from RAM; a power cycle returns to the flashed base`)
    }
    await arm(session, identity.base)
    if (values.emulator) await wait(3000) // ot_emu stops when the client hangs up; let the reset run first
    else {
      bench.socket.end()
      let back = await rebooted()
      // Only the flashed base's gate reads the mailbox, at its own address: armed from a RAM-booted base,
      // the boot falls back to the flashed one, which can then arm it properly.
      if (back.base !== expected && back.base !== identity.base) {
        console.log(`came back on the flashed base ${back.base.slice(0, 16)}…: arming again from it`)
        await arm(back.session, back.base)
        backBench.socket.end()
        back = await rebooted()
      }
      if (back.base !== expected) throw new Error(`The unit came back on base ${back.base.slice(0, 16)}…, not the one sent; a power cycle boots the flashed base.`)
      console.log(`booted: base ${expected.slice(0, 16)}…`)
    }
  }
} catch (error) {
  console.error(error.message, error.cause?.message ?? '')
  console.error('If a module was left in trial, unplug USB: the base rolls back anything not accepted.')
  process.exitCode = 1
} finally { bench.socket.end(); backBench?.socket.end() }
