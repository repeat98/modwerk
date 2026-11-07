// Private developer parity check for Sidechain Compressor. Reads the owner's own 1.40C update in memory; retains no firmware bytes.
//
// The proofs are native octabam images of every module selection that contains Sidechain Compressor, with and without the
// stock FX2 effects (scripts/export-composition-proofs.py --suite sidechain / sidechain-visible / sidechain-analog-bd). The browser composer always
// links the core logger, which native does not have, so the comparison is made on what native can produce:
//   * every selection native refuses is refused here, for the same reason class;
//   * every selection native builds is built here, and the module-owned writes (chooser, descriptors, ROM units, DSP payloads)
//     reproduce native's OS image byte for byte, except inside the platform writes (arena sizes, the boot call and runtime
//     detours), which depend on where the logger-bearing runtime links;
//   * where native has no runtime at all the image is identical outright;
//   * the platform and logger writes never touch a byte a module owns.
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import assert from 'node:assert/strict'
import { composeOs } from '../src/engine/compose-os.ts'
import { decodeFirmware } from '../src/engine/elek.ts'
import { defaultChoosers } from '../src/engine/choosers.ts'
import { planStaticOs } from '../src/engine/static-compose.ts'
import { applyGuardedOsWrites } from '../src/engine/os-patches.ts'
import { CATALOG_SOURCE } from '../src/catalog/modules.ts'
const [file, ...options] = process.argv.slice(2)
// --shard=i/n checks every n-th selection of each suite, so the larger suites can run in parallel.
const shard = options.find(option => /^--shard=\d+\/\d+$/.test(option))?.slice(8).split('/').map(Number) ?? [0, 1]
if (!file || options.length > 1 || (options.length === 1 && options[0] !== `--shard=${shard[0]}/${shard[1]}`) || shard[0] >= shard[1]) throw new Error('Usage: node scripts/verify-sidechain-native.mjs local-original-1.40C.bin [--shard=i/n]')
const visible = ['miniverb', 'tapeecho', 'euclid', 'repitch', 'tapehead', 'usb-audio-out-tracks-main-cue', 'quantizer', 'previewvol', 'cc-map']
const suites = [
  { name: 'the original eight modules', file: 'sidechain-composition-proofs.json', scope: ['spectrum', 'modulation', 'character', 'miniverb', 'tapeecho', 'euclid', 'repitch', 'tapehead', 'sidechain-compressor'], member: ids => ids.includes('sidechain-compressor'), expected: 512 },
  { name: 'the nine visible modules other than Analog BD', file: 'sidechain-visible-proofs.json', scope: [...visible, 'sidechain-compressor'], member: ids => ids.includes('sidechain-compressor'), expected: 1024 },
  // Analog BD combinations are now covered by verify-analog-bd-native.mjs.
]
const sha = bytes => createHash('sha256').update(bytes).digest('hex')
const source = readFileSync(file), original = decodeFirmware(source).mainOs, before = sha(original)
// A native refusal and the browser's wording for the same limit. Only the class has to agree.
const classes = [
  ['DSP region', /overruns the region/, /overruns the region/],
  ['menu space', /label formatters do not fit|wide dial hook|chooser list of|not free|past the stock zero run|fits neither the clone window|does not fit|do not fit/, /module menu cave exceeds|choosers need more space|does not fit|do not fit/],
  ['Analog BD', /stock effects only/, /stock effects only/],
]
const reasonClass = (text, side) => classes.find(row => row[side].test(text))?.[0] ?? 'unclassified'
for (const suite of suites) {
  const facts = JSON.parse(readFileSync(new URL('../src/engine/assets/' + suite.file, import.meta.url)))
  assert.equal(facts.schema, 1); assert.equal(facts.revision, CATALOG_SOURCE.revision); assert.equal(facts.staticStock, true)
  assert.equal(facts.sourceSha256, before, 'Use the same original OS 1.40C the proofs were made from.')
  const key = (ids, keep) => [...ids].sort().join('+') + ':' + keep
  const expected = new Set()
  for (let mask = 0; mask < 2 ** suite.scope.length; mask++) for (const keepStockFx2 of [true, false]) {
    const ids = suite.scope.filter((_, bit) => mask >> bit & 1)
    if (suite.member(ids)) expected.add(key(ids, keepStockFx2))
  }
  assert.equal(expected.size, suite.expected); assert.equal(facts.proofs.length, expected.size)
  const seen = new Set(), failures = []; let built = 0, identical = 0, masked = 0, refused = 0
  for (const [index, proof] of facts.proofs.entries()) {
    if (index % shard[1] !== shard[0]) continue
    const label = key(proof.moduleIds, proof.keepStockFx2)
    assert.ok(expected.has(label) && !seen.has(label), 'complete unique native coverage: ' + label); seen.add(label)
    const menus = defaultChoosers(proof.moduleIds, proof.keepStockFx2)
    assert.deepEqual(menus, { fx1: proof.menu.fx1, fx2: proof.menu.fx2 }, label + ': the site would build different menus than the proof')
    let plan, error
    try { plan = await planStaticOs(original, proof.moduleIds, menus); await composeOs(original, proof.moduleIds, menus, { loader: false }) } catch (caught) { error = caught instanceof Error ? caught.message : String(caught) }
    assert.equal(sha(original), before, 'The original OS changed during composition.')
    if (proof.error) {
      if (!error) failures.push(label + ': native refuses (' + proof.error.slice(0, 90) + ') but the browser built it')
      else if (reasonClass(proof.error, 1) !== reasonClass(error, 2) || reasonClass(error, 2) === 'unclassified') failures.push(label + ': refusal differs. native: ' + proof.error.slice(0, 90) + ' | browser: ' + error.slice(0, 90))
      else refused++
      continue
    }
    if (error) { failures.push(label + ': native builds it but the browser refused: ' + error.slice(0, 120)); continue }
    built++
    const owned = [...plan.menus.writes, ...plan.dsp.writes], other = [...plan.platform, ...plan.logging.writes.filter(w => !plan.logging.chained.some(c => c.address === w.address))] // a logger site handed on to the module's own detour (core-logger.ts chainedDetour)
    for (const a of owned) for (const b of other) if (a.address < b.address + b.bytes.length && b.address < a.address + a.bytes.length) failures.push(label + ': ' + b.note + ' overlaps ' + a.note)
    const image = await applyGuardedOsWrites(original, owned)
    if (proof.bytes === original.length) {
      if (sha(image) !== proof.osSha256) failures.push(label + ': the module-owned image differs from native, which has no runtime')
      else identical++
    }
    const platformSpans = plan.platform.map(write => [write.address - 0x40000400, write.bytes.length])
    const reset = image.slice()
    for (const [offset, length] of platformSpans) reset.set(original.subarray(offset, offset + length), offset)
    if (sha(reset) !== proof.maskedOsSha256) failures.push(label + ': the module-owned image differs from native outside the platform writes')
    else masked++
  }
  console.log(`${suite.name}: ${built} natively built selections (${identical} identical outright, ${masked} identical outside the platform writes), ${refused} matching refusals, ${failures.length} mismatches (${facts.proofs.length} selections).`)
  if (failures.length) { console.error(failures.slice(0, 40).join('\n')); process.exitCode = 1 }
}
assert.equal(sha(original), before)
const changed = original.slice(); changed[100] ^= 1
await assert.rejects(composeOs(changed, ['sidechain-compressor'], undefined, { loader: false }), /original|unmodified/)
if (!process.exitCode) console.log('Changed-firmware rejection passed; original unchanged; no firmware written.')
