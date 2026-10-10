// SPDX-License-Identifier: GPL-3.0-or-later OR Elastic-2.0
// Copyright (c) 2026 Jannik Aßfalg (repeat98)
/** Public attribution only. Contributors do not acquire maintainer or release access. */
export type ModuleContributor = { github: string; name?: string }

const OWNER = { github: 'repeat98', name: 'Jannik Aßfalg' }
/** The owner is credited by name wherever the catalogue only has their GitHub login. */
export const displayName = (github: string, name = github) => github.toLowerCase() === OWNER.github ? OWNER.name : name
/** Free-text credits written before the name was fixed still say the handle. */
export const ownerCredit = (text: string) => text.replace(/Jannik A(?:ss|ß)falg \(@?repeat98\)|@?\brepeat98\b(?![\w/.-])/g, OWNER.name)

export const contributorSearchText = (contributors?: readonly ModuleContributor[]) => contributors?.map(person => person.github + ' ' + (person.name ?? '')).join(' ') ?? ''

export function parseModuleContributors(value: unknown, primary: string, path: string): ModuleContributor[] {
  if (!Array.isArray(value) || value.length > 20) throw new Error(path + ': expected an array of at most 20 contributors')
  const seen = new Set([primary.toLowerCase()])
  return value.map((entry, index) => {
    const label = path + '[' + index + ']'
    if (!entry || typeof entry !== 'object' || Array.isArray(entry) || Object.keys(entry).some(key => !['github', 'name'].includes(key))) throw new Error(label + ': expected github and optional name')
    const { github, name } = entry as Record<string, unknown>
    if (typeof github !== 'string' || !/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/.test(github)) throw new Error(label + '.github: expected a GitHub login')
    if (seen.has(github.toLowerCase())) throw new Error(label + '.github: credit each person once')
    seen.add(github.toLowerCase())
    if (name !== undefined && (typeof name !== 'string' || !name.trim() || name.length > 100 || Array.from(name).some(character => character.charCodeAt(0) < 32))) throw new Error(label + '.name: expected a nonempty name within 100 characters')
    return { github, ...(name === undefined ? {} : { name: (name as string).trim() }) }
  })
}
