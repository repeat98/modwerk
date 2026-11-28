import { COMMUNITY_RULES_VERSION } from '../legal/policy'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DatabaseSync } from 'node:sqlite'
import { testServer } from './test-server'
import { handleCommunity } from '../../server/transport'
import { BASE_MANIFEST_KEY } from '../../server/base-images'

const databases: DatabaseSync[] = []
const sent: { to: string[]; text: string }[] = []
beforeEach(() => { sent.length = 0; vi.stubGlobal('fetch', vi.fn(async (_url: string, options: RequestInit) => { sent.push(JSON.parse(String(options.body))); return Response.json({ id: crypto.randomUUID() }) })) })
afterEach(() => { vi.unstubAllGlobals(); for (const db of databases.splice(0)) db.close() })

const identity = 'a'.repeat(64), image = new Uint8Array([1, 2, 3, 4])
async function fixture() {
  const server = await testServer(); databases.push(server.db)
  const objects = new Map<string, Uint8Array>([
    [BASE_MANIFEST_KEY, new TextEncoder().encode(JSON.stringify({ schema: 1, images: [{ machine: 'octatrack', identity, sha256: 'b'.repeat(64), size: 4, file: 'modwerk-base.bin' }] }))],
    ['octatrack/' + identity, image],
  ])
  server.env.BASES = { async put() {}, async get(key) { const bytes = objects.get(key); return bytes ? { body: new Response(new Uint8Array(bytes)).body! } : null }, async delete() {} }
  const password = 'a long original test passphrase'
  const email = 'host@example.test'
  expect((await server.call('/auth/register', 'POST', { rulesVersion: COMMUNITY_RULES_VERSION, username: 'host', email, password })).status).toBe(202)
  const token = sent.find(message => message.to[0] === email)!.text.match(/#account\/verify\/([^\s]+)/)![1]
  expect((await server.call('/auth/verify', 'POST', { token, password })).status).toBe(200)
  const session = (await server.call('/auth/login', 'POST', { email, password })).headers.get('X-Octamod-Session')!
  const get = (path: string, auth?: string) => handleCommunity(new Request('https://api.example.test' + path, { headers: auth ? { Authorization: 'Bearer ' + auth } : {} }), server.env)
  return { get, session }
}

describe('hosted base images', () => {
  it('lists the manifest to anyone and serves an image only to a member', async () => {
    const f = await fixture()
    const listed = await (await f.get('/api/bases')).json()
    expect(listed.images[0]).toMatchObject({ machine: 'octatrack', identity })
    expect((await f.get('/api/bases/octatrack/' + identity)).status).toBe(401)
    const served = await f.get('/api/bases/octatrack/' + identity, f.session)
    expect(served.status).toBe(200)
    expect(served.headers.get('X-Base-SHA256')).toBe('b'.repeat(64))
    expect(new Uint8Array(await served.arrayBuffer())).toEqual(image)
  })
  it('refuses an identity the manifest does not list', async () => {
    const f = await fixture()
    expect((await f.get('/api/bases/octatrack/' + 'c'.repeat(64), f.session)).status).toBe(404)
  })
})
