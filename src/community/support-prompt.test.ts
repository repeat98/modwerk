import { afterEach, describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import type { DatabaseSync } from 'node:sqlite'
import { testServer } from './test-server'
import { SUPPORT_PROMPT_COOLDOWN, answerSupportPrompt, dueSupportPrompt, isDayMilestone, isInstallMilestone, noteSupportBase, noteSupportInstall, noteSupportVisit, readSupportPrompt } from './support-prompt'
import { SUPPORT_PROMPT_COUNTS, type UsageStatistics } from './usage-contract'
import { SiteCounts } from './SiteCounts'
import { SupportCosts, SupportLine, SupportMilestoneDialog } from '../components/SupportDialog'

const DAY = 86400000, START = Date.UTC(2026, 10, 1, 12)
function memory() {
  const values = new Map<string, string>()
  return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value) } }
}

describe('support thank-you', () => {
  it('is earned on the 5th, 25th, 100th and every 100th install, and the 10th and 30th day of use', () => {
    expect([1, 4, 5, 6, 24, 25, 26, 99, 100, 150, 200, 300].filter(isInstallMilestone)).toEqual([5, 25, 100, 200, 300])
    expect(Array.from({ length: 60 }, (_, index) => index + 1).filter(isDayMilestone)).toEqual([10, 30])
  })

  it('keeps an install milestone for a later visit and shows it once', () => {
    const storage = memory()
    for (let install = 1; install <= 4; install++) noteSupportInstall(storage, START)
    expect(dueSupportPrompt(START + 1, storage, START + 1)).toBeNull()
    noteSupportInstall(storage, START)
    // The page where the 5th install happened was loaded before it: no note during the install.
    expect(dueSupportPrompt(START - 1, storage, START)).toBeNull()
    expect(dueSupportPrompt(START + 1, storage, START + 1)).toEqual({ kind: 'installs', count: 5 })
    answerSupportPrompt('later', storage, START + 1)
    expect(dueSupportPrompt(START + 2, storage, START + 2)).toBeNull()
    expect(readSupportPrompt(storage)).toEqual({ installs: 5, days: 0, shownAt: START + 1 })
  })

  it('counts each day once and earns a note on the 10th', () => {
    const storage = memory()
    for (let day = 0; day < 10; day++) { noteSupportVisit(storage, START + day * DAY); noteSupportVisit(storage, START + day * DAY + 1000) }
    expect(readSupportPrompt(storage).days).toBe(10)
    expect(dueSupportPrompt(START + 10 * DAY, storage, START + 10 * DAY)).toEqual({ kind: 'days', count: 10 })
  })

  it('earns a note when the base is installed or updated', () => {
    const storage = memory()
    noteSupportBase(storage, START)
    expect(dueSupportPrompt(START + 1, storage, START + 1)).toEqual({ kind: 'base', count: 1 })
  })

  it('shows at most one note in 60 days, whatever earned it', () => {
    const storage = memory()
    noteSupportBase(storage, START)
    answerSupportPrompt('later', storage, START + 1)
    for (let install = 1; install <= 5; install++) noteSupportInstall(storage, START + DAY)
    expect(dueSupportPrompt(START + 2 * DAY, storage, START + 2 * DAY)).toBeNull()
    noteSupportBase(storage, START + SUPPORT_PROMPT_COOLDOWN + DAY)
    expect(dueSupportPrompt(START + SUPPORT_PROMPT_COOLDOWN + 2 * DAY, storage, START + SUPPORT_PROMPT_COOLDOWN + 2 * DAY)).toEqual({ kind: 'base', count: 1 })
  })

  it('never asks again after a Ko-fi click or Don’t show again', () => {
    for (const answer of ['kofi', 'never'] as const) {
      const storage = memory()
      answerSupportPrompt(answer, storage, START)
      for (let install = 1; install <= 100; install++) noteSupportInstall(storage, START + SUPPORT_PROMPT_COOLDOWN * 2)
      noteSupportBase(storage, START + SUPPORT_PROMPT_COOLDOWN * 2)
      expect(dueSupportPrompt(START + SUPPORT_PROMPT_COOLDOWN * 3, storage, START + SUPPORT_PROMPT_COOLDOWN * 3)).toBeNull()
      expect(readSupportPrompt(storage)).toEqual({ installs: 100, days: 0, done: answer })
    }
  })

  it('ignores damaged saved state and works without storage', () => {
    const storage = memory()
    storage.setItem('modwerk.support.prompt', '{"installs":-3,"days":"9","pending":{"kind":"spam","count":5},"pendingAt":1,"lastDay":"today","done":"maybe"}')
    expect(readSupportPrompt(storage)).toEqual({ installs: 0, days: 0 })
    storage.setItem('modwerk.support.prompt', 'not json')
    expect(readSupportPrompt(storage)).toEqual({ installs: 0, days: 0 })
    expect(() => { noteSupportInstall(null); noteSupportVisit(null); noteSupportBase(null); answerSupportPrompt('kofi', null) }).not.toThrow()
    expect(dueSupportPrompt(Date.now(), null)).toBeNull()
  })

  it('shows the monthly costs, and a Ko-fi bar only once a month’s amount is known', () => {
    expect(renderToStaticMarkup(createElement(SupportCosts, { costs: { monthly: 0 } }))).toBe('')
    const plain = renderToStaticMarkup(createElement(SupportCosts, { costs: { monthly: 145 } }))
    expect(plain).toContain('about <strong>€145 a month</strong> for hosting and tokens.')
    expect(plain).not.toContain('Ko-fi covered')
    const split = renderToStaticMarkup(createElement(SupportCosts, { costs: { monthly: 100, hosting: 40, tokens: 60, month: '2026-11', covered: 25 } }))
    expect(split).toContain('(hosting €40 · tokens €60)')
    expect(split).toContain('Ko-fi covered €25 of €100 in November 2026')
    expect(split).toContain('width:25%')
    expect(renderToStaticMarkup(createElement(SupportCosts, { costs: { monthly: 100, month: '2026-12', covered: 250 } }))).toContain('width:100%')
  })

  it('renders dialogs that close at once and a line that opens Ko-fi in a new tab', () => {
    const titles = { installs: 'Your 25th install with Modwerk', days: '10 days with Modwerk', base: 'Your instrument runs the Modwerk base' }
    for (const [kind, count] of [['installs', 25], ['days', 10], ['base', 1]] as const) {
      const dialog = renderToStaticMarkup(createElement(SupportMilestoneDialog, { reason: { kind, count }, url: 'https://ko-fi.com/example', onAnswer: () => {} }))
      expect(dialog).toContain(titles[kind])
      expect(dialog).toContain('Not now')
      expect(dialog).toContain('Don’t show again')
      expect(dialog).not.toMatch(/disabled/)
    }
    const line = renderToStaticMarkup(createElement(SupportLine, { url: 'https://ko-fi.com/example' }))
    expect(line).toContain('href="https://ko-fi.com/example" target="_blank" rel="noopener noreferrer"')
    expect(renderToStaticMarkup(createElement(SupportLine, { url: '' }))).toBe('')
  })
})

