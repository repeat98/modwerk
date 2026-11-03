import { Events } from 'discord.js'
import { recordDispatch } from './store.mjs'

export function watchGateway(client, store, guildId, log) {
  let finish, fail, stopped = false
  const closed = new Promise((resolve, reject) => { finish = resolve; fail = reject })
  // Failures can arrive while the caller is still awaiting login.
  void closed.catch(() => {})
  const stop = error => {
    if (stopped) return
    stopped = true
    if (error) fail(error)
    else finish()
  }
  const raw = packet => {
    if (stopped) return
    try { recordDispatch(store, packet, guildId) }
    catch (error) { stop(error) }
  }
  const disconnected = event => {
    log(`Discord disconnected (${event.code}); use read to recover missed messages.`)
    if ([4004, 4010, 4011, 4012, 4013, 4014].includes(event.code)) {
      stop(new Error(`Discord rejected the connection (${event.code}). For 4014, enable Message Content Intent.`))
    }
  }
  const resumed = () => log('Discord connection resumed.')
  client.on(Events.Raw, raw)
  client.on(Events.ShardDisconnect, disconnected)
  client.on(Events.ShardResume, resumed)
  return {
    closed,
    stop: () => stop(),
    dispose() {
      stop()
      client.off(Events.Raw, raw)
      client.off(Events.ShardDisconnect, disconnected)
      client.off(Events.ShardResume, resumed)
    },
  }
}
