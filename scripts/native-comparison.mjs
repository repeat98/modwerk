// Compares one selection built by Modwerk's browser composer with native octabam's result for it. Reads the original OS in
// memory only. The browser always links the core logger, which native does not have, so the comparison is made on what
// native can produce:
//   * a selection native refuses is refused here, for the same class of reason;
//   * a selection native builds is built here, and the module-owned writes (chooser, descriptors, ROM units, DSP payloads)
//     reproduce native's OS image byte for byte outside the platform writes (arena sizes, the boot call and runtime detours),
//     which depend on where the logger-bearing runtime links;
//   * without a runtime or platform arena reservation, the image is identical outright;
//   * recorder comparisons reserve the same logger arena geometry natively, so every recorder pool literal is compared exactly;
//   * the platform and logger writes never touch a byte a module owns;
//   * when only the logger-bearing Analog BD bootstrap exhausts its guarded
//     pre-boot space, module-owned image parity is still required and the
//     separate browser refusal is retained. No downloadable image is accepted.
import { createHash } from 'node:crypto'
import { composeOs } from '../src/engine/compose-os.ts'
import { planStaticOs } from '../src/engine/static-compose.ts'
import { composeAnalogBd } from '../src/engine/analog-bd.ts'
import { applyGuardedOsWrites, OS_LOAD_ADDRESS } from '../src/engine/os-patches.ts'

const sha = bytes => createHash('sha256').update(bytes).digest('hex')
// A native refusal and the browser's wording for the same limit. Only the class has to agree.
const CLASSES = [
  ['declaration collision', /has colliding modules:/, /conflicting native declarations|The OS write plan contains overlapping guards\./],
  ['DSP region', /overruns the region|does not fit any harvested run/, /overruns the region|does not fit any harvested run/],
  ['menu space', /label formatters do not fit|wide dial hook|chooser list of|not free|past the stock zero run|fits neither the clone window|does not fit|do not fit/, /module menu cave exceeds|choosers need more space|does not fit|do not fit/],
  ['Analog BD', /stock effects only|cannot share DSP memory/, /stock effects only|cannot share DSP memory/],
  ['Analog BD boot memory', /pre-boot analog bd payload A dst overlaps runtime stage:/, /^Analog BD boot payloads overlap or exceed reserved memory\.$/],
  // 0x400d24d0..0x400d24df, which the stock DELAY reads past its table (build_bus.py delay_tail_clash, os-patches.ts).
  ['stock DELAY table tail', /which the stock DELAY reads past its table/, /the stock DELAY reads 0x400d24d0\.\.0x400d24df past its table/],
]
export const refusalClass = (text, side) => CLASSES.find(row => row[side === 'native' ? 1 : 2].test(text))?.[0] ?? 'unclassified'

/** Returns { verdict: 'identical' | 'masked' | 'refused' } or { failure: text }. */
export async function compareSelection(original, proof, menus) {
  let plan, error
  try { plan = await planStaticOs(original, proof.moduleIds, menus); await composeOs(original, proof.moduleIds, menus, { loader: false }) } catch (caught) { error = caught instanceof Error ? caught.message : String(caught) }
  if (proof.error) {
    if (!error) return { failure: 'native refuses (' + proof.error.slice(0, 90) + ') but the browser built it' }
    const native = refusalClass(proof.error, 'native'), browser = refusalClass(error, 'browser')
    if (native !== browser || browser === 'unclassified') return { failure: 'refusal differs. native: ' + proof.error.slice(0, 90) + ' | browser: ' + error.slice(0, 90) }
    return { verdict: 'refused', reason: native }
  }
  // Native has no logger. Its smaller stage can fit where the mandatory
  // browser logger cannot. Accept this platform difference only after the
  // independent native fingerprint checks below, never an unknown error.
  const browserPlatformRefused = proof.moduleIds.includes('analog-bassdrum') && plan && error === 'Analog BD boot payloads overlap or exceed reserved memory.'
  if (error && !browserPlatformRefused) return { failure: 'native builds it but the browser refused: ' + error.slice(0, 120) }
  const owned = [...plan.menus.writes, ...plan.dsp.writes], other = [...plan.platform, ...plan.logging.writes]
  for (const a of owned) for (const b of other) if (a.address < b.address + b.bytes.length && b.address < a.address + a.bytes.length) return { failure: b.note + ' overlaps ' + a.note }
  let image = await applyGuardedOsWrites(original, owned)
  // Analog BD rewrites both DSP payloads and repoints their uploads after the plan, as composeStaticOs does.
  if (proof.moduleIds.includes('analog-bassdrum')) image = (await composeAnalogBd(original, image, proof.moduleIds, menus, plan.dsp.layouts)).bytes
  const outright = proof.bytes === original.length && !proof.platformArena
  if (outright && sha(image) !== proof.osSha256) return { failure: 'the module-owned image differs from native, which has no runtime' }
  const reset = image.slice()
  for (const write of plan.platform) { const offset = write.address - OS_LOAD_ADDRESS; reset.set(original.subarray(offset, offset + write.bytes.length), offset) }
  if (sha(reset) !== proof.maskedOsSha256) return { failure: 'the module-owned image differs from native outside the platform writes' }
  return { verdict: outright ? 'identical' : 'masked', ...(browserPlatformRefused ? { browserPlatformRefused: error } : {}) }
}
