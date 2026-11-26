// SPDX-License-Identifier: GPL-3.0-or-later
// What the base's restore at startup did with each saved module (USB request 43, elekloader/modset.c), in words: the
// unit itself says only SOME MODULES FAILED or MODULES LEFT OUT.
import { sha } from '../../../vendor/elekloader/kit/src/bytes.ts'
import { RESTORE_GUARD, type RestoreOutcome, type RestoreReport } from './upload-usb.ts'

/** The self-test record's `saved` after a start that loaded only part of the card's set (modset.c REFUSED, LEFT_OUT). */
export const PARTLY_RESTORED = [6, 10] as const
const kb = (bytes: number) => Math.max(1, Math.round(bytes / 1024)) + ' KB'
const RUNTIME_CHECK_DSP = 4

/** Why a module stayed out at startup and what it needs, by the loader's refusal (sdk/runtime/loader-refusals.json) or
 * the boot guard's. A sentence a musician can act on; the code itself for one this site doesn't know. */
export function restoreReason(outcome: Pick<RestoreOutcome, 'refusal' | 'check' | 'bytes' | 'largestFree'>): string {
  switch (outcome.refusal) {
    case RESTORE_GUARD: return 'The last start crashed or froze while loading it, so it was left out. A sync tries it again.'
    case 1: return 'It was built for another Modwerk base. Sync it again.'
    case 2: return outcome.check === RUNTIME_CHECK_DSP ? 'It needs more DSP memory than was free. Remove a module, then sync.'
      : `It needs ${kb(outcome.bytes)} of module memory` + (outcome.largestFree ? `; the largest free block was ${kb(outcome.largestFree)}` : '') + '. Remove a module, then sync.'
    case 3: return 'It changes the same part of the Octatrack as a module that loaded before it.'
    case 4: return 'Every module slot was taken. Remove a module, then sync.'
    case 5: return 'The Octatrack stayed busy for ten seconds while it started (playing, or loading module code). Restart it with the transport stopped.'
    case 6: return 'It needs more DSP time than an effect slot has.'
    case 7: return 'A track was using a module it replaces.'
    case 8: return 'It doesn’t match the OS on this Octatrack.'
    case 9: return 'It changes a part of the Octatrack the base now shares between modules. Install its newer version.'
    case 10: return 'The key bus it needs couldn’t start. Turn the Octatrack off and on.'
    case 11: return 'A module window was open.'
    case 12: return 'Another module’s effect keeps its delay buffer in the memory this one reads. Move that effect off FX2 of track 1, 5 or 7.'
    default: return `The Octatrack refused it (reason ${outcome.refusal}).`
  }
}

/** For the opted-in diagnostics (`restore` on `health`): each module a start left out, by catalogue id (`other` for one
 * the catalogue doesn't list: never its name), the loader's refusal and check. Undefined when none was left out. */
export function restoreDiagnostic(report: RestoreReport | undefined, catalog: readonly { id: string }[]) {
  const left = report?.modules.filter(outcome => !outcome.loaded).slice(0, 128) ?? []
  if (!left.length) return undefined
  const byModule = new Map(catalog.map(module => [sha(new TextEncoder().encode(module.id)).slice(0, 8), module.id]))
  return left.map(outcome => ({ id: byModule.get(outcome.module) ?? 'other', refusal: outcome.refusal, check: outcome.check }))
}

/** The modules a start left out, each with its name (the catalogue's, else the package's, else its id) and reason;
 * undefined without a report or when the report has none left out. `catalog` holds catalogue ids and names. */
export function leftOutAtStartup(report: RestoreReport | undefined, catalog: readonly { id: string; name: string }[]) {
  const left = report?.modules.filter(outcome => !outcome.loaded) ?? []
  if (!left.length) return undefined
  const byModule = new Map(catalog.map(module => [sha(new TextEncoder().encode(module.id)).slice(0, 8), module]))
  return left.map(outcome => {
    const known = byModule.get(outcome.module)
    return { id: known?.id, name: known?.name ?? (outcome.name || 'Module ' + outcome.module), reason: restoreReason(outcome) }
  })
}
