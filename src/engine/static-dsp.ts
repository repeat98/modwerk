// Loader-free DSP composition, ported from the pinned native build_bus static-stock path. Stock effect code
// stays built in; a module is placed only in the code of stock effects listed on neither chooser. Every
// selection is checked against native output (static-composition-proofs.json;
// Analog BD's reserved layout has its own analog-bd-composition-proofs.json).
import facts from './assets/static-dsp.json' with { type: 'json' }
import stockMetadata from './assets/stock-dsp-metadata.json' with { type: 'json' }
import dspPackages from './assets/dsp-packages.json' with { type: 'json' }
import resident from './assets/resident-dsp.json' with { type: 'json' }
import { CATALOG_SOURCE, resolveSelection } from '../catalog/modules.ts'
import { readDspPackage, relocateDspPackage, type DspPackage } from './dsp-package.ts'
import { readResidentCharacter } from './resident-dsp.ts'
import type { StockDspCore } from './stock-dsp.ts'
import { parseDspMemory, readDspWords, writeDspWords, type DspMemory } from './dsp-memory.ts'
import { OS_LOAD_ADDRESS, type OsWrite } from './os-patches.ts'
import type { ChooserProfile } from './choosers.ts'
import { ANALOG_BD_DSP_COMPANIONS, analogBdReservations } from './analog-bd-layout.ts'

// The shared X dispatch table holds init[32], then process[32].
const INIT_TABLE = 0x215, PROC_TABLE = 0x235
async function sha(bytes: Uint8Array) {
  const digest = await crypto.subtle.digest('SHA-256', new Uint8Array(bytes).buffer)
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')
}
type Run = { base: number; words: number; cursor: number }
export type StaticDspLayout = { core: number; tag: string; region: { base: number; words: number } | null; placed: { key: string; address: number; words: number }[]; nulledDonors: string[] }

type Effect = { key: string; fxId: number; sourceAddress: number; words: number }
type Placeable = { key: string; fxId: number | null; words: number; splitTableWords?: number }
type Placement = { key: string; fxId: number | null; address: number; words: number; table?: { address: number; words: number } }
/** Native build_bus placement: harvest unlisted effects, exclude reservations,
 * then place in module order (first fit, or smallest opening with reservations). */
export function planStaticPlacement(tag: string, effects: readonly Effect[], listed: ReadonlySet<string>, plan: readonly Placeable[], reserved: readonly { base: number; words: number }[] = []) {
  // stock.harvested: effects on NEITHER chooser give up their words; contiguous ones form one run.
  const harvested = effects.filter(effect => !listed.has(effect.key)).sort((a, b) => a.sourceAddress - b.sourceAddress)
  let runs: Run[] = []
  for (const effect of harvested) {
    const last = runs[runs.length - 1]
    if (last && last.base + last.words === effect.sourceAddress) last.words += effect.words
    else runs.push({ base: effect.sourceAddress, words: effect.words, cursor: effect.sourceAddress })
  }
  for (const span of reserved) {
    if (!Number.isSafeInteger(span.base) || !Number.isSafeInteger(span.words) || span.base < 0 || span.words <= 0) throw new Error('Invalid reserved DSP span.')
    runs = runs.flatMap(run => {
      const end = run.base + run.words, cutEnd = span.base + span.words
      if (span.base >= end || cutEnd <= run.base) return [run]
      return [
        ...(span.base > run.base ? [{ base: run.base, words: span.base - run.base, cursor: run.base }] : []),
        ...(cutEnd < end ? [{ base: cutEnd, words: end - cutEnd, cursor: cutEnd }] : []),
      ]
    })
  }
  if (!runs.length && plan.length) throw new Error('payload ' + tag + ': nothing is harvested, so there is nowhere to place ' + plan.map(module => module.key).sort().join(', ') + '.')
  const budget = runs.reduce((sum, run) => sum + run.words, 0), placed: Placement[] = []
  for (const module of plan) {
    // With a reserved engine, use the smallest opening first: the five-word
    // Tape Echo stub fits in Analog BD's gap without consuming another reverb.
    const candidates = reserved.length ? [...runs].sort((a, b) => (a.base + a.words - a.cursor) - (b.base + b.words - b.cursor) || a.base - b.base) : runs
    const run = candidates.find(run => run.cursor + module.words <= run.base + run.words)
    if (!run) {
      const tableWords = module.splitTableWords
      if (tableWords !== undefined) {
        if (!Number.isInteger(tableWords) || tableWords <= 0 || tableWords >= module.words) throw new Error('Invalid separate DSP table size.')
        const codeWords = module.words - tableWords
        let split: { tableRun: Run; codeRun: Run; codeAddress: number } | undefined
        for (const tableRun of candidates) {
          if (tableRun.cursor + tableWords > tableRun.base + tableRun.words) continue
          const codeRuns = reserved.length ? [...runs].sort((a, b) => (a.base + a.words - a.cursor - (a === tableRun ? tableWords : 0)) - (b.base + b.words - b.cursor - (b === tableRun ? tableWords : 0)) || a.base - b.base) : runs
          const codeRun = codeRuns.find(run => run.cursor + (run === tableRun ? tableWords : 0) + codeWords <= run.base + run.words)
          if (codeRun) { split = { tableRun, codeRun, codeAddress: codeRun.cursor + (codeRun === tableRun ? tableWords : 0) }; break }
        }
        if (split) {
          const table = { address: split.tableRun.cursor, words: tableWords }
          placed.push({ key: module.key, fxId: module.fxId, address: split.codeAddress, words: codeWords, table })
          split.tableRun.cursor += tableWords
          split.codeRun.cursor = split.codeAddress + codeWords
          continue
        }
      }
      if (runs.length < 2) throw new Error('payload ' + tag + ': ' + module.key + ' overruns the region (' + (runs[0].cursor + module.words - runs[0].base) + ' > ' + budget + ' words)')
      throw new Error('payload ' + tag + ': ' + module.key + ' does not fit any harvested run.')
    }
    placed.push({ key: module.key, fxId: module.fxId, address: run.cursor, words: module.words })
    run.cursor += module.words
  }
  // Donor ids go to the null stub only where placed code reached the effect; the rest stay stock.
  const nulledDonors = harvested.filter(effect => runs.some(run => run.base < effect.sourceAddress + effect.words && effect.sourceAddress < run.cursor && run.cursor > run.base))
  return { runs, budget, placed, nulledDonors }
}

