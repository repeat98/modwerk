// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, it, expect, vi, afterEach } from 'vitest'
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseBuildRequest, siteBase, verifyPublishedModules, buildAndSave, libraryModuleIds } from './firmware-download.mjs'
import { readFirmwareBuildManifest, sha256 } from './firmware-build-manifest.mjs'

const image = new Uint8Array([1, 2, 3, 4])
vi.mock('../vendor/elekloader/kit/src/bridge.ts', () => ({ Bridge: class {
  async setStock() { return { ok: true, dev: { key: 'digitakt-mk1' }, os: '1.54' } }
  addCore() { return {} }
  addMod() { return { ok: true } }
  check() { return { ok: true } }
  version() { return { ok: true, name: 'test.syx' } }
  async build() { return { ok: true, version: 'D180', files: [{ name: 'test.syx', data: new Uint8Array([1, 2, 3, 4]) }] } }
} }))

const root = fileURLToPath(new URL('../', import.meta.url))
const request = { machine: 'digitakt', os: '1.54', moduleIds: ['digimono', 'digieq'], version: 'D180', riskAccepted: true }
const cleanup = []
afterEach(async () => { vi.unstubAllGlobals(); for (const path of cleanup.splice(0)) await rm(path, { recursive: true, force: true }) })

async function fixture() {
  const folder = await mkdtemp(join(tmpdir(), 'modwerk-download-test-')); cleanup.push(folder)
  const stockPath = join(folder, 'stock.syx'); await writeFile(stockPath, 'private stock fixture')
  const manifest = await readFirmwareBuildManifest(root)
  const documents = JSON.parse(await readFile(resolve(root, 'src/catalog/machine-modules.json'), 'utf8')).modules
  const releases = documents.map(module => ({ id: module.machine + '-' + module.id, version: module.version }))
  const inventory = { format: 'modwerk-module-releases-v1', modules: releases }
  let manifestReads = 0
  const assets = new Map([
    ['/firmware-builder.json', Buffer.from(JSON.stringify(manifest))],
    ['/module-releases.json', Buffer.from(JSON.stringify(inventory))],
    ['/elekloader/catalog.json', await readFile(resolve(root, 'vendor/elekloader/catalog/catalog.json'))],
  ])
  const fetch = vi.fn(async url => {
    const path = new URL(url).pathname
    if (path === '/firmware-builder.json') manifestReads++
    const bytes = assets.get(path) ?? (path.startsWith('/elekloader/') ? await readFile(resolve(root, 'vendor/elekloader/catalog', path.slice('/elekloader/'.length))) : undefined)
    return new Response(bytes, { status: bytes ? 200 : 404 })
  })
  vi.stubGlobal('fetch', fetch)
  return { folder, manifest, inventory, assets, fetch, reads: () => manifestReads, options: { stockPath, outputDir: join(folder, 'out'), site: 'https://site.example/' } }
}

