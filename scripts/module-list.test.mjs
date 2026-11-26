import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { Refusal, dspFigures, gitBlob, listModules } from './module-list.mjs'

// A minimal checkout: two listed DSP effects (one on the DARK REV donor, one on SPRING REV), a stock-id replacement in the
// recipes, a ColdFire module, and the draft "desk", a port with upstream/ files, shaped as Mackity was on 25 November 2026.
const A = 'a'.repeat(64), B = 'b'.repeat(64), C = 'c'.repeat(64), E = 'e'.repeat(64), F = 'f'.repeat(64)
const REV = 'e718c9bcfcdd736deeddb08bffe6bce2aa8e0eea'
const BUILD = `ORDER = ['dark', 'tape']
REQUESTED = ['cf-thing']

def main():
        descriptor_guards = list(baseline['descriptor-recipes.json']['recipes'])
        if not any(row['id'] == 'tape' for row in descriptor_guards):
            descriptor_guards.append(dict(id='tape', key='TAPE ECHO', author='someone',
                fxId=0x0f, donorAddress=0x400d575e,
                donorSha256='${B}',
                fx2Slot=0x400d6018,
                slotSha256='${F}'))
        for old in descriptor_guards:
            module = byid[old['id']]
`
const MANIFEST = kind => `"""DESK -- a desk input stage.

An old note said fx2_id=0x04 and donor_desc=0x400d0000; neither counts.
"""
from remix.schema import Kind, MenuEntry, Module

MODULE = Module(
    name="desk",
    key="DESK",
    kind=Kind.${kind},
    category=Category.TRACK, author="someone", author_url="https://github.com/someone",
    menu=MenuEntry(
        fx2_id=0x1a,                  # a free non-stock id; fx2_id=0x05 in a comment does not count
        donor_desc=0x400d58b8,        # DARK REV
        abbr=b"DESK",
        fullname=b"Desk",
    ),
)
`
const TESTING = 'Built with `npm run module:dev -- desk --build-only --cycles 600` first, then from this\nfolder with `npm run module:dev -- desk --build-only --cycles 226\n--cycles-kind executed --state 32` (208 DSP words).\n'
const NOTES = '[\n  {\n    "version": "0.1.0-experimental",\n    "date": "2026-11-25",\n    "changes": ["First release."]\n  }\n]\n'
const CPP = 'int desk(int x) { return x; }\n', LICENSE = 'hello\n'

