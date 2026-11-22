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
 * HOT and CPU (the CPU meter at 90 %) are printed but pass: stock alone can reach them. USB (the unit offered itself on USB
 * again because the host never enumerated it, #1985) is printed and passes: the link, not the module. START, SET and BASE are the trial's own
 * bookkeeping, or a restart that already ended the trial with an error. */
const FAILS: ReadonlySet<string> = new Set(['crash', 'stall', 'freeze', 'shed', 'brake', 'late'])
const WARNS: ReadonlySet<string> = new Set(['hot', 'cpu', 'usb'])
const tracks = (mask: number) => [...Array(8).keys()].filter(t => mask >> t & 1).map(t => 'T' + (t + 1)).join(', ') || '(none named)'
const SAID: Record<string, (a: number) => string> = {
  crash: a => `crash at PC 0x${a.toString(16)}`,
  stall: a => `DSP stall (${['a test', 'frames stopped', 'eDMA refused a transfer'][a] ?? 'reason ' + a})`,
  freeze: a => a ? `the UI stood still for ${a} frames` : 'the UI stood still and never came back',
  shed: a => `the frame guard skipped tracks ${tracks(a >>> 24)}, ${a & 0xffffff} skips since the start`,
  hot: a => `the CPU at 90 % or more for ${a / 2} s`,
  cpu: () => 'the CPU meter over its limit',
  brake: a => a >>> 23 & 1 ? `a pattern predicted past the frame ceiling began with the module machines silenced (${a & 0x7fffff} since boot)`
    : `the frame fell behind and the brake silenced the module machines (${a & 0xffffff} since boot)`,
  late: a => `a late frame entry was held, so the DSP skipped a frame, heard as a click (${a} since boot)`,
  usb: a => `the host never enumerated the unit, so it offered itself on USB again (OTGSC 0x${(a >>> 16).toString(16)}, PORTSC1 0x${(a & 0xffff).toString(16)})`,
}

/** The verdict on a trial from the log before and after it. `names` turns a program counter into "symbol+0x1c" (address-names.ts). */
export function trialVerdict(before: LogReading, after: LogReading, names?: (address: number) => string): TrialVerdict {
  if (before === undefined || after === undefined) return { failed: false, lines: ['no verdict: this base keeps no log (LOG), so a crash or stall in the trial is not seen here'] }
  const seen = before?.seq ?? 0
  // A base that pages the guard's live skip count is judged by it: its SHED incidents come at most once in ten minutes, so
  // one can carry an earlier trial's skips into this one's window (owner's MKII, 21 November 2026).
  const counted = before?.sheds && after?.sheds ? after.sheds.count - before.sheds.count : undefined
  const incidents = (after?.incidents ?? []).filter((incident: DeviceIncident) => incident.seq > seen && (FAILS.has(incident.kind) || WARNS.has(incident.kind))
    && !(incident.kind === 'shed' && counted !== undefined))
  const lines = incidents.map(incident => {
    const name = incident.kind === 'crash' && names?.(incident.a)
    // A pattern predicted past the ceiling that began with module machines silenced is the base's design (owner), not a fault.
    const fails = FAILS.has(incident.kind) && !(incident.kind === 'brake' && incident.a >>> 23 & 1)
    return `${fails ? 'FAIL' : 'note'} (boot ${incident.boot} +${incident.second}s) ${SAID[incident.kind](incident.a)}${name ? ' (' + name + ')' : ''}`
  })
  if (counted) lines.push(`FAIL the frame guard skipped ${counted} render${counted === 1 ? '' : 's'} during the trial (tracks it skipped on since the start: ${tracks(after!.sheds!.tracks)})`)
  // A crash or stall record whose count moved, when no incident of its kind says so (a log that wrapped, or a record kept before its incident).
  const crash = after?.crash, stall = after?.stall
  if (crash && crash.count !== (before?.crash?.count ?? 0) && !incidents.some(incident => incident.kind === 'crash'))
    lines.push(`FAIL crash record ${crash.count}: vector ${crash.vector} at PC 0x${crash.pc.toString(16)}${names?.(crash.pc) ? ' (' + names(crash.pc) + ')' : ''}`)
  if (stall && stall.count !== (before?.stall?.count ?? 0) && !incidents.some(incident => incident.kind === 'stall'))
    lines.push(`FAIL stall record ${stall.count}: ${['a test', 'frames stopped', 'eDMA refused a transfer'][stall.reason] ?? 'reason ' + stall.reason} at tick ${stall.ticks}`)
  const failed = lines.some(line => line.startsWith('FAIL'))
  return { failed, lines: lines.length ? [...lines, failed ? 'npm run device -- do diaglog prints the whole log; do crash or do stall the record' : 'no fault logged'] : ['no crash, stall, freeze or skipped track logged during the trial'] }
}
