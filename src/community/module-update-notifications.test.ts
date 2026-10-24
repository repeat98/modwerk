import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DatabaseSync } from 'node:sqlite'
import { readFileSync, readdirSync } from 'node:fs'
import { COMMUNITY_RULES_VERSION } from '../legal/policy'
import { testDatabase, testServer } from './test-server'
import { COMMUNITY_MODULES, communityModule } from './modules'
import { parseModuleReleases, type ModuleRelease } from './module-release-contract'
import type { BellItem } from './notification-contract'
import { notificationLines } from './notification-text'
import { recordModuleReleases, syncModuleReleases } from '../../server/module-updates'
import { sendActivityDigests } from '../../server/activity-mail'
import { developerApi } from '../../server/developers'
import type { User } from '../../server/platform'
import worker from '../../worker'

type Mail = { subject: string; to: string[]; text: string; html: string }
const databases: DatabaseSync[] = [], sent: Mail[] = [], password = 'a long original test passphrase'
beforeEach(() => {
  sent.length = 0
  vi.stubGlobal('fetch', vi.fn(async (url: string, options: RequestInit) => {
    expect(url).toBe('https://api.resend.com/emails')
    sent.push(JSON.parse(String(options.body)))
    return Response.json({ id: crypto.randomUUID() })
  }))
})
afterEach(() => { vi.unstubAllGlobals(); for (const db of databases.splice(0)) db.close() })
const release = (id = 'miniverb', version = '10.0.0'): ModuleRelease => ({ id, version, name: communityModule(id)!.name, href: communityModule(id)!.href, notes: { version, date: '2026-10-08', changes: ['Correct playback behavior for ' + id + ' v' + version + '.'] } })
const manifest = (modules: ModuleRelease[]) => ({ format: 'modwerk-module-releases-v1', modules })
const report = { title: 'A control freezes', steps: 'Turn the control.', expected: 'A new value.', actual: 'It freezes.', context: { model: 'mk2', flash: 'flashed', os: '1.40C', modules: [{ id: 'miniverb', version: communityModule('miniverb')!.version }], keepStockFx2: true, build: '' }, logMissing: { reason: 'logger-not-in-build' } }

