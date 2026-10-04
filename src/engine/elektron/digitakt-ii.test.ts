import { describe, expect, it } from 'vitest'
import { DIGITAKT_II_IDENTITY, verifyDigitaktIiSeal } from './digitakt-ii'
import type { Ele3File } from './ele3'
import MACHINES from '../../devices/machines.generated.json'

// Arbitrary bootstrap/key material and container, containing no stock firmware.
async function fixture(seedText = 'Master Overdrive', duplicate = false, truncate = false) {
  const seed = new TextEncoder().encode(seedText)
  const constant = Uint8Array.from({ length: 32 }, (_, i) => i * 3 + 1)
  const bootstrap = new Uint8Array(seed.length + 1 + (truncate ? 8 : 32) + (duplicate ? seed.length + 1 : 0))
  bootstrap.set(seed)
  bootstrap.set(constant.slice(0, truncate ? 8 : 32), seed.length + 1)
  if (duplicate) bootstrap.set(seed, seed.length + 33)
  const container = new Uint8Array(128)
  const first = new Uint8Array(await crypto.subtle.digest('SHA-256', seed))
  const last = new Uint8Array(await crypto.subtle.digest('SHA-256', seed.slice().reverse()))
  const raw = Uint8Array.from(constant, (byte, i) => byte ^ first[i] ^ last[i])
  const key = await crypto.subtle.importKey('raw', raw, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  container.set(new Uint8Array(await crypto.subtle.sign('HMAC', key, container.slice(0, 96))), 96)
  return { deviceId: 0x14, stored: new Map([[2, bootstrap]]), container, total: 128,
    table: [{ id: 2, offset: 0, length: 96, destination: 0 }] } as Ele3File
}

describe('Digitakt II read-only seal verification', () => {
  it('verifies synthetic data with the transient bootstrap-derived key', async () => {
    await expect(verifyDigitaktIiSeal(await fixture())).resolves.toBeUndefined()
  })
  it('refuses a changed seal and changed container content', async () => {
    for (const at of [12, 127]) {
      const file = await fixture(); file.container[at] ^= 1
      await expect(verifyDigitaktIiSeal(file)).rejects.toThrow('seal failed')
    }
  })
  it('refuses another product, missing bootstrap, missing/duplicate seed and incomplete key material', async () => {
    const file = await fixture()
    await expect(verifyDigitaktIiSeal({ ...file, deviceId: 0x0a })).rejects.toThrow('bootstrap')
    await expect(verifyDigitaktIiSeal({ ...file, stored: new Map() })).rejects.toThrow('bootstrap')
    await expect(verifyDigitaktIiSeal(await fixture('Another seed'))).rejects.toThrow('exactly once')
    await expect(verifyDigitaktIiSeal(await fixture('Master Overdrive', true))).rejects.toThrow('exactly once')
    await expect(verifyDigitaktIiSeal(await fixture('Master Overdrive', false, true))).rejects.toThrow('incomplete')
  })
  it('requires the trailer at exactly the aligned end of the sections', async () => {
    const file = await fixture()
    await expect(verifyDigitaktIiSeal({ ...file, total: 96 })).rejects.toThrow('misplaced')
    await expect(verifyDigitaktIiSeal({ ...file, table: [{ ...file.table[0], length: 112 }] })).rejects.toThrow('misplaced')
  })
  it('pins the same original OS as the machine profile', () => {
    const profile = MACHINES.find(machine => machine.id === 'digitakt-ii')!
    expect(profile.firmware!.releases).toEqual([{ version: '1.17', files: [{ name: 'Digitakt_II_OS1.17.syx', sha256: DIGITAKT_II_IDENTITY.releases[0].syxSha256 }] }])
  })
})
