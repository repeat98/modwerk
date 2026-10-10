import type { Database, Env } from './platform'
import { canTrackModuleDownload } from '../src/community/module-downloads'
import { compareModuleVersions } from '../src/catalog/versions'
import { parseModuleReleases, type ModuleRelease } from '../src/community/module-release-contract'
import { communityModule } from '../src/community/modules'
import { isBetaModule } from '../src/catalog/availability'
import { memberBetaAccess } from './beta-testers'
import { isAdmin, needMember, throttle } from './auth'
import { emailReady } from './email'
import { moduleReleaseAnnouncement } from './announcements'
import { digest, HttpError, jsonBody, response } from './security'

/** A new report follows module releases unless its reporter declines this in the form. */
export function followReportedModule(db: Database, moduleId: string, userId: string) {
  return db.prepare(`INSERT INTO module_update_subscriptions(user_id,module_id,after_version) VALUES(?,?,COALESCE((SELECT version FROM module_release_state WHERE module_id=?),?)) ON CONFLICT(user_id,module_id) DO NOTHING`).bind(userId, moduleId, moduleId, communityModule(moduleId)?.version ?? null)
}

/** A configuration report follows releases of each of its modules the reporter has not opted out of. */
export function followReportedModules(db: Database, moduleIds: readonly string[], userId: string) {
  return moduleIds.map(moduleId => db.prepare(`INSERT INTO module_update_subscriptions(user_id,module_id,after_version) SELECT ?,?,COALESCE((SELECT version FROM module_release_state WHERE module_id=?),?) WHERE NOT EXISTS(SELECT 1 FROM module_update_opt_outs WHERE user_id=? AND module_id=?) ON CONFLICT(user_id,module_id) DO NOTHING`).bind(userId, moduleId, moduleId, communityModule(moduleId)?.version ?? null, userId, moduleId))
}

export async function moduleUpdateRoutes(request: Request, env: Env, db: Database, moduleId: string, user: Parameters<typeof needMember>[0]) {
  const member = needMember(user)
  // Reviewed catalog modules have release versions; sets and legacy contributions have no versioned publication flow.
  if (!communityModule(moduleId)) throw new HttpError(404, 'Update notifications are available for catalog modules.')
  if (request.method === 'PATCH') {
    const body = await jsonBody(request)
    if (typeof body.enabled !== 'boolean' || Object.keys(body).some(key => key !== 'enabled')) throw new HttpError(400, 'Choose whether to follow module updates.')
    await throttle(db, 'module-updates:' + member.id, 60)
    await db.batch(body.enabled ? [
      db.prepare('DELETE FROM module_update_opt_outs WHERE user_id=? AND module_id=?').bind(member.id, moduleId),
      followReportedModule(db, moduleId, member.id),
    ] : [
      db.prepare('INSERT INTO module_update_opt_outs(user_id,module_id) VALUES(?,?) ON CONFLICT DO NOTHING').bind(member.id, moduleId),
      db.prepare('DELETE FROM module_update_subscriptions WHERE user_id=? AND module_id=?').bind(member.id, moduleId),
      db.prepare("UPDATE notifications SET emailed=1 WHERE user_id=? AND module_id=? AND kind='module_update' AND emailed=0").bind(member.id, moduleId),
    ])
  } else if (request.method !== 'GET') throw new HttpError(405, 'Choose a supported module update action.')
  const [subscribed, preference, release] = await Promise.all([
    db.prepare('SELECT 1 AS enabled FROM module_update_subscriptions WHERE user_id=? AND module_id=?').bind(member.id, moduleId).first(),
    db.prepare('SELECT email_enabled,updates FROM notification_preferences WHERE user_id=?').bind(member.id).first<{ email_enabled: number; updates: number }>(),
    db.prepare('SELECT version FROM module_release_state WHERE module_id=?').bind(moduleId).first<{ version: string }>(),
  ])
  return response({ enabled: !!subscribed, emailEnabled: !preference || !!preference.email_enabled && !!preference.updates, emailAvailable: emailReady(env), version: release?.version ?? communityModule(moduleId)!.version })
}

