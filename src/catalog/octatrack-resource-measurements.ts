import type { ModuleDocument } from './module-contract'

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

const records = import.meta.glob<DevicePriceRecord>(
  '../../sdk/octatrack/modules/*/evidence/cpu-price.json',
  { eager: true, import: 'default' },
)

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

export function measuredDspLoad(document: ModuleDocument) {
  const measurement = readDspLoad(document, recordedPrice(document.id))
  if (measurement) return measurement
  if (document.id === 'airwindows-chorus' && document.version === airChorus.version) return airChorus
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
