import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildPart, concat, parseAis } from './ais'
import { MIDISTOMP, applyPatches, buildBase, sha256, type ZoomPatch } from './zoom-base'

const words = (...values: number[]) => new Uint8Array(Uint32Array.from(values).buffer)
// A small AIS image: magic, a register set, one section, a function call, jump-and-close, padding and a trailer.
const IMAGE = concat([
  words(0x41504954, 0x58535907, 3, 0x01c14120, 1, 0, 0x58535901, 0x1000, 6), Uint8Array.of(1, 2, 3, 4, 5, 6, 0, 0),
  words(0x5853590d, (1 << 16) | 5, 0xabc, 0x58535906, 0x1000), new Uint8Array(32).fill(0xff), new TextEncoder().encode('ZOOM Corporation'),
])
const PRESET = Uint8Array.of(9, 8, 7, 6)
const stock = { 'Main.bin': IMAGE, 'Preset.bin': PRESET }
const guard = async (...bytes: number[]) => ({ expect_sha256: await sha256(Uint8Array.from(bytes)), expect_length: bytes.length })

describe('the Zoom base builder', () => {
  it('reads an AIS image and writes it back unchanged', () => {
    const img = parseAis(IMAGE)
    expect(img.sections).toEqual([{ addr: 0x1000, data: Uint8Array.of(1, 2, 3, 4, 5, 6) }])
    expect(buildPart(img, IMAGE)).toEqual(IMAGE)
    expect(() => parseAis(IMAGE.slice(0, 40))).toThrow(/cut off/)
  })
  it('applies writes behind hashed guards, new sections and logo bytes, copying repeated stock bytes from the user’s file', async () => {
    const patch: ZoomPatch = {
      name: 't',
      write: [{ model: 'b', addr: 0x1002, ...await guard(3, 4), data: 'aabb' }],
      section: [{ model: 'b', addr: 0x2000, data: [['hex', '01'], ['copy', 'Preset.bin', 0, 3]] }],
      bin133: [{ model: 'b', offset: 1, ...await guard(8), data: 'ee' }],
    }
    const { main, preset } = await applyPatches(stock, [patch], 'b')
    expect(main.length).toBe(IMAGE.length)
    expect(main.slice(-16)).toEqual(IMAGE.slice(-16))
    expect(parseAis(main).sections).toEqual([{ addr: 0x1000, data: Uint8Array.of(1, 2, 0xaa, 0xbb, 5, 6) }, { addr: 0x2000, data: Uint8Array.of(1, 9, 8, 7) }])
    expect(preset).toEqual(Uint8Array.of(9, 0xee, 7, 6))
  })
  it('refuses a patch whose guard, build or room doesn’t fit', async () => {
    await expect(applyPatches(stock, [{ name: 'g', write: [{ model: 'b', addr: 0x1002, ...await guard(0, 0), data: '00' }] }], 'b')).rejects.toThrow(/not the expected ones/)
    await expect(applyPatches(stock, [{ name: 'n', write: [{ model: 'other', addr: 0x1002, ...await guard(3), data: '00' }] }], 'b')).rejects.toThrow(/nothing applied/)
    await expect(applyPatches(stock, [{ name: 'm', builds: ['other'] }], 'b')).rejects.toThrow(/only written for other/)
    await expect(applyPatches(stock, [{ name: 'o', section: [{ model: 'b', addr: 0x1004, data: '00' }] }], 'b')).rejects.toThrow(/overlaps/)
    await expect(applyPatches(stock, [{ name: 'big', section: [{ model: 'b', addr: 0x3000, data: '00'.repeat(64) }] }], 'b')).rejects.toThrow(/trailer/)
  })
  it('carries no Zoom bytes: every guard is a hash, and every release names patches it has', () => {
    expect(JSON.stringify(MIDISTOMP)).not.toMatch(/"expect"/)
    for (const write of MIDISTOMP.patches.flatMap(patch => patch.write ?? [])) expect(write.expect_sha256).toMatch(/^[0-9a-f]{64}$/)
    for (const name of Object.values(MIDISTOMP.releases).flat()) expect(MIDISTOMP.patches.map(patch => patch.name)).toContain(name)
  })

  // zoomms' own output for MIDISTOMP c8d3e1b (zoomms build-mac <app> --build-id ms70cdr-2.10 --patch …). Firmware never
  // enters CI, so this runs only with Zoom's stock updater at hand: ZOOM_MS70CDR_APP='…/ZOOM MS-70CDR v2.10 Updater.app'.
  const app = process.env.ZOOM_MS70CDR_APP
  it.runIf(app)('builds byte for byte what zoomms builds from the stock MS-70CDR 2.10 updater', async () => {
    const read = (name: string) => new Uint8Array(readFileSync(join(app!, 'Contents/Resources', name)))
    const own = { 'Main.bin': read('Main.bin'), 'Preset.bin': read('Preset.bin') }
    expect(MIDISTOMP.revision).toMatch(/^c8d3e1b/)
    const hello = await buildBase(own, ['hello'])
    expect(await sha256(hello.main)).toBe('c32899bf2fded359adee94d968caaf17031401c67e2bafc2752f1d62d51e71df')
    expect(hello.preset).toBeUndefined()
    const release = await buildBase(own, MIDISTOMP.releases['MIDISTOMP V1.2'])
    expect(await sha256(release.main)).toBe('37c51df2a91e06b647f377a5989d5eef2f21f90abc60792b218b45dfea0f743c')
    expect(await sha256(release.preset!)).toBe('ca52f406a7324822a4c9113fec7b6083ff8c8b3c8bb0c956ce39b6ee0055eee4')
    await expect(buildBase({ ...own, 'Main.bin': hello.main }, ['hello'])).rejects.toThrow(/unmodified copy/)
  })
})
