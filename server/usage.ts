import type { Database, Env } from './platform'
import { OCTATRACK_COUNTS } from '../src/community/octatrack-diagnostics-contract'
import { USAGE_CONSENT_VERSION } from '../src/legal/policy'
import { boundedBody, HttpError, response } from './security'
import { throttle } from './auth'
import { isUsagePage } from '../src/community/usage-pages'
import { canTrackModuleDownload } from '../src/community/module-downloads'
import { ANNOUNCEMENT_COUNTS, DEVICE_EVENTS, USAGE_DEVICES, USAGE_EVENTS, type AnnouncementCountEvent, type UsageDevice, type UsageEvent, type UsageDay, type UsageDeviceTotals, type UsageHour, type UsagePageDay } from '../src/community/usage-contract'
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/
const columns: Record<UsageEvent, string> = { page_view:'page_views', configuration_started:'configurations', build_succeeded:'builds', build_failed:'builds_failed', firmware_download_requested:'downloads', configuration_exported:'exports', support_opened:'support_opens', support_link_opened:'support_clicks', discord_member_prompt_shown:'discord_member_shown', discord_member_join_clicked:'discord_member_joins', discord_member_dismissed:'discord_member_dismissals', discord_visitor_prompt_shown:'discord_visitor_shown', discord_visitor_signup_clicked:'discord_visitor_signups', discord_visitor_join_clicked:'discord_visitor_joins', discord_visitor_dismissed:'discord_visitor_dismissals', discord_welcome_join_clicked:'discord_welcome_joins' }
/** Optional machine on builds, failed builds and download requests: one of the fixed supported machine names, never anything else. */
function deviceOf(body: Record<string,unknown>, event: UsageEvent): UsageDevice | null | undefined {
  if (!('device' in body)) return null
  return DEVICE_EVENTS.includes(event) && typeof body.device === 'string' && (USAGE_DEVICES as readonly string[]).includes(body.device) ? body.device as UsageDevice : undefined
}
/** Adds one to the machine's daily total; `counted` repeats the event's own deduplication condition when there is one. */
function deviceCount(db: Database, today: string, device: UsageDevice, event: UsageEvent, counted?: { sql: string; values: unknown[] }) {
  const metric = columns[event] // builds, builds_failed or downloads, from the closed enum.
  return db.prepare(`INSERT INTO usage_device_daily(day,device,${metric}) SELECT ?,?,1 WHERE ${counted?.sql ?? '1'} ON CONFLICT(day,device) DO UPDATE SET ${metric}=${metric}+1`).bind(today,device,...counted?.values ?? [])
}
/** Page names only accompany page views. An omitted name keeps old clients compatible. */
function pageOf(body: Record<string, unknown>): string | null | undefined {
  if (!('page' in body)) return null
  return body.event === 'page_view' && isUsagePage(body.page) ? body.page : undefined
}
function pageCounts(db: Database, now: Date, page: string, counted?: { sql: string; values: unknown[] }) {
  return [
    db.prepare(`INSERT INTO usage_page_daily(day,page,views) SELECT ?,?,1 WHERE ${counted?.sql ?? '1'} ON CONFLICT(day,page) DO UPDATE SET views=views+1`).bind(day(now),page,...counted?.values ?? []),
    db.prepare(`INSERT INTO usage_meta(key,value) SELECT 'pages_started',? WHERE ${counted?.sql ?? '1'} ON CONFLICT DO NOTHING`).bind(now.toISOString(),...counted?.values ?? []),
  ]
}
const day = (date: Date) => date.toISOString().slice(0,10)
/** UTC hour key 'YYYY-MM-DDTHH', so an hour sorts and compares like its day. */
const hourOf = (date: Date) => date.toISOString().slice(0,13)
const USAGE_COLUMNS = 'visitors,page_views,configurations,builds,builds_failed,downloads,exports,support_opens,support_clicks,discord_member_shown,discord_member_joins,discord_member_dismissals,discord_visitor_shown,discord_visitor_signups,discord_visitor_joins,discord_visitor_dismissals,discord_welcome_joins'
const before = (now: Date, days: number) => day(new Date(now.getTime() - days * 86400000))
async function privateHash(key: string, purpose: string) {
  const secret = await crypto.subtle.importKey('raw',new TextEncoder().encode(key),{name:'HMAC',hash:'SHA-256'},false,['sign'])
  return Array.from(new Uint8Array(await crypto.subtle.sign('HMAC',secret,new TextEncoder().encode('octamod-usage-v1:' + purpose))),b=>b.toString(16).padStart(2,'0')).join('')
}
/** No guest account, IP, user agent, referrer, module list or firmware enters these tables. */
export async function recordUsage(request: Request, env: Env, db: Database) {
  if (request.headers.get('DNT') === '1' || request.headers.get('Sec-GPC') === '1') return new Response(null,{status:204})
  if(request.headers.get('X-Octamod-Usage-Consent')!==USAGE_CONSENT_VERSION)throw new HttpError(403,'Usage counts require your current opt-in choice.')
  const secret = env.ADMIN_KEY_SHA256?.trim().toLowerCase() ?? ''
  if (!/^[a-f0-9]{64}$/.test(secret)) throw new HttpError(503,'Usage counts are not configured.')
  if (!request.headers.get('Content-Type')?.startsWith('application/json')) throw new HttpError(415,'Send JSON for this request.')
  let body: Record<string,unknown>
  try { const value: unknown = JSON.parse(new TextDecoder().decode(await boundedBody(request,512))); if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(); body=value as Record<string,unknown> }
  catch(error) { if(error instanceof HttpError)throw error; throw new HttpError(400,'Invalid usage event.') }
  if (!['event,eventId,visitor','device,event,eventId,visitor','event,eventId,page,visitor'].includes(Object.keys(body).sort().join(',')) || typeof body.event !== 'string' || !USAGE_EVENTS.includes(body.event as UsageEvent) || typeof body.eventId !== 'string' || !uuid.test(body.eventId) || typeof body.visitor !== 'string' || !uuid.test(body.visitor)) throw new HttpError(400,'Invalid usage event.')
  const now = new Date(), today = day(now), event = body.event as UsageEvent, device = deviceOf(body,event), page = pageOf(body)
  if (device === undefined || page === undefined) throw new HttpError(400,'Invalid usage event.')
  // Purpose separation: backend-only key material never becomes a browser identifier or API response.
  const visitor = await privateHash(secret,today + ':visitor:' + body.visitor), identity = await privateHash(secret,today + ':event:' + body.visitor + ':' + body.eventId)
  await throttle(db,'usage:' + visitor,200,3600)
  const metric = columns[event] // Selected only from the closed enum above, never from arbitrary SQL input.
  await db.batch([
    db.prepare('INSERT INTO usage_events(day,event_hash) VALUES(?,?) ON CONFLICT DO NOTHING').bind(today,identity),
    db.prepare('INSERT INTO usage_visitors(day,visitor_hash) SELECT ?,? WHERE EXISTS(SELECT 1 FROM usage_events WHERE day=? AND event_hash=? AND counted=0) ON CONFLICT DO NOTHING').bind(today,visitor,today,identity),
    db.prepare(`INSERT INTO usage_daily(day,visitors,${metric}) SELECT ?,(SELECT COUNT(*) FROM usage_visitors WHERE day=? AND visitor_hash=? AND counted=0),1 WHERE EXISTS(SELECT 1 FROM usage_events WHERE day=? AND event_hash=? AND counted=0) ON CONFLICT(day) DO UPDATE SET visitors=visitors+excluded.visitors,${metric}=${metric}+excluded.${metric}`).bind(today,today,visitor,today,identity),
    db.prepare(`INSERT INTO usage_hourly(hour,visitors,${metric}) SELECT ?,(SELECT COUNT(*) FROM usage_visitors WHERE day=? AND visitor_hash=? AND counted=0),1 WHERE EXISTS(SELECT 1 FROM usage_events WHERE day=? AND event_hash=? AND counted=0) ON CONFLICT(hour) DO UPDATE SET visitors=visitors+excluded.visitors,${metric}=${metric}+excluded.${metric}`).bind(hourOf(now),today,visitor,today,identity),
    // Before the event is marked counted, so a repeated event ID adds nothing here either.
    ...(device ? [deviceCount(db,today,device,event,{sql:'EXISTS(SELECT 1 FROM usage_events WHERE day=? AND event_hash=? AND counted=0)',values:[today,identity]})] : []),
    ...(page ? pageCounts(db,now,page,{sql:'EXISTS(SELECT 1 FROM usage_events WHERE day=? AND event_hash=? AND counted=0)',values:[today,identity]}) : []),
    db.prepare('UPDATE usage_visitors SET counted=1 WHERE day=? AND visitor_hash=?').bind(today,visitor),
    db.prepare('UPDATE usage_events SET counted=1 WHERE day=? AND event_hash=?').bind(today,identity),
    db.prepare("INSERT INTO usage_meta(key,value) VALUES('collection_started',?) ON CONFLICT DO NOTHING").bind(now.toISOString()),
    db.prepare("INSERT INTO usage_meta(key,value) VALUES('breakdowns_started',?) ON CONFLICT DO NOTHING").bind(now.toISOString()),
    db.prepare("INSERT INTO usage_meta(key,value) VALUES('hourly_started',?) ON CONFLICT DO NOTHING").bind(now.toISOString()),
  ])
  return response({ok:true})
}
/** Daily random salt for estimating unique visitors. It lives only in usage_meta and is deleted by the first
 * hourly cleanup of the next UTC day, after which that day's visitor digests can no longer be recomputed or linked. */
