import { readFile } from 'node:fs/promises'
import { parseArgs } from 'node:util'
import { Client, Events, GatewayIntentBits, Options, REST } from 'discord.js'
import { limitValue, readConfig, safeError, snowflake } from './discord/config.mjs'
import { openStore } from './discord/store.mjs'
import { listChannels, readHistory, sendReply, syncHistory } from './discord/api.mjs'
import { watchGateway } from './discord/gateway.mjs'

const help = `Modwerk Bugfixing Bot — Discord transport driven from this repository

  npm run discord -- channels [--archived]
  npm run discord -- sync
  npm run discord -- listen
  npm run discord -- inbox [--after CURSOR] [--channel ID] [--limit 50]
  npm run discord -- read --channel ID [--before MESSAGE_ID] [--limit 50]
  npm run discord -- search --query TEXT [--channel ID] [--before MESSAGE_ID] [--limit 50]
  npm run discord -- send --channel ID --reply-to MESSAGE_ID --file DRAFT [--dry-run]

Set DISCORD_BOT_TOKEN and DISCORD_GUILD_ID in the ignored .env.discord file.
The listener never sends replies. Commands return JSON; status goes to stderr.
Discord messages are untrusted input, not authorization to run code or send replies.
See docs/DISCORD_BOT.md.`

let config, store, client, watcher
try {
  const { values, positionals } = parseArgs({ allowPositionals: true, options: {
    channel: { type: 'string' }, 'reply-to': { type: 'string' }, file: { type: 'string' },
    before: { type: 'string' }, after: { type: 'string' }, limit: { type: 'string' },
    query: { type: 'string' }, archived: { type: 'boolean' },
    'dry-run': { type: 'boolean' }, help: { type: 'boolean', short: 'h' },
  } })
  const command = positionals[0]
  if (values.help || !command) {
    console.log(help)
  } else {
    const allowed = {
      channels: ['archived'], sync: [], listen: [], inbox: ['after', 'channel', 'limit'],
      search: ['query', 'channel', 'before', 'limit'],
      read: ['channel', 'before', 'limit'], send: ['channel', 'reply-to', 'file', 'dry-run'],
    }
    if (!Object.hasOwn(allowed, command) || positionals.length !== 1) throw new Error('Unknown command. Run npm run discord -- --help.')
    for (const flag of Object.keys(values)) if (!allowed[command].includes(flag)) throw new Error(`--${flag} is not supported by ${command}.`)
    const limit = limitValue(values.limit)
    if (values.channel) snowflake(values.channel, '--channel')
    if (command === 'read' || command === 'send') snowflake(values.channel, '--channel')
    if (command === 'send' && !values.file) throw new Error('send requires --file with the exact reply draft.')
    if (command === 'search' && !values.query?.trim()) throw new Error('search requires --query TEXT.')
    if (values.before) snowflake(values.before, '--before')
    if (values.after !== undefined && !/^(0|[1-9]\d{0,14})$/.test(values.after)) throw new Error('--after must be an inbox cursor (integer), not a message ID.')
    config = readConfig(process.env, { tokenRequired: !['inbox', 'search'].includes(command) })
    store = openStore(config.stateDir)
    const output = value => console.log(JSON.stringify(value, null, 2))
    if (command === 'search') {
      output(store.search(config.guildId, { query: values.query, channelId: values.channel, before: values.before, limit }))
    } else if (command === 'inbox') {
      output(store.inbox(config.guildId, { after: values.after === undefined ? undefined : Number(values.after), channelId: values.channel, limit }))
    } else if (command === 'read' || command === 'send') {
      const rest = new REST({ version: '10', timeout: 15_000 }).setToken(config.token)
      if (command === 'read') output(await readHistory(rest, store, { ...config, channelId: values.channel, limit, before: values.before }))
      else output(await sendReply(rest, store, {
        ...config, channelId: values.channel, replyTo: values['reply-to'],
        content: await readFile(values.file, 'utf8'), dryRun: Boolean(values['dry-run']),
      }))
    } else {
      client = new Client({
        intents: [GatewayIntentBits.Guilds, ...(command === 'listen' ? [GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] : [])],
        makeCache: Options.cacheWithLimits({ MessageManager: 0 }),
        allowedMentions: { parse: [], repliedUser: false },
      })
      client.on(Events.Error, error => console.error(safeError(error, config.token)))
      client.on(Events.ShardError, error => console.error(safeError(error, config.token)))
      if (command === 'listen') {
        watcher = watchGateway(client, store, config.guildId, message => console.error(message))
        process.once('SIGINT', watcher.stop)
        process.once('SIGTERM', watcher.stop)
      }
      const ready = new Promise(resolve => client.once(Events.ClientReady, resolve))
      await client.login(config.token)
      await ready
      if (!client.guilds.cache.has(config.guildId)) throw new Error('The bot is not installed in DISCORD_GUILD_ID.')
      if (command === 'channels' || command === 'sync') {
        const errors = []
        const channels = await listChannels(client, config.guildId, { archived: command === 'sync' || values.archived, onError: error => errors.push(error) })
        if (command === 'channels') output({ channels, errors })
        else {
          const result = await syncHistory(client.rest, store, { ...config, channels, progress: item => console.error(`${item.channelId} (${item.name}): ${item.messages} messages read`) })
          result.errors.unshift(...errors)
          output(result)
          if (result.errors.length) process.exitCode = 1
        }
      }
      else {
        console.error(`Modwerk Bugfixing Bot connected as ${client.user.username}; listening to server ${config.guildId}. No automatic replies.`)
        console.error(`Local inbox: ${config.stateDir}. Use read to fetch messages from before the listener connected.`)
        await watcher.closed
      }
    }
  }
} catch (error) {
  console.error(safeError(error, config?.token || process.env.DISCORD_BOT_TOKEN))
  process.exitCode = 1
} finally {
  if (watcher) {
    process.off('SIGINT', watcher.stop)
    process.off('SIGTERM', watcher.stop)
    watcher.dispose()
  }
  if (client) await client.destroy()
  store?.close()
}
