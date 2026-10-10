import type { Database } from './platform'
import type { AdminInsights, AdminModuleInsight } from '../src/community/admin-insights-contract'
import { COMMUNITY_MODULES } from '../src/community/modules'
import recipes from '../src/catalog/module-sets.json'

/** Aggregate reads only; authorization is enforced by the enclosing /api/admin/ boundary. */
export async function adminInsights(db: Database, now = new Date()): Promise<AdminInsights> {
  const daysBefore = (days: number) => new Date(now.getTime() - days * 86400000).toISOString().slice(0, 10)
  const weekFrom = daysBefore(6), previousFrom = daysBefore(13)
  const [totals, ages, published, metrics, meta] = await Promise.all([
    db.prepare(`SELECT (SELECT COUNT(*) FROM issues WHERE status='open') AS openIssues,
      (SELECT COUNT(*) FROM issues WHERE status='closed') AS closedIssues,
      (SELECT COUNT(*) FROM forum_posts p JOIN forum_threads t ON t.id=p.thread_id WHERE t.id='module-' || t.module_id AND p.id<>t.id AND p.hidden=0 AND t.hidden=0) AS comments, (SELECT COUNT(*) FROM likes) AS likes,
      (SELECT COUNT(*) FROM ratings) AS ratings, (SELECT COALESCE(SUM(downloads),0) FROM module_downloads) AS downloads,
      (SELECT COUNT(*) FROM module_publications) AS published, (SELECT COALESCE(SUM(bytes),0) FROM media) AS mediaBytes`).first<AdminInsights['totals']>(),
    db.prepare(`WITH ages AS (SELECT created_at, MAX(0,CAST(julianday(?) - julianday(created_at) AS INTEGER)) AS age FROM issues WHERE status='open')
      SELECT COALESCE(SUM(age<7),0) AS underWeek, COALESCE(SUM(age>=7 AND age<30),0) AS weekToMonth,
      COALESCE(SUM(age>=30),0) AS overMonth, MIN(created_at) AS oldest FROM ages`).bind(now.toISOString()).first<AdminInsights['issueAges']>(),
    db.prepare('SELECT p.module_id,s.title FROM module_publications p JOIN submissions s ON s.id=p.submission_id').all<{module_id:string;title:string}>(),
    // Aggregate each source before joining so independent comments, ratings and issues never multiply totals.
    db.prepare(`WITH discussion AS (SELECT t.module_id,p.id FROM forum_posts p JOIN forum_threads t ON t.id=p.thread_id WHERE t.id='module-' || t.module_id AND p.id<>t.id AND p.hidden=0 AND t.hidden=0),
      ids AS (SELECT module_id FROM discussion UNION SELECT module_id FROM issues WHERE scope='module' UNION SELECT module_id FROM likes UNION SELECT module_id FROM ratings UNION SELECT module_id FROM module_downloads),
      c AS (SELECT module_id,COUNT(*) AS comments FROM discussion GROUP BY module_id),
      i AS (SELECT module_id,COUNT(*) AS openIssues FROM issues WHERE status='open' AND scope='module' GROUP BY module_id),
      l AS (SELECT module_id,COUNT(*) AS likes FROM likes GROUP BY module_id),
      r AS (SELECT module_id,COUNT(*) AS ratings,AVG(value) AS ratingAverage FROM ratings GROUP BY module_id),
      w AS (SELECT module_id,SUM(CASE WHEN day>=? THEN downloads ELSE 0 END) AS week,SUM(CASE WHEN day<? THEN downloads ELSE 0 END) AS previousWeek FROM module_downloads_daily WHERE day>=? GROUP BY module_id)
      SELECT ids.module_id AS moduleId,COALESCE(c.comments,0) AS comments,COALESCE(i.openIssues,0) AS openIssues,
      COALESCE(l.likes,0) AS likes,COALESCE(r.ratings,0) AS ratings,r.ratingAverage,COALESCE(d.downloads,0) AS downloads,
      COALESCE(w.week,0) AS downloadsWeek,COALESCE(w.previousWeek,0) AS downloadsPreviousWeek
      FROM ids LEFT JOIN c ON c.module_id=ids.module_id LEFT JOIN i ON i.module_id=ids.module_id
      LEFT JOIN l ON l.module_id=ids.module_id LEFT JOIN r ON r.module_id=ids.module_id LEFT JOIN module_downloads d ON d.module_id=ids.module_id
      LEFT JOIN w ON w.module_id=ids.module_id`).bind(weekFrom,weekFrom,previousFrom).all<Omit<AdminModuleInsight,'title'|'available'>>(),
    db.prepare("SELECT key,value FROM module_download_meta WHERE key IN ('collection_started','daily_started')").all<{key:string;value:string}>(),
  ])
  if (!totals || !ages) throw new Error('Unable to read community aggregates.')
  const titles = new Map([
    ...COMMUNITY_MODULES.map(module => [module.id,module.name] as const),
    ...recipes.map(recipe => ['remix-'+recipe.id,'Module set · '+recipe.id] as const),
    ...published.results.map(module => [module.module_id,module.title] as const),
  ])
  const byId = new Map(metrics.results.map(module => [module.moduleId,module]))
  const ids = new Set([...titles.keys(),...byId.keys()])
  const modules = [...ids].map(moduleId => ({moduleId,title:titles.get(moduleId)??moduleId,available:titles.has(moduleId),comments:0,openIssues:0,likes:0,ratings:0,ratingAverage:null,downloads:0,downloadsWeek:0,downloadsPreviousWeek:0,...byId.get(moduleId)}))
  const metaValue = (key: string) => meta.results.find(row => row.key===key)?.value ?? null
  return {generatedAt:now.toISOString(),downloadsStarted:metaValue('collection_started'),trendsStarted:metaValue('daily_started'),totals,issueAges:ages,modules}
}
