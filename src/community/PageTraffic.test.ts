import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { PageTraffic } from './PageTraffic'
import { pageTraffic } from './page-traffic'
import type { UsageStatistics } from './usage-contract'
const data: UsageStatistics = { generatedAt: '2026-10-08T12:00:00Z', collectionStarted: '2026-10-01T12:00:00Z', from: '2026-10-02', to: '2026-10-08', days: 7,
  rows: [{day: '2026-10-07', visitors: 8, page_views: 20, configurations: 0, builds: 0, builds_failed: 0, downloads: 0, exports: 0, support_opens: 0, support_clicks: 0}],
  pagesStarted: '2026-10-05T12:00:00Z', pages: [{day: '2026-10-05', page: 'forum', views: 3}, {day: '2026-10-07', page: 'forum', views: 2}, {day: '2026-10-07', page: 'library:all', views: 10}] }
const render = (value: UsageStatistics) => renderToStaticMarkup(createElement(PageTraffic, {data: value}))
describe('page traffic reporting', () => {
  it('qualifies legacy mixed counts without changing their history', () => {
    const legacy = {...data, pages: [{day: '2026-10-07', page: 'page-not-found', views: 12}]}
    expect(pageTraffic(legacy).ranked).toEqual([{page: 'page-not-found', views: 12}])
    expect(render(legacy)).toContain('Legacy unclassified / missing pages')
    expect(render(legacy)).toContain('cannot be interpreted as broken links')
    expect(render(data)).not.toContain('cannot be interpreted as broken links')
  })
  it('ranks by views, distinguishes unnamed traffic and sums only the selected period', () => {
    const value = pageTraffic({...data, pages: [...data.pages!, {day: '2026-09-30', page: 'faq', views: 100}]})
    expect(value.ranked).toEqual([{page: 'library:all', views: 10}, {page: 'forum', views: 5}])
    expect(value.total).toBe(15); expect(value.unattributed).toBe(5)
    expect(render(data)).toContain('66.7%'); expect(render(data)).toContain('5 other page views have no page name')
  })
  it('distinguishes uncollected days, zero days and partial days when selecting a page', () => {
    const days = pageTraffic(data, 'forum').days
    expect(days.map(row => row.views)).toEqual([null, null, null, 3, 0, 2, 0])
    expect(days.filter(row => row.partial).map(row => row.day)).toEqual(['2026-10-05', '2026-10-08'])
    const html = render(data)
    expect(html).toContain('2026-10-04 · Not collected'); expect(html).toContain('2026-10-06 · 0 views')
    expect(html.match(/tabindex="0"/g)).toHaveLength(2) // scrollable table and one chart bar
    expect(html).not.toMatch(/NaN|Infinity|undefined/)
  })
  it('shows honest waiting and old-backend states without fabricated zeros', () => {
    expect(render({...data, pagesStarted: null, pages: []})).toContain('Waiting for the first named page view')
    expect(render({...data, pagesStarted: undefined, pages: undefined})).toContain('not available from this backend yet')
    const empty = render({...data, pages: [], rows: []})
    expect(empty).toContain('No named page views recorded'); expect(empty).not.toMatch(/NaN|Infinity|undefined/)
  })
})
