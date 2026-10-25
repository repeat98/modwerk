// SPDX-License-Identifier: Elastic-2.0
// Copyright (c) 2026 Jannik Aßfalg (repeat98)
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest'
import { build } from 'esbuild'
import { Miniflare, convertV4MiniflareOptions } from 'miniflare'
import { unstable_readConfig } from 'wrangler'

let runtime, device, providerStatus = 201
const requests = []
const endpoint = 'https://fcm.googleapis.com/fcm/send/synthetic-runtime-device'

beforeAll(async () => {
  const vapid = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])
  const privateKey = await crypto.subtle.exportKey('jwk', vapid.privateKey)
  const receiver = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])
  const to64 = value => Buffer.from(new Uint8Array(value)).toString('base64url')
  const publicKey = to64(await crypto.subtle.exportKey('raw', vapid.publicKey))
  device = { endpoint, keys: { p256dh: to64(await crypto.subtle.exportKey('raw', receiver.publicKey)), auth: to64(crypto.getRandomValues(new Uint8Array(16))) } }
  const config = unstable_readConfig({ config: 'wrangler.worker.jsonc' })
  // Exercise the actual test route and sender with workerd's Request and Web Crypto APIs.
  const compiled = await build({
    stdin: { contents: `import { pushRoutes } from './server/push.ts';
      export default { async fetch(request, env) {
        try { return await pushRoutes(request, env, env.DB, { id: 'runtime-member', display_name: 'Runtime member', username: 'runtime-member', email_verified: 1, suspended: 0 }, false); }
        catch (error) { return Response.json({ error: error.message }, { status: error.status ?? 500 }); }
      } };`, resolveDir: process.cwd(), sourcefile: 'push-runtime.js' },
    bundle: true, write: false, format: 'esm', platform: 'neutral', external: ['node:*'],
  })
  runtime = new Miniflare(convertV4MiniflareOptions({
    modules: true, script: compiled.outputFiles[0].text,
    compatibilityDate: config.compatibility_date, compatibilityFlags: config.compatibility_flags,
    bindings: { WEB_PUSH_ENABLED: 'true', VAPID_PUBLIC_KEY: publicKey, VAPID_PRIVATE_KEY: privateKey.d, VAPID_SUBJECT: 'https://modwerk.app/' },
    d1Databases: ['DB'],
    outboundService: async request => {
      requests.push({ url: request.url, method: request.method, headers: request.headers, bytes: (await request.arrayBuffer()).byteLength })
      return new Response(null, { status: providerStatus, headers: providerStatus === 307 ? { Location: 'https://example.invalid/redirect' } : {} })
    },
  }))
  const db = await runtime.getD1Database('DB')
  await db.exec("CREATE TABLE users(id TEXT PRIMARY KEY,is_admin INTEGER);\nCREATE TABLE rate_limits(key TEXT PRIMARY KEY,count INTEGER,expires INTEGER);\nCREATE TABLE push_subscriptions(id TEXT PRIMARY KEY,user_id TEXT,endpoint TEXT,p256dh TEXT,auth TEXT,vapid_key TEXT,activity INTEGER,signups INTEGER);")
  await db.prepare('INSERT INTO users VALUES(?,0)').bind('runtime-member').run()
  const id = Buffer.from(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(endpoint))).toString('hex')
  await db.prepare('INSERT INTO push_subscriptions VALUES(?,?,?,?,?,?,1,0)').bind(id, 'runtime-member', endpoint, device.keys.p256dh, device.keys.auth, publicKey).run()
}, 15000)
beforeEach(() => { requests.length = 0; providerStatus = 201 })
afterAll(async () => { await runtime?.dispose() })

function sendTest() {
  return runtime.dispatchFetch('https://api.example.test/api/push/test', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ topic: 'activity', endpoint }) })
}
it('delivers the encrypted device test inside the production Worker runtime', async () => {
  const result = await sendTest()
  expect(await result.json()).toEqual({ ok: true })
  expect(result.status).toBe(200)
  expect(requests).toHaveLength(1)
  expect(requests[0]).toMatchObject({ url: endpoint, method: 'POST', bytes: 4096 })
  expect(requests[0].headers.get('content-encoding')).toBe('aes128gcm')
  expect(requests[0].headers.get('authorization')).toMatch(/^vapid t=.+, k=.+$/)
})
it('rejects provider redirects without forwarding the push payload or credentials', async () => {
  providerStatus = 307
  const result = await sendTest()
  expect(result.status).toBe(503)
  expect(await result.json()).toEqual({ error: 'The test could not be delivered. Try enabling this device again.' })
  expect(requests).toHaveLength(1)
  expect(requests[0].url).toBe(endpoint)
  const db = await runtime.getD1Database('DB')
  expect(await db.prepare('SELECT COUNT(*) AS count FROM push_subscriptions').first()).toEqual({ count: 1 })
})
