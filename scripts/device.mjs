// SPDX-License-Identifier: GPL-3.0-or-later
// Work directly on a unit running a Modwerk base, without a reboot: read its
// state, try a runtime module, then keep or roll it back. Speaks the USB bench
// protocol, so a real unit needs the bridge (Octatrack only so far):
//
//   ~/.cache/modwerk-upstream/venv/bin/python -B sdk/machines/octatrack/elekloader/usb_bridge.py /tmp/modwerk-ot.sock &
//   npm run device -- status
//   npm run device -- try MODULE.mwrm [--seconds 5] [--accept]
//   npm run device -- remove [--accept]
//   npm run device -- lifecycle
//
// --emulator drives ot_emu's USB bench socket instead (it enumerates the device
// first; ot_emu takes one connection, so one command per emulator run).
// Each command is one whole transaction. A trial is rolled back unless --accept
// is given; Ctrl-C rolls back early. If this process dies mid-trial, unplug USB:
// the base rolls back any module that was not accepted.
import { readFileSync } from 'node:fs'
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
if (!['status', 'try', 'remove', 'lifecycle'].includes(command) || (command === 'try') !== Boolean(file) ||
  !Number.isInteger(seconds) || seconds < 1 || seconds > 3600) {
  console.error('Usage: device.mjs status | try MODULE.mwrm [--seconds 1-3600] [--accept] | remove [--accept] | lifecycle [--socket PATH] [--emulator]')
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

/** Stage, publish and run `pkg` in a trial for `seconds`, then accept or roll back. */
async function trial(session, pkg) {
  await session.stage(pkg, { signal: interrupt.signal }); await session.activate(); await session.startTrial()
  console.log(`trial: ${pkg.sha256.slice(0, 16)}… running`)
  for (let second = 1; second <= seconds && !interrupt.signal.aborted; second++) {
    await wait(1000)
    const d = await diag()
    if (d) console.log(`  ${second}s: ticks ${d.ticks}, value 0x${d.value.toString(16)}, slot ${d.active ? 'running' : 'empty'}, refusals ${d.refusals}`)
  }
  await session.holdTrial()
  if (values.accept && !interrupt.signal.aborted) { await session.accept(); console.log('accepted') }
  else { await session.rollback(); console.log('rolled back' + (values.accept ? '' : ' (pass --accept to keep it)')) }
  return session.leaveUploadMode()
}

try {
  const session = await UploadSession.connect(transport, identity.base)
  if (command === 'status') console.log(state(session.status), '\nDIAG', await diag() ?? 'not answered')
  if (command === 'lifecycle') await runLifecycle(unit, index, console.log)
  if (command === 'remove') console.log(state(await trial(session, removal(identity.base))))
  if (command === 'try') {
    const data = new Uint8Array(readFileSync(file))
    // shortcut: runtime module files do not name their base yet, so any file is offered to the connected base,
    // whose loader validates it; bind the base once the hook ABI defines module files.
    console.log(state(await trial(session, { base: identity.base, data, sha256: sha(data) })))
  }
} catch (error) {
  console.error(error.message, error.cause?.message ?? '')
  console.error('If a module was left in trial, unplug USB: the base rolls back anything not accepted.')
  process.exitCode = 1
} finally { bench.socket.end() }
