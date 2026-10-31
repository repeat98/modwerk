// SPDX-License-Identifier: MIT
// Read-only baseline through the existing shared EP0 socket. Never starts a
// bridge, sends panel input, submits upload frames, Keeps or writes the card.
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { parseArgs } from 'node:util'
import console from 'node:console'
import { Bench, device, enumerate } from '../../../../../scripts/usb-bench.mjs'
import { findVendorInterface, UsbVendorTransport } from '../../../../../src/engine/elekloader/upload-usb.ts'

const { values } = parseArgs({ options: {
  socket: { type: 'string' }, output: { type: 'string' },
  'backup-saved': { type: 'boolean', default: false },
  compare: { type: 'string' },
} })
if (!values.socket || !values.output) throw new Error('Use an already-authorized shared EP0 --socket and a new private --output directory.')
await mkdir(values.output) // Refuse to overwrite a baseline.
const bench = new Bench(values.socket, { timeoutMs: 10000 })
try {
  await bench.ready()
  const index = findVendorInterface(await enumerate(bench, true))
  const transport = new UsbVendorTransport(device(bench), index, { pollMs: 5 })
  const identity = await transport.identify()
  const active = await transport.setIdentity()
  const inventory = await transport.inventory()
  if (!inventory) throw new Error('Complete module inventory is required.')
  const result = { identity, active, inventory, capturedAt: new Date().toISOString(),
    deviceOperations: 'Identity, inventory and optional export only; no boot/install/Keep/card write',
    savedBackup: 'not requested', restoration: 'not evaluated' }
  if (values['backup-saved']) {
    const snapshots = await transport.savedBackup()
    result.savedBackup = snapshots ? [] : 'unsupported; verify original packages/backup before RAM boot'
    for (const snapshot of snapshots ?? []) {
      const { data, ...metadata } = snapshot
      result.savedBackup.push(metadata)
      if (data) await writeFile(join(values.output, `MODWERK${snapshot.slot}.SET.private`), data, { flag: 'wx' })
    }
  }
  if (values.compare) {
    const original = JSON.parse(await readFile(values.compare, 'utf8'))
    const signature = list => list.map(({ module, layout, name }) => ({ module, layout, name }))
      .sort((a, b) => a.module.localeCompare(b.module))
    if (identity.base !== original.identity.base || active !== original.active ||
      JSON.stringify(signature(inventory)) !== JSON.stringify(signature(original.inventory)))
      throw new Error('Original base, active set or full inventory differs; stop recovery checks here.')
    result.restoration = 'base, active set identity and complete inventory match supplied baseline'
  }
  await writeFile(join(values.output, 'baseline.json'), JSON.stringify(result, null, 2) + '\n', { flag: 'wx' })
  console.log(`Read-only baseline saved: ${values.output}; ${inventory.length} modules. No device change.`)
} finally {
  bench.socket.destroy()
}
