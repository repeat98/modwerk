import { readFileSync } from 'node:fs'
import { describe, expect, it, onTestFinished, vi } from 'vitest'
import { decodeFirmware, encodeFirmware, type DecodedFirmware } from './elek'
import { createEngineSession } from './session'
import { composeSelection } from './compose-os'
import { FIRMWARE_VERSION, type EngineResponse } from './protocol'
import { isModulePaused } from '../catalog/availability'
import { buildBase } from './elekloader/octatrack-base'

// Exercise the real session/report/packaging boundary with synthetic bytes.
// Stock verification and the composer are covered by their separate tests and
// private native checks; no proprietary firmware enters this test or CI.
vi.mock('./base', () => ({ inspectBaseFirmware: vi.fn().mockResolvedValue({ version: '1.40C' }) }))
vi.mock('./stock-dsp', () => ({ recoverStockDsp: vi.fn().mockResolvedValue([]) }))
vi.mock('./elekloader/octatrack-base', () => ({ buildBase: vi.fn(async () => ({ bin: Uint8Array.of(1, 2, 3), sha256: 'b', base: 'c'.repeat(64) })) }))
vi.mock('./compose-os', () => ({ composeSelection: vi.fn(async (original: Uint8Array) => ({
  bytes: original.slice(), chooser: { fx1: [], fx2: [], hidden: [] },
  runtime: { bytes: 0, reservedBytes: 0 },
})) }))

const synthetic = (): DecodedFirmware => ({
  header: new TextEncoder().encode('ELEK0001     0.00A'),
  mainOs: new TextEncoder().encode('Synthetic local session payload. Synthetic local session payload.'),
  tail: new Uint8Array([0, 0, 91]), seed: 0x2f1349d2,
})

describe('Octatrack firmware boot name', () => {
  it('plays the docking startup for every member unless the configuration chooses the classic one', async () => {
    const firmware = synthetic(), replies: EngineResponse[] = []
    const handle = createEngineSession(response => { replies.push(response) })
    await handle({ id: 1, type: 'inspect', name: 'synthetic.bin', buffer: new Uint8Array(encodeFirmware(firmware, firmware.mainOs, 'STOCK')).buffer })
    const requests = [{ betaAccess: false }, { betaAccess: true }, { betaAccess: false, startup: 'classic' as const }, { betaAccess: false, startup: 'docking' as const }]
    for (const [index, request] of requests.entries()) {
      await handle({ id: index + 2, type: 'validate', moduleIds: ['repitch'], keepStockFx2: false, ...request })
      const reply = replies.at(-1)
      expect(reply?.type).toBe('validated')
      if (reply?.type !== 'validated') throw new Error(JSON.stringify(reply))
      const docking = request.startup !== 'classic'
      expect(reply.report.startupAnimation).toBe(docking ? 'docking' : 'classic')
      expect(reply.report.startupFallback).toBeUndefined()
      expect(vi.mocked(composeSelection).mock.calls.at(-1)?.[4]).toBe(docking)
    }
  })
  it('keeps the classic startup for a selection the docking startup cannot compose', async () => {
    const firmware = synthetic(), replies: EngineResponse[] = []
    const handle = createEngineSession(response => { replies.push(response) })
    await handle({ id: 1, type: 'inspect', name: 'synthetic.bin', buffer: new Uint8Array(encodeFirmware(firmware, firmware.mainOs, 'STOCK')).buffer })
    const compose = vi.mocked(composeSelection)
    compose.mockRejectedValueOnce(new Error('Beta startup stock guard mismatch: ROM cave'))
    const before = compose.mock.calls.length
    await handle({ id: 2, type: 'build', moduleIds: ['repitch'], keepStockFx2: false })
    const built = replies.at(-1)
    if (built?.type !== 'built') throw new Error(JSON.stringify(built))
    expect(compose.mock.calls.slice(before).map(call => call[4])).toEqual([true, false])
    expect(built.report).toMatchObject({ startupAnimation: 'classic', startupFallback: true })
    // A member who chose the classic startup gets its own error, without a docking attempt.
    compose.mockRejectedValueOnce(new Error('Classic composition failed.'))
    const classic = compose.mock.calls.length
    await handle({ id: 3, type: 'validate', moduleIds: ['repitch'], keepStockFx2: false, startup: 'classic' })
    expect(replies.at(-1)).toMatchObject({ type: 'error' })
    expect(compose.mock.calls.slice(classic).map(call => call[4])).toEqual([false])
  })
  it('tries the classic startup before the compact FX2 menu, and reports that menu', async () => {
    const firmware = synthetic(), replies: EngineResponse[] = []
    const handle = createEngineSession(response => { replies.push(response) })
    await handle({ id: 1, type: 'inspect', name: 'synthetic.bin', buffer: new Uint8Array(encodeFirmware(firmware, firmware.mainOs, 'STOCK')).buffer })
    const compose = vi.mocked(composeSelection), before = compose.mock.calls.length
    compose.mockRejectedValueOnce(new Error('PERSONALIZE setters does not fit in the available menu and patch space (68 bytes needed, 60 bytes available)'))
    compose.mockImplementationOnce(async (original: Uint8Array) => ({ bytes: original.slice(), chooser: { fx1: [], fx2: [], hidden: [] }, runtime: { bytes: 0, reservedBytes: 0 }, compactFx2: true } as unknown as Awaited<ReturnType<typeof composeSelection>>))
    await handle({ id: 2, type: 'validate', moduleIds: ['repitch'], keepStockFx2: false })
    expect(compose.mock.calls.slice(before).map(call => [call[4], call[5]])).toEqual([[true, false], [false, true]])
    expect(replies.at(-1)).toMatchObject({ type: 'validated', report: { startupAnimation: 'classic', startupFallback: true, compactFx2: true } })
  })
  it('uses only the panel boot font letter range', () => {
    expect(FIRMWARE_VERSION).toMatch(/^[A-Z0-9. ]{1,10}$/)
  })
  it.each([['repitch'], ['midi-scenes'], ['usb-audio-out-tracks-main-cue', 'quantizer']].filter(ids => !ids.some(isModulePaused)))(
    'uses ELEKLOADER in validation, the build report and all ten update-header bytes for %j', async (...moduleIds) => {
      const original = synthetic(), input = encodeFirmware(original, original.mainOs, 'STOCK')
      const before = input.slice(), replies: EngineResponse[] = []
      const handle = createEngineSession(response => { replies.push(response) })
      await handle({ id: 1, type: 'inspect', name: 'synthetic.bin', buffer: new Uint8Array(input).buffer })
      expect(replies.at(-1)?.type).toBe('inspection')
      for (const keepStockFx2 of [false, true]) {
        await handle({ id: 2, type: 'validate', moduleIds, keepStockFx2 })
        const validated = replies.at(-1)
        expect(validated?.type).toBe('validated')
        if (validated?.type !== 'validated') throw new Error(JSON.stringify(validated))
        expect(validated.report.version).toBe('ELEKLOADER')
        await handle({ id: 3, type: 'build', moduleIds, keepStockFx2 })
        const built = replies.at(-1)
        expect(built?.type).toBe('built')
        if (built?.type !== 'built') throw new Error(JSON.stringify(built))
        expect(FIRMWARE_VERSION).toBe('ELEKLOADER')
        expect(built.report.version).toBe('ELEKLOADER')
        expect(built.report.moduleIds).toEqual(moduleIds)
        if (moduleIds.includes('midi-scenes')) expect(built.report.moduleVersions['midi-scenes']).toBe('0.2.5-experimental')
        const decoded = decodeFirmware(new Uint8Array(built.buffer))
        expect(new TextDecoder().decode(decoded.header.subarray(8))).toBe('ELEKLOADER')
        expect(decoded.header.subarray(0, 8)).toEqual(original.header.subarray(0, 8))
        expect(decoded.mainOs).toEqual(original.mainOs)
        expect(decoded.tail).toEqual(original.tail)
        expect(decoded.seed).toBe(original.seed)
      }
      expect(input).toEqual(before)
    },
  )
})

