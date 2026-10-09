import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { DEVICE } from '../engine/elekloader/digi-build'
import { DEVICES, KIT_PROTOCOL, catalogChanges, describeChange, followUps, libraryCatalog, readKitZip, type KitJson } from '../../scripts/elekloader-update.ts'
import { PROTOCOL } from '../../vendor/elekloader/kit/src/kit/protocol.ts'

const sha = (data: Uint8Array) => createHash('sha256').update(data).digest('hex')
const text = (value: string) => new TextEncoder().encode(value)

function crc32(data: Uint8Array) {
  let c = 0xffffffff
  for (const byte of data) { c ^= byte; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1 }
  return (c ^ 0xffffffff) >>> 0
}

/** A stored zip, as packaging/build_kit.py writes the kit. */
function zip(files: Record<string, Uint8Array>) {
  const parts: Uint8Array[] = [], central: Uint8Array[] = []
  let offset = 0
  for (const [name, data] of Object.entries(files)) {
    const n = text(name), crc = crc32(data)
    const local = new DataView(new ArrayBuffer(30))
    local.setUint32(0, 0x04034b50, true); local.setUint16(4, 20, true); local.setUint32(14, crc, true)
    local.setUint32(18, data.length, true); local.setUint32(22, data.length, true); local.setUint16(26, n.length, true)
    const entry = new DataView(new ArrayBuffer(46))
    entry.setUint32(0, 0x02014b50, true); entry.setUint16(4, 20, true); entry.setUint16(6, 20, true); entry.setUint32(16, crc, true)
    entry.setUint32(20, data.length, true); entry.setUint32(24, data.length, true); entry.setUint16(28, n.length, true); entry.setUint32(42, offset, true)
    parts.push(new Uint8Array(local.buffer), n, data); central.push(new Uint8Array(entry.buffer), n)
    offset += 30 + n.length + data.length
  }
  const size = central.reduce((sum, part) => sum + part.length, 0), end = new DataView(new ArrayBuffer(22))
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, central.length / 2, true); end.setUint16(10, central.length / 2, true)
  end.setUint32(12, size, true); end.setUint32(16, offset, true)
  return new Uint8Array(Buffer.concat([...parts, ...central, new Uint8Array(end.buffer)]))
}

function kitZip(change: (kit: KitJson, files: Record<string, Uint8Array>) => void = () => {}, top = 'elekloader-kit-0.5.0') {
  const files: Record<string, Uint8Array> = {
    'LICENSE': text('GPL'), 'NOTICE': text('elekloader'), 'README.md': text('# kit'), 'src/kit/protocol.ts': text('export const PROTOCOL = 1'),
    'tools/kit.ts': text('// tools'), 'tools/build.ts': text('// build'), 'dist/kit/worker.js': text('// worker'), 'examples/minimal/index.html': text('<!doctype html>'),
  }
  const kit: KitJson = { name: 'elekloader-kit', version: '0.5.0', protocol: 1, commit: 'a'.repeat(40), files: Object.fromEntries(Object.entries(files).map(([name, data]) => [name, sha(data)])) }
  change(kit, files)
  return zip(Object.fromEntries([...Object.entries({ ...files, 'kit.json': text(JSON.stringify(kit)) })].map(([name, data]) => [top + '/' + name, data])))
}

