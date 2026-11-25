// SPDX-License-Identifier: Elastic-2.0
// Copyright (c) 2026 Jannik Aßfalg (repeat98)
// module:qualify on Mackity's real evidence (fixtures/module-qualify/mackity: its manifest as released on 25 November 2026, its
// perf:audit, device:price and capture records, and the test procedure's procedure.json and price.json of that day).
import { afterEach, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { parseModuleDocument, requireModuleQualificationForPublication } from '../src/catalog/module-contract.ts'
import { moduleNativeSourceSha256 } from './module-qualification.mjs'
import { DRAFT, changedSince, draftRecord, draftedFields, fieldDiff, packageFacts, qualifyFolder, qualifyProblems, readEvidence, sourceHashOf } from './module-qualify.mjs'
import { writePrice } from './octatrack-price.mjs'
import { STEPS, plan } from './test-procedure.mjs'

const FIXTURE = resolve(import.meta.dirname, 'fixtures/module-qualify/mackity')
const fixture = name => JSON.parse(readFileSync(join(FIXTURE, name), 'utf8'))
const BASE = 'development twin 8fd6d456 of base 0.8.1 (eb6679620d0c9ed7), the owner\'s MKII, OS 1.40C'
const REVISION = 'ccbb96b6c06ae074159be45d66f69812d450793f'
const roots = []
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }) })

/** A package with Mackity's header (472 bytes of ColdFire code and data, a DSP effect of 208 words, 32 state words), filled with
 *  zeros: no built image enters the repository, so its SHA-256 stands in for the real package's in the procedure. */
function mackityPackage() {
  const data = Buffer.alloc(80 + 472 + 4 * 208)
  data.write('MWRM'); data.writeUInt16BE(9, 4); data.writeUInt32BE(472, 8); data.writeUInt32BE(208, 32)
  data[38] = 26; data[39] = 3; data.writeUInt16BE(226, 44); data[46] = 1; data[47] = 32; data.write('Mackity', 50, 'latin1')
  return data
}
const UNMEASURED = { label: 'Storage', display: 'Not measured', value: null, unit: 'unknown', method: 'unmeasured', conditions: 'No measurements exist yet.', source: 'TESTING.md' }

/** Mackity in a scratch checkout: listed or a draft; `fresh` takes away everything module:qualify writes, as before the release. */
function layout({ draft = false, fresh = false } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'module-qualify-test-')); roots.push(root)
  const folder = join(root, draft ? 'sdk/drafts/mackity' : 'sdk/octatrack/modules/mackity'), procedure = join(root, 'proc')
  for (const dir of ['evidence', 'media']) mkdirSync(join(folder, dir), { recursive: true })
  mkdirSync(procedure)
  const pkg = mackityPackage(), sha = createHash('sha256').update(pkg).digest('hex')
  writeFileSync(join(procedure, 'mackity.mwrm'), pkg)
  for (const [name, text] of [['manifest.py', '# fixture: Mackity\'s native manifest\n'], ['mackity.asm', '; fixture: Mackity\'s DSP source\n'], ['TESTING.md', '# Mackity 0.1.0-experimental\n'], ['README.md', '# Mackity\n'], ['LICENSE', 'MIT\n']])
    writeFileSync(join(folder, name), text)
  writeFileSync(join(folder, 'evidence/performance.json'), readFileSync(join(FIXTURE, 'performance.json')))
  writeFileSync(join(folder, 'media/capture.json'), JSON.stringify({ ...fixture('capture.json'), packageSha256: sha }, null, 1) + '\n')
  const document = fixture('module.json')
  if (fresh) {
    delete document.tests.qualification; delete document.resources.impact; delete document.resources.cpuPrice
    Object.assign(document.resources, { recorded: 'Not measured', storage: UNMEASURED, processing: { ...UNMEASURED, label: 'CPU / DSP load' } })
    Object.assign(document.tests, { hardwareStatus: 'untested', summary: 'No tests have been run.', evidenceRevision: 'b8deefc88b2c3e5f3c6158e364eb741df1924e1d' })
  } else for (const name of ['cpu-price.json', 'frame-cost.json']) writeFileSync(join(folder, 'evidence', name), readFileSync(join(FIXTURE, name)))
  writeFileSync(join(folder, 'octamod.module.json'), JSON.stringify(document, null, 2) + '\n')
  const record = fixture('procedure.json')
  record.build.package = { path: join(procedure, 'mackity.mwrm'), sha256: sha }
  writeFileSync(join(procedure, 'procedure.json'), JSON.stringify(record, null, 1) + '\n')
  writeFileSync(join(procedure, 'price.json'), readFileSync(join(FIXTURE, 'price.json')))
  return { root, folder, procedure, sha, document }
}

it('reads a package header: code and data, DSP words and state', () => {
  expect(packageFacts(mackityPackage())).toMatchObject({ abi: 9, imageBytes: 472, bssBytes: 0, dspWords: 208, stateWords: 32, bufferWords: 0, cycles: 226, cyclesKind: 1 })
  expect(() => packageFacts(Buffer.from('not a package at all, really not one'))).toThrow(/MWRM/)
})

