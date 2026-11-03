import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'

export const root = fileURLToPath(new URL('../../', import.meta.url))

export function snowflake(value, name) {
  if (typeof value !== 'string' || !/^[1-9]\d{16,19}$/.test(value)) {
    throw new Error(`${name} must be a Discord ID (copy it with Developer Mode enabled).`)
  }
  return value
}

export function readConfig(env = process.env, { tokenRequired = true } = {}) {
  const token = env.DISCORD_BOT_TOKEN?.trim()
  if (tokenRequired && !token) throw new Error('Set DISCORD_BOT_TOKEN in .env.discord first.')
  return {
    token,
    guildId: snowflake(env.DISCORD_GUILD_ID?.trim(), 'DISCORD_GUILD_ID'),
    stateDir: resolve(root, env.DISCORD_STATE_DIR?.trim() || '.discord-bot'),
  }
}

export function limitValue(value = '50', max = 1000) {
  if (!/^\d+$/.test(value) || Number(value) < 1 || Number(value) > max) {
    throw new Error(`--limit must be between 1 and ${max}.`)
  }
  return Number(value)
}

export function safeError(error, token) {
  const message = String(error?.message || error)
  return token ? message.split(token).join('[redacted]') : message
}
