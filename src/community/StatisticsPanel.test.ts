import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { usageMachineBreakdown } from './statistics-insights'
import { UsageDashboard } from './StatisticsPanel'
import { CommunityInsights } from './CommunityInsights'
import type { UsageDay, UsageStatistics } from './usage-contract'
import type { AdminInsights } from './admin-insights-contract'

const row = (day: string, builds: number, failed: number): UsageDay => ({ day, visitors: 10, page_views: 20, configurations: 1, builds, builds_failed: failed, downloads: 2, exports: 0, support_opens: 4, support_clicks: 1 })
const usage: UsageStatistics = { generatedAt: '2026-10-06T12:00:00Z', collectionStarted: '2026-09-01T00:00:00Z', from: '2026-09-30', to: '2026-10-06', days: 7,
  rows: [row('2026-10-04', 2, 0), row('2026-10-05', 3, 1), row('2026-10-06', 1, 1)],
  comparison: { from: '2026-09-24', to: '2026-09-29', rows: [row('2026-09-25', 4, 0)], unavailableReason: null },
  breakdownsStarted: '2026-10-04T08:00:00Z',
  devices: [{ device: 'octatrack', builds: 4, builds_failed: 1, downloads: 3 }, { device: 'digitakt', builds: 2, builds_failed: 1, downloads: 2 }, { device: 'digitone', builds: 0, builds_failed: 0, downloads: 1 }] }
const dashboard = (value: UsageStatistics) => renderToStaticMarkup(createElement(UsageDashboard, { data: value }))

describe('usage dashboard breakdowns', () => {
  it('reconciles older unattributed events and labels expanded coverage', () => {
    const data = { ...usage, machineCoverageExpanded: '2026-10-27T10:00:00Z',
      rows: [row('2026-10-05', 12, 4)],
      devices: [{ device: 'digitakt-ii' as const, builds: 2, builds_failed: 1, downloads: 0 }, { device: 'analog-rytm-mkii' as const, builds: 2, builds_failed: 0, downloads: 1 }] }
    const split = usageMachineBreakdown(data)
    expect(split.at(-1)).toEqual({ device: 'unattributed', builds: 8, builds_failed: 3, downloads: 1 })
    for (const key of ['builds', 'builds_failed', 'downloads'] as const) expect(split.reduce((sum, value) => sum + value[key], 0)).toBe(data.rows[0][key])
    const html = dashboard(data)
    expect(html).toContain('Digitakt II')
    expect(html).toContain('Analog Rytm MKII')
    expect(html).toContain('<th scope="row">Unattributed</th><td>8</td><td>3</td>')
    expect(html).toContain('2026-10-27; that day is partial')
    expect(usageMachineBreakdown({ ...usage, devices: undefined })).toEqual([])
  })

  it('shows support dialog opens and Ko-fi clicks, compared only once both windows were counted', () => {
    const html = dashboard({ ...usage, hourlyStarted: '2026-10-04T08:00:00Z' })
    expect(html).toContain('<dt>Support dialog opens</dt><dd>12</dd>')
    expect(html).toMatch(/<dt>Ko-fi clicks<\/dt><dd>3<\/dd><small>Selected period · includes today<\/small><small>Comparison unavailable<\/small>/)
    expect(html).toContain('Both are counted from')
    expect(dashboard({ ...usage, hourlyStarted: '2026-09-01T00:00:00Z' })).toMatch(/<dt>Ko-fi clicks<\/dt><dd>3<\/dd><small>Selected period · includes today<\/small><small class="statistics-change">/)
  })
  it('offers hourly bars only when the response carries hours', () => {
    expect(dashboard(usage)).toMatch(/<button type="button" aria-pressed="false" disabled="" title="Hourly counts are kept for 14 days[^"]*">Hourly<\/button>/)
    expect(dashboard({ ...usage, hourlyStarted: '2026-10-05T00:00:00Z', hourly: [] })).toContain('<button type="button" aria-pressed="false">Hourly</button>')
  })
  it('shows failed builds, the machine split and its failure rates', () => {
    const html = dashboard(usage)
    expect(html).toContain('<dt>Failed builds</dt><dd>2</dd>')
    expect(html).toContain('By machine · counted since')
    expect(html).toContain('build failure rate 25%')
    expect(html).toContain('<th scope="row">Octatrack</th><td>4</td><td>1</td><td>20%</td><td>3</td>')
    expect(html).toContain('<th scope="row">Digitone</th><td>0</td><td>0</td><td>—</td><td>1</td>')
    expect(html).not.toMatch(/NaN|undefined|Infinity/)
  })
  it('compares builds only when both windows were counted the new way', () => {
    const before = dashboard(usage)
    expect(before.match(/<dt>(Successful|Failed) builds<\/dt><dd>\d+<\/dd><small>Selected period · includes today<\/small><small>Comparison unavailable<\/small>/g)).toHaveLength(2)
    const after = dashboard({ ...usage, breakdownsStarted: '2026-09-01T00:00:00Z', hourlyStarted: '2026-09-01T00:00:00Z' })
    expect(after).not.toContain('Comparison unavailable')
    expect(after).not.toContain('counted since')
    // Without the breakdowns (an older backend), the machine table is left out.
    expect(dashboard({ ...usage, breakdownsStarted: undefined, devices: undefined })).not.toContain('By machine')
  })
})