/** Native stable priority order, independent of the visitor's selection order. */
export function staticModulePlan(ids: readonly string[]) {
  const selected = new Set(resolveSelection(ids).map(module => module.id))
  return facts.modules.filter(module => selected.has(module.id)).sort((a, b) => a.priority - b.priority)
}
/** Native build_bus: hooked code goes only on the payloads it names (its packages' tags); every other module on both. */
function onPayload<T extends { id: string }>(plan: readonly T[], tag: string) {
  return plan.filter(module => !dspPackages.packages.some(pkg => pkg.id === module.id && 'stockDsp' in pkg)
    || dspPackages.packages.some(pkg => pkg.id === module.id && 'stockDsp' in pkg && pkg.tag === tag))
}

export function planSelectionDsp(tag: string, effects: readonly Effect[], listed: ReadonlySet<string>, plan: readonly Placeable[], ids: readonly string[]) {
  if (ids.includes('analog-bassdrum')) {
    const blockers = facts.modules.filter(module => ids.includes(module.id) && !ANALOG_BD_DSP_COMPANIONS.includes(module.id))
    if (blockers.length) throw new Error('ANALOG BD cannot share DSP memory with ' + blockers.map(module => module.key).join(', '))
  }
  const splitPlan = plan.map(module => ({ ...module, splitTableWords: dspPackages.packages.find(pkg => pkg.key === module.key && 'splitTableWords' in pkg)?.splitTableWords }))
  return planStaticPlacement(tag, effects, listed, splitPlan, ids.includes('analog-bassdrum') ? analogBdReservations(tag) : [])
}

type Helper = { host: string; start: number; end: number; callers: string[] }
/** Stock routines inside one effect's code that another effect calls. On 1.40C, DARK REV calls 35 words at
 *  SPRING REV+820 and PLATE REV calls 93 words at DARK REV+974. Taken from the native relocation recipes:
 *  each caller's call operand moves by the same distance as the routine. */
export function stockHelpers(tag: string): Helper[] {
  const payload = stockMetadata.payloads.find(payload => payload.tag === tag)
  if (!payload) throw new Error('Unknown DSP payload ' + tag + '.')
  return payload.shared.flatMap(routine => {
    const host = payload.packages.find(pkg => pkg.sourceAddress <= routine.sourceAddress && routine.sourceAddress < pkg.sourceAddress + pkg.words)
    if (!host) return []
    const shift = routine.destination - routine.sourceAddress
    const callers = payload.packages.filter(pkg => pkg !== host && pkg.adjustments.some(adjustment => adjustment.delta === shift)).map(pkg => pkg.key)
    return [{ host: host.key, start: routine.sourceAddress, end: routine.sourceAddress + routine.words, callers }]
  })
}
/** A routine that placed code overwrites while an effect calling it is still listed. Native placement does not check this. */
export function overwrittenHelper(tag: string, listed: ReadonlySet<string>, runs: readonly Run[]) {
  return stockHelpers(tag).find(helper => !listed.has(helper.host) && helper.callers.some(caller => listed.has(caller))
    && runs.some(run => run.base < helper.end && helper.start < run.cursor))
}

