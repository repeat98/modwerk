// SPDX-License-Identifier: GPL-3.0-or-later
// npm run elemod:base -- digitakt [--out DIR] [--write]
// Builds a Modwerk elemod base from its source with Modwerk's own toolchain path (m68k-elf as/gcc/ld -r, then
// scripts/elemod-elf.mjs), one package per OS that sdk/machines/<id>/base/base.json lists, and the code-free companion
// packages it names. No firmware is read: sites carry addresses, lengths and SHA-256 guards, and every displaced stock
// instruction is re-authored in the sources. Each package is checked against the machine's interface.json and against
// the reference package's fields base.json's reference.keeps lists, and identified by its SHA-256 in
// sdk/machines/<id>/base-binding.json. Without --write a different identity fails; --write records the packages in
// sdk/imports/packages/modwerk-base-<id>/ and the binding. --out keeps a copy of each package in a new folder.
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { explicitSite } from '../src/catalog/elemod-site-recipe.ts'
import { LINK_DEVICES, parseElemod } from '../src/engine/elektron/elemod.ts'
import { elfToElemod, readElemodElf } from './elemod-elf.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const sha = bytes => createHash('sha256').update(bytes).digest('hex')
const cross = process.env.MODWERK_CROSS ?? 'm68k-elf-'
const tool = (name, args) => execFileSync(cross + name, args, { encoding: 'utf8', maxBuffer: 8 << 20 })
const CFLAGS = ['-mcpu=54455', '-O2', '-ffreestanding', '-fno-builtin', '-nostdlib', '-fno-pic', '-fno-pie', '-fomit-frame-pointer', '-fno-asynchronous-unwind-tables', '-fno-unwind-tables', '-Wall', '-Wextra', '-Werror', '-std=c11']
const LD_SCRIPT = `SECTIONS {
.boot 0 : { *(.boot) }
.run 0 : { *(.run) *(.text) *(.text.*) *(.data) *(.data.*) *(.rodata) *(.rodata.*) *(.sdata) *(.sdata.*) }
.fast 0 : { *(.fast) }
.bss 0 : { *(.bss) *(.bss.*) *(.sbss) *(.sbss.*) *(COMMON) }
/DISCARD/ : { *(.comment) *(.note*) *(.gnu.attributes) }
}\n`

/** A base.json value for one OS: as given, or its {"1.53": …, "1.54": …} entry. */
const forOs = (value, os) => value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).every(k => /^\d+\.\d+$/.test(k)) ? value[os] : value
export const packageText = module => JSON.stringify(module, null, 1) + '\n'

/** Problems with a built base: the interface's events, tables and exports it lacks, the reference fields it drops. */
export function baseProblems(module, iface, reference, keeps) {
  const problems = []
  for (const name of [...iface.events.map(e => e.name), ...iface.tables.map(t => t.name)]) if (!module.collections[name]) problems.push(`declares no ${name}`)
  for (const { name } of iface.exports) if (!module.exports.includes(name)) problems.push(`exports no ${name}`)
  for (const claim of iface.claims) if (!module.resources.names.includes(claim)) problems.push(`claims no ${claim}`)
  for (const key of keeps) {
    const want = reference[key], have = module[key]
    const held = Array.isArray(want) ? want.every(item => (have ?? []).some(h => JSON.stringify(h) === JSON.stringify(item)))
      : want && typeof want === 'object' ? Object.entries(want).every(([k, v]) => JSON.stringify(have?.[k]) === JSON.stringify(v))
        : have === want
    if (!held) problems.push(`does not keep the reference's ${key}`)
  }
  return problems
}

