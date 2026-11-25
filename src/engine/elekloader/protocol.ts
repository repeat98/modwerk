// SPDX-License-Identifier: GPL-3.0-or-later
// The builder's replies as elekloader's kit types them (vendor/elekloader/kit/src/kit/protocol.ts), under the names
// Modwerk's pages use.
export type {
  Device as BuilderDevice, Stock as BuilderStock, Mod as BuilderMod, Added as BuilderAdded, Check as BuilderCheck,
  VersionField as BuilderVersion, Output as BuilderFile, Log as BuilderLog, BuildResult as BuilderResult,
} from '../../../vendor/elekloader/kit/src/kit/protocol.ts'
export type BuilderMachine = 'digitakt' | 'digitakt-ii' | 'digitone' | 'analog-rytm-mkii' | 'digitone-ii'

// Digitakt/Digitone mk1 downloads retain their owner-approved parity gate; Analog Rytm MKII (OS 1.74) downloads are owner-approved too.
// Digitakt II (OS 1.17) builds locally with its library modules, but downloads remain disabled pending qualification/review.
export const DIGI_DOWNLOADS_ENABLED: Readonly<Record<BuilderMachine, boolean>> = {
  digitakt: true,
  'digitakt-ii': false,
  digitone: true,
  'analog-rytm-mkii': true,
  // The Digitone II's base builds on the page (beta) before any module exists; downloads wait for the owner (board, 19 November 2026).
  'digitone-ii': false,
}

// Machines whose page can install a verified build over USB MIDI itself (useUsbUpgrade), as Elektron Transfer does:
// the Digitone II's beta build preview. The OS upgrade protocol ran on its unit (docs/verification/2026-11-19-digitone-ii-os-upgrade-over-usb.md).
export const USB_UPGRADE_MACHINES: readonly BuilderMachine[] = ['digitone-ii']
// Whether the page offers that install, apart from downloads: off until the owner turns it on, since an install puts the
// build on a unit as surely as a download does (owner, #1819, 25 November 2026).
export const USB_UPGRADE_ENABLED: Readonly<Record<BuilderMachine, boolean>> = {
  digitakt: false,
  'digitakt-ii': false,
  digitone: false,
  'analog-rytm-mkii': false,
  'digitone-ii': false,
}
export function usbUpgradeEnabled(machine: string): boolean {
  return (USB_UPGRADE_MACHINES as readonly string[]).includes(machine) && Object.hasOwn(USB_UPGRADE_ENABLED, machine)
    && USB_UPGRADE_ENABLED[machine as BuilderMachine] === true
}

export function digiDownloadsEnabled(machine: string): boolean {
  return Object.hasOwn(DIGI_DOWNLOADS_ENABLED, machine) && DIGI_DOWNLOADS_ENABLED[machine as BuilderMachine] === true
}

// Research machines whose page offers a local core build before any module is published. Build outcomes count
// by machine; download availability remains governed independently above.
export const CORE_BUILD_PREVIEWS: readonly BuilderMachine[] = []
// Shown to beta users only (hasBetaUi): the Digitone II's base alone, with no module yet (owner, board, 19 November 2026).
export const BETA_CORE_BUILD_PREVIEWS: readonly BuilderMachine[] = ['digitone-ii']
export function isCoreBuildPreview(machine: string, beta = false): boolean {
  return (CORE_BUILD_PREVIEWS as readonly string[]).includes(machine) || beta && (BETA_CORE_BUILD_PREVIEWS as readonly string[]).includes(machine)
}
