import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { EventEmitter } from 'node:events'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ChannelType, Events, PermissionFlagsBits, PermissionsBitField, Routes } from 'discord.js'
import { limitValue, readConfig, safeError, snowflake } from './discord/config.mjs'
import { openStore, recordDispatch } from './discord/store.mjs'
import { listChannels, readHistory, replyBody, sendReply, syncHistory } from './discord/api.mjs'
import { watchGateway } from './discord/gateway.mjs'

const guildId = '100000000000000001', channelId = '200000000000000001', replyTo = '300000000000000001'
const message = (id = replyTo, extra = {}) => ({
  id, guild_id: guildId, channel_id: channelId,
  author: { id: '400000000000000001', username: 'tester', global_name: 'Tester' },
  content: 'Noise when switching patterns with different Parts',
  timestamp: '2026-10-28T08:00:00Z', edited_timestamp: null,
  attachments: [], embeds: [], ...extra,
})
const resources = []
function fixture() {
  const directory = mkdtempSync(join(tmpdir(), 'modwerk-discord-test-'))
  const store = openStore(directory)
  resources.push({ directory, store })
  return { directory, store }
}
afterEach(() => {
  for (const { directory, store } of resources.splice(0)) {
    store.close()
    rmSync(directory, { recursive: true, force: true })
  }
})

describe('Discord configuration', () => {
  it('requires local bot credentials and a precise server ID, while allowing offline inbox access', () => {
    expect(() => readConfig({ DISCORD_GUILD_ID: guildId })).toThrow('DISCORD_BOT_TOKEN')
    expect(readConfig({ DISCORD_GUILD_ID: guildId }, { tokenRequired: false }).guildId).toBe(guildId)
    expect(() => snowflake(Number(guildId), 'server')).toThrow('Discord ID')
    expect(() => readConfig({ DISCORD_BOT_TOKEN: 'secret', DISCORD_GUILD_ID: 'bad' })).toThrow('DISCORD_GUILD_ID')
    expect(safeError(new Error('secret appears twice: secret'), 'secret')).not.toContain('secret')
    expect(limitValue('1000')).toBe(1000)
    expect(() => limitValue('1001')).toThrow('--limit')
  })
})

describe('server-wide inbox', () => {
  it('collects human and bot messages across channels without requiring mentions', () => {
    const { store } = fixture()
    recordDispatch(store, { t: 'MESSAGE_CREATE', d: message() }, guildId)
    recordDispatch(store, { t: 'MESSAGE_CREATE', d: message('300000000000000002', {
      channel_id: '200000000000000002', author: { id: '400000000000000002', username: 'other-bot', bot: true },
    }) }, guildId)
    recordDispatch(store, { t: 'MESSAGE_CREATE', d: message('300000000000000003', { guild_id: '100000000000000002' }) }, guildId)
    recordDispatch(store, { t: 'MESSAGE_CREATE', d: message('300000000000000004', { guild_id: undefined }) }, guildId)
    const result = store.inbox(guildId)
    expect(result.events).toHaveLength(2)
    expect(result.events[1].message.author.bot).toBe(true)
    expect(result.events[0].message.url).toContain(`${channelId}/${replyTo}`)
    expect(store.inbox(guildId, { channelId }).events).toHaveLength(1)
  })

  it('merges partial edits and removes deleted content from earlier events and search', () => {
    const { store } = fixture()
    store.put(message(), guildId)
    recordDispatch(store, { t: 'MESSAGE_UPDATE', d: {
      id: replyTo, guild_id: guildId, channel_id: channelId, content: 'TSTR test result', edited_timestamp: '2026-10-28T08:01:00Z',
    } }, guildId)
    const edited = store.inbox(guildId).events.at(-1).message
    expect(edited.content).toBe('TSTR test result')
    expect(edited.author.username).toBe('tester')
    expect(store.search(guildId, { query: 'tstr' }).messages).toHaveLength(1)
    recordDispatch(store, { t: 'MESSAGE_DELETE_BULK', d: { guild_id: guildId, channel_id: channelId, ids: [replyTo] } }, guildId)
    expect(store.inbox(guildId).events.every(item => item.message.deleted && !('content' in item.message))).toBe(true)
    expect(store.search(guildId, { query: 'TSTR' }).messages).toHaveLength(0)
  })

  it('deduplicates reimports and pages new activity without skipping events', () => {
    const { store } = fixture()
    for (let i = 1; i <= 4; i++) store.put(message(`30000000000000000${i}`), guildId)
    store.put(message(), guildId)
    const first = store.inbox(guildId, { after: 0, limit: 2 })
    const second = store.inbox(guildId, { after: first.nextCursor, limit: 2 })
    expect(first.events.map(item => item.cursor)).toEqual([1, 2])
    expect(second.events.map(item => item.cursor)).toEqual([3, 4])
    expect(store.inbox(guildId, { after: second.nextCursor }).nextCursor).toBe(4)
    expect(store.inbox(guildId, { limit: 2 }).events.map(item => item.cursor)).toEqual([3, 4])
  })

  it('keeps newer edits and tombstones when an older history fetch finishes later', () => {
    const { store } = fixture()
    store.put(message(replyTo, { content: 'new finding', edited_timestamp: '2026-10-28T09:00:00Z' }), guildId)
    store.put(message(), guildId, 'history')
    expect(store.inbox(guildId).events.at(-1).message.content).toBe('new finding')
    store.remove(replyTo, guildId, channelId)
    store.put(message(), guildId, 'history')
    expect(store.inbox(guildId).events.at(-1).message.deleted).toBe(true)
  })

  it('searches all collected channel history and pages literal queries with stable Discord IDs', () => {
    const { store } = fixture()
    for (let i = 1; i <= 4; i++) store.put(message(`30000000000000000${i}`, { content: 'LPF at 30%_ changes', channel_id: i === 4 ? '200000000000000002' : channelId }), guildId)
    const first = store.search(guildId, { query: '30%_', limit: 2 })
    expect(first.messages.map(item => item.id)).toEqual(['300000000000000003', '300000000000000004'])
    expect(store.search(guildId, { query: '30%_', before: first.nextBefore }).messages).toHaveLength(2)
    expect(store.search(guildId, { query: 'lpf', channelId }).messages).toHaveLength(3)
    expect(store.search('100000000000000002', { query: 'LPF' }).messages).toHaveLength(0)
  })

  it('supports a live writer and an independent repo-side reader using the same state directory', () => {
    const { directory, store } = fixture()
    const reader = openStore(directory)
    try {
      store.put(message(), guildId)
      expect(reader.search(guildId, { query: 'patterns' }).messages[0].id).toBe(replyTo)
      reader.put(message(replyTo, { content: 'The noise is still there' }), guildId)
      expect(store.inbox(guildId).events.at(-1).message.content).toBe('The noise is still there')
    } finally { reader.close() }
  })
})