it('drafts a draft\'s whole release record from Mackity\'s evidence, its price and curve included', async () => {
  const { root, folder, procedure, sha, document } = layout({ draft: true, fresh: true })
  expect(qualifyFolder(root, 'mackity')).toBe(folder)
  const evidence = readEvidence({ folder, procedure })
  expect(evidence.package).toMatchObject({ sha256: sha, dspWords: 208 })
  const { document: drafted, files, notes } = draftRecord({ document, evidence, options: { base: BASE } })
  expect(notes).toEqual([])

  // The price and the curve, as device:price --write would have written them into a listed module.
  const real = fixture('cpu-price.json'), price = JSON.parse(files['evidence/cpu-price.json'])
  expect(price).toMatchObject({ module: 'mackity', version: '0.1.0-experimental', base: BASE, seconds: 8, readings: 3, measuredAt: real.measuredAt, inputs: { transport: 'playing' } })
  expect(price.result).toEqual(real.result)
  expect(drafted.resources.cpuPrice).toMatchObject({ value: 0.1, unit: 'percent-of-frame', measure: 'frame-interrupt', date: '2026-11-25', source: 'evidence/cpu-price.json' })
  expect(drafted.resources.cpuPrice.conditions).toMatch(/3 readings of 8 s a state\. Frame interrupt 32\.2 % before, 32\.2 % installed and used nowhere, 32\.3 % on T1 FX2/)
  const curve = JSON.parse(files['evidence/frame-cost.json']), realCurve = fixture('frame-cost.json')
  for (const key of ['module', 'version', 'seconds', 'measuredAt', 'tracks', 'rest', 'first', 'each', 'points', 'adds', 'admission', 'notes']) expect(curve[key]).toEqual(realCurve[key])

  // The numbers and identities, from the procedure, the package and the performance record.
  const q = drafted.tests.qualification
  expect(q.hardware).toMatchObject({ kind: 'functional', status: 'reported', model: 'MKII', testedOn: '2026-11-25', tester: 'repeat98', sourceRevision: REVISION, imageSha256: sha, report: 'TESTING.md' })
  expect(drafted.tests).toMatchObject({ hardwareStatus: 'reported', evidenceRevision: REVISION })
  expect(q.cycles).toEqual([expect.objectContaining({ processor: 'dsp', worstCase: 251, maxConfiguration: 1004, maxInstances: 8, budget: 3120, unit: 'cycles/sample', method: 'static', report: 'evidence/performance.json' })])
  expect(q.memory).toMatchObject({ perInstanceBytes: 96, sharedBytes: 1096, maxInstances: 8, totalBytes: 1864 })
  expect(q.memory.regions.map(region => [region.space, region.words, region.scope])).toEqual([['dsp-p', 208, 'shared'], ['dsp-x', 32, 'instance'], ['cpu-ram', 472, 'shared']])
  expect(drafted.resources).toMatchObject({ recorded: '2026-11-25', storage: { display: '208 words / 32-word state', method: 'static' }, processing: { display: '228 instructions/sample per instance', method: 'emulator' } })
  // The levels Mackity's author chose by hand, suggested from the same measurements.
  expect(drafted.resources.impact).toMatchObject({ cpu: { level: 'minimal' }, dsp: { level: 'moderate' }, memory: { level: 'low' } })

  // Words a person stands behind are drafted, marked, and refused until edited; the record already parses and would publish.
  const marked = draftedFields(drafted)
  expect(marked).toEqual(expect.arrayContaining(['tests.summary', 'tests.qualification.hardware.summary', 'tests.qualification.hardware.limitations[0]', 'tests.qualification.cycles[0].conditions.modeSwitching', 'resources.impact.dsp.rationale', 'tests.qualification.documentation.tutorial.steps[0]']))
  expect(q.hardware.limitations).toContain(DRAFT + 'Not run: emulator rehearsal (no emulator session (--emulator-socket SOCK, an ot_emu with --usb-host on a development base)).')
  q.sourceSha256 = await sourceHashOf(folder, drafted, files)
  expect(() => requireModuleQualificationForPublication(parseModuleDocument(drafted))).not.toThrow()

  // sourceSha256 is the folder's once the files are written: nothing to recompute by hand.
  for (const [path, text] of Object.entries(files)) writeFileSync(join(folder, path), text)
  writeFileSync(join(folder, 'octamod.module.json'), JSON.stringify(drafted, null, 2) + '\n')
  expect(await moduleNativeSourceSha256(folder, drafted)).toBe(q.sourceSha256)
  const problems = await qualifyProblems({ root, folder, document: drafted })
  expect(problems.map(problem => problem.detail)).toEqual([expect.stringMatching(/fields are still marked as drafted by module:qualify/)])
})

