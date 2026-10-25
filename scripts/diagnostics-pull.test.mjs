// SPDX-License-Identifier: Elastic-2.0
// Copyright (c) 2026 Jannik Aßfalg (repeat98)
import { describe, expect, it } from 'vitest'
import { members, pullAll, reportsByMember, summary, unitLines, when } from './diagnostics-pull.mjs'

const entry = (n, username = 'tester', data = { event: 'health', phase: 'ready' }) =>
  ({ eventId: 'e' + n, username, createdAt: new Date(Date.UTC(2026, 9, 15, 0, 0, n)).toISOString(), data })

describe('diagnostics pull', () => {
  it('pages from the last record of a full page and drops the overlap', async () => {
    const all = Array.from({ length: 700 }, (_, n) => entry(n))
    const asked = []
    const result = await pullAll(async since => {
      asked.push(since)
      return { events: all.filter(row => row.createdAt >= since).slice(0, 500), counts: [{ day: '2026-10-15', event: 'usb_sync_kept', count: 2 }] }
    }, '2026-09-15T00:00:00.000Z')
    expect(asked).toEqual(['2026-09-15T00:00:00.000Z', all[499].createdAt])
    expect(result.events).toHaveLength(700)
    expect(result.counts).toHaveLength(1)
  })
  it('stops when a full page cannot move the cursor', async () => {
    let calls = 0
    const same = Array.from({ length: 500 }, (_, n) => ({ ...entry(0), eventId: 'e' + n }))
    await pullAll(async () => { calls++; return { events: same, counts: [] } }, same[0].createdAt)
    expect(calls).toBe(1)
  })
  it('lists members and problems, newest first', () => {
    const failed = entry(5, 'other', { event: 'sync_failed', phase: 'sending', error: 'device', refusal: 3, modules: [{ id: 'poly8', catalogVersion: '0.3.0' }] })
    const text = summary({ events: [entry(1), failed, entry(9, 'tester', { event: 'selftest', phase: 'testing', result: 'ok' })], counts: [{ day: '2026-10-15', event: 'usb_sync_failed', count: 1 }] })
    expect(text).toContain('3 records from 2 members')
    expect(text).toContain(`@tester  last ${when(entry(9).createdAt)}\n  health 1, selftest 1`)
    expect(text).toContain('Self-test peaks are measured only while DSP modules run')
    expect(text).toContain('Problems (1, newest first')
    expect(text).toContain(`${when(failed.createdAt)} @other sync_failed sending error=device refusal=3 poly8@0.3.0`)
    expect(text).toContain('2026-10-15  failed 1')
  })
  it('counts restarts from the unit’s log and names what each boot’s restore did, once per change', () => {
    const base = 'a'.repeat(64)
    const start = (seq, boot) => ({ seq, boot, second: 0, kind: 'start', a: 0, cpu: 0, dsp1to4: 0, dsp5to8: 0, machines: [], fx: [], keys: [], screen: 0, tempo24: 0, playing: false })
    const health = (n, saved, savedCount, live) => entry(n, 'tester', { event: 'health', phase: 'ready', base, active: base, reading: { saved, savedCount, live } })
    const at = (n, event) => entry(n, 'tester', { event, phase: 'ready', base, active: base })
    const events = [at(1, 'connected'), health(2, 2, 0, 0), health(3, 7, 6, 6), at(4, 'connected'), health(5, 1, 6, 6),
      at(6, 'connected'), health(7, 1, 6, 6), at(8, 'connected'), health(9, 4, 0, 0),
      entry(10, 'tester', { event: 'device_log', phase: 'ready', log: { loads: [], incidents: [start(1, 5), start(4, 6), start(9, 7)] } })]
    const found = members(events).get('tester')
    // The first reading after each connection only; a repeat of the same result (a plain reconnect) is not listed again.
    expect(found.reloads.map(r => [r.at, r.saved])).toEqual([[entry(2).createdAt, 2], [entry(5).createdAt, 1], [entry(9).createdAt, 4]])
    expect(found.bases).toEqual([base])
    const text = summary({ events, counts: [] })
    expect(text).toContain("  restarts 2 (the unit's log, starts 5-7)")
    expect(text).toContain(`  set reloads at boot: ${when(entry(2).createdAt)} nothing saved, ${when(entry(5).createdAt)} RESTORED 6/6, ${when(entry(9).createdAt)} another base’s set`)
  })
  it('keeps the card build’s refused selections out of the problems', () => {
    const check = n => entry(n, 'tester', { event: 'build_failed', phase: 'preparing', buildKind: 'octatrack-firmware', error: 'selection' })
    const text = summary({ events: [check(1), check(2), entry(3, 'other', { event: 'build_failed', phase: 'building', buildKind: 'octatrack-base', error: 'build' })], counts: [] })
    expect(text).toContain('Problems (1, newest first')
    expect(text).toContain('Card-build checks that refused a selection (on every module change; not failures): @tester 2')
  })
  it('names each base against the site’s, the last self-test’s peaks and the member’s reports', () => {
    const old = 'a'.repeat(64), current = 'd'.repeat(64)
    const reading = { state: 3, failed: 64, ran: 3, cpu: 879, tracks1to4: 418, tracks5to8: 573 }
    const events = [entry(1, 'tester', { event: 'connected', phase: 'ready', base: old, active: old }),
      entry(2, 'tester', { event: 'selftest', phase: 'testing', base: current, reading }),
      entry(3, 'tester', { event: 'selftest', phase: 'testing', base: current, reading: { state: 2, failed: 0, ran: 0, cpu: 0, tracks1to4: 0, tracks5to8: 0 } })]
    const reports = reportsByMember([{ number: 646, title: '[poly8] freezes', state: 'OPEN', body: 'Reported on [Modwerk](https://modwerk.app/) by [tester](https://modwerk.app/forum/profile/tester/) · @repeat98' },
      { number: 1, title: 'no profile', state: 'OPEN', body: 'GitHub only' }])
    expect([...reports.keys()]).toEqual(['tester'])
    const text = summary({ events, counts: [] }, { base: current, reports })
    expect(text).toContain('base aaaaaaaa (older than the site’s dddddddd) → dddddddd (the site’s current base)')
    expect(text).toContain('  report #646 open: [poly8] freezes')
    expect(text).toContain('  last self-test passed, no DSP module ran')
    expect(text).toContain(`  highest self-test peaks ${when(entry(2).createdAt)}: CPU 87.9%, DSP T1-4 41.8%, T5-8 57.3%`)
  })
  it('shows live load, a stopped unit and the unit’s own log once each', () => {
    const freeze = { seq: 9, boot: 4, second: 125, kind: 'freeze', a: 13781, cpu: 950, dsp1to4: 400, dsp5to8: 500, machines: Array(24).fill(0),
      fx: [33, ...Array(15).fill(0)], keys: [...Array(14).fill(255), 0x28, 0x1c], screen: 0x400cbf2c, tempo24: 2880, playing: true }
    const load = { seq: 8, boot: 4, minute: 5, cpu: [400, 870], dsp1to4: [200, 250], dsp5to8: [300, 350], samples: 600, playing: 300 }
    const log = { loads: [load], incidents: [freeze] }
    const events = [entry(1, 'tester', { event: 'load', phase: 'ready', live: { samples: 10, cpu: [500, 940] } }),
      entry(2, 'tester', { event: 'unresponsive', phase: 'ready', reason: 'ui', live: { samples: 3 } }),
      entry(3, 'tester', { event: 'device_log', phase: 'ready', log }), entry(4, 'tester', { event: 'device_log', phase: 'ready', log })]
    const text = summary({ events, counts: [] })
    expect(text).toContain('live load')
    expect(text).toContain('CPU 50.0% mean, 94.0% peak')
    expect(text).toContain("unit's load log: 1 five-minute records, CPU peak 87.0%")
    expect(text.match(/unit: #9 start 4 \+2m5s freeze 5\.0 s, cpu 95\.0%/g)).toHaveLength(1)
    expect(text).toContain('playing at 120.0 BPM, screen 0x400cbf2c, keys 28 1c, fx 21 0')
    expect(text).toContain('unresponsive ready reason=ui')
  })
  it('names what a refused restore dropped', () => {
    const mods = ids => ids.map(id => ({ id, catalogVersion: '0.1.0' }))
    const events = [entry(1, 'tester', { event: 'connected', phase: 'ready' }),
      entry(2, 'tester', { event: 'health', phase: 'ready', reading: { saved: 7, savedCount: 3, live: 3 }, modules: mods(['miniverb', 'ring-sc', 'poly8']) }),
      entry(3, 'tester', { event: 'connected', phase: 'ready' }),
      entry(4, 'tester', { event: 'health', phase: 'ready', reading: { saved: 6, savedCount: 2, live: 2 }, modules: mods(['miniverb', 'poly8']) })]
    expect(summary({ events, counts: [] })).toContain('refused (missing ring-sc)')
  })
  it('names a restore’s refused package from its set record', () => {
    const set = { seq: 4, boot: 3, second: 5, kind: 'set', a: 1, cpu: 0, dsp1to4: 0, dsp5to8: 0, machines: [0x3c, 0xbe, 0xdc, 0x9c, ...Array(20).fill(0)],
      fx: Array(16).fill(0), keys: Array(16).fill(0), screen: 0x773c84aa, tempo24: 5, playing: false }
    expect(unitLines([set])[0]).toContain('1 installed: Mini Verb; refused Ringmod SC (busy)')
  })
  it('calls a stall found at a start on another base an OS upgrade, and one on the same base nothing', () => {
    const at = (seq, boot, kind, a = 0) => ({ seq, boot, second: 0, kind, a, cpu: 0, dsp1to4: 0, dsp5to8: 0, machines: Array(24).fill(0),
      fx: Array(16).fill(0), keys: Array(16).fill(255), screen: 0, tempo24: 0, playing: false })
    const lines = unitLines([at(1, 1, 'base', 0xb5fae2ae), at(2, 2, 'base', 0x049efc39), at(3, 2, 'stall', 1), at(4, 3, 'base', 0x049efc39), at(5, 3, 'stall', 1)])
    expect(lines.filter(l => l.includes('stall'))).toEqual([
      '  unit: #3 start 2 +0m0s stall reason 1 (an OS upgrade: this start runs another base; not a hang)', '  unit: #5 start 3 +0m0s stall reason 1'])
  })
  it('keeps an earlier log apart from the one a new base restarts at start 1', () => {
    const at = (seq, boot, kind, a = 0, more = {}) => ({ seq, boot, second: 60 * seq, kind, a, cpu: 0, dsp1to4: 0, dsp5to8: 0, machines: Array(24).fill(0),
      fx: Array(16).fill(0), keys: Array(16).fill(255), screen: 0, tempo24: 2880, playing: false, ...more })
    const log = (n, base, incidents) => entry(n, 'tester', { event: 'device_log', phase: 'ready', base, log: { loads: [], incidents } })
    const old = 'a'.repeat(64), next = 'b'.repeat(64)
    const events = [log(1, old, [at(1, 1, 'start'), at(2, 2, 'start'), at(3, 3, 'start')]), log(2, old, [at(4, 3, 'hot', 2, { cpu: 920 })]),
      log(3, old, [at(4, 3, 'hot', 2, { cpu: 920 }), at(5, 4, 'start')]), // sent again by another browser: the same log
      log(4, next, [at(1, 1, 'start'), at(2, 1, 'base', 0xbbbbbbbb), at(3, 1, 'set')]), log(5, next, [at(4, 2, 'start'), at(5, 2, 'base', 0xbbbbbbbb)])]
    const text = summary({ events, counts: [] })
    expect(text).toContain("  restarts 3 (the unit's earlier log, from base aaaaaaaa, starts 1-4)\n  restarts 1 (the unit's log, from base bbbbbbbb, starts 1-2)")
    expect(text).toContain('  unit: #4 start 3 +4m0s hot (2 half-seconds at 90 %+), cpu 92.0%')
    expect(text).toContain('machines ' + Array(24).fill(0).join(' ') + ' (an earlier log, base aaaaaaaa)\n  unit: #2 start 1 +2m0s base bbbbbbbb\n')
  })
  it('calls a stall after a stopped PROJ … RIGHT YES walk at 95 %+ with nothing installed likely an OS upgrade or USB disk mode', () => {
    const at = (seq, boot, kind, a = 0, more = {}) => ({ seq, boot, second: 0, kind, a, cpu: 0, dsp1to4: 0, dsp5to8: 0, machines: Array(24).fill(0),
      fx: Array(16).fill(0), keys: Array(16).fill(255), screen: 0, tempo24: 0, playing: false, ...more })
    const walk = [...Array(12).fill(255), 0x1c, 0x20, 0x21, 0x31]
    const run = (set, hot) => unitLines([at(1, 1, 'start'), at(2, 1, 'base', 0xcd39c494), at(3, 1, 'set', set), at(4, 1, 'hot', 2, { cpu: 1000, keys: walk, ...hot }),
      at(5, 2, 'start'), at(6, 2, 'base', 0xcd39c494), at(7, 2, 'stall', 1)]).at(-1)
    expect(run(0)).toBe('  unit: #7 start 2 +0m0s stall reason 1 (likely an OS upgrade or USB disk mode, beta finding 72: the session before ended stopped at 95 %+ CPU after PROJ … RIGHT YES, no module installed)')
    expect(run(0, { keys: [...Array(14).fill(0x20), 0x21, 0x31] })).toContain('likely') // PROJ has left the 16 keys the unit keeps
    for (const [set, hot] of [[1], [0, { playing: true }], [0, { cpu: 940 }], [0, { keys: [...Array(14).fill(255), 0x21, 0x31] }]]) expect(run(set, hot)).toBe('  unit: #7 start 2 +0m0s stall reason 1')
  })
})