describe('placement diagnosis', () => {
  it('stops trying removals for a selection once a newer one arrives', async () => {
    // Recorded with stock FX2 off, as is each selection one module smaller, so the diagnosis composes candidates.
    const crowded = ['miniverb', 'tapeecho', 'euclid', 'repitch', 'tapehead', 'analog-bassdrum', 'previewvol', 'sidechain-compressor', 'playmodes', 'mute-modes', 'recorder-loop-fix']
    const compose = vi.mocked(composeSelection), original = compose.getMockImplementation()!
    let attempts = 0, reached = () => {}
    const second = new Promise<void>(resolve => { reached = resolve })
    compose.mockImplementation(async (bytes, ids, ...rest) => {
      if (ids.length === 1) return original(bytes, ids, ...rest)
      if (++attempts === 2) reached()
      await new Promise(resolve => setTimeout(resolve, 1))
      throw new Error('Demo overruns the region')
    })
    try {
      const firmware = synthetic(), replies: EngineResponse[] = []
      const handle = createEngineSession(response => { replies.push(response) })
      await handle({ id: 1, type: 'inspect', name: 'synthetic.bin', buffer: new Uint8Array(encodeFirmware(firmware, firmware.mainOs, 'STOCK')).buffer })
      const stale = handle({ id: 2, type: 'validate', moduleIds: crowded, keepStockFx2: false })
      await second
      await handle({ id: 3, type: 'validate', moduleIds: ['repitch'], keepStockFx2: false })
      await stale
      // The full diagnosis would compose the selection and 66 candidates; the newer request stopped it after a few.
      expect(attempts).toBeLessThan(6)
      const last = (id: number) => replies.filter(reply => reply.id === id).at(-1)
      expect(last(2)).toMatchObject({ type: 'error', message: expect.stringContaining('newer selection') })
      expect(last(3)?.type).toBe('validated')
    } finally { compose.mockImplementation(original) }
  })
})

describe('the Modwerk base', () => {
  it('asks for the OS file first, then builds from the verified file with the committed package', async () => {
    const text = readFileSync(new URL('./assets/octatrack-base.elemod', import.meta.url), 'utf8')
    const fetched = vi.fn(async (url: string) => (url.endsWith('octatrack-base.elemod') ? new Response(text) : new Response(null, { status: 404 })))
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
    const [stock, fetchedText, fills] = vi.mocked(buildBase).mock.calls[0]
    expect(stock).toEqual(input)
    expect(fetchedText).toBe(text)
    expect(fetched).toHaveBeenCalledOnce()
    expect(fills.length).toBeGreaterThan(0)
  })
})
