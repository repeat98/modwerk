import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { RETAIN_MS, planRetention, retainModuleMedia, safeMediaPath } from './retain-module-media.mjs'

const NOW = Date.parse('2026-11-17T14:08:00.000Z'), quiet = { log() {}, warn() {} }
let dist
afterEach(async () => { if (dist) await rm(dist, { recursive: true, force: true }); dist = undefined })

function site(files) {
  const calls = []
  const get = async url => {
    const path = new URL(url).pathname.replace(/^\/module-media\//, '')
    calls.push(path)
    if (!Object.hasOwn(files, path)) return new Response('missing', { status: 404 })
    const body = files[path]
    return new Response(typeof body === 'string' ? body : JSON.stringify(body))
  }
  return { get, calls }
}

describe('keeping module media a release drops', () => {
  it('carries over the previous version of a released module, so a tab opened before the release still plays its clip', async () => {
    dist = await mkdtemp(join(tmpdir(), 'retain-'))
    await mkdir(join(dist, 'module-media/airwindows-chorus/0.1.3-experimental/media'), { recursive: true })
    await writeFile(join(dist, 'module-media/airwindows-chorus/0.1.3-experimental/media/audio-preview.mp3'), 'new clip')
    const old = 'airwindows-chorus/0.1.2-experimental/media/audio-preview.mp3', current = 'airwindows-chorus/0.1.3-experimental/media/audio-preview.mp3'
    const live = site({ 'manifest.json': { version: 1, files: { [old]: {} } }, [old]: 'old clip' })
    expect(await retainModuleMedia(dist, 'https://modwerk.app/', { fetch: live.get, now: NOW, log: quiet })).toEqual({ current: 1, kept: 1, bytes: 8 })
    expect(await readFile(join(dist, 'module-media', old), 'utf8')).toBe('old clip')
    expect(await readFile(join(dist, 'module-media', current), 'utf8')).toBe('new clip')
    expect(JSON.parse(await readFile(join(dist, 'module-media/manifest.json'), 'utf8'))).toEqual({ version: 1, files: { [current]: {}, [old]: { retiredAt: '2026-11-17T14:08:00.000Z' } } })
  })

  it('keeps a retired file a week from when it first left, across further releases, then drops it', () => {
    const live = { files: { 'a/1/x.mp3': { retiredAt: new Date(NOW - RETAIN_MS + 1000).toISOString() }, 'a/0/x.mp3': { retiredAt: new Date(NOW - RETAIN_MS).toISOString() }, 'a/2/x.mp3': {} } }
    expect(planRetention(['a/2/x.mp3'], live, NOW)).toEqual({ files: { 'a/2/x.mp3': {} }, carry: [{ path: 'a/1/x.mp3', retiredAt: new Date(NOW - RETAIN_MS + 1000).toISOString() }] })
    // A stamp from the future cannot stretch the week.
    expect(planRetention([], { files: { 'a/1/x.mp3': { retiredAt: '2099-01-01T00:00:00.000Z' } } }, NOW).carry).toEqual([{ path: 'a/1/x.mp3', retiredAt: new Date(NOW).toISOString() }])
  })

  it('never writes outside module-media, whatever the live manifest names', () => {
    for (const path of ['../index.html', 'a/../../x', '/etc/passwd', 'a//b', 'manifest.json', 'a/b c.mp3', 'a\\b']) expect(safeMediaPath(path)).toBe(false)
    expect(safeMediaPath('airwindows-chorus/0.1.2-experimental/media/ot-dry.png')).toBe(true)
    expect(planRetention([], { files: { '../index.html': {}, 'a/../../x': {} } }, NOW).carry).toEqual([])
  })

  it('still deploys when the live site has no manifest, is unreachable or lost a file', async () => {
    dist = await mkdtemp(join(tmpdir(), 'retain-'))
    expect(await retainModuleMedia(dist, 'https://modwerk.app/', { fetch: site({}).get, now: NOW, log: quiet })).toEqual({ current: 0, kept: 0, bytes: 0 })
    expect(await retainModuleMedia(dist, 'https://modwerk.app/', { fetch: async () => { throw new Error('offline') }, now: NOW, log: quiet })).toEqual({ current: 0, kept: 0, bytes: 0 })
    const live = site({ 'manifest.json': { files: { 'a/1/gone.mp3': {}, 'a/1/here.mp3': {} } }, 'a/1/here.mp3': 'x' })
    expect(await retainModuleMedia(dist, 'https://modwerk.app/', { fetch: live.get, now: NOW, log: quiet })).toMatchObject({ kept: 1 })
    expect(Object.keys(JSON.parse(await readFile(join(dist, 'module-media/manifest.json'), 'utf8')).files)).toEqual(['a/1/here.mp3'])
  })

  it('stops carrying files over at the size cap', async () => {
    dist = await mkdtemp(join(tmpdir(), 'retain-'))
    const big = 'x'.repeat(600)
    const live = site({ 'manifest.json': { files: { 'a/1/one.wav': {}, 'a/1/two.wav': {} } }, 'a/1/one.wav': big, 'a/1/two.wav': big })
    expect(await retainModuleMedia(dist, 'https://modwerk.app/', { fetch: live.get, now: NOW, log: quiet, maxBytes: 1000 })).toMatchObject({ kept: 1, bytes: 600 })
  })
})