describe('Discord history', () => {
  it('paginates beyond one Discord page and returns messages in chronological order', async () => {
    const { store } = fixture()
    const page = Array.from({ length: 100 }, (_, index) => message(String(300000000000000200n - BigInt(index))))
    const rest = { get: vi.fn().mockResolvedValueOnce({ guild_id: guildId }).mockResolvedValueOnce(page).mockResolvedValueOnce([message()]) }
    const result = await readHistory(rest, store, { guildId, channelId, limit: 101 })
    expect(result.messages).toHaveLength(101)
    expect(result.messages[0].id).toBe(replyTo)
    expect(result.nextBefore).toBe(replyTo)
    expect(rest.get.mock.calls[2][1].query.get('before')).toBe(page.at(-1).id)
    expect(rest.get.mock.calls[2][1].query.get('limit')).toBe('1')
  })

  it('syncs entire histories across channels, continues after a denied channel, and skips containers', async () => {
    const { store } = fixture()
    const page = Array.from({ length: 100 }, (_, index) => message(String(300000000000000200n - BigInt(index))))
    const otherChannel = '200000000000000002'
    const rest = { get: vi.fn(async (route, options) => {
      if (route === Routes.channel(channelId)) return { guild_id: guildId }
      if (route === Routes.channel(otherChannel)) throw new Error('Missing Access')
      return options.query.has('before') ? [message()] : page
    }) }
    const result = await syncHistory(rest, store, { guildId, channels: [
      { id: channelId, name: 'bugs', messageChannel: true, canReadHistory: true },
      { id: otherChannel, name: 'restricted', messageChannel: true, canReadHistory: true },
      { id: '200000000000000003', messageChannel: false, canReadHistory: true },
    ] })
    expect(result.channels).toBe(1)
    expect(result.messages).toBe(101)
    expect(result.errors[0].channelId).toBe(otherChannel)
    expect(store.search(guildId, { query: 'patterns', limit: 1000 }).messages).toHaveLength(101)
  })

  it('enumerates visible active and archived threads without including denied channels', async () => {
    const permissions = new PermissionsBitField([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.SendMessagesInThreads])
    const channel = (id, extra = {}) => ({
      id, name: 'bugs', parentId: null, type: ChannelType.GuildText,
      permissionsFor: () => permissions, isTextBased: () => true, isThreadOnly: () => false,
      isThread: () => false, isVoiceBased: () => false, ...extra,
    })
    const active = channel('200000000000000002', { parentId: channelId, isThread: () => true })
    const archive1 = channel('200000000000000003', { parentId: channelId, isThread: () => true, archiveTimestamp: Date.parse('2026-10-27T08:00:00Z') })
    const archive2 = channel('200000000000000004', { parentId: channelId, isThread: () => true, archiveTimestamp: Date.parse('2026-10-26T08:00:00Z') })
    const fetchArchived = vi.fn(async ({ type, before }) => type === 'private'
      ? { threads: new Map(), hasMore: false }
      : before ? { threads: new Map([[archive2.id, archive2]]), hasMore: false }
        : { threads: new Map([[archive1.id, archive1]]), hasMore: true })
    const parent = channel(channelId, { threads: { fetchArchived } })
    const denied = channel('200000000000000005', { permissionsFor: () => new PermissionsBitField() })
    const client = { guilds: { fetch: vi.fn().mockResolvedValue({
      members: { fetchMe: vi.fn().mockResolvedValue({}) },
      channels: { fetch: vi.fn().mockResolvedValue(new Map([[parent.id, parent], [denied.id, denied]])), fetchActiveThreads: vi.fn().mockResolvedValue({ threads: new Map([[active.id, active]]) }) },
    }) } }
    const channels = await listChannels(client, guildId, { archived: true })
    expect(channels.map(item => item.id)).toEqual([parent.id, active.id, archive1.id, archive2.id])
    expect(fetchArchived.mock.calls[1][0].before.toISOString()).toBe('2026-10-27T08:00:00.000Z')
    expect(channels.find(item => item.id === active.id).canReply).toBe(true)
  })
})