const moduleWords = (id: string) => id === 'character' ? resident.character.words : dspPackages.packages.find(pkg => pkg.id === id)!.words
// Spring first, as upstream's Analog BD and the earlier Tape Echo; then Plate and Dark.
const DONOR_PREFERENCE = ['SPRING REV', 'PLATE REV', 'DARK REV']
/** The stock effects to take off FX2 so the selection's DSP code fits: the fewest, in donor preference, that
 *  hold every module on both cores without breaking an effect that stays listed. Only effects with DSP code
 *  that are on FX2 but not FX1 are candidates. When even all of them are too small, all of them, so that
 *  placement reports the overrun. */
export function stockFx2Donors(ids: readonly string[], profile: ChooserProfile, required: readonly string[] = []): string[] {
  const plan = staticModulePlan(ids).map(module => ({ id: module.id, key: module.key, fxId: module.fxId, words: moduleWords(module.id) }))
  const rank = (key: string) => DONOR_PREFERENCE.includes(key) ? DONOR_PREFERENCE.indexOf(key) : DONOR_PREFERENCE.length
  const candidates = stockMetadata.payloads[0].packages.map(pkg => pkg.key)
    .filter(key => profile.fx2.includes(key) && !profile.fx1.includes(key)).sort((a, b) => rank(a) - rank(b))
  // Every subset, each in preference order; fewer effects first, then the preferred effect at the first difference.
  const preferred = (a: string[], b: string[]) => {
    const at = a.findIndex((key, i) => key !== b[i])
    return a.length - b.length || (at < 0 ? 0 : rank(a[at]) - rank(b[at]))
  }
  const sets = candidates.reduce<string[][]>((all, key) => [...all, ...all.map(set => [...set, key])], [[]])
    .filter(set => required.every(key => set.includes(key))).sort(preferred)
  for (const set of sets) {
    const listed = new Set([...profile.fx1, ...profile.fx2].filter(key => !set.includes(key)))
    for (const pkg of dspPackages.packages) if (pkg.stockKey !== undefined && plan.some(module => module.key === pkg.key)) listed.add(pkg.stockKey)
    const fits = stockMetadata.payloads.every(payload => {
      try { return !overwrittenHelper(payload.tag, listed, planSelectionDsp(payload.tag, payload.packages, listed, onPayload(plan, payload.tag), ids).runs) }
      catch { return false }
    })
    if (fits) return set
  }
  return candidates
}

type DispatchTarget = { fxId: number; init: number; proc: number }
/** Install selected entries and make NONE, omitted custom ids and overwritten donors resolve to stock's null stub. */
export function applyStaticDispatch(memory: DspMemory, placed: readonly DispatchTarget[], donors: readonly { fxId: number }[], stub: { nullInit: number; nullProc: number }) {
  const dispatch = ({ fxId, init, proc }: DispatchTarget) => {
    writeDspWords(memory, 1, INIT_TABLE + fxId, new Uint32Array([init]))
    writeDspWords(memory, 1, PROC_TABLE + fxId, new Uint32Array([proc]))
  }
  const nullDispatch = (fxId: number) => dispatch({ fxId, init: stub.nullInit, proc: stub.nullProc })
  nullDispatch(facts.noneId)
  for (const module of placed) dispatch(module)
  for (const fxId of facts.customIds) if (!placed.some(module => module.fxId === fxId)) nullDispatch(fxId)
  for (const donor of donors) nullDispatch(donor.fxId)
}

