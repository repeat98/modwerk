/* Push only: no fetch handler, offline cache, account tokens or firmware access. */
self.addEventListener('push', event => {
  event.waitUntil((async () => {
    let message
    try { message = event.data?.json() } catch { /* fall back to a visible notification */ }
    const base = new URL(self.registration.scope), target = new URL(base)
    // The server sends app hashes only. Never open a payload-supplied origin.
    target.hash = typeof message?.href === 'string' && message.href.startsWith('#') ? message.href.slice(1) : 'account'
    // The site counts the visit as one from a notification (src/community/visit-source.ts) and then drops the tag.
    target.searchParams.set('utm_source', 'push')
    await self.registration.showNotification(typeof message?.title === 'string' ? message.title : 'Modwerk', {
      body: typeof message?.body === 'string' ? message.body : 'You have new Modwerk activity.',
      tag: typeof message?.tag === 'string' ? message.tag : 'modwerk-activity',
      icon: new URL('push-icon-192.png', base).href,
      badge: new URL('push-icon-192.png', base).href,
      data: { href: target.href },
    })
  })())
})
self.addEventListener('notificationclick', event => {
  event.notification.close()
  event.waitUntil((async () => {
    const base = new URL(self.registration.scope), target = new URL(event.notification.data?.href ?? base.href, base)
    if (target.origin !== base.origin || !target.pathname.startsWith(base.pathname)) return
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    for (const client of windows) {
      const current = new URL(client.url)
      if (current.origin === base.origin && current.pathname.startsWith(base.pathname)) { await client.navigate(target.href); await client.focus(); return }
    }
    await self.clients.openWindow(target.href)
  })())
})
self.addEventListener('install', event => { event.waitUntil(self.skipWaiting()) })
self.addEventListener('activate', event => { event.waitUntil(self.clients.claim()) })
