import { usbAudioBuildError } from '../config/usb-audio'
import { compiledModuleSource } from './module-build.ts'
import { inspectBaseFirmware } from './base'
import { decodeFirmware, encodeFirmware, type DecodedFirmware } from './elek'
import { recoverStockDsp } from './stock-dsp'
import { composeSelection } from './compose-os'
import chooserMetadata from './assets/chooser-metadata.json'
import { explainBuildFailure } from './build-errors'
import { diagnosePlacement, isPlacementFailure } from './placement-conflicts'
import { checkSelection } from '../catalog/compatibility'
import { moduleAvailabilityError } from '../catalog/availability'
import { CATALOG_SOURCE, resolveSelection } from '../catalog/modules'
import { buildBase, type BaseFill } from './elekloader/octatrack-base'
// A file of its own, fetched when a base is built: the worker bundle inlines imports, and the package is 600 KB.
import basePackage from './assets/octatrack-base.elemod?url'
import baseVariants from './assets/octatrack-base-variants.json?url'
import { variantPackage, type BaseVariants } from './elekloader/base-variants'
import baseFills from './assets/octatrack-base-fills.json'
import { DOWNLOADS_ENABLED, DSP_LOADER, FIRMWARE_VERSION, type BuildReport, type EngineRequest, type EngineResponse, type StartupAnimation } from './protocol'
export function createEngineSession(reply: (response: EngineResponse, transfer?: Transferable[]) => void) {
  // `newest` is the latest validate or build: the worker runs requests concurrently, and the page ignores older answers.
  let base: DecodedFirmware | null = null, stock: Uint8Array | null = null, generation = 0, newest = 0
  return async (request: EngineRequest) => {
    try {
      if (request.type === 'clear') { ++generation; base = null; stock = null; reply({ id: request.id, type: 'cleared' }); return }
      if (request.type === 'inspect') {
        const current = ++generation; base = null; stock = null
        const inspection = await inspectBaseFirmware(request.buffer, request.name)
        const decoded = decodeFirmware(new Uint8Array(request.buffer))
        await recoverStockDsp(decoded.mainOs)
        if (current !== generation) throw new Error('The selected firmware changed. Verify it again.')
        base = decoded; stock = new Uint8Array(request.buffer); reply({ id: request.id, type: 'inspection', inspection }); return
      }
      if (request.type === 'base') {
        const original = stock, current = generation
        if (!original) throw new Error('Choose and verify your OS 1.40C file first.')
        const response = await fetch(basePackage)
        if (!response.ok) throw new Error('The base package did not load. Reload the page and try again.')
        // Another USB Audio layout is the default package with its reviewed patch (base-variants.ts).
        let text = await response.text(), fills = baseFills as BaseFill[]
        if (request.layout) {
          const layouts = await fetch(baseVariants)
          if (!layouts.ok) throw new Error('The base layouts did not load. Reload the page and try again.')
          const variant = variantPackage(text, await layouts.json() as BaseVariants, request.layout)
          if (variant) ({ text, fills } = variant)
        }
        const built = await buildBase(original, text, fills)
        if (current !== generation) throw new Error('The selected firmware changed. Build again.')
        const buffer = built.bin.slice().buffer
        reply({ id: request.id, type: 'base', buffer, sha256: built.sha256, base: built.base }, [buffer]); return
      }
      const usbError = usbAudioBuildError(request.usbAudio)
      if (usbError) throw new Error(usbError)
      const original = base, current = generation
      newest = request.id
      if (!original) throw new Error('Choose and verify your base firmware first.')
      const modules = resolveSelection(request.moduleIds)
      const unavailable = moduleAvailabilityError(request.moduleIds,request.betaAccess === true)
      if (unavailable) throw new Error(unavailable)
      if (!modules.length) throw new Error('Add at least one module before building custom firmware.')
      if (typeof request.keepStockFx2 !== 'boolean') throw new Error('Choose whether to keep the stock FX2 effects.')
      const claims = checkSelection(request.moduleIds, DSP_LOADER && request.keepStockFx2)
      if (!claims.checked || claims.issues.length) throw new Error(claims.issues.join(' ') || 'This module selection could not be validated.')
      reply({ id: request.id, type: 'progress', phase: 'composing' })
      // Every build plays the docking startup unless the member chose the classic one. Docking adds two guarded hooks,
      // an 80-byte gate and its runtime; a selection that composes only without them keeps the classic startup, so
      // nothing that builds with the classic startup is refused for the docking one.
      const compose = (ids: readonly string[], usbAudio: typeof request.usbAudio, docking: boolean) => composeSelection(original.mainOs, ids, request.keepStockFx2, usbAudio, docking)
      let result, startupAnimation: StartupAnimation = request.startup === 'classic' ? 'classic' : 'docking', startupFallback = false
      try {
        try { result = await compose(request.moduleIds, request.usbAudio, startupAnimation === 'docking') }
        catch (error) {
          if (startupAnimation === 'classic') throw error
          result = await compose(request.moduleIds, request.usbAudio, false)
          startupAnimation = 'classic'; startupFallback = true
        }
      }
      catch (error) {
        if (!isPlacementFailure(error)) throw error
        const conflict = await diagnosePlacement(request.moduleIds, error, ids => {
          const claims = checkSelection(ids, DSP_LOADER && request.keepStockFx2)
          if (!claims.checked || claims.issues.length) return Promise.reject(new Error('Selection declarations did not pass.'))
          // USB settings belong only to the USB Audio module; removing it must remove its settings too.
          return compose(ids, ids.includes('usb-audio-out-tracks-main-cue') ? request.usbAudio : undefined, false)
        }, () => current === generation && newest === request.id)
        if (current !== generation) throw new Error('The selected firmware changed. Build again.', { cause: error })
        // A newer selection replaced this one; its partial diagnosis would mislead and nobody waits for it.
        if (newest !== request.id) throw new Error('A newer selection replaced this check.', { cause: error })
        reply({ id: request.id, type: 'error', message: conflict.description, conflict }); return
      }
      if (current !== generation) throw new Error('The selected firmware changed. Build again.')
      const source = compiledModuleSource()
      const report: BuildReport = {
        version: FIRMWARE_VERSION, revision: CATALOG_SOURCE.revision, sourceCommit: source.sourceCommit, sourceTreeSha256: source.sourceTreeSha256,
        moduleIds: modules.map(module => module.id), moduleVersions: Object.fromEntries(modules.map(module=>[module.id,module.version])), keepStockFx2: request.keepStockFx2,
        osBytes: result.bytes.length, runtimeBytes: result.runtime.bytes, reservedBytes: result.runtime.reservedBytes,
        fx1Rows: result.chooser.fx1.length, fx2Rows: result.chooser.fx2.length,
        omittedStockFx2: chooserMetadata.stockFx2.filter(key => !result.chooser.fx2.includes(key)),
        startupAnimation, ...(startupFallback ? { startupFallback: true } : {}),
      }
      if (request.type === 'validate') { reply({ id: request.id, type: 'validated', report }); return }
      if (!DOWNLOADS_ENABLED) throw new Error('Firmware downloads are paused while the built-in logger completes verification.')
      reply({ id: request.id, type: 'progress', phase: 'packing' })
      const update = encodeFirmware(original, result.bytes, report.version)
      reply({ id: request.id, type: 'progress', phase: 'verifying' })
      const digest = await crypto.subtle.digest('SHA-256', new Uint8Array(update).buffer)
      if (current !== generation) throw new Error('The selected firmware changed. Build again.')
      const sha256 = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')
      const buffer = new Uint8Array(update).buffer
      reply({ id: request.id, type: 'built', report, buffer, sha256 }, [buffer])
    } catch (error) {
      const detail=error instanceof Error?error.message:'The firmware could not be prepared.'
      const message=explainBuildFailure(error instanceof Error ? error : detail,DSP_LOADER && 'keepStockFx2' in request && request.keepStockFx2)
      reply({ id: request.id, type: 'error', message })
    }
  }
}