export async function composeStaticDsp(cores: readonly StockDspCore[], ids: readonly string[], profile: ChooserProfile) {
  if (facts.schema !== 1 || facts.revision !== CATALOG_SOURCE.revision || facts.sourceSha256 !== stockMetadata.sourceSha256) throw new Error('Static DSP facts do not match the pinned catalog.')
  if (cores.length !== 2 || new Set(cores.map(core => core.core)).size !== 2) throw new Error('DSP composition requires both stock cores.')
  const plan = staticModulePlan(ids)
  const packages = new Map<string, DspPackage>()
  for (const module of plan.filter(module => !dspPackages.packages.some(pkg => pkg.id === module.id && 'stockDsp' in pkg))) packages.set(module.id, module.id === 'character' ? await readResidentCharacter() : await readDspPackage(module.id))
  const listed = new Set([...profile.fx1, ...profile.fx2])
  for (const pkg of dspPackages.packages) if (pkg.stockKey !== undefined && plan.some(module => module.id === pkg.id)) listed.add(pkg.stockKey)
  const writes: OsWrite[] = [], layouts: StaticDspLayout[] = []
  for (const core of [...cores].sort((a, b) => a.core - b.core)) {
    const stock = stockMetadata.payloads.find(payload => payload.core === core.core)!, stub = facts.payloads.find(payload => payload.core === core.core)!
    if (!stock || !stub || core.tag !== stock.tag || stub.tag !== stock.tag || await sha(core.memory.bytes) !== stock.sha256) throw new Error('DSP composition needs the verified original payloads.')
    const placing = onPayload(plan, core.tag)
    for (const module of placing) if (dspPackages.packages.some(pkg => pkg.id === module.id && 'stockDsp' in pkg)) packages.set(module.id, await readDspPackage(module.id, core.tag))
    const layout = planSelectionDsp(stock.tag, stock.packages, listed, placing.map(module => ({ key: module.key, fxId: module.fxId, words: packages.get(module.id)!.words })), ids)
    const broken = overwrittenHelper(stock.tag, listed, layout.runs)
    if (broken) throw new Error('payload ' + stock.tag + ': module code would overwrite a ' + broken.host + ' routine that ' + broken.callers.join(', ') + ' still calls.')
    const memory = parseDspMemory(new Uint8Array(core.memory.bytes))
    const dispatch: DispatchTarget[] = []
    for (const [index, module] of placing.entries()) {
      const pkg = packages.get(module.id)!, at = layout.placed[index]
      if (pkg.fxId !== module.fxId) throw new Error('The ' + module.key + ' package does not match its native DSP id.')
      const code = relocateDspPackage(pkg, at.address - (at.table?.words ?? 0), at.table?.address)
      if (at.table) writeDspWords(memory, 0, at.table.address, code.words.subarray(0, at.table.words))
      writeDspWords(memory, 0, at.address, code.words.subarray(at.table?.words ?? 0))
      if (pkg.stockDsp) {
        if (!pkg.hooks?.length || pkg.tag !== core.tag || pkg.fxId !== null && !pkg.stockKey) throw new Error('The stock DSP hooks have an invalid payload declaration.')
        for (const hook of pkg.hooks) {
          if (hook.words !== 2 || !Number.isInteger(hook.site) || hook.site < 0 || !Number.isInteger(hook.entry) || hook.entry < 0 || hook.entry >= pkg.words || !/^[a-f0-9]{64}$/.test(hook.guardSha256)) throw new Error('Invalid stock DSP hook.')
          const inherited = readDspWords(core.memory, 0, hook.site, hook.words), bytes = new Uint8Array(inherited.length * 3)
          inherited.forEach((word, i) => { bytes[i * 3] = word >>> 16; bytes[i * 3 + 1] = word >>> 8; bytes[i * 3 + 2] = word })
          if (await sha(bytes) !== hook.guardSha256) throw new Error('The stock DSP hook fingerprint differs from the verified original.')
          writeDspWords(memory, 0, hook.site, new Uint32Array([0x0bf080, at.address + hook.entry]))
        }
      } else if (module.fxId !== null) dispatch.push({ fxId: module.fxId, init: code.init, proc: code.proc })
      else throw new Error('The ' + module.key + ' package has neither an effect id nor stock DSP hooks.')
    }
    applyStaticDispatch(memory, dispatch, layout.nulledDonors, stub)
    writes.push({ address: OS_LOAD_ADDRESS + stock.sourceOffset, guardLength: stock.bytes, guardSha256: stock.sha256, bytes: memory.bytes, note: 'DSP payload ' + stock.tag + ' (static stock)' })
    layouts.push({ core: core.core, tag: stock.tag, region: layout.runs.length ? { base: layout.runs[0].base, words: layout.budget } : null, placed: layout.placed.flatMap(({ key, address, words, table }) => [{ key, address, words }, ...(table ? [{ key: key + ' table', ...table }] : [])]), nulledDonors: layout.nulledDonors.map(effect => effect.key) })
  }
  return { writes, layouts }
}
