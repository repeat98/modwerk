// SPDX-License-Identifier: GPL-3.0-or-later OR Elastic-2.0
// Copyright (c) 2026 Jannik Aßfalg (repeat98)
import { describe, expect, it } from 'vitest'
import type { DeviceCrash, DeviceIncident, DeviceStall } from '../community/octatrack-diagnostics-contract'
import type { DeviceLog } from '../engine/elekloader/device-log'
import { trialVerdict } from './trial-verdict'

const incident = (seq: number, kind: string, a = 0, second = 3) => ({ seq, boot: 7, second, a, kind }) as unknown as DeviceIncident
const log = (seq: number, incidents: DeviceIncident[] = [], records: { crash?: Partial<DeviceCrash>; stall?: Partial<DeviceStall> } = {}) =>
  ({ version: 2, nonce: 1, boot: 7, seq, stallSeen: 0, loads: [], incidents, ...records }) as DeviceLog

describe('trial verdict', () => {
  it('passes a trial that logged nothing, and says so', () => {
    const before = log(10, [incident(9, 'crash', 0x40a00000)])
    expect(trialVerdict(before, before)).toEqual({ failed: false, lines: ['no crash, stall, freeze or skipped track logged during the trial'] })
  })

  it('fails on a crash, stall, freeze or skip logged after the trial began, and names the crash', () => {
    const before = log(10, [incident(9, 'stall', 1)])
    const after = log(14, [incident(9, 'stall', 1), incident(11, 'crash', 0x40a00004), incident(12, 'freeze', 40), incident(13, 'shed', 0x05000003), incident(14, 'stall', 2)])
    const verdict = trialVerdict(before, after, address => address === 0x40a00004 ? 'mymod_tick+0x4' : '')
    expect(verdict.failed).toBe(true)
    expect(verdict.lines).toEqual([
      'FAIL (boot 7 +3s) crash at PC 0x40a00004 (mymod_tick+0x4)',
      'FAIL (boot 7 +3s) the UI stood still for 40 frames',
      'FAIL (boot 7 +3s) the frame guard skipped tracks T1, T3, 3 skips since the start',
      'FAIL (boot 7 +3s) DSP stall (eDMA refused a transfer)',
      'npm run device -- do diaglog prints the whole log; do crash or do stall the record',
    ])
  })

  it('notes a hot CPU without failing, and ignores the trial\'s own set and start records', () => {
    const verdict = trialVerdict(log(10), log(13, [incident(11, 'set', 2), incident(12, 'hot', 6), incident(13, 'start')]))
    expect(verdict).toEqual({ failed: false, lines: ['note (boot 7 +3s) the CPU at 90 % or more for 3 s', 'no fault logged'] })
  })

  it('identifies the incident’s own boot when a short trial reports a long uptime', () => {
    const cpu = { ...incident(11, 'cpu', 0, 31872), boot: 6 }
    expect(trialVerdict(log(10), log(11, [cpu])).lines[0]).toBe('note (boot 6 +31872s) the CPU meter over its limit')
  })

  it('fails on a crash or stall record whose count moved when no incident says so', () => {
    const before = log(10, [], { crash: { count: 1, pc: 0x40000000, vector: 4 }, stall: { count: 2, reason: 1, ticks: 5 } })
    const after = log(10, [], { crash: { count: 2, pc: 0x40a00010, vector: 4 }, stall: { count: 3, reason: 1, ticks: 900 } })
    expect(trialVerdict(before, after).lines.slice(0, 2)).toEqual(['FAIL crash record 2: vector 4 at PC 0x40a00010', 'FAIL stall record 3: frames stopped at tick 900'])
    // A unit with no log before the trial had no records either.
    expect(trialVerdict(null, after).failed).toBe(true)
  })

  it('gives no verdict, and passes, on a base without the log', () => {
    expect(trialVerdict(undefined, undefined).failed).toBe(false)
    expect(trialVerdict(log(1), undefined).lines[0]).toMatch(/^no verdict/)
  })
})
