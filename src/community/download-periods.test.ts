import { DatabaseSync } from 'node:sqlite'
import { afterEach, describe, expect, it } from 'vitest'
import { moduleStatistics } from '../../server/module-statistics'
import { testDatabase } from './test-server'
import { compareModules, downloadPeriod, downloadsIn, MODULE_SORT_VALUES, periodCoverage, sortOption, type ModuleStatistics } from './module-statistics'
import { parseCatalogBrowse } from '../catalog/catalog-browse'

const databases: DatabaseSync[] = []
afterEach(() => { for (const db of databases.splice(0)) db.close() })

describe('most downloaded over a period', () => {
  it('counts whole UTC days, today included, for 7, 30 and 90 days beside all time', async () => {
    const f = testDatabase(); databases.push(f.db)
    f.db.exec("INSERT OR REPLACE INTO module_download_meta(key,value) VALUES('daily_started','2026-10-06T21:44:12.660Z')")
    f.db.exec("INSERT INTO module_downloads(module_id,downloads) VALUES('miniverb',100)")
    // Day 1 is today: 7 days reach back to 2026-11-12, 30 to 2026-10-20, 90 to 2026-08-21.
    f.db.exec("INSERT INTO module_downloads_daily(day,module_id,downloads) VALUES('2026-11-18','miniverb',1),('2026-11-12','miniverb',2),('2026-11-11','miniverb',4),('2026-10-20','miniverb',8),('2026-10-19','miniverb',16),('2026-08-20','miniverb',32)")
    const row = (await moduleStatistics(f.adapter, new Date('2026-11-18T10:00:00Z'))).find(item => item.module_id === 'miniverb')!
    expect(row).toMatchObject({ downloads: 100, downloads7: 3, downloads30: 15, downloads90: 31, dailyStarted: '2026-10-06T21:44:12.660Z' })
    expect((await moduleStatistics(f.adapter)).find(item => item.module_id === 'vector')).toMatchObject({ downloads7: 0, downloads30: 0, downloads90: 0 })
  })

  it('orders by the chosen period and shows every period as Most downloaded', () => {
    const modules = [{ id: 'a', name: 'Alpha', authorName: 'Amy' }, { id: 'b', name: 'Beta', authorName: 'Amy' }, { id: 'c', name: 'Gamma', authorName: 'Amy' }]
    const stats = (id: string, downloads: number, downloads7: number, downloads30: number): ModuleStatistics => ({ module_id: id, average: 0, count: 0, likes: 0, downloads, downloads7, downloads30, downloads90: downloads30, downloadsStarted: null })
    const statistics = [stats('a', 90, 1, 5), stats('b', 10, 6, 6), stats('c', 50, 6, 40)]
    const order = (sort: string) => [...modules].sort((x, y) => compareModules(x, y, sort, statistics)).map(module => module.id)
    expect(order('downloaded')).toEqual(['a', 'c', 'b'])
    expect(order('downloaded-30')).toEqual(['c', 'b', 'a'])
    expect(order('downloaded-7')).toEqual(['b', 'c', 'a'])
    expect([downloadPeriod('downloaded'), downloadPeriod('downloaded-90'), downloadPeriod('liked')]).toEqual([0, 90, undefined])
    expect(sortOption('downloaded-7').label).toBe('Most downloaded')
    expect(downloadsIn(statistics[2], 30)).toBe(40)
    // A cached answer from before period counts shows a dash, not a zero.
    expect(downloadsIn({ ...statistics[2], downloads7: undefined }, 7)).toBeUndefined()
  })

  it('says when daily counts began inside the window', () => {
    const now = Date.parse('2026-11-18T10:00:00Z')
    expect(periodCoverage(30, '2026-10-06T21:44:12Z', now)).not.toMatch(/began/)
    expect(periodCoverage(90, '2026-10-06T21:44:12Z', now)).toMatch(/last 90 days \(daily counts began/)
  })

  it('restores a period sort from the saved browse', () => {
    expect(MODULE_SORT_VALUES).toContain('downloaded-30')
    expect(parseCatalogBrowse(JSON.stringify({ route: 'library', query: '', family: 'all', sort: 'downloaded-30', ids: [] }))?.sort).toBe('downloaded-30')
    expect(parseCatalogBrowse(JSON.stringify({ route: 'library', query: '', family: 'all', sort: 'downloaded-365', ids: [] }))).toBeNull()
  })
})
