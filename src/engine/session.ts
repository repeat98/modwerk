import { inspectBaseFirmware } from './base'
import { decodeFirmware } from './elek'
import { recoverStockDsp } from './stock-dsp'
import { buildPublishedBase } from './elekloader/published-base'
// A file of its own, fetched when a base is built: the worker bundle inlines imports, and the package is 600 KB.
import currentPackage from './assets/octatrack-base.elemod?url'
import linkedPackage from './assets/linked-audio-0.7.11/octatrack-base.elemod?url'
import { USB_AUDIO_PACKAGED } from '../config/usb-audio'
import currentVariants from './assets/octatrack-base-variants.json?url'
import linkedVariants from './assets/linked-audio-0.7.11/octatrack-base-variants.json?url'
import currentFills from './assets/octatrack-base-fills.json'
import linkedFills from './assets/linked-audio-0.7.11/octatrack-base-fills.json'
// The step base (base-step.ts), fetched only by an update that needs it.
import stepPackage from './assets/octatrack-base-step.elemod?url'
import stepVariants from './assets/octatrack-base-step-variants.json?url'
import stepFills from './assets/octatrack-base-step-fills.json?url'
import type { EngineRequest, EngineResponse } from './protocol'
const basePackage = USB_AUDIO_PACKAGED ? currentPackage : linkedPackage
const baseVariants = USB_AUDIO_PACKAGED ? currentVariants : linkedVariants
const baseFills = USB_AUDIO_PACKAGED ? currentFills : linkedFills

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
        const urls = request.step === true ? { package: stepPackage, variants: stepVariants, fills: stepFills } : { package: basePackage, variants: baseVariants, fills: '' }
        const built = await buildPublishedBase(original, async (name, step) => {
          if (name === 'fills' && !step) return JSON.stringify(baseFills)
          const response = await fetch(urls[name])
          if (!response.ok) throw new Error((name === 'variants' ? 'The base layouts' : 'The base package') + ' did not load. Reload the page and try again.')
          return response.text()
        }, request.layout, request.step === true)
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
