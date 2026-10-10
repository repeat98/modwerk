// SPDX-License-Identifier: GPL-3.0-or-later OR Elastic-2.0
// Copyright (c) 2026 Jannik Aßfalg (repeat98)
import { MODULE_DOCUMENTS } from './documents.ts'
import { moduleReleasedAt } from './module-releases.ts'
import sdkCatalog from '../../sdk/catalog.json' with { type: 'json' }
import type { ModuleContributor } from './module-authors'
export const CATALOG_SOURCE = {
  repository: 'https://github.com/repeat98/octamad',
  revision: 'b8deefc88b2c3e5f3c6158e364eb741df1924e1d',
  branch: 'codex/dsp-dynload',
} as const

export const LIBRARY_CATEGORIES = ['effects', 'playback', 'machines', 'scenes', 'midi-usb', 'system', 'standalone'] as const
export type ModuleCategory = typeof LIBRARY_CATEGORIES[number]
// Sidebar names, shared by every machine so the library keeps one shape when switching machines.
export const LIBRARY_CATEGORY_LABELS: Record<ModuleCategory, string> = { effects: 'Effects', playback: 'Playback', machines: 'Machines', scenes: 'Scenes', 'midi-usb': 'MIDI & USB', system: 'System', standalone: 'Standalone firmware' }
// Standalone firmware replaces the whole OS, so it is chosen on its own rather than combined with other mods.
export const STANDALONE_NOTE = 'Complete custom firmware that replaces the whole OS. Use one at a time: it never combines with other mods.'
// Library grouping can change without rewriting approved module metadata or qualification pins.
const LIBRARY_CATEGORY_OVERRIDES: Readonly<Partial<Record<string, ModuleCategory>>> = {
  'midi-scenes': 'midi-usb',
  previewvol: 'system',
  quantizer: 'system',
  repitch: 'system',
}
// When each module first entered the catalog, kept through version updates for the Recently added sort.
export const MODULE_ADDED_AT: Readonly<Record<string, string>> = Object.fromEntries(sdkCatalog.modules.map(item => [item.id, item.addedAt]))
export type FirmwareModule = {
  id: string
  key: string
  name: string
  category: ModuleCategory
  description: string
  detail: string
  author: string
  authorName: string
  authorUrl: string
  contributors?: readonly ModuleContributor[]
  sourcePath: string
  fxId?: number
  version: string
  addedAt: string
  updatedAt?: string
}

export const MODULES: readonly FirmwareModule[] = MODULE_DOCUMENTS.map(document=>({
  id:document.id,key:document.key,name:document.name,category:LIBRARY_CATEGORY_OVERRIDES[document.id]??document.category,
  description:document.presentation.summary,detail:document.compatibility.location,
  author:document.author.github,authorName:document.author.name??document.author.github,authorUrl:'https://github.com/'+document.author.github,
  contributors:document.author.contributors,
  sourcePath:'sdk/octabam/modules/'+document.id+'/manifest.py',version:document.version,addedAt:MODULE_ADDED_AT[document.id],updatedAt:moduleReleasedAt(document.id,document.version),fxId:document.compatibility.effectId??undefined,
}))

// DSP code that stock code reaches through hooks, with no effect ID or chooser row.
export const HOOKED_DSP_IDS: readonly string[] = ['output-matrix']
// Every module with an effect ID adds DSP code, paused ones included, and so does every hooked module.
export const DSP_EFFECT_IDS: readonly string[] = MODULES.filter(module => module.fxId !== undefined || HOOKED_DSP_IDS.includes(module.id)).map(module => module.id)

export function getModuleSource(module: FirmwareModule): string {
  const source = MODULE_DOCUMENTS.find(document => document.id === module.id)?.source
  return source ? source.repository + '/tree/' + source.revision + '/' + source.path : CATALOG_SOURCE.repository + '/tree/' + CATALOG_SOURCE.revision + '/modules/' + module.id
}

export function resolveSelection(ids: readonly string[]): FirmwareModule[] {
  const unknown = ids.filter((id) => !MODULES.some((module) => module.id === id))
  if (unknown.length) throw new Error('Unknown module: ' + unknown.join(', '))
  const selected = new Set(ids)
  return MODULES.filter((module) => selected.has(module.id))
}
