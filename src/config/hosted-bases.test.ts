import { describe, expect, it } from 'vitest'
import { hostedOctatrackEntry } from './hosted-bases'
import { buildLayout, layoutIdentity } from '../engine/elekloader/base-variants'
import { STEP_IDENTITIES } from '../engine/elekloader/base-step'

const image = (identity: string, layout: string, step?: boolean) => ({ machine: 'octatrack', identity, layout, step, sha256: 'a'.repeat(64), size: 1, file: 'base.bin' })

describe('hosted Octatrack base', () => {
  const layout = buildLayout()
  it('takes the image whose identity the site publishes for the layout it would build', () => {
    const good = image(layoutIdentity(layout)!, layout)
    expect(hostedOctatrackEntry([image('f'.repeat(64), layout), good], undefined)).toBe(good)
  })
  it('refuses an unpublished identity and keeps step and main images apart', () => {
    expect(hostedOctatrackEntry([image('f'.repeat(64), layout)])).toBeUndefined()
    const step = image(STEP_IDENTITIES.main, 'main', true)
    expect(hostedOctatrackEntry([step], 'main')).toBeUndefined()
    expect(hostedOctatrackEntry([step], 'main', true)).toBe(step)
    expect(hostedOctatrackEntry([image(STEP_IDENTITIES.off, 'main', true)], 'main', true)).toBeUndefined()
  })
})
