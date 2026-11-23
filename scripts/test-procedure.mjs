// The test procedure every change to a module or a base goes through (docs/TEST_PROCEDURE.md), as one command. It runs the
// fixed steps in order, each with the tool that already does it, and stops at the first failure. Without a unit session the
// unit steps are recorded as not run, with the command each would have run. It writes the record for the named build: the
// source revision and the package's SHA-256, each step's result and log, an empty edge-case table and what is left for the
// developer. Nothing is kept, flashed or power-cycled: those stay the developer's (docs/OCTATRACK_DRIVING.md).
//
//   npm run test:procedure -- <module id> [--package FILE.mwrm | --published]   # a module: built from source unless given
//   npm run test:procedure -- --base [--package FILE.elemod]                     # a base, with the large set of every package
//   npm run test:procedure -- --base analog-rytm-mkii | <machine>:<module id>    # every machine runs the same steps: its own tool
//                                                       # where it has one (MACHINE_STEPS), else the step is recorded not run, with why
//   npm run test:procedure -- … --stock STOCK.syx --elemod BASE.elemod --label XX01   # an elemod machine: link the test image (read
//                                                       # where it lies, never copied), or name one with --package IMAGE.syx
//   npm run test:procedure -- … --link --cases DIR --emu DTBOOT   # the Rytm: drive the unit over its development link (a RAM boot
//                                                       # restarts it: with its owner's OK), its rytm_test.py cases, rytm-emu
//   npm run test:procedure -- … --plan                  # the steps and their commands, nothing run
//   npm run test:procedure -- … --share SOCKET          # the unit session (npm run device -- serve --share SOCKET); default
//                                                       # MODWERK_SHARE_SOCKET or /tmp/modwerk-share.sock. Without one: no unit steps
//   npm run test:procedure -- … --no-unit               # leave the unit alone even when a session is shared
//   npm run test:procedure -- … --emulator-socket SOCK  # step 5: an ot_emu USB bench (--usb-host) running a development base
//   npm run test:procedure -- … --target emulator --share SOCK --dev-socket SOCK   # steps 6 to 10 against an emulator session
//                                                       # (npm run device -- serve --emulator): the same cases, never hardware evidence
//   npm run test:procedure -- … --out DIR --soak-seconds 120 --scene "A01, Part 1, stopped"
//
// With the unit queue (`npm run unit`, when the repository has it) the unit steps run as one turn of it, so no other session
// takes the unit between reading it and checking it was put back.
import { spawn, execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join, relative, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { pathToFileURL } from 'node:url'

export const ROOT = resolve(import.meta.dirname, '..')
const SOAK_TOOL = 'scripts/octatrack-soak.mjs', SCAN_TOOL = 'scripts/cycle-scan.mjs'
const CURVE_TRACKS = 'T1,T3,T6,T7' // empty tracks of the test bank (docs/MODULE_PERFORMANCE.md)
const DEFAULT_SCENE = 'the bank, pattern and Part the unit was on, transport stopped (test:procedure)'

/** What the developer, the submitter, judges at their own unit after the agent's steps passed on this build (modwerk-test-on-unit,
 * stage 2). The reviewer reads the record and never has to repeat it (docs/TEST_PROCEDURE.md#who-runs-it). */
export const DEVELOPER = {
  module: ['how it sounds and plays, and timing by ear', 'MIDI, scenes and recording with it', 'it beside the other modules installed on their unit',
    'two instances with different settings, on both FX slots and both DSP cores where it can (docs/MODULE_QUALIFICATION.md)',
    'Part reload, project save and reload, and a power cycle with it saved: what survives (the Keep and the power cycle are theirs)'],
  base: ['playback across Part and pattern changes with their own set, by ear', 'the Keep, then a power cycle: the kept set comes back',
    'their modules on the base after the RAM boot back to the flashed base', 'anything the change names that only a person hears or sees'],
}
/** What the agent does by hand on the unit inside a trial, which no script covers yet (modwerk-test-on-unit, stage 1). */
export const BY_HAND = {
  module: ['every control and screen by the README\'s button steps, a png: screenshot of each, compared with the README and its UI claims',
    'MAIN and CUE recorded over USB (rec) with a sustained sound, checked for dropouts (runs of exact zeros, a block played twice)'],
  base: ['RAM boot the candidate\'s development build and back to the starting base, and check the starting modules came back (nothing is kept; a flash or a power cycle is always the unit owner\'s)',
    'USB captures of MAIN with the large set installed, across Part switches and pattern changes, checked for dropouts'],
}

/** The fixed steps, in order. `unit` steps need the shared session; `hand` steps are never automated. */
export const STEPS = [
  { id: 'software', title: 'Software checks', applies: 'both' },
  { id: 'compat', title: 'Beside every other module', applies: 'both' },
  { id: 'build', title: 'Name the build', applies: 'both' },
  { id: 'cost-model', title: 'DSP cost model', applies: 'both' },
  { id: 'emulator', title: 'Emulator rehearsal', applies: 'both' },
  { id: 'unit-read', title: 'Read the unit', applies: 'both', unit: true },
  { id: 'unit-pass', title: 'Scripted unit pass', baseTitle: 'Large set and Undo', applies: 'both', unit: true },
  { id: 'soak', title: 'Soak', applies: 'both', unit: true },
  { id: 'cost-unit', title: 'Cost on the unit', applies: 'both', unit: true },
  { id: 'restore', title: 'Put back', applies: 'both', unit: true },
  { id: 'by-hand', title: 'Agent by hand', applies: 'both', hand: true },
  { id: 'developer', title: 'Submitter\'s own stage', applies: 'both', hand: true },
]

export const titleOf = (step, ctx) => (ctx.kind === 'base' && step.baseTitle) || step.title
const q = arg => /^[\w@%+=:,./-]+$/.test(arg) ? arg : `'${arg.replaceAll("'", "'\\''")}'`
export const shown = argv => argv.map(q).join(' ')
const npmRun = (script, ...args) => ['npm', 'run', script, ...(args.length ? ['--', ...args] : [])]
const node = (...args) => ['node', ...args]

/** Where the build step writes a package built from source. */
export const builtPackage = ctx => join(ctx.out, (ctx.id ?? 'base') + (other(ctx) ? '.syx' : ctx.kind === 'module' ? '.mwrm' : '.elemod'))
const other = ctx => !!ctx.machine && ctx.machine !== 'octatrack'
/** The layer of the test pyramid a step stands on (docs/TEST_PROCEDURE.md): a claim is proven on the lowest layer that can prove it. */
export const LAYER = { software: 'host', compat: 'contract', build: 'host', 'cost-model': 'contract', emulator: 'emulator', 'unit-read': 'target',
  'unit-pass': 'target', soak: 'target', 'cost-unit': 'unit', restore: 'target', 'by-hand': 'target', developer: 'unit' }
const EMULATOR_FIGURES = 'the emulator\'s load figures are not the unit\'s (DMA is instant, no DSP timing): docs/OCTATRACK_HARDWARE_TRAPS.md#the-emulator-and-the-tools'

const RYTM = 'sdk/machines/analog-rytm-mkii/tools/'
const py = (...args) => ['python3', '-B', ...args]
const rytmGap = (ctx, image) => !image ? 'no test image: step 3 named none' : !ctx.cases?.length ? `no cases: write them in ${RYTM}cases/${ctx.id}/ (TEST_RUNNER.md) or pass --cases DIR` : null
/** Another machine's own tool for a step, where it has one (docs/TEST_PROCEDURE.md#every-machine). A step a machine has no entry for
 * is recorded not run, with what is missing (GAP), so the record shows what the machine still lacks. */
export const MACHINE_STEPS = {
  'analog-rytm-mkii': {
    emulator: (ctx, image) => rytmGap(ctx, image) ? { skip: rytmGap(ctx, image) } : !ctx.emu ? { skip: 'no rytm-emu: --emu DTBOOT or RYTM_EMU (npm run upstream:tools, then cargo build --release in its checkout)' }
      : { commands: [py(RYTM + 'rytm_test.py', 'emu', image, ...ctx.cases, '--emu', ctx.emu, '--out', join(ctx.out, 'emulator'))], emulator: true },
    'unit-read': () => ({ commands: [py(RYTM + 'rytm_link.py', 'ident')] }),
    // The RAM boot writes nothing to the flash; the image runs until the unit owner's power cycle brings the flashed base back.
    'unit-pass': (ctx, image) => rytmGap(ctx, image) ? { skip: rytmGap(ctx, image) } : { commands: [py(RYTM + 'rytm_link.py', 'ramboot', image, '--label', ctx.label ?? 'TEST'),
      py(RYTM + 'rytm_test.py', 'unit', ...ctx.cases, '--label', ctx.startInventory?.label ?? '<the flashed label step 6 reads>', '--image', image, '--allow-state-change', '--out', join(ctx.out, 'unit'))] },
    'cost-unit': () => ({ skip: 'no price on the unit for the Rytm yet: read the audio load (core_audio_load, the base\'s CPU reading) with and without the change by hand, and record both' }),
    restore: () => ({ commands: [py(RYTM + 'rytm_link.py', 'ident')], compare: 'unit-read' }),
  },
}
const GAP = {
  compat: name => `modules:compat compares the Octatrack's modules only; ${name} has no gate beside every other module yet: its link refuses two modules on one site, so link the image beside the modules it must work with`,
  'cost-model': () => 'the DSP cycle scan models the Octatrack\'s DSP only',
  emulator: name => `${name} has no scripted emulator rehearsal yet`,
  unit: name => `${name} has no USB link the procedure drives yet: the machine recipe's next piece (docs/MACHINE_RECIPE.md#where-each-machine-stands)`,
  soak: name => `no soak for ${name} yet (scripts/octatrack-soak.mjs drives the Octatrack)`,
  'cost-unit': name => `no price on the unit for ${name} yet (device:price reads the Octatrack's frame interrupt)`,
}

/** A step for a machine other than the Octatrack: its own tool from MACHINE_STEPS, or the gap. */
function machinePlan(step, ctx) {
  const name = ctx.machineName ?? ctx.machine, image = ctx.pkg ?? (ctx.linkable ? builtPackage(ctx) : undefined)
  if (step.id === 'build') {
    if (ctx.pkg) return { commands: [] }
    if (ctx.linkable) return { commands: [node('scripts/link-image.mjs', '--stock', ctx.stock, '--version', ctx.label, '--out', image, '--elemod', ctx.elemod, ...(ctx.kind === 'module' ? ['--module', ctx.machine + ':' + ctx.id] : []))] }
    return { skip: ctx.platform === 'elemod' ? 'no test image: pass --package IMAGE.syx, or --stock STOCK.syx --elemod BASE.elemod --label XX01 to link one (scripts/link-image.mjs; a development base: npm run machine:base -- ' + ctx.machine + ' --stock STOCK.syx --dev --out DIR)' : 'name the build with --package FILE (its revision and SHA-256)' }
  }
  const own = MACHINE_STEPS[ctx.machine]?.[step.id]
  if (own) return own(ctx, image)
  return { skip: (GAP[step.id] ?? GAP.unit)(name) }
}

/** The commands each step runs for this target, or why it is not run. Pure: everything it reads is in ctx. */
export function plan(step, ctx) {
  const module = ctx.kind === 'module', pkg = ctx.pkg ?? builtPackage(ctx)
  const set = (ctx.setPackages ?? []).join(',')
  if (other(ctx) && !['software', 'by-hand', 'developer'].includes(step.id)) return machinePlan(step, ctx)
  switch (step.id) {
    case 'software':
      if (!module) return { commands: [npmRun('sdk:check')] }
      if (!ctx.source) return { skip: 'no module source for ' + ctx.id + ' in this checkout' }
      return { commands: [npmRun('module:doctor', ...(ctx.draft ? ['--draft'] : []), ctx.id)] }
    case 'compat':
      if (!module) return { commands: [npmRun('modules:compat')] }
      if (!ctx.source) return { skip: 'no module source for ' + ctx.id + ' in this checkout' }
      if (ctx.draft) return { skip: 'a draft is judged beside every other module by module:doctor --draft (its compatibility line, step 1)' }
      return { commands: [npmRun('modules:compat', ctx.id)] }
    case 'build':
      if (ctx.pkg) return { commands: [] }
      if (!module) return { commands: [] }
      return { commands: [npmRun('module:dev', ctx.id, '--build-only', ...(ctx.draft === false && ctx.alsoDraft ? ['--listed'] : []), '--out', pkg)] }
    case 'cost-model':
      if (!ctx.tools?.cycleScan) return { skip: 'the DSP cycle scan (' + SCAN_TOOL + ') is not in this checkout: merge main' }
      return { commands: [node(SCAN_TOOL, 'check')] }
    case 'emulator':
      if (ctx.target === 'emulator') return { skip: 'steps 6 to 10 run on the emulator (--target emulator)' }
      if (!ctx.emulatorSocket) return { skip: 'no emulator session (--emulator-socket SOCK, an ot_emu with --usb-host on a development base)' }
      return { commands: [module ? node('scripts/device.mjs', 'try', pkg, '--seconds', '20', '--emulator', '--socket', ctx.emulatorSocket)
        : node('scripts/device.mjs', 'set', set, '--seconds', '20', '--emulator', '--socket', ctx.emulatorSocket)], emulator: true }
    case 'unit-read':
      return { commands: [node('scripts/device.mjs', 'status', '--socket', ctx.share), node('scripts/device.mjs', 'do', 'inventory', '--socket', ctx.share)] }
    case 'unit-pass':
      if (!module) return { commands: [node('scripts/device.mjs', 'set', set, '--seconds', '30', '--socket', ctx.share)] }
      return { commands: [npmRun('device:test', '--share', ctx.share, '--testing-entry', join(ctx.out, 'device-test.md'),
        ...(ctx.tools?.soak ? [] : ['--soak', String(ctx.soakSeconds)]), pkg)] }
    case 'soak': {
      if (ctx.target === 'emulator' && ctx.tools?.soak) return { skip: 'the fast soak sends USB MIDI to the unit\'s port, which the emulator has not' }
      if (!ctx.tools?.soak) return module ? { inside: 'unit-pass', note: 'ran inside the scripted pass as device:test --soak ' + ctx.soakSeconds + '; the fast seeded soak (' + SOAK_TOOL + ', pull request #1770) is not in this checkout yet' }
        : { skip: 'the fast seeded soak (' + SOAK_TOOL + ', pull request #1770) is not in this checkout yet' }
      const soak = node(SOAK_TOOL, '--seconds', String(ctx.soakSeconds), '--log', join(ctx.out, 'soak.json'))
      // A module soaks inside a trial of its own, rolled back at the end; a base soaks with whatever the unit runs.
      return module ? { commands: [soak], trial: node('scripts/device.mjs', 'try', pkg, '--seconds', String(ctx.soakSeconds + 300), '--socket', ctx.share) } : { commands: [soak] }
    }
    case 'cost-unit':
      if (ctx.target === 'emulator') return { skip: EMULATOR_FIGURES }
      if (module && ctx.baseBound) return { skip: 'a base-bound package: device:price leaves it out, since a development twin does not trust it' }
      // A module also reads its instance curve and runs the admission test (alone on the empty and the medium pattern: admitted,
      // nothing dropped), and device:price fails the step when either does not carry a release (owner, 23 November 2026).
      return { commands: [npmRun('device:price', '--share', ctx.share, '--out', join(ctx.out, 'price.json'), '--scene', ctx.scene ?? DEFAULT_SCENE,
        ...(module ? ['--curve', CURVE_TRACKS, ...(ctx.pickPattern ? ['--pick-pattern', ctx.pickPattern] : []), ...(ctx.measurePattern ? ['--measure-pattern', ctx.measurePattern] : []), pkg] : ctx.priceModules ?? []))] }
    case 'restore':
      return { commands: [node('scripts/device.mjs', 'do', 'inventory', '--socket', ctx.share)], compare: 'unit-read' }
    case 'by-hand': return { todo: BY_HAND[ctx.kind] }
    case 'developer': return { todo: DEVELOPER[ctx.kind] }
  }
  throw new Error('No step ' + step.id)
}

/** The last line of the output that reads as JSON: device.mjs's inventory step prints one. */
export function lastJson(text) {
  for (const line of (text ?? '').trim().split('\n').reverse()) { try { return JSON.parse(line) } catch { /* not this line */ } }
  return undefined
}
/** What step 6 reads and step 10 compares: device.mjs's inventory, or the label of the flashed image a link's ident prints
 * (rytm_link.py ident names it also while another image runs from RAM, so an equal label means the flash was not written). */
export const reading = text => lastJson(text) ?? (/^label: (.*)$/m.exec(text ?? '') ? { label: /^label: (.*)$/m.exec(text)[1] } : undefined)

/** Run the steps in `ids`, in the fixed order, stopping at the first failure. deps.exec(argv, logFile) -> {code, output};
 * deps.start(argv, logFile) -> {waitFor(regex, ms), stop()} for a trial held across another command. */
export async function runSteps(ids, ctx, deps, results = []) {
  const failed = () => results.find(result => result.status === 'failed')
  for (const step of STEPS.filter(step => ids.includes(step.id))) {
    const result = { id: step.id, title: titleOf(step, ctx), layer: LAYER[step.id], unit: !!step.unit, status: 'not run', commands: [], seconds: 0 }
    if (step.unit && ctx.target === 'emulator') result.emulator = true
    results.push(result)
    const stop = failed()
    const p = plan(step, ctx)
    result.commands = [...(p.trial ? [p.trial] : []), ...(p.commands ?? [])].map(shown)
    if (p.emulator) result.emulator = true
    if (stop && stop !== result) { result.reason = `stopped: step ${STEPS.findIndex(s => s.id === stop.id) + 1} (${stop.title}) failed`; continue }
    if (p.skip) { result.reason = p.skip; continue }
    if (step.unit && !ctx.unit?.available) { result.reason = ctx.unit?.reason ?? 'no unit session'; continue }
    if (p.todo) { result.status = 'to do'; result.todo = p.todo; continue }
    if (p.inside) {
      const host = results.find(r => r.id === p.inside)
      result.status = host?.status === 'passed' ? 'passed' : 'not run'
      result.reason = p.note
      continue
    }
    const started = deps.now()
    const log = join(ctx.out, 'logs', `${String(STEPS.indexOf(step) + 1).padStart(2, '0')}-${step.id}.log`)
    result.log = relative(ctx.out, log)
    try {
      let trial
      if (p.trial) {
        trial = deps.start(p.trial, log, ctx.env)
        await trial.waitFor(/^trial:.*running$/m, 60000)
      }
      const outputs = []
      let code = 0
      for (const argv of p.commands) {
        const run = await deps.exec(argv, log, ctx.env)
        outputs.push(run.output ?? '')
        if (run.code !== 0) { code = run.code; result.reason = `exit ${run.code}: ${shown(argv)}`; break }
      }
      if (trial) {
        const end = await trial.stop()
        if (/^accepted$/m.test(end.output ?? '')) { code ||= 1; result.reason ??= 'the trial was kept: it must roll back' }
        else if (!/^rolled back/m.test(end.output ?? '')) { code ||= 1; result.reason ??= 'the trial did not report its rollback' }
      }
      if (code === 0 && step.id === 'build') {
        ctx.pkg ??= builtPackage(ctx)
        if (!deps.exists(ctx.pkg)) { code = 1; result.reason = 'no package at ' + ctx.pkg }
        else ctx.build.package = { path: ctx.pkg, sha256: deps.sha256(ctx.pkg) }
      }
      if (code === 0 && step.id === 'unit-read') ctx.startInventory = reading(outputs.at(-1))
      if (code === 0 && p.compare) {
        const now = reading(outputs.at(-1))
        if (JSON.stringify(now) !== JSON.stringify(ctx.startInventory)) { code = 1; result.reason = 'the inventory differs from the one read first: ' + JSON.stringify(ctx.startInventory) + ' then ' + JSON.stringify(now) }
      }
      result.status = code === 0 ? 'passed' : 'failed'
    } catch (error) {
      result.status = 'failed'
      result.reason = error.message
    }
    result.seconds = Math.round((deps.now() - started) / 100) / 10
  }
  return results
}

/** The whole procedure: the steps before the unit here, the unit steps in one turn of the unit queue when there is one. */
export async function runProcedure(ctx, deps) {
  const local = STEPS.filter(step => !step.unit && !step.hand).map(step => step.id)
  const unit = STEPS.filter(step => step.unit).map(step => step.id)
  const results = await runSteps(local, ctx, deps)
  const blocked = results.some(result => result.status === 'failed')
  if (!blocked && ctx.unit?.available && ctx.tools?.unitQueue && ctx.target !== 'emulator') {
    const file = join(ctx.out, 'unit-steps.json')
    const argv = ['npm', 'run', 'unit', '--', 'run', '--note', `test:procedure ${ctx.id ?? 'base'} ${ctx.build.revision.slice(0, 8)}`, '--expect', ctx.kind === 'base' ? '45m' : '15m', '--',
      'node', 'scripts/test-procedure.mjs', ...(ctx.kind === 'base' ? ['--base', ...(other(ctx) ? [ctx.machine] : [])] : [other(ctx) ? ctx.machine + ':' + ctx.id : ctx.id]), '--package', ctx.pkg, '--share', ctx.share, '--out', ctx.out, ...(ctx.passOn ?? []),
      '--soak-seconds', String(ctx.soakSeconds), ...(ctx.scene ? ['--scene', ctx.scene] : []), ...(ctx.pickPattern ? ['--pick-pattern', ctx.pickPattern] : []), ...(ctx.measurePattern ? ['--measure-pattern', ctx.measurePattern] : []), ...(ctx.devSocket ? ['--dev-socket', ctx.devSocket] : []), '--unit-phase', file]
    const started = deps.now(), run = await deps.exec(argv, join(ctx.out, 'logs', 'unit-queue.log'))
    const inner = deps.exists(file) ? JSON.parse(deps.read(file)) : null
    if (inner) results.push(...inner)
    else {
      await runSteps(unit, { ...ctx, unit: { available: false, reason: 'the unit queue run ended without a result (exit ' + run.code + ')' } }, deps, results)
      results.find(result => result.id === 'unit-read').status = 'failed'
      results.find(result => result.id === 'unit-read').seconds = Math.round((deps.now() - started) / 100) / 10
    }
  } else await runSteps(unit, ctx, deps, results)
  await runSteps(STEPS.filter(step => step.hand).map(step => step.id), ctx, deps, results)
  return results
}

/** Where a change touches, the edge cases it asks for: a starting list from the manifest and the changed files, never the whole
 * answer (docs/TEST_PROCEDURE.md#edge-cases). */
export const TOUCHES = [
  { when: c => c.manifest?.compatibility?.effectId != null, touches: 'an effect slot', ask: 'FX1 and FX2, both DSP cores, eight instances at once; one edited while another plays', see: 'MODULE_QUALIFICATION.md#essential-persistence-and-instance-checks--8-october-2026' },
  { when: c => (c.manifest?.compatibility?.uiClaims ?? []).some(claim => claim.startsWith('key:')), touches: 'a key gesture', ask: 'the gesture in menus, SETUP pages, dialogs and the message box; a quick second press; a module holding a neighbouring gesture', see: 'OCTATRACK_MODULE_EDGE_CASES.md#key-gestures-in-windows' },
  { when: c => (c.manifest?.compatibility?.uiClaims ?? []).some(claim => claim.startsWith('screen:')), touches: 'a page of its own', ask: 'the page open when the trial ends or Undo runs; the page open during a Part or bank change', see: 'OCTATRACK_DRIVING.md' },
  { when: c => c.manifest?.category === 'machines', touches: 'a track machine', ask: 'the project naming it after it is removed (MISSING); a Part change into a Part that uses it while playing', see: 'OCTATRACK_MODULE_EDGE_CASES.md#projects-and-the-installed-modules' },
  { when: c => ['playback', 'midi-usb', 'scenes'].includes(c.manifest?.category), touches: 'timing', ask: 'the slowest and fastest tempo, track speed and swing; pattern and bank changes on the beat; the arranger', see: 'module-guides/sequencing.md' },
  { when: c => /\b(buffer|memory|pool|bytes|words)\b/i.test(JSON.stringify(c.manifest?.resources?.storage ?? '')), touches: 'memory', ask: 'the module pool nearly full; a delay buffer next to it; the largest set it can join', see: 'OCTATRACK_HARDWARE_TRAPS.md#dsp-loader-dynamic-dsp-code' },
  { when: c => c.kind === 'module', touches: 'persistence', ask: 'saved in a Part, then a Part reload, a project reload and a power cycle; removed while a saved Part still names it', see: 'OCTATRACK_MODULE_EDGE_CASES.md#copying-and-saving' },
  { when: c => c.files.some(f => /loader|modset|runtime/i.test(f)), touches: 'the loader', ask: 'install, replace, remove and Undo; a set the base refuses rolls back whole; the pool full; a trial that expires with a page open', see: 'OCTATRACK_HARDWARE_TRAPS.md#dsp-loader-dynamic-dsp-code' },
  { when: c => c.files.some(f => /(^|\/)dsp|\.asm$/i.test(f)), touches: 'DSP code', ask: 'DSP FULL; both cores; the receiver window; pipeline stalls the instruction count hides', see: 'OCTATRACK_HARDWARE_TRAPS.md#coldfire-and-dsp-load' },
  { when: c => c.files.some(f => /usb|ep0|bench/i.test(f)), touches: 'the USB link', ask: 'USB unplugged mid-transfer; the host silent until the base rolls back; a reconnect', see: 'OCTATRACK_HARDWARE_TRAPS.md#usb-and-ep0' },
  { when: c => c.files.some(f => /status\.|cpu|guard/i.test(f)), touches: 'load and admission', ask: 'the pick at the 85 % line with the delays quiet and open; the guard counters while playing', see: 'OCTATRACK_HARDWARE_TRAPS.md#coldfire-and-dsp-load' },
  { when: c => c.files.some(f => /boot|startup|restore|flash/i.test(f)), touches: 'boot and restore', ask: 'PROJ held at power-on; the restore held back; a RAM boot back to the flashed base', see: 'OCTATRACK_MODULE_EDGE_CASES.md#boot-and-power' },
  { when: c => c.kind === 'base', touches: 'every installed module', ask: 'the largest set installs and Undo restores the starting inventory; the starting modules after the RAM boot back', see: 'TEST_PROCEDURE.md#what-a-base-adds' },
]
export const suggestEdgeCases = context => TOUCHES.filter(rule => rule.when({ files: [], ...context })).map(({ touches, ask, see }) => ({ touches, ask, see }))

const STATUS_WORD = { passed: 'passed', failed: '**failed**', 'not run': 'not run', 'to do': 'to do' }
const cell = text => String(text ?? '').replaceAll('|', '\\|').replaceAll('\n', ' ')

/** The record as a TESTING.md entry (or, for a base, a docs/verification/ record), with the lines the pull request takes. */
export function recordMarkdown(record) {
  const { target, build, steps } = record, sha = build.package?.sha256
  const what = target.kind === 'base' ? `${target.machine} base ${target.version ?? ''}`.trim() : `${target.id} ${target.version ?? ''}`.trim()
  // Reading the unit is not testing it: the line needs the scripted pass on the unit (a Rytm without cases reads it only).
  const unitRan = steps.some(step => step.id === 'unit-pass' && step.status === 'passed' && !step.emulator)
  const emulated = steps.some(step => step.unit && step.status === 'passed' && step.emulator)
  const lines = [`### Test procedure: ${what}, ${record.date}`, '',
    `Build: revision \`${build.revision.slice(0, 12)}\`${build.dirty ? ' with uncommitted changes' : ''}, ${build.package ? `package \`${basename(build.package.path)}\` SHA-256 \`${sha}\`` : 'no package named'}. ` +
    `\`${record.command}\`, ${record.seconds} s. Emulator results are not hardware evidence; only what ran on the unit is.`, '',
    '| # | Step | Layer | Result | Command | Evidence |', '|---|---|---|---|---|---|',
    ...steps.map((step, index) => `| ${index + 1} | ${step.title}${step.emulator ? ' (emulator)' : ''} | ${step.layer === 'target' ? (step.emulator ? 'emulator' : 'unit') : step.layer ?? ''} | ${STATUS_WORD[step.status]}${step.reason ? ': ' + cell(step.reason) : ''} | ${step.commands.map(c => '`' + cell(c) + '`').join('<br>')} | ${step.log ?? ''} |`),
    '', '#### Edge cases for this change', '',
    'Derive them from what the change touches and run each one (docs/TEST_PROCEDURE.md#edge-cases). A start, from the manifest and the changed files:', '',
    ...(record.edgeCases.suggested.length ? record.edgeCases.suggested.map(s => `- ${s.touches}: ${s.ask} (docs/${s.see})`) : ['- nothing matched: read the diff']), '',
    '| Case | Why this change makes it a risk | How run | Result |', '|---|---|---|---|', '| | | | |', '',
    '#### Left for the submitter at their unit', '', ...DEVELOPER[target.kind].map(item => '- ' + item), '',
    '#### For the pull request', '',
    unitRan && sha ? `Tested on a unit: package ${sha.slice(0, 12)}, <model and OS>, test:procedure steps ${steps.map((s, i) => s.unit && s.status === 'passed' ? i + 1 : null).filter(Boolean).join(', ')}; the developer's stage <done or not yet>.`
      : emulated ? 'Not tested on a unit: steps 6 to 10 ran on the emulator only (--target emulator), which is not hardware evidence.'
      : `Not tested on a unit: ${steps.find(step => step.unit)?.reason ?? 'the unit steps did not run'}.`,
    'Edge cases: the table above, one row a case (or "Edge cases: none, because …").', '']
  return lines.join('\n')
}

