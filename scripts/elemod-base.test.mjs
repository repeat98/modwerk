// SPDX-License-Identifier: GPL-3.0-or-later
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { baseProblems, buildBase, packageText } from './elemod-base.mjs'
import { linkAll } from '../src/engine/elekloader/digi-link-all.ts'
import { parseElemod } from '../src/engine/elektron/elemod.ts'

const root = resolve(import.meta.dirname, '..'), at = path => resolve(root, path)
const binding = JSON.parse(readFileSync(at('sdk/machines/digitakt/base-binding.json'), 'utf8'))
const config = JSON.parse(readFileSync(at('sdk/machines/digitakt/base/base.json'), 'utf8'))
const stored = name => readFileSync(at(`sdk/imports/packages/modwerk-base-digitakt/${name}`))
const has = command => { try { execFileSync(command, ['--version'], { stdio: 'ignore' }); return true } catch { return false } }
// Another compiler builds other bytes: rebuild only with the toolchain the binding records.
const recordedToolchain = () => { try { return execFileSync('m68k-elf-gcc', ['-dumpfullversion'], { encoding: 'utf8' }).trim() === binding.built.toolchain.gcc && execFileSync('m68k-elf-as', ['--version'], { encoding: 'utf8' }).split('\n')[0] === binding.built.toolchain.binutils } catch { return false } }

describe('Digitakt mk1 base', () => {
  it('keeps the packages its binding names, each a base for the interface or a code-free companion', () => {
    const iface = JSON.parse(readFileSync(at(config.interface), 'utf8')), reference = JSON.parse(readFileSync(at(config.reference.file), 'utf8'))
    for (const [name, sha256] of Object.entries(binding.packages)) {
      const bytes = stored(name), module = JSON.parse(bytes.toString('utf8'))
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(sha256)
      expect(packageText(module)).toBe(bytes.toString('utf8'))
      parseElemod(module)
      if (module.id === 'core') {
        expect(binding.identities[module.target.os]).toBe(sha256)
        expect(module.version).toBe('5.0')   // 5.0 >= 4.0: the 256 KiB module area
        expect(baseProblems(module, iface, reference, config.reference.keeps)).toEqual([])
        expect(module.sites.map(s => s.addr)).toHaveLength(config.sites.length)
      } else {
        expect(module.sections).toEqual({})
        expect(module.resources.core).toBe('5.0')
      }
    }
  })

  it('links every shipped Digitakt module alone and in pairs, with the code-free machine-pages', () => {
    const want = { '1.53': [11, 54], '1.54': [18, 151] }
    for (const [os, [singles, pairs]] of Object.entries(want)) {
      const core = Object.keys(binding.packages).find(n => binding.packages[n] === binding.identities[os])
      const result = linkAll({ machine: 'digitakt', pairs: true, core: at(`sdk/imports/packages/modwerk-base-digitakt/${core}`),
        packages: [at(`sdk/imports/packages/modwerk-base-digitakt/machine-pages-2.0-os${os}.elemod`)] })
      const o = result.oses[0]
      expect([o.os, o.singles.ok, o.singles.failed, o.pairs.ok, o.pairs.failed, o.pairs.clashes]).toEqual([os, singles, [], pairs, [], []])
    }
  }, 60_000)

  it.skipIf(!has('cc'))('runs the C parts on the host', () => {
    const work = mkdtempSync(resolve(tmpdir(), 'modwerk-base-test-'))
    try {
      execFileSync('cc', ['-std=c11', '-Wall', '-Wextra', '-Werror', '-I', at('sdk/elemod/core'), '-I', at('sdk/machines/digitakt/base'), at('sdk/machines/digitakt/base/tests/base-test.c'), '-o', resolve(work, 'base-test')])
      execFileSync(resolve(work, 'base-test'), [], { timeout: 10_000 })
      execFileSync('cc', ['-std=c11', '-Wall', '-Wextra', '-Werror', '-I', at('sdk/elemod/core'), at('sdk/elemod/core/tests/settings-test.c'), '-o', resolve(work, 'settings-test')])
      execFileSync(resolve(work, 'settings-test'), [], { timeout: 10_000 })
    } finally { rmSync(work, { recursive: true, force: true }) }
  })

  it.skipIf(!recordedToolchain())('rebuilds the recorded packages from source', () => {
    const work = mkdtempSync(resolve(tmpdir(), 'modwerk-base-build-'))
    try {
      const { packages } = buildBase('digitakt', work)
      const sha = text => createHash('sha256').update(text).digest('hex')
      expect(packages.map(p => sha(p.text)).sort()).toEqual(Object.values(binding.packages).sort())
    } finally { rmSync(work, { recursive: true, force: true }) }
  }, 60_000)
})
