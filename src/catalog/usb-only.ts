// SPDX-License-Identifier: GPL-3.0-or-later
// A module whose published USB package needs a base DSP feature (ABI 9 `requires`, sdk/machines/octatrack/dsp-sites.json,
// such as the key bus), is built from C `sources`, or explicitly declares `usbOnly: true`, exists only on the
// Modwerk base loaded over USB. Card firmware has no base, so the card build
// refuses it; USB sync still takes it. Derived from the published package, never listed per module, and not checked
// against the selected version: the published package is the only one the site offers.
import packages from '../engine/assets/octatrack-module-packages.json' with { type: 'json' }
import { resolveSelection } from './modules.ts'
import { overLimitMessage } from './set-limit.ts'
import { OCTATRACK_BASE_RELEASED } from '../config/octatrack-base.ts'

export type PackageList = { packages: readonly { id: string; requires?: number; sources?: readonly string[]; usbOnly?: boolean; version?: string; lagsBehind?: string; lagReason?: string }[] }
export function moduleUsbOnly(id: string, published: PackageList = packages) {
  return published.packages.some(entry => entry.id === id && (entry.requires ?? 0) !== 0) || moduleCardless(id, published)
}
/** A source runtime or explicitly USB-only package has no card form: the card build neither compiles nor fingerprints it. */
export function moduleCardless(id: string, published: PackageList = packages) {
  return published.packages.some(entry => entry.id === id && (Boolean(entry.sources) || entry.usbOnly === true))
}
/** A USB package kept at an older version than the card build (a declared lag, docs/ADD_A_MODULE.md): what USB installs
 * and why, for the module page and the sync dialog; '' without a lag. */
export function usbLagNote(id: string, published: PackageList = packages) {
  const entry = published.packages.find(entry => entry.id === id && entry.lagsBehind)
  return entry ? 'Over USB this installs ' + entry.version + (entry.lagReason ? ': ' + entry.lagReason : '.') : ''
}

/** Why card firmware cannot include these modules. `usb` says whether this member can sync over USB here: the Octatrack
 * base path is open to them (hasOctatrackBase) and this browser can reach the unit (browserHasUsb). Without it, the
 * refusal says to open Modwerk where USB works once the path is `released` to everyone, and that USB isn't open to them
 * yet before. A set over the module limit (set-limit.ts) is refused too, with its count. */
export function cardBuildError(ids: readonly string[], usb = true, published: PackageList = packages, released = OCTATRACK_BASE_RELEASED): string {
  const usbOnly = resolveSelection(ids).filter(module => moduleUsbOnly(module.id, published)), one = usbOnly.length === 1
  if (!usbOnly.length) return overLimitMessage(ids, 'build')
  const names = usbOnly.map(module => module.name).join(', '), them = one ? 'it' : 'them'
  // Card firmware is the classic build: it has no Modwerk base, so a module that needs the base cannot be in it.
  return names + (one ? ' needs' : ' need') + ' the Modwerk base, so card firmware cannot include ' + them + '. ' +
    (usb ? 'Sync this set over USB, or take ' + them + ' out to build card firmware.'
      : released ? 'This browser can’t reach the base: open Modwerk in Chrome or Edge on a computer to sync over USB, or take ' + them + ' out to build card firmware.'
      : 'Loading modules over USB isn’t open to everyone yet; take ' + them + ' out to build card firmware.')
}
