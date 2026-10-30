// SPDX-License-Identifier: GPL-3.0-or-later
// A module whose published USB package needs a base DSP feature (ABI 9 `requires`, sdk/machines/octatrack/dsp-sites.json,
// such as the key bus), is built from C `sources`, or explicitly declares `usbOnly: true`, exists only on the
// Modwerk base loaded over USB. Card firmware has no base, so the card build
// refuses it; USB sync still takes it. Derived from the published package, never listed per module, and not checked
// against the selected version: the published package is the only one the site offers.
import packages from '../engine/assets/octatrack-module-packages.json' with { type: 'json' }
import { resolveSelection } from './modules.ts'

export type PackageList = { packages: readonly { id: string; requires?: number; sources?: readonly string[]; usbOnly?: boolean }[] }
export function moduleUsbOnly(id: string, published: PackageList = packages) {
  return published.packages.some(entry => entry.id === id && (entry.requires ?? 0) !== 0) || moduleCardless(id, published)
}
/** A source runtime or explicitly USB-only package has no card form: the card build neither compiles nor fingerprints it. */
export function moduleCardless(id: string, published: PackageList = packages) {
  return published.packages.some(entry => entry.id === id && (Boolean(entry.sources) || entry.usbOnly === true))
}

/** Why card firmware cannot include these modules. `usb` says whether this member can sync over USB (the beta
 * interface, hasBetaUi): without it the refusal does not point at a sync they cannot start. */
export function cardBuildError(ids: readonly string[], usb = true, published: PackageList = packages): string {
  const usbOnly = resolveSelection(ids).filter(module => moduleUsbOnly(module.id, published)), one = usbOnly.length === 1
  if (!usbOnly.length) return ''
  const names = usbOnly.map(module => module.name).join(', '), them = one ? 'it' : 'them'
  return names + (one ? ' needs' : ' need') + ' the Modwerk base, so card firmware cannot include ' + them + '. ' +
    (usb ? 'Sync this set over USB, or take ' + them + ' out to build card firmware.' : 'Loading the base over USB is in the beta for now; take ' + them + ' out to build card firmware.')
}
