import { inspectBaseFirmware } from './base'
import { decodeFirmware } from './elek'
import { recoverStockDsp } from './stock-dsp'
import { buildBase, type BaseFill } from './elekloader/octatrack-base'
// A file of its own, fetched when a base is built: the worker bundle inlines imports, and the package is 600 KB.
import basePackage from './assets/octatrack-base.elemod?url'
import baseVariants from './assets/octatrack-base-variants.json?url'
import { DEFAULT_LAYOUT, MEMBER_LAYOUT, variantPackage, type BaseVariants } from './elekloader/base-variants'
import baseFills from './assets/octatrack-base-fills.json'
// The step base (base-step.ts), fetched only by an update that needs it.
import stepPackage from './assets/octatrack-base-step.elemod?url'
import stepVariants from './assets/octatrack-base-step-variants.json?url'
import stepFills from './assets/octatrack-base-step-fills.json?url'
import { STEP_ASSETS, STEP_DEFAULT_LAYOUT, STEP_IDENTITIES } from './elekloader/base-step'
import { sha } from '../../vendor/elekloader/kit/src/bytes.ts'
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
        // Another USB Audio layout is the default package with its reviewed patch (base-variants.ts). Without a layout
        // from a module set, a member gets MEMBER_LAYOUT: USB MIDI alone. The step base is built the same way from
        // its own three assets, each checked against its pin.
        const step = request.step === true, layout = request.layout ?? MEMBER_LAYOUT
        const asset = async (url: string, pin: string | undefined, what: string) => {
          const response = await fetch(url)
          if (!response.ok) throw new Error(what + ' did not load. Reload the page and try again.')
          const text = await response.text()
          if (pin !== undefined && sha(new TextEncoder().encode(text)) !== pin) throw new Error(what + ' is damaged. Reload the page and try again.')
          return text
        }
        let text = await asset(step ? stepPackage : basePackage, step ? STEP_ASSETS.package : undefined, 'The base package')
        let fills = step ? JSON.parse(await asset(stepFills, STEP_ASSETS.fills, 'The base package')) as BaseFill[] : baseFills as BaseFill[]
        if (layout !== (step ? STEP_DEFAULT_LAYOUT : DEFAULT_LAYOUT)) {
          const layouts = JSON.parse(await asset(step ? stepVariants : baseVariants, step ? STEP_ASSETS.variants : undefined, 'The base layouts')) as BaseVariants
          const variant = step ? variantPackage(text, layouts, layout, { defaultLayout: STEP_DEFAULT_LAYOUT, identity: item => STEP_IDENTITIES[item] }) : variantPackage(text, layouts, layout)
          if (variant) ({ text, fills } = variant)
        }
        const built = await buildBase(original, text, fills)
        if (current !== generation) throw new Error('The selected firmware changed. Build again.')
        if (step && built.base !== STEP_IDENTITIES[layout]) throw new Error('The step base did not build as published. Reload the page and try again.')
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