let root
const write = (path, text) => { mkdirSync(dirname(join(root, path)), { recursive: true }); writeFileSync(join(root, path), text) }
const read = path => readFileSync(join(root, path), 'utf8')
const json = path => JSON.parse(read(path))
const out = value => JSON.stringify(value, null, 2) + '\n'
function snapshot() {
  const files = {}
  const walk = folder => {
    for (const entry of readdirSync(join(root, folder), { withFileTypes: true })) {
      const path = folder ? folder + '/' + entry.name : entry.name
      if (entry.isDirectory()) walk(path)
      else files[path] = readFileSync(join(root, path), 'base64')
    }
  }
  walk('')
  return files
}
function draft({ kind = 'DSP_EFFECT', manifest = MANIFEST(kind), testing = TESTING, id = 'desk' } = {}) {
  write(`sdk/drafts/${id}/manifest.py`, manifest)
  write(`sdk/drafts/${id}/octamod.module.json`, out({ id, key: 'DESK', name: 'Desk', version: '0.1.0-experimental', author: { github: 'someone' },
    source: { repository: 'https://github.com/airwindows/airwindows', revision: REV, path: 'plugins/LinuxVST/src/Desk' } }))
  write(`sdk/drafts/${id}/CHANGELOG.json`, NOTES)
  write(`sdk/drafts/${id}/TESTING.md`, testing)
  write(`sdk/drafts/${id}/desk.asm`, '; code\n')
  write(`sdk/drafts/${id}/upstream/Desk.cpp`, CPP)
  write(`sdk/drafts/${id}/upstream/LICENSE`, LICENSE)
  for (const name of ['qualification.example.json', 'resource-impact.example.json']) write(`sdk/drafts/${id}/${name}`, '{}\n')
}
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'modwerk-module-list-'))
  write('sdk/catalog.json', out({ schemaVersion: 1, modules: [
    { id: 'dark', version: '0.2.0', addedAt: '2026-10-01T00:00:00Z' }, { id: 'tape', version: '0.1.0', addedAt: '2026-10-02T00:00:00Z' },
    { id: 'cf-thing', version: '0.1.0', addedAt: '2026-10-03T00:00:00Z' }] }))
  write('scripts/build-module-packages.py', BUILD)
  write('src/engine/assets/descriptor-recipes.json', out({ schema: 1, recipes: [
    { id: 'dark', key: 'DARK', fxId: 0x17, donorAddress: 0x400d58f0, donorSha256: A, fx2Slot: 0x400d6038, slotSha256: F },
    { id: 'comp', key: 'COMP', fxId: 0x18, donorAddress: 0x400d5a82, donorSha256: C, fx2Slot: 0x400d603c, slotSha256: E }] }))
  write('sdk/octabam/tools/remix/schema.py', 'STOCK_FX2_IDS = frozenset({0x04, 0x05, 0x08, 0x0c, 0x0d, 0x10, 0x11, 0x12,\n                           0x13, 0x14, 0x15, 0x16, 0x18, 0x19, 0x1c})\n')
  write('sdk/octabam/tools/remix/stock.py', '    _stock("SPRING REV", "spring", 0x15, 0x400d5726, b"SPRG", b"SPRING REV",\n    _stock("DARK REV", "dark", 0x16, 0x400d58b8, b"DARK", b"DARK REV", 1067,\n')
  write('src/engine/assets/octatrack-module-packages.json', out({ packages: [
    { id: 'dark', slots: 'fx2', cycles: 300, cyclesKind: 'executed', state: 64, buffer: 100, version: '0.2.0', path: 'octatrack-modules/dark/0.2.0.mwrm' },
    { id: 'cf-thing', octabam: true, version: '0.1.0', path: 'octatrack-modules/cf-thing/0.1.0.mwrm' }], usbAudio: {} }))
  write('sdk/octabam/licenses/manifest.json', out({ schemaVersion: 1, components: [{ id: 'airwindows', name: 'Airwindows Chorus', spdx: 'MIT', noticeFile: 'airwindows.txt',
    sources: [{ url: `https://raw.githubusercontent.com/airwindows/airwindows/${REV}/LICENSE`, revision: REV, path: 'LICENSE' }], usedIn: ['modules/chorus: Chorus'] }],
    moduleComponents: { chorus: ['airwindows'], other: ['elsewhere'] } }))
  write('src/community/module-changelogs/dark.json', '[]\n')
  draft()
})
afterEach(() => rmSync(root, { recursive: true, force: true }))

function list(ids = ['desk'], options = {}) {
  const lines = [], ran = [], doctored = []
  const promise = listModules(root, ids, { addedAt: '2026-11-25T08:23:53Z', log: line => lines.push(line), run: (_, script) => { ran.push(script); return 0 },
    doctor: (_, id) => { doctored.push(id); return { ok: true, output: '' } }, ...options })
  return { promise, lines, ran, doctored }
}