const insights: AdminInsights = { generatedAt: '2026-10-06T12:00:00Z', downloadsStarted: '2026-09-01T00:00:00Z', trendsStarted: '2026-10-01T00:00:00Z',
  totals: { openIssues: 0, closedIssues: 0, comments: 0, likes: 0, ratings: 0, downloads: 30, published: 0, mediaBytes: 0 }, issueAges: { underWeek: 0, weekToMonth: 0, overMonth: 0, oldest: null },
  modules: [{ moduleId: 'miniverb', title: 'Miniverb', available: true, downloads: 20, downloadsWeek: 7, downloadsPreviousWeek: 3, likes: 0, ratings: 0, ratingAverage: null, comments: 0, openIssues: 0 },
    { moduleId: 'tapeecho', title: 'Tape Echo', available: true, downloads: 10, downloadsWeek: 0, downloadsPreviousWeek: 0, likes: 0, ratings: 0, ratingAverage: null, comments: 0, openIssues: 0 }] }

describe('module engagement trends', () => {
  it('explains Bayesian ranking while showing the observed rating and sample size', () => {
    const data = { ...insights, modules: [{ ...insights.modules[0], ratingAverage: 5, ratings: 1 }] }
    const html = renderToStaticMarkup(createElement(CommunityInsights, { data, onNavigate: () => {} }))
    expect(html).toContain('<option value="ratingAverage">Rating (Bayesian)</option>')
    expect(html).toContain('<td>5.0 / 5<small>1 rating</small></td>')
    expect(html).toContain('Ratings with fewer votes stay closer to the community average')
    expect(html).not.toContain('ratings are not weighted by sample size')
  })
  it('shows this week\'s download requests against the week before', () => {
    const html = renderToStaticMarkup(createElement(CommunityInsights, { data: insights, onNavigate: () => {} }))
    expect(html).toContain('<th scope="col">This week</th>')
    expect(html).toContain('<td>7<small>+4 vs week before</small></td>')
    expect(html).toContain('<td>0<small>none either week</small></td>')
    expect(html).toContain('<option value="downloadsWeek">Download requests this week</option>')
    expect(html).toContain('daily module counts began')
    const before = renderToStaticMarkup(createElement(CommunityInsights, { data: { ...insights, trendsStarted: null }, onNavigate: () => {} }))
    expect(before).not.toMatch(/vs week before|daily module counts began/)
  })
})
