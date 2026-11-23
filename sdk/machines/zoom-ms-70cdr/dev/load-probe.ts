// SPDX-License-Identifier: GPL-3.0-or-later
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { ZoomPatch } from '../../../../src/engine/zoom/zoom-base.ts'

const MODEL = 'ms70cdr-2.10'
const sites = [
  // The read call's execute packet includes the stock code that prepares its arguments.
  { name: '.patch_read', addr: 0xc00a5518, hash: '7fc4e7d3c510a1510790fe3a3ec8957537b17d66e08d019dad6257746b7c133a', parallel: true },
  { name: '.patch_draw', addr: 0xc00a93d0, hash: '705f25fd3ff3d2454e642775dccd7f676ae5428ce195b07531684fb7e46a46ba', parallel: false },
  // Replace the branch in MIDISTOMP's MIDI diagnostics vector, keeping its return address setup.
  { name: '.patch_midi', addr: 0xc00f485c, hash: '9c1c0fb36c10f4425663846918af0b4804605fa9d9ba59b4152ad4c6e769da4e', parallel: false },
]

/** Assemble only Modwerk's instrumentation. The patcher checks the branch sites and loaded section. */
export function buildLoadProbe(prefix: string): ZoomPatch {
  const dir = mkdtempSync(join(tmpdir(), 'modwerk-zoom-probe-'))
  const source = fileURLToPath(new URL('./', import.meta.url))
  const obj = join(dir, 'probe.o'), elf = join(dir, 'probe.elf')
  try {
    execFileSync(prefix + 'as', ['-mlittle-endian', '-march=c674x', '-o', obj, join(source, 'load-probe.S')])
    execFileSync(prefix + 'ld', ['-EL', '-T', join(source, 'load-probe.ld'), '-e', 'probe_read', '-o', elf, obj])
    const section = (name: string) => {
      const output = join(dir, name + '.bin')
      execFileSync(prefix + 'objcopy', ['-O', 'binary', '-j', name, elf, output])
      return readFileSync(output)
    }
    const write = sites.map(({ name, addr, hash, parallel }) => {
      const code = section(name).subarray(0, 4)
      if (code.length !== 4) throw new Error('Could not assemble the branch for ' + name)
      code[0] = (code[0] & ~1) | Number(parallel)
      return { model: MODEL, addr, expect_length: 4, expect_sha256: hash, data: code.toString('hex') }
    })
    return { name: 'zdl-load-probe', write, section: [{ model: MODEL, addr: 0xc00f4b00, data: section('.probe').toString('hex') }] }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}