describe('module:list', () => {
  it('does the listing steps Mackity took by hand', async () => {
    const { promise, ran, doctored } = list()
    await promise
    expect(doctored).toEqual(['desk'])
    // The folder, its release notes and the scaffold's examples.
    expect(existsSync(join(root, 'sdk/drafts/desk'))).toBe(false)
    expect(read('sdk/octatrack/modules/desk/desk.asm')).toBe('; code\n')
    for (const name of ['qualification.example.json', 'resource-impact.example.json', 'CHANGELOG.json']) expect(existsSync(join(root, 'sdk/octatrack/modules/desk', name))).toBe(false)
    expect(read('src/community/module-changelogs/desk.json')).toBe(NOTES)
    // The catalogue entry after the last DSP effect.
    expect(json('sdk/catalog.json').modules.map(item => item.id)).toEqual(['dark', 'tape', 'desk', 'cf-thing'])
    expect(json('sdk/catalog.json').modules[2]).toEqual({ id: 'desk', version: '0.1.0-experimental', addedAt: '2026-11-25T08:23:53Z' })
    // ORDER and the guard: DARK REV's descriptor + 0x38, the FX2 table + 4 * 0x1a, and the hashes recorded for both.
    const build = read('scripts/build-module-packages.py')
    expect(build.split('\n')[0]).toBe("ORDER = ['dark', 'tape', 'desk']")
    expect(build).toContain(`        if not any(row['id'] == 'desk' for row in descriptor_guards):
            # The DARK REV donor and stock NONE at unused FX2 id 0x1a, with the hashes the effects above recorded for
            # them (npm run module:list); the build checks both against the private OS 1.40C. Never retain stock bytes.
            descriptor_guards.append(dict(id='desk', key='DESK', author='someone',
                fxId=0x1a, donorAddress=0x400d58f0,
                donorSha256='${A}',
                fx2Slot=0x400d6044,
                slotSha256='${F}'))
        for old in descriptor_guards:
`)
    // The package row after the last DSP effect's, with the figures of the last module:dev command in TESTING.md.
    const packages = json('src/engine/assets/octatrack-module-packages.json').packages
    expect(packages.map(row => row.id)).toEqual(['dark', 'desk', 'cf-thing'])
    expect(packages[1]).toEqual({ id: 'desk', slots: 'both', cycles: 226, cyclesKind: 'executed', state: 32, buffer: 0, version: '0.1.0-experimental', path: 'octatrack-modules/desk/0.1.0-experimental.mwrm' })
    // The import record: licence last, at the repository root; git's blob id of "hello\n" is ce013625.
    const digest = text => createHash('sha256').update(text).digest('hex')
    expect(json(`sdk/imports/desk-${REV.slice(0, 7)}.json`)).toEqual({ schemaVersion: 1, repository: 'https://github.com/airwindows/airwindows', revision: REV,
      moduleVersion: '0.1.0-experimental', root: 'sdk/octabam/modules/desk', modules: ['desk'], files: [
        { path: 'upstream/Desk.cpp', sourcePath: 'plugins/LinuxVST/src/Desk/Desk.cpp', sourceBytes: CPP.length, sourceGitBlob: gitBlob(Buffer.from(CPP)), sourceSha256: digest(CPP), vendoredSha256: digest(CPP) },
        { path: 'upstream/LICENSE', sourcePath: 'LICENSE', sourceBytes: 6, sourceGitBlob: 'ce013625030ba8dba906f756967f9e9ca394464a', sourceSha256: digest(LICENSE), vendoredSha256: digest(LICENSE) }] })
    // The licence entry under the component that names the same repository.
    const licences = json('sdk/octabam/licenses/manifest.json')
    expect(licences.components[0].usedIn).toEqual(['modules/chorus: Chorus', 'modules/desk: Desk'])
    expect(Object.entries(licences.moduleComponents)).toEqual([['chorus', ['airwindows']], ['desk', ['airwindows']], ['other', ['elsewhere']]])
    expect(ran).toEqual(['licenses:generate', 'modules:generate'])
  })

  it('changes nothing when run again', async () => {
    await list().promise
    const before = snapshot(), again = list()
    await again.promise
    expect(snapshot()).toEqual(before)
    expect(again.lines[0]).toBe('desk: listed already; nothing to change.')
    expect(again.ran).toEqual([])
    expect(again.doctored).toEqual([])
  })

  it('prints what it would change on a dry run and changes nothing', async () => {
    const before = snapshot(), run = list(['desk'], { dryRun: true })
    await run.promise
    expect(snapshot()).toEqual(before)
    expect(run.ran).toEqual([])
    const text = run.lines.join('\n')
    expect(text).toContain('Desk (desk), would change:')
    expect(text).toContain('move sdk/drafts/desk/ to sdk/octatrack/modules/desk/')
    expect(text).toContain('sdk/catalog.json: desk 0.1.0-experimental, added 2026-11-25T08:23:53Z')
    expect(text).toContain('descriptor guard fxId 0x1a, donor 0x400d58f0 (DARK REV), FX2 slot 0x400d6044')
    expect(text).toContain('226 executed cycles, 32 state words, buffer 0 (from TESTING.md: npm run module:dev -- desk --build-only --cycles 226 --cycles-kind executed --state 32)')
    expect(text).toContain('Dry run: nothing changed.')
    expect(text).toContain('npm run octatrack:module-packages')
  })

  it('takes the DSP figures from the options over TESTING.md', async () => {
    await list(['desk'], { figures: { cycles: '250', 'cycles-kind': 'hardware', state: '40', slots: 'fx2', buffer: '2048' } }).promise
    const row = json('src/engine/assets/octatrack-module-packages.json').packages.find(item => item.id === 'desk')
    expect(row).toMatchObject({ slots: 'fx2', cycles: 250, cyclesKind: 'hardware', state: 40, buffer: 2048 })
  })

  it('reads the last module:dev command that gives --cycles', () => {
    expect(dspFigures(TESTING, 'desk')).toMatchObject({ cycles: 226, cyclesKind: 'executed', state: 32, slots: 'both', buffer: 0 })
    expect(() => dspFigures('Not measured.', 'desk')).toThrow(/give --cycles, --cycles-kind, --state/)
  })

  it('lists a hybrid FX2 effect as it lists a DSP effect, its package row marked octabam', async () => {
    rmSync(join(root, 'sdk/drafts/desk'), { recursive: true }); draft({ kind: 'HYBRID' })
    await list().promise
    expect(read('scripts/build-module-packages.py').split('\n')[0]).toBe("ORDER = ['dark', 'tape', 'desk']")
    expect(read('scripts/build-module-packages.py')).toContain("descriptor_guards.append(dict(id='desk'")
    expect(json('src/engine/assets/octatrack-module-packages.json').packages.find(row => row.id === 'desk')).toEqual({ id: 'desk', slots: 'both', cycles: 226,
      cyclesKind: 'executed', state: 32, buffer: 0, octabam: true, version: '0.1.0-experimental', path: 'octatrack-modules/desk/0.1.0-experimental.mwrm' })
  })
  const refused = async (pattern, options, ids) => {
    const before = snapshot()
    await expect(list(ids, options).promise).rejects.toThrow(pattern)
    await expect(list(ids, options).promise).rejects.toBeInstanceOf(Refusal)
    expect(snapshot()).toEqual(before)
  }
  it('refuses a ColdFire module', async () => {
    rmSync(join(root, 'sdk/drafts/desk'), { recursive: true }); draft({ kind: 'CF_PATCH' })
    await refused(/CF_PATCH module .*lists DSP effects and hybrid FX2 effects only/)
    rmSync(join(root, 'sdk/drafts/desk'), { recursive: true }); draft({ manifest: MANIFEST('HYBRID').replace(/ {4}menu=MenuEntry\([\s\S]*?\n {4}\),\n/, '') })
    await refused(/HYBRID module .*with no FX2 MenuEntry/)
  })
  it('refuses a missing draft', () => refused(/No draft named nope under sdk\/drafts/, {}, ['nope']))
  it('refuses a draft of a listed id', async () => {
    draft({ id: 'dark', manifest: MANIFEST('DSP_EFFECT').replace('name="desk"', 'name="dark"') })
    await refused(/dark is listed already \(sdk\/catalog.json\)/, {}, ['dark'])
  })
  it('refuses a draft whose experimental doctor lines are red', () =>
    refused(/has red experimental lines[\s\S]*✗ ui claims/, { doctor: () => ({ ok: false, output: '  ✗ ui claims           none declared\n' }) }))
  it('refuses a donor without a verified hash', async () => {
    rmSync(join(root, 'sdk/drafts/desk'), { recursive: true }); draft({ manifest: MANIFEST('DSP_EFFECT').replace('donor_desc=0x400d58b8', 'donor_desc=0x400d5000') })
    await refused(/donor descriptor at 0x400d5000, so its guard \(0x400d5038\) has no verified hash. Clone a donor one does \(DARK REV 0x400d58b8, the descriptor 0x400d5a4a, SPRING REV 0x400d5726\)/)
  })
  it('refuses an FX2 id another module holds or a stock one', async () => {
    rmSync(join(root, 'sdk/drafts/desk'), { recursive: true }); draft({ manifest: MANIFEST('DSP_EFFECT').replace('fx2_id=0x1a,', 'fx2_id=0x17,') })
    await refused(/FX2 id 0x17 is already dark's/)
    rmSync(join(root, 'sdk/drafts/desk'), { recursive: true }); draft({ manifest: MANIFEST('DSP_EFFECT').replace('fx2_id=0x1a,', 'fx2_id=0x15,') })
    await refused(/FX2 id 0x15 belongs to a stock effect/)
  })
  it('refuses DSP figures it cannot find', async () => {
    rmSync(join(root, 'sdk/drafts/desk'), { recursive: true }); draft({ testing: 'Not measured.\n' })
    await refused(/desk: give --cycles, --cycles-kind, --state/)
  })
})
