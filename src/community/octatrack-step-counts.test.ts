import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DatabaseSync } from 'node:sqlite'
import { testServer } from './test-server'
import { cleanupOctatrackDiagnostics } from '../../server/octatrack-diagnostics'
import { BASE_INSTALL_FAILURES, BASE_INSTALL_STAGES, DIAGNOSTIC_INVITATION_PLACEMENTS } from './octatrack-diagnostics-contract'
import type { BaseGuideFailure } from '../components/BaseInstallDialog'
import { handleCommunity } from '../../server/transport'

describe('identifier-free install-guide and invitation counts in the browser', () => {
  let usage: typeof import('./usage'), request: ReturnType<typeof vi.fn>, values: Map<string, string>
  beforeEach(async () => {
    vi.resetModules(); vi.stubEnv('VITE_COMMUNITY_API_URL', '')
    values = new Map(); request = vi.fn().mockResolvedValue(new Response('{}'))
    vi.stubGlobal('window', {}); vi.stubGlobal('navigator', { doNotTrack: null }); vi.stubGlobal('fetch', request)
    vi.stubGlobal('localStorage', { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value), removeItem: (key: string) => values.delete(key) })
    usage = await import('./usage')
  })
  afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs() })
  const sent = () => request.mock.calls.map(([url, options]) => [url, JSON.parse(options.body)])
  it('sends only the step and, for a failure, one fixed reason, with no credentials, referrer or identifier', () => {
    for (const stage of BASE_INSTALL_STAGES) usage.countBaseInstall(stage)
    usage.countBaseInstall('failed', 'no-webusb'); usage.countBaseInstall('failed', 'Chrome said: access denied at C:\\Users\\someone'); usage.countBaseInstall('opened', 'ignored')
    expect(sent()).toEqual([
      ['/api/usage/count', { event: 'base_guide_opened' }], ['/api/usage/count', { event: 'base_file_downloaded' }], ['/api/usage/count', { event: 'base_first_connection' }],
      ['/api/usage/count', { event: 'base_usb_update_done' }], ['/api/usage/count', { event: 'base_install_failed', detail: 'other' }],
      ['/api/usage/count', { event: 'base_install_failed', detail: 'no-webusb' }], ['/api/usage/count', { event: 'base_install_failed', detail: 'other' }],
      ['/api/usage/count', { event: 'base_guide_opened' }],
    ])
    for (const [, options] of request.mock.calls) { expect(options).toMatchObject({ method: 'POST', credentials: 'omit', referrerPolicy: 'no-referrer', headers: { 'Content-Type': 'application/json' } }) }
    expect(values.size).toBe(0)
  })
  it('takes every reason the install guide can report as itself, and nothing else', () => {
    const guide: Record<BaseGuideFailure, true> = { 'no-webusb': true, 'site-outdated': true, 'build-failed': true, 'link-lost': true, 'update-refused': true, 'update-failed': true, 'wrong-base': true }
    for (const reason of Object.keys(guide)) usage.countBaseInstall('failed', reason)
    usage.countBaseInstall('failed', 'link-timeout')
    expect(sent().map(([, body]) => body.detail)).toEqual([...Object.keys(guide), 'other'])
    expect([...BASE_INSTALL_FAILURES].sort()).toEqual([...Object.keys(guide), 'other'].sort())
  })
  it('counts invitation answers by placement and stops for an objection or a browser privacy signal', () => {
    usage.countDiagnosticsInvitation('shown', 'guide'); usage.countDiagnosticsInvitation('not-now', 'after-failure')
    usage.countDiagnosticsInvitation('shared', 'nowhere' as never)
    expect(sent()).toEqual([['/api/usage/count', { event: 'diagnostics_invite_shown', detail: 'guide' }], ['/api/usage/count', { event: 'diagnostics_invite_not_now', detail: 'after-failure' }]])
    request.mockClear(); usage.setAnonymousCountsAllowed(false)
    usage.countDiagnosticsInvitation('shown', 'hub'); usage.countBaseInstall('opened')
    usage.setAnonymousCountsAllowed(true); vi.stubGlobal('navigator', { doNotTrack: '1' })
    usage.countDiagnosticsInvitation('shown', 'hub'); usage.countBaseInstall('opened')
    expect(request).not.toHaveBeenCalled()
  })
})

