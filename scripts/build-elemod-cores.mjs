// SPDX-License-Identifier: GPL-3.0-or-later
// Source-only development probes, separate from deployable core packages.
import { execFileSync } from 'node:child_process'
import { readFile, writeFile, mkdir, readdir, stat } from 'node:fs/promises'
import { resolve, dirname } from 'node:path'
import { createHash } from 'node:crypto'
import { LINK_DEVICES, parseElemod } from '../src/engine/elektron/elemod.ts'
import { elfToElemod, readElemodElf } from './elemod-elf.mjs'

export async function buildCoreProbes({ root, output, scratch, sourceCommit, compiler, cflags, ldScript, run, stage = 'boot-probe' }) {
  const variants = {
    'boot-probe': { prefix: 'cores', manifest: 'probe.json', inventory: 'core-build.json', version: '0.1.0-dev', name: 'Modwerk boot probe' },
    'ui-hook-probe': { prefix: 'ui-cores', manifest: 'ui-probe.json', inventory: 'core-ui-build.json', version: '0.2.0-dev', name: 'Modwerk UI hook probe' },
    'event-hook-probe': { prefix: 'event-cores', manifest: 'event-probe.json', inventory: 'core-event-build.json', version: '0.3.0-dev', name: 'Modwerk common event probe' },
  }
  if (!variants[stage]) throw new Error('Unknown core development stage')
  const { prefix, manifest, inventory, version, name } = variants[stage]
  const commonHooks = stage === 'event-hook-probe', uiHooks = stage !== 'boot-probe'
  const sha = value => createHash('sha256').update(value).digest('hex')
  const shared = resolve(root, 'sdk/elemod/core'), artifacts = [], sourceFiles = {}
  async function scan(folder, prefix = '') {
    for (const entry of (await readdir(folder, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
      const path = prefix + entry.name
      if (entry.isSymbolicLink() || !entry.isFile() && !entry.isDirectory()) throw new Error('Core needs regular source files')
      if (entry.isDirectory()) await scan(resolve(folder, entry.name), path + '/')
      else {
        if (!/\.(c|h|s|py|md)$/.test(path)) throw new Error('Unexpected core source file: ' + path)
        sourceFiles[path] = sha(await readFile(resolve(folder, entry.name)))
      }
    }
  }
  await scan(shared)
  for (const device of LINK_DEVICES) {
    // Machines whose core is an imported upstream package (Digitakt II) have no Modwerk probe folder.
    if (!await stat(resolve(root, 'sdk', device.machine, 'core')).then(item => item.isDirectory(), () => false)) continue
    const specBytes = await readFile(resolve(root, 'sdk', device.machine, 'core', manifest))
    const spec = JSON.parse(specBytes.toString('utf8'))
    if (spec.schemaVersion !== 1 || spec.machine !== device.machine || spec.stage !== stage || spec.providesInterface !== false || spec.version !== version || Object.keys(spec.releases).sort().join() !== device.releases.map(r => r.version).sort().join()) throw new Error('Invalid draft core probe')
    const defs = device.machine === 'digitone' ? ['-DMODWERK_DIGITONE'] : []
    const work = resolve(scratch, 'core', device.machine)
    await mkdir(work, { recursive: true })
    // Host tests execute only inside the network-disabled, unprivileged wrapper.
    const hostTest = resolve('/test', device.machine + '-event-bus-test')
    execFileSync('gcc', ['-std=c11', '-O2', '-Wall', '-Wextra', '-Werror', ...defs, '-I', shared, resolve(shared, 'event-bus.c'), resolve(shared, 'tests/event-bus-test.c'), '-o', hostTest])
    execFileSync(hostTest, [], { timeout: 10_000 })
    const bus = resolve(work, 'event-bus.o')
    run('gcc', [...cflags, '-std=c11', '-Wextra', '-Werror', ...defs, '-I', shared, '-c', resolve(shared, 'event-bus.c'), '-o', bus])
    const settings = resolve(work, 'settings-api.o')
    if (commonHooks) {
      const settingsTest = resolve('/test', device.machine + '-settings-test')
      execFileSync('gcc', ['-std=c11', '-O2', '-Wall', '-Wextra', '-Werror', '-I', shared, resolve(shared, 'tests/settings-test.c'), '-o', settingsTest])
      execFileSync(settingsTest, [], { timeout: 10_000 })
      run('gcc', [...cflags, '-std=c11', '-Wextra', '-Werror', '-I', shared, '-c', resolve(shared, 'settings-api.c'), '-o', settings])
    }
    for (const release of device.releases) {
      const config = spec.releases[release.version], boot = config.boot
      if (boot.addr !== '0x40000538' || boot.len !== 6 || !/^0x[0-9a-f]{8}$/.test(boot.target) || !/^[a-f0-9]{64}$/.test(boot.stockSha256) || Number(boot.target) < device.mainLoad || Number(boot.target) >= device.mainLoad + release.mainLength) throw new Error('Invalid guarded boot site')
      const object = resolve(work, release.version + '.o'), bootObject = object + '.boot.o', script = object + '.ld'
      run('as', ['-mcpu=54455', '--defsym', 'mw_stock_boot=' + boot.target, '-o', bootObject, resolve(shared, 'boot.s')])
      const hookObjects = [], stockCallBindings = {}, routineDefinitions = [], stockResumes = [], stockRoutineBindings = {}
      if (uiHooks) {
        if (!config.hooks || Object.keys(config.hooks).sort().join() !== 'draw,enc,key,tick') throw new Error('Invalid UI hook set')
        const definitions = []
        for (const [event, site] of Object.entries(config.hooks)) {
          if (site.len !== 6 || !/^0x[0-9a-f]{8}$/.test(site.addr) || !/^0x[0-9a-f]{8}$/.test(site.target) || !/^[a-f0-9]{64}$/.test(site.stockSha256) || Number(site.addr) < device.mainLoad || Number(site.addr) + 6 > device.mainLoad + release.mainLength || Number(site.target) < device.mainLoad || Number(site.target) >= device.mainLoad + release.mainLength) throw new Error('Invalid guarded UI hook')
          definitions.push('--defsym', 'mw_stock_' + event + '=' + site.target)
          stockCallBindings['mw_stock_' + event] = { addr: site.addr, target: site.target }
        }
        const hooks = object + '.ui.o'
        run('as', ['-mcpu=54455', ...definitions, '-o', hooks, resolve(shared, 'ui-hooks.s')])
        hookObjects.push(hooks)
      }
      if (commonHooks) {
        if (!config.resumes || Object.keys(config.resumes).sort().join() !== 'render_in,render_out,settings' || !config.stockRoutines || Object.keys(config.stockRoutines).sort().join() !== 'mw_stock_allocate,mw_stock_function_manager,mw_stock_item_construct,mw_stock_menu_append') throw new Error('Invalid common event bindings')
        const definitions = []
        for (const [event, site] of Object.entries(config.resumes)) {
          if (site.len !== 6 || !/^0x[0-9a-f]{8}$/.test(site.addr) || !/^[a-f0-9]{64}$/.test(site.stockSha256) || Number(site.addr) < device.mainLoad || Number(site.addr) + 6 >= device.mainLoad + release.mainLength) throw new Error('Invalid event resume site')
          definitions.push('--defsym', 'mw_continue_' + event + '=' + (Number(site.addr) + site.len))
          stockResumes.push({ symbol: 'mw_resume_' + event, ...site })
        }
        for (const [symbol, binding] of Object.entries(config.stockRoutines)) {
          if (!/^0x[0-9a-f]{8}$/.test(binding.addr) || !Number.isSafeInteger(binding.len) || binding.len < 2 || binding.len > 256 || !/^[a-f0-9]{64}$/.test(binding.stockSha256) || Number(binding.addr) < device.mainLoad || Number(binding.addr) + binding.len > device.mainLoad + release.mainLength) throw new Error('Invalid stock helper binding')
          routineDefinitions.push('--defsym', symbol + '=' + binding.addr)
          stockRoutineBindings[symbol] = binding
        }
        const hooks = object + '.events.o'
        run('as', ['-mcpu=54455', ...definitions, '-o', hooks, resolve(shared, 'event-hooks.s')])
        hookObjects.push(hooks, settings)
      }
      await writeFile(script, ldScript)
      run('ld', ['-r', '-d', '-T', script, ...routineDefinitions, '-o', object, bootObject, bus, ...hookObjects])
      const events = ['ev_tick', 'ev_draw', 'ev_key', 'ev_enc', 'ev_settings', 'ev_render_in', 'ev_render_out', ...(device.machine === 'digitone' ? ['ev_voice_on', 'ev_hold'] : [])]
      const build = { weak: [], subscribe: [], contribute: [], collections: Object.fromEntries(events.map(event => [event, 4])), copied: [], regions: [], claims: [], requires: [] }
      const document = { id: 'core', version: spec.version, name, presentation: { summary: 'Development probe; does not provide the full machine core interface.' }, category: 'system', author: { github: 'repeat98' }, license: { spdx: 'GPL-3.0-or-later' }, compatibility: { requires: [], conflicts: [] } }
      const target = { device: device.key, os: release.version, syx_sha256: release.syxSha256, section3_sha256: release.mainSha256 }
      const module = elfToElemod(await readFile(object), document, build, target)
      parseElemod(module)
      const sources = { ...sourceFiles, ['sdk/' + device.machine + '/core/' + manifest]: sha(specBytes) }
      const plan = { schemaVersion: 1, machine: device.machine, id: 'core', version: spec.version, release: release.version, stage: spec.stage, providesInterface: false,
        module, sites: [{ addr: boot.addr, len: boot.len, stockSha256: boot.stockSha256, op: 'jsr', target: 'mw_boot' }, ...(uiHooks ? Object.entries(config.hooks).map(([event, site]) => ({ addr: site.addr, len: site.len, stockSha256: site.stockSha256, op: 'jsr', target: 'mw_hook_' + event })) : []), ...(commonHooks ? Object.entries(config.resumes).map(([event, site]) => ({ ...site, op: 'jsr', target: 'mw_hook_' + event })) : [])], derive: null, stockBootTarget: boot.target, ...(uiHooks ? { stockCallBindings } : {}), ...(commonHooks ? { stockResumes, stockRoutineBindings } : {}),
        provenance: { sourceCommit, compiler, sources, sourceTreeSha256: sha(JSON.stringify(sources)), elfSha256: sha(await readFile(object)) } }
      const path = prefix + '/' + device.machine + '/' + release.version + '.json', bytes = JSON.stringify(plan, null, 2) + '\n'
      await mkdir(dirname(resolve(output, path)), { recursive: true }); await writeFile(resolve(output, path), bytes)
      artifacts.push({ machine: device.machine, release: release.version, path, sha256: sha(bytes) })
      console.log('Compiled ' + stage + ' for ' + device.machine + ' ' + release.version + '; interface/downloads remain unavailable')
    }
  }
  let syntheticFixtures
  if (commonHooks) {
    const path = 'core-event-fixtures.json', object = resolve(scratch, 'event-fixtures.o')
    run('as', ['-mcpu=54455', '-o', object, resolve(shared, 'tests/event-fixtures.s')])
    const elf = readElemodElf(await readFile(object)), section = elf.sections.find(section => section.name === '.run')
    const instructions = Object.fromEntries(['settings', 'render_in', 'render_out'].map(event => {
      const symbol = elf.symbols.find(symbol => symbol.name === 'fixture_' + event)
      if (!symbol || symbol.section !== section?.index || symbol.value + 6 > section.data.length) throw new Error('Invalid synthetic CPU fixture')
      return [event, section.data.subarray(symbol.value, symbol.value + 6).toString('hex')]
    }))
    const at = name => elf.symbols.find(symbol => symbol.name === 'fixture_' + name)?.value
    const emacHarness = { set: section.data.subarray(at('emac_set'), at('emac_get')).toString('hex'), get: section.data.subarray(at('emac_get'), at('end')).toString('hex') }
    if (!emacHarness.set || !emacHarness.get) throw new Error('Missing synthetic EMAC helpers')
    const bytes = JSON.stringify({ schemaVersion: 1, sourceCommit, synthetic: true, instructions, emacHarness }, null, 2) + '\n'
    await writeFile(resolve(output, path), bytes)
    syntheticFixtures = { path, sha256: sha(bytes) }
  }
  await writeFile(resolve(output, inventory), JSON.stringify({ schemaVersion: 1, sourceCommit, stage, providesInterface: false, artifacts, ...(syntheticFixtures ? { syntheticFixtures } : {}) }, null, 2) + '\n')
}
