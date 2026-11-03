import type { Database } from './platform'
import { COMMUNITY_MODULES } from '../src/community/modules'
import recipes from '../src/catalog/module-sets.json'
import type { ModuleStatistics } from '../src/community/module-statistics'
import { WORKING_REPORT_JOINS, WORKING_REPORT_VISIBLE } from './hardware-reports'
import { backfillWorkingReports } from './working-reports'
// Issue reports enter only as counts and dates for the stability grade, private or public alike; nothing else about
// a report leaves the inbox. A whole-configuration report is not attributable to one module and does not count here.
export async function moduleStatistics(db: Database): Promise<ModuleStatistics[]> {
  await backfillWorkingReports(db)
  // One JSON parameter: D1 refuses more than 100 bound parameters, and two per module passed that at 51 modules.
  const current = JSON.stringify(COMMUNITY_MODULES.map(module => [module.id,module.version]))
  const [publications,meta,statistics] = await Promise.all([
    db.prepare('SELECT module_id FROM module_publications').all<{module_id:string}>(),
    db.prepare("SELECT value FROM module_download_meta WHERE key='collection_started'").first<{value:string}>(),
    db.prepare(`WITH current(module_id,version) AS (SELECT json_extract(value,'$[0]'),json_extract(value,'$[1]') FROM json_each(?)),
      w AS (SELECT r.module_id,COUNT(DISTINCT r.user_id) AS worksReports ${WORKING_REPORT_JOINS} WHERE ${WORKING_REPORT_VISIBLE} GROUP BY r.module_id),
      ids AS (SELECT module_id FROM ratings UNION SELECT module_id FROM likes UNION SELECT module_id FROM module_downloads UNION SELECT module_id FROM issues WHERE scope='module' UNION SELECT module_id FROM w),
      r AS (SELECT module_id,AVG(value) AS average,COUNT(*) AS count FROM ratings GROUP BY module_id),
      l AS (SELECT module_id,COUNT(*) AS likes FROM likes GROUP BY module_id),
      i AS (SELECT issues.module_id,SUM(status='open') AS open_issues,MAX(created_at) AS last_issue,
        SUM(status='open' AND report_kind='bug' AND confirmed_at IS NOT NULL AND (affected_version IS NULL OR affected_version=current.version)) AS confirmed_issues,
        SUM(status='open' AND report_kind='bug' AND confirmed_at IS NULL) AS unconfirmed_issues,
        SUM(status='open' AND report_kind='bug' AND triage_state='needs_info' AND confirmed_at IS NULL) AS needs_info_issues,
        MAX(CASE WHEN report_kind='bug' AND confirmed_at IS NOT NULL AND (status='open' OR closure_reason='fixed') AND (affected_version IS NULL OR affected_version=current.version) THEN confirmed_at END) AS last_confirmed_issue
        FROM issues LEFT JOIN current ON current.module_id=issues.module_id WHERE scope='module' GROUP BY issues.module_id)
      SELECT ids.module_id,COALESCE(r.average,0) AS average,COALESCE(r.count,0) AS count,COALESCE(l.likes,0) AS likes,COALESCE(d.downloads,0) AS downloads,
        d.first_download_at AS firstDownloadAt,COALESCE(i.open_issues,0) AS openIssues,strftime('%Y-%m-%dT%H:%M:%SZ',i.last_issue) AS lastIssueAt,COALESCE(w.worksReports,0) AS worksReports,
        COALESCE(i.confirmed_issues,0) AS confirmedIssues,COALESCE(i.unconfirmed_issues,0) AS unconfirmedIssues,COALESCE(i.needs_info_issues,0) AS needsInfoIssues,strftime('%Y-%m-%dT%H:%M:%SZ',i.last_confirmed_issue) AS lastConfirmedIssueAt
      FROM ids LEFT JOIN r ON r.module_id=ids.module_id LEFT JOIN l ON l.module_id=ids.module_id LEFT JOIN module_downloads d ON d.module_id=ids.module_id LEFT JOIN i ON i.module_id=ids.module_id LEFT JOIN w ON w.module_id=ids.module_id`).bind(current).all<Omit<ModuleStatistics,'downloadsStarted'>>(),
  ])
  const ids = new Set([...COMMUNITY_MODULES.map(module => module.id), ...recipes.map(recipe => 'remix-' + recipe.id), ...publications.results.map(module => module.module_id)])
  const downloadsStarted = meta?.value ?? null
  const totals = statistics.results
  const byId = new Map(totals.map(item => [item.module_id,item]))
  return [...ids].map(module_id => ({module_id,average:0,count:0,likes:0,downloads:0,worksReports:0,firstDownloadAt:null,openIssues:0,lastIssueAt:null,confirmedIssues:0,unconfirmedIssues:0,needsInfoIssues:0,lastConfirmedIssueAt:null,...byId.get(module_id),downloadsStarted}))
}
