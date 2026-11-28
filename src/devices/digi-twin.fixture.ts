// SPDX-License-Identifier: GPL-3.0-or-later OR Elastic-2.0
// Copyright (c) 2026 Jannik Aßfalg (repeat98)
import MACHINE_MODULES from '../catalog/machine-modules.json'
import { COMMUNITY_MODULES } from '../community/modules'
import { DIGI_MODS } from './digi-mods'

/** Test use only. No module has shared an ID across the Digi machines since digihealth left the library
 *  (27 November 2026), and the tests that keep machine IDs apart still need one. `withDigitoneTwin` runs `run`
 *  with a Digitone copy of the Digitakt module `id` in the machine library, the Digi module list and the community
 *  catalog, which the site and the server read when called. Everything is put back afterwards. */
export async function withDigitoneTwin<T>(run: () => T | Promise<T>, id = 'digiperform'): Promise<T> {
  const documents = MACHINE_MODULES.modules, mods = DIGI_MODS, community = COMMUNITY_MODULES
  const saved = [documents.slice(), mods.slice(), community.slice()] as const
  const document = documents.find(module => module.machine === 'digitakt' && module.id === id)!
  documents.push({ ...document, machine: 'digitone' })
  mods.push({ ...mods.find(mod => mod.device === 'digitakt' && mod.id === id)!, device: 'digitone' })
  const entry = community.find(module => module.id === 'digitakt-' + id)!
  community.push({ ...entry, id: 'digitone-' + id, machine: 'digitone', maintainers: [...entry.maintainers], href: '#digitone/module/' + id, sourcePath: 'sdk/digitone/modules/' + id })
  try { return await run() } finally {
    documents.splice(0, documents.length, ...saved[0]); mods.splice(0, mods.length, ...saved[1]); community.splice(0, community.length, ...saved[2])
  }
}