export function buildBase(machine, scratch) {
  const folder = resolve(root, 'sdk/machines', machine, 'base'), config = JSON.parse(readFileSync(resolve(folder, 'base.json'), 'utf8'))
  const device = LINK_DEVICES.find(d => d.machine === machine)
  if (!device) throw new Error(`No linker profile for ${machine}`)
  const iface = JSON.parse(readFileSync(resolve(root, config.interface), 'utf8'))
  const refBytes = readFileSync(resolve(root, config.reference.file))
  if (sha(refBytes) !== config.reference.sha256) throw new Error(`${config.reference.file} is not the file base.json names`)
  const reference = JSON.parse(refBytes.toString('utf8'))
  const source = path => resolve(path.startsWith('sdk/') ? root : folder, path)
  const document = { id: config.id, version: config.version, name: config.title, presentation: { summary: config.summary }, category: 'system', author: { github: config.author }, license: { spdx: config.license }, compatibility: { requires: [], conflicts: [] } }
  const build = { weak: [], subscribe: config.subscribe, contribute: [], collections: config.collections, copied: [], regions: [], claims: config.claims, requires: [] }
  const packages = []
  for (const os of config.releases) {
    const release = device.releases.find(r => r.version === os)
    if (!release) throw new Error(`No stock identity for ${machine} ${os}`)
    const work = resolve(scratch, os)
    mkdirSync(work, { recursive: true })
    const defsym = Object.entries(config.defsym).map(([name, value]) => [name, forOs(value, os)])
    const objects = config.sources.map((path, index) => {
      const object = resolve(work, index + '.o')
      if (path.endsWith('.c')) tool('gcc', [...CFLAGS, ...(config.cflags ?? []), '-I', resolve(root, 'sdk/elemod/core'), '-I', folder, '-c', source(path), '-o', object])
      else tool('as', ['-mcpu=54455', ...config.asflags, ...defsym.flatMap(([n, v]) => ['--defsym', `${n}=${v}`]), '-o', object, source(path)])
      return object
    })
    const compiled = objects.filter((_, i) => config.sources[i].endsWith('.c'))
    execFileSync('python3', ['-B', resolve(root, 'sdk/runtime/m68k_codegen.py'), '--objdump', cross + 'objdump', ...compiled], { stdio: 'inherit' })
    const script = resolve(work, 'base.ld'), object = resolve(work, 'base.o')
    writeFileSync(script, LD_SCRIPT)
    // C code reaches firmware through defsym names too: give ld the ones the objects leave undefined, and only those.
    tool('ld', ['-r', '-d', '-T', script, '-o', object, ...objects])
    const unresolved = new Set(readElemodElf(readFileSync(object)).symbols.filter(s => s.name && !s.section).map(s => s.name))
    tool('ld', ['-r', '-d', '-T', script, ...defsym.filter(([n]) => unresolved.has(n)).flatMap(([n, v]) => ['--defsym', `${n}=${v}`]), '-o', object, ...objects])
    const target = { device: device.key, product: device.name, os, syx_sha256: release.syxSha256, section3_sha256: release.mainSha256, section3_len: release.mainLength }
    const module = elfToElemod(readFileSync(object), document, build, target)
    module.sites = config.sites.map(site => explicitSite(Object.fromEntries(Object.entries(site).map(([k, v]) => [k, forOs(v, os)]))))
    for (const site of module.sites) for (const [, , to] of site.relocs) {
      const name = to.slice(4)
      if (!Object.hasOwn(module.symbols, name)) throw new Error(`${os}: site ${site.addr} jumps to ${name}, which the base does not define`)
    }
    parseElemod(module)
    const problems = baseProblems(module, iface, reference, config.reference.keeps)
    if (problems.length) throw new Error(`The ${os} base ${problems.join('; ')}`)
    packages.push({ os, file: `modwerk-base-${machine}-${os}.elemod`, text: packageText(module), module })
    for (const companion of config.companions ?? []) {
      const empty = { elemod: 2, id: companion.id, version: companion.version, title: companion.title, description: companion.summary, category: 'system', author: config.author, license: config.license, target,
        sections: {}, symbols: {}, exports: [], imports: [], weak: [], relocs: [], sites: [], collections: {}, contribute: [], copied: [],
        resources: { regions: [], names: [], core: config.version }, requires: ['core'], conflicts: companion.conflicts ?? [], signature: null }
      parseElemod(empty)
      packages.push({ os, file: `${companion.id}-${companion.version}-os${os}.elemod`, text: packageText(empty), module: empty, companion: true })
    }
  }
  return { config, packages }
}

function main() {
  const args = process.argv.slice(2), machine = args[0], at = name => args.includes(name) ? args[args.indexOf(name) + 1] : undefined
  if (!machine || machine.startsWith('-')) { console.error('usage: npm run elemod:base -- <machine> [--out NEW-DIR] [--write]'); process.exit(2) }
  const scratch = mkdtempSync(resolve(tmpdir(), 'modwerk-base-'))
  try {
    const { config, packages } = buildBase(machine, scratch)
    const stored = resolve(root, 'sdk/imports/packages', `modwerk-base-${machine}`), bindingPath = resolve(root, 'sdk/machines', machine, 'base-binding.json')
    const named = packages.map(p => ({ ...p, sha256: sha(p.text), name: p.companion ? p.file : `modwerk-base-${machine}-${sha(p.text).slice(0, 8)}.elemod` }))
    const binding = {
      schema: 1, version: config.version,
      identities: Object.fromEntries(named.filter(p => !p.companion).map(p => [p.os, p.sha256])),
      packages: Object.fromEntries(named.map(p => [p.name, p.sha256])),
      sections: Object.fromEntries(named.filter(p => !p.companion).map(p => [p.os, Object.fromEntries(Object.entries(p.module.sections).map(([n, s]) => [n, s.len ?? s.size]))])),
      sites: config.sites.length,
      built: { toolchain: { gcc: tool('gcc', ['-dumpfullversion']).trim(), binutils: tool('as', ['--version']).split('\n')[0] } },
    }
    for (const p of named) console.log(`${p.os}  ${p.name}  ${p.sha256}`)
    const out = at('--out')
    if (out) {
      if (existsSync(out)) throw new Error(`--out must be a new folder: ${out}`)
      mkdirSync(out, { recursive: true })
      for (const p of named) writeFileSync(resolve(out, p.name), p.text)
    }
    if (args.includes('--write')) {
      mkdirSync(stored, { recursive: true })
      for (const p of named) writeFileSync(resolve(stored, p.name), p.text)
      writeFileSync(bindingPath, JSON.stringify(binding, null, 2) + '\n')
      console.log(`Recorded in ${bindingPath.slice(root.length + 1)} and ${stored.slice(root.length + 1)}/`)
      return
    }
    const recorded = existsSync(bindingPath) ? JSON.parse(readFileSync(bindingPath, 'utf8')) : {}
    if (JSON.stringify(recorded.packages) !== JSON.stringify(binding.packages))
      throw new Error(`This build differs from ${bindingPath.slice(root.length + 1)}: rebuild with the recorded toolchain, or record a deliberate change with --write.`)
    console.log(`Matches ${bindingPath.slice(root.length + 1)}`)
  } finally { rmSync(scratch, { recursive: true, force: true }) }
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  try { main() } catch (error) { console.error(error.message); process.exit(1) }
}
