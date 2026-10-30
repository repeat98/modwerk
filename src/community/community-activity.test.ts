import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { readFileSync } from 'node:fs'
import type { DatabaseSync } from 'node:sqlite'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { testDatabase } from './test-server'
import { adminActivity, median, unansweredThreads } from '../../server/admin-activity'
import { issueStatusStatements } from '../../server/issue-notifications'
import { CommunityActivityReport } from './CommunityActivity'
import type { AdminActivity } from './admin-activity-contract'

const databases: DatabaseSync[] = []
afterEach(() => { for (const db of databases.splice(0)) db.close() })
const now = new Date('2026-10-06T12:00:00Z')
const at = (hoursAgo: number) => new Date(now.getTime() - hoursAgo * 3600000).toISOString().replace('T', ' ').slice(0, 19)

function fixture() {
  const { db, adapter } = testDatabase(); databases.push(db)
  const user = db.prepare('INSERT INTO users(id,display_name,username,email_verified) VALUES(?,?,?,1)')
  for (const id of ['alpha', 'bravo']) user.run(id, id, id)
  const thread = (id: string, author: string, hoursAgo: number, extra: { hidden?: number; locked?: number; status?: string } = {}) => {
    db.prepare("INSERT INTO forum_threads(id,user_id,title,category,created_at,updated_at,hidden,locked,status) VALUES(?,?,?,'general',?,?,?,?,?)").run(id, author, 'Thread ' + id, at(hoursAgo), at(hoursAgo), extra.hidden ?? 0, extra.locked ?? 0, extra.status ?? 'open')
    db.prepare('INSERT INTO forum_posts(id,thread_id,user_id,body,created_at) VALUES(?,?,?,?,?)').run(id, id, author, 'Opening', at(hoursAgo))
  }
  const reply = (id: string, threadId: string, author: string, hoursAgo: number, hidden = 0) => db.prepare('INSERT INTO forum_posts(id,thread_id,user_id,body,created_at,hidden) VALUES(?,?,?,?,?,?)').run(id, threadId, author, 'Reply', at(hoursAgo), hidden)
  const issue = (id: string, hoursAgo: number, closedHoursAgo: number | null) => db.prepare("INSERT INTO issues(id,module_id,author_login,reporter_id,title,body,status,created_at,closed_at) VALUES(?,'digitakt-digihealth','dev','alpha','Bug','Body',?,?,?)").run(id, closedHoursAgo === null ? 'open' : 'closed', at(hoursAgo), closedHoursAgo === null ? null : at(closedHoursAgo))
  return { db, adapter, thread, reply, issue }
}

