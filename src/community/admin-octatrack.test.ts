import { afterEach, describe, expect, it } from 'vitest'
import type { DatabaseSync } from 'node:sqlite'
import { testServer } from './test-server'
import { adminOctatrack } from '../../server/admin-octatrack'
import { OCTATRACK_DIAGNOSTICS_VERSION as version } from './octatrack-diagnostics-contract'

const databases: DatabaseSync[] = []
afterEach(() => databases.splice(0).forEach(db => db.close()))
const now = new Date('2026-11-12T12:00:00.000Z'), ago = (days: number) => new Date(now.getTime() - days * 86400000).toISOString()
const base = (c: string) => c.repeat(64)
const incident = (boot: number, seq: number, kind: string) => ({ seq, boot, second: 1, kind, a: 0, cpu: 0, dsp1to4: 0, dsp5to8: 0, machines: Array(24).fill(0), fx: Array(16).fill(0), keys: Array(16).fill(255), screen: 0, tempo24: 0, playing: false })

async function fixture() {
  const server = await testServer(); databases.push(server.db)
  const { db } = server
  for (const [id, verified, suspended] of [['ann', 1, 0], ['bo', 1, 0], ['cy', 1, 0], ['gone', 0, 0], ['old', 1, 0]] as const) {
    db.prepare('INSERT INTO users(id,display_name,username,email_verified,suspended) VALUES(?,?,?,?,?)').run(id, id, id, verified, suspended)
    db.prepare('INSERT INTO auth_users(id,name,email,emailVerified,createdAt,updatedAt) VALUES(?,?,?,1,?,?)').run(id, id, id + '@example.test', ago(40), ago(40))
  }
  for (const [id, seen] of [['ann', '2026-11-12 09:00:00'], ['bo', '2026-11-08 10:00:00'], ['cy', '2026-09-01 10:00:00']]) db.prepare('INSERT INTO member_base_install_prompts(user_id,seen_at) VALUES(?,?)').run(id, seen)
  const consent = db.prepare('INSERT INTO octatrack_diagnostic_consent(user_id,enabled,version,changed_at) VALUES(?,?,?,?)')
  consent.run('ann', 1, version, ago(2)); consent.run('bo', 1, 'older-text', ago(20)); consent.run('cy', 0, version, ago(1)); consent.run('gone', 1, version, ago(1)); consent.run('old', 1, version, ago(95))
  db.prepare('INSERT INTO octatrack_guest_diagnostic_consent(guest_id,enabled,version,changed_at) VALUES(?,1,?,?)').run('guest1', version, ago(1))
  let n = 0
  const event = (who: string, data: Record<string, unknown>, at: string) => who.startsWith('guest')
    ? db.prepare('INSERT INTO octatrack_guest_diagnostic_events(guest_id,event_id,consent_version,data_json,created_at) VALUES(?,?,?,?,?)').run(who, 'e' + ++n, version, JSON.stringify(data), at)
    : db.prepare('INSERT INTO octatrack_diagnostic_events(user_id,event_id,consent_version,data_json,created_at) VALUES(?,?,?,?,?)').run(who, 'e' + ++n, version, JSON.stringify(data), at)
  event('ann', { event: 'connected', base: base('a') }, ago(5))
  event('ann', { event: 'connected', base: base('b') }, ago(1)) // ann's latest base
  event('bo', { event: 'connected', base: base('a') }, ago(3))
  event('guest1', { event: 'connected', base: base('b') }, ago(1))
  event('gone', { event: 'connected', base: base('c') }, ago(1)) // unverified: hidden
  event('old', { event: 'connected', base: base('c') }, ago(1)) // consent expired: hidden
  event('ann', { event: 'sync_failed', error: 'transport' }, ago(1))
  event('bo', { event: 'sync_failed', error: 'transport' }, ago(1))
  event('ann', { event: 'sync_failed', error: 'unknown', kind: 'TypeError' }, ago(1))
  event('ann', { event: 'build_failed', buildKind: 'octatrack-base', error: 'selection' }, ago(1))
  event('guest1', { event: 'link_failed', failure: 'claim-failed', client: { browser: 'chrome', major: 157, os: 'windows' } }, ago(1))
  event('ann', { event: 'unresponsive', reason: 'usb' }, ago(1))
  event('ann', { event: 'sync_failed', error: 'device' }, ago(31)) // past retention
  // The same log uploaded twice: each incident counts once.
  for (const at of [ago(2), ago(1)]) event('bo', { event: 'device_log', log: { loads: [], incidents: [incident(4, 1, 'start'), incident(4, 2, 'hot')] } }, at)
  db.prepare("INSERT INTO octatrack_beta_daily(day,event,count) VALUES('2026-11-12','usb_sync_started',5),('2026-11-12','usb_sync_kept',3),('2026-11-11','usb_sync_failed',2),('2026-09-01','usb_sync_kept',9)").run()
  return server
}

describe('admin Octatrack statistics', () => {
  it('counts base installs, sharers and their latest bases under the diagnostics list’s own conditions', async () => {
    const { env } = await fixture(), data = await adminOctatrack(env.DB!, now)
    expect(data.installs).toEqual({ total: 3, today: 1, last7: 2 })
    expect(data.sharing).toEqual({ members: 2, membersCurrent: 1, membersNew: 1, membersReporting: 2, guests: 1, guestsNew: 1, guestsReporting: 1 })
    expect(data.bases).toEqual([{ base: base('b'), people: 2, lastSeen: ago(1) }, { base: base('a'), people: 1, lastSeen: ago(3) }])
    expect(data.daily).toHaveLength(30)
    expect(data.daily.at(-1)).toEqual({ day: '2026-11-12', installs: 1, started: 5, kept: 3, undone: 0, failed: 0 })
    expect(data.daily.at(-2)).toMatchObject({ day: '2026-11-11', failed: 2 })
    expect(data.daily.find(row => row.day === '2026-11-08')?.installs).toBe(1)
  })
  it('groups failures and device incidents, counting a re-uploaded incident once', async () => {
    const { env } = await fixture(), { health } = await adminOctatrack(env.DB!, now)
    expect(health.syncFailures).toEqual([{ key: 'transport', count: 2, people: 2 }, { key: 'unknown · TypeError', count: 1, people: 1 }])
    expect(health.buildFailures).toEqual([{ key: 'octatrack-base · selection', count: 1, people: 1 }])
    expect(health.linkFailures).toEqual([{ key: 'claim-failed', count: 1, people: 1 }])
    expect(health.linkClients).toEqual([{ key: 'chrome · windows', count: 1, people: 1 }])
    expect(health.unresponsive).toEqual([{ key: 'usb', count: 1, people: 1 }])
    expect(health.deviceIncidents).toEqual([{ key: 'hot', count: 1, people: 1 }, { key: 'start', count: 1, people: 1 }])
  })
  it('is for administrators only', async () => {
    const server = await fixture()
    expect((await server.call('/admin/octatrack', 'GET')).status).toBe(403)
    const admin = (await (await server.call('/auth/admin', 'POST', { key: 'e'.repeat(64) })).json()).token as string
    const response = await server.call('/admin/octatrack', 'GET', undefined, '', admin)
    expect(response.status).toBe(200)
    expect((await response.json()).installs.total).toBe(3)
  })
})
