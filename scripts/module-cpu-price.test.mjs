import { afterEach, describe, expect, it } from 'vitest'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseModuleCpuPrice, parseModuleDocument } from '../src/catalog/module-contract.ts'
import { CPU_PRICE_PENDING_REASON, cReserved0, cpuPriceProblems, cpuPriceStatus, glueReserved0, machineDescriptors, parseCpuPricePending, portGlue, readCpuPricePending } from './module-cpu-price.mjs'

const repo = fileURLToPath(new URL('../', import.meta.url))
const roots = []
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }) })
function fixture(files) {
  const root = mkdtempSync(join(tmpdir(), 'cpu-price-'))
  roots.push(root)
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true })
    writeFileSync(join(root, path), typeof text === 'string' ? text : JSON.stringify(text))
  }
  return root
}
const render = value => ({ value, unit: 'percent-of-frame', measure: 'machine-render', tool: 'npm run device -- do guard', date: '2026-11-20', conditions: 'MKII, base 0.7.2, one track, eight voices held, five minutes', source: 'TESTING.md' })
const share = value => ({ value, unit: 'percent-of-frame', measure: 'frame-interrupt', tool: 'npm run device:price -- echo', date: '2026-11-20', conditions: 'MKII, base 0.7.2, four FLEX tracks, the effect on T1 at its defaults', source: 'TESTING.md' })
const module = (id, location, cpuPrice) => ({ id, compatibility: { location }, resources: cpuPrice ? { cpuPrice } : {} })
const machineC = reserved => `#include "modwerk_events.h"\n#define WAVE_PRICE 9u\nconst struct modwerk_machine wave = {\n    .abi = MODWERK_MACHINE_ABI, .label = "WAVE",\n    .render = wave_render,${reserved}\n};\n`
const machineFolder = reserved => ({
  'sdk/octatrack/modules/wave/runtime.json': { schema: 1, contribute: [{ to: 'ot_machines', order: 50, data: 'wave' }] },
  'sdk/octatrack/modules/wave/machine.c': machineC(reserved),
})

