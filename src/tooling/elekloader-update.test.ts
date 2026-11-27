import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { DEVICE } from '../engine/elekloader/digi-build'
import { DEVICES, catalogChanges, describeChange, followUps, libraryCatalog, mergeCatalogOverlay, syncCatalog, verifyCatalogFolder } from '../../scripts/elekloader-update.ts'
import { kitNotice } from '../../scripts/elekloader-vendor.ts'

const sha = (data: Uint8Array) => createHash('sha256').update(data).digest('hex')
const text = (value: string) => new TextEncoder().encode(value)

describe('the elekloader update', () => {
  it('covers Modwerk\'s devices', () => {
    expect(Object.keys(DEVICES).sort()).toEqual(Object.values(DEVICE).sort())
    for (const [key, machine] of Object.entries(DEVICES)) expect(DEVICE[machine as keyof typeof DEVICE]).toBe(key)
  })
  it('syncs a catalog\'s pins into a folder, fetching only what is missing, and refuses a file that is not the pinned one', async () => {
    const folder = mkdtempSync(join(tmpdir(), 'modwerk-sync-'))
    try {
      const data = text('{"elemod": 2}'), other = text('{"elemod": 2, "id": "x"}')
      const pin = { file: 'a.elemod', sha256: sha(data), id: 'a', version: '1', device: 'digitakt-mk1', os: '1.54', license: 'MIT', source: { repo: 'o/r', tag: 'v1' }, title: 'A', requires: [], conflicts: [] }
      const catalog = { schema: 1, kind: 'elekloader-catalog', revision: 'r', cores: [], mods: [pin, { ...pin, file: 'b.elemod', device: 'octatrack' }] }
      const fetched: string[] = []
      await syncCatalog(catalog, folder, ['digitakt-mk1'], async url => { fetched.push(url); return data })
      expect(fetched).toEqual(['https://github.com/o/r/releases/download/v1/a.elemod'])
      verifyCatalogFolder(folder)
      await syncCatalog(catalog, folder, ['digitakt-mk1'], async () => { throw new Error('no second download') })
      writeFileSync(join(folder, 'a.elemod'), other)
      await expect(syncCatalog(catalog, folder, ['digitakt-mk1'], async () => other)).rejects.toThrow('is not the file the catalog pins')
      writeFileSync(join(folder, 'stray.elemod'), data)
      expect(() => verifyCatalogFolder(folder)).toThrow('not in the catalog: stray.elemod')
    } finally { rmSync(folder, { recursive: true, force: true }) }
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
      'Cores changed (core for digitakt-mk1 OS 1.53: added 1 (core-1.53-digitakt-mk1.elemod)): builds for those OS releases change. Build them and record the identities in docs/verification/<YYYY-MM-DD>-<topic>.md.',
      'digitakt/digichain comes with the catalog because a library mod requires it: it needs no library entry.',
    ])
  })
  it('retains Digitakt II packages only when the DTII machine library lists them', () => {
    const pin = (id: string, device: string) => ({
      file: `${id}-1.0.elemod`, sha256: sha(text(id)), id, version: '1.0', device, os: '1.17',
      requires: ['core'],
    })
    const source = {
      schema: 1, kind: 'elekloader-catalog', revision: 'dt2',
      cores: [pin('core', 'digitakt-mk2'), pin('core', 'digitakt-mk1')],
      mods: [pin('perform-direct', 'digitakt-mk2'), pin('digislicer', 'digitakt-mk1')],
    }
    const cut = libraryCatalog(source, (machine, id) => machine === 'digitakt-ii' && id === 'perform-direct')

    expect(cut.catalog.cores.map(item => item.device)).toEqual(['digitakt-mk2', 'digitakt-mk1'])
    expect(cut.catalog.mods.map(item => item.id)).toEqual(['perform-direct'])
    expect(cut.leftOut).toEqual(['digitakt/digislicer'])
    expect(DEVICES['digitakt-mk2']).toBe('digitakt-ii')
  })
  it('ships the kit\'s notice whole after the note on what it covers', () => {
    const notice = 'elekloader\nCopyright (C) 2026 irpina and contributors\n'
    expect(kitNotice(notice).endsWith(notice)).toBe(true)
    expect(kitNotice(notice)).toContain("Modwerk's own implementation")
  })
  it('adds pinned site packages to the existing catalog without replacement and fingerprints the result', () => {
    const pin = (id: string, device: string, file: string, sha256: string) => ({
      file, sha256, id, version: '1.0', device, os: '1.17', license: 'GPL-2.0-or-later',
      source: { repo: 'toonst/digitakt2-perform', tag: 'v1.0' },
    })
    const base = {
      schema: 1, kind: 'elekloader-catalog', revision: 'upstream', about: 'upstream catalog',
      cores: [pin('core', 'digitakt-mk1', 'core-2.1.elemod', 'a'.repeat(64))], mods: [],
    }
    const overlay = {
      schema: 1, kind: 'elekloader-catalog', revision: 'site overlay',
      cores: [pin('core', 'digitakt-mk2', 'core-1.0.elemod', 'b'.repeat(64))],
      mods: [Object.assign(pin('perform-direct', 'digitakt-mk2', 'perform-direct-1.0.elemod', 'c'.repeat(64)), { title: 'Direct perform', requires: ['core'], conflicts: [] })],
    }

    const merged = mergeCatalogOverlay(base, overlay)
    expect(merged.about).toBe('upstream catalog')
    expect(merged.cores.map(item => item.device)).toEqual(['digitakt-mk1', 'digitakt-mk2'])
    expect(merged.mods.map(item => item.id)).toEqual(['perform-direct'])
    expect(merged.revision).toMatch(/^[a-f0-9]{64}$/)
    expect(mergeCatalogOverlay(merged, overlay)).toEqual(merged)
    expect(() => mergeCatalogOverlay(base, { ...overlay, cores: [pin('core', 'digitakt-mk2', 'core-2.1.elemod', 'd'.repeat(64))] })).toThrow('changes the existing file')
    const forked = { ...overlay.mods[0], source: { repo: 'someone/modwerk', commit: 'f'.repeat(40), path: 'sdk/imports/packages/perform-direct/perform-direct-1.0.elemod' } }
    expect(() => mergeCatalogOverlay(base, { ...overlay, mods: [forked] })).toThrow('so source.repo is repeat98/modwerk, not someone/modwerk')
    expect(mergeCatalogOverlay(base, { ...overlay, mods: [{ ...forked, source: { ...forked.source, repo: 'repeat98/modwerk' } }] }).mods).toHaveLength(1)
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
  for (const path of [...noticePaths, 'LICENSE', 'LICENSES', 'scripts/elekloader-update.ts', 'scripts/elekloader-vendor.ts', 'scripts/licenses.mjs', 'scripts/license-notices.mjs', 'src/engine/elektron']) copy(path)  // the builder modules the scripts import
  // The module records that add Modwerk-built pins to the upstream catalog.
  for (const name of readdirSync(join(ROOT, 'sdk/imports')).filter(name => /^elekloader-.*\.json$/.test(name))) copy('sdk/imports/' + name)
  const manifest = JSON.parse(readFileSync(join(root, 'sdk/octabam/licenses/manifest.json'), 'utf8')) as { moduleComponents: Record<string, string[]> }
  for (const id of Object.keys(manifest.moduleComponents)) {
    const folder = `sdk/octatrack/modules/${id}`
    copy(folder + '/octamod.module.json')
    const document = JSON.parse(readFileSync(join(root, folder, 'octamod.module.json'), 'utf8')) as { license: { file: string } }
    copy(folder + '/' + document.license.file)
  }
  for (const name of ['react', 'react-dom', 'scheduler']) copy(`node_modules/${name}/LICENSE`)
  for (const name of ['LICENSE', 'package.json']) copy(`node_modules/wavesurfer.js/${name}`)
  return root
}

function update(root: string, args: string[]) {
  return spawnSync(process.execPath, [join(root, 'scripts/elekloader-update.ts'), ...args], { cwd: root, encoding: 'utf8', timeout: 20_000 })
}

function identities(root: string) {
  return Object.fromEntries(noticePaths.flatMap(path => Object.entries(fileBytes(join(root, path))).map(([name, data]) => [path + '/' + name, sha(data)])))
}

// Each case runs the real CLI, up to 20 s per call: vitest's 5 s default timed out on loaded CI runners.
describe('elekloader update CLI', { timeout: 60_000 }, () => {
  it('keeps an identical catalog update unchanged', () => {
    const root = fixture()
    try {
      const catalogPath = join(root, 'update.json')
      writeFileSync(catalogPath, readFileSync(join(root, 'vendor/elekloader/upstream-catalog.json')))
      const before = identities(root)
      const result = update(root, [catalogPath])
      expect(result.status, result.stderr).toBe(0)
      const after = identities(root)
      expect(Object.keys(after).filter(k => after[k] !== before[k]).concat(Object.keys(before).filter(k => !(k in after)))).toEqual([])
    } finally { rmSync(root, { recursive: true, force: true }) }
  })
  it('refuses a catalog the builder cannot read before changing any installed file', () => {
    const root = fixture()
    try {
      const catalog = JSON.parse(readFileSync(join(root, 'vendor/elekloader/upstream-catalog.json'), 'utf8')) as { schema: number }
      catalog.schema = 2
      const catalogPath = join(root, 'update.json')
      writeFileSync(catalogPath, JSON.stringify(catalog))
      const before = identities(root)
      const result = update(root, [catalogPath])
      expect(result.status).toBe(1)
      expect(result.stderr).toContain('catalog schema 2: this builder reads schema 1')
      expect(identities(root)).toEqual(before)
    } finally { rmSync(root, { recursive: true, force: true }) }
  })
  it.each(['notice generation', 'vendor validation'])('restores the catalog, lock and all notices when %s fails', failure => {
    const root = fixture()
    try {
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
      // The update imports this module, so only its run as the final vendor check fails.
      else writeFileSync(script, readFileSync(script, 'utf8') + "\nif (process.argv[1]?.endsWith('elekloader-vendor.ts')) throw new Error('fixture validation failure')\n")
      const before = identities(root)
      const result = update(root, [catalogPath])
      expect(result.status).toBe(1)
      expect(result.stderr).toContain(failure === 'notice generation' ? 'fixture generation failure' : 'fixture validation failure')
      expect(identities(root)).toEqual(before)
    } finally { rmSync(root, { recursive: true, force: true }) }
  })
})
