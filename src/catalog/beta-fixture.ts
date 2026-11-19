// SPDX-License-Identifier: GPL-3.0-or-later OR Elastic-2.0
// Copyright (c) 2026 Jannik Aßfalg (repeat98)
import { AVAILABLE_MODULES, BETA_MODULE_IDS, PAUSED_MODULE_IDS } from './availability'
import type { FirmwareModule } from './modules'

/** Test use only. The beta tier has been empty since Air Chorus 0.1.3 was released to everyone (17 November 2026),
 *  and the tests of the beta path still need a paused beta module with a USB package. `asBeta` runs `run` with
 *  `id` (Air Chorus by default, the last module that was one) paused, on the beta list and out of
 *  AVAILABLE_MODULES, as before its release; the real availability functions read those lists when called, so
 *  the path under test is the site's own. Everything is put back afterwards. */
export async function asBeta<T>(run: () => T | Promise<T>, id = 'airwindows-chorus'): Promise<T> {
  const beta = BETA_MODULE_IDS as string[], paused = PAUSED_MODULE_IDS as string[], available = AVAILABLE_MODULES as FirmwareModule[]
  const at = available.findIndex(module => module.id === id), removed = at < 0 ? [] : available.splice(at, 1)
  beta.push(id); paused.push(id)
  try { return await run() } finally {
    beta.splice(beta.lastIndexOf(id), 1); paused.splice(paused.lastIndexOf(id), 1)
    if (removed.length) available.splice(at, 0, ...removed)
  }
}
