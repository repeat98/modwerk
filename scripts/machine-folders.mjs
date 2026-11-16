// SPDX-License-Identifier: GPL-3.0-or-later
// Which machines take modules and where their folders are, read from the machine registry (sdk/machines/*/machine.json,
// generated into src/devices/machines.generated.json by `npm run machines:generate`). The checks build their path patterns
// from this, so a machine that gains a module folder is scoped like the others without editing them.
import { readFileSync } from 'node:fs'

const profiles = JSON.parse(readFileSync(new URL('../src/devices/machines.generated.json', import.meta.url), 'utf8')).filter(profile => profile.sdk)

const folderOf = profile => {
  const folder = /^sdk\/([a-z0-9-]+)\/modules$/.exec(profile.sdk.modules)?.[1]
  if (!folder) throw new Error(profile.id + ': machine.sdk.modules is ' + profile.sdk.modules + '; the checks expect sdk/<folder>/modules')
  return folder
}

/** The folders under sdk/ that hold modules, for one platform ('octabam', 'elemod', 'zdl') or for all. */
export const moduleFolders = platform => [...new Set(profiles.filter(profile => !platform || profile.sdk.platform === platform).map(folderOf))]

/** The machine ids of one platform. */
export const machineIds = platform => profiles.filter(profile => profile.sdk.platform === platform).map(profile => profile.id)

/** `a|b|c`, for a regular expression group: folder names and machine ids are [a-z0-9-] only. */
export const alternation = names => names.join('|')