const profiles = root => { try { return JSON.parse(readFileSync(join(root, 'src/devices/machines.generated.json'), 'utf8')) } catch { return [] } }

/** `machine` (from `machine:id`) picks one machine's folder where two machines have a module of the same id (temp-save). */
function moduleContext(root, id, machine) {
  const ot = !machine || machine === 'octatrack'
  const listed = ot && existsSync(join(root, 'sdk/octatrack/modules', id)) && join(root, 'sdk/octatrack/modules', id), draft = ot && existsSync(join(root, 'sdk/drafts', id)) && join(root, 'sdk/drafts', id)
  // A module of another machine: its profile's module folder, as module:doctor finds them.
  const elsewhere = listed || draft ? null : profiles(root).find(profile => profile.id !== 'octatrack' && (!machine || profile.id === machine) && profile.sdk?.modules && existsSync(join(root, profile.sdk.modules, id)))
  const folder = listed || draft || (elsewhere && join(root, elsewhere.sdk.modules, id))
  const file = folder && ['octamod.module.json', 'modwerk.module.json'].map(name => join(folder, name)).find(path => existsSync(path))
  const manifest = file ? JSON.parse(readFileSync(file, 'utf8')) : null
  return { source: !!folder, draft: !listed && !!draft, alsoDraft: !!listed && existsSync(join(root, 'sdk/drafts', id)), manifest,
    machine: elsewhere?.id ?? (ot ? 'octatrack' : machine), version: manifest?.version }
}
const catalogue = root => JSON.parse(readFileSync(join(root, 'src/engine/assets/octatrack-module-packages.json'), 'utf8')).packages

