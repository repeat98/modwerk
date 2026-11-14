import { inspectBaseFirmware } from './base'
import { decodeFirmware } from './elek'
import { recoverStockDsp } from './stock-dsp'
import { buildBase, type BaseFill } from './elekloader/octatrack-base'
// A file of its own, fetched when a base is built: the worker bundle inlines imports, and the package is 600 KB.
import basePackage from './assets/octatrack-base.elemod?url'
import baseVariants from './assets/octatrack-base-variants.json?url'
import { DEFAULT_LAYOUT, MEMBER_LAYOUT, variantPackage, type BaseVariants } from './elekloader/base-variants'
import baseFills from './assets/octatrack-base-fills.json'
import type { EngineRequest, EngineResponse } from './protocol'
export function createEngineSession(reply: (response: EngineResponse, transfer?: Transferable[]) => void) {
  let stock: Uint8Array | null = null, generation = 0
  return async (request: EngineRequest) => {
    try {
      if (request.type === 'clear') { ++generation; stock = null; reply({ id: request.id, type: 'cleared' }); return }
      if (request.type === 'inspect') {
        const current = ++generation; stock = null
        const inspection = await inspectBaseFirmware(request.buffer, request.name)
        const decoded = decodeFirmware(new Uint8Array(request.buffer))
        await recoverStockDsp(decoded.mainOs)
        if (current !== generation) throw new Error('The selected firmware changed. Verify it again.')
        stock = new Uint8Array(request.buffer); reply({ id: request.id, type: 'inspection', inspection }); return
      }
      if (request.type === 'base') {
        const original = stock, current = generation
        if (!original) throw new Error('Choose and verify your OS 1.40C file first.')
        const response = await fetch(basePackage)
        if (!response.ok) throw new Error('The base package did not load. Reload the page and try again.')
        // Another USB Audio layout is the default package with its reviewed patch (base-variants.ts). Without a layout
        // from a module set, a member gets MEMBER_LAYOUT: USB MIDI alone.
        let text = await response.text(), fills = baseFills as BaseFill[]
        const layout = request.layout ?? MEMBER_LAYOUT
        if (layout !== DEFAULT_LAYOUT) {
          const layouts = await fetch(baseVariants)
          if (!layouts.ok) throw new Error('The base layouts did not load. Reload the page and try again.')
          const variant = variantPackage(text, await layouts.json() as BaseVariants, layout)
          if (variant) ({ text, fills } = variant)
        }
        const built = await buildBase(original, text, fills)
        if (current !== generation) throw new Error('The selected firmware changed. Build again.')
        const buffer = built.bin.slice().buffer
        reply({ id: request.id, type: 'base', buffer, sha256: built.sha256, base: built.base }, [buffer]); return
      }
      throw new Error('This page no longer builds card firmware. Modules go onto the Octatrack through the Modwerk base.')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'The firmware could not be prepared.'
      reply({ id: request.id, type: 'error', message })
    }
  }
}
