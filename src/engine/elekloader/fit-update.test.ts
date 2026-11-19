import { describe, expect, it } from 'vitest'
import DN2 from '../../../sdk/machines/digitone-ii/elekloader/device.json' with { type: 'json' }
import { DIGITAKT_MK2 } from '../../../vendor/elekloader/kit/src/devices.ts'
import { CARRIED_DEVICES } from './carried-devices'
import { fitBuilt, updateLimit } from './fit-update'

describe('update limits', () => {
  it('give the Digitone II the 2 MiB its unit takes, and no other device a limit Modwerk has not seen', () => {
    expect(DN2.device.update_max).toBe('0x200000')
    expect(updateLimit(CARRIED_DEVICES.find(d => d.key === 'digitone-mk2')!)).toBe(0x200000)
    expect(updateLimit(DIGITAKT_MK2)).toBeNull()
  })
  it('leaves a build for a device with no known limit exactly as the kit returned it', async () => {
    const result = { device: 'digitakt-mk2', files: [{ name: 'a.syx', path: 'a.syx', bytes: 1, sha256: 'x', data: new ArrayBuffer(1) }], sha256: 'x', bytes: 1 }
    expect(await fitBuilt(result, new Uint8Array(0))).toBe(result)
  })
})
