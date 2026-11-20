// Confirmation is distinct from open reports; an older response without triage must not imply no known bugs.
// downloads7/30/90 come from the daily counts, which start at dailyStarted and are kept for 90 days.
export type ModuleStatistics = { module_id: string; average: number | null; count: number; likes: number; downloads: number; downloadsStarted: string | null; downloads7?: number; downloads30?: number; downloads90?: number; dailyStarted?: string | null; worksReports?: number; firstDownloadAt?: string | null; openIssues?: number; lastIssueAt?: string | null; confirmedIssues?: number; unconfirmedIssues?: number; needsInfoIssues?: number; lastConfirmedIssueAt?: string | null }
export const MODULE_STATISTICS_CHANGED = 'modwerk-module-statistics'
export const DEFAULT_MODULE_SORT = 'updated'
// Every library sort, with the short label the phone results bar shows beside its sort icon.
export const MODULE_SORTS = [
  { value: 'updated', label: 'Recently updated', short: 'Updated' },
  { value: 'recent', label: 'Recently added', short: 'Newest' },
  { value: 'collection', label: 'Collection order', short: 'Collection' },
  { value: 'name', label: 'Name A–Z', short: 'A–Z' },
  { value: 'author', label: 'Author', short: 'Author' },
  { value: 'working', label: 'Most reported working', short: 'Working' },
  { value: 'liked', label: 'Most liked', short: 'Likes' },
  { value: 'downloaded', label: 'Most downloaded', short: 'Downloads' },
] as const
// Most downloaded is one sort with a period beside it: 'downloaded' counts all time, 'downloaded-30' the last 30 days.
export const DOWNLOAD_PERIODS = [
  { days: 7, value: 'downloaded-7', label: 'Last 7 days', short: '7 days' },
  { days: 30, value: 'downloaded-30', label: 'Last 30 days', short: '30 days' },
  { days: 90, value: 'downloaded-90', label: 'Last 90 days', short: '90 days' },
  { days: 0, value: 'downloaded', label: 'All time', short: 'All time' },
] as const
export type DownloadDays = typeof DOWNLOAD_PERIODS[number]['days']
export const MODULE_SORT_VALUES: readonly string[] = [...MODULE_SORTS.map(option => option.value), ...DOWNLOAD_PERIODS.map(period => period.value)]
/** The period a download sort counts over (0 for all time), or undefined for every other sort. */
export function downloadPeriod(sort: string): DownloadDays | undefined {
  return DOWNLOAD_PERIODS.find(period => period.value === sort)?.days
}
/** The entry of MODULE_SORTS a sort shows as: every download period shows as Most downloaded. */
export function sortOption(sort: string) {
  const value = downloadPeriod(sort) === undefined ? sort : 'downloaded'
  return MODULE_SORTS.find(option => option.value === value) ?? MODULE_SORTS[0]
}
/** A module's download count over a period; undefined when the service did not answer or predates period counts. */
export function downloadsIn(statistics: ModuleStatistics | undefined, days: DownloadDays) {
  return days ? statistics?.[`downloads${days}`] : statistics?.downloads
}
type SortableModule = { id: string; name: string; authorName: string; addedAt?: string; updatedAt?: string }
const timestamp = (date: string | undefined) => { const value = Date.parse(date ?? ''); return Number.isFinite(value) ? value : 0 }
export function compareModules(a: SortableModule, b: SortableModule, sort: string, statistics: readonly ModuleStatistics[] | null) {
  if (sort === 'collection') return 0
  if (sort === 'updated') {
    const updated = (module: SortableModule) => Math.max(timestamp(module.addedAt), timestamp(module.updatedAt))
    return updated(b) - updated(a) || a.name.localeCompare(b.name)
  }
  if (sort === 'recent') {
    return timestamp(b.addedAt) - timestamp(a.addedAt) || a.name.localeCompare(b.name)
  }
  if (sort === 'name') return a.name.localeCompare(b.name)
  if (sort === 'author') return a.authorName.localeCompare(b.authorName) || a.name.localeCompare(b.name)
  const count = (module: SortableModule, metric: 'worksReports' | 'likes' | 'downloads' | 'downloads7' | 'downloads30' | 'downloads90') => statistics?.find(item => item.module_id === module.id)?.[metric] ?? 0
  // Working reports lead, likes break their ties; the other two sorts fall back to the name.
  if (sort === 'working') return count(b, 'worksReports') - count(a, 'worksReports') || count(b, 'likes') - count(a, 'likes') || a.name.localeCompare(b.name)
  if (sort === 'liked') return count(b, 'likes') - count(a, 'likes') || a.name.localeCompare(b.name)
  const days = downloadPeriod(sort)
  if (days !== undefined) {
    const metric = days ? `downloads${days}` as const : 'downloads'
    return count(b, metric) - count(a, metric) || a.name.localeCompare(b.name)
  }
  return 0
}
const shortDate = (date: string) => new Date(date).toLocaleDateString(undefined,{year:'numeric',month:'short',day:'numeric',timeZone:'UTC'})
/** What a period's download count covers; daily counts began later than some windows reach back. */
export function periodCoverage(days: Exclude<DownloadDays, 0>, dailyStarted: string | null | undefined, now = Date.now()) {
  const started = Date.parse(dailyStarted ?? '')
  const partial = Number.isFinite(started) && started > now - days * 86400000
  return 'Counts firmware download requests in the last ' + days + ' days' + (partial ? ' (daily counts began ' + shortDate(dailyStarted!) + ')' : '') + '. Each included module counts once per request.'
}
export function downloadCoverage(started: string | null | undefined) {
  return started ? 'Counts firmware download requests since ' + shortDate(started) + '. Each included module counts once per request.' : 'Counts firmware download requests since tracking began. Each included module counts once per request.'
}
/** The coverage note for the download count a period shows. */
export function downloadNote(days: DownloadDays, statistics: ModuleStatistics | undefined) {
  return days ? periodCoverage(days, statistics?.dailyStarted) : downloadCoverage(statistics?.downloadsStarted)
}
