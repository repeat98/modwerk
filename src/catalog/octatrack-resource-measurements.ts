import type { ModuleDocument } from './module-contract'
import activeLoadEvidence from '../../docs/verification/2026-11-21-octatrack-active-load.json'
import stackedCpuEvidence from '../../docs/verification/2026-11-21-octatrack-stacked-cpu-limits.json'
import directDspEvidence from '../../docs/verification/2026-11-21-octatrack-direct-dsp-code.json'
import modulePoolEvidence from '../../docs/verification/2026-11-21-octatrack-module-pool-allocation.json'
import playModesApproval from '../../sdk/approvals/playmodes-build-approval.json'
import stemRecApproval from '../../sdk/approvals/stem-rec-build-approval.json'
import packageManifest from '../engine/assets/octatrack-module-packages.json'

type AllocationReading = { modulePoolBytes: number; dspProgramWordsT1to4: number; dspProgramWordsT5to8: number }
type LoadReading = { skipped: number; dsp1to4: number; dsp5to8: number; allocation?: Partial<AllocationReading> }
type DevicePriceRecord = {
  module?: string
  version?: string
  base?: string
  scene?: string
  result?: {
    id?: string
    version?: string
    releaseSourceVersion?: string
    releaseSourceCommit?: string
    packageSha256?: string
    rolledBack?: boolean
    refused?: string
    restore?: string
    inUseError?: string
    inUseOn?: string
    before?: LoadReading
    atRest?: LoadReading
    inUse?: LoadReading
    repetitions?: { before?: LoadReading; inUse?: LoadReading }[]
  }
}
type ActivePhase = { frame: number; frames: number; skipped: number; dsp1to4: number; dsp5to8: number }
type ActiveWorkload = {
  name: string
  core?: string
  cpuGauge?: boolean
  readings: { before: ActivePhase; after: ActivePhase }[]
}
type ActiveRecord = {
  module: string
  version: string
  releasePackageSha256: string
  reboundReleasePackageSha256?: string
  packageSha256: string
  scene: string
  restoration: { liveInventoryRestored: boolean }
  workloads: ActiveWorkload[]
}
type DspLoadReading = {
  before: number; after: number; delta?: number; core: string; slot: string; base: string; scene: string; source: string
}

const records = import.meta.glob<DevicePriceRecord>(
  '../../sdk/octatrack/modules/*/evidence/cpu-price.json',
  { eager: true, import: 'default' },
)
type FrameCostRecord = { module?: string; version?: string; base?: string; scene?: string; first?: number; each?: number; rest?: number; points?: number[] }
const frameCostRecords = import.meta.glob<FrameCostRecord>(
  '../../sdk/octatrack/modules/*/evidence/frame-cost.json',
  { eager: true, import: 'default' },
)
const modulePoolReadings = new Map(modulePoolEvidence.measurements.map(record => [record.module, record]))
const activeLoadReadings = new Map<string, ActiveRecord>(activeLoadEvidence.measurements.map(record => [record.module, record]))
const stackedCpuReadings = new Map(stackedCpuEvidence.measurements.map(record => [record.module, record]))
const directDspReadings = new Map(directDspEvidence.modules.map(record => [record.module, record]))
const cardBuildApprovals = new Map([playModesApproval, stemRecApproval].map(approval => [approval.id, approval]))
const resourcePackage = (id: string) => id === 'usb-audio-out-tracks-main-cue' ? packageManifest.usbAudio.configurable
  : packageManifest.packages.find(pkg => pkg.id === id)

const airChorus = {
  version: '0.1.3-experimental', before: 40.3, after: 51.1, core: 'T1–4', slot: 'T3 FX2',
  base: '0.7.6 development twin 5412b595',
  scene: 'Octatrack MKII, MODWERK-TEST2 bank A pattern 1 with sound on T2 and T3, 8 seconds per reading.',
  source: 'sdk/octatrack/modules/airwindows-chorus/TESTING.md',
}

function currentReading(document: ModuleDocument, record: DevicePriceRecord | undefined) {
  const result = record?.result
  const matchesRelease = result?.version === document.version || result?.version === 'file'
    && result.releaseSourceVersion === document.version && /^[a-f0-9]{40}$/.test(result.releaseSourceCommit ?? '')
    && /^[a-f0-9]{64}$/.test(result.packageSha256 ?? '')
  if (record?.module !== document.id || record.version !== document.version || !record.base || !record.scene
    || result?.id !== document.id || !matchesRelease || result.rolledBack !== true
    || result.refused || result.restore || result.inUseError || !result.before) return
  return { before: result.before, result, base: record.base, scene: record.scene }
}

