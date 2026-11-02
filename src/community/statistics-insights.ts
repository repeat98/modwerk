import type { UsageDay, UsageHour, UsageStatistics } from './usage-contract'
import type { AdminAccounts, AdminAccountsDay, AdminModuleInsight } from './admin-insights-contract'
import { bayesianRating, ratingPrior } from './rating-ranking'

export const usageMetrics = [
  ['visitors', 'Daily visitors'], ['page_views', 'Page views'], ['configurations', 'Configurations started'],
  ['builds', 'Successful builds'], ['builds_failed', 'Failed builds'], ['downloads', 'Firmware download requests'], ['exports', 'Configuration exports'],
  ['support_opens', 'Support dialog opens'], ['support_clicks', 'Ko-fi clicks'],
] as const
export type UsageMetric = typeof usageMetrics[number][0]
/** Counted from the hourly totals' start (usage_meta 'hourly_started'); earlier days read as zero and cannot be compared. */
export const HOURLY_ERA_METRICS: readonly UsageMetric[] = ['support_opens', 'support_clicks']
const EMPTY = {visitors:0,page_views:0,configurations:0,builds:0,builds_failed:0,downloads:0,exports:0,support_opens:0,support_clicks:0}

export function dailyRows(data: UsageStatistics): { day: string; counts: UsageDay | null }[] {
  const byDay = new Map(data.rows.map(row => [row.day,row]))
  return Array.from({length:data.days},(_,index) => {
    const date = new Date(data.from+'T00:00:00Z')
    date.setUTCDate(date.getUTCDate()+index)
    const day = date.toISOString().slice(0,10)
    const counts = !data.collectionStarted || day < data.collectionStarted.slice(0,10) ? null
      : byDay.get(day)??{day,...EMPTY}
    return {day,counts}
  })
}

/** The 7-day view's UTC hours up to the current one, oldest first; null when the response has no hours (30 and 90 days).
 * Hours before hourly counting began have no value rather than an invented zero. */
export function hourlyRows(data: UsageStatistics): { hour: string; counts: UsageHour | null }[] | null {
  if (!data.hourly) return null
  const byHour = new Map(data.hourly.map(row => [row.hour,row]))
  const started = data.hourlyStarted?.slice(0,13) ?? null, last = data.generatedAt.slice(0,13), first = Date.parse(data.from+'T00:00:00Z')
  return Array.from({length:data.days*24},(_,index) => new Date(first+index*3600000).toISOString().slice(0,13)).filter(hour => hour<=last)
    .map(hour => ({hour,counts:!started || hour<started ? null : byHour.get(hour)??{hour,...EMPTY}}))
}

export function usageInsights(data: UsageStatistics) {
  const rows = dailyRows(data)
  const collected = rows.flatMap(row => row.counts ? [row.counts] : [])
  const completed = collected.filter(row => row.day < data.to && row.day > (data.collectionStarted?.slice(0,10)??data.to))
  const totals = Object.fromEntries(usageMetrics.map(([key]) => [key,collected.reduce((sum,row) => sum+row[key],0)])) as Record<UsageMetric,number>
  const compare = (key: UsageMetric) => {
    if (!data.comparison || data.comparison.unavailableReason) return null
    const current = completed.reduce((sum,row) => sum+row[key],0)
    const previous = data.comparison.rows.reduce((sum,row) => sum+row[key],0)
    return {current,previous,percent:previous ? (current-previous)/previous*100 : null}
  }
  const peak = completed.reduce<UsageDay|null>((best,row) => !best || row.visitors>best.visitors ? row : best,null)
  return {rows,totals,compare,completedDays:completed.length,averageVisitors:completed.length ? completed.reduce((sum,row) => sum+row.visitors,0)/completed.length : null,
    activeDays:completed.filter(row => row.visitors>0).length,peak:peak?.visitors ? peak : null,today:collected.find(row => row.day===data.to)?.visitors??0}
}

/** Reconcile the machine split against period totals, including older clients without attribution. */
export function usageMachineBreakdown(data: UsageStatistics) {
  if (!data.devices) return []
  const totals = usageInsights(data).totals
  const unattributed = {
    device: 'unattributed' as const,
    builds: Math.max(0, totals.builds - data.devices.reduce((sum, row) => sum + row.builds, 0)),
    builds_failed: Math.max(0, totals.builds_failed - data.devices.reduce((sum, row) => sum + row.builds_failed, 0)),
    downloads: Math.max(0, totals.downloads - data.devices.reduce((sum, row) => sum + row.downloads, 0)),
  }
  return [...data.devices, unattributed]
}

