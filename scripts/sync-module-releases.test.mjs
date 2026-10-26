// SPDX-License-Identifier: Elastic-2.0
// Copyright (c) 2026 Jannik Aßfalg (repeat98)
import { afterEach, expect, it, vi } from 'vitest'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { syncPublishedReleases } from './sync-module-releases.mjs'

const directories = []
afterEach(async () => {
  vi.restoreAllMocks(); vi.useRealTimers()
  for (const directory of directories.splice(0)) await rm(directory, { recursive: true, force: true })
})
async function fixture(responses) {
  const directory = await mkdtemp(join(tmpdir(), 'release-sync-')); directories.push(directory)
  const inventoryPath = join(directory, 'module-releases.json'), inventory = '{"format":"modwerk-module-releases-v1","modules":[]}'
  await writeFile(inventoryPath, inventory)
  const fetch = vi.fn().mockResolvedValueOnce(Response.json({ value: 'signed-deployment-token' }))
  for (const response of responses) fetch.mockResolvedValueOnce(response)
  const wait = vi.fn().mockResolvedValue(undefined), log = vi.fn()
  const config = { inventoryPath, apiUrl: 'https://api.example.test/api', requestUrl: 'https://actions.example.test/identity?job=deployment', requestToken: 'request-only-token' }
  return { config, fetch, wait, log, inventorySha256: createHash('sha256').update(inventory).digest('hex') }
}

it('uses the deployment token and exact build hash without sending email or leaking provider responses', async () => {
  const f = await fixture([Response.json({ checked: 24, notified: 16 })])
  expect(await syncPublishedReleases(f.config, f)).toEqual({ checked: 24, notified: 16 })
  const [identity, options] = f.fetch.mock.calls[0]
  expect(identity.searchParams.get('audience')).toBe('https://api.example.test/api/module-releases/sync')
  expect(options.headers.Authorization).toBe('Bearer request-only-token')
  const [target, request] = f.fetch.mock.calls[1]
  expect(target.href).toBe('https://api.example.test/api/module-releases/sync')
  expect(JSON.parse(request.body)).toEqual({ inventorySha256: f.inventorySha256 })
  expect(request.headers.Authorization).toBe('Bearer signed-deployment-token')
  expect(request.redirect).toBe('error')
  expect(f.wait).not.toHaveBeenCalled()
  expect(f.log.mock.calls[0][0]).toBe('::add-mask::signed-deployment-token')
  expect(f.log.mock.calls[1][0]).toContain('Email preferences and digest timing are unchanged.')
})

it('retries rollout delays with the same inventory and a bounded wait', async () => {
  const f = await fixture([new Response('', { status: 404 }), new Response('', { status: 409 }), new Response('', { status: 503 }), Response.json({ checked: 24, notified: 0 })])
  expect(await syncPublishedReleases(f.config, f)).toEqual({ checked: 24, notified: 0 })
  expect(f.wait).toHaveBeenCalledTimes(3)
  expect(f.wait.mock.calls.every(([delay]) => delay === 5000)).toBe(true)
  expect(new Set(f.fetch.mock.calls.slice(1).map(([, options]) => options.body)).size).toBe(1)
})

it('accepts a slow successful inventory fanout without retrying it', async () => {
  const f = await fixture([])
  vi.useFakeTimers()
  // Node's native AbortSignal timer is outside Vitest's clock; retain its
  // abort behavior while advancing the simulated network delay deterministically.
  vi.spyOn(AbortSignal, 'timeout').mockImplementation(delay => {
    const controller = new AbortController()
    setTimeout(() => controller.abort(new DOMException('Timed out', 'TimeoutError')), delay)
    return controller.signal
  })
  let started
  const ready = new Promise(resolve => { started = resolve })
  f.fetch.mockImplementationOnce((_, { signal }) => new Promise((resolve, reject) => {
    const timer = setTimeout(() => resolve(Response.json({ checked: 36, notified: 4 })), 20000)
    signal.addEventListener('abort', () => { clearTimeout(timer); reject(signal.reason) }, { once: true })
    started()
  }))
  const outcome = syncPublishedReleases(f.config, f).then(value => ({ value }), error => ({ error }))
  await ready
  await vi.advanceTimersByTimeAsync(20000)
  expect(await outcome).toEqual({ value: { checked: 36, notified: 4 } })
  expect(f.fetch).toHaveBeenCalledTimes(2)
  expect(f.wait).not.toHaveBeenCalled()
})

it('leaves the hourly fallback in place after the bounded retry limit', async () => {
  const f = await fixture(Array.from({ length: 12 }, () => new Response('private-error-detail', { status: 503 })))
  await expect(syncPublishedReleases(f.config, f)).rejects.toThrow('The existing hourly inventory poll will retry.')
  expect(f.fetch).toHaveBeenCalledTimes(13)
  expect(f.wait).toHaveBeenCalledTimes(11)
  expect(f.log.mock.calls.flat().join(' ')).not.toContain('private-error-detail')
})

it('stops on an invalid request and never logs upstream response content', async () => {
  const f = await fixture([new Response('private-error-detail', { status: 400 })])
  await expect(syncPublishedReleases(f.config, f)).rejects.toThrow('did not complete')
  expect(f.fetch).toHaveBeenCalledTimes(2)
  expect(f.wait).not.toHaveBeenCalled()
})

it('does not call the notification API when GitHub identity acquisition fails', async () => {
  const f = await fixture([])
  f.fetch.mockReset().mockResolvedValue(new Response('private-error-detail', { status: 403 }))
  await expect(syncPublishedReleases(f.config, f)).rejects.toThrow('GitHub could not provide')
  expect(f.fetch).toHaveBeenCalledTimes(1)
  expect(f.log).not.toHaveBeenCalled()
})