const evidencePath = (id: string) => 'sdk/octatrack/modules/' + id + '/evidence/cpu-price.json'
const recordedPrice = (id: string) => records['../../' + evidencePath(id)]
const activeEvidencePath = 'docs/verification/2026-11-21-octatrack-active-load.json'

function currentActiveLoad(document: ModuleDocument) {
  const record = activeLoadReadings.get(document.id)
  const entry = resourcePackage(document.id)
  if (record?.version !== document.version || entry?.version !== document.version
    || !/^[a-f0-9]{64}$/.test(record.packageSha256) || !record.restoration.liveInventoryRestored) return
  if (record.releasePackageSha256 === entry.sha256) return record
  if (record.reboundReleasePackageSha256 === entry.sha256) {
    return { ...record, scene: record.scene + ' Measured on development base ' + activeLoadEvidence.developmentBase.slice(0, 8)
      + '. Only the controller addresses changed in this release package.' }
  }
}

function pairedLoad(workload: ActiveWorkload, metric: 'frame' | 'dsp1to4' | 'dsp5to8') {
  const pairs = workload.readings
  if (pairs.length < 2 || pairs.some(({ before, after }) => before.skipped !== after.skipped || before.frames <= 0 || after.frames <= 0)) return
  const starts = pairs.map(pair => pair.before[metric])
  const ends = pairs.map(pair => pair.after[metric])
  const changes = ends.map((value, index) => value - starts[index])
  if (![...starts, ...ends].every(value => Number.isFinite(value) && value >= 0 && value <= 100)
    || Math.max(...changes) - Math.min(...changes) > 1) return
  const mean = (values: number[]) => Math.round(values.reduce((sum, value) => sum + Math.round(value * 100), 0) / (10 * values.length)) / 10
  return { before: mean(starts), after: mean(ends), delta: mean(changes) }
}

export function measuredActiveCpu(document: ModuleDocument) {
  const active = currentActiveLoad(document)
  const workload = active?.workloads.find(workload => workload.cpuGauge)
  if (active && workload) {
    const load = pairedLoad(workload, 'frame')
    if (load) return { ...load, workload: workload.name, scene: active.scene, source: activeEvidencePath }
  }
  // The exact release ran beside the same drum break on FLEX on an MKII.
  if (document.id === 'amiga' && document.version === '0.3.0-experimental'
    && resourcePackage(document.id)?.sha256 === 'acae3fef97f85a941c3215e1065353c94967ff44bb9528c22135c611a8edc32e') {
    return {
      before: 29.1, after: 36.5, delta: 7.4, workload: 'one Amiga track at its defaults',
      scene: 'Octatrack MKII, development base 1e66b504, nine seconds per reading. T1 played a FLEX drum break at 121 BPM in both cases.',
      source: 'sdk/octatrack/modules/amiga/TESTING.md',
    }
  }
}

/** The module's instance curve (evidence/frame-cost.json, device:price --curve), when it was measured on this version
 * and the frame still had room with the first copy: past 100 % the guard drops renders, so the reading is the
 * overload, not the module's cost (FM Synth 0.1.5's first pick read 107.9 %, #2030). */
export function measuredFrameCost(document: ModuleDocument) {
  const source = 'sdk/octatrack/modules/' + document.id + '/evidence/frame-cost.json'
  const record = frameCostRecords['../../' + source]
  const { first, each, points } = record ?? {}
  const firstReading = points?.[1]
  if (record?.module !== document.id || record.version !== document.version || !record.base || !record.scene
    || typeof first !== 'number' || typeof each !== 'number' || !(first >= each && each >= 0 && first <= 100)
    || typeof firstReading !== 'number' || !(firstReading < 100)) return
  return { first, each, base: record.base, scene: record.scene, source }
}

export function measuredStackedCpuLimit(document: ModuleDocument) {
  const record = stackedCpuReadings.get(document.id)
  const entry = resourcePackage(document.id)
  if (record?.version === document.version && entry?.version === document.version && record.releasePackageSha256 === entry.sha256
    && ((record.skippedRenders ?? 0) > 0 || (record.cpuFullOnInstance ?? 0) > 1)) return record
}

