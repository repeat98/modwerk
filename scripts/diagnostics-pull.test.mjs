// SPDX-License-Identifier: Elastic-2.0
// Copyright (c) 2026 Jannik Aßfalg (repeat98)
import { describe, expect, it } from 'vitest'
import { members, pullAll, reportsByMember, summary, unitLines, when } from './diagnostics-pull.mjs'

const entry = (n, username = 'tester', data = { event: 'health', phase: 'ready' }) =>
  ({ eventId: 'e' + n, username, createdAt: new Date(Date.UTC(2026, 9, 15, 0, 0, n)).toISOString(), data })

describe('diagnostics pull', () => {
  it('prints the staging command, byte offset and measured residual, including zero', () => {
    const failure = { event: 'sync_failed', phase: 'sending', step: 'stage', error: 'transport' }
    const events = [{command: 'chunk', chunkOffset: 0, remainingBytes: 0}, {command: 'verify'}]
      .map((upload, i) => entry(i, 'tester', {...failure, upload}))
    const text = summary({events, counts: []})
    expect(text).toContain('command=chunk chunkOffset=0 remainingBytes=0')
    expect(text).toMatch(/command=verify($|\n)/)
  })
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
  it('shows how a disconnected trial ended in Problems', () => {
    const event = entry(1, 'tester', { event: 'sync_failed', phase: 'trial', error: 'disconnected', step: 'trial', reconnect: 'closed' })
    expect(summary({ events: [event], counts: [] }).split('Problems (')[1]).toContain('error=disconnected step=trial reconnect=closed')
  })
  it('lists failures before a USB connection with the reported reason and optional client', () => {
    const link = (n, failure, client) => entry(n, 'tester', { event: 'link_failed', phase: 'idle', failure, client })
    const text = summary({ events: [link(1, 'no-device'), entry(2), link(3, 'claim-failed', { browser: 'chrome', major: 150, os: 'linux' })], counts: [] })
    const problems = text.split('Problems (')[1]
    expect(problems.split('\n').slice(0, 3)).toEqual([
      '2, newest first, up to 30):',
      `  ${when(entry(3).createdAt)} @tester link_failed idle failure=claim-failed chrome 150/linux`,
      `  ${when(entry(1).createdAt)} @tester link_failed idle failure=no-device`,
    ])
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
  it('reports card write failures after Keep and skips repeat readings of the same failure', () => {
    const health = (n, saved) => entry(n, 'tester', { event: 'health', phase: 'ready', reading: { saved, savedCount: 3, live: 3 } })
    const events = [
      entry(1, 'tester', { event: 'kept', phase: 'ready' }),
      health(2, 7), health(3, 8), health(4, 8), health(5, 7), health(6, 8), health(7, 9),
    ]
    const text = summary({ events: [...events].reverse(), counts: [] })
    expect(text).toContain('Problems (3, newest first')
    const problems = text.split('Problems (')[1].split('\n').slice(1, 4)
    expect(problems).toEqual([
      `  ${when(entry(7).createdAt)} @tester health ready card=too big`,
      `  ${when(entry(6).createdAt)} @tester health ready card=save failed`,
      `  ${when(entry(3).createdAt)} @tester health ready card=save failed`,
    ])
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
    const post = 'e'.repeat(64)
    expect(summary({ events: [...events, entry(4, 'tester', { event: 'connected', phase: 'ready', base: post, active: post })], counts: [] }, { base: current, layouts: { 'tracks-main-cue': current, 'tracks-post': post } }))
      .toContain('→ eeeeeeee (the site’s current base, tracks-post layout)')
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
  it('names the stall record’s report words that help triage', () => {
    const report = Array.from({ length: 85 }, (_, i) => i) // synthetic: each word is its own index
    report[66] = 973 // cpu, per mille
    const text = summary({ events: [entry(1, 'tester', { event: 'device_log', phase: 'ready', log: { loads: [], incidents: [], stall: { count: 2, reason: 1, ticks: 400, report } } })], counts: [] })
    expect(text).toContain('  stall record 2: reason 1 (1 frames stopped, 2 eDMA refused) at tick 400\n' +
      '    report: frames 1, watchTicks 15, rejected0 8, rejected1 9, errors 10, edmaErrors 42, missed 59, setModules 64, cpu 97.3%\n')
    expect(summary({ events: [entry(1, 'tester', { event: 'device_log', phase: 'ready', log: { loads: [], incidents: [], stall: { count: 1, reason: 2, ticks: 9, report: [11, 5] } } })], counts: [] }))
      .toContain('at tick 9\n    report: frames 5\n') // a short report names what it holds
  })
  it('names what a refused restore dropped', () => {
    const mods = ids => ids.map(id => ({ id, catalogVersion: '0.1.0' }))
    const events = [entry(1, 'tester', { event: 'connected', phase: 'ready' }),
      entry(2, 'tester', { event: 'health', phase: 'ready', reading: { saved: 7, savedCount: 3, live: 3 }, modules: mods(['miniverb', 'ring-sc', 'poly8']) }),
      entry(3, 'tester', { event: 'connected', phase: 'ready' }),
      entry(4, 'tester', { event: 'health', phase: 'ready', reading: { saved: 6, savedCount: 2, live: 2 }, modules: mods(['miniverb', 'poly8']) })]
    expect(summary({ events, counts: [] })).toContain('refused (missing ring-sc)')
    // A base with RESTORE names every module it left out and why, instead of the guess.
    events.push(entry(5, 'tester', { event: 'connected', phase: 'ready' }),
      entry(6, 'tester', { event: 'health', phase: 'ready', reading: { saved: 10, savedCount: 3, live: 1 }, modules: mods(['poly8']),
        restore: [{ id: 'miniverb', refusal: 0x100, check: 0 }, { id: 'other', refusal: 2, check: 1 }] }))
    expect(summary({ events, counts: [] })).toContain('left out after a failed start (left out miniverb: the last start crashed or froze loading it, other: module memory)')
  })
  it('reports a full set incident as a lower bound because the log holds fourteen IDs', () => {
    const set = { seq: 1, boot: 1, second: 0, kind: 'set', screen: 0, tempo24: 0,
      machines: Array(24).fill(1), fx: Array(16).fill(2), keys: Array(16).fill(3) }
    expect(unitLines([{ ...set, a: 13 }])[0]).toContain('set 13 installed:')
    expect(unitLines([{ ...set, a: 14 }])[0]).toContain('set at least 14 installed:')
  })
  it('names a restore’s refused package from its set record', () => {
    const set = { seq: 4, boot: 3, second: 5, kind: 'set', a: 1, cpu: 0, dsp1to4: 0, dsp5to8: 0, machines: [0x3c, 0xbe, 0xdc, 0x9c, ...Array(20).fill(0)],
      fx: Array(16).fill(0), keys: Array(16).fill(0), screen: 0x773c84aa, tempo24: 5, playing: false }
    expect(unitLines([set])[0]).toContain('1 installed: Mini Verb; refused SC Ringmod (busy)')
    // Base 0.7.10 adds the loader's check that refused it and the module pool then, in 16-byte units.
    expect(unitLines([{ ...set, tempo24: 2, dsp1to4: 2, cpu: 10084, dsp5to8: 39068 }])[0])
      .toContain('refused SC Ringmod (module memory, by its DSP claims meeting a delay buffer, module memory 158 KiB used, largest free block 610.4 KiB)')
    expect(unitLines([{ ...set, tempo24: 2, dsp1to4: 1, cpu: 48640, dsp5to8: 96 }])[0])
      .toContain('refused SC Ringmod (module memory, by the module pool, module memory 760 KiB used, largest free block 1.5 KiB)')
  })
  it('names the USB Audio package in both the installed list and a refused restore', () => {
    const set = { seq: 1, boot: 1, second: 0, kind: 'set', a: 1,
      machines: [0xb1, 0x28, 0x8f, 0x29], fx: [], keys: [], screen: 0, tempo24: 0 }
    expect(unitLines([set])[0]).toContain('1 installed: USB Audio')
    expect(unitLines([{ ...set, a: 0, screen: 0xb1288f29, tempo24: 5 }])[0]).toContain('refused USB Audio (busy)')
  })
  it('calls a stall found at a start on another base an OS upgrade, and one on the same base nothing', () => {
    const at = (seq, boot, kind, a = 0) => ({ seq, boot, second: 0, kind, a, cpu: 0, dsp1to4: 0, dsp5to8: 0, machines: Array(24).fill(0),
      fx: Array(16).fill(0), keys: Array(16).fill(255), screen: 0, tempo24: 0, playing: false })
    const lines = unitLines([at(1, 1, 'base', 0xb5fae2ae), at(2, 2, 'base', 0x049efc39), at(3, 2, 'stall', 1), at(4, 3, 'base', 0x049efc39), at(5, 3, 'stall', 1)])
    expect(lines.filter(l => l.includes('stall'))).toEqual([
      '  unit: #3 start 2 +0m0s stall reason 1 (an OS upgrade: this start runs another base; not a hang)', '  unit: #5 start 3 +0m0s stall reason 1'])
  })
  it('calls a stopped freeze until a restart before a start on another base an OS upgrade, and no other freeze', () => {
    const at = (seq, boot, kind, a = 0, more = {}) => ({ seq, boot, second: 0, kind, a, cpu: 0, dsp1to4: 0, dsp5to8: 0, machines: Array(24).fill(0),
      fx: Array(16).fill(0), keys: Array(16).fill(255), screen: 0, tempo24: 0, playing: false, ...more })
    const note = ' (an OS upgrade: the next start runs another base; not a hang)'
    // diag.c adds the freeze at the next start but keeps the boot it happened in: starts 1 and 3 froze before a new base, 2 and 4 did not.
    const lines = unitLines([at(1, 1, 'base', 0xb5fae2ae), at(2, 2, 'base', 0x049efc39), at(3, 1, 'freeze'), at(4, 2, 'freeze'), at(5, 3, 'base', 0x049efc39),
      at(6, 4, 'base', 0x27c9d36f), at(7, 3, 'freeze', 0, { playing: true }), at(8, 3, 'freeze', 25919), at(9, 3, 'freeze'), at(10, 4, 'freeze')])
    expect(lines.filter(l => l.includes('freeze')).map(l => [l.match(/#(\d+)/)[1], l.endsWith(note)])).toEqual(
      [['3', true], ['4', false], ['7', false], ['8', false], ['9', true], ['10', false]])
  })
  it('calls a stopped freeze after PROJ … YES YES before a start on the same base a likely OS upgrade of that base', () => {
    const walk = [...Array(12).fill(255), 0x1c, 0x20, 0x31, 0x31], other = [...Array(12).fill(255), 0x1c, 0x20, 0x31, 0x32]
    const at = (seq, boot, kind, a = 0, more = {}) => ({ seq, boot, second: 0, kind, a, cpu: 0, dsp1to4: 0, dsp5to8: 0, machines: Array(24).fill(0),
      fx: Array(16).fill(0), keys: walk, screen: 0, tempo24: 0, playing: false, ...more })
    const note = ' (likely an OS upgrade of the same base: PROJ … YES YES before it; not a hang)'
    const lines = unitLines([at(1, 1, 'base', 0x049efc39), at(2, 2, 'base', 0x049efc39), at(3, 1, 'freeze'), at(4, 1, 'freeze', 0, { keys: other }),
      at(5, 1, 'freeze', 0, { playing: true }), at(6, 1, 'freeze', 25919), at(7, 2, 'freeze')])
    expect(lines.filter(l => l.includes('freeze')).map(l => [l.match(/#(\d+)/)[1], l.endsWith(note)])).toEqual(
      [['3', true], ['4', false], ['5', false], ['6', false], ['7', false]])
  })
  it.each([
    [0x3ffffffe, false], [0x40000000, true], [0x40fffffc, true], [0x41000000, false],
  ])('only prints instruction bytes the crash handler captured at PC %i', (pc, captured) => {
    const crash = { count: 1, vector: 4, pc, code: [0x12345678], memory: [0x87654321] }
    const events = [entry(1, 'tester', { event: 'device_log', log: { crash } })]
    const text = summary({ events, counts: [] })
    expect(text).toContain(`crash record 1: vector 4 pc 0x${pc.toString(16)}`)
    if (captured) expect(text).toContain('code 12345678 uncached 87654321')
    else {
      expect(text).toContain('instruction bytes unavailable (PC outside SDRAM)')
      expect(text).not.toMatch(/12345678|87654321/)
    }
  })
  it('names a crash incident’s program counter from the symbols kept for its base, and from no other base’s', () => {
    const at = (seq, kind, a) => ({ seq, boot: 1, second: 0, kind, a, cpu: 0, dsp1to4: 0, dsp5to8: 0, machines: Array(24).fill(0),
      fx: Array(16).fill(0), keys: Array(16).fill(255), screen: 0, tempo24: 0, playing: false })
    const names = base => base === 'b5fae2ae' ? address => address === 0x40a00004 ? 'tick+0x4' : '' : undefined
    expect(unitLines([at(1, 'base', 0xb5fae2ae), at(2, 'crash', 0x40a00004)], names).at(-1)).toBe('  unit: #2 start 1 +0m0s crash pc 0x40a00004 (tick+0x4)')
    expect(unitLines([at(1, 'base', 0x049efc39), at(2, 'crash', 0x40a00004)], names).at(-1)).toBe('  unit: #2 start 1 +0m0s crash pc 0x40a00004')
  })
  it('keeps an earlier log apart from the one a new base restarts at start 1', () => {
    const at = (seq, boot, kind, a = 0, more = {}) => ({ seq, boot, second: 60 * seq, kind, a, cpu: 0, dsp1to4: 0, dsp5to8: 0, machines: Array(24).fill(0),
      fx: Array(16).fill(0), keys: Array(16).fill(255), screen: 0, tempo24: 2880, playing: false, ...more })
    const log = (n, base, incidents) => entry(n, 'tester', { event: 'device_log', phase: 'ready', base, log: { loads: [], incidents } })
    const old = 'a'.repeat(64), next = 'b'.repeat(64)
    const events = [log(1, old, [at(1, 1, 'start'), at(2, 2, 'start'), at(3, 3, 'start')]), log(2, old, [at(4, 3, 'hot', 10, { cpu: 920 })]),
      log(3, old, [at(4, 3, 'hot', 10, { cpu: 920 }), at(5, 4, 'start')]), // sent again by another browser: the same log
      log(4, next, [at(1, 1, 'start'), at(2, 1, 'base', 0xbbbbbbbb), at(3, 1, 'set')]), log(5, next, [at(4, 2, 'start'), at(5, 2, 'base', 0xbbbbbbbb)])]
    const text = summary({ events, counts: [] })
    expect(text).toContain("  restarts 3 (the unit's earlier log, from base aaaaaaaa, starts 1-4)\n  restarts 1 (the unit's log, from base bbbbbbbb, starts 1-2)")
    expect(text).toContain('  unit: #4 start 3 +4m0s hot (10 half-seconds at 90 %+), cpu 92.0%')
    expect(text).toContain('machines ' + Array(24).fill(0).join(' ') + ' (an earlier log, base aaaaaaaa)\n  unit: #2 start 1 +2m0s base bbbbbbbb\n')
  })
  it('names the machines a CPU record refused this time, and keeps an older base’s record as it was', () => {
    const machines = Array(24).fill(0); machines.splice(6, 3, 1, 0x46, 0x4d); machines.splice(15, 3, 0, 0x47, 0x52) // T3 FM, T6 GR
    const at = a => ({ seq: 7, boot: 2, second: 75, kind: 'cpu', a, cpu: 600, dsp1to4: 0, dsp5to8: 0, machines,
      fx: Array(16).fill(0), keys: Array(16).fill(255), screen: 0, tempo24: 2880, playing: true })
    expect(unitLines([at((0x24 << 24 | 0x24 << 16 | 5) >>> 0)])[0]).toContain(' cpu 5 machines refused for CPU since the start, this time T3 FM, T6 GR, cpu 60.0%')
    expect(unitLines([at(0x04 << 24 | 3)])[0]).toContain(' cpu 3 machines refused for CPU, tracks 3, cpu 60.0%')
  })
  it('leaves short hot spells of a stopped unit out and counts them, keeping long and playing ones', () => {
    const at = (seq, kind, a, playing = false) => ({ seq, boot: 1, second: 0, kind, a, cpu: 950, dsp1to4: 0, dsp5to8: 0, machines: Array(24).fill(0),
      fx: Array(16).fill(0), keys: Array(16).fill(255), screen: 0, tempo24: 2880, playing })
    const lines = unitLines([at(1, 'hot', 2), at(2, 'hot', 9), at(3, 'hot', 10), at(4, 'hot', 2, true)])
    expect(lines[0]).toBe('  unit: 2 hot spells under 5 s while stopped left out (key presses and project loads)')
    expect(lines.slice(1).map(l => l.slice(0, 12))).toEqual(['  unit: #3 s', '  unit: #4 s'])
  })
  it('calls a stopped freeze until a restart after PROJ … RIGHT YES likely USB disk mode, and no other freeze', () => {
    const walk = [...Array(10).fill(255), 0x1c, 0x20, 0x33, 0x20, 0x21, 0x31], other = [...Array(14).fill(255), 0x27, 0x28]
    const at = (seq, boot, kind, a = 0, more = {}) => ({ seq, boot, second: 0, kind, a, cpu: 0, dsp1to4: 0, dsp5to8: 0, machines: Array(24).fill(0),
      fx: Array(16).fill(0), keys: walk, screen: 0, tempo24: 0, playing: false, ...more })
    const note = ' (likely USB disk mode or an upgrade prompt, beta finding 72: PROJ … RIGHT YES before it; not a hang)'
    const lines = unitLines([at(1, 1, 'base', 0x049efc39), at(2, 2, 'base', 0x049efc39), at(3, 1, 'freeze'), at(4, 1, 'freeze', 0, { playing: true }),
      at(5, 1, 'freeze', 0, { keys: other }), at(6, 1, 'freeze', 25919)])
    expect(lines.filter(l => l.includes('freeze')).map(l => [l.match(/#(\d+)/)[1], l.endsWith(note)])).toEqual([['3', true], ['4', false], ['5', false], ['6', false]])
  })
  it('leaves a start’s own brake and late-entry records out and counts them, keeping one while playing', () => {
    const at = (seq, kind, a, more = {}) => ({ seq, boot: 1, second: 0, kind, a, cpu: 0, dsp1to4: 0, dsp5to8: 0, machines: Array(24).fill(0),
      fx: Array(16).fill(0), keys: Array(16).fill(255), screen: 0, tempo24: 2880, playing: false, ...more })
    const lines = unitLines([at(1, 'start', 0), at(2, 'brake', 1), at(3, 'late', 0xac000000), at(4, 'brake', 0x800001, { second: 255, cpu: 463, playing: true })])
    expect(lines[0]).toBe('  unit: 2 brake or late-entry records at a start left out (the start\'s own frame lag)')
    expect(lines.slice(1).map(l => l.slice(0, 12))).toEqual(['  unit: #4 s'])
  })
  it('adds up each version’s starts, logged hours, hangs and syncs, without the owner’s unit or an OS upgrade', () => {
    const at = (seq, boot, kind, a = 0, more = {}) => ({ seq, boot, second: 0, kind, a, cpu: 0, dsp1to4: 0, dsp5to8: 0, machines: Array(24).fill(0),
      fx: Array(16).fill(0), keys: Array(16).fill(255), screen: 0, tempo24: 0, playing: false, ...more })
    const load = seq => ({ seq, boot: 1, minute: 5 * seq, cpu: [500, 520], dsp1to4: [300, 310], dsp5to8: [300, 310], samples: 600, playing: 300 })
    const incidents = [at(1, 1, 'start'), at(2, 1, 'base', 0xaaaaaaaa), at(3, 2, 'start'), at(4, 2, 'base', 0xaaaaaaaa), at(5, 2, 'stall', 1), // start 1's session stalled
      at(6, 3, 'start'), at(7, 3, 'base', 0xbbbbbbbb), at(8, 3, 'stall', 1), // found after an OS upgrade: no hang
      at(9, 3, 'freeze', 0, { playing: true }), at(10, 3, 'freeze', 25919)] // one until a restart, one that passed
    const log = (n, username) => entry(n, username, { event: 'device_log', phase: 'ready', log: { incidents, loads: Array.from({ length: 12 }, (_, i) => load(i + 1)) } })
    const sync = (n, event, more = {}) => entry(n, 'tester', { event, phase: 'sending', base: 'a'.repeat(64), ...more })
    const events = [log(1, 'tester'), log(2, 'repeat98'), sync(3, 'sync_started'), sync(4, 'kept'), sync(5, 'sync_started'), sync(6, 'sync_failed', { error: 'transport' })]
    const text = summary({ events, counts: [] }, { versions: new Map([['aaaaaaaa', '0.8'], ['bbbbbbbb', '0.8.1']]) })
    expect(text.split('Stability per base')[1].split('\n').slice(1, 3)).toEqual([
      '  0.8: units 1, starts 2, 1.0 h logged (0.5 playing); stalls 1, crashes 0, freezes until a restart 0 (0 playing); syncs kept 1 of 2, link lost 1',
      '  0.8.1: units 1, starts 1, 0.0 h logged (0.0 playing); stalls 0, crashes 0, freezes until a restart 1 (1 playing); syncs kept 0 of 0, link lost 0'])
  })
  it('calls a stall after a stopped PROJ … RIGHT YES walk at 95 %+ with nothing installed likely an OS upgrade or USB disk mode', () => {
    const at = (seq, boot, kind, a = 0, more = {}) => ({ seq, boot, second: 0, kind, a, cpu: 0, dsp1to4: 0, dsp5to8: 0, machines: Array(24).fill(0),
      fx: Array(16).fill(0), keys: Array(16).fill(255), screen: 0, tempo24: 0, playing: false, ...more })
    const walk = [...Array(12).fill(255), 0x1c, 0x20, 0x21, 0x31]
    const run = (set, hot) => unitLines([at(1, 1, 'start'), at(2, 1, 'base', 0xcd39c494), at(3, 1, 'set', set), at(4, 1, 'hot', 2, { cpu: 1000, keys: walk, ...hot }),
      at(5, 2, 'start'), at(6, 2, 'base', 0xcd39c494), at(7, 2, 'stall', 1)]).at(-1)
    expect(run(0)).toBe('  unit: #7 start 2 +0m0s stall reason 1 (likely an OS upgrade or USB disk mode, beta finding 72: the session before ended stopped at 95 %+ CPU after PROJ … RIGHT YES, no module installed)')
    expect(run(0, { keys: [...Array(14).fill(0x20), 0x21, 0x31] })).toContain('likely') // PROJ has left the 16 keys the unit keeps
    // FUNC PROJ NO PROJ DOWN RIGHT DOWN UP YES: the DOWN and UP between RIGHT and YES cancel, the cursor ends on the same row.
    expect(run(0, { keys: [...Array(7).fill(255), 0x2d, 0x1c, 0x32, 0x1c, 0x20, 0x21, 0x20, 0x33, 0x31] })).toContain('likely')
    for (const [set, hot] of [[1], [0, { playing: true }], [0, { cpu: 940 }], [0, { keys: [...Array(14).fill(255), 0x21, 0x31] }],
      [0, { keys: [...Array(9).fill(255), 0x1c, 0x20, 0x21, 0x20, 0x20, 0x33, 0x31] }], // one row down: maybe another item
      [0, { keys: [...Array(11).fill(255), 0x1c, 0x21, 0x32, 0x31] }]]) expect(run(set, hot)).toBe('  unit: #7 start 2 +0m0s stall reason 1')
  })
})