/** Everything the steps read, from the arguments and the checkout. */
export function context(root, values, positionals, env = process.env) {
  const git = (...args) => { try { return execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() } catch { return '' } }
  const share = values.share ?? env.MODWERK_SHARE_SOCKET ?? '/tmp/modwerk-share.sock'
  // Inside an emulator session (npm run device:emulator -- … -- npm run test:procedure …) the unit steps run there.
  const target = values.target ?? (env.MODWERK_UNIT === 'emulator' ? 'emulator' : 'unit')
  if (!['unit', 'emulator'].includes(target)) throw new Error('--target is unit or emulator')
  const devSocket = values['dev-socket'] ?? (target === 'emulator' ? env.MODWERK_DEV_SOCKET : undefined)
  const scripts = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).scripts ?? {}
  const rows = catalogue(root)
  let ctx = { kind: values.base ? 'base' : 'module', share, target, devSocket,
    // The session's line socket for device:test's steps; an emulator takes no turn of the unit queue.
    env: { ...(devSocket ? { MODWERK_DEV_SOCKET: devSocket } : {}), ...(target === 'emulator' ? { MODWERK_UNIT: 'emulator' } : {}) }, soakSeconds: Number(values['soak-seconds'] ?? 120), scene: values.scene, pickPattern: values['pick-pattern'], measurePattern: values['measure-pattern'], emulatorSocket: values['emulator-socket'],
    tools: { cycleScan: existsSync(join(root, SCAN_TOOL)), soak: existsSync(join(root, SOAK_TOOL)), unitQueue: !!scripts.unit },
    build: { revision: git('rev-parse', 'HEAD') || 'unknown', dirty: !!git('status', '--porcelain', '--untracked-files=no') } }
  const named = positionals[0]
  if (ctx.kind === 'module') {
    if (!named) throw new Error('Name a module id or a package: npm run test:procedure -- <module id> | FILE.mwrm | --base')
    const file = named.endsWith('.mwrm') ? resolve(named) : null
    const qualified = !file && /^([a-z0-9-]+):([a-z0-9-]+)$/.exec(named)
    const id = file ? (basename(dirname(file)) !== 'modwerk-dev' && existsSync(join(root, 'sdk/octatrack/modules', basename(dirname(file)))) ? basename(dirname(file)) : basename(file, '.mwrm')) : qualified ? qualified[2] : named
    ctx = { ...ctx, id, ...moduleContext(root, id, qualified?.[1]) }
    const row = ctx.machine === 'octatrack' ? rows.find(r => r.id === id) : undefined
    ctx.baseBound = !!row?.requiredBase
    if (file || values.package) ctx.pkg = resolve(values.package ?? file)
    else if (values.published) { if (!row) throw new Error(id + ' has no published Octatrack package'); ctx.pkg = join(root, 'public', row.path) }
    if (!ctx.source && !ctx.pkg) throw new Error('No module named ' + id + ' under sdk/octatrack/modules, sdk/drafts or another machine\'s module folder.')
  } else if ((positionals[0] ?? 'octatrack') === 'octatrack') {
    ctx.machine = 'octatrack'
    ctx.pkg = resolve(values.package ?? join(root, 'src/engine/assets/octatrack-base.elemod'))
    ctx.version = JSON.parse(readFileSync(join(root, 'sdk/machines/octatrack/base-versions.json'), 'utf8')).bases.at(-1)?.version
    ctx.setPackages = rows.filter(r => !r.requiredBase).map(r => join(root, 'public', r.path)).filter(path => existsSync(path))
    ctx.priceModules = values['price-modules'] ? values['price-modules'].split(',') : undefined
  } else {
    ctx.machine = positionals[0]
    if (!profiles(root).some(profile => profile.id === ctx.machine)) throw new Error('No machine named ' + ctx.machine + ' in sdk/machines/.')
    if (values.package) ctx.pkg = resolve(values.package)
  }
  if (other(ctx)) {
    const profile = profiles(root).find(item => item.id === ctx.machine)
    if (target === 'emulator') throw new Error('--target emulator drives an Octatrack emulator session; on ' + ctx.machine + ' the emulator is step 5 (--emu for the Rytm)')
    if (values.label && !/^[\x21-\x7e]{4}$/.test(values.label)) throw new Error('--label is the build\'s four-character label, new for every build (XX01)')
    Object.assign(ctx, { machineName: profile ? profile.name + (profile.variants?.length === 1 ? ' ' + profile.variants[0] : '') : ctx.machine, platform: profile?.sdk?.platform, label: values.label, emu: values.emu ?? env.RYTM_EMU,
      stock: values.stock && resolve(values.stock), elemod: values.elemod && resolve(values.elemod),
      passOn: [...(values.link ? ['--link'] : []), ...(values.label ? ['--label', values.label] : []), ...(values.cases ? ['--cases', values.cases] : [])] })
    ctx.linkable = profile?.sdk?.platform === 'elemod' && !!(ctx.stock && ctx.elemod && ctx.label)
    const cases = join(root, RYTM, 'cases')
    // The Rytm's cases: a module's folder of them, or for a base the link's own (the top-level files; a folder runs every module's too).
    ctx.cases = values.cases ? [resolve(values.cases)] : ctx.machine !== 'analog-rytm-mkii' ? []
      : ctx.kind === 'module' ? [join(cases, ctx.id)].filter(path => existsSync(path)) : readdirSync(cases).filter(name => name.endsWith('.case')).sort().map(name => join(cases, name))
  }
  const stamp = new Date().toISOString().slice(0, 10)
  ctx.out = resolve(values.out ?? join(tmpdir(), 'modwerk-procedure', `${ctx.id ?? ctx.machine + '-base'}-${stamp}-${ctx.build.revision.slice(0, 8)}`))
  ctx.unit = values['no-unit'] ? { available: false, reason: 'left alone with --no-unit' }
    : other(ctx) ? (values.link ? { available: true } : { available: false, reason: MACHINE_STEPS[ctx.machine]?.['unit-read'] ? 'no --link: pass it to drive the unit over its development link (a RAM boot restarts it: with its owner\'s OK)' : GAP.unit(ctx.machineName) })
    : /^\d+$/.test(share) || existsSync(share) ? { available: true }
      : target === 'emulator' ? { available: false, reason: `no emulator session on ${share} (ot_emu --usb-host EMU, then MODWERK_DEV_SOCKET=DEV npm run device -- serve --emulator --socket EMU --share ${share}, and --dev-socket DEV here)` }
        : { available: false, reason: `no unit session on ${share} (npm run device -- serve --share ${share}; on a contributor's unit with their OK)` }
  ctx.files = git('diff', '--name-only', 'origin/main...HEAD').split('\n').filter(Boolean)
  return ctx
}

