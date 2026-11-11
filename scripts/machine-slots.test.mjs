import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { availableMemory, holders, slotCount, takeSlot, workersFor } from './machine-slots.mjs'

const GB = 1024 ** 3
const goneProcess = () => Number(spawnSync(process.execPath, ['-e', 'process.stdout.write(String(process.pid))'], { encoding: 'utf8' }).stdout)
const quiet = { log: () => {}, poll: 10 }

describe('machine slots', () => {
  it('gives a laptop one slot and a large machine more', () => {
    expect(slotCount({ memory: 7.5 * GB, cores: 12, env: {} })).toBe(1)
    expect(slotCount({ memory: 4 * GB, cores: 2, env: {} })).toBe(1)
    expect(slotCount({ memory: 16 * GB, cores: 16, env: {} })).toBe(2)
    expect(slotCount({ memory: 64 * GB, cores: 8, env: {} })).toBe(2)
    expect(slotCount({ memory: 7.5 * GB, cores: 12, env: { MODWERK_SLOTS: '3' } })).toBe(3)
    expect(slotCount({ memory: 7.5 * GB, cores: 12, env: { MODWERK_SLOTS: '0' } })).toBe(0)
    expect(() => slotCount({ env: { MODWERK_SLOTS: 'many' } })).toThrow(/whole number/)
  })

  it('reads the memory Linux can still give, and fits workers to it', () => {
    expect(availableMemory('MemTotal: 7864320 kB\nMemFree: 100 kB\nMemAvailable: 3145728 kB\n')).toBe(3 * GB)
    // macOS: what the cache gives back counts, as vm_stat prints it (16 KB pages).
    expect(availableMemory(null, 'Mach Virtual Memory Statistics: (page size of 16384 bytes)\nPages free:    4995.\nPages active:    237388.\nPages inactive:    232076.\nPages speculative:    4669.\nPages wired down:    164926.\nPages purgeable:    2952.\n')).toBe(16384 * (4995 + 232076 + 4669 + 2952))
    expect(workersFor({ most: 4, each: GB, keep: GB, available: 3.5 * GB, cores: 12 })).toBe(2)
    expect(workersFor({ most: 4, each: GB, keep: GB, available: 0.5 * GB, cores: 12 })).toBe(1)
    expect(workersFor({ most: 4, each: GB, keep: GB, available: 64 * GB, cores: 2 })).toBe(2)
  })

  it('makes a second check wait until the first is done', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'slots-')), env = { MODWERK_SLOTS: '1' }
    const release = await takeSlot('first', { directory, env, ...quiet })
    expect(env.MODWERK_SLOT_HELD).toBe('1')
    expect(holders(directory).map(h => h.what)).toEqual(['first'])
    const waited = []
    let second = false
    const next = takeSlot('second', { directory, env: { MODWERK_SLOTS: '1' }, poll: 10, log: line => waited.push(line) }).then(done => { second = true; return done })
    await new Promise(done => setTimeout(done, 60))
    expect(second).toBe(false)
    expect(waited[0]).toMatch(/second: waiting for a free slot .*first in /)
    release()
    ;(await next)()
    expect(second).toBe(true)
    expect(holders(directory)).toEqual([])
  })

  it('takes none inside a check that holds one, on CI, or when slots are off', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'slots-'))
    for (const env of [{ MODWERK_SLOT_HELD: '1' }, { CI: 'true' }, { MODWERK_SLOTS: '0' }]) {
      ;(await takeSlot('nested', { directory, env, ...quiet }))()
      expect(holders(directory)).toEqual([])
    }
  })

  it('takes over a slot whose holder is gone, or never wrote itself down', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'slots-')), env = { MODWERK_SLOTS: '1' }
    mkdirSync(join(directory, 'slot-0'))
    writeFileSync(join(directory, 'slot-0', 'holder.json'), JSON.stringify({ pid: goneProcess(), what: 'crashed', since: 0 }))
    ;(await takeSlot('after a crash', { directory, env, ...quiet }))()
    mkdirSync(join(directory, 'slot-0'))
    const old = (Date.now() - 60000) / 1000
    utimesSync(join(directory, 'slot-0'), old, old)
    ;(await takeSlot('after a half-made slot', { directory, env: { MODWERK_SLOTS: '1' }, ...quiet }))()
    expect(holders(directory)).toEqual([])
  })
})
