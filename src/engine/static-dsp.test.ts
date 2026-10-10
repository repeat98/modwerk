import { describe, expect, it } from 'vitest'
import { applyStaticDispatch, overwrittenHelper, planSelectionDsp, planStaticPlacement, staticModulePlan, stockFx2Donors, stockHelpers } from './static-dsp'
import { parseDspMemory, readDspWords } from './dsp-memory'
import facts from './assets/static-dsp.json'
import stockMetadata from './assets/stock-dsp-metadata.json'
import dsp from './assets/dsp-packages.json'
import resident from './assets/resident-dsp.json'
// Structural facts only: stock effect spans, module package sizes and native priorities. No firmware.
const core = (tag: string) => stockMetadata.payloads.find(payload => payload.tag === tag)!.packages.map(({ key, fxId, sourceAddress, words }) => ({ key, fxId, sourceAddress, words }))
const words = (id: string) => id === 'character' ? resident.character.words : dsp.packages.find(pkg => pkg.id === id)!.words
const plan = (ids: string[]) => staticModulePlan(ids).map(module => ({ key: module.key, fxId: module.fxId, words: words(module.id) }))
const stockFx1 = ['FILTER', 'SPATIALIZER', 'EQUALIZER', 'PHASER', 'FLANGER', 'CHORUS', 'COMPRESSOR', 'LO-FI', 'DJ EQ', 'COMB FILTER']
const everyStock = new Set(core('A').map(effect => effect.key))
const fx2Off = new Set(stockFx1)
describe('loader-free DSP placement (native static stock)', () => {
  it('uses native priority and stable catalog ties regardless of selection order', () => {
    expect(staticModulePlan(['euclid', 'miniverb', 'tapeecho', 'modulation', 'character', 'spectrum', 'repitch']).map(module => module.id))
      .toEqual(['spectrum', 'character', 'modulation', 'tapeecho', 'miniverb', 'euclid'])
    expect(() => staticModulePlan(['unknown'])).toThrow('Unknown module')
  })
  it('fits compact Air Chorus beside Analog BD and common DSP companions', () => {
    const selected = plan(['airwindows-chorus'])
    expect(selected).toHaveLength(1)
    expect(selected[0].words).toBe(795)
    for (const tag of ['A', 'B']) {
      expect(planSelectionDsp(tag, core(tag), fx2Off, selected, ['airwindows-chorus']).placed).toHaveLength(1)
      const combined = planSelectionDsp(tag, core(tag), fx2Off, selected, ['airwindows-chorus', 'analog-bassdrum'])
      expect(combined.placed[0].words).toBe(795)
      for (const companion of ['miniverb', 'euclid', 'tapehead']) {
        const ids = ['analog-bassdrum', 'airwindows-chorus', companion]
        expect(planSelectionDsp(tag, core(tag), fx2Off, plan(ids), ids).placed).toHaveLength(2)
      }
      expect(planSelectionDsp(tag, core(tag), fx2Off, plan(['airwindows-chorus', 'everb']), ['airwindows-chorus', 'everb']).placed).toHaveLength(2)
      expect(() => planStaticPlacement(tag, core(tag), everyStock, selected)).toThrow('nowhere to place AIR CHORUS')
    }
  })
  it('places the table and program in separate openings when a contiguous run cannot fit', () => {
    const effects = [{ key: 'FIRST', fxId: 16, sourceAddress: 0x1000, words: 600 }, { key: 'SECOND', fxId: 17, sourceAddress: 0x2000, words: 300 }]
    const selected = [{ ...plan(['airwindows-chorus'])[0], splitTableWords: 256 }]
    const layout = planStaticPlacement('A', effects, new Set(), selected)
    expect(layout.placed[0]).toMatchObject({ address: 0x1000, words: 539, table: { address: 0x2000, words: 256 } })
  })
  it('keeps listed stock dispatch entries and nulls every omitted custom id on both cores', () => {
    for (const stub of facts.payloads) {
      // A synthetic X-memory record covering both dispatch tables; no stock instruction bytes.
      const bytes: number[] = [], word = (value: number) => bytes.push(value & 255, value >>> 8 & 255, value >>> 16 & 255)
      ;[1, 0x215, 64, ...Array.from({ length: 64 }, (_, i) => 0x1200 + i), 3, 0].forEach(word)
      const memory = parseDspMemory(new Uint8Array(bytes))
      const selected = { fxId: 23, init: 0x1000, proc: 0x1001 }
      applyStaticDispatch(memory, [selected], [{ fxId: 16 }], stub)
      expect(Array.from(readDspWords(memory, 1, 0x215 + selected.fxId, 1))).toEqual([selected.init])
      expect(Array.from(readDspWords(memory, 1, 0x235 + selected.fxId, 1))).toEqual([selected.proc])
      for (const fxId of [0, 6, 7, 9, 10, 11, 14, 15, 16, 26, 29]) {
        expect(readDspWords(memory, 1, 0x215 + fxId, 1)[0]).toBe(stub.nullInit)
        expect(readDspWords(memory, 1, 0x235 + fxId, 1)[0]).toBe(stub.nullProc)
      }
      // FILTER and unused reverb donors retain their original entries.
      for (const fxId of [1, 17, 18]) {
        expect(readDspWords(memory, 1, 0x215 + fxId, 1)[0]).toBe(0x1200 + fxId)
        expect(readDspWords(memory, 1, 0x235 + fxId, 1)[0]).toBe(0x1220 + fxId)
      }
    }
  })
  it('takes the three reverbs as one region on each core when stock FX2 is off', () => {
    const a = planStaticPlacement('A', core('A'), fx2Off, plan(['miniverb'])), b = planStaticPlacement('B', core('B'), fx2Off, plan(['miniverb']))
    expect(a.runs).toHaveLength(1); expect(a.runs[0]).toMatchObject({ base: 0x1000, words: 2724 })
    expect(b.runs[0]).toMatchObject({ base: 0xdc0, words: 2724 })
  })
  it('refuses anything that needs DSP space while every stock effect is listed', () => {
    expect(() => planStaticPlacement('A', core('A'), everyStock, plan(['euclid']))).toThrow('nowhere to place EUCLID')
    expect(planStaticPlacement('A', core('A'), everyStock, plan([])).placed).toEqual([])
  })
  it('places modules in native priority order, packed from the region start', () => {
    const { placed } = planStaticPlacement('A', core('A'), fx2Off, plan(['euclid', 'tapeecho', 'miniverb']))
    expect(placed.map(item => item.key)).toEqual(['TAPE ECHO', 'MINIVERB', 'EUCLID'])
    expect(placed[0].address).toBe(0x1000)
    for (let i = 1; i < placed.length; i++) expect(placed[i].address).toBe(placed[i - 1].address + placed[i - 1].words)
  })
  it('names the overrun with native wording, matching the native proofs', () => {
    expect(() => planStaticPlacement('A', core('A'), fx2Off, plan(['spectrum', 'modulation']))).toThrow('MODULATION overruns the region (2966 > 2724 words)')
    expect(() => planStaticPlacement('A', core('A'), fx2Off, plan(['spectrum', 'modulation', 'character']))).toThrow('MODULATION overruns the region (3955 > 2724 words)')
  })
  it('nulls only donors the placed code reached and keeps the rest stock', () => {
    const { nulledDonors } = planStaticPlacement('A', core('A'), fx2Off, plan(['miniverb', 'tapeecho', 'euclid']))
    expect(nulledDonors.map(effect => effect.key)).toEqual(['PLATE REV', 'SPRING REV'])
  })
  it('does not use space in a run that is too small even if other runs are free', () => {
    // FILTER and DARK REV are separate runs; MODULATION (1575) fits neither.
    const listed = new Set([...everyStock].filter(key => key !== 'FILTER' && key !== 'DARK REV'))
    expect(() => planStaticPlacement('A', core('A'), listed, plan(['modulation']))).toThrow('does not fit any harvested run')
    // First-fit by address: Tape Echo (5 words) takes the lower run, Mini Verb (457) skips FILTER's 441 words.
    expect(planStaticPlacement('A', core('A'), listed, plan(['tapeecho'])).placed[0].address).toBe(0x7d1)
    expect(planStaticPlacement('A', core('A'), listed, plan(['miniverb'])).placed[0].address).toBe(0x1679)
  })
  it('knows the reverb routines that another reverb calls, on both cores', () => {
    for (const tag of ['A', 'B']) {
      const spans = Object.fromEntries(core(tag).map(effect => [effect.key, effect.sourceAddress]))
      expect(stockHelpers(tag)).toEqual([
        { host: 'SPRING REV', start: spans['SPRING REV'] + 820, end: spans['SPRING REV'] + 855, callers: ['DARK REV'] },
        { host: 'DARK REV', start: spans['DARK REV'] + 974, end: spans['DARK REV'] + 1067, callers: ['PLATE REV'] },
      ])
    }
  })
  it('refuses placed code over a routine that a listed reverb still calls', () => {
    const withoutSpring = new Set([...everyStock].filter(key => key !== 'SPRING REV'))
    // 395 words stay below SPRING REV+820; Euclid and Mini Verb together (852) reach DARK REV's routine.
    expect(overwrittenHelper('A', withoutSpring, planStaticPlacement('A', core('A'), withoutSpring, plan(['euclid'])).runs)).toBeUndefined()
    expect(overwrittenHelper('A', withoutSpring, planStaticPlacement('A', core('A'), withoutSpring, plan(['euclid', 'miniverb'])).runs)?.callers).toEqual(['DARK REV'])
    // With DARK REV off as well, nothing listed calls the routine.
    const withoutBoth = new Set([...withoutSpring].filter(key => key !== 'DARK REV'))
    expect(overwrittenHelper('A', withoutBoth, planStaticPlacement('A', core('A'), withoutBoth, plan(['euclid', 'miniverb'])).runs)).toBeUndefined()
  })
  it('gives up only the FX2 reverbs a selection needs, Spring first', () => {
    const kept = { fx1: stockFx1, fx2: [...stockFx1, 'DELAY', 'PLATE REV', 'SPRING REV', 'DARK REV'] }
    const donors = (ids: string[], required: string[] = []) => stockFx2Donors(ids, kept, required)
    expect(donors([])).toEqual([]); expect(donors(['repitch'])).toEqual([])
    for (const id of ['tapeecho', 'euclid', 'miniverb']) expect(donors([id])).toEqual(['SPRING REV'])
    // Too large for Spring below DARK REV's routine and for Plate: Dark alone holds it below PLATE REV's routine.
    expect(donors(['euclid', 'miniverb'])).toEqual(['DARK REV'])
    expect(donors(['character'])).toEqual(['SPRING REV', 'PLATE REV'])
    // Plate + Spring is large enough, but Modulation would reach DARK REV's routine in Spring.
    expect(donors(['modulation'])).toEqual(['SPRING REV', 'DARK REV'])
    expect(donors(['spectrum', 'character', 'tapeecho'])).toEqual(['SPRING REV', 'PLATE REV', 'DARK REV'])
    // Nothing is large enough: every candidate, so placement names the overrun.
    expect(donors(['spectrum', 'modulation'])).toEqual(['SPRING REV', 'PLATE REV', 'DARK REV'])
    expect(donors([], ['SPRING REV'])).toEqual(['SPRING REV'])
    // Output Matrix's core-0 code fits Spring; beside a larger effect a second reverb goes.
    expect(donors(['output-matrix'])).toEqual(['SPRING REV']); expect(donors(['output-matrix', 'tapeecho'])).toEqual(['SPRING REV'])
    expect(donors(['output-matrix', 'miniverb'])).toEqual(['SPRING REV', 'PLATE REV'])
    // An effect still on FX1 keeps its code; DELAY has none to give.
    expect(stockFx2Donors(['spectrum', 'modulation'], { fx1: [...stockFx1, 'PLATE REV'], fx2: kept.fx2 })).toEqual(['SPRING REV', 'DARK REV'])
  })
  it('fits Character with Mini Verb and Tape Echo, but not with Spectrum', () => {
    expect(planStaticPlacement('A', core('A'), fx2Off, plan(['character', 'miniverb', 'tapeecho'])).placed).toHaveLength(3)
    expect(() => planStaticPlacement('A', core('A'), fx2Off, plan(['spectrum', 'character', 'miniverb']))).toThrow('overruns the region')
  })
})
