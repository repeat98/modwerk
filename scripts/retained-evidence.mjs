// Reuse reviewed evidence only when the module's own source, evidence and shipped
// package rows remain identical. Git objects and submitted files are read as data;
// native source is never evaluated.
import { execFileSync } from 'node:child_process'
import { readFile, readdir, mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve, dirname } from 'node:path'
import { isDeepStrictEqual } from 'node:util'
import { engineAsset, otherModuleIds } from './engine-asset.mjs'
import { parseModuleDocument } from '../src/catalog/module-contract.ts'
import { compareModuleVersions } from '../src/catalog/versions.ts'
import { requireModuleDocumentation } from './module-documentation.mjs'

const assets = 'src/engine/assets'
const git = (root, ...args) => execFileSync('git', args, { cwd: root, maxBuffer: 32 * 1024 * 1024 })
const text = (root, ...args) => git(root, ...args).toString('utf8')
const ignored = path => /(^|\/)(__pycache__|\.DS_Store)(\/|$)|\.pyc$/.test(path)

function tree(root, commit, prefix) {
  const rows = text(root, 'ls-tree', '-rz', commit, '--', prefix).split('\0').filter(Boolean).map(row => {
    const tab = row.indexOf('\t'), [mode, type, object] = row.slice(0, tab).split(' '), path = row.slice(tab + 1)
    if (ignored(path)) return null
    if (type !== 'blob' || !['100644', '100755'].includes(mode)) throw new Error('Retained evidence requires regular files: ' + path)
    return { object, path }
  }).filter(Boolean)
  const entries = new Map()
  if (!rows.length) return entries
  // Read the whole tree in one process; one git show per file made the static
  // fast path spend most of its time starting Git.
  const blobs = execFileSync('git', ['cat-file', '--batch'], { cwd: root, input: rows.map(row => row.object).join('\n') + '\n', maxBuffer: 32 * 1024 * 1024 })
  let offset = 0
  for (const row of rows) {
    const end = blobs.indexOf(10, offset), header = blobs.toString('ascii', offset, end).split(' '), size = Number(header[2])
    if (end < offset || header[0] !== row.object || header[1] !== 'blob' || !Number.isSafeInteger(size) || size < 0 || end + size + 2 > blobs.length || blobs[end + size + 1] !== 10) throw new Error('Invalid approved Git object: ' + row.path)
    entries.set(row.path, blobs.subarray(end + 1, end + size + 1))
    offset = end + size + 2
  }
  return entries
}
async function currentFiles(folder, prefix = '') {
  const entries = new Map()
  for (const entry of await readdir(folder, { withFileTypes: true })) {
    const path = prefix + entry.name
    if (ignored(path)) continue
    if (entry.isSymbolicLink()) throw new Error('Retained evidence prohibits symlinks: ' + path)
    if (entry.isDirectory()) for (const [childPath, bytes] of await currentFiles(resolve(folder, entry.name), path + '/')) entries.set(childPath, bytes)
    else if (entry.isFile()) entries.set(path, await readFile(resolve(folder, entry.name)))
    else throw new Error('Retained evidence requires regular files: ' + path)
  }
  return entries
}
function runtimeFields(document) {
  // Keep resource/compatibility claims, controls, provenance, build restrictions
  // and test results. The allowlist removes only fields with no runtime effect.
  const { name, version, category, author, presentation, access, license, media, ...runtime } = document
  void name; void version; void category; void author; void presentation; void access; void license; void media
  const { retainedEvidence, summary, ...tests } = runtime.tests
  void retainedEvidence; void summary
  return { ...runtime, controls: document.controls.map(({ doc, ...control }) => { void doc; return control }), tests }
}
function editorial(path, document) {
  // Evidence, runtime data and unknown extensions are protected even inside docs/media.
  // An unmeasured metric has no measurements to freeze in the README. Its
  // unchanged declaration remains protected by runtimeFields; measured reports
  // and the original testing record still require byte-identical evidence.
  const metricReports = [document.resources.storage, document.resources.processing]
    .filter(metric => metric.source !== 'README.md' || metric.method !== 'unmeasured' || metric.value !== null)
    .map(metric => metric.source)
  const reports = new Set([document.tests.report, ...metricReports,
    ...Object.values(document.resources.impact ?? {}).flatMap(value => value?.source ? [value.source] : []),
    ...(document.tests.qualification ? [...document.tests.qualification.cycles.map(c => c.report), document.tests.qualification.memory.report, document.tests.qualification.hardware.report] : []),
    ...(document.tests.releaseWaiver ? [document.tests.releaseWaiver.report] : [])])
  if (reports.has(path)) return false
  return path === 'octamod.module.json' || path === 'README.md' || /^docs\/.*\.md$/i.test(path)
    || /^(LICENSE|LICENCE|COPYING)(\..*)?$/i.test(path)
    || /^media\/.*\.(png|jpg|jpeg|webp|svg|wav|mp3|ogg)$/i.test(path)
}
function sameFiles(previous, current, skip, label, compare = (a, b) => a.equals(b), preserved = () => false) {
  const paths = new Set([...previous.keys(), ...current.keys()])
  for (const path of paths) {
    if (skip(path)) continue
    const before = previous.get(path), after = current.get(path)
    if (!(before && after && compare(before, after, path)) && !preserved(before, after, path)) throw new Error(label + ': runtime, resource or evidence input changed: ' + path + '; full qualification is required')
  }
}

