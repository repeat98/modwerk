// SPDX-License-Identifier: Elastic-2.0
// Copyright (c) 2026 Jannik Aßfalg (repeat98)
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import { setTimeout } from 'node:timers/promises'

const ATTEMPTS = 12, RETRY_MS = 5000, IDENTITY_TIMEOUT_MS = 10000, SYNC_TIMEOUT_MS = 30000

/** Called only after deploy-pages succeeds. The API re-reads the live site before fanout. */
export async function syncPublishedReleases({ inventoryPath, apiUrl, requestUrl, requestToken }, { fetch = globalThis.fetch, wait = setTimeout, log = console.log } = {}) {
  if (!apiUrl || !requestUrl || !requestToken) throw new Error('The community API and GitHub deployment identity are required.')
  const api = new URL(apiUrl), oidc = new URL(requestUrl)
  if (api.protocol !== 'https:' || oidc.protocol !== 'https:' || api.search || api.hash || !/\/api\/?$/.test(api.pathname)) throw new Error('Configure the HTTPS community API ending in /api.')
  const target = new URL(api.href.replace(/\/?$/, '/') + 'module-releases/sync')
  const inventorySha256 = createHash('sha256').update(await readFile(inventoryPath)).digest('hex')
  oidc.searchParams.set('audience', target.href)
  const identity = await fetch(oidc, { headers: { Authorization: 'Bearer ' + requestToken }, redirect: 'error', signal: AbortSignal.timeout(IDENTITY_TIMEOUT_MS) })
  if (!identity.ok) throw new Error('GitHub could not provide the deployment identity.')
  const { value: token } = await identity.json()
  if (typeof token !== 'string' || !token || /[\r\n]/.test(token)) throw new Error('GitHub returned an invalid deployment identity.')
  log('::add-mask::' + token)
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    let result
    try {
      result = await fetch(target, {
        method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ inventorySha256 }), redirect: 'error', signal: AbortSignal.timeout(SYNC_TIMEOUT_MS),
      })
    } catch { /* A rollout/network delay is retried with the same inventory and idempotent fanout. */ }
    if (result?.ok) {
      const summary = await result.json()
      if (!Number.isInteger(summary.checked) || summary.checked < 0 || !Number.isInteger(summary.notified) || summary.notified < 0) throw new Error('The release sync response was invalid.')
      log('Release notifications: checked ' + summary.checked + ' published modules; queued ' + summary.notified + ' follower updates' + (summary.held ? '; holding ' + summary.held + ' author releases for 48 hours' : '') + '. Email preferences and digest timing are unchanged.')
      return summary
    }
    if (result && ![403, 404, 409, 429, 500, 502, 503, 504].includes(result.status)) break
    if (attempt < ATTEMPTS) {
      log('Waiting for the published inventory and notification API (' + attempt + '/' + ATTEMPTS + ').')
      await wait(RETRY_MS)
    }
  }
  throw new Error('The frontend was published, but release notification sync did not complete. The existing hourly inventory poll will retry.')
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  syncPublishedReleases({
    inventoryPath: process.argv[2], apiUrl: process.env.COMMUNITY_API_URL,
    requestUrl: process.env.ACTIONS_ID_TOKEN_REQUEST_URL, requestToken: process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN,
  }).catch(error => { console.error(error.message); process.exitCode = 1 })
}