async function fixture() {
  const server = await testServer(); databases.push(server.db)
  server.env.AUTH_BASE_URL = 'https://api.example.test/api/auth'
  async function member(username: string) {
    const email = username + '@example.test'
    expect((await server.call('/auth/register', 'POST', { rulesVersion: COMMUNITY_RULES_VERSION, username, email, password })).status).toBe(202)
    const token = [...sent].reverse().find(mail => mail.to[0] === email)!.text.match(/#account\/verify\/([^\s]+)/)![1]
    expect((await server.call('/auth/verify', 'POST', { token, password })).status).toBe(200)
    const login = await server.call('/auth/login', 'POST', { email, password })
    return { id: String(server.db.prepare('SELECT id FROM auth_users WHERE email=?').get(email)!.id), email, session: login.headers.get('X-Octamod-Session')! }
  }
  const items = async (session: string) => (await (await server.call('/notifications', 'GET', undefined, session)).json()).items as BellItem[]
  const admin = async () => (await (await server.call('/auth/admin', 'POST', { key: 'e'.repeat(64) })).json()).token as string
  const publish = (...releases: ModuleRelease[]) => recordModuleReleases(server.env.DB!, releases)
  const digests = async (minutes = 24 * 60 + 15) => { sent.length = 0; return sendActivityDigests(server.env, server.env.DB!, new Date(Date.now() + minutes * 60000)) }
  return { ...server, member, items, admin, publish, digests }
}

describe('module update subscriptions', () => {
  it.each([undefined, false])('notifies followers by default, regardless of the legacy announce flag (%s)', async announce => {
    const f = await fixture(), follower = await f.member('defaultfan')
    await f.publish(release('miniverb', '9.0.0'))
    await f.call('/modules/miniverb/updates', 'PATCH', { enabled: true }, follower.session)
    const next = release(); if (announce !== undefined) next.notes!.announce = announce
    expect(await f.publish(next)).toEqual({ checked: 1, notified: 1 })
    expect(await f.publish(next)).toEqual({ checked: 1, notified: 0 })
    next.notes!.changes.push('Media-only: replace the thumbnail with shared signal artwork.')
    expect(await f.publish(next)).toEqual({ checked: 1, notified: 0 })
    expect(await f.publish(release('miniverb', '9.0.0'))).toEqual({ checked: 1, notified: 0 })
    expect(f.db.prepare('SELECT after_version FROM module_update_subscriptions').get()!.after_version).toBe('10.0.0')
    expect(await f.publish(release('miniverb', '11.0.0'))).toEqual({ checked: 1, notified: 1 })
    expect((await f.items(follower.session)).filter(item => item.kind === 'module_update')).toHaveLength(2)
    await f.call('/modules/miniverb/updates', 'PATCH', { enabled: false }, follower.session)
    expect(await f.publish(release('miniverb', '12.0.0'))).toEqual({ checked: 1, notified: 0 })
  })

  it('recovers missed current releases once and consolidates them without changing opt-outs', async () => {
    const f = await fixture(), follower = await f.member('catchupfan'), silent = { id: 'catchupsilent' }, unfollowed = { id: 'catchupunfollowed' }
    // Only the follower needs an HTTP session; seed the other recipients without unrelated password hashing.
    for (const member of [silent, unfollowed]) {
      f.db.prepare('INSERT INTO users(id,display_name,username,email_verified) VALUES(?,?,?,1)').run(member.id, member.id, member.id)
      f.db.prepare('INSERT INTO auth_users(id,name,email,emailVerified,createdAt,updatedAt) VALUES(?,?,?,1,0,0)').run(member.id, member.id, member.id + '@example.test')
    }
    const ids = ['miniverb', 'tapeecho']
    await f.publish(...ids.map(id => release(id, '9.0.0')))
    for (const member of [follower, silent]) for (const id of ids) f.db.prepare("INSERT INTO module_update_subscriptions(user_id,module_id,after_version) VALUES(?,?,'9.0.0')").run(member.id, id)
    f.db.prepare('INSERT INTO notification_preferences(user_id,updates) VALUES(?,0)').run(silent.id)
    for (const id of ids) f.db.prepare('INSERT INTO module_update_opt_outs(user_id,module_id) VALUES(?,?)').run(unfollowed.id, id)
    // The broken policy recorded publication but left subscribers at their last notified version.
    for (const id of ids) {
      const next = release(id)
      f.db.prepare('INSERT INTO module_releases(module_id,version,name,href,notes) VALUES(?,?,?,?,?)').run(id, next.version, next.name, next.href, JSON.stringify(next.notes))
      f.db.prepare('UPDATE module_release_state SET version=? WHERE module_id=?').run(next.version, id)
    }
    // Restoring ordinary publication must not send an unapproved catch-up.
    expect(await f.publish(...ids.map(id => release(id)))).toEqual({ checked: 2, notified: 0 })
    expect(await recordModuleReleases(f.env.DB!, ids.map(id => release(id)), true, true)).toEqual({ checked: 2, notified: 4 })
    expect(await recordModuleReleases(f.env.DB!, ids.map(id => release(id)), true, true)).toEqual({ checked: 2, notified: 0 })
    expect(await f.digests(5)).toEqual({ sent: 0 })
    expect(await f.digests(15)).toEqual({ sent: 1 })
    expect(sent[0].to).toEqual([follower.email])
    expect(sent[0].subject).toBe('A few updates from me')
    for (const id of ids) expect(sent[0].text).toContain(release(id).name + ' ' + release(id).version)
    expect(sent[0].html).toContain('Unsubscribe from activity email')
    expect(f.db.prepare('SELECT updates FROM notification_preferences WHERE user_id=?').get(silent.id)!.updates).toBe(0)
    expect(f.db.prepare('SELECT COUNT(*) AS count FROM module_update_opt_outs WHERE user_id=?').get(unfollowed.id)!.count).toBe(2)
  })

  it('keeps unrelated activity out of the approved catch-up and queued for the next chosen interval', async () => {
    const f = await fixture(), follower = await f.member('catchupmixed'), author = await f.member('catchupreply')
    await f.publish(release('miniverb', '9.0.0'))
    await f.call('/modules/miniverb/updates', 'PATCH', { enabled: true }, follower.session)
    await recordModuleReleases(f.env.DB!, [release()], true, true)
    const { id } = await (await f.call('/forum/threads', 'POST', { title: 'Catch-up discussion', body: 'Discuss the update.', category: 'general' }, follower.session)).json()
    await f.call('/forum/threads/' + id + '/replies', 'POST', { body: 'An unrelated reply.' }, author.session)
    expect(await f.digests()).toEqual({ sent: 1 })
    expect(sent[0].subject).toBe('A few updates from me')
    expect(sent[0].text).not.toContain('An unrelated reply.')
    expect(f.db.prepare("SELECT emailed FROM notifications WHERE kind='reply'").get()!.emailed).toBe(0)
    expect(await f.digests(25 * 60)).toEqual({ sent: 0 })
    expect(await f.digests(31 * 60)).toEqual({ sent: 1 })
    expect(sent[0].text).toContain('An unrelated reply.')
    expect(sent[0].subject).not.toBe('A few updates from me')
  })

  it('keeps the approved catch-up behind a recent module digest', async () => {
    const f = await fixture(), follower = await f.member('catchupspacing')
    await f.publish(release('miniverb', '9.0.0'))
    await f.call('/modules/miniverb/updates', 'PATCH', { enabled: true }, follower.session)
    const previous = new Date().toISOString().replace('T', ' ').slice(0, 19)
    f.db.prepare('INSERT INTO notification_preferences(user_id,last_digest_at,last_module_digest_at) VALUES(?,?,?)').run(follower.id, previous, previous)
    await recordModuleReleases(f.env.DB!, [release()], true, true)
    expect(await f.digests(15)).toEqual({ sent: 0 })
    expect(await f.digests(7 * 60)).toEqual({ sent: 0 })
    expect(await f.digests()).toEqual({ sent: 1 })
    expect(sent[0].subject).toBe('A few updates from me')
  })

  it('queues beta releases only for eligible beta followers and stays quiet publicly', async () => {
    const f = await fixture(), tester = await f.member('betafan'), ordinary = await f.member('publicfan')
    f.db.prepare('UPDATE users SET beta_tester=1 WHERE id=?').run(tester.id)
    await f.publish(release('miniverb', '0.9.0'))
    for (const member of [tester, ordinary]) f.db.prepare('INSERT INTO module_update_subscriptions(user_id,module_id,after_version) VALUES(?,?,?)').run(member.id, 'airwindows-chorus', '0.1.0-experimental')
    const beta = { ...release('airwindows-chorus', '0.1.1-experimental'), beta: true }
    expect(parseModuleReleases(manifest([beta]))[0].beta).toBe(true)
    await f.publish(beta); await f.publish(beta)
    expect((await f.items(tester.session)).filter(item => item.kind === 'module_update')).toHaveLength(1)
    expect(await f.items(ordinary.session)).toHaveLength(0)
    expect(f.db.prepare("SELECT COUNT(*) AS count FROM announcements WHERE module_id='airwindows-chorus'").get()!.count).toBe(0)
  })

  it('requires a verified member, scopes subscriptions to the account and follows all three machines independently', async () => {
    const f = await fixture(), owner = await f.member('follower'), other = await f.member('anotherfan')
    expect((await f.call('/modules/miniverb/updates')).status).toBe(401)
    expect((await f.call('/modules/unknown/updates', 'PATCH', { enabled: true }, owner.session)).status).toBe(404)
    expect((await f.call('/modules/miniverb/updates', 'PATCH', { enabled: 1 }, owner.session)).status).toBe(400)
    expect((await f.call('/modules/miniverb/updates', 'PATCH', { enabled: true, userId: other.id }, owner.session)).status).toBe(400)
    for (const id of ['miniverb', 'digitakt-digihealth', 'digitone-digihealth']) {
      for (let i = 0; i < 2; i++) expect(await (await f.call('/modules/' + id + '/updates', 'PATCH', { enabled: true }, owner.session)).json()).toMatchObject({ enabled: true, emailEnabled: true, emailAvailable: true })
      expect(await (await f.call('/modules/' + id + '/updates', 'GET', undefined, other.session)).json()).toMatchObject({ enabled: false })
    }
    expect(f.db.prepare('SELECT COUNT(*) AS count FROM module_update_subscriptions').get()!.count).toBe(3)
    expect(f.db.prepare('SELECT COUNT(*) AS count FROM forum_follows').get()!.count).toBe(0)
    await f.publish(release('miniverb'), release('digitakt-digihealth'), release('digitone-digihealth'))
    expect((await f.items(owner.session)).map(item => item.module_id).sort()).toEqual(['digitakt-digihealth', 'digitone-digihealth', 'miniverb'])
    expect(await f.items(other.session)).toEqual([])
    await f.call('/modules/miniverb/updates', 'PATCH', { enabled: false }, owner.session)
    await f.publish(release('miniverb', '11.0.0'))
    expect(await f.items(owner.session)).toHaveLength(3)
    // Joining again starts at the published version, with no catch-up alert.
    await f.call('/modules/miniverb/updates', 'PATCH', { enabled: true }, owner.session)
    expect(f.db.prepare('SELECT after_version FROM module_update_subscriptions WHERE user_id=? AND module_id=?').get(owner.id, 'miniverb')!.after_version).toBe('11.0.0')
    f.db.prepare('UPDATE users SET email_verified=0 WHERE id=?').run(other.id)
    expect((await f.call('/modules/miniverb/updates', 'PATCH', { enabled: true }, other.session)).status).toBe(403)
  })

  it('lets new reporters decline release alerts and never unsubscribes an existing follow as a side effect', async () => {
    const f = await fixture(), owner = await f.member('reportfan')
    const declined = await f.call('/modules/miniverb/issues', 'POST', { ...report, notifyUpdates: false }, owner.session)
    expect(declined.status).toBe(201)
    expect(f.db.prepare('SELECT COUNT(*) AS count FROM module_update_subscriptions').get()!.count).toBe(0)
    expect((await f.call('/modules/miniverb/issues', 'POST', { ...report, notifyUpdates: 'yes' }, owner.session)).status).toBe(400)
    expect((await f.call('/modules/miniverb/issues', 'POST', { ...report, notifyUpdates: true }, owner.session)).status).toBe(201)
    await f.call('/modules/miniverb/issues', 'POST', { ...report, notifyUpdates: false }, owner.session)
    expect(f.db.prepare('SELECT COUNT(*) AS count FROM module_update_subscriptions').get()!.count).toBe(1)
  })

  it('uses semantic versions, suppresses retries and rollbacks, and baselines historical reports without old alerts', async () => {
    const f = await fixture(), owner = await f.member('versionfan'), historical = await f.member('oldreporter')
    f.db.prepare('INSERT INTO module_update_subscriptions(user_id,module_id,after_version) VALUES(?,?,?)').run(owner.id, 'miniverb', '0.9.0')
    f.db.prepare('INSERT INTO module_update_subscriptions(user_id,module_id) VALUES(?,?)').run(historical.id, 'miniverb')
    await f.publish(release('miniverb', '0.9.0'))
    expect(await f.items(owner.session)).toHaveLength(0); expect(await f.items(historical.session)).toHaveLength(0)
    for (const version of ['0.10.0-rc.2', '0.10.0-rc.10', '0.10.0']) {
      await f.publish(release('miniverb', version)); await f.publish(release('miniverb', version))
    }
    await f.publish(release('miniverb', '0.9.1'))
    expect(await f.items(owner.session)).toHaveLength(3); expect(await f.items(historical.session)).toHaveLength(3)
    expect(f.db.prepare('SELECT version FROM module_release_state').get()!.version).toBe('0.10.0')
  })

  it('fans out in bounded batches, retries partial runs, and skips suspended or removed members', async () => {
    const { db, adapter } = testDatabase(); databases.push(db)
    for (let i = 0; i < 100; i++) {
      const id = 'fan-' + i
      db.prepare('INSERT INTO users(id,display_name,username,email_verified) VALUES(?,?,?,1)').run(id, id, id)
      db.prepare('INSERT INTO auth_users(id,name,email,emailVerified,createdAt,updatedAt) VALUES(?,?,?,1,0,0)').run(id, id, id + '@example.test')
      db.prepare('INSERT INTO module_update_subscriptions(user_id,module_id,after_version) VALUES(?,?,?)').run(id, 'miniverb', '9.0.0')
    }
    db.prepare('UPDATE users SET suspended=1 WHERE id=?').run('fan-0')
    db.prepare('UPDATE users SET username=NULL WHERE id=?').run('fan-1')
    const batch = adapter.batch.bind(adapter); let count = 0
    const interrupted = { ...adapter, batch: async (statements: Parameters<typeof batch>[0]) => { if (++count === 3) throw new Error('Transient D1 failure'); expect(statements.length).toBeLessThanOrEqual(80); return batch(statements) } }
    await expect(recordModuleReleases(interrupted, [release()])).rejects.toThrow('Transient D1 failure')
    await recordModuleReleases(adapter, [release()]); await recordModuleReleases(adapter, [release()])
    expect(db.prepare('SELECT COUNT(*) AS count FROM notifications').get()!.count).toBe(98)
    expect(db.prepare('SELECT COUNT(*) AS count FROM notifications WHERE user_id IN (?,?)').get('fan-0', 'fan-1')!.count).toBe(0)
  })

  it('reads only the live inventory, supports repository URLs, and rejects malformed releases before writes', async () => {
    const { db, adapter } = testDatabase(); databases.push(db)
    const env = { APP_URL: 'https://example.test/modwerk' }
    const fetch = vi.fn().mockResolvedValueOnce(new Response('', { status: 404 })).mockResolvedValueOnce(Response.json(manifest([release()]))).mockResolvedValueOnce(Response.json(manifest([release('miniverb', '11.0.0'), { ...release('digitakt-digihealth'), version: 'invalid' }])))
    vi.stubGlobal('fetch', fetch)
    expect(await syncModuleReleases(env, adapter)).toEqual({ checked: 0, notified: 0 })
    expect(await syncModuleReleases(env, adapter)).toEqual({ checked: 1, notified: 0 })
    expect(fetch.mock.calls[0][0].href).toBe('https://example.test/modwerk/module-releases.json')
    expect(fetch.mock.calls[0][1].redirect).toBe('manual')
    await expect(syncModuleReleases(env, adapter)).rejects.toThrow('Invalid module semantic version')
    expect(db.prepare('SELECT version FROM module_release_state').get()!.version).toBe('10.0.0')
    expect(() => parseModuleReleases(manifest([release(), release()]))).toThrow()
    expect(() => parseModuleReleases(manifest([{ ...release(), href: 'https://evil.example/' }]))).toThrow()
  })

  it('accepts release links from every catalogue machine and rejects malformed machine routes', () => {
    const releases = COMMUNITY_MODULES.map(({ id, name, version, href }) => ({ id, name, version, href }))
    expect(releases.some(item => item.href === '#analog-rytm-mkii/module/filter-hz')).toBe(true)
    expect(parseModuleReleases(manifest(releases))).toEqual(releases)
    for (const href of ['https://evil.example/module/filter-hz', '#/module/filter-hz', '#analog-rytm-mkii/module/../filter-hz', '#analog-rytm-mkii/module/filter-hz?redirect=elsewhere']) {
      expect(() => parseModuleReleases(manifest([{ ...release(), href }]))).toThrow('Invalid module release.')
    }
  })

  it('uses a Workers-supported fetch mode and rejects redirected inventories before recording releases', async () => {
    const { db, adapter } = testDatabase(); databases.push(db)
    const env = { APP_URL: 'https://example.test/' }
    const fetch = vi.fn(async (_url: URL, options: RequestInit) => {
      if (options.redirect === 'error') throw new TypeError('Invalid redirect value: Workers supports only follow/manual')
      if (options.redirect === 'follow') return Response.json(manifest([release()]))
      return new Response(null, { status: 302, headers: { Location: 'https://other.example/module-releases.json' } })
    })
    vi.stubGlobal('fetch', fetch)
    await expect(syncModuleReleases(env, adapter)).rejects.toThrow('Published module versions could not be checked.')
    expect(db.prepare('SELECT COUNT(*) AS count FROM module_releases').get()!.count).toBe(0)
    expect(db.prepare('SELECT COUNT(*) AS count FROM module_release_inventory').get()!.count).toBe(0)
    fetch.mockImplementation(async (_url: URL, options: RequestInit) => {
      if (options.redirect === 'error') throw new TypeError('Invalid redirect value: Workers supports only follow/manual')
      return Response.json(manifest([release()]))
    })
    expect(await syncModuleReleases(env, adapter)).toEqual({ checked: 1, notified: 0 })
  })

  it('requires valid, version-matched notes before recording any update or advancing followers', async () => {
    const { db, adapter } = testDatabase(); databases.push(db)
    await recordModuleReleases(adapter, [release('miniverb', '9.0.0')])
    db.prepare("INSERT INTO users(id,display_name,username,email_verified) VALUES('fan','Fan','fan',1)").run()
    db.prepare("INSERT INTO auth_users(id,name,email,emailVerified,createdAt,updatedAt) VALUES('fan','Fan','fan@example.test',1,0,0)").run()
    db.prepare("INSERT INTO module_update_subscriptions(user_id,module_id,after_version) VALUES('fan','miniverb','9.0.0')").run()
    const missingNotes = release(); delete missingNotes.notes
    // Legacy inventory is readable and equal versions remain quiet during deployment.
    expect(parseModuleReleases(manifest([missingNotes]))[0].notes).toBeUndefined()
    await expect(recordModuleReleases(adapter, [release('tapeecho'), missingNotes])).rejects.toThrow('Missing release notes for miniverb v10.0.0')
    expect(db.prepare('SELECT version FROM module_release_state').all()).toEqual([{ version: '9.0.0' }])
    expect(db.prepare('SELECT COUNT(*) AS count FROM notifications').get()!.count).toBe(0)
    expect(db.prepare('SELECT after_version FROM module_update_subscriptions').get()!.after_version).toBe('9.0.0')
    const previous = { ...missingNotes, version: '9.0.0' }
    expect(await recordModuleReleases(adapter, [previous])).toEqual({ checked: 1, notified: 0 })
    const notes = release().notes!
    for (const invalid of [{ ...notes, version: '11.0.0' }, { ...notes, changes: [] }, { ...notes, changes: ['Updated'] }, { ...notes, date: '2026-02-30' }]) {
      await expect(recordModuleReleases(adapter, [{ ...release(), notes: invalid }])).rejects.toThrow()
    }
    expect(db.prepare('SELECT version FROM module_release_state').all()).toEqual([{ version: '9.0.0' }])
  })

  it('backfills legacy current-version notes without replaying alerts or overwriting a saved changelog', async () => {
    const { db, adapter } = testDatabase(); databases.push(db)
    db.prepare('INSERT INTO module_release_state(module_id,version) VALUES(?,?)').run('miniverb', '10.0.0')
    db.prepare('INSERT INTO module_releases(module_id,version,name,href) VALUES(?,?,?,?)').run('miniverb', '10.0.0', 'Mini Verb', '#module/miniverb')
    expect(await recordModuleReleases(adapter, [release()])).toEqual({ checked: 1, notified: 0 })
    await recordModuleReleases(adapter, [{ ...release(), notes: { ...release().notes!, changes: ['A later edit must not replace the published changelog.'] } }])
    expect(JSON.parse(String(db.prepare('SELECT notes FROM module_releases').get()!.notes))).toEqual(release().notes)
    expect(db.prepare('SELECT COUNT(*) AS count FROM notifications').get()!.count).toBe(0)
  })

  it('mails only the latest queued version’s saved changes and escapes HTML', async () => {
    const f = await fixture(), owner = await f.member('changelogfan')
    await f.call('/modules/miniverb/updates', 'PATCH', { enabled: true }, owner.session)
    const first = release()
    const second = { ...release('miniverb', '11.0.0'), notes: { ...release('miniverb', '11.0.0').notes!, changes: ['Fix the <script>alert(1)</script> control & retain playback.', 'Known limitation: hardware reboot persistence is unverified.', 'Retain the complete authored release note, including longer explanations of playback behavior and the exact conditions needed to reproduce a problem, without reducing it to a short notification excerpt.'] } }
    await f.publish(first); await f.publish(second)
    await f.publish({ ...second, notes: { ...second.notes, changes: ['These later changes must not appear in the saved update email.'] } })
    expect(await f.digests()).toEqual({ sent: 1 })
    for (const change of second.notes.changes) expect(sent[0].text).toContain('  - ' + change)
    expect(sent[0].text).not.toContain('Mini Verb 10.0.0 is now available')
    expect(sent[0].text).toContain('Mini Verb 11.0.0 is now available')
    expect(sent[0].html).toContain('Fix the &lt;script&gt;alert(1)&lt;/script&gt; control &amp; retain playback.')
    expect(sent[0].html).toContain('<li>Known limitation: hardware reboot persistence is unverified.</li>')
    expect(sent[0].html).not.toContain('<script>')
    expect(sent[0].text).not.toContain('These later changes')
    expect(sent[0].text).toContain('https://octamod.test/#module/miniverb?tab=changelog')
    expect(await f.items(owner.session)).toHaveLength(2)
    expect(f.db.prepare("SELECT COUNT(*) AS count FROM notifications WHERE kind='module_update' AND emailed=0").get()!.count).toBe(0)
  })

  it('collects different modules for a day and enforces daily spacing for existing six-hour preferences', async () => {
    const f = await fixture(), owner = await f.member('dailyfan')
    const ids = ['miniverb', 'digitakt-digihealth', 'digitone-digihealth']
    for (const id of ids) await f.call('/modules/' + id + '/updates', 'PATCH', { enabled: true }, owner.session)
    await f.call('/notifications/preferences', 'PATCH', { frequency: 'hours' }, owner.session)
    await f.publish(...ids.map(id => release(id)))
    const base = Date.now()
    const stamp = (minutes: number) => new Date(base + minutes * 60000).toISOString().replace('T', ' ').slice(0, 19)
    f.db.prepare("UPDATE notifications SET created_at=? WHERE module_id='digitakt-digihealth'").run(stamp(6 * 60))
    f.db.prepare("UPDATE notifications SET created_at=? WHERE module_id='digitone-digihealth'").run(stamp(14 * 60))
    expect(await f.digests(15)).toEqual({ sent: 0 })
    expect(await f.digests(23 * 60)).toEqual({ sent: 0 })
    expect(await f.digests()).toEqual({ sent: 1 })
    expect(sent).toHaveLength(1)
    expect(sent[0].subject).toBe('Your daily Modwerk module updates (3)')
    for (const id of ids) expect(sent[0].text).toContain(release(id).name)
    const last = f.db.prepare('SELECT last_module_digest_at FROM notification_preferences WHERE user_id=?').get(owner.id)!.last_module_digest_at
    await f.publish(release('miniverb', '11.0.0'))
    f.db.prepare("UPDATE notifications SET created_at=? WHERE module_version='11.0.0'").run(stamp(25 * 60))
    expect(await f.digests(31 * 60)).toEqual({ sent: 0 })
    expect(f.db.prepare('SELECT last_module_digest_at FROM notification_preferences WHERE user_id=?').get(owner.id)!.last_module_digest_at).toBe(last)
    expect(await f.digests(48 * 60 + 16)).toEqual({ sent: 1 })
    expect(sent[0].text).toContain('Mini Verb 11.0.0')
    expect(sent[0].text).not.toContain('Mini Verb 10.0.0')
  })

  it('sends other activity on its chosen interval without discarding or counting deferred releases', async () => {
    const f = await fixture(), owner = await f.member('mixedfan'), other = await f.member('mixedauthor')
    await f.call('/modules/miniverb/updates', 'PATCH', { enabled: true }, owner.session)
    const { id } = await (await f.call('/forum/threads', 'POST', { title: 'Daily updates', body: 'Discuss updates.', category: 'general' }, owner.session)).json()
    await f.publish(release())
    await f.call('/forum/threads/' + id + '/replies', 'POST', { body: 'A timely reply.' }, other.session)
    expect(await f.digests(15)).toEqual({ sent: 1 })
    expect(sent[0].text).toContain('A timely reply.')
    expect(sent[0].text).not.toContain('Mini Verb 10.0.0')
    expect(sent[0].text).not.toContain('more in your notifications')
    expect(f.db.prepare("SELECT emailed FROM notifications WHERE kind='module_update'").get()!.emailed).toBe(0)
    expect(f.db.prepare('SELECT last_module_digest_at FROM notification_preferences WHERE user_id=?').get(owner.id)!.last_module_digest_at).toBeNull()
    expect(await f.digests()).toEqual({ sent: 1 })
    expect(sent[0].text).toContain('Mini Verb 10.0.0')
  })

  it('never mails a like on its own and carries likes in the daily release digest', async () => {
    const f = await fixture(), owner = await f.member('likedfan'), fan = await f.member('likefan')
    await f.call('/modules/miniverb/updates', 'PATCH', { enabled: true }, owner.session)
    const { id } = await (await f.call('/forum/threads', 'POST', { title: 'Liked post', body: 'Like this.', category: 'general' }, owner.session)).json()
    const postId = (await (await f.call('/forum/threads/' + id)).json()).posts[0].id
    await f.call('/forum/posts/' + postId + '/react', 'POST', { liked: true }, fan.session)
    expect(await f.digests(15)).toEqual({ sent: 0 })
    // Other activity mails on its interval without the like.
    await f.call('/forum/threads/' + id + '/replies', 'POST', { body: 'A timely reply.' }, fan.session)
    expect(await f.digests(15)).toEqual({ sent: 1 })
    expect(sent[0].text).toContain('A timely reply.')
    expect(sent[0].text).not.toContain('@likefan liked')
    await f.publish(release())
    expect(await f.digests()).toEqual({ sent: 1 })
    expect(sent[0].text).toContain('Mini Verb 10.0.0')
    expect(sent[0].text).toContain('@likefan liked')
    expect(f.db.prepare('SELECT COUNT(*) AS count FROM notifications WHERE emailed=0').get()!.count).toBe(0)
  })

  it('waits for a fresh latest version to settle and reading it suppresses obsolete release mail', async () => {
    const f = await fixture(), owner = await f.member('freshfan')
    await f.call('/modules/miniverb/updates', 'PATCH', { enabled: true }, owner.session)
    await f.publish(release()); await f.publish(release('miniverb', '11.0.0'))
    const fresh = new Date(Date.now() + (24 * 60 + 14) * 60000).toISOString().replace('T', ' ').slice(0, 19)
    f.db.prepare("UPDATE notifications SET created_at=? WHERE module_version='11.0.0'").run(fresh)
    expect(await f.digests()).toEqual({ sent: 0 })
    expect(f.db.prepare("SELECT COUNT(*) AS count FROM notifications WHERE emailed=0").get()!.count).toBe(2)
    const latest = (await f.items(owner.session)).find(item => item.module_version === '11.0.0')!
    await f.call('/notifications', 'PATCH', { ids: [latest.id] }, owner.session)
    expect(await f.digests(25 * 60)).toEqual({ sent: 0 })
    expect(f.db.prepare("SELECT COUNT(*) AS count FROM notifications WHERE emailed=0").get()!.count).toBe(0)
    expect(await f.items(owner.session)).toHaveLength(2)
  })

  it('keeps the daily batch queued when delivery fails, then retries it without obsolete versions', async () => {
    const f = await fixture(), owner = await f.member('retryfan')
    await f.call('/modules/miniverb/updates', 'PATCH', { enabled: true }, owner.session)
    await f.publish(release()); await f.publish(release('miniverb', '11.0.0'))
    vi.mocked(fetch).mockResolvedValueOnce(new Response('{}', { status: 500 }))
    expect(await f.digests()).toEqual({ sent: 0 })
    expect(f.db.prepare('SELECT last_module_digest_at FROM notification_preferences WHERE user_id=?').get(owner.id)?.last_module_digest_at ?? null).toBeNull()
    expect(f.db.prepare('SELECT COUNT(*) AS count FROM notifications WHERE emailed=0').get()!.count).toBe(2)
    expect(await f.digests(25 * 60)).toEqual({ sent: 1 })
    expect(sent[0].text).toContain('Mini Verb 11.0.0')
    expect(sent[0].text).not.toContain('Mini Verb 10.0.0')
    expect(f.db.prepare('SELECT COUNT(*) AS count FROM notifications WHERE emailed=0').get()!.count).toBe(0)
  })

  it('retains releases beyond the bounded read window and settles all obsolete versions after sending', async () => {
    const f = await fixture(), owner = await f.member('burstfan')
    await f.call('/modules/miniverb/updates', 'PATCH', { enabled: true }, owner.session)
    await f.publish(release())
    const fresh = new Date(Date.now() + (24 * 60 + 14) * 60000).toISOString().replace('T', ' ').slice(0, 19)
    const insert = f.db.prepare("INSERT INTO notifications(id,user_id,kind,module_id,module_version,created_at) VALUES(?,?,'module_update','miniverb',?,?)")
    for (let index = 0; index < 500; index++) insert.run('burst-' + index, owner.id, '11.0.' + index, fresh)
    expect(await f.digests()).toEqual({ sent: 0 })
    expect(f.db.prepare('SELECT COUNT(*) AS count FROM notifications WHERE emailed=0').get()!.count).toBe(501)
    expect(await f.digests(25 * 60)).toEqual({ sent: 1 })
    expect(sent[0].text).toContain('11.0.499 is now available')
    expect(sent[0].subject).toBe('Your daily Modwerk module updates (1)')
    expect(f.db.prepare('SELECT COUNT(*) AS count FROM notifications WHERE emailed=0').get()!.count).toBe(0)
    expect(f.db.prepare('SELECT COUNT(*) AS count FROM notifications WHERE seen=0').get()!.count).toBe(501)
  })

  it.each(['digitakt-digihealth', 'digitone-digihealth'])('includes the version-matched changelog and instrument link for %s', async id => {
    const f = await fixture(), owner = await f.member('digifan')
    await f.call('/modules/' + id + '/updates', 'PATCH', { enabled: true }, owner.session)
    const published = release(id)
    await f.publish(published)
    expect(await f.digests()).toEqual({ sent: 1 })
    expect(sent[0].text).toContain(published.notes!.changes[0])
    expect(sent[0].html).toContain('<li>' + published.notes!.changes[0] + '</li>')
    expect(sent[0].text).toContain('https://octamod.test/' + published.href + '?tab=changelog')
  })

  it('includes the published version in bell and email, respects the update topic, and exports/deletes follows', async () => {
    const f = await fixture(), owner = await f.member('mailfan'), silent = await f.member('silentfan')
    for (const user of [owner, silent]) await f.call('/modules/miniverb/updates', 'PATCH', { enabled: true }, user.session)
    await f.call('/notifications/preferences', 'PATCH', { updates: false }, silent.session)
    await f.publish(release())
    expect(notificationLines(await f.items(owner.session))[0]).toMatchObject({ text: 'Mini Verb 10.0.0 is now available', href: '#module/miniverb?tab=changelog' })
    expect(await f.digests()).toEqual({ sent: 1 })
    expect(sent[0].to).toEqual([owner.email]); expect(sent[0].text).toContain('Mini Verb 10.0.0 is now available'); expect(sent[0].text).toContain('https://octamod.test/#module/miniverb')
    expect(sent[0].text).toContain(release().notes!.changes[0]); expect(sent[0].html).toContain('<li>' + release().notes!.changes[0] + '</li>')
    expect(await f.items(silent.session)).toHaveLength(1)
    expect(await (await f.call('/modules/miniverb/updates', 'GET', undefined, silent.session)).json()).toMatchObject({ enabled: true, emailEnabled: false })
    await f.call('/modules/tapeecho/updates', 'PATCH', { enabled: false }, owner.session)
    const exported = await (await f.call('/auth/data-export', 'POST', { password }, owner.session)).json()
    expect(exported.data.moduleUpdateOptOuts).toEqual([{ module_id: 'tapeecho', created_at: expect.any(String) }])
    expect(exported.data.moduleUpdateSubscriptions).toEqual([{ module_id: 'miniverb', after_version: '10.0.0', created_at: expect.any(String) }])
    expect(exported.data.notifications[0]).toMatchObject({ kind: 'module_update', module_version: '10.0.0' })
    expect((await f.call('/auth/account', 'DELETE', { password, confirm: 'DELETE' }, owner.session)).status).toBe(200)
    expect(f.db.prepare('SELECT COUNT(*) AS count FROM module_update_subscriptions WHERE user_id=?').get(owner.id)!.count).toBe(0)
    expect(f.db.prepare('SELECT COUNT(*) AS count FROM module_update_opt_outs WHERE user_id=?').get(owner.id)!.count).toBe(0)
    expect(f.db.prepare('SELECT COUNT(*) AS count FROM module_update_subscriptions WHERE user_id=?').get(silent.id)!.count).toBe(1)
  })
})

describe('new module release announcements', () => {
  it('does not announce historical modules when the first inventory is interrupted and retried', async () => {
    const { db, adapter } = testDatabase(); databases.push(db)
    const batch = adapter.batch.bind(adapter); let calls = 0
    const interrupted = { ...adapter, batch: async (statements: Parameters<typeof batch>[0]) => {
      if (++calls === 2) throw new Error('Transient initial inventory failure')
      return batch(statements)
    } }
    await expect(recordModuleReleases(interrupted, [release('miniverb'), release('tapeecho')])).rejects.toThrow('Transient initial inventory failure')
    expect(db.prepare('SELECT COUNT(*) AS count FROM module_release_inventory').get()!.count).toBe(0)
    await recordModuleReleases(adapter, [release('miniverb'), release('tapeecho')])
    expect(db.prepare('SELECT COUNT(*) AS count FROM announcements').get()!.count).toBe(0)
    await recordModuleReleases(adapter, [release('vector')])
    expect(db.prepare('SELECT module_id FROM announcements').all()).toEqual([{ module_id: 'vector' }])
  })

  it('baselines the library, then announces new modules publicly with private acknowledgements and no bell, email or push', async () => {
    const f = await fixture(), one = await f.member('releaseone'), two = await f.member('releasetwo')
    await f.publish(release('miniverb'), release('tapeecho'))
    expect(await f.items(one.session)).toEqual([])
    await f.publish(release('vector', '0.2.3-experimental'), release('synth', '0.1.1-experimental'))
    const publicItems = async (session: string) => (await (await f.call('/announcements/mine', 'GET', undefined, session)).json()).items as BellItem[]
    const items = await publicItems(one.session)
    expect(items).toHaveLength(2)
    expect(items.map(item => item.kind)).toEqual(['announcement', 'announcement'])
    expect(notificationLines(items)).toEqual(expect.arrayContaining([
      expect.objectContaining({ text: 'VECTOR is now available', href: '#module/vector' }),
      expect.objectContaining({ text: 'FM Synth is now available', href: '#module/fm-synth' }),
    ]))
    expect(await f.items(one.session)).toEqual([])
    expect(await (await f.call('/notifications/unread', 'GET', undefined, two.session)).json()).toEqual({ unread: 0 })
    await f.call('/announcements/mine', 'PATCH', { ids: [items[0].id] }, one.session)
    expect((await publicItems(one.session)).filter(item => item.seen)).toHaveLength(1)
    expect((await publicItems(two.session)).every(item => !item.seen)).toBe(true)
    expect(await f.digests()).toEqual({ sent: 0 })
    expect(f.db.prepare('SELECT COUNT(*) AS count FROM notifications').get()!.count).toBe(0)
    expect(f.db.prepare('SELECT COUNT(*) AS count FROM push_deliveries').get()!.count).toBe(0)
    // Public release history remains readable by visitors and members who join later.
    f.db.prepare("UPDATE announcements SET created_at=datetime('now','-1 minute')").run()
    const late = await f.member('releaselate')
    expect(await f.items(late.session)).toEqual([])
    expect(await publicItems(late.session)).toHaveLength(2)
    const publicBell = await f.call('/announcements')
    expect(publicBell.status).toBe(200)
    expect((await publicBell.json()).items).toHaveLength(2)
  })

  it('announces each module once despite retries, newer versions and reintroduction, including across instruments', async () => {
    const { db, adapter } = testDatabase(); databases.push(db)
    await recordModuleReleases(adapter, [release('miniverb')])
    const modules = [release('vector'), release('digitakt-digihealth'), release('digitone-digihealth')]
    await recordModuleReleases(adapter, modules); await recordModuleReleases(adapter, modules)
    await recordModuleReleases(adapter, [release('vector', '11.0.0')])
    await recordModuleReleases(adapter, [release('vector', '9.0.0')])
    db.prepare('DELETE FROM module_release_state WHERE module_id=?').run('vector')
    await recordModuleReleases(adapter, [release('vector', '11.0.0')])
    expect(db.prepare('SELECT module_id,url FROM announcements ORDER BY module_id').all()).toEqual([
      { module_id: 'digitakt-digihealth', url: '#digitakt/module/digihealth' },
      { module_id: 'digitone-digihealth', url: '#digitone/module/digihealth' },
      { module_id: 'vector', url: '#module/vector' },
    ])
  })

  it('retries an interrupted publication without losing the new module announcement or duplicating it', async () => {
    const { db, adapter } = testDatabase(); databases.push(db)
    await recordModuleReleases(adapter, [release('miniverb')])
    const batch = adapter.batch.bind(adapter)
    const interrupted = { ...adapter, batch: async () => { throw new Error('Transient D1 failure') } }
    await expect(recordModuleReleases(interrupted, [release('vector')])).rejects.toThrow('Transient D1 failure')
    expect(db.prepare('SELECT COUNT(*) AS count FROM announcements').get()!.count).toBe(0)
    await recordModuleReleases({ ...adapter, batch }, [release('vector')])
    await recordModuleReleases(adapter, [release('vector')])
    expect(db.prepare('SELECT COUNT(*) AS count FROM announcements').get()!.count).toBe(1)
    expect(db.prepare('SELECT version FROM module_release_state WHERE module_id=?').get('vector')!.version).toBe('10.0.0')
  })

  it('announces the missed Digitakt and Digitone imports exactly as the automatic announcement would, once, and only where members exist', async () => {
    const migration = readFileSync(new URL('../../migrations/0039_announce_digitakt_digitone_imports.sql', import.meta.url), 'utf8')
    const imports = [['digitakt-digichain', '1.6.0'], ['digitakt-digieq', '1.0.0'], ['digitakt-digimatrix', '1.0.0'], ['digitakt-digimono', '0.13.0'], ['digitakt-digipoly', '2.0.0'], ['digitakt-digiutils', '1.9.0'], ['digitone-digitables', '1.3.0']]
      .map(([id, version]) => release(id, version + '-experimental'))
    const rows = (db: DatabaseSync) => db.prepare('SELECT slug,title,body,url,module_id,created_by FROM announcements ORDER BY slug').all()
    // The automatic path, on a library that was already baselined, is the reference for the text and keys.
    const automatic = testDatabase(); databases.push(automatic.db)
    await recordModuleReleases(automatic.adapter, [release('miniverb')]); await recordModuleReleases(automatic.adapter, imports)
    expect(rows(automatic.db)).toHaveLength(7)
    const { db, adapter } = testDatabase(); databases.push(db)
    // The migration already ran while this database had no members, so it announced to nobody.
    expect(rows(db)).toEqual([])
    db.prepare('INSERT INTO users(id,display_name,username,email_verified) VALUES(?,?,?,1)').run('member', 'Member', 'member')
    db.exec(migration); db.exec(migration)
    expect(rows(db)).toEqual(rows(automatic.db))
    // When the hourly check does reach these modules later, it finds each already announced.
    await recordModuleReleases(adapter, [release('miniverb')]); await recordModuleReleases(adapter, imports)
    expect(rows(db)).toHaveLength(7)
  })
})

describe('report status notifications', () => {
  it('notifies once per local status transition through either admin route and mails unread statuses', async () => {
    const f = await fixture(), owner = await f.member('statusreporter'), admin = await f.admin()
    const created = await f.call('/modules/miniverb/issues', 'POST', { ...report, notifyUpdates: false }, owner.session)
    expect(created.status).toBe(201)
    const { id } = await created.json()
    expect((await f.call('/issues/' + id, 'PATCH', { status: 'closed' }, owner.session)).status).toBe(403)
    for (let i = 0; i < 2; i++) expect((await f.call('/admin/issues/' + id, 'PATCH', { status: 'closed' }, '', admin)).status).toBe(200)
    expect((await f.items(owner.session)).map(item => item.kind)).toEqual(['issue_resolved'])
    for (let i = 0; i < 2; i++) expect((await f.call('/issues/' + id, 'PATCH', { status: 'open' }, '', admin)).status).toBe(200)
    expect((await f.items(owner.session)).map(item => item.kind)).toEqual(['issue_reopened', 'issue_resolved'])
    expect(await f.digests()).toEqual({ sent: 1 })
    expect(sent[0].text).toContain('reopened your bug report'); expect(sent[0].text).toContain('as fixed'); expect(sent[0].text).toContain('#account/report/' + id)
  })

  it('notifies for authorized maintainer changes, forum fallback changes, and keeps reporter self-actions quiet', async () => {
    const f = await fixture(), owner = await f.member('localreporter'), moderator = await f.member('forummoderator'), admin = await f.admin()
    const privateReport = await (await f.call('/modules/miniverb/issues', 'POST', { ...report, maintainerSharing: true, notifyUpdates: false }, owner.session)).json()
    const author = communityModule('miniverb')!.author, developer: User = { id: 'verified-developer', display_name: author, github_id: '42', github_login: author }
    f.db.prepare('INSERT INTO users(id,display_name,github_id,github_login) VALUES(?,?,?,?)').run(developer.id, author, developer.github_id!, author)
    f.db.prepare('INSERT INTO module_maintainers(module_id,user_id,github_login) VALUES(?,?,?)').run('miniverb', developer.id, author)
    const patch = () => developerApi(new Request('https://api.example.test/api/issues/' + privateReport.id, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'closed' }) }), f.env.DB!, null, false, developer)
    expect((await patch())!.status).toBe(200); expect((await patch())!.status).toBe(200)
    expect((await f.items(owner.session)).map(item => item.kind)).toEqual(['issue_resolved'])
    const publicReport = await (await f.call('/modules/miniverb/issues', 'POST', { ...report, visibility: 'forum', notifyUpdates: false }, owner.session)).json()
    expect((await f.call('/forum/threads/' + publicReport.forumThreadId + '/status', 'PATCH', { status: 'resolved' }, moderator.session, admin)).status).toBe(200)
    expect(await f.items(owner.session)).toHaveLength(2)
    await f.call('/forum/threads/' + publicReport.forumThreadId + '/status', 'PATCH', { status: 'open' }, owner.session)
    expect(await f.items(owner.session)).toHaveLength(2)
    expect(f.db.prepare('SELECT status FROM issues WHERE id=?').get(publicReport.id)!.status).toBe('open')
  })

  it('keeps sending status digests when the published release inventory is temporarily unavailable', async () => {
    const f = await fixture(), owner = await f.member('hourlyreporter'), admin = await f.admin()
    const { id } = await (await f.call('/modules/miniverb/issues', 'POST', { ...report, notifyUpdates: false }, owner.session)).json()
    await f.call('/admin/issues/' + id, 'PATCH', { status: 'closed' }, '', admin)
    f.db.prepare("UPDATE notifications SET created_at=datetime('now','-15 minutes')").run()
    sent.length = 0
    vi.stubGlobal('fetch', vi.fn(async (url: string | URL, options: RequestInit) => {
      if (String(url).endsWith('/module-releases.json')) return new Response('', { status: 503 })
      expect(url).toBe('https://api.resend.com/emails'); sent.push(JSON.parse(String(options.body)))
      return Response.json({ id: crypto.randomUUID() })
    }))
    const failure = vi.spyOn(console, 'error').mockImplementation(() => {}), jobs: Promise<unknown>[] = []
    // SQLite has one connection; serialize concurrent D1 batches for the scheduled-job fixture.
    const database=f.env.DB!, batch=database.batch.bind(database)
    let pending: Promise<unknown> = Promise.resolve()
    f.env.DB={...database,batch: statements=>{const next=pending.then(()=>batch(statements));pending=next.catch(()=>{});return next}}
    try {
      worker.scheduled({ cron: '0 * * * *' }, f.env, { waitUntil: job => jobs.push(job) })
      await Promise.all(jobs)
      expect(sent).toHaveLength(1); expect(sent[0].to).toEqual([owner.email])
      // The log names the cause, so a sync that keeps failing is diagnosable from Workers Logs.
      expect(failure).toHaveBeenCalledOnce(); expect(String(failure.mock.calls[0][0])).toContain('retrying next hour: Error: Published module versions could not be checked.')
    } finally { failure.mockRestore() }
  })
})

