// SPDX-License-Identifier: GPL-3.0-or-later OR Elastic-2.0
// Copyright (c) 2026 Jannik Aßfalg (repeat98)
import { MODULES } from '../catalog/modules'
import { moduleSlug } from '../catalog/module-links'
import { MODULE_DOCUMENTS_BY_ID } from '../catalog/documents'
import MACHINE_MODULES from '../catalog/machine-modules.json'
import type { ModwerkModule } from '../catalog/module-contract-v3'
import { displayName } from '../catalog/module-authors'

// Reviewed maintainer opt-outs apply independently of authorship and source credits.
// Sam Banks asked to be removed as a maintainer on 12 October 2026.
const MAINTAINER_OPT_OUTS: ReadonlySet<string> = new Set(['sambanks'])
const activeMaintainers = (logins: readonly string[]) => logins.filter(login => !MAINTAINER_OPT_OUTS.has(login.toLowerCase()))

/** Community IDs are unique across machines; configuration IDs stay native to each SDK. */
export const COMMUNITY_MODULES = [
  ...MODULES.map(module => ({
    id: module.id, moduleId: module.id, machine: 'octatrack', name: module.name,
    version: module.version, author: module.author, authorName: module.authorName, maintainers: activeMaintainers([module.author]),
    href: '#module/' + moduleSlug(module.id), sourcePath: 'sdk/octabam/modules/' + module.id, summary: module.description,
    evidence: MODULE_DOCUMENTS_BY_ID[module.id].tests.summary,
  })),
  ...(MACHINE_MODULES.modules as ModwerkModule[]).map(module => ({
    id: module.machine + '-' + module.id, moduleId: module.id, machine: module.machine,
    name: module.name, version: module.version, author: module.author.github, authorName: displayName(module.author.github, module.author.name),
    // Internal account-return and notification routes retain hashes; routing upgrades public navigation to paths.
    maintainers: activeMaintainers(module.maintainers), href: '#' + module.machine + '/module/' + module.id,
    sourcePath: 'sdk/' + module.machine + '/modules/' + module.id, summary: module.presentation.summary,
    evidence: module.evidence.tier,
  })),
]
export type CommunityModule = typeof COMMUNITY_MODULES[number]
/** Only reviewed catalog handles confer developer eligibility. */
export function developerModules(login: string | null | undefined) {
  if (!login) return []
  return COMMUNITY_MODULES.filter(module => module.maintainers.some(maintainer => maintainer.toLowerCase() === login.toLowerCase()))
}
export const communityModule = (id: string) => COMMUNITY_MODULES.find(module => module.id === id)
export const machineModules = (machine: string) => COMMUNITY_MODULES.filter(module => module.machine === machine)
export function nativeModule(machine: string, id: string) { return machineModules(machine).find(module => module.moduleId === id) }
/** Each module has one server-created forum thread with this fixed ID. */
export const moduleThreadId = (id: string) => 'module-' + id
/** Open the dedicated report form for catalog modules, sets and reviewed contributions. */
/** The page of a catalog module, set or reviewed contribution. */
export const modulePageHref = (id: string) => communityModule(id)?.href ?? (id.startsWith('remix-') ? '#module-set/' + id.slice(6) : '#community-module/' + id)
export function moduleIssueHref(id: string) { return modulePageHref(id) + '?report=1' }
