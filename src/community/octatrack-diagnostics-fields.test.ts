import { afterEach, describe, expect, it } from 'vitest'
import type { DatabaseSync } from 'node:sqlite'
import { testServer } from './test-server'
import { digest } from '../../server/security'
import { cleanupOctatrackDiagnostics, validateDiagnostic } from '../../server/octatrack-diagnostics'
import { OCTATRACK_DIAGNOSTICS_VERSION as version, PRE_LINK_FAILURES } from './octatrack-diagnostics-contract'
import { diagnosticClient } from './diagnostic-client'

const databases: DatabaseSync[] = []
afterEach(() => { databases.splice(0).forEach(db => db.close()) })
async function fixture() {
  const server = await testServer(); databases.push(server.db)
  server.db.prepare("INSERT INTO users(id,display_name,username,email_verified,beta_tester) VALUES('member','member','member',1,0)").run()
  server.db.prepare('INSERT INTO sessions(token_hash,user_id,expires) VALUES(?,?,?)').run(await digest('c'.repeat(64)), 'member', Math.floor(Date.now() / 1000) + 3600)
  const token = 'c'.repeat(64)
  const consent = (enabled = true, as = version) => server.call('/octatrack/diagnostics/consent', 'PUT', { enabled, version: as }, token)
  const send = (data: unknown, as = version) => server.call('/octatrack/diagnostics', 'POST', { version: as, data }, token)
  return { ...server, token, consent, send }
}
const id = () => crypto.randomUUID()
const client = { browser: 'chrome', major: 131, os: 'windows' } as const

