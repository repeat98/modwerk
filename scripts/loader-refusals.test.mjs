import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { REFUSALS, REFUSAL_LABELS, SUBJECTS, describeRefusal, describeSubject } from './loader-refusals.mjs'

const header = readFileSync(new URL('../sdk/runtime/loader/loader.h', import.meta.url), 'utf8')

/** The enumerators of one of loader.h's enums (runtime_refusal by default), in order, comments dropped. */
function enumerators(name = 'runtime_refusal') {
  const body = new RegExp(`enum ${name}\\s*\\{([\\s\\S]*?)\\};`).exec(header)?.[1]
  if (!body) throw new Error(`loader.h no longer declares enum ${name}.`)
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
  it('names a code for the developer tools', () => {
    expect(describeRefusal(7)).toMatch(/^7 RUNTIME_IN_USE: A track runs the effect/)
    expect(describeRefusal(8)).toMatch(/^8 RUNTIME_STOCK: /)
    expect(describeRefusal(99)).toMatch(/^99: not a refusal this checkout knows/)
  })
  it('lists loader.h’s subjects, each at its kind, with its words', () => {
    const names = enumerators('runtime_met')
    expect(names[0]).toBe('RUNTIME_MET_NOTHING')
    expect(SUBJECTS.map(subject => subject.name)).toEqual(names)
    expect(SUBJECTS.map(subject => subject.kind)).toEqual(names.map((_, kind) => kind))
    for (const subject of SUBJECTS.slice(1)) {
      expect(subject.developer, subject.name).toMatch(/\{what\}/)
      expect(subject.musician === null || (/\S/.test(subject.musician) && !subject.musician.includes('{what}')), subject.name).toBe(true)
    }
  })
  it('says what a refusal met, each cause of a conflict in its own words', () => {
    const names = id => id === '3cbedc9c' ? 'Mini Verb' : undefined
    expect(describeRefusal(3, { refusal: 3, kind: 2, what: 8, module: 0 })).toMatch(/^3 RUNTIME_CONFLICT: it needs base feature bits 0x8 that this base lacks\. It meets/)
    expect(describeSubject({ refusal: 3, kind: 3, what: 0x4012e39c, module: 0x3cbedc9c }, names)).toBe('its site at 0x4012e39c patches the same stock code as Mini Verb (3cbedc9c)')
    expect(describeSubject({ refusal: 3, kind: 4, what: 0x0200070f, module: 0x5a }, names)).toBe('it claims the DSP word Y:$70f that module 0000005a already holds')
    expect(describeSubject({ refusal: 9, kind: 1, what: 6, module: 0 })).toBe("it met the base's event at hook index 6")
    expect(describeSubject({ refusal: 3, kind: 0, what: 0, module: 0 })).toBe('')
    expect(describeSubject({ refusal: 3, kind: 9, what: 16, module: 1 })).toMatch(/cannot name \(kind 9, 0x10, module 00000001\)/)
    expect(describeRefusal(7, { refusal: 3, kind: 3, what: 0, module: 1 })).toMatch(/^7 RUNTIME_IN_USE: A track/) // another refusal's subject
    expect(describeRefusal(3, undefined)).toMatch(/^3 RUNTIME_CONFLICT: It meets/)
  })
})