// The rows of a browser asset that belong to one module, with its version label.
function ownRows(value, id) {
  const rows = []
  const visit = item => {
    if (!item || typeof item !== 'object') return
    if (!Array.isArray(item) && (item.id === id || item.moduleId === id || [item.ids, item.moduleIds].some(list => Array.isArray(list) && list.includes(id)))) { rows.push(item); return }
    for (const child of Object.values(item)) visit(child)
  }
  visit(value)
  return { version: value?.moduleVersions?.[id] ?? null, rows }
}

export async function requireRetainedEvidence(root, folder, document, baseline, waivers, qualify, options = {}) {
  const record = document.tests.retainedEvidence
  const label = document.id + '.tests.retainedEvidence'
  const approvedRef = options.approvedRef ?? 'origin/main'
  // A submitted commit is not an approval. It must already belong to the PR's
  // approved base, or origin/main for local generation and release validation.
  try { git(root, 'merge-base', '--is-ancestor', record.commit, approvedRef) }
  catch { throw new Error(label + ': evidence commit must belong to the approved main history; fetch origin/main or pass the exact PR base') }
  const prefix = 'sdk/octabam/modules/' + document.id + '/'
  const files = tree(root, record.commit, prefix)
  const previous = parseModuleDocument(JSON.parse(files.get(prefix + 'octamod.module.json')?.toString('utf8') ?? 'null'))
  if (previous.id !== document.id || previous.version !== record.moduleVersion) throw new Error(label + ': prior module/version does not match the approved commit')
  if (previous.tests.retainedEvidence) throw new Error(label + ': reference the original reviewed evidence commit, not another retained-evidence update')
  const catalog = JSON.parse(text(root, 'show', record.commit + ':sdk/catalog.json'))
  if (!catalog.modules.some(item => item.id === previous.id && item.version === previous.version)) throw new Error(label + ': evidence can only be retained from an already published catalog version')
  if (compareModuleVersions(document.version, previous.version) <= 0) throw new Error(label + ': update requires a greater module version than the tested version')
  if (!isDeepStrictEqual(runtimeFields(previous), runtimeFields(document))) throw new Error(label + ': native declarations, control values, resource claims, compatibility, provenance or test evidence changed; full qualification is required')
  const relative = new Map([...files].map(([path, bytes]) => [path.slice(prefix.length), bytes]))
  sameFiles(relative, await currentFiles(folder), path => editorial(path, previous) && editorial(path, document), label,
    (before, after, path) => before.equals(after) || path === 'README.md'
      // Some original modules use their README as the resource report. Keep
      // that entire approved record exact, while allowing new documentation
      // after it. TESTING and every other measured report remain immutable.
      && previous.tests.report !== path
      && after.length > before.length && after.subarray(0, before.length).equals(before))
  // Shared runtime, platform and build code are covered by the app's tests and
  // native matrices, as for every other module, so changing them does not void
  // this module's evidence. Its own rows in the browser assets (package bytes,
  // placement, native proofs) are what it ships, so those stay frozen.
  const otherIds = await otherModuleIds(root, document, record.commit)
  const before = tree(root, record.commit, assets)
  const after = new Map([...await currentFiles(resolve(root, assets))].map(([path, bytes]) => [assets + '/' + path, bytes]))
  for (const path of new Set([...before.keys(), ...after.keys()])) {
    if (!path.endsWith('.json')) continue
    const own = bytes => bytes ? ownRows(engineAsset(bytes, path, document, previous.version, [], otherIds), document.id) : ownRows(null, document.id)
    if (!isDeepStrictEqual(own(before.get(path)), own(after.get(path)))) throw new Error(label + ': this module\'s package rows changed: ' + path + '; full qualification is required')
  }
  // Revalidate the original qualification/baseline/owner exception on its exact
  // folder. Never turn historical or waived evidence into a new hardware pass.
  const temporary = await mkdtemp(resolve(tmpdir(), 'octamod-retained-evidence.'))
  try {
    for (const [path, bytes] of relative) {
      await mkdir(dirname(resolve(temporary, path)), { recursive: true })
      await writeFile(resolve(temporary, path), bytes)
    }
    await qualify(temporary, previous, baseline, waivers)
  } finally { await rm(temporary, { recursive: true, force: true }) }
  await requireModuleDocumentation(folder, document, previous.version)
  return 'retained-evidence'
}
