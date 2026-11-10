// Exact experimental FM release exception; submitted native source is never evaluated.
import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { resolve } from 'node:path'
import { isDeepStrictEqual } from 'node:util'
import { execFileSync } from 'node:child_process'
import { PACKAGE_FILES } from './module-source.mjs'
import { requireModuleDocumentation } from './module-documentation.mjs'

export const SYNTH_IMAGE = 'c1fbc0b2eaf284e72692b7048d1dfd3693f3e3e90c71229159a619d585b52c95'
export const SYNTH_WAIVED = ['current-build-hardware', 'chip-worst-case-cycles', 'complete-stack-and-memory-bounds']
const json = async path => JSON.parse(await readFile(path, 'utf8'))
export function synthRuntimeSha256(document) {
  const controls = document.controls.map(({ doc, ...control }) => { void doc; return control })
  const value = { id: document.id, key: document.key, version: document.version, source: document.source, nativeManifest: document.nativeManifest, build: document.build ?? null, controls, compatibility: document.compatibility, resources: document.resources, tests: { hardwareStatus: document.tests.hardwareStatus, evidenceRevision: document.tests.evidenceRevision, gates: document.tests.gates } }
  return createHash('sha256').update(JSON.stringify(value)).digest('hex')
}
// The approved release report remains frozen. Current composition evidence
// can grow with the module pool without changing source, image or waivers.
export async function nativeParityCoversPool(parity, catalogIds) {
  const {coverageSelections,selectionKey}=await import('./module-coverage.mjs')
  if(!Array.isArray(parity.pool)||!parity.pool.includes('synth')||parity.pool.length>32||new Set(parity.pool).size!==parity.pool.length||parity.pool.some(id=>!catalogIds.includes(id))||!Array.isArray(parity.selections)||!parity.summary) return false
  const expected=coverageSelections('synth',parity.pool).map(row=>selectionKey(row.ids,row.keepStockFx2))
  const actual=parity.selections.map(row=>Array.isArray(row.moduleIds)&&typeof row.keepStockFx2==='boolean'?selectionKey(row.moduleIds,row.keepStockFx2):null)
  if(!isDeepStrictEqual(actual,expected)) return false
  let built=0,refused=0
  for(const row of parity.selections) {
    if(row.result==='refused'&&typeof row.native?.refused==='string'&&row.native.refused) refused++
    else if(['identical','masked'].includes(row.result)&&row.native?.refused===undefined&&Number.isSafeInteger(row.native?.bytes)&&row.native.bytes>0&&[row.native.osSha256,row.native.maskedOsSha256].every(hash=>typeof hash==='string'&&/^[a-f0-9]{64}$/.test(hash))) built++
    else return false
  }
  return parity.summary.selections===expected.length&&parity.summary.built===built&&parity.summary.refused===refused&&parity.summary.mismatches===0
}
export async function requireSynthRelease(root, folder, document, sourceHash) {
  const fail = message => { throw new Error('FM Synth: ' + message) }
  const approval = await json(resolve(root, 'sdk/approvals/synth-build-approval.json')), declaration = document.tests.releaseWaiver
  if (approval.id !== 'synth' || approval.version !== '0.1.1-experimental' || document.id !== approval.id || document.version !== approval.version || approval.approvedBy !== 'repeat98' || approval.approvedOn !== '2026-10-06' || !isDeepStrictEqual(approval.waived, SYNTH_WAIVED) || approval.imageSha256 !== SYNTH_IMAGE || !declaration || declaration.approvedBy !== approval.approvedBy || declaration.approvedOn !== approval.approvedOn || declaration.moduleVersion !== document.version || declaration.sourceSha256 !== approval.sourceSha256 || declaration.imageSha256 !== approval.imageSha256 || await sourceHash(folder, document) !== approval.sourceSha256 || synthRuntimeSha256(document) !== approval.runtimeSha256) fail('owner approval does not cover this exact version, source, declarations and image')
  if (document.build || document.tests.qualification || document.tests.hardwareStatus !== 'untested' || document.resources.processing.value !== null || document.resources.processing.method !== 'unmeasured' || declaration.report !== 'evidence/software.json') fail('hardware and unmeasured timing/memory must remain honest')
  const report = await json(resolve(folder, declaration.report)), parity = await json(resolve(root, 'sdk/native-comparisons/synth.json'))
  if (report.id !== document.id || report.moduleVersion !== document.version || report.sourceSha256 !== approval.sourceSha256 || report.imageSha256 !== approval.imageSha256 || report.hardwareStatus !== 'untested' || report.chipWorstCaseCycles !== null || report.completeMemoryBounds !== null || !isDeepStrictEqual(report.nativeBrowserParity, { status: 'passed', selections: 94, built: 37, refused: 57, mismatches: 0, report: 'sdk/native-comparisons/synth.json' }) || parity.moduleVersion !== document.version || parity.moduleSourceSha256 !== approval.sourceSha256 || !(await nativeParityCoversPool(parity,(await json(resolve(root,'sdk/catalog.json'))).modules.map(module=>module.id)))) fail('incomplete or stale native/browser evidence')
  const worker = report.worker, audio = report.audio
  if (worker.moduleVersion !== document.version || worker.imageSha256 !== SYNTH_IMAGE || worker.updateSha256 !== '831e7cd878398ee8d1e268e9fc2bcfd902f48e785965e8e510bff58abc1405a6' || worker.worker.moduleIds.join(',') !== 'synth' || Object.values(worker.checks).length !== 6 || Object.values(worker.checks).some(value => value !== 'passed') || worker.allocation.runtimeBytes !== 90268 || worker.allocation.reserveBytes !== 10586112 || worker.limits.chipWorstCaseCycles !== null || worker.limits.completeStackBounds !== null || worker.limits.hardwareStatus !== 'untested' || audio.imageSha256 !== SYNTH_IMAGE || audio.checks.generatedCarrier !== 'passed' || audio.checks.doubleStopSilence !== 'passed' || audio.nonzeroValues <= 0 || audio.carrierPeriodFrames !== 169 || audio.finalHalfSecondPeak !== 0) fail('common-worker packaging, refusals, allocations or playback evidence is incomplete')
  const originalAudio = await json(resolve(folder, 'evidence/browser-audio.json'))
  if (!isDeepStrictEqual(originalAudio, audio)) fail('audio report differs from the release evidence')
  await requireModuleDocumentation(folder, document)
  return 'owner-approved-experimental'
}

