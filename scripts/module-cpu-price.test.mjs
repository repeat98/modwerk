import { afterEach, describe, expect, it } from 'vitest'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseModuleCpuMeter, parseModuleCpuPrice, parseModuleDocument } from '../src/catalog/module-contract.ts'
import { AT_REST_FROM, AT_REST_LIMIT, CPU_PRICE_PENDING_REASON, RELEASE_COST_FROM, curveProblem, FRAME_COST_FROM, FRAME_COST_RECORD, FRAME_COSTS_BASE_PATH, atRestStatus, frameCostStatus, generateFrameCosts, cReserved0, cpuPriceProblems, cpuPriceStatus, glueReserved0, machineDescriptors, parseCpuPricePending, portGlue, readCpuPricePending } from './module-cpu-price.mjs'

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

  it('holds a machine\'s meter cost to its descriptor\'s reserved[1] and recomputes it from its paired readings', () => {
    const meter = (value, source = 'evidence/cpu-meter.json') => ({ value, unit: 'percent-of-meter', measure: 'machine-meter', tool: 'npm run device -- do health', date: '2026-11-21', conditions: 'MKII, the same Part with the track on Flex', source })
    const pairs = [{ track: 1, flex: 43.68, machine: 52.6, flexReadings: [436, 440, 435, 444, 435, 437, 436], machineReadings: [526, 530, 524, 535, 524, 526, 523] }, { track: 5, flex: 61.7, machine: 78.25 }]
    const folder = (reserved, record = { module: 'wave', pairs }) => fixture({ ...machineFolder(reserved), 'sdk/octatrack/modules/wave/evidence/cpu-meter.json': record })
    const status = (reserved, value, record) => cpuPriceStatus({ root: folder(reserved, record), document: { ...module('wave', 'Track machine', render(7)), resources: { cpuPrice: render(7), ...(value ? { cpuMeter: meter(value) } : {}) } }, pending: new Map(), glue: {} })
    expect(status('\n    .reserved = {7, 17},', 17)).toMatchObject({ state: 'ok', detail: expect.stringContaining('adds 17 meter points') })
    expect(status('\n    .reserved = {7, 20},', 20).state).toBe('ok')                                     // a margin above the readings
    expect(status('\n    .reserved = {7},', 0).state).toBe('ok')                                          // names none, carries none
    expect(status('\n    .reserved = {7, 16},', 16)).toMatchObject({ state: 'fail', detail: expect.stringContaining('its readings add 16.55') })
    expect(status('\n    .reserved = {7},', 17)).toMatchObject({ state: 'fail', detail: expect.stringContaining("reserved[1] is 0") })
    expect(status('\n    .reserved = {7, 17},', 0)).toMatchObject({ state: 'fail', detail: expect.stringContaining('does not name') })
    expect(status('\n    .reserved = {7, 17},', 17, { module: 'wave', pairs: [{ ...pairs[0], flex: 40 }] })).toMatchObject({ state: 'fail', detail: expect.stringContaining('middle five') })
    expect(status('\n    .reserved = {7, 17},', 17, { module: 'other', pairs })).toMatchObject({ state: 'fail', detail: expect.stringContaining('no paired meter readings of wave') })
    expect(cReserved0(join(folder('\n    .reserved = { WAVE_PRICE, 12u },'), 'sdk/octatrack/modules/wave'), 'wave')).toMatchObject({ price: 9, meter: 12 })
    const effect = cpuPriceStatus({ root: fixture({}), document: { ...module('echo', 'FX2'), resources: { cpuPrice: share(0.4), cpuMeter: meter(3) } }, pending: new Map(), glue: {} })
    expect(effect).toMatchObject({ state: 'fail', detail: expect.stringContaining('only a machine') })
    expect(() => parseModuleCpuMeter({ ...meter(17), value: 0 })).toThrow(/reserved\[1\]/)
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

describe('a module costs nothing while nobody uses it (owner, 20 November 2026)', () => {
  const hook = (id, version, cpuPrice, effectId = null) => ({ id, version, compatibility: { location: 'Hook', effectId }, resources: cpuPrice ? { cpuPrice } : {} })
  const changelog = (id, version, date) => ({ ['src/community/module-changelogs/' + id + '.json']: [{ version, date, changes: ['x'] }] })
  const reading = (id, atRest, inUse) => ({ ['sdk/octatrack/modules/' + id + '/evidence/cpu-price.json']: { module: id, result: { atRestAdds: { frame: atRest }, inUseAdds: inUse == null ? undefined : { frame: inUse } } } })

  it('passes a module at or under the limit, and one with nothing measured is only reported', () => {
    const root = fixture({ ...changelog('quiet', '0.2.0', AT_REST_FROM) })
    expect(atRestStatus({ root, document: hook('quiet', '0.2.0', share(AT_REST_LIMIT)), glue: {} }).state).toBe('ok')
    expect(atRestStatus({ root, document: hook('quiet', '0.2.0'), glue: {} }).state).toBe('info')
  })

  it('fails a new release above the limit that does not rest, and only warns about a release from before the date', () => {
    const root = fixture({ ...changelog('busy', '0.3.0', AT_REST_FROM), ...changelog('old', '0.1.0', '2026-11-14') })
    const fresh = atRestStatus({ root, document: hook('busy', '0.3.0', share(1.4)), glue: {} })
    expect(fresh).toMatchObject({ state: 'fail', detail: expect.stringContaining('1.4 points') })
    expect(fresh.fix).toContain('ev_in_use')
    expect(atRestStatus({ root, document: hook('busy', '0.4.0', share(1.4)), glue: {} }).state).toBe('fail') /* no changelog entry yet: a new release */
    expect(atRestStatus({ root, document: hook('old', '0.1.0', share(1.4)), glue: {} })).toMatchObject({ state: 'warn', detail: expect.stringContaining('not refused') })
  })

  it('reads an effect at rest from its device:price readings, not its price on a slot', () => {
    const root = fixture({ ...reading('echo', 0.1, 7.7), ...reading('loud', 0.5, 7.7), ...changelog('echo', '1.0.0', AT_REST_FROM), ...changelog('loud', '1.0.0', AT_REST_FROM) })
    const priced = () => ({ ...share(7.7), source: 'evidence/cpu-price.json' })
    expect(atRestStatus({ root, document: hook('echo', '1.0.0', priced(), 31), glue: {} }).state).toBe('ok')
    expect(atRestStatus({ root, document: hook('loud', '1.0.0', priced(), 31), glue: {} }).state).toBe('fail')
    expect(atRestStatus({ root: fixture({}), document: hook('slot', '1.0.0', share(7.7), 31), glue: {} }).state).toBe('info')
  })

  it('passes a module that answers ev_in_use, and a machine or an effect whose detours rest with it, which the base rests', () => {
    const wave = machineFolder('\n    .reserved = {7},')
    const root = fixture({
      'sdk/octatrack/modules/rests/runtime.json': { schema: 1, subscribe: [{ event: 'ev_in_use', fn: 'in_use', order: 50 }] },
      ...changelog('rests', '0.2.0', AT_REST_FROM), ...wave,
      'sdk/octatrack/modules/wave/runtime.json': { schema: 1, contribute: [{ to: 'ot_machines', order: 50, data: 'wave' }], rests: ['0x40007978'] },
      'sdk/octatrack/modules/echo/runtime.json': { schema: 1, rests: ['0x4000361a'] }, ...changelog('echo', '1.1.0', AT_REST_FROM),
      ...changelog('loud', '1.1.0', AT_REST_FROM),
    })
    expect(atRestStatus({ root, document: hook('rests', '0.2.0', share(1.4)), glue: {} })).toMatchObject({ state: 'ok', detail: expect.stringContaining('ev_in_use') })
    expect(atRestStatus({ root, document: { ...module('wave', 'Track machine', render(7)), version: '0.1.0' }, glue: {} })).toMatchObject({ state: 'ok', detail: expect.stringContaining('machine') })
    expect(atRestStatus({ root, document: hook('echo', '1.1.0', share(1.4), 15), glue: {} })).toMatchObject({ state: 'ok', detail: expect.stringContaining('effect') })
    /* An effect over the limit with no detour marked: its handlers rest, its detours do not, so it still fails, told to mark them. */
    const loud = atRestStatus({ root: fixture({ ...reading('loud', 2.5, 7.2), ...changelog('loud', '1.1.0', AT_REST_FROM) }), document: hook('loud', '1.1.0', { ...share(7.2), source: 'evidence/cpu-price.json' }, 29), glue: {} })
    expect(loud).toMatchObject({ state: 'fail' })
    expect(loud.fix).toContain('the base rests an effect no slot uses')
  })

  it('reads the rest marks from the committed USB package, not only from runtime.json', () => {
    const site = (address, bytes, rests) => { const s = Buffer.alloc(40 + bytes); s.writeUInt32BE(address); s[4] = bytes | (rests ? 0x80 : 0); s[6] = bytes; return s }
    const header = Buffer.alloc(76); header.write('MWRM'); header.writeUInt16BE(8, 4); header.writeUInt32BE(2, 24)
    const root = fixture({
      'sdk/octatrack/modules/mutes/runtime.json': { schema: 1, subscribe: [{ event: 'ev_in_use', fn: 'in_use', order: 50 }], rests: ['0x40004dc6'] },
      'src/engine/assets/octatrack-module-packages.json': { packages: [{ id: 'mutes', version: '0.2.3', path: 'octatrack-modules/mutes/0.2.3.mwrm' }] },
      ...changelog('mutes', '0.2.3', AT_REST_FROM),
    })
    mkdirSync(join(root, 'public/octatrack-modules/mutes'), { recursive: true })
    const built = rests => writeFileSync(join(root, 'public/octatrack-modules/mutes/0.2.3.mwrm'), Buffer.concat([header, site(0x40004dc6, 6, rests), site(0x40068efe, 4, false)]))
    built(false) /* a builder route that dropped the marks: the base would keep the detour patched */
    expect(atRestStatus({ root, document: hook('mutes', '0.2.3', share(2.6)), glue: {} })).toMatchObject({ state: 'fail', detail: expect.stringContaining('0x40004dc6') })
    built(true)
    expect(atRestStatus({ root, document: hook('mutes', '0.2.3', share(2.6)), glue: {} }).state).toBe('ok')
    /* No package of this version committed yet (a draft): the packages check names that; this one reads runtime.json. */
    expect(atRestStatus({ root, document: hook('mutes', '0.2.4', share(2.6)), glue: {} }).state).toBe('ok')
  })

  it('holds on main: no published release fails, whatever it costs at rest', () => {
    const catalog = JSON.parse(readFileSync(join(repo, 'sdk/catalog.json'), 'utf8')), glue = portGlue(repo)
    for (const item of catalog.modules) {
      const document = parseModuleDocument(JSON.parse(readFileSync(join(repo, 'sdk/octatrack/modules', item.id, 'octamod.module.json'), 'utf8')))
      expect([item.id, atRestStatus({ root: repo, document, glue }).state]).not.toEqual([item.id, 'fail'])
    }
  }, 20_000)
})

describe('a release of an effect or a machine carries its instance curve', () => {
  const effect = (id, version) => ({ id, version, compatibility: { location: 'Track effect', effectId: 15 }, resources: {} })
  const dated = (id, version, date) => ({ ['src/community/module-changelogs/' + id + '.json']: [{ version, date, changes: ['x'] }] })
  const curve = (id, version, first, each, rest) => ({ ['sdk/octatrack/modules/' + id + '/' + FRAME_COST_RECORD]: { module: id, version, base: 'twin', measuredAt: '2026-11-22T10:00:00Z', first, each, ...(rest == null ? {} : { rest }) } })

  it('passes a measured curve for the current version', () => {
    const root = fixture({ ...curve('echo', '0.2.0', 13, 3.7) })
    expect(frameCostStatus({ root, document: effect('echo', '0.2.0'), glue: {} })).toMatchObject({ state: 'ok' })
    const resting = fixture({ ...curve('echo', '0.2.0', 13, 3.7, 2.5) }), negative = fixture({ ...curve('echo', '0.2.0', 13, 3.7, -1) })
    expect(frameCostStatus({ root: resting, document: effect('echo', '0.2.0'), glue: {} })).toMatchObject({ state: 'ok', detail: expect.stringContaining('rest 2.5') })
    expect(frameCostStatus({ root: negative, document: effect('echo', '0.2.0'), glue: {} }).state).not.toBe('ok')
  })

  it('holds a release from RELEASE_COST_FROM to a first reading with room and a clean admission run', () => {
    const run = (pattern, more = {}) => ({ pattern, admitted: true, frameMax: 80, dropped: 0, stalls: 0, seconds: 8, ...more })
    const record = (points, admission) => ({ ['sdk/octatrack/modules/echo/' + FRAME_COST_RECORD]: { module: 'echo', version: '0.2.0', base: 'twin', measuredAt: '2026-11-24T10:00:00Z', first: 13, each: 3.7, points, admission } })
    const status = (points, admission, date = RELEASE_COST_FROM) => frameCostStatus({ root: fixture({ ...record(points, admission), ...dated('echo', '0.2.0', date) }), document: effect('echo', '0.2.0'), glue: {} })
    expect(status([79, 92], [run('empty'), run('medium')])).toMatchObject({ state: 'ok', detail: expect.stringContaining('admitted alone') })
    expect(status([81, 107.9], [run('empty'), run('medium')])).toMatchObject({ state: 'fail', detail: expect.stringContaining('107.9 %') }) // FM Synth 0.1.5's reading
    expect(status([79, 92], [run('empty')])).toMatchObject({ state: 'fail', detail: expect.stringContaining('no admission run on the medium') })
    expect(status([79, 92], [run('empty'), run('medium', { admitted: false, why: 'CPU FULL' })])).toMatchObject({ state: 'fail', detail: expect.stringContaining('refused (CPU FULL)') })
    expect(status([79, 92], [run('empty'), run('medium', { admitted: null })])).toMatchObject({ state: 'fail', detail: expect.stringContaining('not verified') })
    expect(status([79, 92], [run('empty', { dropped: 3 }), run('medium')])).toMatchObject({ state: 'fail', detail: expect.stringContaining('dropped 3 renders') })
    expect(status([79, 92], [run('empty'), run('medium', { stalls: 1 })]).state).toBe('fail')
    expect(status(undefined, undefined).state).toBe('fail') // a curve from before the admission run
    // a release dated before the rule keeps its curve, and says what it lacks
    expect(status([81, 107.9], undefined, FRAME_COST_FROM)).toMatchObject({ state: 'ok', detail: expect.stringContaining('reported, not refused') })
    expect(curveProblem({ points: [79, 92], admission: [run('empty'), run('medium')] })).toBeNull()
  })

  it('refuses a price measured on another version from RELEASE_COST_FROM', () => {
    const reading = version => ({ 'sdk/octatrack/modules/echo/evidence/cpu-price.json': { module: 'echo', version, result: { atRestAdds: { frame: 0.2 }, inUseAdds: { frame: 1.3 } } } })
    const document = { ...module('echo', 'FX2', { ...share(1.3), source: 'evidence/cpu-price.json' }), version: '0.2.0' }
    const status = (version, date) => cpuPriceStatus({ root: fixture({ ...reading(version), ...dated('echo', '0.2.0', date) }), document, pending: new Map(), glue: {} })
    expect(status('0.2.0', RELEASE_COST_FROM).state).toBe('ok')
    expect(status('0.1.0', RELEASE_COST_FROM)).toMatchObject({ state: 'fail', detail: expect.stringContaining('measured on 0.1.0, not 0.2.0') })
    expect(status('0.1.0', FRAME_COST_FROM).state).toBe('ok') // Tape Echo 0.1.9 carried 0.1.6's price, released before the rule
  })

  it('generates the table from the base list with each module\'s current curve on top, one module a line', () => {
    const manifest = (id, version) => ({ ['sdk/octatrack/modules/' + id + '/octamod.module.json']: { id, version } })
    const root = fixture({ [FRAME_COSTS_BASE_PATH]: { about: 'base', costs: { echo: { first: 9.7, each: 9.7 }, 'analog-bassdrum': { first: 19.7, each: 19.7 } } },
      ...manifest('echo', '0.2.0'), ...curve('echo', '0.2.0', 13, 3.7, 1.5), ...manifest('verb', '0.3.0'), ...curve('verb', '0.2.0', 2, 1) })
    const text = generateFrameCosts(root), costs = JSON.parse(text).costs
    expect(costs.echo).toMatchObject({ first: 13, each: 3.7, rest: 1.5 }) // the module's own curve wins, its cost at rest with it
    expect(costs['analog-bassdrum']).toEqual({ first: 19.7, each: 19.7 }) // the base's own entry stays
    expect(costs.verb).toBeUndefined() // a curve for an older version is not this release's
    expect(JSON.parse(text).about).toMatch(/^GENERATED/)
    const stocked = fixture({ [FRAME_COSTS_BASE_PATH]: { about: 'base', stock: { reserve: 105.6, trackStock: 7.2 }, costs: {} } })
    expect(JSON.parse(generateFrameCosts(stocked)).stock).toEqual({ reserve: 105.6, trackStock: 7.2 }) // the base's stock room travels too
    expect(text.split('\n').filter(line => line.startsWith('    "'))).toHaveLength(2)
  })

  it('refuses a new or undated release without a curve for its version, and only reports an earlier one', () => {
    const undated = fixture({ ...curve('echo', '0.1.0', 13, 3.7), ...dated('echo', '0.1.0', '2026-11-14') }) // 0.2.0 has no entry yet
    expect(frameCostStatus({ root: undated, document: effect('echo', '0.2.0'), glue: {} })).toMatchObject({ state: 'fail', detail: expect.stringContaining('not 0.2.0') })
    const legacy = fixture({}) // no changelog file at all: a module from before the release notes
    expect(frameCostStatus({ root: legacy, document: effect('echo', '0.2.0'), glue: {} }).state).toBe('warn')
    const old = fixture({ ...dated('echo', '0.2.0', '2026-11-14') })
    expect(frameCostStatus({ root: old, document: effect('echo', '0.2.0'), glue: {} }).state).toBe('warn')
    const fresh = fixture({ ...dated('echo', '0.2.0', FRAME_COST_FROM) })
    expect(frameCostStatus({ root: fresh, document: effect('echo', '0.2.0'), glue: {} })).toMatchObject({ state: 'fail', fix: expect.stringContaining('--curve') })
  })

  it('asks nothing of a module that is neither an effect nor a machine', () => {
    const root = fixture({})
    expect(frameCostStatus({ root, document: { id: 'keys', version: '0.1.0', compatibility: { location: 'Sequencer' }, resources: {} }, glue: {} }).state).toBe('info')
  })
})
