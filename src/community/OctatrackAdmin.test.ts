import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import baseBinding from '../../sdk/machines/octatrack/base-binding.json'
import { OctatrackAdminReport, baseName } from './OctatrackAdmin'
import type { AdminOctatrack } from './admin-octatrack-contract'

const current = baseBinding.identity, previous = '500cdb6fd81bfc9c2b18737e7487f3ec2264c1c00c5ebef833e7f751e325d1b7', older = 'f'.repeat(64)
const daily = Array.from({ length: 30 }, (_, index) => ({ day: new Date(Date.UTC(2026, 9, 14 + index)).toISOString().slice(0, 10), installs: index === 29 ? 2 : 0, started: index >= 23 ? 4 : 0, kept: index >= 23 ? 3 : 0, undone: 0, failed: index === 29 ? 1 : 0 }))
const data: AdminOctatrack = { generatedAt: '2026-11-12T12:00:00Z', from: daily[0].day, to: daily[29].day, installs: { total: 69, today: 2, last7: 22 },
  sharing: { members: 79, membersCurrent: 70, membersNew: 14, membersReporting: 52, guests: 4, guestsNew: 4, guestsReporting: 4 },
  bases: [{ base: current, people: 15, lastSeen: '2026-11-12T11:00:00Z' }, { base: previous, people: 2, lastSeen: '2026-11-11T15:00:00Z' }, { base: older, people: 3, lastSeen: '2026-10-20T09:00:00Z' }],
  daily, health: { syncFailures: [{ key: 'transport', count: 40, people: 12 }], buildFailures: [], linkFailures: [{ key: 'claim-failed', count: 46, people: 3 }], linkClients: [{ key: 'chrome · windows', count: 46, people: 3 }],
    deviceIncidents: [{ key: 'set', count: 1082, people: 38 }, { key: 'hot', count: 418, people: 39 }, { key: 'start', count: 607, people: 44 }], unresponsive: [] } }
const render = (value: AdminOctatrack, metric: 'installs' | 'started' = 'installs') => renderToStaticMarkup(createElement(OctatrackAdminReport, { data: value, loading: false, error: '', refresh: null, metric, onMetric: () => {}, selectedDay: '', onSelectDay: () => {} }))

describe('admin Octatrack report', () => {
  it('names current, previous and older bases from the site’s own base list', () => {
    expect(baseName(current).kind).toBe('current')
    expect(baseName(previous)).toEqual({ kind: 'previous', label: 'Previous · USB Audio · Tracks + Main + Cue' })
    expect(baseName(older).kind).toBe('older')
  })
  it('shows installs, sharing, the current-base share and the sync keep rate', () => {
    const html = render(data)
    expect(html).toContain('Members on the base</dt><dd>69</dd><small>2 new today · 22 in 7 days')
    expect(html).toContain('<dd>83</dd><small>79 members · 4 visitors · 56 sent reports in 30 days')
    expect(html).toContain('9 members on an earlier consent text')
    expect(html).toContain('<dd>75%</dd><small>15 of 20 sharers')
    expect(html).toContain('<dd>75%</dd><small>21 kept of 28 syncs started')
    expect(html).toContain('Older or development base <code>ffffffff</code>')
    expect(html).toContain('Load at 90% or more')
    expect(html).toContain('Routine records: 1,082 set changes · 607 starts')
    expect(html).toContain('None in 30 days') // no build failures
    expect(html).not.toMatch(/NaN|undefined|Infinity/)
  })
  it('never divides by zero without data', () => {
    const empty = { ...data, bases: [], daily: daily.map(row => ({ ...row, installs: 0, started: 0, kept: 0, failed: 0 })), health: { ...data.health, deviceIncidents: [] } }
    const html = render(empty, 'started')
    expect(html).toContain('<dd>—</dd>')
    expect(html).toContain('No sharer reported a base in 30 days.')
    expect(html).toContain('No problems logged in 30 days')
    expect(html).not.toMatch(/NaN|undefined|Infinity/)
  })
})
