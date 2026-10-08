import { describe, expect, it } from 'vitest'
import { createHash } from 'node:crypto'
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'
import { compiledModuleVersions, moduleSourcePaths, moduleSourceFingerprint, sourceEntryHash, isDocumentationPath } from './module-source.mjs'
const root = fileURLToPath(new URL('../', import.meta.url))
const catalog = JSON.parse(await readFile(resolve(root, 'sdk/catalog.json'), 'utf8'))
const requested = ['analog-bassdrum', 'midi-scenes', 'usb-audio-out-tracks-main-cue', 'quantizer', 'synth', 'vector']
const verifiedRequested = requested.filter(id => id !== 'midi-scenes')
describe('release package scope and reviewed source inventory', () => {
  it('keeps the committed release identity bound to the complete SDK source and compiler', async () => {
    const record = JSON.parse(await readFile(resolve(root, 'src/engine/assets/module-build.json'), 'utf8'))
    expect(record.sourceTreeSha256).toBe(await moduleSourceFingerprint(root))
    expect(record.compilerSha256).toBe(createHash('sha256').update(await readFile(resolve(root, 'scripts/build-module-packages.py'))).digest('hex'))
    expect(record.moduleVersions).toEqual(await compiledModuleVersions(root, catalog))
  })
  it('binds approved standalone MIDI Scenes without compiling its archived 8.2 port', async () => {
    const versions = await compiledModuleVersions(root, catalog), paths = await moduleSourcePaths(root)
    expect(Object.keys(versions)).toEqual(['spectrum', 'modulation', 'character', 'miniverb', 'tapeecho', 'euclid', 'repitch', 'tapehead', ...requested.filter(id => id !== 'vector'),'previewvol','cc-map','sidechain-compressor','vector','playmodes','mute-modes','recorder-loop-fix','shimmer'])
    for (const id of ['playmodes', 'mute-modes', 'recorder-loop-fix']) {
      expect(versions[id]).toBe('0.1.0-experimental')
      expect(paths).toContain('modules/' + id + '/manifest.py')
    }
    expect(versions['midi-scenes']).toBe('0.2.4-experimental')
    expect(versions.miniverb).toBe('0.2.0-experimental')
    expect(versions.shimmer).toBe('0.1.0-experimental')
    expect(paths).toContain('modules/shimmer/engine.asm')
    expect(paths).toContain('modules/shimmer/manifest.py')
    for (const id of verifiedRequested) {
      expect(versions[id]).toBe(id === 'vector' ? '0.2.3-experimental' : id === 'synth' ? '0.1.2-experimental' : id === 'usb-audio-out-tracks-main-cue' ? '0.2.0-experimental' : '0.1.2-experimental')
      expect(paths).toContain('modules/' + id + '/manifest.py')
    }
    expect(paths).toContain('modules/midi-scenes/recipe.json')
    expect(paths.some(path=>path.startsWith('modules/midi-scenes/upstream/'))).toBe(false)
    expect(paths).toContain('platform/usb-midi/manifest.py')
  })
  it('refuses stale and duplicate catalog pins for requested imports', async () => {
    const temporary = await mkdtemp(resolve(tmpdir(), 'octamod-scope-test.'))
    try {
      const id = requested[0], folder = resolve(temporary, 'sdk/octabam/modules', id)
      await mkdir(folder, { recursive: true })
      await writeFile(resolve(folder, 'octamod.module.json'), await readFile(resolve(root, 'sdk/octabam/modules', id, 'octamod.module.json')))
      const entry = catalog.modules.find(module => module.id === id)
      await expect(compiledModuleVersions(temporary, { modules: [{ ...entry, version: '0.1.0-experimental' }] })).rejects.toThrow('Stale catalog module version')
      await expect(compiledModuleVersions(temporary, { modules: [entry, entry] })).rejects.toThrow('Invalid catalog module id')
    } finally { await rm(temporary, { recursive: true, force: true }) }
  })
  it('compiles new catalog inserts without adding a module-specific recipe or accepting unknown donor bytes', () => {
    const result = JSON.parse(execFileSync('python3', ['-B', '-c', `
import importlib.util, json, sys
from types import SimpleNamespace as N
spec=importlib.util.spec_from_file_location('compiler',sys.argv[1]); c=importlib.util.module_from_spec(spec); spec.loader.exec_module(c)
regular, additional, requested=c.catalog_insert_scope(c.ORDER+c.REQUESTED+c.UTILITIES+c.HOOKED+['new-insert'])
assert regular==c.ORDER+['new-insert'] and additional==['new-insert']
assert requested==[id for id in c.REQUESTED if id!='midi-scenes']
template=dict(id='existing',key='EXISTING',author='someone',fxId=23,donorAddress=0x4038,donorSha256='a'*64,fx2Slot=0x505c,slotSha256='b'*64,inheritedEnable=[1,2],rawPointers=[{'unit':'foreign','symbol':'foreign'}],replaces='FOREIGN')
module=N(key='NEW_INSERT',author='someone',menu=N(donor_desc=0x4000,fx2_id=30))
native=N(FX2_IDS=0x5000,FX1_NONE=0x6000)
recipes=c.descriptor_templates([template],additional,{'new-insert':module},native)
assert recipes[0]==template and recipes[1]['id']=='new-insert'
assert recipes[1]['donorSha256']=='a'*64 and recipes[1]['fx2Slot']==0x5078
assert recipes[1]['slotSha256']==c.HASH((0x6000).to_bytes(4,'big'))
assert not {'inheritedEnable','rawPointers','replaces'} & recipes[1].keys()
assert c.descriptor_templates(recipes,additional,{'new-insert':module},native)==recipes
try: c.descriptor_templates(recipes+[recipes[1]],additional,{'new-insert':module},native)
except ValueError as error: assert 'duplicate descriptor recipe' in str(error)
else: raise AssertionError('duplicate recipe accepted')
module.menu.donor_desc=0x7000
try: c.descriptor_templates([template],additional,{'new-insert':module},native)
except ValueError as error: assert 'verified guard metadata' in str(error)
else: raise AssertionError('unverified donor accepted')
module.menu.donor_desc=0x4000; module.menu.fx2_id=23
try: c.descriptor_templates([template],additional,{'new-insert':module},native)
except ValueError as error: assert 'already claimed' in str(error)
else: raise AssertionError('duplicate effect ID accepted')
print(json.dumps({'scope':'catalog inserts','guards':'known donor and unique ID'}))
`, resolve(root, 'scripts/build-module-packages.py')], { encoding: 'utf8' }))
    expect(result).toEqual({ scope: 'catalog inserts', guards: 'known donor and unique ID' })
  })
})

