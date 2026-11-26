import { afterEach, describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import type { DatabaseSync } from 'node:sqlite'
import { testServer } from './test-server'
import { handleCommunity } from '../../server/transport'
import { SupportCosts } from '../components/SupportDialog'

const TOKEN = 'kofi-test-token-0123456789'
const databases: DatabaseSync[] = []
afterEach(() => { databases.splice(0).forEach(db => db.close()) })

async function fixture(token: string | undefined = TOKEN) {
  const server = await testServer(); databases.push(server.db)
  Object.assign(server.env, { KOFI_VERIFICATION_TOKEN: token })
  // Ko-fi posts server-to-server: form-encoded, no Origin, no session.
  const post = (data: Record<string, unknown> | string) => handleCommunity(new Request('https://api.example.test/api/kofi/webhook', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ data: typeof data === 'string' ? data : JSON.stringify(data) }).toString() }), server.env)
  const coverage = async () => (await handleCommunity(new Request('https://api.example.test/api/support/coverage', { headers: { Origin: 'https://octamod.test' } }), server.env)).json() as Promise<{ month: string; euros: number | null }>
  return { ...server, post, coverage }
}
let next = 0
function payment(fields: Record<string, unknown> = {}) {
  return { verification_token: TOKEN, message_id: `00000000-0000-4000-8000-${String(++next).padStart(12, '0')}`, timestamp: new Date().toISOString(), type: 'Donation', is_public: true, from_name: 'Real Person', message: 'Thanks for Modwerk', amount: '5.00', url: 'https://ko-fi.com/Home/CoffeeShop?txid=abc', email: 'person@mail.test', currency: 'EUR', is_subscription_payment: false, is_first_subscription_payment: false, kofi_transaction_id: 'abc', ...fields }
}

describe('Ko-fi webhook', () => {
  it('stays off until the verification token is set', async () => {
    const { post, coverage } = await fixture('')
    expect((await post(payment())).status).toBe(503)
    expect(await coverage()).toEqual({ month: new Date().toISOString().slice(0, 7), euros: null })
  })

  it('refuses a wrong token or a malformed payload and stores nothing', async () => {
    const { post, db } = await fixture()
    expect((await post(payment({ verification_token: 'wrong' }))).status).toBe(401)
    expect((await post('not json')).status).toBe(400)
    expect((await post(payment({ amount: 'lots' }))).status).toBe(400)
    expect(db.prepare('SELECT count(*) AS n FROM kofi_payments').get()).toEqual({ n: 0 })
  })

  it('keeps only the amount, currency, month and message ID, and counts each delivery once', async () => {
    const { post, db, coverage } = await fixture()
    const tip = payment({ amount: '5.00' })
    expect((await post(tip)).status).toBe(200)
    expect((await post(tip)).status).toBe(200) // Ko-fi retries a delivery it thinks failed.
    await post(payment({ type: 'Subscription', amount: '3.50' }))
    await post(payment({ type: 'Shop Order', amount: '20.00' }))
    await post(payment({ email: 'jo.example@example.com', amount: '3.00' })) // Ko-fi's Send test
    await post(payment({ currency: 'USD', amount: '7.00' }))
    expect(await coverage()).toEqual({ month: new Date().toISOString().slice(0, 7), euros: 8.5 })
    expect((db.prepare('PRAGMA table_info(kofi_payments)').all() as { name: string }[]).map(column => column.name)).toEqual(['message_id', 'month', 'amount_cents', 'currency', 'counted', 'received_at'])
    const stored = JSON.stringify(db.prepare('SELECT * FROM kofi_payments').all())
    for (const personal of ['Real Person', 'Thanks for Modwerk', 'person@mail.test', 'example.com', 'txid']) expect(stored).not.toContain(personal)
    expect(db.prepare('SELECT count(*) AS n FROM kofi_payments').get()).toEqual({ n: 5 })
  })

  it('counts a payment in the month Ko-fi dated it', async () => {
    const { post, coverage } = await fixture()
    await post(payment({ timestamp: '2025-01-15T10:00:00Z', amount: '50.00' }))
    expect((await coverage()).euros).toBe(0)
  })
})

describe('the costs bar', () => {
  const costs = { monthly: 145 }
  it('shows the webhook total and adds tips entered by hand for the same month', () => {
    const html = renderToStaticMarkup(createElement(SupportCosts, { costs: { ...costs, month: '2026-11', covered: 10 }, coverage: { month: '2026-11', euros: 30 } }))
    expect(html).toContain('Ko-fi covered €40 of €145 in November 2026')
    expect(renderToStaticMarkup(createElement(SupportCosts, { costs: { ...costs, month: '2026-10', covered: 10 }, coverage: { month: '2026-11', euros: 30 } }))).toContain('Ko-fi covered €30 of €145 in November 2026')
  })
  it('falls back to the hand-entered month, or no bar, while the webhook is not connected', () => {
    expect(renderToStaticMarkup(createElement(SupportCosts, { costs: { ...costs, month: '2026-11', covered: 10 }, coverage: { month: '2026-11', euros: null } }))).toContain('Ko-fi covered €10 of €145 in November 2026')
    expect(renderToStaticMarkup(createElement(SupportCosts, { costs, coverage: { month: '2026-11', euros: null } }))).not.toContain('Ko-fi covered')
    expect(renderToStaticMarkup(createElement(SupportCosts, { costs, coverage: { month: '2026-11', euros: 0 } }))).toContain('Ko-fi covered €0 of €145 in November 2026')
  })
})
