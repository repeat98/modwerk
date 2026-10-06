import { moduleBuildPending } from './build-support'
import { MODULE_DOCUMENTS_BY_ID } from './documents'

// How much evidence backs a module, shown on its library card as a coloured dot: green for a reported hardware
// test, amber for earlier hardware runs, grey for emulator-only evidence, dashed while the build is still verified.
export type CardEvidence = { level: 'reported' | 'historical' | 'emulator' | 'pending'; label: string }

export function moduleEvidence(id: string): CardEvidence {
  const status = MODULE_DOCUMENTS_BY_ID[id].tests.hardwareStatus
  if (moduleBuildPending(id)) return { level: 'pending', label: 'Build verification pending' }
  if (status === 'reported') return { level: 'reported', label: 'Hardware test reported' }
  if (status !== 'untested') return { level: 'historical', label: 'Earlier hardware evidence' }
  return { level: 'emulator', label: 'Emulator evidence' }
}
