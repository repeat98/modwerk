import { LIBRARY_CATEGORY_LABELS, type FirmwareModule } from './modules'
import { DETAILS } from './details'
import { contributorSearchText } from './module-authors'
import { DEVICES_BY_ID } from '../devices/registry'
import type { DigiMod } from '../devices/digi-mods'

function normalize(text: string) {
  return text.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
}

// All words may appear in any order, across the module's actual catalogue fields.
export function matchesModuleQuery(query: string, ...fields: string[]) {
  const words = normalize(query).split(' ').filter(Boolean)
  const text = normalize(fields.join(' '))
  return words.every(word => text.includes(word))
}

export function octatrackMatchesQuery(module: FirmwareModule, query: string) {
  return matchesModuleQuery(query, module.name, module.description, module.authorName, module.author,
    contributorSearchText(module.contributors), 'Octatrack', module.type, DETAILS[module.id].family, LIBRARY_CATEGORY_LABELS[module.category])
}

export function digiMatchesQuery(module: DigiMod, query: string) {
  return matchesModuleQuery(query, module.title, module.summary, module.author, contributorSearchText(module.contributors),
    DEVICES_BY_ID[module.device].name, module.category, module.sourceFamily ?? '', LIBRARY_CATEGORY_LABELS[module.libraryCategory])
}