describe('the elekloader update', () => {
  it('is written for the vendored kit\'s protocol and Modwerk\'s devices', () => {
    expect(KIT_PROTOCOL).toBe(PROTOCOL)
    expect(Object.keys(DEVICES).sort()).toEqual(Object.values(DEVICE).sort())
    for (const [key, machine] of Object.entries(DEVICES)) expect(DEVICE[machine as keyof typeof DEVICE]).toBe(key)
  })
  it('takes the kit files Modwerk vendors from a zip that matches its kit.json', async () => {
    const { kit, files } = await readKitZip(kitZip())
    expect(kit.version).toBe('0.5.0')
    expect([...files.keys()].sort()).toEqual(['LICENSE', 'NOTICE', 'README.md', 'kit.json', 'src/kit/protocol.ts', 'tools/kit.ts'])
  })
  it('refuses a changed, missing or extra file, another protocol, and a zip that is not a kit', async () => {
    await expect(readKitZip(kitZip((_, files) => { files['NOTICE'] = text('changed') }))).rejects.toThrow('not the file kit.json names: NOTICE')
    await expect(readKitZip(kitZip((_, files) => { delete files['NOTICE'] }))).rejects.toThrow('missing: NOTICE')
    await expect(readKitZip(kitZip((_, files) => { files['src/extra.ts'] = text('') }))).rejects.toThrow('not in kit.json: src/extra.ts')
    await expect(readKitZip(kitZip(kit => { kit.protocol = 2 }))).rejects.toThrow('protocol 2')
    await expect(readKitZip(kitZip(() => {}, 'elekloader-kit-0.4.0'))).rejects.toThrow('not elekloader-kit-0.5.0')
    await expect(readKitZip(zip({ 'a/kit.json': text('{}'), 'b/x': text('') }))).rejects.toThrow('one elekloader-kit-<version>/ folder')
    await expect(readKitZip(zip({ 'elekloader-kit-0.5.0/../kit.json': text('{}') }))).rejects.toThrow('outside its folder')
  })
  it('lists what changed between two catalogs and what is left to do by hand', () => {
    const pin = (id: string, version: string, os = '1.53', device = 'digitakt-mk1') => ({ file: `${id}-${version}.elemod`, sha256: sha(text(id + version)), id, version, device, os })
    const before = { revision: 'a', cores: [pin('core', '2.1')], mods: [pin('digislicer', '2.1'), pin('digisophie', '1.1.13')] }
    const after = { revision: 'b', cores: [pin('core', '2.1')], mods: [pin('digislicer', '2.2'), pin('digifresh', '0.1', '1.43', 'digitone-mk1')] }
    const changes = catalogChanges(before, after)
    expect(changes.map(describeChange)).toEqual([
      'digifresh for digitone-mk1 OS 1.43: added 0.1 (digifresh-0.1.elemod)',
      'digislicer for digitakt-mk1 OS 1.53: 2.1 (digislicer-2.1.elemod) -> 2.2 (digislicer-2.2.elemod)',
      'digisophie for digitakt-mk1 OS 1.53: 1.1.13 (digisophie-1.1.13.elemod) removed',
    ])
    // a second core for one OS is added beside the first, not in its place
    const twoCores = catalogChanges(before, { ...before, cores: [...before.cores, pin('core', '2.2')] })
    expect(twoCores.map(describeChange)).toEqual(['core for digitakt-mk1 OS 1.53: added 2.2 (core-2.2.elemod)'])
    const manifest = { components: [{ id: 'digisophie', usedIn: ['vendor/elekloader/catalog/digisophie-1.1.12.elemod'] }, { id: 'digi-mods', usedIn: ['vendor/elekloader/catalog'] }] }
    expect(followUps(fileURLToPath(new URL('../..', import.meta.url)), changes, manifest)).toEqual([
      'sdk/digitakt/modules/digislicer/modwerk.module.json: bring its version, releases and memory in line with the catalog, then run npm run modules:generate.',
      'sdk/digitakt/modules/digisophie/modwerk.module.json: digisophie left the catalog for OS 1.53. Remove those releases, or the module, then run npm run modules:generate.',
      "digitone/digifresh is in the catalog but not in Modwerk's library: add sdk/digitone/modules/digifresh/ to offer it, or leave it out of the catalog (--library).",
      'vendor/licenses/manifest.json: "digisophie" names vendor/elekloader/catalog/digisophie-1.1.12.elemod, which is gone.',
    ])
  })
  it('cuts a full catalog to the library, with what its mods require (--library)', () => {
    const pin = (id: string, os: string, device = 'digitakt-mk1', requires: string[] = ['core']) => ({ file: `${id}-${os}-${device}.elemod`, sha256: sha(text(id + os + device)), id, version: '1', device, os, requires })
    const catalog = {
      schema: 1, kind: 'elekloader-catalog', revision: 'r', about: 'kept as it is',
      cores: [pin('core', '1.53'), pin('core', '1.40C', 'octatrack')],
      mods: [pin('digislicer', '1.53'), pin('digimono', '1.53', 'digitakt-mk1', ['core', 'digichain']), pin('digichain', '1.53'), pin('digichain', '1.54'), pin('digifresh', '1.53'), pin('octamod', '1.40C', 'octatrack')],
    }
    const listed = (machine: string, id: string) => machine === 'digitakt' && ['digislicer', 'digimono'].includes(id)
    const cut = libraryCatalog(catalog, listed)
    expect(cut.catalog.mods.map(m => m.file)).toEqual(['digislicer-1.53-digitakt-mk1.elemod', 'digimono-1.53-digitakt-mk1.elemod', 'digichain-1.53-digitakt-mk1.elemod'])
    expect(cut.catalog.cores.map(c => c.device)).toEqual(['digitakt-mk1'])
    expect(cut.catalog).toMatchObject({ schema: 1, kind: 'elekloader-catalog', revision: 'r', about: 'kept as it is' })
    expect([...cut.required]).toEqual(['digitakt/digichain'])
    expect(cut.leftOut).toEqual(['digitakt/digifresh'])
    const root = fileURLToPath(new URL('../..', import.meta.url))
    const changes = catalogChanges({ revision: 'a', cores: [], mods: [] }, { revision: 'b', cores: [pin('core', '1.53')], mods: [pin('digichain', '1.53')] })
    expect(followUps(root, changes, { components: [] }, cut.required)).toEqual([
      'Cores changed (core for digitakt-mk1 OS 1.53: added 1 (core-1.53-digitakt-mk1.elemod)): builds for those OS releases change. Build them and record the identities in docs/VERIFICATION.md.',
      'digitakt/digichain comes with the catalog because a library mod requires it: it needs no library entry.',
    ])
  })
})

