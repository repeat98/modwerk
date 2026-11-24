// SPDX-License-Identifier: MIT
// Read-only public meters. No keys, trials, Keep, project writes or memory reads.
import { writeFileSync } from 'node:fs'
import { parseArgs } from 'node:util'
import console from 'node:console'
import { setTimeout as delay } from 'node:timers/promises'
import { Bench, device, enumerate } from '../../../scripts/usb-bench.mjs'
import { UsbVendorTransport, findVendorInterface } from '../../../src/engine/elekloader/upload-usb.ts'

const { values } = parseArgs({ options: {
  output: { type: 'string' }, label: { type: 'string' },
  seconds: { type: 'string', default: '20' }, socket: { type: 'string', default: '/tmp/modwerk-ot.sock' },
} })
const seconds = Number(values.seconds)
if (!values.output || !values.label || !Number.isInteger(seconds) || seconds < 1 || seconds > 60) {
  throw new Error('Use --output NEW-PRIVATE.json --label CONDITIONS [--seconds 1-60] [--socket PATH]')
}
const bench = new Bench(values.socket, { timeoutMs: 5000 })
try {
  await bench.ready()
  const transport = new UsbVendorTransport(device(bench), findVendorInterface(await enumerate(bench, true)))
  const identity = await transport.identify(), inventory = await transport.inventory()
  const setDigest = await transport.setIdentity(), started = new Date().toISOString()
  const samples = [], start = Date.now()
  for (let sample = 0; sample <= seconds; sample++) {
    const load = await transport.load()
    if (!load) throw new Error('This base does not expose the public load meter')
    samples.push({ elapsedMs: Date.now() - start, ...load })
    if (sample < seconds) await delay(1000)
  }
  if (await transport.setIdentity() !== setDigest) throw new Error('Installed set changed during capture')
  const fields = ['cpu', 'tracks1to4', 'tracks5to8', 'peak1to4', 'peak5to8']
  const maximaPermille = Object.fromEntries(fields.map(field => {
    const available = samples.map(sample => sample[field]).filter(value => value !== null)
    return [field, available.length ? Math.max(...available) : null]
  }))
  const report = { schemaVersion: 1, kind: 'public-meter-observation', qualification: false,
    started, label: values.label, base: identity.base, setDigest, inventory,
    durationMs: Date.now() - start, samples, maximaPermille,
    frameCounterAdvanced: samples.some(sample => sample.frames !== samples[0].frames),
    limitations: ['Operator supplies project, playback and workload conditions; this command cannot verify them.',
      'Inventory names do not prove individual package hashes; whole-set digest is retained for comparison.',
      'One-second samples of cached meter windows are not worst-case cycles, frame deadlines or MIDI delivery measurements.',
      'No baseline subtraction, memory, stack, receiver loss or interrupt timing is measured.'] }
  writeFileSync(values.output, JSON.stringify(report, null, 2) + '\n', { flag: 'wx', mode: 0o600 })
  if (!report.frameCounterAdvanced || Object.values(maximaPermille).some(value => value === null)) {
    console.error('Incomplete measurement: frame counter stood still or meters were unavailable. No timing pass is established.')
  }
  console.log(JSON.stringify({ output: values.output, base: identity.base, modules: inventory?.length,
    samples: samples.length, maximaPermille, qualification: false }))
} finally { bench.socket.end() }
