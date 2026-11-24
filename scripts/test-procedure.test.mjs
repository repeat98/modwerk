import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { context, LAYER, largeSet, plan, reading, record, recordMarkdown, runProcedure, STEPS, suggestEdgeCases } from './test-procedure.mjs'
import { bodyProblems } from './pr-body.mjs'

const INVENTORY = '[{"name":"KITS","version":"0.2.0"}]'
const moduleCtx = (extra = {}) => ({ kind: 'module', id: 'vibrato', version: '0.1.0', machine: 'octatrack', source: true, draft: false, out: '/out', share: '/tmp/share.sock',
  soakSeconds: 120, tools: { cycleScan: false, soak: false, unitQueue: false }, build: { revision: 'e84798ebb0000000000000000000000000000000', dirty: false },
  unit: { available: true }, files: [], manifest: { category: 'effects', compatibility: { effectId: 9, uiClaims: [] } }, ...extra })

/** Fake tools: every command passes and device.mjs's inventory prints the same set, unless `fail` or `inventories` say otherwise. */
function fakeDeps({ fail = [], inventories = [INVENTORY, INVENTORY], idents = ['link: 1\nlabel: FLSH', 'link: 1\nlabel: FLSH'], files = {}, said = {}, trialOutput = 'trial: 1234… running\nrolled back (pass --accept to keep it)' } = {}) {
  const ran = [], started = [], envs = []
  let clock = 0, inventory = 0, ident = 0
  return {
    ran, started, envs,
    now: () => (clock += 1000),
    exists: path => path in files || /\.(mwrm|elemod|syx)$/.test(path),
    read: path => files[path],
    sha256: () => 'ab'.repeat(32),
    exec: async (argv, log, env) => {
      const line = argv.join(' ')
      ran.push(line)
      envs.push(env)
      if (argv[2] === 'unit' && files.onQueue) files.onQueue(argv)
      const code = fail.some(part => line.includes(part)) ? 1 : 0
      const output = Object.entries(said).find(([part]) => line.includes(part))?.[1]
      return { code, output: output ?? (line.endsWith('do inventory --socket /tmp/share.sock') ? inventories[inventory++] : line.endsWith('rytm_link.py ident') ? idents[ident++] : 'ok') }
    },
    start: argv => {
      started.push(argv.join(' '))
      return { waitFor: async () => {}, stop: async () => ({ code: 0, output: trialOutput }) }
    },
  }
}
const statuses = steps => Object.fromEntries(steps.map(step => [step.id, step.status]))

