import { installStartup, BETA_STARTUP_IDENTITY } from './beta-startup.ts'
import { verifyNativeContracts } from './native-contracts.ts'
import { installCoreLogger, LOGGER_RETAINED_BYTES } from './core-logger.ts'
// Loader-free composition with mandatory logging. Historical module-matrix
// proofs predate the core; downloads stay gated until full images are reverified.
import { composeAnalogBd, createAnalogBootstrap } from './analog-bd.ts'
import { defaultChoosers, composeChoosers, leadingModules } from './choosers.ts'
import { recoverStockDsp } from './stock-dsp.ts'
import { composeStaticDsp } from './static-dsp.ts'
import { createStaticColdFireRuntime } from './coldfire-runtime.ts'
import { createRuntimeBootstrap, BOOTSTRAP_ADDRESS } from './bootstrap.ts'
import { createPlatformOsWrites } from './platform-writes.ts'
import { applyGuardedOsWrites, OS_LOAD_ADDRESS } from './os-patches.ts'
import { replaceUsbAudioHooks } from './usb-audio.ts'
import type { UsbAudioConfiguration } from '../config/usb-audio.ts'
type StaticRuntime = Awaited<ReturnType<typeof createStaticColdFireRuntime>>
function sameLayout(provisional: StaticRuntime, final: StaticRuntime) {
  const same = provisional.bytes.length === final.bytes.length && provisional.reserveBytes === final.reserveBytes &&
    JSON.stringify(provisional.sections) === JSON.stringify(final.sections) && JSON.stringify(provisional.units) === JSON.stringify(final.units) &&
    [...provisional.symbols].every(([name, address]) => provisional.romRefs.includes(name) || final.symbols.get(name) === address)
  if (!same) throw new Error('The DRAM link moved when the ROM symbols were applied.')
  return final
}
/** Every write set of a loader-free build, kept apart so a verifier can compare the module-owned
 *  writes with a native build that has no logger, and prove the others leave them untouched. */
export async function planStaticOs(original: Uint8Array, ids: readonly string[], profile = defaultChoosers(ids), usbAudio?: UsbAudioConfiguration, betaAccess = false) {
  await verifyNativeContracts(original, ids)
  const cores = await recoverStockDsp(original), leading = leadingModules(ids, profile)
  let runtime = await createStaticColdFireRuntime(ids, original, undefined, usbAudio, betaAccess, undefined, 'provisional', leading)
  const menus = await composeChoosers(original, ids, profile, runtime, betaAccess), dsp = await composeStaticDsp(cores, ids, menus.chooser)
  // The menus place the ROM units after the DRAM link (their caves start past its reserve, and their hooks name runtime
  // code), so a DRAM unit that names a ROM symbol is linked once more with it. Only relocated values change: the menus'
  // writes, which name runtime addresses, stay valid. Native resolves the same names (build_bus.py, _dram_rom_externals).
  // Whenever one is open, so the final link refuses a strong reference no ROM unit defines, as native ld does.
  if (runtime.romRefs.length) runtime = sameLayout(runtime, await createStaticColdFireRuntime(ids, original, undefined, usbAudio, betaAccess, undefined, menus.romSymbols, leading))
  if (usbAudio) menus.writes = await replaceUsbAudioHooks(original, menus.writes, runtime)
  const logging = await installCoreLogger(runtime, original, ids, menus.chooser, betaAccess ? BETA_STARTUP_IDENTITY : undefined)
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