// An additive FM package import must preserve every existing executable byte,
// address and recipe. Global provenance labels, the new module and modules
// released since (each a later version with its own qualification) are the only omissions.
export async function requireAdditiveSynthPackages(root, commit) {
  const base = JSON.parse(execFileSync('git', ['show', commit + ':sdk/catalog.json'], { cwd: root }).toString())
  const current = await json(resolve(root, 'sdk/catalog.json'))
  const omitted = ['synth', ...current.modules.filter(module => base.modules.some(old => old.id === module.id && old.version !== module.version)).map(module => module.id)]
  for (const name of [...PACKAGE_FILES, 'chooser-metadata.json']) {
    const path = 'src/engine/assets/' + name
    const before = JSON.parse(execFileSync('git', ['show', commit + ':' + path], { cwd: root, maxBuffer: 8 * 1024 * 1024 }).toString())
    const after = await json(resolve(root, path))
    for (const value of [before, after]) {
      delete value.sourceCommit
      if (value.moduleVersions) for (const id of omitted) delete value.moduleVersions[id]
      for (const key of ['objects', 'groups', 'modules']) if (Array.isArray(value[key])) value[key] = value[key].filter(row => !omitted.includes(row.moduleId ?? row.id))
    }
    if (!isDeepStrictEqual(before, after)) throw new Error('FM Synth integration changed an existing package payload or recipe: ' + name)
  }
}
