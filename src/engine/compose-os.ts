import { createStartupAnimationWrites } from './startup-animation.ts'
import { verifyNativeContracts } from './native-contracts.ts'
import { composeLoggedMidiScenes } from './midi-scenes-logged.ts'
import { installCoreLogger, LOGGER_RETAINED_BYTES } from './core-logger.ts'
import { compiledModuleSource } from './module-build.ts'
import { moduleBuildError } from '../catalog/build-support.ts'
// Complete local OS composition. Packaging / the download flow are enabled
// separately only after full native output and rejection verification.
import { composeChoosers, defaultChoosers, type ChooserProfile } from './choosers.ts'
import { isMenuSpaceFailure } from './build-errors.ts'
import { recoverStockDsp } from './stock-dsp.ts'
import { composeDynamicDsp } from './resident-dsp.ts'
import { composeStaticOs } from './static-compose.ts'
import { createColdFireRuntime } from './coldfire-runtime.ts'
import { createRuntimeBootstrap, BOOTSTRAP_ADDRESS } from './bootstrap.ts'
import { createPlatformOsWrites } from './platform-writes.ts'
import { applyGuardedOsWrites, OS_LOAD_ADDRESS } from './os-patches.ts'
import { DSP_LOADER } from './protocol.ts'
import { usbAudioBuildError, type UsbAudioConfiguration } from '../config/usb-audio.ts'
export async function composeOs(original: Uint8Array, ids: readonly string[], profile?: ChooserProfile, { loader = DSP_LOADER, usbAudio }: { loader?: boolean; usbAudio?: UsbAudioConfiguration } = {}) {
  const usbError = usbAudioBuildError(usbAudio)
  if (usbError) throw new Error(usbError)
  await verifyNativeContracts(original, ids)
  const pending = moduleBuildError(ids)
  if (pending) throw new Error(pending)
  compiledModuleSource()
  if (ids.includes('midi-scenes')) {
    if (ids.length !== 1) throw new Error('MIDI Scenes supports standalone firmware only. Remove the other modules.')
    return composeLoggedMidiScenes(original)
  }
  if (!loader) return composeStaticOs(original, ids, profile, usbAudio)
  if (ids.some(id => ['analog-bassdrum','midi-scenes','usb-audio-out-tracks-main-cue','quantizer','synth','playmodes','mute-modes','recorder-loop-fix','poly8','output-matrix'].includes(id))) throw new Error('These modules require the verified loader-free engine.')
  const menus = await composeChoosers(original, ids, profile), cores = await recoverStockDsp(original)
  const dsp = await composeDynamicDsp(cores, ids), runtime = await createColdFireRuntime(cores, ids)
  const logging = await installCoreLogger(runtime, original, ids, menus.chooser)
  const bootstrap = await createRuntimeBootstrap(runtime.bytes, runtime.reserveBytes - LOGGER_RETAINED_BYTES, undefined, runtime)
  if (OS_LOAD_ADDRESS + original.length !== BOOTSTRAP_ADDRESS) throw new Error('The runtime loader does not follow the original OS extent.')
  const patched = await applyGuardedOsWrites(original, [...menus.writes, ...dsp.writes, ...createPlatformOsWrites(runtime, ids, {reserveBytes:runtime.reserveBytes}), ...logging.writes, ...createStartupAnimationWrites()])
  await verifyNativeContracts(patched, ids)
  const bytes = new Uint8Array(patched.length + bootstrap.append.length); bytes.set(patched); bytes.set(bootstrap.append, patched.length)
  return { bytes, chooser: menus.chooser, dsp: dsp.layouts, runtime: { reservedBytes: runtime.reserveBytes, bytes: runtime.bytes.length, stage: bootstrap.layout.stage, stageEnd: bootstrap.layout.stageEnd }, caveCursor: menus.caveCursor, overflowCursor: menus.overflowCursor }
}
/** A visitor's build. The Keep stock FX2 switch exists only with the loader. Loader-free builds keep every
 *  stock FX2 effect whose code the modules do not take; when that longer FX2 list leaves the module menus
 *  too little room, they use the compact FX2 menu, as both menus are native-verified profiles. */
export async function composeSelection(original: Uint8Array, ids: readonly string[], keepStockFx2: boolean, usbAudio?: UsbAudioConfiguration) {
  const keep = DSP_LOADER ? keepStockFx2 : true
  try { return await composeOs(original, ids, defaultChoosers(ids, keep), { usbAudio }) }
  catch (error) {
    if (DSP_LOADER || !(error instanceof Error) || !isMenuSpaceFailure(error.message)) throw error
    return composeOs(original, ids, defaultChoosers(ids, false), { usbAudio })
  }
}
