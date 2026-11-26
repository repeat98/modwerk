import { readdirSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { testDatabase } from './test-server'
import { USAGE_DEVICES } from './usage-contract'
import { DIGI_DOWNLOADS_ENABLED } from '../engine/elekloader/protocol'

describe('machine attribution coverage', () => {
  it('covers every local builder without changing its download approval', () => {
    expect([...USAGE_DEVICES].sort()).toEqual(['octatrack', ...Object.keys(DIGI_DOWNLOADS_ENABLED)].sort())
    expect(DIGI_DOWNLOADS_ENABLED['digitakt-ii']).toBe(false)
    expect(DIGI_DOWNLOADS_ENABLED['analog-rytm-mkii']).toBe(true)
    expect(DIGI_DOWNLOADS_ENABLED['digitone-ii']).toBe(false)
  })
  it('preserves legacy rows while expanding the SQLite constraint', () => {
    const { db } = testDatabase()
    try {
      const old = readFileSync(new URL('../../migrations/0042_usage_breakdowns.sql', import.meta.url), 'utf8')
      const schema = old.match(/CREATE TABLE usage_device_daily \([\s\S]*?\);/)![0]
      db.exec('DROP TABLE usage_device_daily;' + schema)
      db.prepare("INSERT INTO usage_device_daily(day,device,builds,builds_failed,downloads) VALUES('2026-10-01','octatrack',12,2,9)").run()
      db.exec(readFileSync(new URL('../../migrations/0083_usage_machine_coverage.sql', import.meta.url), 'utf8'))
      db.exec(readFileSync(new URL('../../migrations/0104_usage_model_cycles.sql', import.meta.url), 'utf8'))
      expect(db.prepare('SELECT * FROM usage_device_daily').all()).toEqual([{ day: '2026-10-01', device: 'octatrack', builds: 12, builds_failed: 2, downloads: 9 }])
      for (const device of USAGE_DEVICES.filter(device => device !== 'digitone-ii')) db.prepare("INSERT INTO usage_device_daily(day,device) VALUES('2026-10-02',?)").run(device)
      expect(() => db.prepare("INSERT INTO usage_device_daily(day,device) VALUES('2026-10-02','digitone-ii')").run()).toThrow()
      db.prepare("UPDATE usage_device_daily SET builds=3,builds_failed=1,downloads=2 WHERE day='2026-10-02' AND device='analog-rytm-mkii'").run()
      const before = db.prepare('SELECT * FROM usage_device_daily ORDER BY day,device').all()
      db.exec(readFileSync(new URL('../../migrations/0102_usage_digitone_ii.sql', import.meta.url), 'utf8'))
      expect(db.prepare('SELECT * FROM usage_device_daily ORDER BY day,device').all()).toEqual(before)
      db.prepare("INSERT INTO usage_device_daily(day,device,builds) VALUES('2026-10-03','digitone-ii',1)").run()
      expect(db.prepare("SELECT builds FROM usage_device_daily WHERE device='digitone-ii'").all()).toEqual([{ builds: 1 }])
      expect(() => db.prepare("INSERT INTO usage_device_daily(day,device) VALUES('2026-10-03','unknown')").run()).toThrow()
    } finally { db.close() }
  })
  it('keeps every machine in the latest rebuild of the table, whichever migration lands last', () => {
    // Two branches each widened the closed list for their own machine (0102 Digitone II, 0104 Model:Cycles). Deploy applies
    // the later number even after the earlier one, so the last rebuild must still list every machine the site counts.
    const folder = new URL('../../migrations/', import.meta.url)
    const checks = readdirSync(folder).filter(name => name.endsWith('.sql')).sort()
      .map(name => /CREATE TABLE usage_device_daily\w* \([\s\S]*?CHECK\(device IN \(([^)]*)\)\)/.exec(readFileSync(new URL(name, folder), 'utf8'))?.[1])
      .filter((list): list is string => Boolean(list))
    const latest = checks.at(-1)!.split(',').map(value => value.trim().replace(/^'|'$/g, ''))
    expect(latest).toEqual(expect.arrayContaining([...USAGE_DEVICES]))
  })
})
