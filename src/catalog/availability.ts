// SPDX-License-Identifier: GPL-3.0-or-later OR Elastic-2.0
// Copyright (c) 2026 Jannik Aßfalg (repeat98)
import { MODULES, resolveSelection } from './modules.ts'
import type { AddBlock } from './add-blocks.ts'

// POLY8 was paused on 15 October 2026 (testers' freezes, #646), offered again from 0.3.1-experimental (23 October 2026)
// and paused again on 26 November 2026 (owner) until it is optimised further: see PAUSED_MODULE_NOTICES.
// Air Chorus left the beta for everyone with 0.1.3-experimental (17 November 2026). The beta tier is empty until a module needs it again.
export const BETA_MODULE_IDS: readonly string[] = []
export const isBetaModule = (id: string) => BETA_MODULE_IDS.includes(id)

// Temporary frontend suspension. Keep the full source catalog and saved pins intact.
// Tuner and Stem Rec have no USB package yet: paused on 12 November 2026, when the card builder was retired
// (owner), until each has one. Temp Save came back with its 0.1.1 package.
export const PAUSED_MODULE_IDS: readonly string[] = ['stem-rec', 'poly8']
export function isModulePaused(id: string) { return PAUSED_MODULE_IDS.includes(id) }
// A paused module with a notice stays in the library and keeps its page, with its add button locked and the notice
// beside it. Builds, downloads and installs still refuse it like any other paused module. Without a notice it is hidden.
export const PAUSED_MODULE_NOTICES: Readonly<Record<string, { reason: string; detail: string }>> = {
  poly8: {
    reason: 'Paused while we optimise it',
    detail: 'POLY8 is paused while we make it lighter on the Octatrack’s CPU. You can’t add or download it until the optimised version is out. If it is already in one of your sets, remove it to build or sync that set.',
  },
}
// Every module in sdk/catalog.json is offered unless it is paused; build support separately gates firmware.
export const AVAILABLE_MODULES = MODULES.filter(module => !isModulePaused(module.id))
export function availableModules(betaAccess = false) { return MODULES.filter(module => !isModulePaused(module.id) || betaAccess && isBetaModule(module.id)) }
export function isModuleAvailable(id: string, betaAccess = false) { return availableModules(betaAccess).some(module => module.id === id) }
/** The modules the library lists: the available ones and the paused ones that carry a notice. */
export function listedModules(betaAccess = false) { return MODULES.filter(module => isModuleAvailable(module.id, betaAccess) || isModuleListedPaused(module.id, betaAccess)) }
export function isModuleListedPaused(id: string, betaAccess = false) { return !!PAUSED_MODULE_NOTICES[id] && !isModuleAvailable(id, betaAccess) }
/** The locked add button's note for a listed paused module, or undefined when the module can be added. */
export function pausedBlock(id: string, betaAccess = false): AddBlock | undefined {
  const notice = isModuleListedPaused(id, betaAccess) ? PAUSED_MODULE_NOTICES[id] : undefined
  return notice && { kind: 'paused', withIds: [], reason: notice.reason, detail: notice.detail, key: 'paused:' + id }
}
/** The add notes with every listed paused module's lock on top, which outranks a conflict or the set limit. */
export function withPausedBlocks(blocks: Record<string, AddBlock>, betaAccess = false): Record<string, AddBlock> {
  const paused = Object.keys(PAUSED_MODULE_NOTICES).flatMap(id => { const block = pausedBlock(id, betaAccess); return block ? [[id, block] as const] : [] })
  return paused.length ? { ...blocks, ...Object.fromEntries(paused) } : blocks
}
export function moduleAvailabilityError(ids: readonly string[], betaAccess = false): string {
  const paused = resolveSelection(ids).filter(module => isModulePaused(module.id) && !(betaAccess && isBetaModule(module.id)))
  return paused.length ? 'Temporarily unavailable: ' + paused.map(module => module.name).join(', ') + '. Remove these modules from this configuration to continue.' : ''
}