async function visitorSalt(db: Database, today: string) {
  const random = Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,'0')).join('')
  await db.prepare('INSERT INTO usage_meta(key,value) VALUES(?,?) ON CONFLICT DO NOTHING').bind('visitor-salt:' + today,random).run()
  const saved = await db.prepare('SELECT value FROM usage_meta WHERE key=?').bind('visitor-salt:' + today).first<{value:string}>()
  if (!saved) throw new HttpError(503,'Usage counts are not available right now.')
  return saved.value
}
/** Counts without consent accept a closed event name, optionally a fixed page key, build/download machine, public module ID or public announcement ID.
 * Nothing is read from or stored on the device. Unique visitors are estimated from a digest of IP address and
 * User-Agent, keyed with the backend secret and a daily salt; the raw values are never stored and digests are
 * kept only until the hourly cleanup removes the previous day (at most about 48 hours). A separate keyed IP
 * digest limits abuse in rate_limits and expires within the hour. */
export async function recordAnonymousCount(request: Request, env: Env, db: Database) {
  if (request.headers.get('DNT') === '1' || request.headers.get('Sec-GPC') === '1') return new Response(null,{status:204})
  const secret = env.ADMIN_KEY_SHA256?.trim().toLowerCase() ?? ''
  if (!/^[a-f0-9]{64}$/.test(secret)) throw new HttpError(503,'Usage counts are not configured.')
  if (!request.headers.get('Content-Type')?.startsWith('application/json')) throw new HttpError(415,'Send JSON for this request.')
  let body: Record<string,unknown>
  try { const value: unknown = JSON.parse(new TextDecoder().decode(await boundedBody(request,256))); if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(); body=value as Record<string,unknown> }
  catch(error) { if(error instanceof HttpError)throw error; throw new HttpError(400,'Invalid usage count.') }
  const keys = Object.keys(body).sort().join(',')
  const octatrackCount = keys === 'event' && OCTATRACK_COUNTS.some(event => event === body.event)
  const moduleCount = keys === 'event,moduleId' && body.event === 'module_download' && typeof body.moduleId === 'string' && canTrackModuleDownload(body.moduleId)
  const announcementCount = keys === 'announcementId,event' && typeof body.event === 'string' && Object.hasOwn(ANNOUNCEMENT_COUNTS,body.event) && typeof body.announcementId === 'string' && /^announcement-[a-f0-9]{32}$/.test(body.announcementId)
  if (!octatrackCount && !moduleCount && !announcementCount && (!['event','device,event','event,page'].includes(keys) || typeof body.event !== 'string' || !USAGE_EVENTS.includes(body.event as UsageEvent))) throw new HttpError(400,'Invalid usage count.')
  const device = moduleCount || announcementCount ? null : deviceOf(body,body.event as UsageEvent), page = pageOf(body)
  if (device === undefined || page === undefined) throw new HttpError(400,'Invalid usage count.')
  const now = new Date(), today = day(now)
  await throttle(db,'usage-count:' + await privateHash(secret,today + ':count-rate:' + (request.headers.get('CF-Connecting-IP') ?? 'local')),300,3600)
  if (octatrackCount) {
    await db.prepare('INSERT INTO octatrack_beta_daily(day,event,count) VALUES(?,?,1) ON CONFLICT(day,event) DO UPDATE SET count=count+1').bind(today,body.event).run()
    return response({ok:true}) // No visitor/session/module/device identity, including no unique-visitor digest.
  }
  if (announcementCount) {
    const column = ANNOUNCEMENT_COUNTS[body.event as AnnouncementCountEvent], id = (body.announcementId as string).slice('announcement-'.length) // Column from the closed map above.
    // Only a currently public announcement gains a count; one removed meanwhile is ignored.
    await db.prepare(`INSERT INTO announcement_counts(announcement_id,${column}) SELECT id,1 FROM announcements WHERE id=? AND visibility='public' ON CONFLICT(announcement_id) DO UPDATE SET ${column}=${column}+1`).bind(id).run()
    return response({ok:true})
  }
  if (moduleCount) {
    await db.batch([
      db.prepare('INSERT INTO module_downloads(module_id,downloads,first_download_at) VALUES(?,1,?) ON CONFLICT(module_id) DO UPDATE SET downloads=downloads+1').bind(body.moduleId,now.toISOString()),
      db.prepare('INSERT INTO module_downloads_daily(day,module_id,downloads) VALUES(?,?,1) ON CONFLICT(day,module_id) DO UPDATE SET downloads=downloads+1').bind(today,body.moduleId),
      db.prepare("INSERT INTO module_download_meta(key,value) VALUES('collection_started',?) ON CONFLICT DO NOTHING").bind(now.toISOString()),
      db.prepare("INSERT INTO module_download_meta(key,value) VALUES('daily_started',?) ON CONFLICT DO NOTHING").bind(now.toISOString()),
    ])
    return response({ok:true})
  }
  const metric = columns[body.event as UsageEvent] // Selected only from the closed enum above, never from arbitrary SQL input.
  const visitor = await privateHash(secret,today + ':anonymous-visitor:' + await visitorSalt(db,today) + ':' + (request.headers.get('CF-Connecting-IP') ?? 'local') + ':' + (request.headers.get('User-Agent') ?? ''))
  await db.batch([
    db.prepare('INSERT INTO usage_visitors(day,visitor_hash) VALUES(?,?) ON CONFLICT DO NOTHING').bind(today,visitor),
    db.prepare(`INSERT INTO usage_daily(day,visitors,${metric}) VALUES(?,(SELECT COUNT(*) FROM usage_visitors WHERE day=? AND visitor_hash=? AND counted=0),1) ON CONFLICT(day) DO UPDATE SET visitors=visitors+excluded.visitors,${metric}=${metric}+1`).bind(today,today,visitor),
    db.prepare(`INSERT INTO usage_hourly(hour,visitors,${metric}) VALUES(?,(SELECT COUNT(*) FROM usage_visitors WHERE day=? AND visitor_hash=? AND counted=0),1) ON CONFLICT(hour) DO UPDATE SET visitors=visitors+excluded.visitors,${metric}=${metric}+1`).bind(hourOf(now),today,visitor),
    ...(device ? [deviceCount(db,today,device,body.event as UsageEvent)] : []),
    ...(page ? pageCounts(db,now,page) : []),
    db.prepare('UPDATE usage_visitors SET counted=1 WHERE day=? AND visitor_hash=?').bind(today,visitor),
    db.prepare("INSERT INTO usage_meta(key,value) VALUES('collection_started',?) ON CONFLICT DO NOTHING").bind(now.toISOString()),
    db.prepare("INSERT INTO usage_meta(key,value) VALUES('breakdowns_started',?) ON CONFLICT DO NOTHING").bind(now.toISOString()),
    db.prepare("INSERT INTO usage_meta(key,value) VALUES('hourly_started',?) ON CONFLICT DO NOTHING").bind(now.toISOString()),
  ])
  return response({ok:true})
}
/** Called hourly by the Worker and available to other backend adapters. */
export async function cleanupUsage(db: Database, now = new Date()) {
  await db.batch([
    db.prepare('DELETE FROM usage_events WHERE day<?').bind(before(now,1)),
    db.prepare('DELETE FROM module_download_events WHERE day<?').bind(before(now,1)),
    db.prepare('DELETE FROM usage_visitors WHERE day<?').bind(before(now,1)),
    db.prepare("DELETE FROM usage_meta WHERE key LIKE 'visitor-salt:%' AND key<?").bind('visitor-salt:' + day(now)),
    db.prepare('DELETE FROM usage_daily WHERE day<?').bind(before(now,89)),
    db.prepare('DELETE FROM usage_hourly WHERE hour<?').bind(before(now,13) + 'T00'),
    db.prepare('DELETE FROM usage_page_daily WHERE day<?').bind(before(now,89)),
    db.prepare('DELETE FROM usage_device_daily WHERE day<?').bind(before(now,89)),
    db.prepare('DELETE FROM module_downloads_daily WHERE day<?').bind(before(now,89)),
    db.prepare('DELETE FROM rate_limits WHERE expires<?').bind(Math.floor(now.getTime()/1000)),
  ])
}
/** Authorization is enforced by the enclosing /api/admin/ boundary. */
export async function usageStatistics(db: Database, days: number, now = new Date()) {
  if (![7,30,90].includes(days)) throw new HttpError(400,'Choose 7, 30 or 90 days.')
  const from = before(now,days-1), to = day(now)
  // Compare equal windows of completed days; today and the first partial collection day are excluded.
  const previousFrom = before(now,2 * (days-1)), previousTo = before(now,days)
  const outsideRetention = previousFrom < before(now,89)
  const [meta,daily,devices,hourly,pages] = await Promise.all([
    db.prepare("SELECT key,value FROM usage_meta WHERE key IN ('collection_started','breakdowns_started','hourly_started','discord_invites_started','pages_started','machine_coverage_expanded')").all<{key:string;value:string}>(),
    db.prepare(`SELECT day,${USAGE_COLUMNS} FROM usage_daily WHERE day>=? AND day<=? ORDER BY day`).bind(outsideRetention?from:previousFrom,to).all<UsageDay>(),
    db.prepare('SELECT device,SUM(builds) AS builds,SUM(builds_failed) AS builds_failed,SUM(downloads) AS downloads FROM usage_device_daily WHERE day>=? AND day<=? GROUP BY device').bind(from,to).all<UsageDeviceTotals>(),
    // Hours are kept for 14 days, so only the 7-day view can show them.
    days===7 ? db.prepare(`SELECT hour,${USAGE_COLUMNS} FROM usage_hourly WHERE hour>=? AND hour<=? ORDER BY hour`).bind(from+'T00',to+'T23').all<UsageHour>() : null,
    db.prepare('SELECT day,page,views FROM usage_page_daily WHERE day>=? AND day<=? ORDER BY day,page').bind(from,to).all<UsagePageDay>(),
  ])
  const metaValue = (key: string) => meta.results.find(row => row.key===key)?.value ?? null
  const collectionStarted = metaValue('collection_started'), breakdownsStarted = metaValue('breakdowns_started'), hourlyStarted = metaValue('hourly_started')
  const byDevice = new Map(devices.results.map(row => [row.device,row]))
  const rows = daily.results.filter(row=>row.day>=from)
  const unavailableReason = outsideRetention ? 'retention' : !collectionStarted || previousFrom <= collectionStarted.slice(0,10) ? 'collection' : null
  const previousRows = unavailableReason ? [] : daily.results.filter(row=>row.day>=previousFrom&&row.day<=previousTo)
  return response({generatedAt:now.toISOString(),collectionStarted,from,to,days,rows,comparison:{from:previousFrom,to:previousTo,rows:previousRows,unavailableReason},
    machineCoverageExpanded:metaValue('machine_coverage_expanded'),pagesStarted:metaValue('pages_started'),pages:pages.results,breakdownsStarted,hourlyStarted,discordInvitesStarted:metaValue('discord_invites_started'),...(hourly ? {hourly:hourly.results} : {}),devices:USAGE_DEVICES.map(device => byDevice.get(device) ?? {device,builds:0,builds_failed:0,downloads:0})})
}