const ROOT = fileURLToPath(new URL('../..', import.meta.url))
const noticePaths = ['vendor/elekloader', 'vendor/licenses', 'sdk/octabam/licenses', 'public/licenses']

function fileBytes(folder: string, at = ''): Record<string, Uint8Array> {
  return Object.fromEntries(readdirSync(join(folder, at), { withFileTypes: true }).flatMap(entry => {
    const path = at + entry.name
    return entry.isDirectory() ? Object.entries(fileBytes(folder, path + '/')) : [[path, new Uint8Array(readFileSync(join(folder, path)))]]
  }))
}

/** The real CLI and its notice inputs, without firmware, module code or a network dependency. */
function fixture() {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'modwerk-elekloader-test-')))
  const copy = (path: string) => {
    mkdirSync(dirname(join(root, path)), { recursive: true })
    cpSync(join(ROOT, path), join(root, path), { recursive: true })
  }
  for (const path of [...noticePaths, 'docs/USB_AUDIO_ATTRIBUTION.txt', 'scripts/elekloader-update.ts', 'scripts/elekloader-vendor.ts', 'scripts/licenses.mjs', 'scripts/license-notices.mjs']) copy(path)
  const manifest = JSON.parse(readFileSync(join(root, 'sdk/octabam/licenses/manifest.json'), 'utf8')) as { moduleComponents: Record<string, string[]> }
  for (const id of Object.keys(manifest.moduleComponents)) {
    const folder = `sdk/octabam/modules/${id}`
    copy(folder + '/octamod.module.json')
    const document = JSON.parse(readFileSync(join(root, folder, 'octamod.module.json'), 'utf8')) as { license: { file: string } }
    copy(folder + '/' + document.license.file)
  }
  for (const name of ['react', 'react-dom', 'scheduler']) copy(`node_modules/${name}/LICENSE`)
  for (const name of ['LICENSE', 'package.json']) copy(`node_modules/wavesurfer.js/${name}`)
  return root
}

function fullKitZip(root: string, change: (files: Record<string, Uint8Array>) => void = () => {}) {
  const files = fileBytes(join(root, 'vendor/elekloader/kit'))
  delete files['kit.json']
  change(files)
  const kit: KitJson = { name: 'elekloader-kit', version: '0.5.0', protocol: 1, commit: 'a'.repeat(40), files: Object.fromEntries(Object.entries(files).map(([name, data]) => [name, sha(data)])) }
  const raw = zip(Object.fromEntries(Object.entries({ ...files, 'kit.json': text(JSON.stringify(kit)) }).map(([name, data]) => ['elekloader-kit-0.5.0/' + name, data])))
  const path = join(root, 'update.zip')
  writeFileSync(path, raw)
  return [path, '--sha256', sha(raw)]
}

