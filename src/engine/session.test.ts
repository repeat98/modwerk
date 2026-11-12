import { readFileSync } from 'node:fs'
import { describe, expect, it, onTestFinished, vi } from 'vitest'
import { encodeFirmware, type DecodedFirmware } from './elek'
import { createEngineSession } from './session'
import type { EngineResponse } from './protocol'
import { buildBase } from './elekloader/octatrack-base'
import { DEFAULT_LAYOUT, variantPackage, type BaseVariants } from './elekloader/base-variants'

// Exercise the real session boundary with synthetic bytes; no proprietary firmware enters this test or CI.
vi.mock('./base', () => ({ inspectBaseFirmware: vi.fn().mockResolvedValue({ version: '1.40C' }) }))
vi.mock('./stock-dsp', () => ({ recoverStockDsp: vi.fn().mockResolvedValue([]) }))
vi.mock('./elekloader/octatrack-base', () => ({ buildBase: vi.fn(async () => ({ bin: Uint8Array.of(1, 2, 3), sha256: 'b', base: 'c'.repeat(64) })) }))
const synthetic = (): DecodedFirmware => ({
  header: new TextEncoder().encode('ELEK0001     0.00A'),
  mainOs: new TextEncoder().encode('Synthetic local session payload. Synthetic local session payload.'),
  tail: new Uint8Array([0, 0, 91]), seed: 0x2f1349d2,
})

describe('the Modwerk base', () => {
  it('asks for the OS file first, then builds from the verified file: USB Audio off unless a layout is asked for', async () => {
    const text = readFileSync(new URL('./assets/octatrack-base.elemod', import.meta.url), 'utf8')
    const layouts = readFileSync(new URL('./assets/octatrack-base-variants.json', import.meta.url), 'utf8')
    const fetched = vi.fn(async (url: string) => (url.endsWith('octatrack-base.elemod') ? new Response(text)
      : url.includes('octatrack-base-variants') ? new Response(layouts) : new Response(null, { status: 404 })))
    vi.stubGlobal('fetch', fetched)
    onTestFinished(() => { vi.unstubAllGlobals() })
    const replies: EngineResponse[] = [], handle = createEngineSession(response => { replies.push(response) })
    await handle({ id: 1, type: 'base' })
    expect(replies.at(-1)).toMatchObject({ type: 'error', message: expect.stringContaining('OS 1.40C file first') })
    const firmware = synthetic(), input = new Uint8Array(encodeFirmware(firmware, firmware.mainOs, 'STOCK'))
    await handle({ id: 2, type: 'inspect', name: 'synthetic.bin', buffer: input.slice().buffer })
    await handle({ id: 3, type: 'base' })
    const reply = replies.at(-1) as Extract<EngineResponse, { type: 'base' }>
    expect(reply).toMatchObject({ type: 'base', sha256: 'b', base: 'c'.repeat(64) })
    expect([...new Uint8Array(reply.buffer)]).toEqual([1, 2, 3])
    // No layout: the owner's default for members, USB MIDI alone (11 November 2026), patched from the committed package.
    const off = variantPackage(text, JSON.parse(layouts) as BaseVariants, 'off')!
    const [stock, fetchedText, fills] = vi.mocked(buildBase).mock.calls[0]
    expect(stock).toEqual(input)
    expect(fetchedText).toBe(off.text)
    expect(fills).toEqual(off.fills)
    expect(fetched).toHaveBeenCalledTimes(2)
    // The committed package's own layout, asked for by a module set, is that package as it is.
    await handle({ id: 4, type: 'base', layout: DEFAULT_LAYOUT })
    const [, ownText, ownFills] = vi.mocked(buildBase).mock.calls[1]
    expect(ownText).toBe(text)
    expect(ownFills.length).toBeGreaterThan(0)
    expect(fetched).toHaveBeenCalledTimes(3)
  })
})
