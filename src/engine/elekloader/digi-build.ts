// SPDX-License-Identifier: GPL-3.0-or-later
// Compatibility exports for saved Digi selections and catalogue tooling. Builds use the shared machine entry point.
import { MACHINE_DEVICE } from './machine-build.ts'
export { BUILDER_CATALOG, BUILDER_SOURCE, buildStep, buildLogText, builderReleases, planBuild, prepareBuild,
  createMachineBuilder as createDigiBuilder, type Builder, type PreparedBuild } from './machine-build.ts'
// The updater still imports only approved Digitakt/Digitone releases (and the Digitakt II and Analog Rytm MKII previews) until Octatrack ports qualify.
export const DEVICE = { digitakt: MACHINE_DEVICE.digitakt, 'digitakt-ii': MACHINE_DEVICE['digitakt-ii'], digitone: MACHINE_DEVICE.digitone, 'analog-rytm-mkii': MACHINE_DEVICE['analog-rytm-mkii'] }
