// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { knownBase, lastBaseDownload, rememberBaseDownload } from './base-download'

afterEach(() => localStorage.clear())
const seen = (base: string, at: string) => localStorage.setItem('modwerk.octatrack.last-seen', JSON.stringify({ [base]: { moduleIds: [], removedStockFx: [], at } }))

describe('the base this browser knows', () => {
  it('knows none before a download or a USB read', () => { expect(knownBase()).toBeUndefined() })
  it('remembers the last base .bin downloaded', () => {
    rememberBaseDownload('aa', '2026-11-18T09:00:00.000Z')
    expect(lastBaseDownload()).toEqual({ base: 'aa', at: '2026-11-18T09:00:00.000Z' }); expect(knownBase()).toEqual({ base: 'aa', from: 'download' })
  })
  it('takes whichever is newer, the download or the base read over USB', () => {
    seen('unit', '2026-11-10T09:00:00.000Z'); rememberBaseDownload('download', '2026-11-18T09:00:00.000Z')
    expect(knownBase()).toEqual({ base: 'download', from: 'download' })
    seen('unit', '2026-11-19T09:00:00.000Z')
    expect(knownBase()).toEqual({ base: 'unit', from: 'unit' })
  })
  it('ignores a damaged record', () => {
    localStorage.setItem('modwerk.octatrack.base-download', '{"base":1}'); expect(lastBaseDownload()).toBeUndefined()
    localStorage.setItem('modwerk.octatrack.base-download', 'not json'); expect(knownBase()).toBeUndefined()
  })
})
