import { afterEach, describe, expect, it } from 'vitest'
import type { DatabaseSync } from 'node:sqlite'
import { testServer } from './test-server'
import { cleanupUsage } from '../../server/usage'
import { SIGN_IN_PROMPT_OUTCOMES, VISIT_SOURCES } from './usage-contract'

describe('site counts on the server', () => {
  const databases: DatabaseSync[] = []
  afterEach(() => { databases.splice(0).forEach(db => db.close()) })
  async function server() { const value = await testServer(); databases.push(value.db); return value }
  it('stores a fixed event and category, refuses anything else, and forms no visitor digest', async () => {
    const { call, db } = await server()
    for (const detail of VISIT_SOURCES) expect((await call('/usage/count', 'POST', { event: 'visit_source', detail })).status).toBe(200)
    for (const detail of SIGN_IN_PROMPT_OUTCOMES) expect((await call('/usage/count', 'POST', { event: 'sign_in_prompt', detail })).status).toBe(200)
    for (const bad of [
      { event: 'visit_source' }, { event: 'visit_source', detail: 'https://www.reddit.com/r/x' }, { event: 'visit_source', detail: 'other-site' }, { event: 'visit_source', detail: 'google', page: 'forum' },
      { event: 'visit_kind', detail: 'new' }, { event: 'sign_in_prompt', detail: 'other-skipped' }, { event: 'sign_in_prompt', detail: 'gate-shown', visitor: crypto.randomUUID() },
    ]) expect((await call('/usage/count', 'POST', bad)).status, JSON.stringify(bad)).toBe(400)
    expect(db.prepare('SELECT count(*) AS n FROM usage_visitors').get()).toEqual({ n: 0 })
    expect((db.prepare('PRAGMA table_info(site_count_daily)').all() as { name: string }[]).map(column => column.name)).toEqual(['day', 'event', 'detail', 'count'])
    expect(db.prepare('SELECT count(*) AS n FROM site_count_daily').get()).toEqual({ n: VISIT_SOURCES.length + SIGN_IN_PROMPT_OUTCOMES.length })
  })
  it('keeps 90 days and shows the period totals to administrators only', async () => {
    const { call, db, env } = await server()
    const admin = (await (await call('/auth/admin', 'POST', { key: 'e'.repeat(64) })).json()).token as string
    const day = (ago: number) => new Date(Date.now() - ago * 86400000).toISOString().slice(0, 10)
    const insert = db.prepare('INSERT INTO site_count_daily(day,event,detail,count) VALUES(?,?,?,?)')
    insert.run(day(95), 'visit_source', 'google', 9); insert.run(day(3), 'visit_source', 'google', 4); insert.run(day(1), 'visit_source', 'google', 1); insert.run(day(1), 'visit_source', 'reddit', 7)
    db.prepare("INSERT INTO usage_meta(key,value) VALUES('site_counts_started',?)").run(new Date(Date.now() - 10 * 86400000).toISOString())
    await cleanupUsage(env.DB!)
    expect(db.prepare("SELECT count(*) AS n FROM site_count_daily WHERE detail='google'").get()).toEqual({ n: 2 })
    expect((await call('/admin/statistics?days=7', 'GET')).status).toBe(403)
    const body = await (await call('/admin/statistics?days=7', 'GET', undefined, '', admin)).json()
    expect(body.siteCounts).toEqual([{ event: 'visit_source', detail: 'reddit', count: 7 }, { event: 'visit_source', detail: 'google', count: 5 }])
    expect(body.siteCountsStarted).toBeTruthy()
  })
})