/** The record the files hold: JSON for programs, procedure.md for people. */
export function record(ctx, steps, { started, finished, command }) {
  return { procedure: 1, command, date: new Date(started).toISOString().slice(0, 10), started: new Date(started).toISOString(), finished: new Date(finished).toISOString(),
    seconds: Math.round((finished - started) / 1000),
    target: ctx.kind === 'base' ? { kind: 'base', machine: ctx.machine, version: ctx.version } : { kind: 'module', id: ctx.id, version: ctx.version, machine: ctx.machine, draft: !!ctx.draft },
    build: ctx.build, unit: { ...ctx.unit, share: ctx.share, target: ctx.target ?? 'unit' },
    steps, edgeCases: { suggested: suggestEdgeCases({ kind: ctx.kind, manifest: ctx.manifest, files: ctx.files ?? [] }), cases: [] },
    developer: { status: 'to do', items: DEVELOPER[ctx.kind] } }
}

function realDeps(root) {
  const npm = argv => argv[0] === 'npm' && process.env.npm_execpath ? [process.execPath, process.env.npm_execpath, ...argv.slice(1)] : argv[0] === 'node' ? [process.execPath, ...argv.slice(1)] : argv
  const launch = (argv, log, env = {}) => {
    mkdirSync(dirname(log), { recursive: true })
    appendFileSync(log, '$ ' + shown(argv) + '\n')
    console.log('\n$ ' + shown(argv))
    const [command, ...args] = npm(argv)
    const child = spawn(command, args, { cwd: root, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, ...env } })
    const state = { output: '' }
    const take = chunk => { const text = chunk.toString(); state.output += text; process.stdout.write(text); appendFileSync(log, text) }
    child.stdout.on('data', take); child.stderr.on('data', take)
    state.done = new Promise(done => child.once('close', (code, signal) => done(code ?? (signal ? 128 : 1))))
    return { child, state }
  }
  return {
    now: () => Date.now(),
    exists: path => existsSync(path),
    read: path => readFileSync(path, 'utf8'),
    sha256: path => createHash('sha256').update(readFileSync(path)).digest('hex'),
    exec: async (argv, log, env) => { const { state } = launch(argv, log, env); const code = await state.done; return { code, output: state.output } },
    start: (argv, log, env) => {
      const { child, state } = launch(argv, log, env)
      let ended = false
      state.done.then(() => { ended = true })
      return {
        async waitFor(pattern, ms) {
          for (const until = Date.now() + ms; Date.now() < until; await new Promise(r => setTimeout(r, 250))) {
            if (pattern.test(state.output)) return
            if (ended) break
          }
          throw new Error('the trial did not start: ' + state.output.trim().split('\n').slice(-3).join(' / '))
        },
        async stop() {
          if (!ended) child.kill('SIGINT')
          const code = await Promise.race([state.done, new Promise(r => setTimeout(() => r('timeout'), 60000))])
          if (code === 'timeout') { child.kill('SIGKILL'); return { code: 1, output: state.output + '\nthe trial did not end within 60 s: unplug USB, the base rolls back what was not kept' } }
          return { code, output: state.output }
        },
      }
    },
  }
}

