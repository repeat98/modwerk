import { describe, expect, it } from 'vitest'
import { BASE_FIRMWARE, inspectBaseFirmware } from './base'

describe('base firmware verification', () => {
  it('rejects a wrong-sized file before hashing', async () => {
    await expect(inspectBaseFirmware(new ArrayBuffer(1), BASE_FIRMWARE.filename)).rejects.toThrow('different size')
  })
  it('rejects incorrect bytes even when the name and size match', async () => {
    await expect(inspectBaseFirmware(new ArrayBuffer(BASE_FIRMWARE.bytes), BASE_FIRMWARE.filename)).rejects.toThrow('does not match')
  })
})
