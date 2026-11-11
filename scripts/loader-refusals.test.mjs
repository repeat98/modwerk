import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { REFUSALS, REFUSAL_LABELS, describeRefusal } from './loader-refusals.mjs'

const header = readFileSync(new URL('../sdk/runtime/loader/loader.h', import.meta.url), 'utf8')

/** The enumerators of loader.h's runtime_refusal, in order, comments dropped. */
function enumerators() {
  const body = /enum runtime_refusal\s*\{([\s\S]*?)\};/.exec(header)?.[1]
  if (!body) throw new Error('loader.h no longer declares enum runtime_refusal.')
  return body.replace(/\/\*[\s\S]*?\*\//g, '').split(',').map(name => name.trim()).filter(Boolean)
}

describe('the loader refusal registry', () => {
  it('lists loader.h’s refusals, each at its code', () => {
    const names = enumerators()
    expect(names.every(name => /^RUNTIME_[A-Z_]+$/.test(name)), 'an enumerator with a value needs this test taught first').toBe(true)
    expect(REFUSALS.map(refusal => refusal.name)).toEqual(names)
    expect(REFUSALS.map(refusal => refusal.code)).toEqual(names.map((_, code) => code))
  })
  it('gives every refusal a label, a next step for a developer and a decision on the musician’s text', () => {
    for (const refusal of REFUSALS) {
      expect(refusal.label, refusal.name).toMatch(/\S/)
      expect(refusal.developer, refusal.name).toMatch(/\.$/)
      if (refusal.code) expect(refusal.musician === null || /\S/.test(refusal.musician ?? ''), refusal.name + ': a musician text, or null for the plain one').toBe(true)
    }
    expect(new Set(REFUSAL_LABELS).size).toBe(REFUSALS.length)
  })
  it('is the list the diagnostics script prints from', () => {
    // scripts/diagnostics-pull.mjs keeps its own copy (it is under the platform licence and imports nothing from here).
    const script = readFileSync(new URL('./diagnostics-pull.mjs', import.meta.url), 'utf8')
    const copy = /const REFUSALS = Object\.assign\(\[([^\]]*)\]/.exec(script)?.[1]
    expect(copy, 'diagnostics-pull.mjs no longer has its REFUSALS list').toBeTruthy()
    expect([...copy.matchAll(/'([^']*)'/g)].map(match => match[1])).toEqual(REFUSAL_LABELS)
  })
  it('names a code for the developer tools', () => {
    expect(describeRefusal(7)).toMatch(/^7 RUNTIME_IN_USE: A track runs the effect/)
    expect(describeRefusal(8)).toMatch(/^8 RUNTIME_STOCK: /)
    expect(describeRefusal(99)).toMatch(/^99: not a refusal this checkout knows/)
  })
})