describe('local firmware release verification', () => {
  it('rejects filesystem injection, paused machines and missing risk acceptance', () => {
    for (const override of [{ outputDir: '/tmp/elsewhere' }, { stockPath: '/etc/passwd' }, { machine: 'digitakt-ii' }, { riskAccepted: false }, { moduleIds: ['digimono', 'digimono'] }]) expect(() => parseBuildRequest({ ...request, ...override })).toThrow()
    expect(() => parseBuildRequest({ machine: 'octatrack', os: '1.40C', moduleIds: ['quantizer'], riskAccepted: true })).toThrow('Octatrack modules go through the Modwerk base')
    expect(() => parseBuildRequest({ ...request, expectedSha256: 'not a hash' })).toThrow()
    expect(() => siteBase('http://example.com')).toThrow()
    expect(() => siteBase('https://user:secret@example.com')).toThrow()
    expect(siteBase('http://127.0.0.1:5173').href).toBe('http://127.0.0.1:5173/')
  })

  it('rejects absent/beta releases and stale or unexpected semantic versions', () => {
    const inventory = { format: 'modwerk-module-releases-v1', modules: [{ id: 'digitakt-digimono', version: '0.13.2-experimental' }] }
    const local = [{ id: 'digimono', machine: 'digitakt', version: '0.13.2-experimental' }]
    expect(verifyPublishedModules(inventory, local, 'digitakt', ['digimono'])).toEqual({ digimono: '0.13.2-experimental' })
    expect(() => verifyPublishedModules(inventory, local, 'digitakt', ['digieq'])).toThrow('unavailable')
    expect(() => verifyPublishedModules(inventory, local, 'digitakt', ['digimono'], { digimono: '0.13.1' })).toThrow('Unexpected')
    expect(() => verifyPublishedModules(inventory, [{ ...local[0], version: 'old' }], 'digitakt', ['digimono'])).toThrow('differs')
    inventory.modules[0].beta = true
    expect(() => verifyPublishedModules(inventory, local, 'digitakt', ['digimono'])).toThrow('unavailable')
  })

  it('leaves dependency folders to their catalogue pins, not the release list', () => {
    expect(libraryModuleIds(['machine-pages', 'digistring', 'dt-support', 'euclidean', 'digichain'], 'digitakt')).toEqual(['digistring', 'euclidean', 'digichain'])
  })

  it('fingerprints input bytes, independent of filesystem enumeration order', async () => {
    const folder = await mkdtemp(join(tmpdir(), 'modwerk-manifest-test-')); cleanup.push(folder)
    for (const dir of ['src/engine', 'src/catalog', 'src/config', 'vendor/elekloader/kit', 'vendor/elekloader/catalog', 'src/community', 'sdk']) await mkdir(join(folder, dir), { recursive: true })
    for (const name of ['sdk/catalog.json', 'src/community/modules.ts', 'src/community/module-changelogs.json', 'package-lock.json', 'vendor/elekloader/catalog/catalog.json']) await writeFile(join(folder, name), '{}')
    await writeFile(join(folder, 'vendor/elekloader/kit/kit.json'), JSON.stringify({ version: '1', commit: 'a', protocol: 1 }))
    await writeFile(join(folder, 'src/engine/a.ts'), 'one')
    const before = await readFirmwareBuildManifest(folder)
    await writeFile(join(folder, 'src/engine/ignored.test.ts'), 'test only')
    expect((await readFirmwareBuildManifest(folder)).inputsSha256).toBe(before.inputsSha256)
    await writeFile(join(folder, 'src/engine/a.ts'), 'two')
    expect((await readFirmwareBuildManifest(folder)).inputsSha256).not.toBe(before.inputsSha256)
  })

  it('saves and reads back bytes in private fresh folders, retaining implicit dependencies and pins', async () => {
    const f = await fixture()
    const expectedVersion = f.inventory.modules.find(module => module.id === 'digitakt-digimono').version
    const result = await buildAndSave({ ...request, expectedSha256: sha256(image), expectedVersions: { digimono: expectedVersion } }, f.options)
    expect(result.moduleVersions.digimono).toBe(expectedVersion)
    expect(result.files[0].sha256).toBe(sha256(await readFile(result.files[0].path)))
    expect(result.moduleVersions.digichain).toBeTruthy()
    expect(result.modules.find(pin => pin.id === 'digimono').source.commit).toMatch(/^[a-f0-9]{40}$/)
    expect((await stat(result.files[0].path)).mode & 0o777).toBe(0o600)
    expect(JSON.parse(await readFile(result.receiptPath, 'utf8')).verification).toBe('saved-local-build-from-published-inputs')
    const second = await buildAndSave(request, f.options)
    expect(second.files[0].path).not.toBe(result.files[0].path)
    expect(await readFile(result.files[0].path)).toEqual(Buffer.from(image))
    for (const [, options] of f.fetch.mock.calls) expect(options.body).toBeUndefined()
  })

  it('refuses stale deployments and unexpected image identities before saving', async () => {
    const f = await fixture()
    await expect(buildAndSave({ ...request, expectedSha256: '0'.repeat(64) }, f.options)).rejects.toThrow('private image')
    expect(await readdir(f.folder)).toEqual(['stock.syx'])
    f.assets.set('/firmware-builder.json', Buffer.from(JSON.stringify({ ...f.manifest, inputsSha256: '0'.repeat(64) })))
    await expect(buildAndSave(request, f.options)).rejects.toThrow('deployed builder')
  })

  it('refuses altered packages and deployments changing mid-build', async () => {
    const f = await fixture()
    const original = f.fetch.getMockImplementation()
    f.fetch.mockImplementation(async (url, options) => new URL(url).pathname.endsWith('.elemod') ? new Response('changed package') : original(url, options))
    await expect(buildAndSave(request, f.options)).rejects.toThrow('SHA-256 mismatch')
    f.fetch.mockImplementation(async (url, options) => {
      if (new URL(url).pathname === '/firmware-builder.json' && f.reads() > 1) return new Response(JSON.stringify({ ...f.manifest, inputsSha256: 'f'.repeat(64) }))
      return original(url, options)
    })
    await expect(buildAndSave(request, f.options)).rejects.toThrow('changed during the build')
    expect(await readdir(f.folder)).toEqual(['stock.syx'])
  })
})
