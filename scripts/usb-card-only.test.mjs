import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { USB_CARD_ONLY_PATH, parseUsbCardOnly } from './retained-evidence.mjs'

const committed = JSON.parse(readFileSync(new URL('../' + USB_CARD_ONLY_PATH, import.meta.url), 'utf8'))
const record = { module: 'tuner', version: '0.1.0-experimental', approval: 'repeat98, 2 Nov 2026: card-only is fine for 0.1.0.', reason: 'waits on a base hook', until: '#1162' }
const file = modules => ({ schemaVersion: 1, about: 'Synthetic', modules })

describe('owner card-only records', () => {
  it('names Tuner 0.1.0 card-only until #1162 Stem Rec 0.1.0 until #1268 and Temp Save 0.1.0 until #1391, and nothing else', () => {
    expect(parseUsbCardOnly(committed).map(item => [item.module, item.version, item.until])).toEqual([['tuner', '0.1.0-experimental', '#1162'], ['stem-rec', '0.1.0-experimental', '#1268'], ['temp-save', '0.1.0-experimental', '#1391']])
  })
  it('refuses a record without the owner, a reason or an until pointer, an extra field, or a duplicate', () => {
    expect(parseUsbCardOnly(file([record]))).toEqual([record])
    for (const bad of [{ ...record, approval: 'timhastie, 2 Nov 2026: fine' }, { ...record, reason: ' ' }, { ...record, until: 'later' }, { ...record, versions: ['*'] }, Object.fromEntries(Object.entries(record).filter(([key]) => key !== 'until'))])
      expect(() => parseUsbCardOnly(file([bad]))).toThrow('malformed')
    expect(() => parseUsbCardOnly(file([record, record]))).toThrow('duplicate')
    expect(() => parseUsbCardOnly({ ...file([record]), waivers: [] })).toThrow('malformed')
  })
})
