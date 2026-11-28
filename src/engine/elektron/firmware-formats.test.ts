import { describe, expect, it } from 'vitest'
import { FormatError, checkVersion, load } from './firmware-formats.ts'
import { UnknownFirmware, OCTATRACK, DIGITAKT_MK1 } from './devices.ts'
import { BadZipFile, members } from './zip.ts'

describe('OS file families', () => {
  it('refuses an unknown file, a broken zip and a version the field cannot show', async () => {
    await expect(load(Uint8Array.of(1, 2, 3))).rejects.toThrow(UnknownFirmware)
    await expect(load(Uint8Array.of(0x50, 0x4b, 3, 4, 0))).rejects.toThrow(FormatError)
    expect(() => members(new Uint8Array(30))).toThrow(BadZipFile)
    expect(() => checkVersion(DIGITAKT_MK1, 'ABC')).toThrow('exactly 4')
    expect(() => checkVersion(OCTATRACK, 'MODWERK')).not.toThrow()
  })
})
