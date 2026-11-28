// SPDX-License-Identifier: GPL-3.0-or-later
// The base the site publishes for a layout, built from an OS file: one path for the browser's worker (session.ts) and
// the owner's hosted images (scripts/base-publish.mjs), so a hosted image is byte for byte what the browser builds.
import { sha } from '../elektron/bytes.ts'
import { buildBase, type BaseFill } from './octatrack-base.ts'
import { buildLayout, DEFAULT_LAYOUT, variantPackage, type BaseLayout, type BaseVariants } from './base-variants.ts'
import { STEP_ASSETS, STEP_DEFAULT_LAYOUT, STEP_IDENTITIES } from './base-step.ts'

/** The text of one of the base's assets; `step` names the step base's (base-step.ts). */
export type BaseAssetLoader = (asset: 'package' | 'variants' | 'fills', step: boolean) => Promise<string>

export async function buildPublishedBase(stock: Uint8Array, load: BaseAssetLoader, requested?: BaseLayout, step = false) {
  const layout = buildLayout(requested, step)
  // The step base's three assets are each checked against their pin.
  const asset = async (name: 'package' | 'variants' | 'fills', what: string) => {
    const text = await load(name, step)
    if (step && sha(new TextEncoder().encode(text)) !== STEP_ASSETS[name]) throw new Error(what + ' is damaged. Reload the page and try again.')
    return text
  }
  let text = await asset('package', 'The base package')
  let fills = JSON.parse(await asset('fills', 'The base package')) as BaseFill[]
  if (layout !== (step ? STEP_DEFAULT_LAYOUT : DEFAULT_LAYOUT)) {
    const layouts = JSON.parse(await asset('variants', 'The base layouts')) as BaseVariants
    const variant = step ? variantPackage(text, layouts, layout, { defaultLayout: STEP_DEFAULT_LAYOUT, identity: item => STEP_IDENTITIES[item] }) : variantPackage(text, layouts, layout)
    if (variant) ({ text, fills } = variant)
  }
  const built = await buildBase(stock, text, fills)
  if (step && built.base !== STEP_IDENTITIES[layout]) throw new Error('The step base did not build as published. Reload the page and try again.')
  return { ...built, layout }
}