describe('every Octatrack module names its CPU price', () => {
  it('holds on main: every module either names its price or waits on the pending list', () => {
    const catalog = JSON.parse(readFileSync(join(repo, 'sdk/catalog.json'), 'utf8'))
    const documents = new Map(catalog.modules.map(item => [item.id, parseModuleDocument(JSON.parse(readFileSync(join(repo, 'sdk/octatrack/modules', item.id, 'octamod.module.json'), 'utf8')))]))
    expect(cpuPriceProblems({ root: repo, documents, catalog, pending: readCpuPricePending(repo) })).toEqual([])
  }, 20_000)

  it('reads reserved[0] of every machine on main, ported or written in C', () => {
    // Each descriptor carries what its module names (0 while it names none), so a release that prices a machine leaves this test alone.
    const glue = portGlue(repo), json = path => JSON.parse(readFileSync(join(repo, path), 'utf8'))
    const ports = json('sdk/machines/octatrack/module-adapters/machine-ports.json').ports
    const named = id => json('sdk/octatrack/modules/' + id + '/octamod.module.json').resources.cpuPrice?.value ?? 0
    for (const id of ['poly8', 'vector', 'synth', 'analog-bassdrum']) {
      expect(ports[id].cpuPrice ?? 0).toBe(named(id))
      expect(machineDescriptors({ root: repo, id, glue })).toMatchObject([{ symbol: 'mw_machine', price: named(id), port: true }])
    }
    expect(machineDescriptors({ root: repo, id: 'syntiz', glue })).toMatchObject([{ symbol: 'wave_machine', price: named('syntiz') }])
    expect(machineDescriptors({ root: repo, id: 'amiga', glue })).toMatchObject([{ symbol: 'amiga_machine', price: named('amiga') }])
    expect(machineDescriptors({ root: repo, id: 'euclid', glue })).toEqual([])
  }, 20_000)

  it('refuses a module that names no price and says how to measure it', () => {
    const root = fixture(machineFolder(''))
    const machine = cpuPriceStatus({ root, document: module('wave', 'Track machine'), pending: new Map(), glue: {} })
    expect(machine).toMatchObject({ state: 'fail', detail: expect.stringContaining('names no CPU price') })
    expect(machine.fix).toContain('npm run device -- do')
    const effect = cpuPriceStatus({ root, document: module('echo', 'FX2'), pending: new Map(), glue: {} })
    expect(effect.fix).toContain('npm run device:price -- --write --base ID --scene TEXT echo')
  })

  it('recomputes a price device:price wrote from its readings, and refuses one changed by hand', () => {
    const reading = { module: 'echo', result: { atRestAdds: { frame: 0.2 }, inUseAdds: { frame: 1.3 } } }
    const root = fixture({ 'sdk/octatrack/modules/echo/evidence/cpu-price.json': reading })
    const status = value => cpuPriceStatus({ root, document: module('echo', 'FX2', { ...share(value), source: 'evidence/cpu-price.json' }), pending: new Map(), glue: {} })
    expect(status(1.3).state).toBe('ok')
    expect(status(0.5)).toMatchObject({ state: 'fail', detail: expect.stringContaining('the reading in evidence/cpu-price.json gives 1.3') })
    const missing = cpuPriceStatus({ root, document: module('other', 'FX2', { ...share(0), source: 'evidence/cpu-price.json' }), pending: new Map(), glue: {} })
    expect(missing).toMatchObject({ state: 'fail', detail: expect.stringContaining('holds no device:price reading of other') })
  })

  it('takes a machine whose descriptor carries the price it names, literal or #define', () => {
    expect(cpuPriceStatus({ root: fixture(machineFolder('\n    .reserved = {7},')), document: module('wave', 'Track machine', render(7)), pending: new Map(), glue: {} })).toMatchObject({ state: 'ok' })
    expect(cpuPriceStatus({ root: fixture(machineFolder('\n    .reserved = { WAVE_PRICE },')), document: module('wave', 'Track machine', render(9)), pending: new Map(), glue: {} })).toMatchObject({ state: 'ok' })
    expect(cpuPriceStatus({ root: fixture({}), document: module('echo', 'FX2', share(0.4)), pending: new Map(), glue: {} })).toMatchObject({ state: 'ok' })
  })

  it('refuses a machine whose descriptor and manifest disagree, or that names the wrong measure', () => {
    const none = cpuPriceStatus({ root: fixture(machineFolder('')), document: module('wave', 'Track machine', render(7)), pending: new Map(), glue: {} })
    expect(none).toMatchObject({ state: 'fail', detail: expect.stringContaining("reserved[0] is 0") })
    expect(none.fix).toContain('.reserved = {7}')
    expect(cpuPriceStatus({ root: fixture(machineFolder('\n    .reserved = {8},')), document: module('wave', 'Track machine', render(7)), pending: new Map(), glue: {} }).state).toBe('fail')
    expect(cpuPriceStatus({ root: fixture(machineFolder('\n    .reserved = {7},')), document: module('wave', 'Track machine', share(7)), pending: new Map(), glue: {} }).detail).toContain('machine-render')
    expect(cpuPriceStatus({ root: fixture({}), document: module('echo', 'FX2', render(3)), pending: new Map(), glue: {} }).detail).toContain('frame-interrupt')
    // A track machine with no descriptor the check can find is refused, not taken as a hook-only module.
    expect(cpuPriceStatus({ root: fixture({}), document: module('wave', 'Track machine', render(7)), pending: new Map(), glue: {} }).state).toBe('fail')
  })

  it('says the price of a ported machine goes in its machine-ports.json entry', () => {
    const root = fixture({ 'sdk/machines/octatrack/module-adapters/machine-ports.json': { schema: 1, ports: { wave: { machine: { sig: 'WV' }, contribute: [{ to: 'ot_machines', order: 10, data: 'mw_machine' }] } } } })
    const glue = { wave: 'mw_machine:\n        .long   1\n        .word   0, 0\n        .byte   1, 0, 0, 0\n' }
    const status = cpuPriceStatus({ root, document: module('wave', 'Track machine', render(7)), pending: new Map(), glue })
    expect(status).toMatchObject({ state: 'fail' })
    expect(status.fix).toContain('machine_ports.py')
    expect(glueReserved0(glue.wave.replace('1, 0, 0, 0', '1, 7, 0, 0'))).toBe(7)
  })

  it('reads a positional descriptor as unreadable rather than as no price', () => {
    const root = fixture({ 'm/machine.c': 'const struct modwerk_machine wave = { 1, {0}, "WAVE" };\n' })
    expect(cReserved0(join(root, 'm'), 'wave')).toMatchObject({ problem: expect.stringContaining('designated fields') })
  })

  it('keeps the pending list to modules listed before the rule, shrinking only, and without priced modules', () => {
    const root = fixture({})
    const documents = new Map([['old', module('old', 'FX2')], ['priced', module('priced', 'FX2', share(1.2))], ['fresh', module('fresh', 'FX2')]])
    const catalog = { modules: [{ id: 'old', addedAt: '2026-10-01T00:00:00Z' }, { id: 'priced', addedAt: '2026-10-01T00:00:00Z' }, { id: 'fresh', addedAt: '2026-11-17T09:00:00Z' }] }
    const pending = id => new Map(id.map(item => [item, CPU_PRICE_PENDING_REASON]))
    const run = (list, base = null) => cpuPriceProblems({ root, documents, catalog, pending: pending(list), basePending: base && pending(base), glue: {} })
    expect(run(['old'])).toEqual([expect.stringContaining('fresh: CPU price: it names no CPU price')])
    expect(run(['old', 'fresh']).join('\n')).toContain('fresh was not listed before 2026-11-17')
    expect(run(['old', 'priced']).join('\n')).toContain('priced: CPU price: it names its price')
    expect(run(['old', 'gone']).join('\n')).toContain('gone is not a module')
    // Shrinking against the base: a line the base did not have is refused even for an old module.
    documents.delete('fresh')
    expect(run(['old'], ['old'])).toEqual([])
    expect(run(['old'], [])).toEqual([expect.stringContaining('the list only shrinks')])
    expect(() => parseCpuPricePending(JSON.stringify({ pending: { old: 'later' } }))).toThrow(CPU_PRICE_PENDING_REASON)
  })

  it('takes a price with its unit and how it was measured, and nothing vaguer', () => {
    expect(parseModuleCpuPrice(render(12))).toEqual(render(12))
    expect(parseModuleCpuPrice(share(0.3)).value).toBe(0.3)
    expect(() => parseModuleCpuPrice(render(0))).toThrow('reserved[0]')
    expect(() => parseModuleCpuPrice(render(7.5))).toThrow('reserved[0]')
    expect(() => parseModuleCpuPrice(share(0.25))).toThrow('a tenth of a point')
    expect(() => parseModuleCpuPrice({ ...render(7), unit: '%' })).toThrow('percent-of-frame')
    expect(() => parseModuleCpuPrice({ ...render(7), tool: 'npm run device:price' })).toThrow('npm run device -- do')
    expect(() => parseModuleCpuPrice({ ...render(7), date: 'November' })).toThrow('YYYY-MM-DD')
    const vague = render(7)
    delete vague.conditions
    expect(() => parseModuleCpuPrice(vague)).toThrow('conditions')
  })
})
