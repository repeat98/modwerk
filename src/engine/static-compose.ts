import { installStartup, BETA_STARTUP_IDENTITY } from './beta-startup.ts'
import { verifyNativeContracts } from './native-contracts.ts'
import { installCoreLogger, LOGGER_RETAINED_BYTES } from './core-logger.ts'
// Loader-free composition with mandatory logging. Historical module-matrix
// proofs predate the core; downloads stay gated until full images are reverified.
import { composeAnalogBd, createAnalogBootstrap } from './analog-bd.ts'
import { defaultChoosers, composeChoosers } from './choosers.ts'
import { recoverStockDsp } from './stock-dsp.ts'
import { composeStaticDsp } from './static-dsp.ts'
import { createStaticColdFireRuntime } from './coldfire-runtime.ts'
import { createRuntimeBootstrap, BOOTSTRAP_ADDRESS } from './bootstrap.ts'
import { createPlatformOsWrites } from './platform-writes.ts'
import { applyGuardedOsWrites, OS_LOAD_ADDRESS } from './os-patches.ts'
import { replaceUsbAudioHooks } from './usb-audio.ts'
import type { UsbAudioConfiguration } from '../config/usb-audio.ts'
/** Every write set of a loader-free build, kept apart so a verifier can compare the module-owned
 *  writes with a native build that has no logger, and prove the others leave them untouched. */
export async function planStaticOs(original: Uint8Array, ids: readonly string[], profile = defaultChoosers(ids), usbAudio?: UsbAudioConfiguration, betaAccess = false) {
  await verifyNativeContracts(original, ids)
  const cores = await recoverStockDsp(original), runtime = await createStaticColdFireRuntime(ids, original, undefined, usbAudio, betaAccess)
  const menus = await composeChoosers(original, ids, profile, runtime, betaAccess), dsp = await composeStaticDsp(cores, ids, menus.chooser)
  if (usbAudio) menus.writes = await replaceUsbAudioHooks(original, menus.writes, runtime)
  const logging = await installCoreLogger(runtime, original, ids, menus.chooser, betaAccess ? BETA_STARTUP_IDENTITY : undefined, menus.writes)
  const platform = createPlatformOsWrites(runtime, ids, { loader: false, reserveBytes: runtime.reserveBytes })
  const startup = await installStartup(runtime, original, betaAccess)
  return { runtime, menus, dsp, logging, platform, startup }
}
export async function composeStaticOs(original: Uint8Array, ids: readonly string[], profile = defaultChoosers(ids), usbAudio?: UsbAudioConfiguration, betaAccess = false) {
  const { runtime, menus, dsp, logging, platform, startup } = await planStaticOs(original, ids, profile, usbAudio, betaAccess)
  let patched = await applyGuardedOsWrites(original, [...menus.writes, ...dsp.writes, ...platform, ...logging.writes, ...startup])
  const analog = ids.includes('analog-bassdrum') ? await composeAnalogBd(original, patched, ids, profile, dsp.layouts) : null
  if (analog) patched = analog.bytes
  await verifyNativeContracts(patched, ids)
  const bootstrap = analog ? await createAnalogBootstrap(runtime.bytes, analog.uploads, runtime.reserveBytes - LOGGER_RETAINED_BYTES, runtime) : await createRuntimeBootstrap(runtime.bytes, runtime.reserveBytes - LOGGER_RETAINED_BYTES, undefined, runtime)
  if (OS_LOAD_ADDRESS + original.length !== BOOTSTRAP_ADDRESS) throw new Error('The runtime loader does not follow the original OS extent.')
  const bytes = new Uint8Array(patched.length + bootstrap.append.length); bytes.set(patched); bytes.set(bootstrap.append, patched.length)
  return { bytes, chooser: menus.chooser, dsp: dsp.layouts, runtime: { reservedBytes: runtime.reserveBytes, bytes: runtime.bytes.length, stage: bootstrap.layout.stage, stageEnd: bootstrap.layout.stageEnd }, caveCursor: menus.caveCursor, overflowCursor: menus.overflowCursor }
}
