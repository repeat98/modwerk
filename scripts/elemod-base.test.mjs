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

describe('Digitone mk1 base', () => {
  const dn = JSON.parse(readFileSync(at('sdk/machines/digitone/base-binding.json'), 'utf8'))
  const dnConfig = JSON.parse(readFileSync(at('sdk/machines/digitone/base/base.json'), 'utf8'))
  const dnFile = name => at(`sdk/imports/packages/modwerk-base-digitone/${name}`)
  const dnRecorded = () => { try { return execFileSync('m68k-elf-gcc', ['-dumpfullversion'], { encoding: 'utf8' }).trim() === dn.built.toolchain.gcc && execFileSync('m68k-elf-as', ['--version'], { encoding: 'utf8' }).split('\n')[0] === dn.built.toolchain.binutils } catch { return false } }

  it('keeps the packages its binding names, each a base for interface 2.2 in the 128 KiB area', () => {
    const iface = JSON.parse(readFileSync(at(dnConfig.interface), 'utf8')), reference = JSON.parse(readFileSync(at(dnConfig.reference.file), 'utf8'))
    expect(Object.keys(dn.packages)).toHaveLength(2)
    for (const [name, sha256] of Object.entries(dn.packages)) {
      const bytes = readFileSync(dnFile(name)), module = JSON.parse(bytes.toString('utf8'))
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(sha256)
      expect(packageText(module)).toBe(bytes.toString('utf8'))
      parseElemod(module)
      expect(dn.identities[module.target.os]).toBe(sha256)
      expect(module.version).toBe('3.0')   // below 4.0: the 128 KiB area interface.json names
      expect(baseProblems(module, iface, reference, dnConfig.reference.keeps)).toEqual([])
      expect(module.sites).toHaveLength(90)
      // project save and new hook the routines' calls; their entries stay free for modules (KitBank)
      expect(module.sites.map(s => s.addr)).not.toContain('0x4000eb10')
      expect(module.sites.map(s => s.addr)).not.toContain('0x4001570e')
    }
    expect(iface.memory.area).toBe('0x47be0000-0x47c00000')
  })

  it('lists every site in its hook registry', () => {
    const events = JSON.parse(readFileSync(at('sdk/machines/digitone/events.json'), 'utf8')).events
    const iface = JSON.parse(readFileSync(at(dnConfig.interface), 'utf8'))
    expect(events.map(e => e.event)).toEqual([...iface.events.map(e => e.name), ...iface.tables.map(t => t.name)])
    const listed = events.flatMap(e => e.kind === 'table' ? e.sites.map(s => s.site) : e.rides ? [] : [e.site])
    expect(new Set(listed).size).toBe(listed.length)
    expect([...listed, '0x40000538'].map(String).sort()).toEqual(dnConfig.sites.map(s => String(s.addr)).sort())
  })

  it('links KitBank on OS 1.44 and the base alone on OS 1.43', () => {
    for (const [os, singles] of [['1.43', 0], ['1.44', 1]]) {
      const core = Object.keys(dn.packages).find(n => dn.packages[n] === dn.identities[os])
      const o = linkAll({ machine: 'digitone', pairs: true, core: dnFile(core) }).oses[0]
      expect([o.os, o.singles.ok, o.singles.failed, Object.values(o.cores)]).toEqual([os, singles, [], [1]])
    }
  }, 60_000)

  it.skipIf(!has('cc'))('runs the C parts on the host', () => {
    const work = mkdtempSync(resolve(tmpdir(), 'modwerk-base-test-'))
    try {
      execFileSync('cc', ['-std=c11', '-Wall', '-Wextra', '-Werror', '-DMODWERK_DIGITONE', '-I', at('sdk/elemod/core'), '-I', at('sdk/machines/digitone/base'), at('sdk/machines/digitone/base/tests/base-test.c'), '-o', resolve(work, 'base-test')])
      execFileSync(resolve(work, 'base-test'), [], { timeout: 10_000 })
    } finally { rmSync(work, { recursive: true, force: true }) }
  })

  it.skipIf(!dnRecorded())('rebuilds the recorded packages from source', () => {
    const work = mkdtempSync(resolve(tmpdir(), 'modwerk-base-build-'))
    try {
      const { packages } = buildBase('digitone', work)
      const sha = text => createHash('sha256').update(text).digest('hex')
      expect(packages.map(p => sha(p.text)).sort()).toEqual(Object.values(dn.packages).sort())
    } finally { rmSync(work, { recursive: true, force: true }) }
  }, 60_000)
})