it('keeps Mackity\'s hand-written record as it is: only sourceSha256 follows the folder', async () => {
  const { folder, procedure, document } = layout()
  const { document: drafted, files, notes, reads, changedLevels } = draftRecord({ document, evidence: readEvidence({ folder, procedure }), options: { base: BASE } })
  expect(files).toEqual({})
  expect(notes).toEqual([expect.stringMatching(/already holds this run/)])
  expect(reads).toEqual([])
  expect(changedLevels).toEqual([])
  expect(fieldDiff(document, drafted)).toEqual([])
  drafted.tests.qualification.sourceSha256 = await sourceHashOf(folder, drafted)
  expect(fieldDiff(document, drafted)).toEqual([expect.stringMatching(/^~ tests\.qualification\.sourceSha256: "7271f6d9/)])
  expect(draftedFields(drafted)).toEqual([])
})

it('leaves out what has no source, and says what would supply it', () => {
  const { folder, procedure, document } = layout({ draft: true, fresh: true })
  const { document: drafted, files, notes } = draftRecord({ document, evidence: readEvidence({ folder, procedure }) })
  expect(files).toEqual({})
  expect(drafted.resources.cpuPrice).toBeUndefined()
  expect(notes).toEqual(expect.arrayContaining([expect.stringMatching(/name the base the unit ran with --base TEXT/), expect.stringMatching(/resources\.impact is not written: cpu has no measurement/)]))
  expect(() => draftRecord({ document: { ...document, version: '0.1.1-experimental' }, evidence: readEvidence({ folder, procedure }) })).toThrow(/tested mackity 0\.1\.0-experimental, not mackity 0\.1\.1-experimental/)
  const failed = { ...readEvidence({ folder, procedure }) }
  failed.procedure = { ...failed.procedure, steps: failed.procedure.steps.map(step => step.id === 'soak' ? { ...step, status: 'failed' } : step) }
  const { document: refused, notes: why } = draftRecord({ document, evidence: failed, options: { base: BASE } })
  expect(refused.tests.qualification).toBeUndefined()
  expect(why).toEqual(expect.arrayContaining([expect.stringMatching(/the procedure failed at Soak: no hardware record/)]))
})

it('reports a stale sourceSha256 with what changed since the tested commit and the command that refreshes it', async () => {
  const { root, folder, document } = layout()
  const git = (...args) => execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.com', ...args], { cwd: root, stdio: 'pipe' }).toString().trim()
  git('init', '-q'); git('add', '-A'); git('commit', '-qm', 'tested')
  const tested = git('rev-parse', 'HEAD')
  document.tests.qualification.hardware.sourceRevision = tested
  document.tests.qualification.sourceSha256 = await moduleNativeSourceSha256(folder, document)
  expect(await qualifyProblems({ root, folder, document })).toEqual([])
  writeFileSync(join(folder, 'evidence/frame-cost.json'), JSON.stringify({ ...fixture('frame-cost.json'), notes: ['read again'] }, null, 2) + '\n')
  expect(changedSince(root, folder, tested)).toEqual({ at: 'sdk/octatrack/modules/mackity', changed: ['evidence/frame-cost.json'], removed: [] })
  const [problem] = await qualifyProblems({ root, folder, document })
  expect(problem.detail).toMatch(/source now hashes to .*changed since the tested commit .*: evidence\/frame-cost\.json$/)
  expect(problem.fix).toMatch(/npm run module:qualify -- mackity --rehash --write; if code changed, run the test procedure again/)
})

it('test:procedure --price-base has step 9 write the price and the curve into the module\'s folder', () => {
  const ctx = { kind: 'module', id: 'mackity', share: '/tmp/share.sock', out: '/tmp/proc', source: true, target: 'unit', scene: 'C04' }
  const command = context => plan(STEPS.find(step => step.id === 'cost-unit'), context).commands[0].join(' ')
  expect(command(ctx)).not.toMatch(/--write/)
  expect(command({ ...ctx, priceBase: 'base 0.8.1' })).toMatch(/--scene C04 --write --base base 0\.8\.1 --curve T1,T3,T6,T7/)
  expect(command({ ...ctx, priceBase: 'base 0.8.1', source: false })).not.toMatch(/--write/)
})

it('device:price --write puts a draft\'s price beside it, in sdk/drafts', () => {
  const { root, folder } = layout({ draft: true, fresh: true }), price = fixture('price.json')
  const said = writePrice({ root, result: price.results[0], base: BASE, scene: price.scene, seconds: price.seconds, measuredAt: price.measuredAt, readings: price.readings, inputs: price.inputs })
  expect(said).toBe('wrote 0.1 % of a frame into sdk/drafts/mackity/octamod.module.json and its readings into evidence/cpu-price.json')
  expect(JSON.parse(readFileSync(join(folder, 'evidence/cpu-price.json'), 'utf8')).result).toEqual(fixture('cpu-price.json').result)
  expect(JSON.parse(readFileSync(join(folder, 'octamod.module.json'), 'utf8')).resources.cpuPrice.value).toBe(0.1)
})
