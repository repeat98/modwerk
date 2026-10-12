// SPDX-License-Identifier: GPL-3.0-or-later
// Source recipe adapter; the separately qualified/frozen engines remain unchanged.
import { parseElemodSite } from './module-contract-v3.ts'
import { explicitSite } from './elemod-site-recipe.ts'
import { materializeModuleObject, type CompiledElemodPlan } from '../engine/elektron/module-object.ts'
import { LINK_DEVICES, parseElemod, ModError, type LinkDevice } from '../engine/elektron/elemod.ts'
import { sha256Hex } from '../engine/elektron/hash.ts'

export async function materializeElemodRecipe(plan: CompiledElemodPlan, stock: Uint8Array, devices: readonly LinkDevice[] = LINK_DEVICES) {
  const sites = plan.sites.map(site => parseElemodSite(site))
  const isAuthored = (site: typeof sites[number]) => site.op === 'bytes' || site.op === 'lea'
  const legacy = sites.filter(site => !isAuthored(site))
  // Existing image identity, legacy sites, inline resumes and derivation checks stay mandatory.
  const module = await materializeModuleObject({ ...plan, sites: legacy }, stock, devices)
  const parsed = parseElemod(module, plan.id, devices), base = parsed.device.mainLoad
  const generated = module.sites as Record<string, unknown>[], merged = []
  let index = 0
  for (const site of sites) {
    if (!isAuthored(site)) { merged.push(generated[index++]); continue }
    const offset = Number(site.addr) - base
    if (offset < 0 || offset + site.len > stock.length) throw new ModError('Recipe patch is outside the image')
    if (await sha256Hex(stock.subarray(offset, offset + site.len)) !== site.stockSha256) throw new ModError('Recipe stock guard does not match')
    merged.push(explicitSite(site))
  }
  // FAST AUDIO may append derived sites after the explicit declarations.
  const result = { ...module, sites: [...merged, ...generated.slice(index)] }
  parseElemod(result, plan.id, devices)
  return result
}
