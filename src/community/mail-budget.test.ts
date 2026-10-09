import { afterEach, describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import type { DatabaseSync } from 'node:sqlite'
import { mailLimits, reserveMailBudget } from '../../server/mail-budget'
import type { Env } from '../../server/platform'
import { digest } from '../../server/security'
import { testDatabase } from './test-server'

const databases: DatabaseSync[] = []
afterEach(() => { for (const db of databases.splice(0)) db.close() })

describe('independent mail budgets', () => {
  it('reserves account capacity within the paid monthly plan while permitting daily bursts', () => {
    const config = readFileSync(new URL('../../wrangler.worker.jsonc', import.meta.url), 'utf8')
    const env: Env = Object.fromEntries([...config.matchAll(/"([A-Z_]+)":\s*"([^"]*)"/g)].filter(([,key]) => key.includes('_MAIL_')).map(([,key,value]) => [key,value]))
    const limits = ['account', 'welcome', 'activity', 'news'].map(purpose => mailLimits(env, purpose as Parameters<typeof mailLimits>[1]))
    expect(limits.reduce((sum, { monthly }) => sum + monthly, 0)).toBeLessThanOrEqual(48000)
    expect(limits[0].daily).toBeGreaterThan(83)
    expect(limits[1].daily).toBeGreaterThan(63)
    expect(limits.every(({ daily, monthly }) => monthly > daily && monthly < daily * 30)).toBe(true)
  })

  it('keeps free-plan defaults within 100/day and rejects invalid configuration', () => {
    expect(['account', 'welcome', 'activity', 'news'].reduce((sum, purpose) => sum + mailLimits({}, purpose as Parameters<typeof mailLimits>[1]).daily, 0)).toBe(100)
    expect(mailLimits({ ACCOUNT_MAIL_DAILY_LIMIT: '-1', ACCOUNT_MAIL_MONTHLY_LIMIT: 'NaN' }, 'account')).toEqual(mailLimits({}, 'account'))
    expect(mailLimits({ WELCOME_MAIL_DAILY_LIMIT: '0', WELCOME_MAIL_MONTHLY_LIMIT: '0' }, 'welcome')).toEqual({ daily: 0, monthly: 0 })
  })

  it.each(['account', 'welcome', 'activity', 'news'] as const)('enforces the explicit %s monthly cap independently of its daily cap', async purpose => {
    const { db, adapter } = testDatabase(); databases.push(db)
    const prefix = purpose.toUpperCase()
    const env: Env = { [prefix + '_MAIL_DAILY_LIMIT']: '500', [prefix + '_MAIL_MONTHLY_LIMIT']: '1' }
    await reserveMailBudget(env, adapter, purpose)
    await expect(reserveMailBudget(env, adapter, purpose)).rejects.toMatchObject({ status: 429 })
    const key = await digest(purpose + '-mail:monthly:' + Math.floor(Date.now() / 1000 / (30 * 86400)))
    expect(db.prepare('SELECT count FROM rate_limits WHERE key=?').get(key)).toEqual({ count: 2 })
    for (const other of ['account', 'welcome', 'activity', 'news'] as const) {
      if (other !== purpose) await expect(reserveMailBudget(env, adapter, other)).resolves.toBeUndefined()
    }
  })
})
