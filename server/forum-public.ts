import type { Database, Env } from './platform'
import { SYSTEM_AUTHOR } from './module-threads'
import { modulePath } from '../src/catalog/module-links'
import { MODULES } from '../src/catalog/modules'
import { postExcerpt, profilePath, threadPath } from '../src/community/forum-links'
import { tagSiteText } from './site-link-tags'

/** A thread as the public pages, feed and sitemap see it: visible, member-created, by a member in good standing, never a private report. */
export type PublicThread = { id: string; title: string; category: string; machine: string | null; module: string | null; username: string; created_at: string; updated_at: string; replies: number; excerpt: string; image: string | null }
type ThreadRow = Omit<PublicThread, 'excerpt' | 'image'> & { body: string | null; image: string | null }
const PUBLIC = `FROM forum_threads t JOIN users u ON u.id=t.user_id WHERE t.hidden=0 AND t.user_id<>'${SYSTEM_AUTHOR}' AND u.suspended=0 AND u.username IS NOT NULL
  AND NOT EXISTS(SELECT 1 FROM issues i WHERE i.forum_thread_id=t.id AND i.public_sharing=0 AND i.public_json IS NULL)`
async function publicThreads(db: Database, api: URL, order: 'updated_at' | 'created_at', limit: number): Promise<PublicThread[]> {
  const rows = (await db.prepare(`SELECT t.id,t.title,COALESCE(t.section,t.category) AS category,t.machine,t.module_id AS module,u.username,t.created_at,t.updated_at,
    (SELECT MAX(COUNT(*)-1,0) FROM forum_posts p WHERE p.thread_id=t.id AND p.hidden=0) AS replies,
    (SELECT substr(p.body,1,800) FROM forum_posts p WHERE p.thread_id=t.id AND p.hidden=0 ORDER BY p.created_at,p.rowid LIMIT 1) AS body,
    (SELECT m.id FROM forum_media m JOIN forum_posts mp ON mp.id=m.post_id WHERE mp.thread_id=t.id AND m.kind='image' AND m.removed=0 AND mp.hidden=0 ORDER BY mp.created_at,mp.rowid,m.position LIMIT 1) AS image
    ${PUBLIC} ORDER BY t.${order} DESC,t.id LIMIT ?`).bind(limit).all<ThreadRow>()).results
  return rows.map(({ body, image, ...row }) => ({ ...row, excerpt: postExcerpt(body ?? ''), image: image ? new URL('forum/media/' + image, api).href : null }))
}
const iso = (value: string) => new Date(value.includes('T') ? value : value.replace(' ', 'T') + 'Z').toISOString()
const escapeXml = (value: string) => value.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[character]!)
function xml(body: string, type: string) {
  return new Response(body, { headers: { 'Content-Type': type + '; charset=utf-8', 'Cache-Control': 'public, max-age=900', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'" } })
}
/** The site base, with the Pages project path when there is one, so links in feeds survive another hosting origin. */
function siteUrl(env: Env) { const app = new URL(env.APP_URL!); app.pathname = app.pathname.replace(/\/?$/, '/'); app.search = ''; app.hash = ''; return app }
/** Module releases link to the static module pages; other machines' modules keep their hash routes. */
const releaseUrl = (app: URL, href: string) => new URL(/^#module\/[a-z0-9-]+$/.test(href) ? href.slice(1) + '/' : href, app).href

/** Public read-only views for crawlers, feed readers and the site build: no session, no Origin, cacheable. */
export async function forumPublic(request: Request, env: Env, db: Database): Promise<Response | null> {
  const url = new URL(request.url), path = url.pathname
  if (request.method !== 'GET' || !['/api/forum/pages.json', '/api/forum/feed.xml', '/api/forum/sitemap.xml'].includes(path)) return null
  const api = new URL('/api/', url), app = siteUrl(env)
  if (path === '/api/forum/pages.json') {
    const threads = await publicThreads(db, api, 'updated_at', 2000)
    return Response.json({ generatedAt: new Date().toISOString(), threads }, { headers: { 'Cache-Control': 'public, max-age=300', 'X-Content-Type-Options': 'nosniff' } })
  }
  if (path === '/api/forum/feed.xml') {
    const [threads, releases] = await Promise.all([
      publicThreads(db, api, 'created_at', 30),
      db.prepare('SELECT module_id,version,name,href,detected_at FROM module_releases ORDER BY detected_at DESC,module_id LIMIT 10').all<{ module_id: string; version: string; name: string; href: string; detected_at: string }>().then(result => result.results),
    ])
    // Links a reader opens say they came from the feed; entry ids stay untagged so readers keep recognising them.
    const feedLink = (href: string) => tagSiteText(href, app.href, 'forum-feed')
    const entries = [
      ...threads.map(thread => ({ at: iso(thread.created_at), xml: `<entry><title>${escapeXml(thread.title)}</title><link href="${escapeXml(feedLink(new URL(threadPath(thread.id, thread.title), app).href))}"/><id>${escapeXml(new URL(threadPath(thread.id), app).href)}</id><published>${iso(thread.created_at)}</published><updated>${iso(thread.updated_at)}</updated><author><name>@${escapeXml(thread.username)}</name><uri>${escapeXml(new URL(profilePath(thread.username), app).href)}</uri></author><category term="${escapeXml(thread.category)}"/>${thread.machine ? `<category term="${escapeXml(thread.machine)}"/>` : ''}<summary>${escapeXml(thread.excerpt || thread.replies + (thread.replies === 1 ? ' reply' : ' replies'))}</summary></entry>` })),
      ...releases.map(release => ({ at: iso(release.detected_at), xml: `<entry><title>${escapeXml(release.name + ' ' + release.version)} released</title><link href="${escapeXml(feedLink(releaseUrl(app, release.href)))}"/><id>${escapeXml(releaseUrl(app, release.href) + '#v' + release.version)}</id><published>${iso(release.detected_at)}</published><updated>${iso(release.detected_at)}</updated><author><name>Modwerk</name></author><category term="release"/><summary>${escapeXml(release.name + ' ' + release.version)} is available in the module library.</summary></entry>` })),
    ].sort((a, b) => b.at.localeCompare(a.at))
    const updated = entries[0]?.at ?? new Date().toISOString()
    return xml(`<?xml version="1.0" encoding="utf-8"?>\n<feed xmlns="http://www.w3.org/2005/Atom"><title>Modwerk community</title><subtitle>New forum threads and module releases</subtitle><link href="${escapeXml(feedLink(new URL('#forum', app).href))}"/><link rel="self" type="application/atom+xml" href="${escapeXml(new URL('forum/feed.xml', api).href)}"/><id>${escapeXml(app.href)}</id><updated>${updated}</updated>\n${entries.map(entry => entry.xml).join('\n')}\n</feed>\n`, 'application/atom+xml')
  }
  const [threads, profiles] = await Promise.all([
    publicThreads(db, api, 'updated_at', 5000),
    db.prepare(`SELECT u.username,MAX(p.created_at) AS lastmod FROM users u JOIN forum_posts p ON p.user_id=u.id JOIN forum_threads t ON t.id=p.thread_id
      WHERE p.hidden=0 AND t.hidden=0 AND u.email_verified=1 AND u.suspended=0 AND u.username IS NOT NULL AND NOT EXISTS(SELECT 1 FROM social_pending_accounts s WHERE s.user_id=u.id) GROUP BY u.username ORDER BY lastmod DESC LIMIT 5000`).all<{ username: string; lastmod: string }>().then(result => result.results),
  ])
  const entry = (href: string, lastmod?: string) => `<url><loc>${escapeXml(href)}</loc>${lastmod ? `<lastmod>${iso(lastmod)}</lastmod>` : ''}</url>`
  return xml(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${[
    entry(app.href),
    ...MODULES.map(module => entry(new URL(modulePath(module.id), app).href)),
    ...threads.map(thread => entry(new URL(threadPath(thread.id, thread.title), app).href, thread.updated_at)),
    ...profiles.map(profile => entry(new URL(profilePath(profile.username), app).href, profile.lastmod)),
  ].join('\n')}\n</urlset>\n`, 'application/xml')
}