describe('identifier-free install-guide and invitation counts on the server', () => {
  const databases: DatabaseSync[] = []
  afterEach(() => { vi.useRealTimers(); databases.splice(0).forEach(db => db.close()) })
  async function server() { const value = await testServer(); databases.push(value.db); return value }
  it('accepts the fixed steps and placements, maps an unknown failure reason to other and rejects anything else', async () => {
    const { call, db } = await server()
    for (const event of ['base_guide_opened', 'base_file_downloaded', 'base_first_connection', 'base_usb_update_done']) expect((await call('/usage/count', 'POST', { event })).status).toBe(200)
    for (const detail of [...BASE_INSTALL_FAILURES, 'link-timeout', 'something new']) expect((await call('/usage/count', 'POST', { event: 'base_install_failed', detail })).status).toBe(200)
    for (const placement of DIAGNOSTIC_INVITATION_PLACEMENTS) for (const event of ['diagnostics_invite_shown', 'diagnostics_invite_shared', 'diagnostics_invite_not_now'])
      expect((await call('/usage/count', 'POST', { event, detail: placement })).status).toBe(200)
    for (const bad of [
      { event: 'base_guide_opened', detail: 'guide' }, { event: 'base_install_failed' }, { event: 'base_install_failed', detail: 3 }, { event: 'base_install_failed', detail: 'x'.repeat(33) },
      { event: 'diagnostics_invite_shown' }, { event: 'diagnostics_invite_shown', detail: 'banner' }, { event: 'diagnostics_invite_shared', detail: 'guide', userId: 'member' },
      { event: 'base_first_connection', base: 'a'.repeat(64) }, { event: 'base_guide_opened', page: 'forum' }, { event: 'base_guide_opened', device: 'octatrack' }, { event: 'base_unknown' },
    ]) expect((await call('/usage/count', 'POST', bad)).status, JSON.stringify(bad)).toBe(400)
    const rows = db.prepare('SELECT event,detail,count FROM octatrack_count_daily ORDER BY event,detail').all() as { event: string; detail: string; count: number }[]
    expect(rows.filter(row => row.event === 'base_install_failed')).toEqual([
      { event: 'base_install_failed', detail: 'build-failed', count: 1 }, { event: 'base_install_failed', detail: 'link-lost', count: 1 },
      { event: 'base_install_failed', detail: 'no-webusb', count: 1 }, { event: 'base_install_failed', detail: 'other', count: 3 }, { event: 'base_install_failed', detail: 'site-outdated', count: 1 },
      { event: 'base_install_failed', detail: 'update-failed', count: 1 }, { event: 'base_install_failed', detail: 'update-refused', count: 1 }, { event: 'base_install_failed', detail: 'wrong-base', count: 1 }])
    expect(rows.find(row => row.event === 'base_guide_opened')).toEqual({ event: 'base_guide_opened', detail: '', count: 1 })
    expect(rows.filter(row => row.event.startsWith('diagnostics_invite_'))).toHaveLength(12)
  })
  it('stores nothing about who: no visitor digest, no identifier column, and browser privacy signals stop it', async () => {
    const { call, db, env } = await server()
    expect((await call('/usage/count', 'POST', { event: 'diagnostics_invite_shown', detail: 'guide' })).status).toBe(200)
    expect(db.prepare('SELECT count(*) AS n FROM usage_visitors').get()).toEqual({ n: 0 })
    expect(db.prepare('SELECT count(*) AS n FROM usage_daily').get()).toEqual({ n: 0 })
    expect((db.prepare('PRAGMA table_info(octatrack_count_daily)').all() as { name: string }[]).map(column => column.name)).toEqual(['day', 'event', 'detail', 'count'])
    for (const header of ['DNT', 'Sec-GPC']) {
      const response = await handleCommunity(new Request('https://api.example.test/api/usage/count', { method: 'POST', headers: { Origin: 'https://octamod.test', 'Content-Type': 'application/json', [header]: '1' }, body: JSON.stringify({ event: 'base_guide_opened' }) }), env)
      expect(response.status).toBe(204)
    }
    expect(db.prepare('SELECT sum(count) AS n FROM octatrack_count_daily').get()).toEqual({ n: 1 })
  })
  it('keeps 30 days like the sync-action counts and shows them to administrators only', async () => {
    const { call, db, env } = await server()
    const admin = (await (await call('/auth/admin', 'POST', { key: 'e'.repeat(64) })).json()).token as string
    const day = (ago: number) => new Date(Date.now() - ago * 86400000).toISOString().slice(0, 10)
    const insert = db.prepare('INSERT INTO octatrack_count_daily(day,event,detail,count) VALUES(?,?,?,?)')
    insert.run(day(31), 'base_guide_opened', '', 5); insert.run(day(29), 'base_guide_opened', '', 3); insert.run(day(0), 'diagnostics_invite_shown', 'hub', 2)
    await cleanupOctatrackDiagnostics(env.DB!)
    expect(db.prepare('SELECT day FROM octatrack_count_daily ORDER BY day').all()).toEqual([{ day: day(29) }, { day: day(0) }])
    expect((await call('/admin/octatrack/diagnostics', 'GET')).status).toBe(403)
    const body = await (await call('/admin/octatrack/diagnostics', 'GET', undefined, '', admin)).json()
    expect(body.steps).toEqual([{ day: day(0), event: 'diagnostics_invite_shown', detail: 'hub', count: 2 }, { day: day(29), event: 'base_guide_opened', detail: '', count: 3 }])
  })
})