describe('explicit replies', () => {
  const options = { guildId, channelId, replyTo, content: 'Please switch between the same two patterns, changing TSTR only.' }
  const restFixture = () => ({
    get: vi.fn().mockResolvedValueOnce({ guild_id: guildId }).mockResolvedValueOnce(message()),
    post: vi.fn().mockResolvedValue(message('300000000000000002', { content: options.content })),
  })

  it('previews exact text without posting, then replies to the existing message without pinging', async () => {
    const { store } = fixture()
    const rest = restFixture()
    const preview = await sendReply(rest, store, { ...options, dryRun: true })
    expect(preview.body.content).toBe(options.content)
    expect(rest.post).not.toHaveBeenCalled()
    const sender = restFixture()
    const sent = await sendReply(sender, store, options)
    expect(sent.sent).toBe(true)
    const body = sender.post.mock.calls[0][1].body
    expect(body.message_reference).toEqual({ message_id: replyTo, channel_id: channelId, guild_id: guildId, fail_if_not_exists: true })
    expect(body.allowed_mentions).toEqual({ parse: [], replied_user: false })
    expect(body.enforce_nonce).toBe(true)
    expect(body.nonce).toBe(preview.body.nonce)
  })

  it('rejects another server, DMs and missing reply targets before sending', async () => {
    const { store } = fixture()
    for (const channel of [{ guild_id: '100000000000000002' }, { type: ChannelType.DM }]) {
      const rest = { get: vi.fn().mockResolvedValue(channel), post: vi.fn() }
      await expect(sendReply(rest, store, options)).rejects.toThrow('DISCORD_GUILD_ID')
      expect(rest.post).not.toHaveBeenCalled()
    }
    const rest = { get: vi.fn().mockResolvedValueOnce({ guild_id: guildId }).mockRejectedValueOnce(new Error('Unknown Message')), post: vi.fn() }
    await expect(sendReply(rest, store, options)).rejects.toThrow('Unknown Message')
    expect(rest.post).not.toHaveBeenCalled()
  })

  it('rejects empty or oversized drafts and preserves exact text and stable retry nonces', () => {
    expect(() => replyBody({ ...options, content: '  ' })).toThrow('1–2000')
    expect(() => replyBody({ ...options, content: 'x'.repeat(2001) })).toThrow('1–2000')
    expect(replyBody({ ...options, content: 'line 1\nline 2\n' }).content).toBe('line 1\nline 2\n')
    expect(replyBody(options).nonce).not.toBe(replyBody({ ...options, content: 'A different follow-up' }).nonce)
  })

  it('reports success if Discord accepted the reply but local storage failed', async () => {
    const rest = restFixture()
    const result = await sendReply(rest, { put: () => { throw new Error('Disk full') } }, options)
    expect(result.sent).toBe(true)
    expect(result.warning).toContain('Do not resend')
    expect(rest.post).toHaveBeenCalledTimes(1)
  })
})

describe('listener lifecycle', () => {
  it('records events without sending and handles a fatal disconnect after a transient one', async () => {
    const { store } = fixture()
    const client = new EventEmitter()
    client.send = vi.fn()
    const watcher = watchGateway(client, store, guildId, vi.fn())
    try {
      client.emit(Events.Raw, { t: 'MESSAGE_CREATE', d: message() })
      expect(store.inbox(guildId).events).toHaveLength(1)
      expect(client.send).not.toHaveBeenCalled()
      client.emit(Events.ShardDisconnect, { code: 1006 })
      client.emit(Events.ShardDisconnect, { code: 4014 })
      await expect(watcher.closed).rejects.toThrow('Message Content Intent')
    } finally { watcher.dispose() }
    expect(client.listenerCount(Events.Raw)).toBe(0)
  })

  it('stops on local storage failure rather than silently losing messages', async () => {
    const client = new EventEmitter()
    const watcher = watchGateway(client, { put: () => { throw new Error('Disk full') } }, guildId, vi.fn())
    client.emit(Events.Raw, { t: 'MESSAGE_CREATE', d: message() })
    await expect(watcher.closed).rejects.toThrow('Disk full')
    watcher.dispose()
  })
})
