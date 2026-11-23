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
  { name: '.patch_seek_phdr', addr: 0xc00a55a0, hash: 'c945ebecab1be56329ea886ac83ceac653a4bfb446d1544f10e2262e4140fb22', parallel: true },
  { name: '.patch_view_phdr', addr: 0xc00a55c4, hash: '59e5d3f4e98bb62d2d23f21faafe6a8873fd44361cc99a55ac01e4ab77f813b3', parallel: true },
  { name: '.patch_seek_section', addr: 0xc00a57ec, hash: '613022cbb926bca8591fcf4237c0e2390a94a5e5def175f809f71c4485858e9f', parallel: false },
  { name: '.patch_view_section', addr: 0xc00a5800, hash: '32da7b1fe1b5fe400db2351788d4b9e33bc87a7d22f0cca4afb45cd7d5a6ebf6', parallel: true },
  { name: '.patch_seek_symbols', addr: 0xc00a58e0, hash: 'd22f5ba27c112634004a5183a320062d4fd03be15b8a9e2c0461538c46001cb2', parallel: true },
  { name: '.patch_view_symbols', addr: 0xc00a5900, hash: '47ebac98bcf05f3c816d1498fac75134e3f7ff536d1bf98526d9a52f4d66f83d', parallel: true },
  { name: '.patch_seek_reloc', addr: 0xc00a5920, hash: 'b2e856b7bf82886b4378bad1c81515d2ac844175e12dc0cbce6df177a26bb069', parallel: true },
  { name: '.patch_copy_reloc', addr: 0xc00a5934, hash: '45e932719a2b76396da1f5af210b71161ce25f0b55a2f988367ace36931caba4', parallel: true },
  { name: '.patch_copy_word', addr: 0xc00a5944, hash: '540e161d15827a46873c1d64cc595eee4a959504d11f53225b6865922346a849', parallel: true },
  { name: '.patch_seek_data', addr: 0xc00a5988, hash: '94fcb387904f6ae3134ea2f57df4aa61bdedb9c1e3396da3b7e58775631ceaa6', parallel: true },
  { name: '.patch_view_data', addr: 0xc00a59ac, hash: 'f50d4738c2c88c32f85a62128275f09519a38efbad7631ccb1ffcc794d01f2cd', parallel: true },
  { name: '.patch_seek_end', addr: 0xc00a5be8, hash: '573415563ad79f933a5a26e708d99b736a7bb024674b293febeb8899c806c49f', parallel: true },
  { name: '.patch_close', addr: 0xc00a6a70, hash: 'ab7f21894fd993f0825c81bbcd2ee3d187692da4e2d482152d3b77c330f68648', parallel: false },
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
    execFileSync(prefix + 'as', ['-no-pad-sections', '-mlittle-endian', '-march=c674x', '-o', obj, join(source, 'load-probe.S')])
    execFileSync(prefix + 'ld', ['-EL', '-T', join(source, 'load-probe.ld'), '-e', 'probe_read', '-o', elf, obj])
    const section = (name: string) => {
      const output = join(dir, name + '.bin')
      execFileSync(prefix + 'objcopy', ['-O', 'binary', '-j', name, elf, output])
      return readFileSync(output)
    }
    const write = sites.map(({ name, addr, hash, parallel }) => {
      const code = section(name)
      if (code.length !== 4) throw new Error('Could not assemble the branch for ' + name)
      code[0] = (code[0] & ~1) | Number(parallel)
      return { model: MODEL, addr, expect_length: 4, expect_sha256: hash, data: code.toString('hex') }
    })
    return { name: 'zdl-load-probe', write, section: [{ model: MODEL, addr: 0xc00f4b00, data: section('.probe').toString('hex') }] }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}