/** Downloading follows future releases unless the member deliberately opted out. */
export async function moduleDownloadRoute(request: Request, env: Env, db: Database, moduleId: string, user: Parameters<typeof needMember>[0]) {
  const member = needMember(user)
  if (!communityModule(moduleId)) throw new HttpError(404, 'Unknown module.')
  if (!canTrackModuleDownload(moduleId,memberBetaAccess(member)||await isAdmin(request,env,db))) throw new HttpError(400, 'This module is not available for download.')
  const body = await jsonBody(request)
  if (Object.keys(body).length) throw new HttpError(400, 'Download follows accept no payload.')
  await throttle(db, 'download-follows:' + member.id, 200)
  await db.prepare(`INSERT INTO module_update_subscriptions(user_id,module_id,after_version)
    SELECT ?,?,COALESCE((SELECT version FROM module_release_state WHERE module_id=?),?)
    WHERE NOT EXISTS(SELECT 1 FROM module_update_opt_outs WHERE user_id=? AND module_id=?)
    ON CONFLICT(user_id,module_id) DO NOTHING`).bind(member.id, moduleId, moduleId, communityModule(moduleId)!.version, member.id, moduleId).run()
  const subscribed = await db.prepare('SELECT 1 AS enabled FROM module_update_subscriptions WHERE user_id=? AND module_id=?').bind(member.id, moduleId).first()
  return response({ enabled: !!subscribed })
}

/** Public history uses the deployed inventory's recorded versions, never invented release dates. */
export async function moduleChangelogRoute(db: Database, moduleId: string) {
  if (!communityModule(moduleId)) throw new HttpError(404, 'Unknown module.')
  const { results } = await db.prepare('SELECT version,detected_at AS recordedAt FROM module_releases WHERE module_id=? ORDER BY rowid DESC').bind(moduleId).all<{ version: string; recordedAt: string }>()
  results.sort((a, b) => compareModuleVersions(b.version, a.version))
  return response({ releases: results.map((release, index) => ({ ...release, previousVersion: results[index + 1]?.version ?? null })) })
}

