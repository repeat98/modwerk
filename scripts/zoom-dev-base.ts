// SPDX-License-Identifier: GPL-3.0-or-later
// Build a privately labelled MS-70CDR development image with the browser's patcher.
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parseArgs } from 'node:util'
import { buildDevelopmentBase, readUpdater, sha256, type ZoomPatch } from '../src/engine/zoom/zoom-base.ts'
import { buildLoadProbe } from '../sdk/machines/zoom-ms-70cdr/dev/load-probe.ts'

try {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: { label: { type: 'string' }, 'load-probe': { type: 'boolean' }, 'c6x-prefix': { type: 'string', default: 'tic6x-elf-' } },
  })
  if (positionals.length !== 1 || !values.label)
    throw new Error('Usage: node scripts/zoom-dev-base.ts STOCK.zip --label D001 [--load-probe [--c6x-prefix PREFIX]]')
  const stock = await readUpdater(await readFile(positionals[0]))
  const overlays: ZoomPatch[] = values['load-probe'] ? [buildLoadProbe(values['c6x-prefix'])] : []
  const image = await buildDevelopmentBase(stock, values.label, overlays)
  const directory = await mkdtemp(join(tmpdir(), 'modwerk-zoom-dev-'))
  const files = []
  for (const [name, data] of [['Main.bin', image.main], ['Preset.bin', image.preset]] as const) {
    if (!data) continue
    const path = join(directory, name)
    await writeFile(path, data, { flag: 'wx', mode: 0o600 })
    files.push({ path, bytes: data.length, sha256: await sha256(data) })
  }
  console.log(JSON.stringify({ machine: 'zoom-ms-70cdr', label: values.label, files }, null, 2))
} catch (error) {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
}
