import type { Database, Env } from './platform'
import { throttle } from './auth'

type MailBudget = 'account' | 'welcome' | 'activity' | 'news'
const settings = {
  account: ['ACCOUNT_MAIL_DAILY_LIMIT', 'ACCOUNT_MAIL_MONTHLY_LIMIT', 60],
  welcome: ['WELCOME_MAIL_DAILY_LIMIT', 'WELCOME_MAIL_MONTHLY_LIMIT', 20],
  activity: ['ACTIVITY_MAIL_DAILY_LIMIT', 'ACTIVITY_MAIL_MONTHLY_LIMIT', 15],
  news: ['NEWS_MAIL_DAILY_LIMIT', 'NEWS_MAIL_MONTHLY_LIMIT', 5],
} as const

function limit(value: string | undefined, fallback: number) {
  const parsed = Number(value ?? fallback)
  return Number.isInteger(parsed) && parsed >= 0 && parsed <= 100000 ? parsed : fallback
}

/** Separate budgets reserve verification/recovery capacity even when welcomes or digests are busy. */
export function mailLimits(env: Env, purpose: MailBudget) {
  const [dailySetting, monthlySetting, fallback] = settings[purpose]
  const daily = limit(env[dailySetting], fallback)
  return { daily, monthly: limit(env[monthlySetting], daily * 30) }
}

/** Persistent attempt counters retain existing buckets; provider billing limits remain authoritative. */
export async function reserveMailBudget(env: Env, db: Database, purpose: MailBudget) {
  const { daily, monthly } = mailLimits(env, purpose)
  await throttle(db, purpose + '-mail:daily', daily, 86400)
  await throttle(db, purpose + '-mail:monthly', monthly, 30 * 86400)
}
