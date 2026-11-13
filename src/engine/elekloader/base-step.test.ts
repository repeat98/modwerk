// SPDX-License-Identifier: GPL-3.0-or-later
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { sha } from '../../../vendor/elekloader/kit/src/bytes.ts'
import { STEP_ASSETS, STEP_DEFAULT_LAYOUT, STEP_IDENTITIES } from './base-step'
import { variantPackage, type BaseLayout, type BaseVariants } from './base-variants'

const asset = (name: string) => readFileSync(new URL('../assets/octatrack-base-step' + name, import.meta.url))

describe('the step base', () => {
  it('is the frozen copy its pins name', () => {
    expect(sha(asset('.elemod'))).toBe(STEP_ASSETS.package)
    expect(sha(asset('-fills.json'))).toBe(STEP_ASSETS.fills)
    expect(sha(asset('-variants.json'))).toBe(STEP_ASSETS.variants)
  })
  it('builds every layout from its own package and variants', () => {
    const text = asset('.elemod').toString(), variants = JSON.parse(asset('-variants.json').toString()) as BaseVariants
    const base = { defaultLayout: STEP_DEFAULT_LAYOUT, identity: (layout: BaseLayout) => STEP_IDENTITIES[layout] }
    expect(variants.packageSha256).toBe(STEP_ASSETS.package)
    expect(variantPackage(text, variants, STEP_DEFAULT_LAYOUT, base)).toBeUndefined()
    for (const layout of Object.keys(STEP_IDENTITIES) as BaseLayout[]) {
      if (layout === STEP_DEFAULT_LAYOUT) continue
      expect(variants.variants.find(item => item.layout === layout)?.identity).toBe(STEP_IDENTITIES[layout])
      expect(variantPackage(text, variants, layout, base)?.text).toContain(STEP_IDENTITIES[layout])
    }
    expect(text).toContain(STEP_IDENTITIES[STEP_DEFAULT_LAYOUT])
  })
})
