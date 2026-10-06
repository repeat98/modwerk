import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import stock from '../engine/assets/stock-dsp-metadata.json'
import { COMPARED_BEFORE_RECORDS, NOT_COMPOSED, comparisonPool, coverageSelections, selectionKey } from '../../scripts/module-coverage.mjs'
import { moduleNativeSourceSha256 } from '../../scripts/module-qualification.mjs'
import { AVAILABLE_MODULES } from './availability'
import { MODULE_DOCUMENTS_BY_ID } from './documents'
import { CATALOG_SOURCE } from './modules'


describe('native comparison records', () => {
  it('has a native comparison of the current code for every offered module', async () => {
    const pool = comparisonPool(AVAILABLE_MODULES.map(module => module.id))
    for (const module of AVAILABLE_MODULES) {
      if (NOT_COMPOSED.includes(module.id)) continue   // builds only on its own; its standalone parity is checked separately
      const document = MODULE_DOCUMENTS_BY_ID[module.id]
      const code = await moduleNativeSourceSha256(fileURLToPath(new URL('../../sdk/octabam/modules/' + module.id, import.meta.url)), document)
      const path = fileURLToPath(new URL('../../sdk/native-comparisons/' + module.id + '.json', import.meta.url))
      const hint = module.id + ': run npm run module:verify -- ' + module.id + ' --os <your OCTATRACK_OS1.40C.bin> (docs/ADD_A_MODULE.md, step 5)'
      if (!existsSync(path)) { expect(COMPARED_BEFORE_RECORDS[module.id], hint).toBe(code); continue }
      const record = JSON.parse(readFileSync(path, 'utf8'))
      expect([record.moduleId, record.revision, record.originalOsSha256]).toEqual([module.id, CATALOG_SOURCE.revision, stock.sourceSha256])
      expect(record.moduleSourceSha256, hint).toBe(code)
      // The pool can grow later: each newer module's own record covers it beside this one.
      expect(record.pool.every((id: string) => pool.includes(id) || MODULE_DOCUMENTS_BY_ID[id]), module.id).toBe(true)
      expect(record.selections.map((row: { moduleIds: string[]; keepStockFx2: boolean }) => selectionKey(row.moduleIds, row.keepStockFx2)))
        .toEqual(coverageSelections(module.id, record.pool).map(({ ids, keepStockFx2 }) => selectionKey(ids, keepStockFx2)))
      expect(record.summary.mismatches).toBe(0)
      expect(record.selections.every((row: { result: string }) => ['identical', 'masked', 'refused'].includes(row.result))).toBe(true)
    }
  })
})

describe('coverage sets', () => {
  it('compare a module alone, beside each other module and in the fullest selections, with and without stock FX2', () => {
    const pool = ['a', 'b', 'c', 'd', 'analog-bassdrum']
    const sets = new Set(coverageSelections('a', pool, { sample: 2 }).map(row => row.ids.join('+') + ':' + row.keepStockFx2))
    for (const ids of ['a', 'a+b', 'a+c', 'a+d', 'a+analog-bassdrum', 'a+b+c+d', 'a+c+d', 'a+b+d', 'a+b+c']) for (const keep of [true, false]) expect(sets).toContain(ids + ':' + keep)
    expect([...sets].filter(key => key.includes('analog-bassdrum'))).toEqual(['a+analog-bassdrum:true', 'a+analog-bassdrum:false'])
    expect(coverageSelections('a', pool)).toEqual(coverageSelections('a', pool))
    expect(() => coverageSelections('z', pool)).toThrow('not in the comparison pool')
  })
})
