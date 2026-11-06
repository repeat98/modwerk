import { afterEach, describe, expect, it } from 'vitest'
import type { DatabaseSync } from 'node:sqlite'
import { testServer } from './test-server'
import { hardwareReportBody, builtModules } from './build-follow-up'

const databases: DatabaseSync[] = []
afterEach(() => { for (const db of databases.splice(0)) db.close() })

describe('public working report counts', () => {
  it('counts distinct active members in the module’s home thread across versions, with matching summaries', async () => {
    const { db, call } = await testServer(); databases.push(db)
    await call('/forum/threads')
    for (const [id, verified, suspended] of [['a', 1, 0], ['b', 1, 0], ['unverified', 0, 0], ['suspended', 1, 1]] as const) db.prepare('INSERT INTO users(id,display_name,username,email_verified,suspended) VALUES(?,?,?,?,?)').run(id, id, id, verified, suspended)
    const build = builtModules(['tapeecho', 'miniverb'])
    const report = hardwareReportBody('Octatrack', '1.40C', build[0], build)
    const add = (id: string, user: string, body: string, hidden = 0, thread = 'module-tapeecho') => db.prepare('INSERT INTO forum_posts(id,thread_id,user_id,body,hidden) VALUES(?,?,?,?,?)').run(id, thread, user, body, hidden)
    add('a-first', 'a', report)
    add('a-second', 'a', report.replace(build[0].version, '0.0.1-experimental'))
    add('b-manual', 'b', '**Works on my Octatrack**\n\nLovely on drums.')
    add('quoted', 'b', '> ' + report)
    add('code', 'b', '```\n' + report + '\n```')
    add('hidden', 'b', report, 1)
    add('deleted', 'b', '', 2)
    add('unverified', 'unverified', report)
    add('suspended', 'suspended', report)
    async function counts() {
      const detail = await (await call('/modules/tapeecho')).json()
      const summary = await (await call('/community/summary?fresh=1')).json()
      const thread = await (await call('/forum/threads/module-tapeecho')).json()
      return [detail.worksReports, summary.find((item: { module_id: string }) => item.module_id === 'tapeecho').worksReports, thread.thread.worksReports]
    }
    expect(await counts()).toEqual([2, 2, 2])
    // A companion in the build is not itself a positive report, and a reply count does not imply “works”.
    expect((await (await call('/modules/miniverb')).json()).worksReports).toBe(0)
    db.prepare("UPDATE forum_posts SET body='A question' WHERE id='b-manual'").run()
    expect(await counts()).toEqual([1, 1, 1])
    db.prepare("UPDATE forum_posts SET hidden=1 WHERE user_id='a'").run()
    expect(await counts()).toEqual([0, 0, 0])
    db.prepare("UPDATE forum_posts SET hidden=0 WHERE id='a-first'").run()
    expect(await counts()).toEqual([1, 1, 1])
    db.prepare("UPDATE forum_threads SET hidden=1 WHERE id='module-tapeecho'").run()
    expect((await (await call('/modules/tapeecho')).json()).worksReports).toBe(0)
    expect((await (await call('/community/summary?fresh=1')).json()).find((item: { module_id: string }) => item.module_id === 'tapeecho').worksReports).toBe(0)
  })
})