/** Each request names one build-integrated module; no configuration grouping is stored. */
export async function recordModuleDownload(request: Request, env: Env, db: Database) {
  if (request.headers.get('DNT') === '1' || request.headers.get('Sec-GPC') === '1') return new Response(null,{status:204})
  if(request.headers.get('X-Octamod-Usage-Consent')!==USAGE_CONSENT_VERSION)throw new HttpError(403,'Usage counts require your current opt-in choice.')
  const secret = env.ADMIN_KEY_SHA256?.trim().toLowerCase() ?? ''
  if (!/^[a-f0-9]{64}$/.test(secret)) throw new HttpError(503,'Usage counts are not configured.')
  if (!request.headers.get('Content-Type')?.startsWith('application/json')) throw new HttpError(415,'Send JSON for this request.')
  let body: Record<string,unknown>
  try { const value: unknown = JSON.parse(new TextDecoder().decode(await boundedBody(request,512))); if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(); body=value as Record<string,unknown> }
  catch(error) { if(error instanceof HttpError)throw error; throw new HttpError(400,'Invalid module download event.') }
  if (Object.keys(body).sort().join(',') !== 'eventId,moduleId,visitor' || typeof body.moduleId !== 'string' || !canTrackModuleDownload(body.moduleId) || typeof body.eventId !== 'string' || !uuid.test(body.eventId) || typeof body.visitor !== 'string' || !uuid.test(body.visitor)) throw new HttpError(400,'Invalid module download event.')
  const now = new Date(), today = day(now)
  // Rate-limit digests are separate from deduplication. Neither table links a module to a visitor.
  const visitor = await privateHash(secret,today + ':module-rate:' + body.visitor), identity = await privateHash(secret,today + ':module-event:' + body.eventId)
  await throttle(db,'module-download:' + visitor,200,3600)
  await db.batch([
    db.prepare('INSERT INTO module_download_events(day,event_hash) VALUES(?,?) ON CONFLICT DO NOTHING').bind(today,identity),
    db.prepare('INSERT INTO module_downloads(module_id,downloads,first_download_at) SELECT ?,1,? WHERE EXISTS(SELECT 1 FROM module_download_events WHERE day=? AND event_hash=? AND counted=0) ON CONFLICT(module_id) DO UPDATE SET downloads=downloads+1').bind(body.moduleId,now.toISOString(),today,identity),
    db.prepare('INSERT INTO module_downloads_daily(day,module_id,downloads) SELECT ?,?,1 WHERE EXISTS(SELECT 1 FROM module_download_events WHERE day=? AND event_hash=? AND counted=0) ON CONFLICT(day,module_id) DO UPDATE SET downloads=downloads+1').bind(today,body.moduleId,today,identity),
    db.prepare('UPDATE module_download_events SET counted=1 WHERE day=? AND event_hash=?').bind(today,identity),
    db.prepare("INSERT INTO module_download_meta(key,value) VALUES('daily_started',?) ON CONFLICT DO NOTHING").bind(now.toISOString()),
  ])
  return response({ok:true})
}
