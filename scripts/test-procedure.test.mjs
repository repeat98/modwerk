import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { context, LAYER, packageId, packSets, plan, poolFree, record, recordMarkdown, runProcedure, runSteps, STEPS, suggestEdgeCases } from './test-procedure.mjs'
import { chooserIndex } from './effect-names.mjs'
import { bodyProblems } from './pr-body.mjs'

const INVENTORY = '[{"name":"KITS","version":"0.2.0"}]'
const moduleCtx = (extra = {}) => ({ kind: 'module', id: 'vibrato', version: '0.1.0', machine: 'octatrack', source: true, draft: false, out: '/out', share: '/tmp/share.sock',
  soakSeconds: 120, tools: { cycleScan: false, soak: false, unitQueue: false }, build: { revision: 'e84798ebb0000000000000000000000000000000', dirty: false },
  unit: { available: true }, files: [], manifest: { category: 'effects', compatibility: { effectId: 9, uiClaims: [] } }, ...extra })

/** Fake tools: every command passes and device.mjs's inventory prints the same set, unless `fail` or `inventories` say otherwise. */
function fakeDeps({ fail = [], inventories = [INVENTORY, INVENTORY], files = {}, trialOutput = 'trial: 1234… running\nrolled back (pass --accept to keep it)', basePrices = 2, priceResults } = {}) {
  const ran = [], started = [], envs = []
  let clock = 0, inventory = 0
  return {
    ran, started, envs,
    now: () => (clock += 1000),
    exists: path => path in files || path.endsWith('.mwrm') || path.endsWith('.elemod'),
    read: path => files[path],
    sha256: () => 'ab'.repeat(32),
    size: () => 1000,
    ask: async () => 'ok 0 Elektron Octatrack',
    exec: async (argv, log, env) => {
      const line = argv.join(' ')
      ran.push(line)
      envs.push(env)
      if (argv[2] === 'unit' && files.onQueue) files.onQueue(argv)
      const code = fail.some(part => line.includes(part)) ? 1 : 0
      if (line.startsWith('npm run device:price')) { // its file, one result a package it priced
        const n = line.endsWith('.mwrm') ? 1 : basePrices
        files['/out/price.json'] = JSON.stringify({ results: priceResults ?? Array.from({ length: n }, (_, i) => ({
          id: 'm' + i, rolledBack: true, atRestAdds: { frame: 0 }, inUseAdds: { frame: 1 },
        })) })
      }
      if (line.includes('do memory')) return { code, output: 'pool: 1000 of 100000 bytes used; free 99000, largest free run 90000' }
      if (line.includes('device.mjs set ')) return { code, output: 'set: 2 changes\ntrial: ab… running\nverdict: no crash\nrolled back (pass --accept to keep it)' }
      return { code, output: line.endsWith('do inventory --socket /tmp/share.sock') ? inventories[Math.min(inventory++, inventories.length - 1)] : 'ok' }
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
      expect.stringMatching(/^npm run device:price -- --share \/tmp\/share.sock --out \/out\/price.json --scene .+ \/out\/vibrato.mwrm$/),
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
    expect(deps.ran).toContain('node scripts/octatrack-soak.mjs --seconds 120 --log /out/soak.json --midi 127.0.0.1:50124')
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
    expect(deps.ran).toContain('node scripts/device.mjs set /p/a.mwrm,/p/b.mwrm --seconds 30 --socket /tmp/share.sock')
    expect(deps.ran.find(line => line.startsWith('npm run device:price'))).toMatch(/--scene .+[^m]$/) // no package named: every USB package
    expect(steps.find(step => step.id === 'unit-pass').title).toBe('Large sets and Undo')
    expect(steps.find(step => step.id === 'soak')).toMatchObject({ status: 'not run', reason: expect.stringMatching(/#1770/) })
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

  it('leaves the unit and the compatibility gate to the machine\'s own tools for a module of another machine', () => {
    const ctx = moduleCtx({ machine: 'digitakt' })
    expect(plan(STEPS[0], ctx).commands).toEqual([['npm', 'run', 'module:doctor', '--', 'vibrato']])
    for (const step of STEPS.filter(step => step.unit || step.id === 'compat')) expect(plan(step, ctx).skip).toMatch(/drive the Octatrack/)
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

describe('what the first base run on a unit found (20 November 2026)', () => {
  const baseCtx = (extra = {}) => moduleCtx({ kind: 'base', id: undefined, version: '0.7', pkg: '/r/octatrack-base.elemod', tools: { cycleScan: false, soak: true, unitQueue: false },
    startInventory: JSON.parse(INVENTORY), ...extra })
  const unitPass = STEPS.find(step => step.id === 'unit-pass'), soakStep = STEPS.find(step => step.id === 'soak')

  it('packs the packages into as few sets as cover them, each as large as the pool takes', () => {
    const packages = [5, 1, 4, 2, 3, 6].map((kb, i) => ({ path: `/p/m${i}.mwrm`, bytes: kb * 1000 }))
    const sets = packSets(packages, 10000)
    for (const set of sets) expect(set.reduce((sum, pkg) => sum + pkg.bytes, 0)).toBeLessThanOrEqual(10000)
    expect(new Set(sets.flat().map(pkg => pkg.path))).toEqual(new Set(packages.map(pkg => pkg.path)))
    expect(sets.length).toBe(3) // 21 KB in all, 10 KB a set
    // Each set is filled up: no package left out of it would still fit.
    for (const set of sets) {
      const total = set.reduce((sum, pkg) => sum + pkg.bytes, 0)
      expect(packages.filter(pkg => !set.includes(pkg)).every(pkg => total + pkg.bytes > 10000)).toBe(true)
    }
    // One larger than the pool goes alone, for the base to refuse with its reason; the rest still pack.
    expect(packSets([{ path: '/p/huge.mwrm', bytes: 50000 }, { path: '/p/a.mwrm', bytes: 1000 }], 10000).map(set => set.map(pkg => pkg.path))).toEqual([['/p/a.mwrm'], ['/p/huge.mwrm']])
    // At most so many packages a set, whatever the bytes: a set's modules are bits of a 32-bit mask.
    const many = Array.from({ length: 36 }, (_, i) => ({ path: `/p/n${String(i).padStart(2, '0')}.mwrm`, bytes: 100 }))
    const counted = packSets(many, 1e9, 26)
    expect(counted.map(set => set.length)).toEqual([26, 26])
    expect(new Set(counted.flat()).size).toBe(36)
    expect(packageId('/r/public/octatrack-modules/ring-sc/0.1.0-experimental.mwrm')).toBe('ring-sc')
    expect(poolFree('pool: 120000 of 524288 bytes used; free 404288, largest free run 400000 (99 % of free)')).toEqual({ used: 120000, size: 524288, free: 404288, largest: 400000 })
  })

  it('runs step 7 of a base as sets that fit, splits a set the base refuses for memory, and records which set held which package', async () => {
    const deps = fakeDeps({ inventories: [INVENTORY] })
    const sizes = { a: 40000, b: 30000, c: 20000, d: 10000 }
    deps.size = path => sizes[/\/(\w)\.mwrm$/.exec(path)[1]]
    const exec = deps.exec
    let sets = 0
    deps.exec = async (argv, ...rest) => {
      const line = argv.join(' ')
      if (line.includes('do memory')) return { code: 0, output: 'pool: 0 of 70000 bytes used; free 70000, largest free run 70000' }
      // The base's footprint is more than the files' bytes: the first set does not fit after all.
      if (line.includes('device.mjs set ') && sets++ === 0) return deps.ran.push(line) && { code: 0, output: 'set: 3 changes\nrefused: Device refused commit: backend. (loader refusal 2 RUNTIME_MEMORY: no room)' }
      return exec(argv, ...rest)
    }
    const ctx = baseCtx({ setPackages: ['/p/a.mwrm', '/p/b.mwrm', '/p/c.mwrm', '/p/d.mwrm'] })
    const [result] = await runSteps(['unit-pass'], ctx, deps)
    expect(result.status).toBe('passed')
    const setLines = deps.ran.filter(line => line.includes('device.mjs set '))
    expect(setLines[0]).toBe('node scripts/device.mjs set /p/a.mwrm,/p/b.mwrm --seconds 30 --socket /tmp/share.sock') // 70 KB: the two largest
    expect(setLines.length).toBe(4) // refused, its two halves, then the set for c and d (filled up with b)
    expect(result.sets.map(set => [set.packages.join('+'), set.result.split(' (')[0].split(':')[0]])).toEqual([
      ['a+b', 'refused for memory'], ['a', 'passed, rolled back'], ['b', 'passed, rolled back'], ['b+c+d', 'passed, rolled back']])
    expect(result.details[0]).toMatch(/pool 70000 bytes, 70000 free .*at most 31 a set beside the 1 installed/)
    expect(result.details).toContain('set 4 (3 packages, 60000 bytes): passed, rolled back: b, c, d')
    // Every set is followed by the inventory, checked against the start.
    expect(deps.ran.filter(line => line.endsWith('do inventory --socket /tmp/share.sock')).length).toBe(3)
  })

  it('fails step 7 when a set does not roll back or the inventory does not come back, and stops there', async () => {
    const deps = fakeDeps({ inventories: ['[]'] })
    const [result] = await runSteps(['unit-pass'], baseCtx({ setPackages: ['/p/a.mwrm', '/p/b.mwrm'] }), deps)
    expect(result.status).toBe('failed')
    expect(result.reason).toMatch(/inventory after it differs/)
  })

  it('soaks through the bridge that answers ping', async () => {
    const deps = fakeDeps(), started = []
    deps.start = argv => { started.push(argv.join(' ')); return { waitFor: async () => {}, stop: async () => ({ output: 'rolled back' }) } }
    const [result] = await runSteps(['soak'], baseCtx(), deps)
    expect(result.status).toBe('passed')
    expect(started).toEqual([])
    expect(deps.ran).toContain('node scripts/octatrack-soak.mjs --seconds 120 --log /out/soak.json --midi 127.0.0.1:50124')
    expect(result.details[0]).toMatch(/127\.0\.0\.1:50124: it answered ping/)
  })

  it('leaves a bridge that refuses alone, starts its own on a free port for the run and stops it after', async () => {
    const deps = fakeDeps(), events = []
    deps.ask = async (host, port) => port === 50124 ? 'error: midiOutShortMsg refused fe' : port === 50125 ? 'ok 0 someone else' : null
    deps.start = argv => {
      events.push('start ' + argv.join(' '))
      return { waitFor: async pattern => { if (!pattern.test('MIDI to Elektron Octatrack on 127.0.0.1:50126')) throw new Error('no') }, stop: async () => { events.push('stop'); return { output: '' } }, output: () => '' }
    }
    const [result] = await runSteps(['soak'], baseCtx(), deps)
    expect(result.status).toBe('passed')
    expect(events).toEqual(['start python3 -B scripts/octatrack-midi-bridge.py 50126', 'stop']) // 50125 is someone else's
    expect(deps.ran).toContain('node scripts/octatrack-soak.mjs --seconds 120 --log /out/soak.json --midi 127.0.0.1:50126')
    expect(result.details[0]).toMatch(/the runner's own on 127\.0\.0\.1:50126, stopped after the run \(the one on 50124 answered "error: midiOutShortMsg refused fe"\)/)
    expect(result.commands.at(-1)).toMatch(/--midi 127\.0\.0\.1:50126$/)
  })

  it('stops its own bridge even when the soak fails, and says so when no bridge can be had at all', async () => {
    const deps = fakeDeps({ fail: ['octatrack-soak.mjs'] }), events = []
    deps.ask = async () => null
    deps.start = () => ({ waitFor: async () => {}, stop: async () => { events.push('stop'); return { output: '' } }, output: () => '' })
    const [failed] = await runSteps(['soak'], baseCtx(), deps)
    expect(failed.status).toBe('failed')
    expect(events).toEqual(['stop'])
    const none = fakeDeps()
    none.ask = async () => null
    none.start = () => ({ waitFor: async () => { throw new Error('exited') }, stop: async () => ({ output: '' }), output: () => 'No MIDI output named like \'Octatrack\': none' })
    const [result] = await runSteps(['soak'], baseCtx(), none)
    expect(result).toMatchObject({ status: 'failed', reason: expect.stringMatching(/no MIDI bridge answers on 127\.0\.0\.1:50124 and none could be started/) })
  })

  it('names a bridge command for the computer the unit is on (MODWERK_MIDI_BRIDGE) and the address (--midi)', () => {
    const ctx = context(join(import.meta.dirname, '..'), { out: mkdtempSync(join(tmpdir(), 'procedure-')), base: true, midi: '127.0.0.1:50130' }, [], { MODWERK_MIDI_BRIDGE: 'cmd.exe /c C:\\mw\\bridge.cmd' })
    expect(ctx.midi).toBe('127.0.0.1:50130')
    expect(ctx.bridgeCommand).toEqual(['sh', '-c', 'exec cmd.exe /c C:\\mw\\bridge.cmd "$0"'])
    expect(plan(soakStep, ctx).commands[0].slice(-2)).toEqual(['--midi', '127.0.0.1:50130'])
    expect(plan(unitPass, ctx).run).toBe('base-sets')
  })

  it('keeps every price: one module\'s failed pick is its own line, and only an unsafe or short run fails step 9', async () => {
    const deps = fakeDeps({ priceResults: [
      { id: 'everb', rolledBack: true, atRestAdds: { frame: 0 } },
      { id: 'ring-sc', rolledBack: true, atRestAdds: { frame: 0 }, inUseError: 'picking SC Ringmod: No SC Ringmod in the FX2 chooser.' },
    ] })
    const ctx = baseCtx({ setPackages: ['/p/everb.mwrm', '/p/ring-sc.mwrm'] })
    const [result] = await runSteps(['cost-unit'], ctx, deps)
    expect(result.status).toBe('passed')
    expect(result.details).toEqual(['1 of 2 packages priced (2 processed)', 'ring-sc: in use not measured: picking SC Ringmod: No SC Ringmod in the FX2 chooser.'])
    const [short] = await runSteps(['cost-unit'], baseCtx({ setPackages: ['/p/a.mwrm', '/p/b.mwrm', '/p/c.mwrm'] }), deps)
    expect(short).toMatchObject({ status: 'failed', reason: 'device:price stopped after 2 of 3 packages' })
    const md = recordMarkdown(record(ctx, [result], { started: 0, finished: 1000, command: 'x' }))
    expect(md).toContain('- Step 1: ring-sc: in use not measured')
  })

  it.each([
    [{ refused: 'the loader refused the package' }, 'not installed: the loader refused the package'],
    [{}, 'at rest not measured; in use not measured'],
    [{ atRestAdds: { frame: 0 } }, 'in use not measured'],
  ])('fails a single-module price when the receipt lacks a required reading (%j)', async (receipt, reason) => {
    const deps = fakeDeps({ priceResults: [{ id: 'vibrato', rolledBack: true, ...receipt }] })
    const [result] = await runSteps(['cost-unit'], moduleCtx(), deps)
    expect(result).toMatchObject({
      status: 'failed',
      reason: 'vibrato: ' + reason,
      details: ['0 of 1 packages priced (1 processed)', 'vibrato: ' + reason],
    })
  })

  it('finds an effect in the chooser by the name the package gives it', () => {
    const names = ['FILTER', null, 'SPECTRUM79', 'RINGMOD SC', 'BBD DELAY']
    expect(chooserIndex(names, 'SC Ringmod')).toBe(3) // the same words in another order
    expect(chooserIndex(names, 'BBD Delay')).toBe(4)
    expect(chooserIndex(names, 'Spectrum')).toBe(2) // the chooser's name says more
    expect(chooserIndex(names, 'RINGMOD_SC')).toBe(3)
    expect(chooserIndex(names, 'Mini Verb')).toBe(-1)
  })
})