describe('the steps', () => {
  it('runs in the fixed order, the unit steps after the software, emulator and build steps', () => {
    expect(STEPS.map(step => step.id)).toEqual(['software', 'compat', 'build', 'cost-model', 'emulator', 'unit-read', 'unit-pass', 'soak', 'cost-unit', 'restore', 'by-hand', 'developer'])
    expect(STEPS.filter(step => step.unit).map(step => step.id)).toEqual(['unit-read', 'unit-pass', 'soak', 'cost-unit', 'restore'])
  })

  it('calls the existing tools: module:doctor, modules:compat, module:dev, device:test, device:price', async () => {
    const deps = fakeDeps()
    const steps = await runProcedure(moduleCtx(), deps)
    expect(deps.ran).toEqual([
      'npm run module:doctor -- vibrato',
      'npm run modules:compat -- vibrato',
      'npm run module:dev -- vibrato --build-only --out /out/vibrato.mwrm',
      'node scripts/device.mjs status --socket /tmp/share.sock',
      'node scripts/device.mjs do inventory --socket /tmp/share.sock',
      'npm run device:test -- --share /tmp/share.sock --testing-entry /out/device-test.md --soak 120 /out/vibrato.mwrm',
      expect.stringMatching(/^npm run device:price -- --share \/tmp\/share.sock --out \/out\/price.json --scene .+ --curve T1,T3,T6,T7 \/out\/vibrato.mwrm$/), // the curve and the admission run
      'node scripts/device.mjs do inventory --socket /tmp/share.sock',
    ])
    expect(statuses(steps)).toEqual({ software: 'passed', compat: 'passed', build: 'passed', 'cost-model': 'not run', emulator: 'not run', 'unit-read': 'passed',
      'unit-pass': 'passed', soak: 'passed', 'cost-unit': 'passed', restore: 'passed', 'by-hand': 'to do', developer: 'to do' })
    expect(steps.find(step => step.id === 'soak').reason).toMatch(/inside the scripted pass as device:test --soak 120.*#1770/)
    expect(steps.find(step => step.id === 'cost-model').reason).toMatch(/cycle-scan.mjs\) is not in this checkout/)
  })

  it('stops at the first failure and records every later step as not run, with the step that stopped it', async () => {
    const deps = fakeDeps({ fail: ['modules:compat'] })
    const steps = await runProcedure(moduleCtx(), deps)
    expect(deps.ran).toEqual(['npm run module:doctor -- vibrato', 'npm run modules:compat -- vibrato'])
    expect(statuses(steps)).toMatchObject({ software: 'passed', compat: 'failed', build: 'not run', 'unit-pass': 'not run', 'by-hand': 'not run', developer: 'not run' })
    expect(steps.find(step => step.id === 'build').reason).toBe('stopped: step 2 (Beside every other module) failed')
    expect(steps.find(step => step.id === 'compat').reason).toBe('exit 1: npm run modules:compat -- vibrato')
    // The record still names the command a step would have run.
    expect(steps.find(step => step.id === 'unit-pass').commands[0]).toMatch(/^npm run device:test/)
  })

  it('skips the unit steps cleanly without a unit session and still runs the rest', async () => {
    const deps = fakeDeps()
    const steps = await runProcedure(moduleCtx({ unit: { available: false, reason: 'no unit session on /tmp/share.sock' } }), deps)
    expect(deps.ran.some(line => /device/.test(line))).toBe(false)
    for (const id of ['unit-read', 'unit-pass', 'soak', 'cost-unit', 'restore']) {
      expect(steps.find(step => step.id === id)).toMatchObject({ status: 'not run', reason: 'no unit session on /tmp/share.sock' })
    }
    expect(statuses(steps)).toMatchObject({ software: 'passed', build: 'passed', 'by-hand': 'to do', developer: 'to do' })
  })

  it('fails the put-back step when the inventory at the end differs from the one read first', async () => {
    const steps = await runProcedure(moduleCtx(), fakeDeps({ inventories: [INVENTORY, '[]'] }))
    expect(steps.find(step => step.id === 'restore')).toMatchObject({ status: 'failed', reason: expect.stringMatching(/inventory differs/) })
  })

  it('uses a package it is given instead of building one, and names it by its SHA-256', async () => {
    const deps = fakeDeps(), ctx = moduleCtx({ pkg: '/p/vibrato.mwrm' })
    await runProcedure(ctx, deps)
    expect(deps.ran.some(line => line.includes('module:dev'))).toBe(false)
    expect(ctx.build.package).toEqual({ path: '/p/vibrato.mwrm', sha256: 'ab'.repeat(32) })
  })

  it('runs the emulator step only with an emulator session, labelled as emulator evidence', async () => {
    const deps = fakeDeps()
    const steps = await runProcedure(moduleCtx({ emulatorSocket: '/tmp/emu.sock', unit: { available: false, reason: 'none' } }), deps)
    expect(deps.ran).toContain('node scripts/device.mjs try /out/vibrato.mwrm --seconds 20 --emulator --socket /tmp/emu.sock')
    expect(steps.find(step => step.id === 'emulator')).toMatchObject({ status: 'passed', emulator: true })
  })

  it('soaks a module inside a trial of its own once the fast soak exists, and fails a trial that was kept', async () => {
    const tools = { cycleScan: true, soak: true, unitQueue: false }
    const deps = fakeDeps()
    const steps = await runProcedure(moduleCtx({ tools }), deps)
    expect(deps.ran).toContain('node scripts/cycle-scan.mjs check')
    expect(deps.ran).toContain('node scripts/octatrack-soak.mjs --seconds 120 --log /out/soak.json')
    expect(deps.ran.find(line => line.startsWith('npm run device:test'))).not.toContain('--soak')
    expect(deps.started).toEqual(['node scripts/device.mjs try /out/vibrato.mwrm --seconds 420 --socket /tmp/share.sock'])
    expect(statuses(steps)).toMatchObject({ 'cost-model': 'passed', soak: 'passed' })
    const kept = await runProcedure(moduleCtx({ tools }), fakeDeps({ trialOutput: 'trial: 12… running\naccepted' }))
    expect(kept.find(step => step.id === 'soak')).toMatchObject({ status: 'failed', reason: expect.stringMatching(/kept/) })
  })

  it('runs a base with the large set, every package priced, and no package of its own to build', async () => {
    const deps = fakeDeps()
    const ctx = moduleCtx({ kind: 'base', id: undefined, machine: 'octatrack', version: '0.7', pkg: '/r/octatrack-base.elemod', setPackages: ['/p/a.mwrm', '/p/b.mwrm'] })
    const steps = await runProcedure(ctx, deps)
    expect(deps.ran.slice(0, 2)).toEqual(['npm run sdk:check', 'npm run modules:compat'])
    expect(deps.ran).toContain('node scripts/device.mjs set /p/a.mwrm,/p/b.mwrm --seconds 30 --split --socket /tmp/share.sock')
    expect(deps.ran.find(line => line.startsWith('npm run device:price'))).toMatch(/--scene .+[^m]$/) // no package named: every USB package
    expect(steps.find(step => step.id === 'unit-pass').title).toBe('Large set and Undo')
    expect(steps.find(step => step.id === 'soak')).toMatchObject({ status: 'not run', reason: expect.stringMatching(/#1770/) })
  })

  it('takes the large set without declared conflicts, either way, and without base-bound packages', () => {
    const conflicts = { kits: ['pattern-sample-locks'], synth: ['analog-bassdrum', 'quantizer'], vector: ['analog-bassdrum', 'synth'] }
    const rows = ['kits', 'pattern-sample-locks', 'synth', 'quantizer', 'vector', 'tuner'].map(id => ({ id }))
    expect(largeSet([...rows, { id: 'analog-bassdrum', requiredBase: 'ab' }], id => conflicts[id] ?? []).map(row => row.id)).toEqual(['kits', 'synth', 'tuner'])
  })

  it('fails the large set when the unit refuses it, although device.mjs exits 0', async () => {
    const refusal = 'set: 3 changes, 9 bytes\nrefused: Device refused verify: rejected. (loader refusal 3 RUNTIME_CONFLICT: …)\ninstalled: none'
    const deps = fakeDeps({ said: { 'device.mjs set': refusal } })
    const steps = await runProcedure(moduleCtx({ kind: 'base', id: undefined, version: '0.8.1', pkg: '/r/octatrack-base.elemod', setPackages: ['/p/a.mwrm'] }), deps)
    expect(steps.find(step => step.id === 'unit-pass')).toMatchObject({ status: 'failed', reason: expect.stringMatching(/^refused: .*RUNTIME_CONFLICT/) })
  })

  it('runs the unit steps as one turn of the unit queue when the repository has one', async () => {
    const files = {}
    files.onQueue = () => { files['/out/unit-steps.json'] = JSON.stringify([{ id: 'unit-read', title: 'Read the unit', unit: true, status: 'passed', commands: [], seconds: 3 }]) }
    const deps = fakeDeps({ files })
    const steps = await runProcedure(moduleCtx({ tools: { unitQueue: true } }), deps)
    const queued = deps.ran.find(line => line.startsWith('npm run unit'))
    expect(queued).toMatch(/^npm run unit -- run --note test:procedure vibrato e84798eb --expect 15m -- node scripts\/test-procedure.mjs vibrato --package \/out\/vibrato.mwrm --share \/tmp\/share.sock --out \/out .*--unit-phase \/out\/unit-steps.json$/)
    expect(deps.ran.some(line => line.startsWith('npm run device:test'))).toBe(false) // the inner run does that
    expect(steps.find(step => step.id === 'unit-read').status).toBe('passed')
  })

  it('records a queue run that left no result as a failed unit phase', async () => {
    const steps = await runProcedure(moduleCtx({ tools: { unitQueue: true } }), fakeDeps({ fail: ['npm run unit'] }))
    expect(steps.find(step => step.id === 'unit-read').status).toBe('failed')
    expect(steps.find(step => step.id === 'unit-pass').reason).toMatch(/unit queue run ended without a result \(exit 1\)/)
  })

})

describe('every machine', () => {
  const RYTM = 'sdk/machines/analog-rytm-mkii/tools/'
  const rytm = (extra = {}) => moduleCtx({ id: 'improved-performance', machine: 'analog-rytm-mkii', machineName: 'Analog Rytm MKII', platform: 'elemod', manifest: { category: 'system', compatibility: { uiClaims: [] } },
    stock: '/fw/AR.syx', elemod: '/dev/base.elemod', label: 'IP07', linkable: true, cases: ['/c/improved-performance'], emu: '/emu/dtboot', ...extra })

  it('runs the same steps on the Rytm with its own tools: the linked image, rytm-emu, the link\'s RAM boot and cases, the flash label put back', async () => {
    const deps = fakeDeps(), ctx = rytm()
    const steps = await runProcedure(ctx, deps)
    expect(deps.ran).toEqual([
      'npm run module:doctor -- improved-performance',
      'node scripts/link-image.mjs --stock /fw/AR.syx --version IP07 --out /out/improved-performance.syx --elemod /dev/base.elemod --module analog-rytm-mkii:improved-performance',
      `python3 -B ${RYTM}rytm_test.py emu /out/improved-performance.syx /c/improved-performance --emu /emu/dtboot --out /out/emulator`,
      `python3 -B ${RYTM}rytm_link.py ident`,
      `python3 -B ${RYTM}rytm_link.py ramboot /out/improved-performance.syx --label IP07`,
      `python3 -B ${RYTM}rytm_test.py unit /c/improved-performance --label FLSH --image /out/improved-performance.syx --allow-state-change --out /out/unit`,
      `python3 -B ${RYTM}rytm_link.py ident`,
    ])
    expect(statuses(steps)).toEqual({ software: 'passed', compat: 'not run', build: 'passed', 'cost-model': 'not run', emulator: 'passed', 'unit-read': 'passed',
      'unit-pass': 'passed', soak: 'not run', 'cost-unit': 'not run', restore: 'passed', 'by-hand': 'to do', developer: 'to do' })
    expect(steps.find(step => step.id === 'emulator').emulator).toBe(true)
    expect(steps.find(step => step.id === 'compat').reason).toMatch(/modules:compat compares the Octatrack's modules only/)
    expect(steps.find(step => step.id === 'cost-unit').reason).toMatch(/core_audio_load/)
    const md = recordMarkdown(record(ctx, steps, { started: 0, finished: 1000, command: 'npm run test:procedure -- improved-performance' }))
    expect(md).toMatch(/^Tested on a unit: package abababababab/m)
  })

  it('fails the put-back when the flashed label changed, and claims no unit test from reading the unit alone', async () => {
    const steps = await runProcedure(rytm(), fakeDeps({ idents: ['label: FLSH', 'label: IP07'] }))
    expect(steps.find(step => step.id === 'restore')).toMatchObject({ status: 'failed', reason: expect.stringMatching(/FLSH.*IP07/) })
    expect(reading('[{"name":"KITS"}]')).toEqual([{ name: 'KITS' }])
    const noCases = rytm({ cases: [] }), read = await runProcedure(noCases, fakeDeps())
    expect(read.find(step => step.id === 'unit-pass')).toMatchObject({ status: 'not run', reason: expect.stringMatching(/no cases: write them in .*cases\/improved-performance\//) })
    expect(recordMarkdown(record(noCases, read, { started: 0, finished: 1000, command: 'x' }))).toMatch(/^Not tested on a unit:/m)
  })

  it('names what a machine still lacks for each step it has no tool for, and what to pass for the build', () => {
    const ctx = moduleCtx({ id: 'track-names', machine: 'digitakt-ii', machineName: 'Digitakt II', platform: 'elemod', cases: [] })
    expect(plan(STEPS[0], ctx).commands).toEqual([['npm', 'run', 'module:doctor', '--', 'track-names']])
    expect(plan(STEPS.find(step => step.id === 'build'), ctx).skip).toMatch(/--package IMAGE.syx, or --stock STOCK.syx --elemod BASE.elemod --label XX01/)
    for (const step of STEPS.filter(step => step.unit)) expect(plan(step, ctx).skip).toMatch(/Digitakt II/)
    expect(plan(STEPS.find(step => step.id === 'unit-pass'), ctx).skip).toMatch(/no USB link the procedure drives yet.*MACHINE_RECIPE/)
    expect(plan(STEPS.find(step => step.id === 'emulator'), ctx).skip).toMatch(/no scripted emulator rehearsal/)
    expect(plan(STEPS.find(step => step.id === 'by-hand'), ctx).todo).toBeDefined()
  })

  it('reads another machine\'s base and modules from the checkout, and leaves the unit alone without --link', () => {
    const root = join(import.meta.dirname, '..'), out = mkdtempSync(join(tmpdir(), 'procedure-'))
    const base = context(root, { out, base: true }, ['analog-rytm-mkii'], {})
    expect(base).toMatchObject({ kind: 'base', machine: 'analog-rytm-mkii', machineName: 'Analog Rytm MKII', platform: 'elemod', linkable: false, unit: { available: false } })
    expect(base.pkg).toBeUndefined()
    expect(base.cases.length).toBeGreaterThan(0)
    expect(base.cases.every(path => path.endsWith('.case'))).toBe(true) // the link's own cases, not every module's folder
    expect(base.unit.reason).toMatch(/no --link/)
    const module = context(root, { out, link: true, stock: '/fw/AR.syx', elemod: '/b.elemod', label: 'QV01' }, ['quick-velocity-aftertouch-assign'], { RYTM_EMU: '/e/dtboot' })
    expect(module).toMatchObject({ machine: 'analog-rytm-mkii', version: expect.any(String), linkable: true, emu: '/e/dtboot', unit: { available: true }, passOn: ['--link', '--label', 'QV01'] })
    expect(module.cases).toEqual([join(root, RYTM, 'cases/quick-velocity-aftertouch-assign')])
    // temp-save is an Octatrack module and a Rytm one: machine:id picks the Rytm's.
    expect(context(root, { out, 'no-unit': true }, ['temp-save'], {}).machine).toBe('octatrack')
    const rytmTempSave = context(root, { out, 'no-unit': true }, ['analog-rytm-mkii:temp-save'], {})
    expect(rytmTempSave).toMatchObject({ machine: 'analog-rytm-mkii', source: true, baseBound: false })
    expect(rytmTempSave.pkg).toBeUndefined()
    expect(() => context(root, { out, base: true }, ['no-such-machine'], {})).toThrow(/No machine named no-such-machine/)
    expect(() => context(root, { out, label: 'TOOLONG' }, ['quick-velocity-aftertouch-assign'], {})).toThrow(/four-character label/)
    expect(() => context(root, { out, target: 'emulator' }, ['quick-velocity-aftertouch-assign'], {})).toThrow(/--target emulator drives an Octatrack emulator/)
  })

  it('runs another machine\'s unit steps as one turn of the unit queue, with what the inner run needs', async () => {
    const deps = fakeDeps({ fail: ['npm run unit'] })
    await runProcedure(rytm({ kind: 'base', id: undefined, tools: { unitQueue: true }, passOn: ['--link', '--label', 'IP07'] }), deps)
    expect(deps.ran.find(line => line.startsWith('npm run unit'))).toMatch(/ -- node scripts\/test-procedure.mjs --base analog-rytm-mkii --package \/out\/base.syx --share \/tmp\/share.sock --out \/out --link --label IP07 /)
  })
})

describe('the record', () => {
  const ctx = moduleCtx({ unit: { available: false, reason: 'no unit session on /tmp/share.sock' } })

  it('is written for the named build, with an empty edge-case table and a pull request line the description check accepts', async () => {
    const steps = await runProcedure(ctx, fakeDeps())
    const rec = record(ctx, steps, { started: Date.UTC(2026, 10, 20, 9), finished: Date.UTC(2026, 10, 20, 9, 3), command: 'npm run test:procedure -- vibrato' })
    expect(rec).toMatchObject({ procedure: 1, date: '2026-11-20', seconds: 180, target: { kind: 'module', id: 'vibrato', version: '0.1.0' },
      build: { revision: ctx.build.revision, dirty: false, package: { path: '/out/vibrato.mwrm', sha256: 'ab'.repeat(32) } }, edgeCases: { cases: [] } })
    expect(JSON.parse(JSON.stringify(rec)).steps).toHaveLength(STEPS.length)
    const md = recordMarkdown(rec)
    expect(md).toContain('### Test procedure: vibrato 0.1.0, 2026-11-20')
    expect(md).toContain('SHA-256 `' + 'ab'.repeat(32) + '`')
    expect(md).toContain('| 7 | Scripted unit pass | unit | not run: no unit session on /tmp/share.sock |')
    expect(md).toContain('| 1 | Software checks | host | passed |')
    expect(md).toContain('| 2 | Beside every other module | contract | passed |')
    expect(md).toContain('| Case | Why this change makes it a risk | How run | Result |\n|---|---|---|---|\n| | | | |')
    expect(md).toContain('Not tested on a unit: no unit session on /tmp/share.sock.')
    expect(md).toContain('Emulator results are not hardware evidence')
    // An effect suggests the instance and slot cases, every module the persistence ones.
    expect(md).toMatch(/- an effect slot: FX1 and FX2, both DSP cores/)
    expect(md).toMatch(/- persistence: saved in a Part/)
  })

  it('suggests edge cases from what the change touches', () => {
    expect(suggestEdgeCases({ kind: 'module', manifest: { category: 'system', compatibility: { effectId: null, uiClaims: ['key:FUNC+YES'] } } }).map(s => s.touches)).toEqual(['a key gesture', 'persistence'])
    expect(suggestEdgeCases({ kind: 'base', files: ['sdk/runtime/loader/loader.c', 'sdk/machines/octatrack/status.c'] }).map(s => s.touches)).toEqual(['the loader', 'load and admission', 'every installed module'])
  })

  it('its pull request lines satisfy the description check once the table has a row', async () => {
    const steps = await runProcedure(ctx, fakeDeps())
    const md = recordMarkdown(record(ctx, steps, { started: 0, finished: 1000, command: 'npm run test:procedure -- vibrato' }))
    const template = readFileSync(new URL('../.github/pull_request_template.md', import.meta.url), 'utf8')
    const filled = md.replace('| | | | |', '| FX2 on both cores at once | the change moved its state block | npm run device -- do pick:T1:FX2:VIBRATO pick:T5:FX2:VIBRATO | pass |')
    const body = 'Vibrato 0.1.1: the state block moves to Y memory, checked with pr:ready and the procedure.\n\nGuides: nothing.\n\n' + filled
    expect(bodyProblems(body, template, { files: ['public/octatrack-modules/vibrato/0.1.1.mwrm'] })).toEqual([])
    expect(bodyProblems('Vibrato 0.1.1: the state block moves to Y memory, checked with pr:ready and the procedure.\n\nGuides: nothing.\n\n' + md, template,
      { files: ['public/octatrack-modules/vibrato/0.1.1.mwrm'] })).toEqual([expect.stringMatching(/^This pull request changes what runs on an instrument.*edge cases/s)])
  })

  it('reads the checkout: a module id, a draft, a base and the unit session', () => {
    const root = join(import.meta.dirname, '..'), out = mkdtempSync(join(tmpdir(), 'procedure-'))
    const listed = context(root, { out, share: '/nonexistent.sock' }, ['vibrato'], {})
    expect(listed).toMatchObject({ kind: 'module', id: 'vibrato', source: true, draft: false, machine: 'octatrack', unit: { available: false } })
    expect(listed.unit.reason).toMatch(/no unit session on \/nonexistent.sock/)
    const published = context(root, { out, published: true, 'no-unit': true }, ['vibrato'], {})
    expect(published.pkg).toMatch(/public\/octatrack-modules\/vibrato\/.+\.mwrm$/)
    expect(published.unit.reason).toMatch(/--no-unit/)
    const base = context(root, { out, base: true }, [], { MODWERK_SHARE_SOCKET: '/nonexistent2.sock' })
    expect(base).toMatchObject({ kind: 'base', share: '/nonexistent2.sock' })
    expect(base.pkg).toMatch(/octatrack-base\.elemod$/)
    expect(base.setPackages.length).toBeGreaterThan(20)
    expect(() => context(root, { out }, ['no-such-module'], {})).toThrow(/No module named no-such-module/)
  })
})

describe('the target switch', () => {
  it('runs the same unit steps against an emulator session, labelled emulator, outside the unit queue', async () => {
    const deps = fakeDeps()
    const ctx = moduleCtx({ target: 'emulator', share: '/tmp/share.sock', env: { MODWERK_UNIT: 'emulator', MODWERK_DEV_SOCKET: '/tmp/emu-dev.sock' }, tools: { cycleScan: false, soak: false, unitQueue: true } })
    const steps = await runProcedure(ctx, deps)
    expect(deps.ran.some(line => line.startsWith('npm run unit'))).toBe(false)
    // The same commands as on the unit, with the emulator's session and no queue turn.
    expect(deps.ran).toContain('npm run device:test -- --share /tmp/share.sock --testing-entry /out/device-test.md --soak 120 /out/vibrato.mwrm')
    expect(deps.envs.at(-1)).toEqual({ MODWERK_UNIT: 'emulator', MODWERK_DEV_SOCKET: '/tmp/emu-dev.sock' })
    expect(steps.filter(step => step.unit).every(step => step.emulator)).toBe(true)
    expect(steps.find(step => step.id === 'cost-unit')).toMatchObject({ status: 'not run', reason: expect.stringMatching(/load figures are not the unit's/) })
    expect(steps.find(step => step.id === 'emulator')).toMatchObject({ status: 'not run', reason: expect.stringMatching(/--target emulator/) })
    const md = recordMarkdown(record(ctx, steps, { started: 0, finished: 1000, command: 'npm run test:procedure -- vibrato --target emulator' }))
    expect(md).toContain('| 7 | Scripted unit pass (emulator) | emulator | passed |')
    expect(md).toContain('Not tested on a unit: steps 6 to 10 ran on the emulator only')
    expect(md).not.toMatch(/^Tested on a unit/m)
  })

  it('reads --target and --dev-socket from the arguments, and refuses another target', () => {
    const root = join(import.meta.dirname, '..'), out = mkdtempSync(join(tmpdir(), 'procedure-'))
    const emu = context(root, { out, target: 'emulator', share: '/nonexistent.sock', 'dev-socket': '/tmp/d.sock' }, ['vibrato'], {})
    expect(emu).toMatchObject({ target: 'emulator', env: { MODWERK_UNIT: 'emulator', MODWERK_DEV_SOCKET: '/tmp/d.sock' }, unit: { available: false } })
    expect(emu.unit.reason).toMatch(/no emulator session on \/nonexistent.sock .*serve --emulator/)
    expect(context(root, { out }, ['vibrato'], {})).toMatchObject({ target: 'unit', env: {} })
    expect(() => context(root, { out, target: 'rack' }, ['vibrato'], {})).toThrow(/--target is unit or emulator/)
  })

  it('names the pyramid layer of every step', () => {
    expect(Object.keys(LAYER)).toEqual(STEPS.map(step => step.id))
    expect(new Set(Object.values(LAYER))).toEqual(new Set(['host', 'contract', 'emulator', 'target', 'unit']))
  })
})

describe('the real unit queue', () => {
  it('runs the unit steps as one turn of scripts/unit-queue.mjs, and a device command inside does not queue again', async () => {
    // The argv the runner hands to `npm run unit`, run by the real queue with a private state folder.
    const deps = fakeDeps(), exec = deps.exec, argvs = []
    deps.exec = (argv, ...rest) => { argvs.push(argv); return exec(argv, ...rest) }
    await runProcedure(moduleCtx({ tools: { unitQueue: true } }), deps)
    const queued = argvs.find(argv => argv.slice(0, 4).join(' ') === 'npm run unit --')
    const words = queued.slice(4, queued.indexOf('--', 4))
    expect(words.slice(0, 1)).toEqual(['run'])
    const queue = join(import.meta.dirname, 'unit-queue.mjs')
    // In place of the inner test:procedure: what device.mjs does when a device command starts inside the turn.
    const probe = `const q = await import(${JSON.stringify(queue)}); const t = await q.takeUnitTurn({ note: 'device try', waitMs: 2000 });` +
      'console.log(JSON.stringify({ nested: !!t?.nested, state: q.describe().state, turn: !!process.env.MODWERK_UNIT_TURN })); t?.release()'
    const env = { ...process.env, MODWERK_UNIT_DIR: mkdtempSync(join(tmpdir(), 'unit-queue-')) }
    for (const name of ['MODWERK_UNIT_TURN', 'MODWERK_UNIT', 'MODWERK_UNIT_WHO']) delete env[name]
    const run = spawnSync(process.execPath, [queue, ...words, '--', process.execPath, '--input-type=module', '-e', probe], { encoding: 'utf8', env, timeout: 20000 })
    expect(run.status, run.stderr).toBe(0)
    expect(JSON.parse(run.stdout.trim().split('\n').at(-1))).toEqual({ nested: true, state: 'held', turn: true })
    // And the turn is given back when the steps end.
    const after = spawnSync(process.execPath, [queue, 'status', '--json'], { encoding: 'utf8', env })
    expect(JSON.parse(after.stdout).state).toBe('free')
  })

  it('takes no turn for the emulator target: the runner tells the device commands so', async () => {
    const ctx = context(join(import.meta.dirname, '..'), { out: mkdtempSync(join(tmpdir(), 'procedure-')), target: 'emulator' }, ['vibrato'], {})
    expect(ctx.env.MODWERK_UNIT).toBe('emulator')
    const { takeUnitTurn } = await import('./unit-queue.mjs')
    expect(await takeUnitTurn({ env: { MODWERK_UNIT: 'emulator' } })).toBeNull()
  })
})