/** Monotonic versions and per-recipient release keys keep retries/concurrent cron runs quiet. */
export async function recordModuleReleases(db: Database, releases: ModuleRelease[], initializeInventory = true) {
  // Validate the whole inventory before advancing any version or subscriber. Old inventories can
  // still be polled during rollout, but an unseen version must wait for its written changelog.
  releases = parseModuleReleases({ format: 'modwerk-module-releases-v1', modules: releases })
  const states = new Map<string, string | null>()
  for (const release of releases) {
    const previous = await db.prepare('SELECT version FROM module_release_state WHERE module_id=?').bind(release.id).first<{ version: string }>()
    states.set(release.id, previous?.version ?? null)
    if ((!previous || compareModuleVersions(release.version, previous.version) > 0) && !release.notes) throw new Error('Missing release notes for ' + release.id + ' v' + release.version + '.')
  }
  let notified = 0
  // The first live inventory establishes a baseline; it must not announce the whole existing library.
  const initialized = !!await db.prepare('SELECT 1 AS initialized FROM module_release_inventory WHERE singleton=1').first()
  for (const release of releases) {
    const previous = states.get(release.id)
    if (previous && compareModuleVersions(release.version, previous) <= 0) {
      // Fill a legacy pending notification's notes without replacing an existing release snapshot.
      if (release.notes) await db.prepare('UPDATE module_releases SET notes=? WHERE module_id=? AND version=? AND notes IS NULL').bind(JSON.stringify(release.notes), release.id, release.version).run()
      continue
    }
    const followers = (await db.prepare('SELECT s.user_id,s.after_version FROM module_update_subscriptions s JOIN users u ON u.id=s.user_id JOIN auth_users a ON a.id=u.id WHERE s.module_id=? AND (?=0 OR u.beta_tester=1 OR u.is_admin=1) AND u.email_verified=1 AND a.emailVerified=1 AND u.suspended=0 AND u.username IS NOT NULL AND NOT EXISTS(SELECT 1 FROM social_pending_accounts p WHERE p.user_id=u.id)').bind(release.id,Number(release.beta || isBetaModule(release.id))).all<{ user_id: string; after_version: string | null }>()).results
    const recipients = followers.filter(member => member.after_version !== null && compareModuleVersions(release.version, member.after_version) > 0)
    const statements = [
      db.prepare('INSERT INTO module_releases(module_id,version,name,href,notes) VALUES(?,?,?,?,?) ON CONFLICT(module_id,version) DO UPDATE SET notes=COALESCE(module_releases.notes,excluded.notes)').bind(release.id, release.version, release.name, release.href, JSON.stringify(release.notes)),
      ...(!previous && initialized && !release.beta && !isBetaModule(release.id) ? [await moduleReleaseAnnouncement(db, release)] : []),
      ...recipients.map(member => db.prepare(`INSERT INTO notifications(id,user_id,kind,module_id,module_version,delivery_id) SELECT lower(hex(randomblob(16))),?,'module_update',?,?,? WHERE EXISTS(SELECT 1 FROM module_update_subscriptions WHERE user_id=? AND module_id=? AND after_version=?) ON CONFLICT DO NOTHING`).bind(member.user_id, release.id, release.version, 'module-release:' + release.id + ':' + release.version, member.user_id, release.id, member.after_version)),
      // Do not move a subscriber back from a newer version if an old cached site is served.
      ...followers.filter(member => member.after_version === null || compareModuleVersions(release.version, member.after_version) > 0).map(member => db.prepare('UPDATE module_update_subscriptions SET after_version=? WHERE user_id=? AND module_id=? AND after_version IS ?').bind(release.version, member.user_id, release.id, member.after_version)),
      db.prepare('INSERT INTO module_release_state(module_id,version) VALUES(?,?) ON CONFLICT(module_id) DO UPDATE SET version=excluded.version WHERE module_release_state.version IS ?').bind(release.id, release.version, previous ?? null),
    ]
    // Bound D1 batches while retaining retry-safe fanout.
    if (statements.length > 90) {
      // Fanout is performed in small idempotent batches; the state advances only after every recipient is stored.
      await db.batch(statements.slice(0, 1))
      for (let index = 1; index < statements.length - 1; index += 80) await db.batch(statements.slice(index, Math.min(index + 80, statements.length - 1)))
      await db.batch(statements.slice(-1))
    } else await db.batch(statements)
    notified += recipients.length
  }
  if (initializeInventory && releases.length) await db.prepare('INSERT INTO module_release_inventory(singleton) VALUES(1) ON CONFLICT DO NOTHING').run()
  return { checked: releases.length, notified }
}

/** Read the live site's published inventory, rather than the Worker's independently deployed source catalog. */
export async function publishedModuleReleases(env: Env, expectedSha256?: string) {
  if (!env.APP_URL) {
    if (expectedSha256) throw new HttpError(503, 'The published release inventory is not configured.')
    return []
  }
  const app = new URL(env.APP_URL)
  app.pathname = app.pathname.replace(/\/?$/, '/'); app.search = ''; app.hash = ''
  const url = new URL('module-releases.json', app)
  // Workers supports only follow/manual; a redirect remains a failed check through result.ok below.
  const result = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(10000), headers: { Accept: 'application/json', 'Cache-Control': 'no-cache' } })
  if (result.status === 404) {
    if (expectedSha256) throw new HttpError(409, 'The published release inventory is not live yet.')
    return [] // The previous site can still be live during rollout.
  }
  if (!result.ok) throw new Error('Published module versions could not be checked.')
  const body = await result.text()
  if (body.length > 256 * 1024) throw new Error('Module release inventory is too large.')
  if (expectedSha256 && await digest(body) !== expectedSha256) throw new HttpError(409, 'The published release inventory does not match this deployment yet.')
  return parseModuleReleases(JSON.parse(body))
}

export async function syncModuleReleases(env: Env, db: Database) {
  return recordModuleReleases(db, await publishedModuleReleases(env))
}
