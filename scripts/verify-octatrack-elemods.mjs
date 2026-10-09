// SPDX-License-Identifier: GPL-3.0-or-later
// Private format-2 migration proof: the kit owns linking, patching, packing and verification.
// No import of Modwerk's Octabam composer. No firmware enters CI or the checkout.
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { basename, dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { sha } from '../vendor/elekloader/kit/src/bytes.ts'
import { loadAny } from '../vendor/elekloader/kit/src/patch.ts'
import { ElekFile } from '../vendor/elekloader/kit/src/elek.ts'
import { createService } from '../vendor/elekloader/kit/src/kit/serve.ts'
import { BUILDER_SOURCE, prepareLocalBuild } from '../src/engine/elekloader/machine-build.ts'

const [input, directory, upstream, ...args] = process.argv.slice(2)
const pairs = args.includes('--pairs'), paths = args.filter(arg => arg !== '--pairs').map(path => resolve(path))
if (!input || !directory || !upstream || !paths.length || args.some(arg => arg.startsWith('--') && arg !== '--pairs'))
  throw new Error('Usage: npm run octatrack:elekloader:verify -- stock-1.40C.bin NEW-private-directory elekloader-checkout core.elemod [module.elemod ...] [--pairs]')
const root = realpathSync(fileURLToPath(new URL('../', import.meta.url)))
const output = resolve(directory)
if (existsSync(output)) throw new Error('Choose a new private output directory.')
const parent = realpathSync(dirname(output)), destination = join(parent, basename(output))
const common = realpathSync(execFileSync('git', ['rev-parse', '--git-common-dir'], { cwd: root, encoding: 'utf8' }).trim())
const inside = (path, base) => { const name = relative(base, path); return name === '' || name !== '..' && !name.startsWith('..' + sep) && !name.startsWith(sep) }
if (inside(destination, root) || inside(destination, dirname(common))) throw new Error('Firmware output must be outside the repository and its worktrees.')
try { execFileSync('git', ['-C', parent, 'rev-parse', '--show-toplevel'], { stdio: 'pipe' }); throw new Error('Firmware output must be outside every Git checkout.') } catch (error) { if (!('status' in error)) throw error }
const nativeRoot = realpathSync(upstream)
assert.equal(execFileSync('git', ['rev-parse', 'HEAD'], { cwd: nativeRoot, encoding: 'utf8' }).trim(), BUILDER_SOURCE.commit, 'Python reference must be the kit-pinned commit')
assert.equal(execFileSync('git', ['status', '--porcelain', '--untracked-files=no'], { cwd: nativeRoot, encoding: 'utf8' }).trim(), '', 'Python reference must have no tracked edits')
const raw = new Uint8Array(readFileSync(input)), inputSha256 = sha(raw)
const packages = paths.map(path => {
  const data = new Uint8Array(readFileSync(path)), mod = loadAny({ path, data })
  assert.equal(mod.format, 2, 'Machine extensions must be linkable .elemods, not wrapped whole builds')
  assert.equal(mod.dev.key, 'octatrack'); assert.equal(mod.rel.version, '1.40C')
  return { path, id: mod.id, version: mod.version, sha256: sha(data), file: new File([data], basename(path)) }
})
const cores = packages.filter(mod => mod.id === 'core')
assert.equal(cores.length, 1, 'Supply exactly one Octatrack core')
assert.equal(new Set(packages.map(mod => mod.id)).size, packages.length, 'Module IDs must be unique')
const core = cores[0], modules = packages.filter(mod => mod !== core)
const selections = [[core], ...modules.map(mod => [core, mod])]
if (pairs) for (let a = 0; a < modules.length; a++) for (let b = a + 1; b < modules.length; b++) selections.push([core, modules[a], modules[b]])
mkdirSync(destination)
const emptyCatalog = new TextEncoder().encode(JSON.stringify({ schema: 1, kind: 'elekloader-catalog', revision: 'private-migration', cores: [], mods: [] }))
const nativeCheck = `import sys,json,hashlib
sys.path.insert(0,sys.argv[1])
from elekloader.patch import build,PatchError
try:
 outputs,manifest=build(sys.argv[2],sys.argv[3:],version='ELEKLOADER',log=lambda _:None)
 print(json.dumps({'ok':True,'hashes':{k:hashlib.sha256(v).hexdigest() for k,v in outputs.items()},'main_sha256':manifest['main_sha256'],'main_len':manifest['main_len']}))
except PatchError as e:
 print(json.dumps({'ok':False,'error':str(e)}))
`
const proofs = []
for (const selection of selections) {
  const ids = selection.map(mod => mod.id), label = ids.join('+')
  // Same service as the browser worker. The only fetch is this in-memory empty catalogue.
  const handle = createService(async url => { assert.equal(url, 'https://private.invalid/catalog.json'); return emptyCatalog })
  const call = (name, args = {}, data, progress) => handle({ call: name, args, data }, progress)
  const builder = {
    load: () => call('init', { base: 'https://private.invalid/' }),
    setStock: async file => call('set_stock', { name: file.name }, await file.arrayBuffer()),
    addMod: async file => call('add_mod', { name: file.name }, await file.arrayBuffer()),
    tick: (enabled, path) => call('tick', { enabled, path }),
    check: enabled => call('check', { enabled }),
    build: (enabled, version, name, log) => call('build', { enabled, version, name }, undefined, log),
  }
  const prepared = await prepareLocalBuild(builder, { machine: 'octatrack', release: '1.40C', stock: new File([raw], basename(input)), mods: selection })
  const native = JSON.parse(execFileSync('python3', ['-B', '-c', nativeCheck, nativeRoot, resolve(input), ...selection.map(mod => mod.path)], { encoding: 'utf8', maxBuffer: 1024 * 1024 }))
  if (!prepared.ok) {
    assert.equal(native.ok, false, label + ': TypeScript refuses but Python builds')
    const problems = prepared.check?.problems ?? [prepared.error]
    for (const problem of problems) assert(native.error.includes(problem), label + ': refusal details differ: ' + problem)
    proofs.push({ ids, status: 'matching-refusal', problems }); console.log(label + ': matching refusal'); continue
  }
  assert.equal(native.ok, true, label + ': Python refuses but TypeScript checks successfully')
  const built = await builder.build(prepared.enabled, 'ELEKLOADER', 'ELEKLOADER.syx')
  assert(built.ok, label + ': ' + built.error)
  const work = join(destination, ids.map(id => id.replace(/[^a-z0-9-]/g, '_')).join('_')); mkdirSync(work)
  const files = []
  for (const file of built.files.filter(file => /\.(bin|syx)$/.test(file.name))) {
    assert.equal(basename(file.name), file.name, 'plain output filename')
    const bytes = new Uint8Array(file.data), ext = file.name.split('.').pop()
    assert.equal(sha(bytes), file.sha256); assert.equal(file.sha256, native.hashes[ext], label + ': Python/TypeScript full-file parity')
    const parsed = new ElekFile(bytes)
    assert.equal(sha(parsed.section(3)), native.main_sha256); assert.equal(parsed.version, 'ELEKLOADER')
    const target = join(work, file.name); writeFileSync(target, bytes)
    assert.equal(sha(readFileSync(target)), file.sha256, 'saved candidate hash')
    files.push({ name: relative(destination, target), bytes: bytes.length, sha256: file.sha256 })
  }
  assert.equal(files.length, 2, 'both card and MIDI-recovery files')
  proofs.push({ ids, status: 'built', mainSha256: native.main_sha256, mainBytes: native.main_len, files, pythonParity: true, savedFilesVerified: true, hardware: 'not tested' })
  console.log(label + ': kit linked format-2 modules; Python/TypeScript files and saved hashes match')
}
assert.equal(sha(raw), inputSha256); assert.equal(sha(readFileSync(input)), inputSha256)
for (const mod of packages) assert.equal(sha(readFileSync(mod.path)), mod.sha256, 'source package unchanged')
const report = { schema: 1, kind: 'modwerk-octatrack-elemod-migration', builder: BUILDER_SOURCE, sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(), inputSha256, packages: packages.map(({ id, version, sha256 }) => ({ id, version, sha256 })), counts: { built: proofs.filter(proof => proof.status === 'built').length, refused: proofs.filter(proof => proof.status === 'matching-refusal').length }, productionReady: false, limitations: ['This comparison does not qualify mandatory logger/startup behaviour or exact selected-module identity.', 'Catalogue DSP/FX and USB/standalone ports remain incomplete.', 'No emulator or hardware qualification in this comparison; no physical reboot or live sampling observed.', 'No device-side WebUSB update transport.'], proofs }
writeFileSync(join(destination, 'proofs.json'), JSON.stringify(report, null, 2) + '\n')
console.log(JSON.stringify(report.counts) + '. Private report: ' + join(destination, 'proofs.json') + '. Production cutover remains pending.')
