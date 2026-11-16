import { describe, expect, it } from 'vitest'
import { line, unreviewed } from './stock-branches.mjs'

const site = { addr: 0x40001000, length: 8, owner: 'mymod (a detour)' }
const entry = { site, target: 0x40001006, from: 0x40000ffe, how: 'branch', flow: 'bra' }

describe('the reviewed list of stock entries', () => {
  it('leaves an entry open until a row names its site, target and source', () => {
    expect(unreviewed([entry], [])).toEqual({ open: [entry], stale: [] })
    expect(unreviewed([entry], [{ site: '0x40001000', target: '0x40001006', from: '0x40000ffe', reason: 'data' }]).open).toEqual([])
  })
  it('names a row nothing meets any more, so the list stays exact', () => {
    const row = { site: '0x40002000', target: '0x40002004', from: '0x40003000', reason: 'data' }
    expect(unreviewed([entry], [row])).toEqual({ open: [entry], stale: [row] })
  })
  it('says who owns the site, where stock enters and how far in', () => {
    expect(line(entry)).toBe('0x40001000+8 mymod (a detour): stock code at 0x40000ffe branches to 0x40001006, 6 bytes into the site')
    expect(line({ ...entry, how: 'pointer', flow: 'pointer', from: 0x400d0000 })).toBe('0x40001000+8 mymod (a detour): a table or pointer word at 0x400d0000 holds 0x40001006, 6 bytes into the site')
  })
})