describe('forum and issue activity statistics', () => {
  it('counts member threads, replies, shouts and issues per day and measures first replies', async () => {
    const f = fixture()
    f.thread('quick', 'alpha', 30); f.reply('quick-1', 'quick', 'bravo', 28)
    f.thread('slow', 'alpha', 100); f.reply('slow-self', 'slow', 'alpha', 99); f.reply('slow-1', 'slow', 'bravo', 30)
    f.thread('waiting', 'bravo', 60); f.reply('waiting-hidden', 'waiting', 'alpha', 50, 1)
    f.thread('fresh', 'bravo', 5)
    f.thread('closed', 'bravo', 70, { status: 'resolved' }); f.thread('hidden', 'bravo', 70, { hidden: 1 })
    f.thread('old', 'alpha', 24 * 40)
    // The automatic module thread and its intro are not member activity; a module comment is.
    f.db.prepare("INSERT INTO forum_threads(id,user_id,title,category,module_id,created_at) VALUES('module-digitakt-digihealth','modwerk','Digihealth discussion','modules','digitakt-digihealth',?)").run(at(10))
    f.db.prepare("INSERT INTO forum_posts(id,thread_id,user_id,body,created_at) VALUES('module-digitakt-digihealth','module-digitakt-digihealth','modwerk','Intro',?)").run(at(10))
    f.reply('comment', 'module-digitakt-digihealth', 'alpha', 3)
    f.db.prepare("INSERT INTO forum_shouts(id,user_id,body,created_at) VALUES('s1','alpha','Hi',?),('s2','bravo','Hidden',?)").run(at(2), at(2))
    f.db.exec("UPDATE forum_shouts SET hidden=1 WHERE id='s2'")
    f.issue('i-open', 20, null); f.issue('i-fast', 50, 26); f.issue('i-slow', 24 * 12, 24 * 2); f.issue('i-before', 24 * 40, 24 * 35)
    f.issue('i-unknown', 24 * 50, null); f.db.exec("UPDATE issues SET status='closed' WHERE id='i-unknown'")

    const prepare = vi.spyOn(f.adapter, 'prepare')
    const data = await adminActivity(f.adapter, now, 7)
    expect(prepare).toHaveBeenCalledTimes(5)
    prepare.mockRestore()
    expect(data.daily).toHaveLength(7)
    expect(data.daily.at(-1)!.day).toBe('2026-10-06')
    const total = (key: keyof AdminActivity['daily'][number]) => data.daily.reduce((sum, row) => sum + Number(row[key]), 0)
    expect(total('threads')).toBe(5)
    expect(total('replies')).toBe(4)
    expect(total('shouts')).toBe(1)
    expect(total('issuesOpened')).toBe(2)
    expect(total('issuesClosed')).toBe(2)
    // quick answered after 2 h, slow after 70 h (the author's own bump does not count); waiting and fresh are unanswered.
    expect(data.firstReplies).toEqual({ threads: 5, answered: 2, within48h: 1, medianHours: 36 })
    // Waiting for a reply: waiting (its only reply is hidden) and old. Fresh is under 48 h; resolved and hidden threads are excluded.
    expect(data.unanswered.total).toBe(2)
    expect(data.unanswered.threads.map(thread => thread.id)).toEqual(['old', 'waiting'])
    expect(data.issueTurnaround).toEqual({ closed: 2, medianDays: (1 + 10) / 2, within7Days: 1 })
    expect(data.unknownCloseTimes).toBe(1)
    expect(JSON.stringify(data)).not.toMatch(/alpha|bravo|Opening|Reply|Body/)
    await expect(adminActivity(f.adapter, now, 12)).rejects.toThrow('Choose 7, 30 or 90 days.')
  })

  it('paginates the whole first-reply backlog, filters categories and clamps shrinking pages', async () => {
    const f = fixture()
    for (let i = 0; i < 25; i++) f.thread('queue-' + String(i).padStart(2, '0'), 'alpha', 50 + i)
    f.db.exec("UPDATE forum_threads SET section='requests' WHERE id IN ('queue-00','queue-01','queue-02')")
    f.thread('hidden-queue', 'alpha', 100, { hidden: 1 })
    f.thread('locked-queue', 'alpha', 100, { locked: 1 })
    f.thread('closed-queue', 'alpha', 100, { status: 'resolved' })
    f.thread('fresh-queue', 'alpha', 10)
    f.thread('answered-queue', 'alpha', 100); f.reply('other', 'answered-queue', 'bravo', 70)
    f.thread('seeded-queue', 'modwerk', 100)
    f.reply('self-only', 'queue-24', 'alpha', 20)
    f.reply('hidden-answer', 'queue-23', 'bravo', 20, 1)
    const pages = []
    for (const page of [1, 2, 3]) pages.push(await unansweredThreads(f.adapter, now, new URLSearchParams({ page: String(page) })))
    expect(pages.map(value => value.threads.length)).toEqual([10, 10, 5])
    expect(pages[0].total).toBe(25)
    expect(pages[0].threads[0].id).toBe('queue-24')
    expect(new Set(pages.flatMap(value => value.threads.map(thread => thread.id))).size).toBe(25)
    expect(JSON.stringify(pages)).not.toMatch(/alpha|bravo|Opening|Reply|Body/)
    const newest = await unansweredThreads(f.adapter, now, new URLSearchParams('order=newest&category=requests&page=99'))
    expect(newest).toMatchObject({ total: 3, page: 1, category: 'requests', order: 'newest' })
    expect(newest.threads.map(thread => thread.id)).toEqual(['queue-00', 'queue-01', 'queue-02'])
    expect((await unansweredThreads(f.adapter, now, new URLSearchParams('category=general'))).total).toBe(22)
    f.db.exec("UPDATE forum_threads SET hidden=1 WHERE section='requests'")
    expect(await unansweredThreads(f.adapter, now, new URLSearchParams('category=requests&page=2'))).toMatchObject({ total: 0, page: 1, threads: [] })
    for (const query of ['page=0', 'page=-1', 'page=1.5', 'page=1000000', 'category=unknown', 'category=__proto__', 'order=title']) {
      await expect(unansweredThreads(f.adapter, now, new URLSearchParams(query))).rejects.toThrow()
    }
  })

  it('records when an issue closes, keeps the first closing on repeats and clears it on reopening', async () => {
    const f = fixture(), closedAt = () => f.db.prepare("SELECT closed_at FROM issues WHERE id='i'").get()!.closed_at
    f.issue('i', 30, null)
    await f.adapter.batch(issueStatusStatements(f.adapter, 'i', 'closed', null))
    const first = closedAt()
    expect(first).toMatch(/^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d$/)
    f.db.exec("UPDATE issues SET closed_at='2026-01-01 00:00:00' WHERE id='i'")
    await f.adapter.batch(issueStatusStatements(f.adapter, 'i', 'closed', null))
    expect(closedAt()).toBe('2026-01-01 00:00:00')
    await f.adapter.batch(issueStatusStatements(f.adapter, 'i', 'open', null))
    expect(closedAt()).toBeNull()
    await f.adapter.batch(issueStatusStatements(f.adapter, 'i', 'closed', null))
    expect(closedAt()).not.toBeNull()
  })

  it('backfills earlier closing times from the reporter notification', () => {
    // The migrated schema with a closed issue that has a reporter notification and one that has none; then 0041's backfill runs again.
    const migrations = new URL('../../migrations/', import.meta.url)
    const { db: full } = testDatabase(); databases.push(full)
    full.exec("INSERT INTO users(id,display_name) VALUES('r','r')")
    full.exec("INSERT INTO issues(id,module_id,author_login,reporter_id,title,body,status,created_at) VALUES('n','m','a','r','t','b','closed','2026-09-01 10:00:00'),('x','m','a','r','t','b','closed','2026-09-01 10:00:00')")
    full.exec("INSERT INTO notifications(id,user_id,kind,issue_id,created_at) VALUES('n1','r','issue_resolved','n','2026-09-03 08:00:00')")
    full.exec("UPDATE issues SET closed_at=NULL")
    full.exec(readFileSync(new URL('0041_issue_closed_at.sql', migrations), 'utf8').split('\n').filter(line => line.startsWith('UPDATE')).join('\n'))
    expect(full.prepare("SELECT id,closed_at FROM issues ORDER BY id").all()).toEqual([{ id: 'n', closed_at: '2026-09-03 08:00:00' }, { id: 'x', closed_at: null }])
  })

  it('takes the median of odd and even samples', () => {
    expect(median([])).toBeNull()
    expect(median([5, 1, 3])).toBe(3)
    expect(median([4, 1, 3, 2])).toBe(2.5)
  })
})

