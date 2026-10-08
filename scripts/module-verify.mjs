// Compare a module's builds in Modwerk's browser composer with native octabam, on your own Octatrack OS 1.40C.
//
//   npm run module:verify -- <module-id> --os <OCTATRACK_OS1.40C.bin> [--jobs N] [--image modwerk-source-tools]
//   npm run module:verify -- <module-id> --os <file> --check      # browser side only, against the committed record
//   npm run module:verify -- --all --os <file> --check            # every committed record, after a change to src/engine
//
// Native octabam runs in the pinned toolchain image, without network, with this checkout mounted read-only. It builds the
// coverage set from scripts/module-coverage.mjs. Each native result is cached by everything it depends on (SDK sources, the
// exporter, the image, the original OS and the menus), so a rerun after a browser-side fix builds nothing natively, and a
// rerun after a native fix builds only what changed. The result is written to sdk/native-comparisons/<id>.json: fingerprints
// only, never firmware bytes.
//
// The native work directory (default ~/.cache/modwerk-native, or MODWERK_NATIVE_HOME) holds a copy of sdk/octabam, the
// original MAIN OS extracted from your file and the cache. It stays on your computer; `--clean` deletes it.
import { createHash } from 'node:crypto'
import { spawn, execFileSync } from 'node:child_process'
import { cpSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { availableParallelism, homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { decodeFirmware } from '../src/engine/elek.ts'
import { AVAILABLE_MODULES } from '../src/catalog/availability.ts'
import { selectionConflicts } from '../src/catalog/selection-conflicts.ts'
import { parseModuleDocument } from '../src/catalog/module-contract.ts'
import { CATALOG_SOURCE } from '../src/catalog/modules.ts'
import { comparisonPool, coverageSelections, selectionKey } from './module-coverage.mjs'
import { moduleSourceFingerprint } from './module-source.mjs'
import { moduleNativeSourceSha256 } from './module-qualification.mjs'
import { refreshStaticDspMetadata } from './module-verify-metadata.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const args = process.argv.slice(2)
const option = name => { const i = args.indexOf(name); return i < 0 ? undefined : args[i + 1] }
const flag = name => args.includes(name)
const usage = 'Usage: npm run module:verify -- <module-id> --os <OCTATRACK_OS1.40C.bin> [--jobs N] [--image TAG] [--check] [--all] [--clean]'
const home = resolve(process.env.MODWERK_NATIVE_HOME ?? join(homedir(), '.cache', 'modwerk-native'))
if (flag('--clean')) { rmSync(home, { recursive: true, force: true }); console.log('Removed ' + home); process.exit(0) }
const positional = args.filter((arg, i) => !arg.startsWith('--') && !['--os', '--jobs', '--image'].includes(args[i - 1]))
const osFile = option('--os'), check = flag('--check'), all = flag('--all')
if (!osFile || (all ? positional.length : positional.length !== 1) || (all && !check)) throw new Error(usage + '\n(--all works with --check only)')
const sha = bytes => createHash('sha256').update(bytes).digest('hex')
const json = path => JSON.parse(readFileSync(path, 'utf8'))
const recordsFolder = join(root, 'sdk/native-comparisons'), recordPath = id => join(recordsFolder, id + '.json')

// The original OS, in memory. Only its hash leaves this process (into the native work directory as the extracted MAIN OS).
const original = decodeFirmware(readFileSync(osFile)).mainOs, originalSha = sha(original)
const expectedSha = json(join(root, 'src/engine/assets/stock-dsp-metadata.json')).sourceSha256
if (originalSha !== expectedSha) throw new Error('This is not the original Octatrack OS 1.40C (MAIN OS ' + originalSha.slice(0, 12) + ', expected ' + expectedSha.slice(0, 12) + ').')

/** Browser side: compose every recorded selection and compare it with native's fingerprints. */
async function compareRecord(id, selections) {
  const { defaultChoosers } = await import('../src/engine/choosers.ts')
  const { compareSelection } = await import('./native-comparison.mjs')
  const counts = { identical: 0, masked: 0, refused: 0 }, failures = []
  for (const row of selections) {
    const label = selectionKey(row.moduleIds, row.keepStockFx2)
    const menus = defaultChoosers(row.moduleIds, row.keepStockFx2, false)
    if (JSON.stringify({ fx1: menus.fx1, fx2: menus.fx2 }) !== JSON.stringify(row.menu)) { failures.push(label + ': the site would build different menus than native was given'); continue }
    const proof = row.native.refused !== undefined ? { moduleIds: row.moduleIds, error: row.native.refused } : { moduleIds: row.moduleIds, ...row.native }
    const result = await compareSelection(original, proof, menus)
    if (result.failure) failures.push(label + ': ' + result.failure)
    else { counts[result.verdict]++; row.result = result.verdict }
  }
  if (sha(original) !== originalSha) throw new Error('The original OS changed during composition.')
  console.log(`${id}: ${counts.identical + counts.masked} built and matching native (${counts.identical} identical outright, ${counts.masked} outside the platform writes), ${counts.refused} matching refusals, ${failures.length} mismatches, of ${selections.length} selections.`)
  if (failures.length) console.error(failures.slice(0, 40).map(line => '  ' + line).join('\n'))
  return { counts, failures }
}

async function rejectsChangedFirmware(id) {
  const { composeOs } = await import('../src/engine/compose-os.ts')
  const changed = original.slice(); changed[100] ^= 1
  try { await composeOs(changed, [id], undefined, { loader: false }) } catch (error) { if (/original|unmodified/.test(String(error))) return; throw error }
  throw new Error('A changed original OS was not refused.')
}

if (check) {
  const ids = all ? readdirSync(recordsFolder).filter(name => name.endsWith('.json')).map(name => name.slice(0, -5)) : positional
  let failed = false
  for (const id of ids) {
    const record = json(recordPath(id))
    if (record.originalOsSha256 !== originalSha) throw new Error(id + ': the record was made from a different original OS.')
    failed = (await compareRecord(id, record.selections)).failures.length > 0 || failed
  }
  await rejectsChangedFirmware(ids[0] ?? 'miniverb')
  if (failed) process.exitCode = 1
  else console.log('Browser composer matches the recorded native results; a changed original OS is refused; no firmware written.')
} else {
  const id = positional[0]
  if (!json(join(root, 'sdk/catalog.json')).modules.some(module => module.id === id)) throw new Error(id + ' is not in sdk/catalog.json. List it there first (docs/ADD_A_MODULE.md, step 4).')
  // Fingerprint the current source manifest: generated documents can still carry
  // the previous release's evidence paths while a new record is being prepared.
  const document = parseModuleDocument(json(join(root, 'sdk/octabam/modules', id, 'octamod.module.json')))
  if (!AVAILABLE_MODULES.some(module => module.id === id)) throw new Error(id + ' is paused; it is not offered, so it is not compared.')
  const image = option('--image') ?? 'modwerk-source-tools'
  let imageId
  try { imageId = execFileSync('docker', ['image', 'inspect', image, '--format', '{{.Id}}'], { encoding: 'utf8' }).trim() } catch {
    throw new Error('Docker image ' + image + ' not found. Build it once: docker build --file sdk/build/Dockerfile --tag modwerk-source-tools .')
  }
  const jobs = Math.max(1, Number(option('--jobs') ?? Math.min(8, availableParallelism())))
  const pool = comparisonPool(AVAILABLE_MODULES.map(module => module.id)), selections = coverageSelections(id, pool)

  // The private SDK: the reviewed sources (the exporter checks they equal this checkout's), the toolchain from the image, the
  // original MAIN OS, and octabam's compiler memo, which survives between runs.
  const octabam = join(home, 'octabam')
  for (const group of ['modules', 'platform', 'tools', 'dsp', 'licenses']) {
    rmSync(join(octabam, group), { recursive: true, force: true })
    cpSync(join(root, 'sdk/octabam', group), join(octabam, group), { recursive: true, filter: path => !/(__pycache__|\.pyc$|\.DS_Store$)/.test(path) })
  }
  // Resolves inside the container, where the image keeps the built DSP56300 tools.
  if (!lstatSync(join(octabam, 'vendor'), { throwIfNoEntry: false })) symlinkSync('/opt/toolchain/vendor', join(octabam, 'vendor'))
  mkdirSync(join(octabam, 'out/raw'), { recursive: true })
  writeFileSync(join(octabam, 'out/raw/section_3_MAIN_OS.bin'), original)
  const run = join(home, 'runs', String(process.pid)); rmSync(run, { recursive: true, force: true }); mkdirSync(run, { recursive: true })
  const container = (name, command) => new Promise((done, fail) => {
    const child = spawn('docker', ['run', '--rm', '--network', 'none', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges', '--read-only',
      '--tmpfs', '/tmp:rw,nosuid,nodev,size=1g', '--user', `${process.getuid()}:${process.getgid()}`, '--env', 'HOME=/tmp',
      '--mount', `type=bind,source=${root},target=/app,readonly`, '--mount', `type=bind,source=${home},target=/native`, image, ...command], { stdio: ['ignore', 'pipe', 'pipe'] })
    let tail = ''
    const show = chunk => { tail = (tail + chunk).slice(-6000); for (const line of String(chunk).split('\n')) if (/refused|identity captured|Appended|clean selections|records/.test(line)) console.log('  [' + name + '] ' + line.trim().slice(0, 140)) }
    child.stdout.on('data', show); child.stderr.on('data', show)
    child.on('close', code => code === 0 ? done() : fail(new Error(name + ' failed:\n' + tail)))
  })
  const exporter = ['python3', '-B', '/app/scripts/export-composition-proofs.py', '/native/octabam']
  const common = ['--app', '/app', '--vendored-sdk', '--static-stock', '--modules', pool.join(',')]

  // 1. Static DSP placement metadata: refresh before choosers.ts imports and
  // caches it. Missing entries could otherwise silently omit selected DSP code.
  console.log('Reading native static DSP metadata …')
  const staticFacts = await refreshStaticDspMetadata({ id, root, run, containerRun: '/native/runs/' + process.pid, container })

  // Chooser metadata: add or refresh this module's entry. Everything else must already match native.
  console.log('Reading native chooser metadata …')
  await container('metadata', [...exporter, '/native/runs/' + process.pid + '/metadata', ...common, '--metadata-only'])
  const metadataPath = join(root, 'src/engine/assets/chooser-metadata.json'), committed = json(metadataPath), native = json(join(run, 'metadata/chooser-metadata.json'))
  const differing = Object.keys(native).filter(key => !['modules', 'customIds'].includes(key) && JSON.stringify(native[key]) !== JSON.stringify(committed[key]))
  if (differing.length) throw new Error('Native chooser layout differs from src/engine/assets/chooser-metadata.json in ' + differing.join(', ') + '. That is a change to the shared builder, not to one module; compare it by hand.')
  const entry = native.modules.find(row => row.id === id), merged = structuredClone(committed)
  if (entry) merged.modules = [...merged.modules.filter(row => row.id !== id), entry].sort((a, b) => pool.indexOf(a.id) - pool.indexOf(b.id) || (pool.indexOf(a.id) < 0) - (pool.indexOf(b.id) < 0))
  merged.customIds = [...new Set([...committed.customIds, ...native.customIds])].sort((a, b) => a - b)
  // choosers.ts is first imported below, so the menus use what is written here.
  if (JSON.stringify(merged) !== JSON.stringify(committed)) { writeFileSync(metadataPath, JSON.stringify(merged, null, 2) + '\n'); console.log('Updated src/engine/assets/chooser-metadata.json for ' + id + '; commit it with the record.') }

  // 2. Native builds of the coverage set, from the cache where nothing they depend on changed.
  const { defaultChoosers } = await import('../src/engine/choosers.ts')
  const menus = Object.fromEntries(selections.map(({ ids, keepStockFx2 }) => { const menu = defaultChoosers(ids, keepStockFx2, false); return [selectionKey(ids, keepStockFx2), { fx1: menu.fx1, fx2: menu.fx2 }] }))
  const inputs = sha(JSON.stringify({ sdk: await moduleSourceFingerprint(root), exporter: sha(readFileSync(join(root, 'scripts/export-composition-proofs.py'))), staticExporter: sha(readFileSync(join(root, 'scripts/export-static-dsp.py'))), staticFacts: sha(JSON.stringify(staticFacts)), loader: false, imageId, originalSha, pool }))
  const cacheFile = key => join(home, 'cache', sha(inputs + key + JSON.stringify(menus[key])) + '.json')
  const missing = selections.filter(({ ids, keepStockFx2 }) => !existsSync(cacheFile(selectionKey(ids, keepStockFx2))))
  console.log(`${selections.length} selections in the coverage set for ${id}; ${selections.length - missing.length} cached, ${missing.length} to build natively with ${jobs} jobs …`)
  if (missing.length) {
    writeFileSync(join(run, 'menus.json'), JSON.stringify(menus))
    // Analog BD builds take minutes, so they start first; the rest are dealt out in turn.
    const ordered = [...missing].sort((a, b) => b.ids.includes('analog-bassdrum') - a.ids.includes('analog-bassdrum'))
    const shards = Array.from({ length: Math.min(jobs, ordered.length) }, (_, shard) => ordered.filter((_, i) => i % jobs === shard))
    await Promise.all(shards.map((shard, i) => container('native ' + (i + 1), [...exporter, '/native/runs/' + process.pid + '/' + i, ...common, '--cache', '--menus', '/native/runs/' + process.pid + '/menus.json',
      ...shard.flatMap(({ ids, keepStockFx2 }) => ['--select', ids.join('+') + ':' + keepStockFx2])])))
    mkdirSync(join(home, 'cache'), { recursive: true })
    for (let i = 0; i < shards.length; i++) for (const proof of json(join(run, String(i), 'static-composition-proofs.json')).proofs) writeFileSync(cacheFile(selectionKey(proof.moduleIds, proof.keepStockFx2)), JSON.stringify(proof))
  }

  // 3. Declaration checks: every selection of the offered modules needs one (src/catalog/compatibility.test.ts).
  const checks = json(join(root, 'src/catalog/native-metadata.json')).checks, others = pool.filter(module => module !== id)
  // Only selections the configurator allows need a clean declaration record.
  // Known refused selections have no clean record and must not trigger the same exhaustive scan on every rerun.
  const unrecorded = Array.from({ length: 2 ** others.length }, (_, mask) => [...others.filter((_, bit) => mask >> bit & 1), id].sort()).filter(ids => !selectionConflicts(ids).length).map(ids => ids.join('+')).filter(key => !(key in checks))
  if (unrecorded.length) {
    console.log(`Recording native declaration checks for ${unrecorded.length} selections …`)
    await container('checks', ['python3', '-B', '/app/scripts/export-native-checks.py', '/native/octabam', '--app', '/app', '--include', id, '--scope', others.join(','), '--write', '--output', '/native/runs/' + process.pid + '/native-metadata.json'])
    const written = join(run, 'native-metadata.json')
    if (existsSync(written)) writeFileSync(join(root, 'src/catalog/native-metadata.json'), readFileSync(written))
  }

  // 4. The browser side, then the record.
  const rows = selections.map(({ ids, keepStockFx2 }) => {
    const proof = json(cacheFile(selectionKey(ids, keepStockFx2)))
    return { moduleIds: ids, keepStockFx2, menu: { fx1: proof.menu.fx1, fx2: proof.menu.fx2 }, native: proof.error ? { refused: proof.error } : { bytes: proof.bytes, osSha256: proof.osSha256, maskedOsSha256: proof.maskedOsSha256, ...(proof.platformArena ? { platformArena: true } : {}) } }
  })
  const { counts, failures } = await compareRecord(id, rows)
  await rejectsChangedFirmware(id)
  rmSync(run, { recursive: true, force: true })
  if (failures.length) { process.exitCode = 1; console.error('Not recorded: fix the differences above and run this again. Cached native results are reused.') }
  else {
    mkdirSync(recordsFolder, { recursive: true })
    writeFileSync(recordPath(id), JSON.stringify({
      schemaVersion: 1, moduleId: id, moduleVersion: document.version, moduleSourceSha256: await moduleNativeSourceSha256(join(root, 'sdk/octabam/modules', id), document),
      revision: CATALOG_SOURCE.revision, originalOsSha256: originalSha, pool,
      summary: { selections: rows.length, built: counts.identical + counts.masked, identicalOutright: counts.identical, identicalOutsidePlatformWrites: counts.masked, refused: counts.refused, mismatches: 0 },
      selections: rows,
    }, null, 2) + '\n')
    console.log('Recorded sdk/native-comparisons/' + id + '.json. A changed original OS is refused; no firmware written to this checkout.')
  }
}