export type ModuleInsightSort = 'downloads' | 'downloadsWeek' | 'likes' | 'ratingAverage' | 'comments' | 'openIssues'
export function rankedModules(modules: readonly AdminModuleInsight[], sort: ModuleInsightSort, search: string) {
  const query = search.trim().toLowerCase()
  const rating = (module: AdminModuleInsight) => ({ average: module.ratingAverage, count: module.ratings })
  const prior = sort === 'ratingAverage' ? ratingPrior(modules.map(rating)) : 3
  return modules.filter(module => (module.title+' '+module.moduleId).toLowerCase().includes(query))
    .sort((a,b) => {
      if (sort === 'ratingAverage') return (bayesianRating(rating(b), prior) ?? 0) - (bayesianRating(rating(a), prior) ?? 0)
        || b.ratings - a.ratings || a.title.localeCompare(b.title) || a.moduleId.localeCompare(b.moduleId)
      return (b[sort]??-1)-(a[sort]??-1) || (sort==='downloadsWeek' ? b.downloadsWeek-b.downloadsPreviousWeek-(a.downloadsWeek-a.downloadsPreviousWeek) : 0) || a.title.localeCompare(b.title)
    })
}

export function usageCsv(data: UsageStatistics) {
  return ['date_utc,coverage,'+usageMetrics.map(([key]) => key).join(','),...dailyRows(data).map(({day,counts}) => {
    const coverage = !counts ? 'uncollected' : day===data.to || day===data.collectionStarted?.slice(0,10) ? 'partial' : 'complete'
    return [day,coverage,...usageMetrics.map(([key]) => counts?.[key]??'')].join(',')
  })].join('\n')+'\n'
}

export const accountMetrics = [['signups', 'Sign-ups'], ['completed', 'Completed sign-ups'], ['rate', 'Sign-ups per 100 visitors'], ['active', 'Active members']] as const
export type AccountMetric = typeof accountMetrics[number][0]

const percent = (current: number, previous: number) => previous ? (current - previous) / previous * 100 : null
const sum = (rows: readonly AdminAccountsDay[], key: 'signups' | 'completed' | 'visitors') => rows.reduce((total, row) => total + (row[key] ?? 0), 0)

/** One day's chart value: null marks a day whose visitors or members were not counted, so no value exists. */
export function accountDayValue(row: AdminAccountsDay, metric: AccountMetric, partialDay: string | null): number | null {
  if (metric !== 'rate') return row[metric]
  if (row.visitors === null || row.day === partialDay) return null
  return row.visitors ? row.signups / row.visitors * 100 : 0
}

/** Reads the member statistics the way the usage dashboard reads traffic: today is partial and excluded from
 * period totals, rates and comparisons. The sign-up rate divides sign-ups by the estimated daily visitors of the
 * same days, counting only days whose visitors were fully collected. Daily visitors are rotating identifiers,
 * so the rate is an approximation of sign-ups per 100 visits, not per 100 people. */
export function accountInsights(data: AdminAccounts) {
  const completed = data.daily.filter(row => row.day < data.to)
  const covered = completed.filter(row => row.visitors !== null && row.day !== data.visitorsFrom)
  const visitors = sum(covered, 'visitors'), signups = sum(completed, 'signups'), finished = sum(completed, 'completed')
  const rate = visitors ? sum(covered, 'signups') / visitors * 100 : null
  const previousRate = data.previous.visitors ? data.previous.signups / data.previous.visitors * 100 : null
  return {
    completedDays: completed.length,
    signups: { current: signups, previous: data.previous.signups, percent: percent(signups, data.previous.signups) },
    completion: { signups, completed: finished, percent: signups ? finished / signups * 100 : null,
      previous: data.previous.signups ? data.previous.completed / data.previous.signups * 100 : null },
    rate: { value: rate, coveredDays: covered.length, visitors, previous: previousRate },
    value: (row: AdminAccountsDay, metric: AccountMetric) => accountDayValue(row, metric, data.visitorsFrom),
  }
}
