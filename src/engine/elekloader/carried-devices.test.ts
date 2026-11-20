import { describe, expect, it } from 'vitest'
import DN2 from '../../../sdk/machines/digitone-ii/elekloader/device.json' with { type: 'json' }
import { DIGITAKT_MK2, devices, identify, linkable } from '../../../vendor/elekloader/kit/src/devices.ts'
import { ELE3_DEVICES } from '../elektron/ele3'
import { LINK_DEVICES } from '../elektron/elemod'
import { CARRIED_DEVICES, carriedDevice, carryDevices } from './carried-devices'

describe('devices Modwerk\'s builder carries', () => {
  it('adds the Digitone II to the kit once, beside the kit\'s own devices', () => {
    carryDevices()
    carryDevices()
    expect(devices().filter(d => d.key === 'digitone-mk2')).toHaveLength(1)
    expect(devices()).toContain(DIGITAKT_MK2)
    const [device, release] = identify(DN2.device.releases[0].syx_sha256)
    expect([device.key, release.version, linkable(device)]).toEqual(['digitone-mk2', '1.12', true])
  })

  it('is the Digitakt II platform with its own id, release and seal seed, and no SRAM code area', () => {
    const dn2 = carriedDevice(DN2.device)
    expect({ ...dn2, key: '', name: '', sysexId: 0, releases: [], hmacKeyFrom: null, areas: {}, sramCode: [0, 0], fastTable: '' })
      .toEqual({ ...DIGITAKT_MK2, key: '', name: '', sysexId: 0, releases: [], hmacKeyFrom: null, areas: {}, sramCode: [0, 0], fastTable: '' })
    expect(dn2.hmacKeyFrom).toEqual([2, 'Multiplier'])
    expect(dn2.areas).toEqual({ ddr: [0x47f00000, 0x47f40000] })
  })

  it('agrees with Modwerk\'s linker and container profiles', () => {
    for (const device of CARRIED_DEVICES) {
      const link = LINK_DEVICES.find(d => d.key === device.key)!
      expect(link).toBeDefined()
      expect([link.sysexId, link.mainLoad, link.ddr]).toEqual([device.sysexId, device.mainLoad, device.ddr])
      expect(link.releases.map(r => [r.version, r.syxSha256, r.mainSha256, r.mainLength]))
        .toEqual(device.releases.map(r => [r.version, r.syxSha256, r.mainSha256, r.mainLen]))
      const container = ELE3_DEVICES[link.machine]
      expect([container.stage, container.flashAt, container.flashLimit, container.sysexId, container.mainSection])
        .toEqual([device.stage, device.flashAt, device.flashLimit, device.sysexId, device.mainSection])
    }
  })
})