// Owner decision, 5 October 2026: packages and approvals bind to the code a compiler reads, not to documentation or media.
describe('the code fingerprint', () => {
  const manifest = { id: 'demo', version: '0.1.0', key: 'DEMO', author: { github: 'someone', name: 'Some One' }, source: { repository: 'https://github.com/a/b', revision: 'a'.repeat(40), path: 'modules/demo' }, compatibility: { effectId: 24, location: 'FX1' }, build: { status: 'pending', reason: 'Waiting.' }, presentation: { summary: 'Original words.' }, tests: { summary: 'Original.' } }
  const files = (overrides = {}) => ({ 'modules/demo/manifest.py': 'NAME = "demo"\n', 'modules/demo/demo.asm': ' nop\n', 'modules/demo/octamod.module.json': JSON.stringify(manifest), 'modules/demo/README.md': 'Words.\n', 'modules/demo/TESTING.md': 'Results.\n', 'modules/demo/LICENSE': 'MIT\n', 'modules/demo/media/a.png': 'png', 'modules/demo/presentation/thumbnail.svg': '<svg/>', 'modules/demo/evidence/report.json': '{}', 'modules/demo/upstream/NOTES.md': 'notes', 'platform/p.s': ' nop\n', 'tools/t.py': 'x=1\n', 'dsp/d.asm': ' nop\n', 'licenses/l.txt': 'MIT\n', ...overrides })
  async function tree(overrides) {
    const dir = await mkdtemp(resolve(tmpdir(), 'octamod-fingerprint-'))
    for (const [path, text] of Object.entries(files(overrides))) { const target = resolve(dir, 'sdk/octabam', path); await mkdir(resolve(target, '..'), { recursive: true }); await writeFile(target, text) }
    return dir
  }
  const edit = (change) => JSON.stringify({ ...manifest, ...change })
  async function fingerprint(overrides) { const dir = await tree(overrides); try { return await moduleSourceFingerprint(dir) } finally { await rm(dir, { recursive: true }) } }
  it('does not change when documentation, media, evidence or manifest prose is edited', async () => {
    const base = await fingerprint({})
    for (const overrides of [
      { 'modules/demo/README.md': 'Better words.\n' }, { 'modules/demo/TESTING.md': 'More results.\n' }, { 'modules/demo/upstream/NOTES.md': 'changed' },
      { 'modules/demo/media/a.png': 'other png' }, { 'modules/demo/media/b.png': 'new png' }, { 'modules/demo/presentation/thumbnail.svg': '<svg><g/></svg>' }, { 'modules/demo/evidence/report.json': '{"a":1}' },
      { 'modules/demo/octamod.module.json': edit({ presentation: { summary: 'Rewritten.' }, tests: { summary: 'Rewritten.' }, author: { github: 'someone', name: 'Renamed' }, build: { status: 'pending', reason: 'Other words.' } }) },
    ]) expect(await fingerprint(overrides), JSON.stringify(Object.keys(overrides))).toBe(base)
  })
  it('changes when anything a compiler reads is edited', async () => {
    const base = await fingerprint({}), seen = new Set([base])
    for (const overrides of [
      { 'modules/demo/demo.asm': ' nop\n nop\n' }, { 'modules/demo/manifest.py': 'NAME = "other"\n' }, { 'modules/demo/LICENSE': 'GPL\n' }, { 'platform/p.s': ' rts\n' }, { 'tools/t.py': 'x=2\n' }, { 'dsp/d.asm': ' rts\n' }, { 'licenses/l.txt': 'GPL\n' },
      { 'modules/demo/extra.s': ' nop\n' },
      { 'modules/demo/octamod.module.json': edit({ version: '0.1.1' }) }, { 'modules/demo/octamod.module.json': edit({ key: 'OTHER' }) }, { 'modules/demo/octamod.module.json': edit({ author: { github: 'another', name: 'Some One' } }) },
      { 'modules/demo/octamod.module.json': edit({ source: { repository: 'https://github.com/a/b', revision: 'b'.repeat(40), path: 'modules/demo' } }) },
      { 'modules/demo/octamod.module.json': edit({ compatibility: { effectId: 25, location: 'FX1' } }) }, { 'modules/demo/octamod.module.json': edit({ build: { status: 'verified' } }) },
    ]) { const value = await fingerprint(overrides); expect(seen.has(value), JSON.stringify(Object.keys(overrides)) + ' must change the fingerprint').toBe(false); seen.add(value) }
  })
  it('classifies only module documentation as documentation', () => {
    for (const path of ['modules/a/README.md', 'modules/a/upstream/x/README.md', 'modules/a/media/x.png', 'modules/a/presentation/thumbnail.svg', 'modules/a/evidence/r.json', 'modules/a/qualification.example.json']) expect(isDocumentationPath(path), path).toBe(true)
    for (const path of ['modules/a/manifest.py', 'modules/a/octamod.module.json', 'modules/a/LICENSE', 'modules/a/media', 'modules/a/tools/probe.py', 'platform/usb-midi/README.md', 'licenses/NOTICE.txt', 'tools/remix/README.md']) expect(isDocumentationPath(path), path).toBe(false)
  })
  it('is computed identically by the Python compiler and the Node importer', async () => {
    const dir = await tree({ 'modules/demo/octamod.module.json': JSON.stringify({ ...manifest, author: { github: 'someone', name: 'Jannik Aßfalg' } }) })
    try {
      const python = JSON.parse(execFileSync('python3', ['-B', '-c', `
import importlib.util, json, sys
from pathlib import Path
spec = importlib.util.spec_from_file_location('compiler', sys.argv[1]); module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module)
print(json.dumps(module.source_hashes(Path(sys.argv[2]) / 'sdk/octabam')))`, resolve(root, 'scripts/build-module-packages.py'), dir], { encoding: 'utf8' }))
      const node = {}
      for (const path of await moduleSourcePaths(dir)) node[path] = await sourceEntryHash(dir, path)
      expect(python).toEqual(node)
      expect(Object.keys(node)).not.toContain('modules/demo/README.md')
    } finally { await rm(dir, { recursive: true }) }
  })
})
