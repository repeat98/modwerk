import { describe, expect, it, vi } from 'vitest'
import { encodeFirmware, type DecodedFirmware } from './elek'
import { createEngineSession } from './session'
import { composeSelection } from './compose-os'
import type { EngineResponse } from './protocol'

// The session's card refusal for a module only the Modwerk base can load, with Repitch standing in for a published
// package that requires a base DSP feature. Synthetic bytes and a mocked composer, as in session.test.ts.
vi.mock('./base', () => ({ inspectBaseFirmware: vi.fn().mockResolvedValue({ version: '1.40C' }) }))
vi.mock('./stock-dsp', () => ({ recoverStockDsp: vi.fn().mockResolvedValue([]) }))
vi.mock('./compose-os', () => ({ composeSelection: vi.fn(async (original: Uint8Array) => ({
  bytes: original.slice(), chooser: { fx1: [], fx2: [], hidden: [] }, runtime: { bytes: 0, reservedBytes: 0 },
})) }))
vi.mock('../catalog/usb-only', async importOriginal => {
  const real = await importOriginal<typeof import('../catalog/usb-only')>()
  const published = { packages: [{ id: 'repitch', requires: 8 }, { id: 'everb', usbOnly: true }] }
  return { ...real, cardBuildError: (ids: readonly string[], usb?: boolean) => real.cardBuildError(ids, usb, published) }
})

const synthetic = (): DecodedFirmware => ({
  header: new TextEncoder().encode('ELEK0001     0.00A'),
  mainOs: new TextEncoder().encode('Synthetic local session payload. Synthetic local session payload.'),
  tail: new Uint8Array([0, 0, 91]), seed: 0x2f1349d2,
})

describe('card firmware and modules that need the Modwerk base', () => {
  it.each([['repitch', 'Repitch'], ['everb', 'E-Verb']])('refuses %s before composing, for the page and local downloads alike', async (moduleId, name) => {
    const firmware = synthetic(), replies: EngineResponse[] = []
    const handle = createEngineSession(response => { if (response.type !== 'progress') replies.push(response) })
    await handle({ id: 1, type: 'inspect', name: 'synthetic.bin', buffer: new Uint8Array(encodeFirmware(firmware, firmware.mainOs, 'STOCK')).buffer })
    const compose = vi.mocked(composeSelection), before = compose.mock.calls.length
    for (const [id, type] of [[2, 'validate'], [3, 'build']] as const) {
      await handle({ id, type, moduleIds: ['tapehead', moduleId], keepStockFx2: false })
      expect(replies.at(-1)).toMatchObject({ type: 'error', message: expect.stringContaining(name + ' needs the Modwerk base, so card firmware cannot include it.') })
    }
    expect(compose.mock.calls.length).toBe(before)
    await handle({ id: 4, type: 'validate', moduleIds: ['tapehead'], keepStockFx2: false })
    expect(replies.at(-1)?.type).toBe('validated')
  })
})