export function readDspLoad(document: ModuleDocument, record: DevicePriceRecord | undefined) {
  const reading = currentReading(document, record)
  if (!reading) return
  const { before: baseline, result, base, scene } = reading
  if (!result.inUse || result.inUse.skipped !== baseline.skipped) return
  const slot = /^T([1-8]) FX[12]$/.exec(result.inUseOn ?? '')
  if (!slot) return
  const firstCore = Number(slot[1]) <= 4
  const core = firstCore ? 'T1–4' : 'T5–8'
  const metric = firstCore ? 'dsp1to4' : 'dsp5to8'
  const before = baseline[metric], after = result.inUse[metric]
  if (![before, after].every(value => Number.isFinite(value) && value >= 0 && value <= 100)) return
  for (const repeat of result.repetitions ?? []) {
    const start = repeat.before?.[metric], end = repeat.inUse?.[metric]
    if (typeof start !== 'number' || typeof end !== 'number' || !Number.isFinite(start) || !Number.isFinite(end)
      || repeat.before?.skipped !== repeat.inUse?.skipped || Math.abs((end - start) - (after - before)) > 1) return
  }
  return {
    before, after, core, slot: slot[0], base, scene,
    source: evidencePath(document.id),
  }
}

export function measuredDspLoad(document: ModuleDocument): DspLoadReading | undefined {
  const active = currentActiveLoad(document)
  const primary = active?.workloads.find(workload => workload.core === 'T1–4' || workload.core === 'T5–8')
  if (active && primary?.core) {
    const load = pairedLoad(primary, primary.core === 'T1–4' ? 'dsp1to4' : 'dsp5to8')
    if (load) {
      return {
        ...load,
        core: primary.core, slot: primary.name, base: activeLoadEvidence.developmentBase.slice(0, 16),
        scene: active.scene, source: activeEvidencePath,
      }
    }
  }
  const measurement = readDspLoad(document, recordedPrice(document.id))
  if (measurement) return measurement
  if (document.id === 'airwindows-chorus' && document.version === airChorus.version) return airChorus
}

export function verifiedNoModuleDspCode(document: ModuleDocument) {
  const record = directDspReadings.get(document.id)
  if (record?.version !== document.version || record.moduleDspWords !== 0) return
  if (record.packageSha256) {
    const entry = resourcePackage(document.id)
    if (entry?.version !== record.version || entry.sha256 !== record.packageSha256) return
  } else {
    const approval = cardBuildApprovals.get(document.id)
    if (approval?.version !== record.version || approval.sourceSha256 !== record.sourceSha256) return
  }
  return record
}

export function readTrackedMemory(document: ModuleDocument, record: DevicePriceRecord | undefined) {
  const reading = currentReading(document, record)
  if (!reading) return
  const phase = reading.result.inUse ?? reading.result.atRest
  if (!phase || phase.skipped !== reading.before.skipped) return
  const base = reading.before.allocation, after = phase.allocation
  // Undo can leave the module pool occupied after the live inventory returns to empty.
  if (base?.modulePoolBytes !== 0) return
  const differences = (['modulePoolBytes', 'dspProgramWordsT1to4', 'dspProgramWordsT5to8'] as const).map(key => {
    const start = base?.[key], end = after?.[key]
    return typeof start === 'number' && typeof end === 'number' && Number.isSafeInteger(start) && Number.isSafeInteger(end) && start >= 0
      ? end - start
      : -1
  })
  if (differences.some(value => value < 0) || differences.every(value => value === 0)) return
  return {
    poolBytes: differences[0], dspWordsT1to4: differences[1], dspWordsT5to8: differences[2],
    scene: reading.scene, base: reading.base, slot: reading.result.inUseOn, source: evidencePath(document.id),
  }
}

export function measuredTrackedMemory(document: ModuleDocument) {
  return readTrackedMemory(document, recordedPrice(document.id))
}

export function measuredModulePool(document: ModuleDocument) {
  const record = modulePoolReadings.get(document.id)
  if (record?.version !== document.version || record.trials.length < 2 || record.loaderExtentBytes <= 0
    || record.trials.some(trial => !trial.rolledBack || trial.installed.modulePoolBytes !== record.loaderExtentBytes)) return
  if (record.package === 'published') {
    const entry = resourcePackage(document.id)
    if (entry?.sha256 !== record.packageSha256) return
  }
  const sampleBytes = record.samplePoolBytes
  if (sampleBytes !== undefined && (!Number.isSafeInteger(sampleBytes) || sampleBytes <= 0
    || record.trials.some(trial => !trial.samplePagesBorrowed || trial.samplePagesBorrowed * 6144 !== sampleBytes))) return
  return {
    bytes: record.loaderExtentBytes, device: modulePoolEvidence.instrument,
    base: modulePoolEvidence.developmentBase, scene: record.scene, sampleBytes,
    source: 'docs/verification/2026-11-21-octatrack-module-pool-allocation.json',
  }
}