const OPTIONS = { base: { type: 'boolean' }, package: { type: 'string' }, published: { type: 'boolean' }, plan: { type: 'boolean' }, out: { type: 'string' },
  share: { type: 'string' }, 'no-unit': { type: 'boolean' }, 'emulator-socket': { type: 'string' }, 'soak-seconds': { type: 'string' }, scene: { type: 'string' }, 'pick-pattern': { type: 'string' }, 'measure-pattern': { type: 'string' },
  'price-modules': { type: 'string' }, target: { type: 'string' }, 'dev-socket': { type: 'string' }, 'unit-phase': { type: 'string' }, help: { type: 'boolean', short: 'h' },
  stock: { type: 'string' }, elemod: { type: 'string' }, label: { type: 'string' }, link: { type: 'boolean' }, cases: { type: 'string' }, emu: { type: 'string' } }

async function main() {
  const { values, positionals } = parseArgs({ allowPositionals: true, options: OPTIONS })
  if (values.help || (!values.base && !positionals.length)) {
    console.log('Usage: npm run test:procedure -- <module id> | FILE.mwrm | --base [machine]  [--plan] [--package FILE] [--published] [--share SOCKET] [--no-unit]\n' +
      '         [--target unit|emulator] [--dev-socket SOCK] [--emulator-socket SOCK] [--out DIR] [--soak-seconds 120] [--scene TEXT] [--pick-pattern 2] [--measure-pattern 1] [--price-modules a,b]\n' +
      '         another machine: [--stock STOCK.syx --elemod BASE.elemod --label XX01] [--link] [--cases DIR] [--emu DTBOOT]   (docs/TEST_PROCEDURE.md)')
    process.exit(values.help ? 0 : 2)
  }
  let ctx
  try { ctx = context(ROOT, values, positionals) } catch (error) { console.error(error.message); process.exit(2) }
  const deps = realDeps(ROOT)
  if (values['unit-phase']) {
    // One turn of the unit queue: only the unit steps, their results for the run that started it.
    const results = await runSteps(STEPS.filter(step => step.unit).map(step => step.id), ctx, deps)
    writeFileSync(values['unit-phase'], JSON.stringify(results, null, 1) + '\n')
    process.exit(results.some(result => result.status === 'failed') ? 1 : 0)
  }
  if (values.plan) {
    console.log(`The test procedure for ${ctx.kind === 'base' ? 'the ' + (ctx.machineName ?? 'Octatrack') + ' base' : ctx.id + (other(ctx) ? ' (' + ctx.machineName + ')' : '')} (docs/TEST_PROCEDURE.md). Steps 6 to 10 on the ${ctx.target}: ${ctx.unit.available ? (other(ctx) ? 'its development link' : 'a session on ' + ctx.share) : ctx.unit.reason}.`)
    STEPS.forEach((step, index) => {
      const p = plan(step, ctx)
      const how = p.todo ? 'by hand: ' + p.todo.join('; ') : p.skip ? 'not run: ' + p.skip : step.unit && !ctx.unit.available ? 'not run: ' + ctx.unit.reason : p.inside ? p.note : [...(p.trial ? [p.trial] : []), ...(p.commands ?? [])].map(shown).join('  then  ') || 'hash ' + (ctx.pkg ?? 'the built package')
      console.log(`${String(index + 1).padStart(2)}. ${titleOf(step, ctx)} [${LAYER[step.id] === 'target' ? ctx.target : LAYER[step.id]}]: ${how}`)
    })
    return
  }
  mkdirSync(ctx.out, { recursive: true })
  const started = Date.now()
  const steps = await runProcedure(ctx, deps)
  const command = 'npm run test:procedure -- ' + process.argv.slice(2).map(q).join(' ')
  const result = record(ctx, steps, { started, finished: Date.now(), command })
  writeFileSync(join(ctx.out, 'procedure.json'), JSON.stringify(result, null, 1) + '\n')
  writeFileSync(join(ctx.out, 'procedure.md'), recordMarkdown(result))
  console.log('\n' + steps.map((step, index) => `${String(index + 1).padStart(2)}. ${step.title}: ${step.status}${step.reason ? ' (' + step.reason + ')' : ''}`).join('\n'))
  console.log(`\nRecord: ${join(ctx.out, 'procedure.md')} and procedure.json, ${result.seconds} s. Fill in its edge-case table, run each case, then copy the entry to ` +
    (ctx.kind === 'base' ? 'docs/verification/<YYYY-MM-DD>-<topic>.md' : `the module's TESTING.md`) + ' and its last two lines to the pull request.')
  process.exitCode = steps.some(step => step.status === 'failed') ? 1 : 0
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main()