describe('support thank-you statistics', () => {
  it('shows each answer by trigger and adds up Ko-fi clicks by place', () => {
    const siteCounts = ([['installs-shown', 40], ['installs-kofi', 4], ['installs-closed', 6], ['installs-never', 3], ['days-kofi', 2], ['base-kofi', 1], ['line-kofi', 5], ['dialog-kofi', 7], ['bell-kofi', 1]] as const)
      .map(([detail, count]) => ({ event: 'support_prompt' as const, detail, count }))
    const html = renderToStaticMarkup(createElement(SiteCounts, { data: { siteCounts, siteCountsStarted: '2026-11-01T00:00:00Z', from: '2026-11-18', to: '2026-11-24' } as unknown as UsageStatistics }))
    expect(html).toContain('<th scope="row">Install milestones</th><td>40</td><td>4</td><td>0</td><td>6</td><td>3</td><td>10 %</td>')
    expect(html).toContain('<th scope="row">Thank-you dialog</th><td>7</td>')
    expect(html).toContain('<th scope="row">Contribute to Modwerk dialog</th><td>7</td>')
    expect(html).toContain('<th scope="row">Signup welcome</th><td>0</td>')
  })
})

describe('support thank-you counts on the server', () => {
  const databases: DatabaseSync[] = []
  afterEach(() => { databases.splice(0).forEach(db => db.close()) })
  it('accepts each fixed outcome and refuses anything else', async () => {
    const server = await testServer(); databases.push(server.db)
    for (const detail of SUPPORT_PROMPT_COUNTS) expect((await server.call('/usage/count', 'POST', { event: 'support_prompt', detail })).status).toBe(200)
    for (const detail of ['installs-25', 'other-kofi', 'creator-kofi']) expect((await server.call('/usage/count', 'POST', { event: 'support_prompt', detail })).status).toBe(400)
    expect(server.db.prepare("SELECT count(*) AS n FROM site_count_daily WHERE event='support_prompt'").get()).toEqual({ n: SUPPORT_PROMPT_COUNTS.length })
  })
})
