import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { fakeZoomPedal } from '../../dev/zoom-pedal-fake'
import { buildBase, sha256 } from './zoom-base'
import { ZoomLink } from './zoom-link'
import { flashSteps } from './zoom-protocol'

const os = () => Uint8Array.from({ length: 0xb0000 }, (_, i) => (i * 31 + (i >> 11)) & 0xff)
const n = (d: number[]) => d.reduce((v, b, i) => v + b * 128 ** i, 0)
const connect = async (fake: ReturnType<typeof fakeZoomPedal>) => { const link = new ZoomLink(() => Promise.resolve(fake.access), 200); await link.connect(); return link }

describe('the MS-70CDR flash', () => {
  it('erases the trailer first, writes only the OS and the boot logo block, and never the bootloader or the effects', () => {
    const steps = flashSteps(os(), new Uint8Array(0x3000))
    expect(steps.map(s => s[0])).toEqual([0x01, 0x0a, 0x0a, ...Array(6).fill(0x02), 0x0a, ...Array(352).fill(0x02), 0x04])
    expect(n(steps[1].slice(1, 6))).toBe(0x0ef000)
    for (const step of steps.filter(s => s[0] === 0x0a || s[0] === 0x02)) {
      const at = n(step.slice(1, 6)), end = at + (step[0] === 0x0a ? n(step.slice(6, 11)) : n(step.slice(6, 8)))
      expect(at >= 0x040000 && end <= 0x0f0000 || at >= 0x3fd000 && end <= 0x400000).toBe(true)
    }
    expect(flashSteps(os()).length).toBe(356)
    expect(() => flashSteps(os().subarray(1))).toThrow(/720896 bytes/)
    expect(() => flashSteps(os(), new Uint8Array(10))).toThrow(/12288 bytes/)
  })

  it('flashes a pedal in update mode, sending a block again when its checksum fails', async () => {
    const fake = fakeZoomPedal({ firmware: '1.10', badCrcAt: 7 }), link = await connect(fake), main = os(), preset = Uint8Array.from({ length: 0x3000 }, (_, i) => i & 0x7f)
    fake.flash.fill(0)   // whatever was there: only an erase makes room
    await link.flashBase(main, preset)
    expect(fake.flash.subarray(0x040000, 0x0f0000)).toEqual(main)
    expect(fake.flash.subarray(0x3fd000, 0x400000)).toEqual(preset)
    expect(fake.flash.subarray(0, 0x040000).every(b => b === 0)).toBe(true)
    expect(fake.flash.subarray(0x0f0000, 0x3fd000).every(b => b === 0)).toBe(true)
    expect(fake.sent.filter(m => m[4] === 0x02).length).toBe(6 + 352 + 1)
    expect(link.getState().status).toBe('ready')
  })

  it('refuses a pedal that is not in update mode, and stops when the bootloader stops answering', async () => {
    const running = fakeZoomPedal(), link = await connect(running)
    await expect(link.flashBase(os())).rejects.toThrow(/update mode first/)
    expect(running.sent.some(m => m[1] === 0x52)).toBe(false)   // only the identity request and MIDISTOMP's hello
    const stuck = fakeZoomPedal({ firmware: '1.10', slow: { cmd: 0x02, nth: 5, ms: null } })
    await expect((await connect(stuck)).flashBase(os())).rejects.toThrow(/step 8 of 356 \(no answer\).*bootloader is untouched/)
  })

  // On a computer with Zoom's stock MS-70CDR 2.10 Mac updater: the browser's `hello` flash sends exactly the 357
  // messages recorded (MIDI Monitor, 9 November 2026) from zoomms' hello updater flashing the owner's MS-70CDR.
  // The recording holds Zoom's OS, so only its hash is here. Firmware never enters CI.
  const app = process.env.ZOOM_MS70CDR_APP
  it.skipIf(!app)('sends the recorded hello flash byte for byte', async () => {
    const own = (name: string) => new Uint8Array(readFileSync(join(app!, 'Contents/Resources', name)))
    const hello = await buildBase({ 'Main.bin': own('Main.bin'), 'Preset.bin': own('Preset.bin') }, ['hello'])
    const fake = fakeZoomPedal({ firmware: '1.10' }), link = await connect(fake)
    await link.flashBase(hello.main, hello.preset)
    expect(fake.sent.length).toBe(357)
    expect(await sha256(Uint8Array.from(fake.sent.flat()))).toBe('1a090fcf151c184c2427cf8f31ccd757efcdb28ef225344b86d22a19a5e3b810')
  })
})
