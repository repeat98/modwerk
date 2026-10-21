// SPDX-License-Identifier: GPL-3.0-or-later
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { mkdtemp, readFile, writeFile, mkdir, chmod, copyFile, rm, symlink } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { build } from 'vite'
import { loadPreparedModules } from './frontend-mcp-prepared.mjs'

const root = fileURLToPath(new URL('../', import.meta.url)), base = 'a'.repeat(64)
let frontend, manifest, folders = []
beforeAll(async () => {
  const bundle = await build({ root, configFile: false, logLevel: 'silent', define: {
    'import.meta.env.VITE_COMMUNITY_API_URL': JSON.stringify('http://127.0.0.1:8788/api'),
    'import.meta.env.DEV': 'false', 'import.meta.env.BASE_URL': JSON.stringify('/'),
  }, build: { ssr: join(root, 'scripts/frontend-mcp-bridge.ts'), write: false } })
  frontend = await import('data:text/javascript;base64,' + Buffer.from(bundle.output.find(item => item.isEntry).code).toString('base64'))
  manifest = JSON.parse(await readFile(join(root, 'src/engine/assets/octatrack-module-packages.json'), 'utf8'))
  // Every reviewed port is published now: prepare CC Map against a published list that does not have it yet.
  manifest.packages = manifest.packages.filter(entry => entry.id !== 'cc-map')
}, 30000)
afterAll(async () => { for (const folder of folders) await rm(folder, { recursive: true, force: true }) })

async function fixture() {
  const folder = await mkdtemp(join(tmpdir(), 'modwerk-private-modules-test-')); folders.push(folder)
  await chmod(folder, 0o700)
  // Synthetic owned image: a real ABI8 header/parser, no instrument stock.
  const bytes = Buffer.alloc(80)
  bytes.write('MWRM'); bytes.writeUInt16BE(8, 4); bytes.writeUInt32BE(4, 8)
  bytes.writeUInt32BE(createHash('sha256').update('cc-map').digest().readUInt32BE(0), 28)
  bytes.write('CC Map', 50); bytes.writeUInt16BE(1, 66)
  const version = frontend.modules.find(module => module.id === 'cc-map').version
  const extra = { id: 'cc-map', version, module: bytes.subarray(28, 32).toString('hex'), name: 'CC Map',
    abi: 8, features: 0, sites: 0, copies: 0, fills: 0, bytes: bytes.length,
    sha256: createHash('sha256').update(bytes).digest('hex'), path: `octatrack-modules/cc-map/${version}.mwrm`, requiredBase: base }
  for (const entry of [...manifest.packages, extra]) {
    const path = join(folder, entry.path)
    await mkdir(join(path, '..'), { recursive: true, mode: 0o700 })
    if (entry === extra) await writeFile(path, bytes, { mode: 0o600 })
    else { await copyFile(join(root, 'public', entry.path), path); await chmod(path, 0o600) }
  }
  const receipt = { schema: 1, preparation: true, base: { identity: base }, packages: [...structuredClone(manifest.packages), extra], held: [{ id: 'mute-modes', admission: false }] }
  const save = () => writeFile(join(folder, 'candidate-packages.json'), JSON.stringify(receipt), { mode: 0o600 })
  await save()
  return { folder, extra, receipt, save }
}

