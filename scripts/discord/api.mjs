import { createHash } from 'node:crypto'
import { ChannelType, PermissionFlagsBits, Routes } from 'discord.js'
import { snowflake } from './config.mjs'

export async function assertChannel(rest, guildId, channelId) {
  snowflake(channelId, '--channel')
  const channel = await rest.get(Routes.channel(channelId))
  if (channel.guild_id !== guildId) throw new Error('The channel must belong to DISCORD_GUILD_ID. DMs are not supported.')
  return channel
}

export async function readHistory(rest, store, { guildId, channelId, limit, before }) {
  await assertChannel(rest, guildId, channelId)
  if (before) snowflake(before, '--before')
  const messages = []
  let cursor = before
  while (messages.length < limit) {
    const pageSize = Math.min(100, limit - messages.length)
    const query = new URLSearchParams({ limit: String(pageSize), ...(cursor ? { before: cursor } : {}) })
    const page = await rest.get(Routes.channelMessages(channelId), { query })
    for (const message of page) messages.push(store.put(message, guildId, 'history'))
    if (!page.length) break
    const next = page.reduce((oldest, item) => BigInt(item.id) < BigInt(oldest) ? item.id : oldest, page[0].id)
    if (next === cursor) throw new Error('Discord returned a repeated history cursor.')
    cursor = next
    if (page.length < pageSize) break
  }
  messages.sort((a, b) => BigInt(a.id) < BigInt(b.id) ? -1 : 1)
  return { messages, nextBefore: messages[0]?.id || null }
}

export function replyBody({ guildId, channelId, replyTo, content }) {
  snowflake(channelId, '--channel')
  snowflake(replyTo, '--reply-to')
  if (!content.trim() || content.length > 2000) throw new Error('A reply must contain 1–2000 characters. Split longer replies into separate drafts.')
  return {
    content,
    message_reference: { message_id: replyTo, channel_id: channelId, guild_id: guildId, fail_if_not_exists: true },
    allowed_mentions: { parse: [], replied_user: false },
    // Discord deduplicates identical retries for a few minutes, including library-level retries.
    nonce: createHash('sha256').update(JSON.stringify([guildId, channelId, replyTo, content])).digest('hex').slice(0, 25),
    enforce_nonce: true,
  }
}

export async function sendReply(rest, store, { guildId, channelId, replyTo, content, dryRun = false }) {
  const body = replyBody({ guildId, channelId, replyTo, content })
  await assertChannel(rest, guildId, channelId)
  const target = await rest.get(Routes.channelMessage(channelId, replyTo))
  if (target.channel_id !== channelId || target.id !== replyTo) throw new Error('Reply target does not match the selected channel.')
  if (dryRun) return { dryRun: true, channelId, replyTo, body }
  const message = await rest.post(Routes.channelMessages(channelId), { body })
  // A local storage failure must not turn a successful send into an apparent send failure.
  try { store.put(message, guildId, 'sent') } catch { return { sent: true, id: message.id, url: `https://discord.com/channels/${guildId}/${channelId}/${message.id}`, warning: 'Reply sent, but the local inbox could not be updated. Do not resend.' } }
  return { sent: true, id: message.id, url: `https://discord.com/channels/${guildId}/${channelId}/${message.id}` }
}

export async function listChannels(client, guildId, { archived = false, onError = () => {} } = {}) {
  const guild = await client.guilds.fetch(guildId)
  const me = await guild.members.fetchMe()
  const channels = await guild.channels.fetch()
  const active = await guild.channels.fetchActiveThreads()
  const all = new Map([...channels, ...active.threads])
  if (archived) for (const channel of channels.values()) {
    if (!channel?.threads || !channel.permissionsFor(me)?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory])) continue
    for (const type of channel.type === ChannelType.GuildText ? ['public', 'private'] : ['public']) {
      let before
      try {
        for (;;) {
          const page = await channel.threads.fetchArchived({ type, limit: 100, ...(before ? { before } : {}) }, false)
          for (const thread of page.threads.values()) all.set(thread.id, thread)
          if (!page.hasMore || !page.threads.size) break
          const oldest = type === 'private'
            ? [...page.threads.values()].reduce((a, b) => BigInt(a.id) < BigInt(b.id) ? a : b).id
            : new Date(Math.min(...[...page.threads.values()].map(thread => thread.archiveTimestamp)))
          if (String(oldest) === String(before)) throw new Error('Repeated archived-thread cursor.')
          before = oldest
        }
      } catch (error) { onError({ channelId: channel.id, operation: `${type} archived threads`, error: error.message }) }
    }
  }
  const visible = [...all.values()].filter(channel =>
    channel && (channel.isTextBased() || channel.isThreadOnly()) && channel.permissionsFor(me)?.has(PermissionFlagsBits.ViewChannel))
  return visible.map(channel => ({
    id: channel.id,
    name: channel.name,
    parentId: channel.parentId,
    type: channel.type,
    thread: channel.isThread(),
    messageChannel: channel.isTextBased(),
    canReadHistory: channel.permissionsFor(me).has(PermissionFlagsBits.ReadMessageHistory) &&
      (!channel.isVoiceBased() || channel.permissionsFor(me).has(PermissionFlagsBits.Connect)),
    canReply: channel.isTextBased() && channel.permissionsFor(me).has(channel.isThread() ? PermissionFlagsBits.SendMessagesInThreads : PermissionFlagsBits.SendMessages),
  }))
}

export async function syncHistory(rest, store, { guildId, channels, progress = () => {} }) {
  const errors = []
  let count = 0, scanned = 0
  for (const channel of channels.filter(item => item.messageChannel && item.canReadHistory)) {
    let before, channelCount = 0
    try {
      // Revalidate each channel's guild rather than trusting saved discovery data.
      await assertChannel(rest, guildId, channel.id)
      for (;;) {
        const query = new URLSearchParams({ limit: '100', ...(before ? { before } : {}) })
        const page = await rest.get(Routes.channelMessages(channel.id), { query })
        for (const message of page) store.put(message, guildId, 'history')
        count += page.length
        channelCount += page.length
        progress({ channelId: channel.id, name: channel.name, messages: channelCount })
        if (page.length < 100) break
        const next = page.reduce((a, b) => BigInt(a.id) < BigInt(b.id) ? a : b).id
        if (next === before) throw new Error('Repeated history cursor.')
        before = next
      }
      scanned++
    } catch (error) { errors.push({ channelId: channel.id, operation: 'history', error: error.message }) }
  }
  return { channels: scanned, messages: count, errors }
}
