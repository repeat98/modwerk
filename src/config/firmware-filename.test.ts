import { describe, expect, it } from 'vitest'
import baseBinding from '../../sdk/machines/octatrack/base-binding.json' with { type: 'json' }
import { CURRENT_BASE_VERSION } from '../engine/elekloader/base-variants'
import { firmwareFilename } from './firmware-filename'

describe('the base file’s name', () => {
  it('carries the base’s version and the start of its identity, and the digits alone for a base without a version', () => {
    expect(CURRENT_BASE_VERSION).toMatch(/^\d+\.\d+$/)
    expect(firmwareFilename('base', baseBinding.identity)).toBe(`Modwerk-octatrack-base-${CURRENT_BASE_VERSION}-${baseBinding.identity.slice(0, 8)}.bin`)
    expect(firmwareFilename('base', 'D891ACB3' + '0'.repeat(56))).toBe('Modwerk-octatrack-base-d891acb3.bin')
    expect(firmwareFilename('Live Sét!', 'd891acb3' + '0'.repeat(56))).toBe('Modwerk-octatrack-live-set-d891acb3.bin')
  })
})
