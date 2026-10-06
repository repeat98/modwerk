import { COMMUNITY_RULES_VERSION } from '../legal/policy'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DatabaseSync } from 'node:sqlite'
import { testServer } from './test-server'
import { mentionedUsernames } from '../../server/notifications'
import { mentionQueryAt, splitMentions } from './forum-contract'

const databases: DatabaseSync[] = [], sent: { to: string[]; text: string }[] = [], password = 'a long original test passphrase'
beforeEach(() => { sent.length = 0; vi.stubGlobal('fetch', vi.fn(async (_url: string, options: RequestInit) => { sent.push(JSON.parse(String(options.body))); return Response.json({ id: crypto.randomUUID() }) })) })
afterEach(() => { vi.unstubAllGlobals(); for (const db of databases.splice(0)) db.close() })

describe('mentions', () => {
  it('highlights exactly the names the Worker notifies', () => {
    const text = 'Thanks @alice and @Bob_2! Not mail@host.test, not /path/@user, not @@double, not @ab (too short). @alice again.'
    const highlighted = splitMentions(text).filter(part => part.type === 'mention').map(part => part.value.toLowerCase())
    expect(highlighted).toEqual(['alice', 'bob_2', 'alice'])
    expect([...new Set(highlighted)]).toEqual(mentionedUsernames(text))
    expect(splitMentions('no names here')).toEqual([{ type: 'text', value: 'no names here' }])
    expect(splitMentions('')).toEqual([{ type: 'text', value: '' }])
    expect(splitMentions('@start middle @end')).toEqual([{ type: 'mention', value: 'start' }, { type: 'text', value: ' middle ' }, { type: 'mention', value: 'end' }])
  })
  it('finds the @name being typed before the caret', () => {
    expect(mentionQueryAt('hello @al', 9)).toEqual({ start: 6, query: 'al' })
    expect(mentionQueryAt('hello @', 7)).toEqual({ start: 6, query: '' })
    expect(mentionQueryAt('(@al', 4)).toEqual({ start: 1, query: 'al' })
    expect(mentionQueryAt('hello @al later', 9)).toEqual({ start: 6, query: 'al' })
    expect(mentionQueryAt('mail@host', 9)).toBeNull()
    expect(mentionQueryAt('hello @al ', 10)).toBeNull()
    expect(mentionQueryAt('hello', 5)).toBeNull()
  })
  it('suggests verified members by prefix to members only, escaping LIKE wildcards and leaving the asker out', async () => {
    const server = await testServer(); databases.push(server.db)
    async function member(username: string) {
      const email = username + '@example.test'
      expect((await server.call('/auth/register', 'POST', { rulesVersion: COMMUNITY_RULES_VERSION, username, email, password })).status).toBe(202)
      const token = [...sent].reverse().find(message => message.to[0] === email)!.text.match(/#account\/verify\/([^\s]+)/)![1]
      expect((await server.call('/auth/verify', 'POST', { token, password })).status).toBe(200)
      return (await server.call('/auth/login', 'POST', { email, password })).headers.get('X-Octamod-Session')!
    }
    const asker = await member('alfred'); await member('alice'); await member('al_x'); await member('alx'); await member('bob')
    expect((await server.call('/forum/members?q=al')).status).toBe(401)
    const names = async (q: string) => ((await (await server.call('/forum/members?q=' + encodeURIComponent(q), 'GET', undefined, asker)).json()) as { username: string }[]).map(item => item.username)
    expect(await names('al')).toEqual(['al_x', 'alice', 'alx'])
    expect(await names('AL_')).toEqual(['al_x'])
    expect(await names('')).toEqual(['al_x', 'alice', 'alx', 'bob'])
    expect(await names('zzz')).toEqual([])
    expect((await server.call('/forum/members?q=a%25', 'GET', undefined, asker)).status).toBe(400)
    const raw = await (await server.call('/forum/members?q=bob', 'GET', undefined, asker)).json()
    expect(JSON.stringify(raw)).not.toMatch(/email|user_id|"id"/)
    expect(raw[0]).toMatchObject({ username: 'bob', displayName: 'bob', avatar: null })
  })
})