it('migrates historical reporters and existing push queues without losing deliveries or fanout triggers', () => {
  const db = new DatabaseSync(':memory:'); databases.push(db)
  const migrations = readdirSync(new URL('../../migrations/', import.meta.url)).filter(name => name.endsWith('.sql')).sort()
  for (const name of migrations.filter(name => name < '0034')) db.exec(readFileSync(new URL('../../migrations/' + name, import.meta.url), 'utf8'))
  db.prepare('INSERT INTO users(id,display_name,username,email_verified,is_admin) VALUES(?,?,?,1,1)').run('owner', 'Owner', 'owner')
  db.prepare('INSERT INTO auth_users(id,name,email,emailVerified,createdAt,updatedAt) VALUES(?,?,?,1,0,0)').run('owner', 'Owner', 'owner@example.test')
  db.prepare('INSERT INTO issues(id,module_id,author_login,reporter_id,title,body) VALUES(?,?,?,?,?,?)').run('old-issue', 'miniverb', 'author', 'owner', 'Old bug', 'Private details')
  db.prepare('INSERT INTO push_subscriptions(id,user_id,endpoint,p256dh,auth,vapid_key,activity,signups) VALUES(?,?,?,?,?,?,1,1)').run('device', 'owner', 'https://push.example/', 'key', 'auth', 'vapid')
  db.prepare("INSERT INTO notifications(id,user_id,kind,issue_id,delivery_id) VALUES('old-notification','owner','issue_resolved','old-issue','old-delivery')").run()
  db.prepare('UPDATE push_deliveries SET attempts=2,retry_at=123,locked_until=456').run()
  const pending = db.prepare('SELECT * FROM push_deliveries').all()
  db.exec(readFileSync(new URL('../../migrations/0034_module_update_notifications.sql', import.meta.url), 'utf8'))
  expect(db.prepare('PRAGMA foreign_key_check').all()).toEqual([])
  expect(db.prepare('SELECT * FROM push_deliveries').all()).toEqual(pending)
  expect(db.prepare('SELECT module_id,after_version FROM module_update_subscriptions').all()).toEqual([{ module_id: 'miniverb', after_version: null }])
  db.prepare("INSERT INTO notifications(id,user_id,kind,module_id,module_version) VALUES('new-release','owner','module_update','miniverb','1.0.0')").run()
  db.prepare("INSERT INTO signup_events(user_id,username) VALUES('owner','owner')").run()
  expect(db.prepare('SELECT COUNT(*) AS count FROM push_deliveries').get()!.count).toBe(3)
  expect(db.prepare('SELECT id FROM notifications WHERE delivery_id=?').get('old-delivery')!.id).toBe('old-notification')
})

it('migrates existing digest timing while preserving email opt-outs and topic preferences', () => {
  const db = new DatabaseSync(':memory:'); databases.push(db)
  for (const name of readdirSync(new URL('../../migrations/', import.meta.url)).filter(name => name.endsWith('.sql') && name < '0069').sort()) db.exec(readFileSync(new URL('../../migrations/' + name, import.meta.url), 'utf8'))
  db.prepare("INSERT INTO users(id,display_name,username,email_verified) VALUES('existing','Existing','existing',1)").run()
  db.prepare("INSERT INTO notification_preferences(user_id,email_enabled,frequency,updates,last_digest_at) VALUES('existing',0,'hours',0,'2026-10-12 08:00:00')").run()
  db.exec(readFileSync(new URL('../../migrations/0069_daily_module_digests.sql', import.meta.url), 'utf8'))
  expect(db.prepare('SELECT email_enabled,frequency,updates,last_digest_at,last_module_digest_at FROM notification_preferences').get()).toEqual({ email_enabled: 0, frequency: 'hours', updates: 0, last_digest_at: '2026-10-12 08:00:00', last_module_digest_at: '2026-10-12 08:00:00' })
})