describe('startup-only private prepared modules', () => {
  it('refuses native Windows before touching startup-selected private preparation files', async () => {
    const original = process
    try {
      vi.stubGlobal('process', new Proxy(original, { get: (target, key) => key === 'platform' ? 'win32' : Reflect.get(target, key) }))
      await expect(loadPreparedModules(join(tmpdir(), 'missing-prepared-fixture'), undefined, undefined))
        .rejects.toThrow('Native Windows MCP is unavailable')
    } finally { vi.unstubAllGlobals() }
  })

  it('uses real catalogue/package parsing, preserves public bytes and excludes held ports', async () => {
    const { folder } = await fixture(), prepared = await loadPreparedModules(folder, manifest, frontend)
    expect(prepared.info).toEqual({ base, moduleIds: ['cc-map'], admission: false })
    expect(prepared.catalogue.ids).toEqual([...manifest.packages.map(entry => entry.id), 'cc-map', 'usb-audio-out-tracks-main-cue']) // USB Audio comes with the published base
    expect(prepared.catalogue.ids.filter(id => id === 'mute-modes')).toHaveLength(1) // the published package; the held copy adds none
    expect(() => prepared.requireBase(['cc-map'], 'b'.repeat(64))).toThrow('exact observed')
    expect(() => prepared.requireBase(['cc-map'], base)).not.toThrow()
    expect(() => prepared.requireBase(['everb'], undefined)).not.toThrow()
  })

  it('pins loaded bytes at startup and requires base before forward or Undo fetch', async () => {
    const { folder, extra } = await fixture(), prepared = await loadPreparedModules(folder, manifest, frontend)
    await writeFile(join(folder, extra.path), Buffer.alloc(extra.bytes))
    expect((await prepared.load(extra)).subarray(0, 4)).toEqual(new Uint8Array(Buffer.from('MWRM')))
    for (const identity of [undefined, 'b'.repeat(64)]) {
      await expect(prepared.catalogue.prepare({ name: 'Trial', moduleIds: ['cc-map'], removedStockFx: [] }, { moduleIds: [], removedStockFx: [] }, prepared.load,
        { abi: 8, features: 7, maxSites: 128, maxCopies: 128 }, identity)).rejects.toThrow('exact Modwerk base')
    }
  })

  it('refuses changed/omitted public entries, held admission, stale versions and unreviewed modules', async () => {
    for (const mutate of [r => { r.packages[0].sha256 = 'f'.repeat(64) }, r => { r.packages.shift() },
      r => { r.held[0].admission = true }, r => { r.packages.at(-1).version = '0.0.0' },
      r => { r.packages.at(-1).id = 'midi-scenes' }, r => { r.packages.at(-1).requiredBase = 'b'.repeat(64) },
      r => { r.packages.at(-1).bytes = 512 * 1024 }, r => { r.packages.at(-1).path = '../../escape' }]) {
      const { folder, receipt, save } = await fixture(); mutate(receipt); await save()
      await expect(loadPreparedModules(folder, manifest, frontend)).rejects.toThrow()
    }
  })

  it('rejects a native record mutation even with refreshed size/hash metadata', async () => {
    const { folder, extra, save } = await fixture()
    const bytes = await readFile(join(folder, extra.path)); bytes.writeUInt32BE(1, 24)
    extra.sha256 = createHash('sha256').update(bytes).digest('hex')
    await writeFile(join(folder, extra.path), bytes); await save()
    await expect(loadPreparedModules(folder, manifest, frontend)).rejects.toThrow('inconsistent')
  })

  it('refuses symlinks, nonprivate input permissions and an oversized manifest', async () => {
    const { folder, extra } = await fixture()
    const alias = folder + '-alias'; folders.push(alias); await symlink(folder, alias)
    await expect(loadPreparedModules(alias, manifest, frontend)).rejects.toThrow('0700')
    await chmod(join(folder, extra.path), 0o644)
    await expect(loadPreparedModules(folder, manifest, frontend)).rejects.toThrow('0600')
    await chmod(join(folder, extra.path), 0o600)
    const path = join(folder, extra.path), target = join(folder, 'alias-package')
    await copyFile(path, target); await rm(path); await symlink(target, path)
    await expect(loadPreparedModules(folder, manifest, frontend)).rejects.toThrow('symlinks')
    await writeFile(join(folder, 'candidate-packages.json'), Buffer.alloc(256 * 1024 + 1))
    await expect(loadPreparedModules(folder, manifest, frontend)).rejects.toThrow('bounded')
  })
})