describe('browser family and pre-link failures in opted-in reports', () => {
  it('accepts a coarse browser and OS family on every report but the unit’s own log, and nothing finer', () => {
    for (const data of [
      { id: id(), event: 'connected', phase: 'ready', base: 'a'.repeat(64), client },
      { id: id(), event: 'sync_failed', phase: 'sending', error: 'device', client: { browser: 'firefox', os: 'linux' } },
      { id: id(), event: 'browser_error', phase: 'browser', area: 'octatrack', kind: 'TypeError', client },
      { id: id(), event: 'build_failed', phase: 'building', buildKind: 'octatrack-base', error: 'build', client },
      { id: id(), event: 'link_failed', phase: 'idle', failure: 'open-failed', client },
    ]) expect(() => validateDiagnostic(data), JSON.stringify(data)).not.toThrow()
    for (const bad of [
      { browser: 'chrome', os: 'windows', agent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }, { browser: 'Chrome 131.0.6778.86', os: 'windows' },
      { browser: 'chrome', major: 131.5, os: 'windows' }, { browser: 'chrome', major: 1000, os: 'windows' }, { browser: 'chrome', os: 'Windows 11' }, { browser: 'chrome' }, 'Chrome / Windows',
    ]) expect(() => validateDiagnostic({ id: id(), event: 'connected', phase: 'ready', client: bad }), JSON.stringify(bad)).toThrow()
    expect(() => validateDiagnostic({ id: id(), event: 'device_log', phase: 'ready', log: { loads: [], incidents: [], stall: { count: 1, reason: 1, ticks: 2, report: [] } }, client })).toThrow()
  })
  it('accepts a pre-link failure only as one fixed category with the link’s phase', () => {
    for (const failure of PRE_LINK_FAILURES) expect(() => validateDiagnostic({ id: id(), event: 'link_failed', phase: 'idle', failure })).not.toThrow()
    for (const bad of [
      { id: id(), event: 'link_failed', phase: 'idle', failure: 'NotFoundError: No device selected.' }, { id: id(), event: 'link_failed', phase: 'idle' },
      { id: id(), event: 'link_failed', phase: 'browser', failure: 'no-device' }, { id: id(), event: 'link_failed', phase: 'idle', failure: 'no-device', base: 'a'.repeat(64) },
      { id: id(), event: 'link_failed', phase: 'idle', failure: 'no-device', modules: [] }, { id: id(), event: 'sync_failed', phase: 'sending', failure: 'no-device' },
    ]) expect(() => validateDiagnostic(bad), JSON.stringify(bad)).toThrow()
  })
  it('stores the new fields for a member who shares under the current version and keeps the 30-day retention', async () => {
    const { db, env, consent, send } = await fixture()
    expect((await consent()).status).toBe(200)
    const failure = { id: id(), event: 'link_failed', phase: 'busy', failure: 'claim-failed', client }
    expect((await send(failure)).status).toBe(200)
    expect(JSON.parse((db.prepare('SELECT data_json FROM octatrack_diagnostic_events').get() as { data_json: string }).data_json)).toEqual(failure)
    db.prepare('UPDATE octatrack_diagnostic_events SET created_at=?').run(new Date(Date.now() - 31 * 86400000).toISOString())
    await cleanupOctatrackDiagnostics(env.DB!)
    expect(db.prepare('SELECT count(*) AS n FROM octatrack_diagnostic_events').get()).toEqual({ n: 0 })
  })
  it('keeps an earlier consent sharing, the newer fields included, and records its text with each report', async () => {
    expect(version).toBe('2026-11-11.1')
    const { db, call, token, consent, send } = await fixture(), earlier = '2026-10-15.1', changedAt = new Date(Date.now() - 86400000).toISOString()
    db.prepare('INSERT INTO octatrack_diagnostic_consent(user_id,enabled,version,changed_at) VALUES(?,?,?,?)').run('member', 1, earlier, changedAt)
    db.prepare('INSERT INTO octatrack_diagnostic_events(user_id,event_id,consent_version,data_json,created_at) VALUES(?,?,?,?,?)').run('member', 'old', earlier, JSON.stringify({ id: 'old', event: 'connected', phase: 'ready' }), changedAt)
    // Members who agreed once keep sharing through a new consent text (owner, 14 Nov 2026).
    expect(await (await call('/octatrack/diagnostics/consent', 'GET', undefined, token)).json()).toMatchObject({ enabled: true, version: earlier, changedAt })
    expect((await send({ id: id(), event: 'connected', phase: 'ready', client })).status).toBe(200)
    expect(db.prepare("SELECT consent_version FROM octatrack_diagnostic_events WHERE event_id!='old'").all()).toEqual([{ consent_version: earlier }])
    expect((await send({ id: id(), event: 'connected', phase: 'ready' }, earlier)).status).toBe(400) // a page from before the new text
    expect((await consent(true, earlier)).status).toBe(400) // a new choice records the current text
    expect((await (await call('/octatrack/diagnostics', 'GET', undefined, token)).json()).events).toHaveLength(2)
  })
})

describe('diagnosticClient', () => {
  it('keeps only families and the main browser version', () => {
    expect(diagnosticClient('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.6778.86 Safari/537.36')).toEqual({ browser: 'chrome', major: 131, os: 'windows' })
    expect(diagnosticClient('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.2903.70')).toEqual({ browser: 'edge', major: 131, os: 'windows' })
    expect(diagnosticClient('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15')).toEqual({ browser: 'safari', major: 18, os: 'macos' })
    expect(diagnosticClient('Mozilla/5.0 (X11; Linux x86_64; rv:133.0) Gecko/20100101 Firefox/133.0')).toEqual({ browser: 'firefox', major: 133, os: 'linux' })
    expect(diagnosticClient('Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36')).toEqual({ browser: 'chrome', major: 131, os: 'android' })
    expect(diagnosticClient('Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36')).toEqual({ browser: 'chrome', major: 131, os: 'chromeos' })
    expect(diagnosticClient('Mozilla/5.0 (Windows NT 10.0) Chrome/131.0.0.0', { brands: [{ brand: 'Not A Brand', version: '99' }, { brand: 'Chromium', version: '131' }, { brand: 'Brave', version: '131' }], platform: 'Windows' })).toEqual({ browser: 'brave', major: 131, os: 'windows' })
    expect(diagnosticClient('Node.js/24')).toEqual({ browser: 'other', os: 'other' })
    expect(diagnosticClient('')).toEqual({ browser: 'other', os: 'other' })
  })
})
