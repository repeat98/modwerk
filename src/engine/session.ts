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
import { DOWNLOADS_ENABLED, DSP_LOADER, FIRMWARE_VERSION, type BuildReport, type EngineRequest, type EngineResponse } from './protocol'
export function createEngineSession(reply: (response: EngineResponse, transfer?: Transferable[]) => void) {
  let base: DecodedFirmware | null = null, generation = 0
  return async (request: EngineRequest) => {
    try {
      if (request.type === 'clear') { ++generation; base = null; reply({ id: request.id, type: 'cleared' }); return }
      if (request.type === 'inspect') {
        const current = ++generation; base = null
        const inspection = await inspectBaseFirmware(request.buffer, request.name)
        const decoded = decodeFirmware(new Uint8Array(request.buffer))
        await recoverStockDsp(decoded.mainOs)
        if (current !== generation) throw new Error('The selected firmware changed. Verify it again.')
        base = decoded; reply({ id: request.id, type: 'inspection', inspection }); return
      }
      const usbError = usbAudioBuildError(request.usbAudio)
      if (usbError) throw new Error(usbError)
      const original = base, current = generation
      if (!original) throw new Error('Choose and verify your base firmware first.')
      const modules = resolveSelection(request.moduleIds)
      const unavailable = moduleAvailabilityError(request.moduleIds,request.betaAccess === true)
      if (unavailable) throw new Error(unavailable)
      if (!modules.length) throw new Error('Add at least one module before building custom firmware.')
      if (typeof request.keepStockFx2 !== 'boolean') throw new Error('Choose whether to keep the stock FX2 effects.')
      const claims = checkSelection(request.moduleIds, DSP_LOADER && request.keepStockFx2)
      if (!claims.checked || claims.issues.length) throw new Error(claims.issues.join(' ') || 'This module selection could not be validated.')
      reply({ id: request.id, type: 'progress', phase: 'composing' })
      let result
      try { result = await composeSelection(original.mainOs, request.moduleIds, request.keepStockFx2, request.usbAudio) }
      catch (error) {
        if (!isPlacementFailure(error)) throw error
        const conflict = await diagnosePlacement(request.moduleIds, error, ids => {
          const claims = checkSelection(ids, DSP_LOADER && request.keepStockFx2)
          if (!claims.checked || claims.issues.length) return Promise.reject(new Error('Selection declarations did not pass.'))
          // USB settings belong only to the USB Audio module; removing it must remove its settings too.
          return composeSelection(original.mainOs, ids, request.keepStockFx2, ids.includes('usb-audio-out-tracks-main-cue') ? request.usbAudio : undefined)
        }, () => current === generation)
        if (current !== generation) throw new Error('The selected firmware changed. Build again.', { cause: error })
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
