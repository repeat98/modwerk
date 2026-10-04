// SPDX-License-Identifier: GPL-3.0-or-later
// Run inside the source-only container. The output is a recipe; stock-dependent
// patches and FAST AUDIO fixups are materialized by the local browser engine.
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseMachineProfile } from '../src/devices/machine-contract.ts'
import { parseModwerkModule, parseElemodBuild } from '../src/catalog/module-contract-v3.ts'
import { resolveModuleFile } from '../src/catalog/module-folder.ts'
import { LINK_DEVICES, parseElemod } from '../src/engine/elektron/elemod.ts'
import { elfToElemod } from './elemod-elf.mjs'
import { buildCoreProbes } from './build-elemod-cores.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const args = process.argv.slice(2), outputIndex = args.indexOf('--output'), commitIndex = args.indexOf('--source-commit')
if (outputIndex < 0 || !args[outputIndex + 1] || commitIndex < 0 || !/^[a-f0-9]{40}$/.test(args[commitIndex + 1] ?? '')) throw new Error('Usage: build-elemod-packages.mjs --output DIR --source-commit SHA')
const output = resolve(args[outputIndex + 1]), sourceCommit = args[commitIndex + 1]
const sha = value => createHash('sha256').update(value).digest('hex')
const cross = process.env.MODWERK_CROSS ?? 'm68k-elf-'
const run = (tool, args) => execFileSync(cross + tool, args, { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 })
const json = async path => JSON.parse(await readFile(path, 'utf8'))
const machines = []
for (const item of await readdir(resolve(root, 'sdk/machines'), { withFileTypes: true })) if (item.isDirectory()) machines.push(parseMachineProfile(await json(resolve(root, 'sdk/machines', item.name, 'machine.json'))))
const compiler = { gcc: run('gcc', ['--version']).split('\n')[0], assembler: run('as', ['--version']).split('\n')[0], linker: run('ld', ['--version']).split('\n')[0], node: process.version }
const cflags = ['-mcpu=54455', '-O2', '-ffreestanding', '-fno-builtin', '-nostdlib', '-fno-pic', '-fno-pie', '-fomit-frame-pointer', '-fno-asynchronous-unwind-tables', '-fno-unwind-tables', '-Wall']
const ldScript = `SECTIONS {
.boot 0 : { *(.boot) }
.run 0 : { *(.run) *(.text) *(.text.*) *(.data) *(.data.*) *(.rodata) *(.rodata.*) *(.sdata) *(.sdata.*) }
.fast 0 : { *(.fast) }
.bss 0 : { *(.bss) *(.bss.*) *(.sbss) *(.sbss.*) *(COMMON) }
/DISCARD/ : { *(.comment) *(.note*) *(.gnu.attributes) }
}\n`
const artifacts = []
async function inventory(folder, prefix = '') {
  const sources = {}
  for (const entry of (await readdir(folder, { withFileTypes: true })).sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0)) {
    if (entry.name === '__pycache__' || entry.name === '.DS_Store') continue
    const path = prefix + entry.name
    if (entry.isSymbolicLink() || !entry.isFile() && !entry.isDirectory()) throw new Error('Only regular source files: ' + path)
    if (/\.(bin|syx|elemod|exe|dll|so|dylib|zip|img|hex|o|elf)$/i.test(path)) throw new Error('Binary input is prohibited: ' + path)
    if (entry.isDirectory()) Object.assign(sources, await inventory(resolve(folder, entry.name), path + '/'))
    else sources[path] = sha(await readFile(resolve(folder, entry.name)))
  }
  return sources
}
// This generated assembly is original glue, made solely from address metadata.
function fastStubs(derive) {
  const entries = [...new Set(derive.callSites.map(site => Number(site.target)))].sort((a, b) => a - b)
  const hex = n => n.toString(16).padStart(8, '0'), lo = Number(derive.block[0]), dst = Number(derive.sram[0])
  const lines = ['.section .run, "ax"', '.globl stub_tab, stub_count', '.equ stub_count, ' + entries.length]
  for (const address of entries) lines.push('.globl r_' + hex(address) + ', rp_' + hex(address), 'r_' + hex(address) + ': move.l rp_' + hex(address) + '.l, -(%sp)', 'rts')
  lines.push('.balign 4')
  for (const address of entries) lines.push('rp_' + hex(address) + ': .long 0x' + hex(address))
  lines.push('stub_tab:')
  for (const address of entries) lines.push('.long rp_' + hex(address) + ', 0x' + hex(address) + ', 0x' + hex(dst + address - lo))
  return lines.join('\n') + '\n'
}
await mkdir(output, { recursive: true })
for (const machine of machines.filter(item => item.sdk?.platform === 'elemod' && ['preview', 'available'].includes(item.status))) {
  const device = LINK_DEVICES.find(item => item.machine === machine.id)
  if (!device) throw new Error('No linker profile for ' + machine.id)
  const folderRoot = resolve(root, machine.sdk.modules)
  for (const entry of (await readdir(folderRoot, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
    if (!entry.isDirectory() || entry.name.startsWith('_')) continue
    const folder = resolve(folderRoot, entry.name)
    const document = parseModwerkModule(await json(await resolveModuleFile(folder, 'modwerk.module.json')), machines)
    if (document.machine !== machine.id || document.id !== entry.name || document.exclusive) throw new Error('Expected a linkable module in its machine folder')
    const build = parseElemodBuild(await json(await resolveModuleFile(folder, document.platform.build)), document)
    const sources = await inventory(folder), sourceTreeSha256 = sha(JSON.stringify(sources))
    for (const [release, port] of Object.entries(build.releases)) {
      const identity = device.releases.find(item => item.version === release)
      if (!identity) throw new Error('No stock identity for ' + machine.id + ' ' + release)
      const work = resolve('/tmp', 'modwerk-compile', machine.id, document.id, release)
      await mkdir(work, { recursive: true })
      const defines = Object.entries({ ...build.defsym, ...port.defsym }).flatMap(([name, value]) => ['--defsym', name + '=' + value])
      const extraFlags = [...build.cflags, ...port.cflags]
      if (extraFlags.some(flag => !/^(-D[A-Za-z_][A-Za-z0-9_]*(=[A-Za-z0-9_+.-]+)?|-O[0-3sg]|-std=(gnu|c)(99|11|17|23)|-fno-(builtin|pic|pie|omit-frame-pointer))$/.test(flag))) throw new Error('Unsupported compiler flag')
      const inputs = []
      for (const [index, source] of build.sources.entries()) {
        const path = await resolveModuleFile(folder, source), object = resolve(work, index + '.o')
        if (source.endsWith('.c')) run('gcc', [...cflags, ...extraFlags, '-I', resolve(folder, 'src'), '-c', path, '-o', object])
        else if (source.endsWith('.S')) run('gcc', [...cflags, ...extraFlags, '-Wa,-mcpu=54455', ...defines.filter((_, i) => i % 2).map(define => '-Wa,--defsym,' + define), '-I', resolve(folder, 'src'), '-c', path, '-o', object])
        else run('as', ['-mcpu=54455', '-I', resolve(folder, 'src'), ...defines, '-o', object, path])
        inputs.push(object)
      }
      const generated = []
      if (build.derive) {
        if (build.derive.kind !== 'fast_audio') throw new Error('Unsupported local derivation: ' + build.derive.kind)
        if (!build.derive.releases.includes(release)) throw new Error('Missing local derivation port for ' + release)
        generated.push(fastStubs(build.derive))
      }
      if (Object.keys(build.strings).length) generated.push(Object.entries(build.strings).map(([name, value]) => '.section .run, "ax"\n.globl ' + name + '\n' + name + ': .asciz ' + JSON.stringify(value) + '\n.balign 2\n').join(''))
      for (const [index, text] of generated.entries()) {
        const path = resolve(work, 'generated-' + index + '.s'), object = path + '.o'
        await writeFile(path, text)
        run('as', ['-mcpu=54455', '-o', object, path]); inputs.push(object)
      }
      const script = resolve(work, 'mod.ld'), object = resolve(work, 'module.o')
      await writeFile(script, ldScript)
      run('ld', ['-r', '-d', '-T', script, '-o', object, ...inputs])
      const target = { device: device.key, product: device.name, os: release, syx_sha256: identity.syxSha256, section3_sha256: identity.mainSha256, section3_len: identity.mainLength }
      const module = elfToElemod(await readFile(object), document, build, target)
      const sites = port.sites
      for (const site of sites) if (!Object.hasOwn(module.symbols, site.target) && !module.imports.includes(site.target)) module.imports.push(site.target)
      module.imports.sort()
      parseElemod(module)
      const plan = { schemaVersion: 1, machine: machine.id, id: document.id, version: document.version, release, module, sites, derive: build.derive,
        provenance: { sourceCommit, sourceTreeSha256, sources, compiler, cflags: [...cflags, ...extraFlags], generatedSha256: generated.map(sha), elfSha256: sha(await readFile(object)) } }
      const path = machine.id + '/' + document.id + '/' + release + '.json', bytes = JSON.stringify(plan, null, 2) + '\n'
      await mkdir(dirname(resolve(output, path)), { recursive: true }); await writeFile(resolve(output, path), bytes)
      artifacts.push({ machine: machine.id, id: document.id, version: document.version, release, path, sha256: sha(bytes), sourceTreeSha256 })
      console.log('Compiled ' + machine.id + '/' + document.id + ' OS ' + release + '; stock-dependent work stays local')
    }
  }
}
// Written last: a failed compilation never creates a complete package inventory.
for (const stage of ['boot-probe', 'ui-hook-probe', 'event-hook-probe']) await buildCoreProbes({ root, output, sourceCommit, compiler, cflags, ldScript, run, stage })
await writeFile(resolve(output, 'elemod-build.json'), JSON.stringify({ schemaVersion: 1, sourceCommit, compiler, artifacts }, null, 2) + '\n')
