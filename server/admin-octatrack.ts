// SPDX-License-Identifier: GPL-3.0-or-later OR Elastic-2.0
// Copyright (c) 2026 Jannik Aßfalg (repeat98)
import type { Database } from './platform'
import type { AdminOctatrack, AdminOctatrackCount, AdminOctatrackDay } from '../src/community/admin-octatrack-contract'
import { DIAGNOSTIC_CONSENT_DAYS, DIAGNOSTIC_RETENTION_DAYS, OCTATRACK_DIAGNOSTICS_VERSION } from '../src/community/octatrack-diagnostics-contract'

type Bind = string | number
const DAYS = 30
const SYNC_COLUMNS: Record<string, keyof AdminOctatrackDay> = { usb_sync_started: 'started', usb_sync_kept: 'kept', usb_sync_undone: 'undone', usb_sync_failed: 'failed' }

/** Aggregate reads only; authorization is enforced by the enclosing /api/admin/ boundary. Shared reports are read under
 * the same consent, account and retention conditions as the admin diagnostics list (octatrack-diagnostics.ts), so a
 * count never includes a report the list would hide. */
export async function adminOctatrack(db: Database, now = new Date()): Promise<AdminOctatrack> {
  const iso = now.toISOString(), day = (days: number) => new Date(now.getTime() - days * 86400000).toISOString().slice(0, 10)
  const today = day(0), weekFrom = day(6), from = day(DAYS - 1)
  const weekAgo = new Date(now.getTime() - 7 * 86400000).toISOString()
  const kept = new Date(now.getTime() - DIAGNOSTIC_RETENTION_DAYS * 86400000).toISOString(), consented = new Date(now.getTime() - DIAGNOSTIC_CONSENT_DAYS * 86400000).toISOString()
  // `who` keeps members and visitors apart without exposing either: m: or g: and the stored key.
  const reports = `WITH r AS (SELECT 'm:'||e.user_id AS who,e.created_at AS at,e.data_json AS d FROM octatrack_diagnostic_events e JOIN users u ON u.id=e.user_id JOIN octatrack_diagnostic_consent c ON c.user_id=e.user_id
      WHERE e.created_at>=? AND c.enabled=1 AND c.changed_at>? AND c.changed_at<=? AND u.suspended=0 AND u.email_verified=1
    UNION ALL SELECT 'g:'||e.guest_id,e.created_at,e.data_json FROM octatrack_guest_diagnostic_events e JOIN octatrack_guest_diagnostic_consent c ON c.guest_id=e.guest_id
      WHERE e.created_at>=? AND c.enabled=1 AND c.changed_at>? AND c.changed_at<=?)`
  const window: Bind[] = [kept, consented, iso, kept, consented, iso]
  const counts = (key: string, event: string) => db.prepare(`${reports} SELECT key,COUNT(*) AS count,COUNT(DISTINCT who) AS people FROM (SELECT who,${key} AS key FROM r WHERE json_extract(d,'$.event')=?)
    WHERE key IS NOT NULL GROUP BY key ORDER BY count DESC,key`).bind(...window, event).all<AdminOctatrackCount>().then(rows => rows.results)
  const field = (name: string) => `json_extract(d,'$.${name}')`
  const [installs, installDays, syncDays, members, guests, reporting, bases, syncFailures, buildFailures, linkFailures, linkClients, unresponsive, deviceIncidents] = await Promise.all([
    db.prepare('SELECT COUNT(*) AS total,COALESCE(SUM(seen_at>=?),0) AS today,COALESCE(SUM(seen_at>=?),0) AS last7 FROM member_base_install_prompts').bind(today, weekFrom).first<AdminOctatrack['installs']>(),
    db.prepare('SELECT substr(seen_at,1,10) AS day,COUNT(*) AS count FROM member_base_install_prompts WHERE seen_at>=? GROUP BY day').bind(from).all<{ day: string; count: number }>(),
    db.prepare('SELECT day,event,count FROM octatrack_beta_daily WHERE day>=?').bind(from).all<{ day: string; event: string; count: number }>(),
    db.prepare(`SELECT COUNT(*) AS total,COALESCE(SUM(c.version=?),0) AS current,COALESCE(SUM(c.changed_at>=?),0) AS fresh FROM octatrack_diagnostic_consent c JOIN users u ON u.id=c.user_id
      WHERE c.enabled=1 AND c.changed_at>? AND c.changed_at<=? AND u.suspended=0 AND u.email_verified=1`).bind(OCTATRACK_DIAGNOSTICS_VERSION, weekAgo, consented, iso).first<{ total: number; current: number; fresh: number }>(),
    db.prepare('SELECT COUNT(*) AS total,COALESCE(SUM(changed_at>=?),0) AS fresh FROM octatrack_guest_diagnostic_consent WHERE enabled=1 AND changed_at>? AND changed_at<=?').bind(weekAgo, consented, iso).first<{ total: number; fresh: number }>(),
    db.prepare(`${reports} SELECT COUNT(DISTINCT CASE WHEN who LIKE 'm:%' THEN who END) AS members,COUNT(DISTINCT CASE WHEN who LIKE 'g:%' THEN who END) AS guests FROM r`).bind(...window).first<{ members: number; guests: number }>(),
    // SQLite takes the bare `base` from the row that holds MAX(at): each sharer's latest reported base.
    db.prepare(`${reports}, latest AS (SELECT who,${field('base')} AS base,MAX(at) AS at FROM r WHERE ${field('base')} IS NOT NULL GROUP BY who)
      SELECT base,COUNT(*) AS people,MAX(at) AS lastSeen FROM latest GROUP BY base ORDER BY people DESC,lastSeen DESC`).bind(...window).all<AdminOctatrack['bases'][number]>(),
    counts(`${field('error')}||COALESCE(' · '||${field('kind')},'')`, 'sync_failed'),
    counts(`${field('buildKind')}||' · '||${field('error')}`, 'build_failed'),
    counts(field('failure'), 'link_failed'),
    counts(`${field('client.browser')}||' · '||${field('client.os')}`, 'link_failed'),
    counts(field('reason'), 'unresponsive'),
    // A log is uploaded again at later connections until it fills; a unit's boot and sequence number identify an incident.
    db.prepare(`${reports} SELECT json_extract(i.value,'$.kind') AS key,COUNT(DISTINCT r.who||':'||json_extract(i.value,'$.boot')||':'||json_extract(i.value,'$.seq')) AS count,COUNT(DISTINCT r.who) AS people
      FROM r,json_each(r.d,'$.log.incidents') i WHERE json_extract(r.d,'$.event')='device_log' GROUP BY key ORDER BY count DESC,key`).bind(...window).all<AdminOctatrackCount>(),
  ])
  if (!installs || !members || !guests || !reporting) throw new Error('Unable to read Octatrack aggregates.')
  const daily = Array.from({ length: DAYS }, (_, index) => ({ day: day(DAYS - 1 - index), installs: 0, started: 0, kept: 0, undone: 0, failed: 0 }) as AdminOctatrackDay)
  const byDay = new Map(daily.map(row => [row.day, row]))
  for (const row of installDays.results) { const target = byDay.get(row.day); if (target) target.installs = row.count }
  for (const row of syncDays.results) { const target = byDay.get(row.day), column = SYNC_COLUMNS[row.event]; if (target && column) (target[column] as number) = row.count }
  return {
    generatedAt: iso, from, to: today, installs,
    sharing: { members: members.total, membersCurrent: members.current, membersNew: members.fresh, membersReporting: reporting.members, guests: guests.total, guestsNew: guests.fresh, guestsReporting: reporting.guests },
    bases: bases.results, daily,
    health: { syncFailures, buildFailures, linkFailures, linkClients, deviceIncidents: deviceIncidents.results, unresponsive },
  }
}