function update(root: string, args: string[]) {
  return spawnSync(process.execPath, [join(root, 'scripts/elekloader-update.ts'), ...args], { cwd: root, encoding: 'utf8', timeout: 20_000 })
}

function identities(root: string) {
  return Object.fromEntries(noticePaths.flatMap(path => Object.entries(fileBytes(join(root, path))).map(([name, data]) => [path + '/' + name, sha(data)])))
}

describe('elekloader update CLI', () => {
  it('ships changed upstream notices and full licence terms, and keeps an identical update unchanged', () => {
    const root = fixture()
    try {
      const marker = 'Copyright (C) 2027 Fixture Contributor'
      const args = fullKitZip(root, files => { files.NOTICE = text(new TextDecoder().decode(files.NOTICE) + '\n' + marker + '\n') })
      const result = update(root, args)
      expect(result.status, result.stderr).toBe(0)
      for (const path of ['vendor/licenses/elekloader.txt', 'public/licenses/THIRD_PARTY_NOTICES.txt', 'public/licenses/THIRD_PARTY_NOTICES.html']) {
        expect(readFileSync(join(root, path), 'utf8')).toContain(marker)
      }
      expect(readFileSync(join(root, 'vendor/licenses/elekloader.txt'), 'utf8')).toContain(readFileSync(join(root, 'vendor/elekloader/kit/LICENSE'), 'utf8').trimEnd())
      expect(readFileSync(join(root, 'vendor/licenses/manifest.json'), 'utf8')).toContain('a'.repeat(40))
      const before = identities(root)
      const again = update(root, args)
      expect(again.status, again.stderr).toBe(0)
      expect(identities(root)).toEqual(before)
    } finally { rmSync(root, { recursive: true, force: true }) }
  })
  it('refuses a same-protocol kit that cannot read the current catalog before changing any installed file', () => {
    const root = fixture()
    try {
      const args = fullKitZip(root, files => {
        files['src/kit/catalog.ts'] = text(new TextDecoder().decode(files['src/kit/catalog.ts']).replace('export const CATALOG_SCHEMA = 1', 'export const CATALOG_SCHEMA = 2'))
      })
      const before = identities(root)
      const result = update(root, args)
      expect(result.status).toBe(1)
      expect(result.stderr).toContain('catalog schema 1: this kit reads schema 2')
      expect(identities(root)).toEqual(before)
    } finally { rmSync(root, { recursive: true, force: true }) }
  })
  it.each(['notice generation', 'vendor validation'])('restores the kit, catalog, lock, manifest and all notices when %s fails', failure => {
    const root = fixture()
    try {
      const args = fullKitZip(root, files => { files.NOTICE = text(new TextDecoder().decode(files.NOTICE) + '\nCopyright (C) 2027 Fixture Contributor\n') })
      const catalog = JSON.parse(readFileSync(join(root, 'vendor/elekloader/catalog/catalog.json'), 'utf8')) as { revision: string; mods: { id: string }[] }
      catalog.revision = 'b'.repeat(40)
      catalog.mods = catalog.mods.filter(mod => mod.id !== 'digisophie')
      const catalogPath = join(root, 'update.json')
      writeFileSync(catalogPath, JSON.stringify(catalog))
      const script = join(root, 'scripts', failure === 'notice generation' ? 'licenses.mjs' : 'elekloader-vendor.ts')
      // Fail after distribution files have changed, including a newly created file the rollback must remove.
      const absent = join(root, 'public/licenses/THIRD_PARTY_NOTICES.html')
      rmSync(absent)
      if (failure === 'notice generation') writeFileSync(script, `import { writeFileSync } from 'node:fs'; writeFileSync(${JSON.stringify(absent)}, 'partial notices'); throw new Error('fixture generation failure')`)
      else writeFileSync(script, "throw new Error('fixture validation failure')")
      const before = identities(root)
      const result = update(root, [...args, catalogPath])
      expect(result.status).toBe(1)
      expect(result.stderr).toContain(failure === 'notice generation' ? 'fixture generation failure' : 'fixture validation failure')
      expect(identities(root)).toEqual(before)
    } finally { rmSync(root, { recursive: true, force: true }) }
  })
})
