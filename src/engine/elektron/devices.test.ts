import { describe, expect, it } from 'vitest'
import { DIGITAKT_MK1, OCTATRACK, UnknownFirmware, forTarget, identify, targetOf, versionAt } from './devices.ts'

describe('builder machines', () => {
  it('identifies a stock file by its hash and round-trips a module target', () => {
    const [device, release] = identify(OCTATRACK.releases[0].binSha256)
    expect([device.key, release.version]).toEqual(['octatrack', '1.40C'])
    expect(forTarget(targetOf(DIGITAKT_MK1, DIGITAKT_MK1.releases[1]))[1].version).toBe('1.54')
    expect(versionAt(0x11)).toBe(0x0c)
  })
  it('refuses an unknown file and names what it supports', () => {
    expect(() => identify('0'.repeat(64))).toThrow(UnknownFirmware)
    expect(() => identify('0'.repeat(64))).toThrow(/this builder knows .*Digitakt mk1 1\.53/)
  })
})
