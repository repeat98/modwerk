import { describe, expect, it } from 'vitest'
import { readRomPackage, linkRomText, createWideDial } from './rom-package'
import packages from './assets/rom-packages.json'
async function hash(bytes: Uint8Array) {
  const digest = await crypto.subtle.digest('SHA-256', new Uint8Array(bytes).buffer)
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')
}
describe('authored ROM linking', () => {
  it('matches native linking at four origins', async () => {
    for (const pkg of packages.packages) for (const proof of pkg.proofs) {
      const object = await readRomPackage(pkg.label)
      const externals = new Map(Object.entries(proof.externals as Record<string, number>))
      const linked = linkRomText(object, proof.base, externals)
      expect(linked.bytes.length, pkg.label).toBe(proof.bytes)
      expect(await hash(linked.bytes), pkg.label).toBe(proof.sha256)
      for (const [name, address] of linked.symbols) expect((proof.exports as Record<string, number>)[name], name).toBe(address)
      expect(object.sections.find(section => section.name === '.text')!.data).not.toBe(linked.bytes)
    }
  })
  it('matches native wide dial code with one and three formatter rows', async () => {
    for (const proof of packages.wideProofs) {
      const rows = proof.rows.map(row => [row[0], row[1]] as const)
      const linked = await createWideDial(rows, proof.base)
      expect(linked.bytes.length).toBe(proof.bytes)
      expect(await hash(linked.bytes)).toBe(proof.sha256)
    }
  })
  it('refuses unknown packages, unsupported sections and bad rows', async () => {
    await expect(readRomPackage('invented')).rejects.toThrow('Unknown ROM package')
    const repitch = await readRomPackage('repitch'), data = repitch.sections.find(section => section.name === '.data')!
    data.size = 4; data.data = new Uint8Array(4)
    expect(() => linkRomText(repitch, 0x400d7500)).toThrow('reviewed placement profile')
    await expect(createWideDial([], 0x400d7500)).rejects.toThrow('invalid formatter rows')
    await expect(createWideDial([[0x400d7500, 0]], 0x400d7700)).rejects.toThrow('invalid formatter rows')
    await expect(createWideDial([[0x400d7500, 31], [0x400d7500, 31]], 0x400d7700)).rejects.toThrow('invalid formatter rows')
  })
})