const day = (day: string, values: Partial<AdminActivity['daily'][number]> = {}) => ({ day, threads: 0, replies: 0, shouts: 0, issuesOpened: 0, issuesClosed: 0, ...values })
const report: AdminActivity = { generatedAt: '2026-10-06T12:00:00Z', from: '2026-09-30', to: '2026-10-06', days: 7,
  daily: [day('2026-09-30', { threads: 2, replies: 5 }), day('2026-10-01'), day('2026-10-02', { replies: 1, shouts: 3 }), day('2026-10-03'), day('2026-10-04', { issuesOpened: 2 }), day('2026-10-05', { issuesClosed: 1 }), day('2026-10-06', { threads: 1, replies: 2 })],
  firstReplies: { threads: 3, answered: 2, within48h: 2, medianHours: 5.5 }, unanswered: { total: 12, threads: [{ id: 't-1', title: 'Help with <tags>', createdAt: '2026-10-03 12:00:00' }] },
  issueTurnaround: { closed: 4, medianDays: 3, within7Days: 3 }, unknownCloseTimes: 2 }
const render = (value: AdminActivity, metric: 'threads' | 'replies' = 'replies') => renderToStaticMarkup(createElement(CommunityActivityReport, { data: value, loading: false, metric, onMetric: () => {}, selectedDay: '', onSelectDay: () => {}, periodControl: null }))

describe('forum activity report', () => {
  it('shows period totals, reply speed, unanswered threads and issue turnaround', () => {
    const html = render(report)
    expect(html).toContain('New threads</dt><dd>3</dd><small>8 replies and comments · 3 shoutbox messages')
    expect(html).toContain('Answered within 48 h</dt><dd>66.7%</dd><small>2 of 3 new threads answered · median first reply 5.5 h')
    expect(html).toContain('Unanswered 48 h+</dt><dd>12</dd>')
    expect(html).toContain('Issues opened / closed</dt><dd>2 / 1</dd>')
    expect(html).toContain('Median time to close</dt><dd>3 days</dd><small>3 of 4 closed issues within 7 days')
    expect(html).toContain('<a href="/forum/thread/t-1/">Help with &lt;tags&gt;</a><small>3 days old</small>')
    expect(html).toContain('Showing 1–1 of 12 · page 1 of 2.')
    expect(html).toContain('2 earlier closed issues closed before closing times were recorded')
    expect(html).toContain('Replies and comments per UTC day · scale 0–5')
    expect(html).not.toMatch(/NaN|undefined|Infinity/)
  })
  it('reads a quiet period without dividing by zero', () => {
    const html = render({ ...report, daily: report.daily.map(row => day(row.day)), firstReplies: { threads: 0, answered: 0, within48h: 0, medianHours: null }, unanswered: { total: 0, threads: [] }, issueTurnaround: { closed: 0, medianDays: null, within7Days: 0 }, unknownCloseTimes: 0 }, 'threads')
    expect(html).toContain('Answered within 48 h</dt><dd>—</dd><small>No threads started in this period')
    expect(html).toContain('Median time to close</dt><dd>—</dd><small>No issues closed in this period')
    expect(html).toContain('Every open thread older than 48 hours has a reply.')
    expect(html).toContain('0 replies and comments')
    expect(html).not.toMatch(/NaN|undefined|Infinity|earlier closed issue/)
  })
})
