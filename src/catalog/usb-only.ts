// SPDX-License-Identifier: GPL-3.0-or-later
// A module whose published USB package needs a base DSP feature (ABI 9 `requires`, sdk/machines/octatrack/dsp-sites.json,
// such as the key bus), is built from C `sources`, or explicitly declares `usbOnly: true`, exists only on the
// Modwerk base loaded over USB. Card firmware has no base, so the card build
// refuses it; USB sync still takes it. Derived from the published package, never listed per module, and not checked
// against the selected version: the published package is the only one the site offers.
import packages from '../engine/assets/octatrack-module-packages.json' with { type: 'json' }

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
