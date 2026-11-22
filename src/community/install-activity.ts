import type { OctatrackInstallEvent, UsageStatistics } from './usage-contract'

export const installSeries = [
  ['downloads', 'Firmware downloads'],
  ['base_first_connection', 'Confirmed base installs'],
  ['base_usb_update_done', 'Completed USB updates'],
  ['usb_sync_kept', 'Kept module syncs'],
] as const

export function installActivityDays(data: UsageStatistics, days: { day: string; counts: { downloads: number } | null }[]) {
  const activity = data.installActivity
  if (!activity) return []
  const byDay = new Map<string, Partial<Record<OctatrackInstallEvent, number>>>()
  for (const { day, event, count } of activity.counts) {
    const counts = byDay.get(day) ?? {}
    counts[event] = count
    byDay.set(day, counts)
  }
  return days.map(({ day, counts }) => {
    const values = installSeries.map(([event]) => {
      if (event === 'downloads') return counts?.downloads ?? null
      const start = event === 'usb_sync_kept' ? activity.syncFrom : activity.guideFrom
      return start && day >= start ? byDay.get(day)?.[event] ?? 0 : null
    })
    const recorded = values.filter(value => value !== null)
    return { day, values, total: recorded.length ? recorded.reduce((sum, value) => sum + value, 0) : null,
      incomplete: recorded.length < values.length || day === data.to || day === data.collectionStarted?.slice(0,10)
        || day === activity.guideFrom || day === activity.syncFrom }
  })
}
