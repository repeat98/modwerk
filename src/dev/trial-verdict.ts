// SPDX-License-Identifier: GPL-3.0-or-later OR Elastic-2.0
// Copyright (c) 2026 Jannik Aßfalg (repeat98)
// What a trial did to the unit, from the unit's own log (diag.h, read over LOG) taken before the trial and again before it is kept
// or undone: every incident it wrote in between, and a crash or stall record whose count moved. `device try`, `set` and `remove`,
// and so `module:dev`, print it and fail on a crash, a stall, a frozen UI or a skipped track, so a trial never looks fine while
// the unit logged a fault.
import type { DeviceIncident } from '../community/octatrack-diagnostics-contract.ts'
import type { DeviceLog } from '../engine/elekloader/device-log.ts'

/** The log as it stood at one moment: `null` for a base that answers LOG with no log yet, `undefined` for one that does not answer. */
export type LogReading = DeviceLog | null | undefined
export interface TrialVerdict { failed: boolean; lines: string[] }

/** The incidents that fail a trial: the unit crashed, a DSP core stalled, the UI stood still or the frame guard skipped tracks.
 * HOT and CPU (the CPU meter at 90 %) are printed but pass: stock alone can reach them. START, SET and BASE are the trial's own
 * bookkeeping, or a restart that already ended the trial with an error. */
const FAILS: ReadonlySet<string> = new Set(['crash', 'stall', 'freeze', 'shed'])
const WARNS: ReadonlySet<string> = new Set(['hot', 'cpu'])
const SAID: Record<string, (a: number) => string> = {
  crash: a => `crash at PC 0x${a.toString(16)}`,
  stall: a => `DSP stall (${['a test', 'frames stopped', 'eDMA refused a transfer'][a] ?? 'reason ' + a})`,
  freeze: a => a ? `the UI stood still for ${a} frames` : 'the UI stood still and never came back',
  shed: a => `the frame guard skipped tracks ${[...Array(8).keys()].filter(t => a >>> 24 >> t & 1).map(t => 'T' + (t + 1)).join(', ') || '(none named)'}, ${a & 0xffffff} skips since the start`,
  hot: a => `the CPU at 90 % or more for ${a / 2} s`,
  cpu: () => 'the CPU meter over its limit',
}

/** The verdict on a trial from the log before and after it. `names` turns a program counter into "symbol+0x1c" (address-names.ts). */
export function trialVerdict(before: LogReading, after: LogReading, names?: (address: number) => string): TrialVerdict {
  if (before === undefined || after === undefined) return { failed: false, lines: ['no verdict: this base keeps no log (LOG), so a crash or stall in the trial is not seen here'] }
  const seen = before?.seq ?? 0
  const incidents = (after?.incidents ?? []).filter((incident: DeviceIncident) => incident.seq > seen && (FAILS.has(incident.kind) || WARNS.has(incident.kind)))
  const lines = incidents.map(incident => {
    const name = incident.kind === 'crash' && names?.(incident.a)
    return `${FAILS.has(incident.kind) ? 'FAIL' : 'note'} (boot ${incident.boot} +${incident.second}s) ${SAID[incident.kind](incident.a)}${name ? ' (' + name + ')' : ''}`
  })
  // A crash or stall record whose count moved, when no incident of its kind says so (a log that wrapped, or a record kept before its incident).
  const crash = after?.crash, stall = after?.stall
  if (crash && crash.count !== (before?.crash?.count ?? 0) && !incidents.some(incident => incident.kind === 'crash'))
    lines.push(`FAIL crash record ${crash.count}: vector ${crash.vector} at PC 0x${crash.pc.toString(16)}${names?.(crash.pc) ? ' (' + names(crash.pc) + ')' : ''}`)
  if (stall && stall.count !== (before?.stall?.count ?? 0) && !incidents.some(incident => incident.kind === 'stall'))
    lines.push(`FAIL stall record ${stall.count}: ${['a test', 'frames stopped', 'eDMA refused a transfer'][stall.reason] ?? 'reason ' + stall.reason} at tick ${stall.ticks}`)
  const failed = lines.some(line => line.startsWith('FAIL'))
  return { failed, lines: lines.length ? [...lines, failed ? 'npm run device -- do diaglog prints the whole log; do crash or do stall the record' : 'no fault logged'] : ['no crash, stall, freeze or skipped track logged during the trial'] }
}
