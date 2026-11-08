import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { analogBdReservations, ANALOG_BD_DSP_COMPANIONS } from './analog-bd-layout'
import { defaultChoosers } from './choosers'
import { planSelectionDsp, staticModulePlan, overwrittenHelper } from './static-dsp'
import stock from './assets/stock-dsp-metadata.json'
import packages from './assets/dsp-packages.json'
import requested from './assets/requested-packages.json'
import proofs from './assets/analog-bd-composition-proofs.json'
import build from './assets/module-build.json'
import { parseColdFireObject } from './coldfire-elf'

function layout(tag: string, companions: string[]) {
  const ids = ['analog-bassdrum', ...companions], profile = defaultChoosers(ids)
  const listed = new Set([...profile.fx1, ...profile.fx2])
  if (companions.includes('sidechain-compressor')) listed.add('COMPRESSOR')
  const payload = stock.payloads.find(payload => payload.tag === tag)!
  const plan = staticModulePlan(ids).map(module => ({ ...module, words: packages.packages.find(pkg => pkg.id === module.id)!.words }))
  return { profile, listed, layout: planSelectionDsp(tag, payload.packages, listed, plan, ids) }
}

describe('Analog BD shared DSP placement', () => {
  it('records both menu profiles for every DSP subset and the utility interaction matrix', () => {
    expect(proofs.moduleSourceTreeSha256).toBe(build.sourceTreeSha256)
    for (const [file, fingerprint] of Object.entries(proofs.builderSources)) {
      expect(createHash('sha256').update(readFileSync(new URL('../../sdk/octabam/' + file, import.meta.url))).digest('hex')).toBe(fingerprint)
    }
    expect(proofs.proofs).toHaveLength(212)
    expect(proofs.proofs.filter(proof => !('error' in proof))).toHaveLength(146)
    const keys = new Set(proofs.proofs.map(proof => [...proof.moduleIds].sort().join('+') + ':' + proof.keepStockFx2))
    expect(keys.size).toBe(212)
    for (let mask = 0; mask < 1 << ANALOG_BD_DSP_COMPANIONS.length; mask++) for (const keep of [true, false]) {
      const ids = ['analog-bassdrum', ...ANALOG_BD_DSP_COMPANIONS.filter((_, bit) => mask >> bit & 1)]
      expect(keys.has(ids.sort().join('+') + ':' + keep)).toBe(true)
    }
    for (const proof of proofs.proofs) {
      expect(defaultChoosers(proof.moduleIds, proof.keepStockFx2)).toEqual({ fx1: proof.menu.fx1, fx2: proof.menu.fx2 })
      expect(proof).not.toHaveProperty('code')
      expect(proof).not.toHaveProperty('image')
      if (!('error' in proof)) expect(proof.maskedOsSha256).toMatch(/^[a-f0-9]{64}$/)
    }
  })
  it('fits Tape Echo in the existing donor without losing either remaining reverb', () => {
    for (const variant of requested.analog.variants) {
      const result = layout(variant.tag, ['tapeecho'])
      expect(result.profile.fx2).toContain('PLATE REV')
      expect(result.profile.fx2).toContain('DARK REV')
      expect(result.layout.placed).toMatchObject([{ key: 'TAPE ECHO', address: variant.spring + variant.words.length, words: 5 }])
      expect(result.layout.nulledDonors.map(donor => donor.key)).toEqual(['SPRING REV'])
    }
  })
  it('uses only one additional donor for each larger companion and for Mini Verb + Euclid', () => {
    for (const ids of [['miniverb'], ['euclid'], ['tapehead'], ['sidechain-compressor'], ['miniverb', 'euclid']]) {
      for (const tag of ['A', 'B']) {
        const result = layout(tag, ids)
        expect(result.profile.fx2.filter(key => key.endsWith(' REV'))).toHaveLength(1)
        expect(overwrittenHelper(tag, result.listed, result.layout.runs)).toBeUndefined()
      }
    }
  })
  it('never places a DSP word inside the engine or relocated helper across every companion subset', () => {
    for (let mask = 0; mask < 1 << ANALOG_BD_DSP_COMPANIONS.length; mask++) {
      const companions = ANALOG_BD_DSP_COMPANIONS.filter((_, bit) => mask >> bit & 1)
      for (const tag of ['A', 'B']) {
        const key = ['analog-bassdrum', ...companions].sort().join('+')
        const proof = proofs.proofs.find(proof => !proof.keepStockFx2 && [...proof.moduleIds].sort().join('+') === key)!
        if ('error' in proof) {
          expect(() => layout(tag, companions)).toThrow('does not fit any harvested run')
          continue
        }
        const result = layout(tag, companions)
        expect(result.layout.placed).toHaveLength(companions.length)
        expect(overwrittenHelper(tag, result.listed, result.layout.runs)).toBeUndefined()
        const spans = result.layout.placed.flatMap(placed => [placed, ...(placed.table ? [placed.table] : [])])
        for (const placed of spans) for (const reserved of analogBdReservations(tag)) {
          expect(placed.address >= reserved.base + reserved.words || placed.address + placed.words <= reserved.base).toBe(true)
        }
      }
    }
  })
  it('uses an absolute 32-bit boot table relocation for runtimes larger than 32 KiB', () => {
    const object = parseColdFireObject(Uint8Array.from(requested.bootstrap.code.match(/../g)!, byte => parseInt(byte, 16)))
    const references = object.relocations.filter(relocation => object.symbols[relocation.symbol].name === 'octamod_pre_table')
    expect(references).toHaveLength(1)
    expect(references[0].type).toBe(1)
  })
})
