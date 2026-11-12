import { afterEach, describe, expect, it } from 'vitest'
import type { DatabaseSync } from 'node:sqlite'
import { testServer } from './test-server'
import { digest } from '../../server/security'
import { recordModuleReleases } from '../../server/module-updates'
import { communityModule } from './modules'
import { PAUSED_MODULE_IDS, isBetaModule } from '../catalog/availability'
import { notificationLines } from './notification-text'

const databases: DatabaseSync[] = []
afterEach(() => { for (const db of databases.splice(0)) db.close() })
async function fixture() {
  const server = await testServer(); databases.push(server.db)
  const user = 'download-member', token = 'a'.repeat(64)
  server.db.prepare("INSERT INTO users(id,display_name,username,email_verified) VALUES(?,'Downloader','downloader',1)").run(user)
  server.db.prepare("INSERT INTO auth_users(id,name,email,emailVerified,createdAt,updatedAt) VALUES(?,'Downloader','downloader@example.test',1,0,0)").run(user)
  server.db.prepare('INSERT INTO sessions(token_hash,user_id,expires) VALUES(?,?,?)').run(await digest(token), user, Math.floor(Date.now() / 1000) + 600)
  return { ...server, user, token }
}

describe('automatic download update follows', () => {
  it.each(['miniverb', 'digitakt-digihealth', 'digitone-digihealth'])('follows %s once and preserves an explicit opt-out until manually re-enabled', async id => {
    const { call, db, user, token } = await fixture()
    const download = () => call('/modules/' + id + '/download', 'POST', {}, token)
    expect(await (await download()).json()).toEqual({ enabled: true })
    expect(await (await download()).json()).toEqual({ enabled: true })
    expect(db.prepare('SELECT COUNT(*) AS count FROM module_update_subscriptions WHERE module_id=? AND user_id=?').get(id, user)!.count).toBe(1)
    expect(db.prepare('SELECT COUNT(*) AS count FROM forum_follows WHERE user_id=?').get(user)!.count).toBe(0)
    expect((await call('/modules/' + id + '/updates', 'PATCH', { enabled: false }, token)).status).toBe(200)
    expect(await (await download()).json()).toEqual({ enabled: false })
    expect(await (await download()).json()).toEqual({ enabled: false })
    expect(await (await call('/modules/' + id + '/updates', 'GET', undefined, token)).json()).toMatchObject({ enabled: false })
    expect((await call('/modules/' + id + '/updates', 'PATCH', { enabled: true }, token)).status).toBe(200)
    expect(await (await download()).json()).toEqual({ enabled: true })
    expect(db.prepare('SELECT COUNT(*) AS count FROM module_update_opt_outs WHERE user_id=?').get(user)!.count).toBe(0)
  })

  it('requires a verified member and refuses unknown/unavailable modules and download data', async () => {
    const { call, token, db, user } = await fixture()
    expect((await call('/modules/miniverb/download', 'POST', {})).status).toBe(401)
    expect((await call('/modules/' + PAUSED_MODULE_IDS.find(id => !isBetaModule(id)) + '/download', 'POST', {}, token)).status).toBe(400)
    expect((await call('/modules/unknown/download', 'POST', {}, token)).status).toBe(404)
    expect((await call('/modules/miniverb/download', 'POST', { firmware: 'bytes' }, token)).status).toBe(400)
    db.prepare('UPDATE users SET email_verified=0 WHERE id=?').run(user)
    expect((await call('/modules/miniverb/download', 'POST', {}, token)).status).toBe(403)
  })

  it('uses published version history, notifies once, and stops future releases and pending email on opt-out', async () => {
    const { call, db, env, token, user } = await fixture()
    const module = communityModule('miniverb')!
    const release = (version: string) => ({ id: module.id, name: module.name, href: module.href, version, notes: { version, date: '2026-10-08', changes: ['Correct the playback behavior for this version.'] } })
    await recordModuleReleases(env.DB!, [release('1.0.0')])
    await call('/modules/miniverb/download', 'POST', {}, token)
    expect(db.prepare("SELECT COUNT(*) AS count FROM notifications WHERE kind='module_update'").get()!.count).toBe(0)
    await recordModuleReleases(env.DB!, [release('2.0.0')])
    await recordModuleReleases(env.DB!, [release('2.0.0')])
    await recordModuleReleases(env.DB!, [release('1.0.0')])
    const changelog = await (await call('/modules/miniverb/changelog')).json()
    expect(changelog.releases.map((item: { version: string }) => item.version)).toEqual(['2.0.0', '1.0.0'])
    expect(changelog.releases[0].previousVersion).toBe('1.0.0')
    expect(changelog.releases[1].previousVersion).toBeNull()
    const items = (await (await call('/notifications', 'GET', undefined, token)).json()).items
    expect(notificationLines(items)).toContainEqual(expect.objectContaining({ href: module.href + '?tab=changelog', text: module.name + ' 2.0.0 is now available' }))
    await call('/modules/miniverb/updates', 'PATCH', { enabled: false }, token)
    expect(db.prepare("SELECT emailed FROM notifications WHERE user_id=? AND kind='module_update'").get(user)!.emailed).toBe(1)
    await call('/modules/miniverb/download', 'POST', {}, token)
    await recordModuleReleases(env.DB!, [release('3.0.0')])
    expect(db.prepare("SELECT COUNT(*) AS count FROM notifications WHERE user_id=? AND kind='module_update'").get(user)!.count).toBe(1)
  })

  it('serves empty history publicly and rejects unknown modules', async () => {
    const { call } = await fixture()
    expect(await (await call('/modules/miniverb/changelog')).json()).toEqual({ releases: [] })
    expect((await call('/modules/unknown/changelog')).status).toBe(404)
  })
})
