import type { Database } from './platform'
import { FORUM_CATEGORIES } from '../src/community/forum-contract'
import type { UnansweredThreadsPage } from '../src/community/admin-activity-contract'
import type { AdminActivity, AdminActivityDay } from '../src/community/admin-activity-contract'
import { HttpError } from './security'
import { SYSTEM_AUTHOR } from './module-threads'

const day = (date: Date) => date.toISOString().slice(0, 10)
const before = (now: Date, days: number) => day(new Date(now.getTime() - days * 86400000))
/** Forum timestamps are SQLite CURRENT_TIMESTAMP text, which sorts against this form. */
const sqlTime = (date: Date) => date.toISOString().replace('T', ' ').slice(0, 19)
/** A reply answers a thread when it is visible and written by someone other than the thread's author. */
const ANSWERS = 'FROM forum_posts p WHERE p.thread_id=t.id AND p.id<>t.id AND p.hidden=0 AND p.user_id<>t.user_id'

const UNANSWERED = `t.user_id<>? AND t.hidden=0 AND t.locked=0 AND t.status='open' AND t.created_at<? AND NOT EXISTS(SELECT 1 ${ANSWERS})`

/** A bounded, administrator-only first-reply queue. Filters never alter the activity report's headline totals. */
export async function unansweredThreads(db: Database, now = new Date(), params = new URLSearchParams()): Promise<UnansweredThreadsPage> {
  const rawPage = params.get('page') ?? '1', category = params.get('category') ?? 'all', order = params.get('order') ?? 'oldest'
  if (!/^[1-9][0-9]{0,5}$/.test(rawPage)) throw new HttpError(400, 'Choose a valid page.')
  if (category !== 'all' && !Object.hasOwn(FORUM_CATEGORIES, category)) throw new HttpError(400, 'Choose a forum category.')
  if (order !== 'oldest' && order !== 'newest') throw new HttpError(400, 'Choose oldest or newest first.')
  const stale = sqlTime(new Date(now.getTime() - 48 * 3600000))
  const where = UNANSWERED + (category === 'all' ? '' : ' AND COALESCE(t.section,t.category)=?')
  const values = [SYSTEM_AUTHOR, stale, ...(category === 'all' ? [] : [category])]
  const count = await db.prepare(`SELECT COUNT(*) AS total FROM forum_threads t WHERE ${where}`).bind(...values).first<{ total: number }>()
  const total = count?.total ?? 0, pageSize = 10, page = Math.min(Number(rawPage), Math.max(1, Math.ceil(total / pageSize)))
  const direction = order === 'oldest' ? 'ASC' : 'DESC'
  const rows = await db.prepare(`SELECT t.id,t.title,t.created_at AS createdAt FROM forum_threads t WHERE ${where} ORDER BY t.created_at ${direction},t.id ${direction} LIMIT ? OFFSET ?`)
    .bind(...values, pageSize, (page - 1) * pageSize).all<UnansweredThreadsPage['threads'][number]>()
  return { total, page, pageSize, category: category as UnansweredThreadsPage['category'], order, generatedAt: now.toISOString(), threads: rows.results }
}

export function median(values: readonly number[]) {
  if (!values.length) return null
  const sorted = [...values].sort((a, b) => a - b), middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}

/** Aggregates and public thread titles only; no author, reporter or member identity leaves this function.
 * Authorization is enforced by the enclosing /api/admin/ boundary. */
export async function adminActivity(db: Database, now = new Date(), days = 30): Promise<AdminActivity> {
  if (![7, 30, 90].includes(days)) throw new HttpError(400, 'Choose 7, 30 or 90 days.')
  const from = before(now, days - 1), to = day(now), stale = sqlTime(new Date(now.getTime() - 48 * 3600000))
  const [counts, firsts, unanswered, closures, unknown] = await Promise.all([
    db.prepare(`SELECT 'threads' AS kind,substr(created_at,1,10) AS day,COUNT(*) AS n FROM forum_threads WHERE user_id<>? AND hidden=0 AND created_at>=? GROUP BY day
      UNION ALL SELECT 'replies',substr(p.created_at,1,10) AS day,COUNT(*) FROM forum_posts p JOIN forum_threads t ON t.id=p.thread_id WHERE p.id<>t.id AND p.hidden=0 AND t.hidden=0 AND p.created_at>=? GROUP BY day
      UNION ALL SELECT 'shouts',substr(created_at,1,10) AS day,COUNT(*) FROM forum_shouts WHERE hidden=0 AND created_at>=? GROUP BY day
      UNION ALL SELECT 'issuesOpened',substr(created_at,1,10) AS day,COUNT(*) FROM issues WHERE created_at>=? GROUP BY day
      UNION ALL SELECT 'issuesClosed',substr(closed_at,1,10) AS day,COUNT(*) FROM issues WHERE status='closed' AND closed_at>=? GROUP BY day`)
      .bind(SYSTEM_AUTHOR, from, from, from, from, from).all<{ kind: Exclude<keyof AdminActivityDay, 'day'>; day: string; n: number }>(),
    db.prepare(`SELECT (julianday((SELECT MIN(p.created_at) ${ANSWERS}))-julianday(t.created_at))*24 AS hours
      FROM forum_threads t WHERE t.user_id<>? AND t.hidden=0 AND t.created_at>=?`).bind(SYSTEM_AUTHOR, from).all<{ hours: number | null }>(),
    db.prepare(`SELECT t.id,t.title,t.created_at AS createdAt,COUNT(*) OVER() AS total FROM forum_threads t
      WHERE ${UNANSWERED} ORDER BY t.created_at ASC,t.id ASC LIMIT 10`)
      .bind(SYSTEM_AUTHOR, stale).all<{ id: string; title: string; createdAt: string; total: number }>(),
    db.prepare("SELECT julianday(closed_at)-julianday(created_at) AS days FROM issues WHERE status='closed' AND closed_at>=?").bind(from).all<{ days: number }>(),
    db.prepare("SELECT COUNT(*) AS n FROM issues WHERE status='closed' AND closed_at IS NULL").first<{ n: number }>(),
  ])
  const daily: AdminActivityDay[] = Array.from({ length: days }, (_, index) => ({ day: day(new Date(new Date(from + 'T00:00:00Z').getTime() + index * 86400000)), threads: 0, replies: 0, shouts: 0, issuesOpened: 0, issuesClosed: 0 }))
  const byDay = new Map(daily.map(row => [row.day, row]))
  for (const { kind, day: value, n } of counts.results) { const row = byDay.get(value); if (row) row[kind] += n }
  const answered = firsts.results.flatMap(row => row.hours === null ? [] : [Math.max(0, row.hours)])
  const durations = closures.results.map(row => Math.max(0, row.days))
  return {
    generatedAt: now.toISOString(), from, to, days, daily,
    firstReplies: { threads: firsts.results.length, answered: answered.length, within48h: answered.filter(hours => hours <= 48).length, medianHours: median(answered) },
    unanswered: { total: unanswered.results[0]?.total ?? 0, threads: unanswered.results.map(({ id, title, createdAt }) => ({ id, title, createdAt })) },
    issueTurnaround: { closed: durations.length, medianDays: median(durations), within7Days: durations.filter(value => value <= 7).length },
    unknownCloseTimes: unknown?.n ?? 0,
  }
}
