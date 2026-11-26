// SPDX-License-Identifier: GPL-3.0-or-later
// List an Octatrack DSP effect, or a hybrid FX2 effect with ColdFire code: the mechanical steps of moving a draft from sdk/drafts/<id>/ into the library, in one command.
//
//   npm run module:list -- <id> [<id> ...]   moves each draft to sdk/octatrack/modules/<id>/ and its CHANGELOG.json to
//                                            src/community/module-changelogs/<id>.json, deletes the scaffold's examples, and
//                                            writes the catalogue entry, the build order, the descriptor guard, the package row
//                                            and, for a port with upstream/ files, the import record and the licence entry;
//                                            then npm run licenses:generate and modules:generate
//   --dry-run                                prints what it would change and changes nothing
//   --cycles N --cycles-kind executed|modeled|hardware --state N [--slots fx1|fx2|both] [--buffer N]
//                                            the DSP figures the unit tests used (module:dev's options). Default: the last
//                                            `npm run module:dev -- <id> ... --cycles` command in the module's TESTING.md
//   --added-at 2026-11-25T08:23:53Z          the catalogue entry's addedAt (default: now, UTC)
//   --upstream-dir DIR                       a clone of the port's upstream repository: the import record's source hashes are
//                                            read there at the recorded revision instead of from the vendored copies
//   --source-path upstream/FILE=PATH         where an upstream/ file sits in that repository (default: the manifest's
//                                            source.path/FILE, and a licence file at the repository root)
//
// Every check runs before anything is written, and the doctor's experimental lines must be green (module:doctor -- --draft).
// Running it again changes nothing. The steps that need Docker, the stock OS or the unit stay by hand; it prints them at the end
// (docs/ADD_A_MODULE.md, Octatrack). The descriptor guard's hashes are never made up: they are the ones the effects already listed
// recorded for the same stock donor and the same kind of FX2 slot, and a donor or slot without one is refused.
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { basename, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'

const ID = /^[a-z0-9]+(-[a-z0-9]+)*$/
const CYCLE_KINDS = ['executed', 'modeled', 'hardware'], SLOTS = ['fx1', 'fx2', 'both']
const SCAFFOLD_EXAMPLES = ['qualification.example.json', 'resource-impact.example.json']
// The ColdFire's FX2 id table (sdk/octabam/tools/remix/rig.py): an id's slot is the word at FX2_IDS + 4 * id. The build guards the
// donor descriptor from donor_desc + 0x38 (scripts/build-module-packages.py checks both against the manifest).
const FX2_IDS = 0x400d5fdc, DONOR_GUARD = 0x38
const BUILD = 'scripts/build-module-packages.py', CATALOG = 'sdk/catalog.json', RECIPES = 'src/engine/assets/descriptor-recipes.json'
const PACKAGES = 'src/engine/assets/octatrack-module-packages.json', LICENCES = 'sdk/octabam/licenses/manifest.json'
const SCHEMA = 'sdk/octabam/tools/remix/schema.py', STOCK = 'sdk/octabam/tools/remix/stock.py'
const GUARD_ANCHOR = '        for old in descriptor_guards:\n'
const LICENCE_FILE = /^(licen[cs]e|copying|notice)([.-].*)?$/i

export class Refusal extends Error {}
const refuse = message => { throw new Refusal(message) }
const hex = (value, width) => '0x' + value.toString(16).padStart(width, '0')
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex')
/** What `git hash-object` prints for these bytes. */
export const gitBlob = bytes => createHash('sha1').update(Buffer.concat([Buffer.from('blob ' + bytes.length + '\0'), bytes])).digest('hex')
const json = value => JSON.stringify(value, null, 2) + '\n'
const python = text => "'" + text.replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'"

/** The checkout as this run will leave it: reads see the planned writes, and nothing touches the disk until flush(). */
function tree(root) {
  const files = new Map(), moves = [], at = path => resolve(root, path)
  const read = path => {
    if (files.has(path)) { if (files.get(path) === null) throw new Error(path + ' is deleted by this run'); return files.get(path) }
    return readFileSync(at(path))
  }
  return {
    exists: path => files.has(path) ? files.get(path) !== null : existsSync(at(path)),
    read, text: path => read(path).toString('utf8'),
    list(folder) {
      const out = [], walk = path => {
        for (const entry of readdirSync(at(path), { withFileTypes: true })) {
          if (entry.isDirectory()) walk(path + '/' + entry.name)
          else out.push(path + '/' + entry.name)
        }
      }
      if (existsSync(at(folder))) walk(folder)
      return out.sort()
    },
    write: (path, data) => files.set(path, Buffer.from(data)),
    remove: path => files.set(path, null),
    move: (from, to) => moves.push([from, to]),
    flush() {
      for (const [from, to] of moves) { mkdirSync(dirname(at(to)), { recursive: true }); renameSync(at(from), at(to)) }
      for (const [path, data] of files) {
        if (data === null) rmSync(at(path), { force: true })
        else { mkdirSync(dirname(at(path)), { recursive: true }); writeFileSync(at(path), data) }
      }
    },
  }
}

/** The literal fields module:list needs from a manifest.py, comments and docstrings left out. */
export function manifestFacts(source) {
  const code = source.replace(/"""[\s\S]*?"""|'''[\s\S]*?'''/g, '').replace(/(^|\s)#.*$/gm, '$1')
  const field = (name, pattern) => code.match(new RegExp('\\b' + name + '\\s*=\\s*' + pattern))?.[1]
  const number = name => { const value = field(name, '(0x[0-9a-fA-F]+|\\d+)\\b'); return value === undefined ? undefined : Number(value) }
  return { kind: field('kind', 'Kind\\.(\\w+)'), key: field('key', '"([^"]*)"'), author: field('author', '"([^"]*)"'),
    fxId: number('fx2_id'), donor: number('donor_desc'), replaces: field('replaces', '"([^"]*)"') }
}

/** Every descriptor guard already recorded: the generated recipes and the dicts the build script appends. */
function recordedGuards(t) {
  const rows = JSON.parse(t.text(RECIPES)).recipes.map(({ id, fxId, donorAddress, donorSha256, fx2Slot, slotSha256 }) => ({ id, fxId, donorAddress, donorSha256, fx2Slot, slotSha256 }))
  const number = '(0x[0-9a-fA-F]+|\\d+)', hash = "'([0-9a-f]{64})'"
  const dict = new RegExp(`dict\\(id='([^']+)'[^)]*?fxId=${number},\\s*donorAddress=${number},\\s*donorSha256=${hash},\\s*fx2Slot=${number},\\s*slotSha256=${hash}`, 'g')
  for (const m of t.text(BUILD).matchAll(dict)) rows.push({ id: m[1], fxId: Number(m[2]), donorAddress: Number(m[3]), donorSha256: m[4], fx2Slot: Number(m[5]), slotSha256: m[6] })
  return rows
}

function stockFacts(t) {
  const ids = t.text(SCHEMA).match(/STOCK_FX2_IDS\s*=\s*frozenset\(\{([^}]*)\}\)/)
  if (!ids) refuse(`${SCHEMA} no longer has STOCK_FX2_IDS; module:list cannot tell stock FX2 ids from free ones.`)
  const names = new Map()
  if (t.exists(STOCK)) for (const m of t.text(STOCK).matchAll(/_stock\("([^"]+)",\s*"[^"]*",\s*(0x[0-9a-fA-F]+),\s*(0x[0-9a-fA-F]+)/g)) names.set(Number(m[3]), m[1])
  return { ids: new Set(ids[1].split(',').map(item => item.trim()).filter(Boolean).map(Number)), names }
}

const freeIds = (stock, rows) => Array.from({ length: 0x1c }, (_, i) => i + 4).filter(i => !stock.ids.has(i) && !rows.some(row => row.fxId === i)).map(i => hex(i, 2))
/** The FX2 ids in the build's range 0x04-0x1f that neither stock nor a listed module's recorded page guard holds. */
export function freeFx2Ids(root) { const t = tree(root); return freeIds(stockFacts(t), recordedGuards(t)) }

/** The guard's addresses from the manifest, and its hashes from guards already verified on the same donor and kind of slot. */
export function deriveGuard(t, id, facts) {
  if (facts.fxId === undefined || facts.donor === undefined) refuse(`${id}: manifest.py's MenuEntry gives no fx2_id or donor_desc as a number; module:list reads both from it.`)
  const stock = stockFacts(t), rows = recordedGuards(t).filter(row => row.id !== id)
  const fxId = facts.fxId, donorAddress = facts.donor + DONOR_GUARD, fx2Slot = FX2_IDS + 4 * fxId
  const free = freeIds(stock, rows)
  if (fxId < 0x04 || fxId > 0x1f) refuse(`${id}: FX2 id ${hex(fxId, 2)} is outside 0x04-0x1f.`)
  const taken = rows.find(row => row.fxId === fxId)
  if (taken) refuse(`${id}: FX2 id ${hex(fxId, 2)} is already ${taken.id}'s. Pick a free one in manifest.py (${free.join(', ') || 'none is left'}).`)
  const replacing = stock.ids.has(fxId)
  if (replacing && !facts.replaces) refuse(`${id}: FX2 id ${hex(fxId, 2)} belongs to a stock effect. Pick a free one (${free.join(', ') || 'none is left'}) or declare MenuEntry(replaces=...).`)
  const one = (values, what) => {
    const found = [...new Set(values)]
    if (found.length > 1) refuse(`${id}: the recorded guards disagree on ${what} (${found.join(', ')}); settle that before listing anything on it.`)
    return found[0]
  }
  const donorName = address => stock.names.get(address - DONOR_GUARD)
  const donors = [...new Set(rows.map(row => row.donorAddress))].map(address => `${donorName(address) ?? 'the descriptor'} ${hex(address - DONOR_GUARD, 8)}`)
  const donorSha256 = one(rows.filter(row => row.donorAddress === donorAddress).map(row => row.donorSha256), 'the donor at ' + hex(donorAddress, 8))
  if (!donorSha256) refuse(`${id}: no listed effect clones the donor descriptor at ${hex(facts.donor, 8)}, so its guard (${hex(donorAddress, 8)}) has no verified hash. Clone a donor one does (${donors.join(', ')}), or hash it on your own OS 1.40C and add the guard to ${BUILD} by hand.`)
  const slotSha256 = replacing
    ? one(rows.filter(row => row.fx2Slot === fx2Slot).map(row => row.slotSha256), 'the FX2 slot at ' + hex(fx2Slot, 8))
    : one(rows.filter(row => !stock.ids.has(row.fxId)).map(row => row.slotSha256), 'the stock NONE slot of unused ids')
  if (!slotSha256) refuse(replacing
    ? `${id}: no listed module replaces ${facts.replaces} yet, so its FX2 slot (${hex(fx2Slot, 8)}) has no verified hash. Hash it on your own OS 1.40C and add the guard to ${BUILD} by hand.`
    : `${id}: no listed effect sits on an unused FX2 id, so the stock NONE slot has no verified hash. Hash it on your own OS 1.40C and add the guard to ${BUILD} by hand.`)
  const slot = replacing ? `${facts.replaces}'s stock FX2 slot at id ${hex(fxId, 2)}` : `stock NONE at unused FX2 id ${hex(fxId, 2)}`
  return { fxId, donorAddress, donorSha256, fx2Slot, slotSha256, donor: donorName(donorAddress) ?? 'stock descriptor ' + hex(facts.donor, 8), slot }
}

export function guardBlock(id, facts, guard) {
  return [
    `        if not any(row['id'] == ${python(id)} for row in descriptor_guards):`,
    `            # The ${guard.donor} donor and ${guard.slot}, with the hashes the effects above recorded for`,
    `            # them (npm run module:list); the build checks both against the private OS 1.40C. Never retain stock bytes.`,
    `            descriptor_guards.append(dict(id=${python(id)}, key=${python(facts.key)}, author=${python(facts.author)},`,
    `                fxId=${hex(guard.fxId, 2)}, donorAddress=${hex(guard.donorAddress, 8)},`,
    `                donorSha256='${guard.donorSha256}',`,
    `                fx2Slot=${hex(guard.fx2Slot, 8)},`,
    `                slotSha256='${guard.slotSha256}'))`,
  ].join('\n') + '\n'
}

const ORDER_LINE = /^ORDER = \[([^\]\n]*)\]$/m
function buildOrder(t) {
  const m = t.text(BUILD).match(ORDER_LINE)
  if (!m) refuse(`${BUILD} has no one-line ORDER = [...]; add the id by hand.`)
  return [...m[1].matchAll(/'([^']+)'/g)].map(item => item[1])
}

/** The DSP figures the unit tests used: the options, else the last module:dev command with --cycles in TESTING.md. */
export function dspFigures(testing, id, given = {}) {
  let from = null, found = {}
  const text = testing.replace(/\s+/g, ' '), start = `npm run module:dev -- ${id} `
  for (let at = text.indexOf(start); at >= 0; at = text.indexOf(start, at + 1)) {
    const tokens = text.slice(at + start.length).split(/[`)]/)[0].trim().split(' '), options = {}
    for (let i = 0; i < tokens.length && tokens[i].startsWith('--'); i++) {
      const name = tokens[i].slice(2)
      if (['cycles', 'cycles-kind', 'state', 'slots', 'buffer'].includes(name) && tokens[i + 1] !== undefined && !tokens[i + 1].startsWith('--')) options[name] = tokens[++i].replace(/[.,;:]+$/, '')
    }
    if (options.cycles !== undefined) { found = options; from = (start + tokens.join(' ')).trim() }
  }
  const pick = name => given[name] ?? found[name]
  const figures = { slots: pick('slots') ?? 'both', cycles: pick('cycles'), cyclesKind: pick('cycles-kind'), state: pick('state'), buffer: pick('buffer') ?? '0' }
  const missing = [['cycles', 'cycles'], ['cycles-kind', 'cyclesKind'], ['state', 'state']].filter(([, key]) => figures[key] === undefined).map(([name]) => '--' + name)
  if (missing.length) refuse(`${id}: give ${missing.join(', ')} as the unit tests used them (npm run module:dev -- ${id} --cycles N --cycles-kind KIND --state N), or record that command in TESTING.md.`)
  const integer = (name, value, least) => { if (!/^\d+$/.test(String(value)) || Number(value) < least) refuse(`${id}: --${name} must be a whole number of at least ${least}, not ${value}.`); return Number(value) }
  if (!CYCLE_KINDS.includes(figures.cyclesKind)) refuse(`${id}: --cycles-kind must be ${CYCLE_KINDS.join(', ')}, not ${figures.cyclesKind}.`)
  if (!SLOTS.includes(figures.slots)) refuse(`${id}: --slots must be ${SLOTS.join(', ')}, not ${figures.slots}.`)
  return { slots: figures.slots, cycles: integer('cycles', figures.cycles, 1), cyclesKind: figures.cyclesKind, state: integer('state', figures.state, 1), buffer: integer('buffer', figures.buffer, 0), from }
}

const ownerRepo = url => { const m = /github(?:usercontent)?\.com\/([^/]+)\/([^/#?]+)/i.exec(url ?? ''); return m ? (m[1] + '/' + m[2].replace(/\.git$/, '')).toLowerCase() : null }

function upstreamBytes(dir, revision, path) {
  const result = spawnSync('git', ['-C', dir, 'cat-file', 'blob', revision + ':' + path], { maxBuffer: 1 << 28 })
  if (result.status !== 0) refuse(`${path} is not in ${dir} at ${revision}: ${String(result.stderr).trim()}`)
  return result.stdout
}

/** Plan one module: every change it needs, refused before anything is written. */
function plan(t, id, settings) {
  const draft = `sdk/drafts/${id}`, listed = `sdk/octatrack/modules/${id}`
  const entry = JSON.parse(t.text(CATALOG)).modules.find(item => item.id === id)
  const hasDraft = t.exists(draft), hasListed = t.exists(listed)
  if (hasDraft && (hasListed || entry)) refuse(`${id} is listed already (${entry ? CATALOG : listed}). Its next version is an update, not a listing: docs/MODULE_AUTHOR_UPDATES.md.`)
  if (!hasDraft && !(hasListed && entry)) refuse(`No draft named ${id} under sdk/drafts${hasListed ? ` (${listed} exists, but ${CATALOG} does not list it: move it back to ${draft} and run this again)` : ''}. Start one with npm run module:new.`)
  const folder = hasDraft ? draft : listed, changes = [], notes = []
  if (!t.exists(folder + '/manifest.py') || !t.exists(folder + '/octamod.module.json')) refuse(`${id} is not an Octatrack DSP module: ${folder} needs manifest.py and octamod.module.json.`)
  const facts = manifestFacts(t.text(folder + '/manifest.py')), doc = JSON.parse(t.text(folder + '/octamod.module.json'))
  // A HYBRID effect (a DSP effect with ColdFire code beside it, as BBD, Tape Echo and Midiverb) lists the same way, its row marked octabam.
  const hybrid = facts.kind === 'HYBRID' && /\bmenu\s*=\s*MenuEntry\(/.test(t.text(folder + '/manifest.py'))
  if (facts.kind !== 'DSP_EFFECT' && !hybrid) refuse(`${id} is a ${facts.kind ?? 'unknown'} module (manifest.py kind=Kind.${facts.kind ?? '?'}${facts.kind === 'HYBRID' ? ' with no FX2 MenuEntry' : ''}); module:list lists DSP effects and hybrid FX2 effects only. List it by hand: docs/ADD_A_MODULE.md, Octatrack, step 4.`)
  if (doc.id !== id) refuse(`${folder}/octamod.module.json names ${doc.id}, not ${id}.`)
  if (doc.key !== facts.key || doc.author?.github !== facts.author) refuse(`${id}: octamod.module.json's key and author (${doc.key}, ${doc.author?.github}) differ from manifest.py's (${facts.key}, ${facts.author}); the build refuses that.`)
  const version = doc.version

  // 1. The folder, the release notes and the scaffold's examples.
  const notesFile = `src/community/module-changelogs/${id}.json`
  if (hasDraft) {
    changes.push(`move ${draft}/ to ${listed}/`); t.move(draft, listed)
    for (const name of SCAFFOLD_EXAMPLES) if (t.exists(`${draft}/${name}`)) { changes.push(`delete the scaffold's ${name}`); t.remove(`${listed}/${name}`) }
  } else for (const name of SCAFFOLD_EXAMPLES) if (t.exists(`${listed}/${name}`)) changes.push(`delete the scaffold's ${name}`)
  const draftNotes = `${folder}/CHANGELOG.json`
  if (t.exists(draftNotes)) {
    const bytes = t.read(draftNotes)
    if (t.exists(notesFile) && !t.read(notesFile).equals(bytes)) refuse(`${id}: both ${draftNotes} and ${notesFile} exist and differ; keep one.`)
    changes.push(`move ${draftNotes} to ${notesFile}`)
    if (hasDraft) { t.write(notesFile, bytes); t.remove(`${listed}/CHANGELOG.json`) }
  }
  if (hasDraft) {
    let releases = null
    try { releases = JSON.parse(t.text(t.exists(draftNotes) ? draftNotes : notesFile)) } catch { /* refused below */ }
    if (!Array.isArray(releases) || !releases.some(item => item?.version === version)) refuse(`${id}: no release notes for ${version}. Write them in ${draftNotes} first (docs/ADD_A_MODULE.md, Release notes).`)
  } else if (!t.exists(notesFile)) changes.push(`release notes ${notesFile}`)

  // 2. The catalogue entry, after the last DSP effect.
  const order = buildOrder(t)
  if (!entry) {
    const catalog = JSON.parse(t.text(CATALOG))
    const after = catalog.modules.findLastIndex(item => order.includes(item.id))
    catalog.modules.splice(after < 0 ? catalog.modules.length : after + 1, 0, { id, version, addedAt: settings.addedAt })
    changes.push(`${CATALOG}: ${id} ${version}, added ${settings.addedAt}`); t.write(CATALOG, json(catalog))
  }

  // 3. The build order and the descriptor guard.
  if (!order.includes(id)) {
    changes.push(`${BUILD}: ${id} at the end of ORDER`)
    t.write(BUILD, t.text(BUILD).replace(ORDER_LINE, `ORDER = [${[...order, id].map(item => `'${item}'`).join(', ')}]`))
  }
  if (!t.text(BUILD).includes(`if not any(row['id'] == ${python(id)} for row in descriptor_guards):`) && !recordedGuards(t).some(row => row.id === id)) {
    const guard = deriveGuard(t, id, facts), source = t.text(BUILD)
    if (!source.includes(GUARD_ANCHOR)) refuse(`${BUILD} changed shape (no "${GUARD_ANCHOR.trim()}"); add ${id}'s descriptor guard by hand.`)
    t.write(BUILD, source.replace(GUARD_ANCHOR, guardBlock(id, facts, guard) + GUARD_ANCHOR))
    changes.push(`${BUILD}: descriptor guard fxId ${hex(guard.fxId, 2)}, donor ${hex(guard.donorAddress, 8)} (${guard.donor}), FX2 slot ${hex(guard.fx2Slot, 8)}`)
  }

  // 4. The package row, after the last DSP effect's; octatrack:module-packages completes it.
  const packages = JSON.parse(t.text(PACKAGES))
  if (!packages.packages.some(row => row.id === id)) {
    const figures = dspFigures(t.exists(folder + '/TESTING.md') ? t.text(folder + '/TESTING.md') : '', id, settings.figures)
    const { from, ...dsp } = figures
    const row = { id, slots: dsp.slots, cycles: dsp.cycles, cyclesKind: dsp.cyclesKind, state: dsp.state, buffer: dsp.buffer, ...(hybrid ? { octabam: true } : {}), version, path: `octatrack-modules/${id}/${version}.mwrm` }
    const after = packages.packages.findLastIndex(item => order.includes(item.id))
    packages.packages.splice(after < 0 ? packages.packages.length : after + 1, 0, row)
    t.write(PACKAGES, json(packages))
    changes.push(`${PACKAGES}: ${dsp.slots}, ${dsp.cycles} ${dsp.cyclesKind} cycles, ${dsp.state} state words, buffer ${dsp.buffer}` + (from ? ` (from TESTING.md: ${from})` : ''))
  }

  // 5. A port: the import record of its upstream/ files and its licence entry.
  const upstream = t.list(folder + '/upstream')
  let licences = false
  if (upstream.length) {
    const source = doc.source ?? {}, repository = source.repository, revision = source.revision
    if (!repository || !/^[0-9a-f]{40}$/.test(revision ?? '')) refuse(`${id} has upstream/ files, so its octamod.module.json needs source.repository and the full 40-character source.revision.`)
    const recordPath = `sdk/imports/${id}-${revision.slice(0, 7)}.json`
    if (!hasListed || !t.exists(recordPath)) {
      const paths = upstream.map(path => path.slice(folder.length + 1))
      const unknown = Object.keys(settings.sourcePaths).filter(path => !paths.includes(path))
      if (unknown.length) refuse(`${id}: --source-path names ${unknown.join(', ')}, which ${folder} does not have.`)
      const licence = path => LICENCE_FILE.test(basename(path)) && path.split('/').length === 2
      const files = [...paths.filter(path => !licence(path)), ...paths.filter(licence)].map(path => {
        const vendored = t.read(folder + '/' + path), rest = path.slice('upstream/'.length)
        const sourcePath = settings.sourcePaths[path] ?? (licence(path) ? rest : source.path ? `${source.path}/${rest}` : refuse(`${id}: the manifest's source block has no path; give --source-path ${path}=PATH.`))
        const original = settings.upstreamDir ? upstreamBytes(settings.upstreamDir, revision, sourcePath) : vendored
        return { path, sourcePath, sourceBytes: original.length, sourceGitBlob: gitBlob(original), sourceSha256: sha256(original), vendoredSha256: sha256(vendored) }
      })
      const record = json({ schemaVersion: 1, repository, revision, moduleVersion: version, root: `sdk/octabam/modules/${id}`, modules: [id], files })
      if (t.exists(recordPath) && t.text(recordPath) !== record) refuse(`${id}: ${recordPath} exists and differs from what module:list would write; remove it or finish it by hand.`)
      if (!t.exists(recordPath)) {
        t.write(recordPath, record)
        changes.push(`${recordPath}: ${files.map(file => `${file.path} from ${file.sourcePath}`).join(', ')}`)
        const edited = files.filter(file => file.sourceSha256 !== file.vendoredSha256).map(file => file.path)
        notes.push(settings.upstreamDir
          ? `The source hashes were read in ${settings.upstreamDir} at ${revision.slice(0, 7)}${edited.length ? `; ${edited.join(', ')} differ from upstream` : ''}.`
          : `The import record takes the upstream/ files as unchanged copies of ${repository} at ${revision.slice(0, 7)}; give --upstream-dir with a clone of it to hash upstream's own files.`)
      }
    }
    const manifest = JSON.parse(t.text(LICENCES)), repo = ownerRepo(repository)
    const components = manifest.components.filter(component => (component.sources ?? []).some(item => ownerRepo(item.url) === repo))
    const usedIn = `modules/${id}: ${doc.name}`
    if (components.length !== 1) notes.push(components.length
      ? `${LICENCES}: ${components.map(c => c.id).join(' and ')} all name ${repository}; add ${id} to the right one's usedIn and to moduleComponents by hand, then npm run licenses:generate.`
      : `${LICENCES} has no component for ${repository}: add one (its notice file in sdk/octabam/licenses/, sources, usedIn "${usedIn}") and moduleComponents.${id}, then npm run licenses:generate.`)
    else {
      const component = components[0]
      if (!component.usedIn.some(line => line === usedIn || line.startsWith(`modules/${id}:`) || line === `modules/${id}`)) { component.usedIn.push(usedIn); licences = true }
      if (!(manifest.moduleComponents[id] ?? []).includes(component.id)) {
        const entries = Object.entries(manifest.moduleComponents).filter(([key]) => key !== id)
        const after = entries.findLastIndex(([, ids]) => ids.includes(component.id))
        entries.splice(after < 0 ? entries.length : after + 1, 0, [id, [...(manifest.moduleComponents[id] ?? []), component.id]])
        manifest.moduleComponents = Object.fromEntries(entries); licences = true
      }
      if (licences) {
        t.write(LICENCES, json(manifest))
        changes.push(`${LICENCES}: ${id} under ${component.id} ("${usedIn}")`)
        notes.push(`The licence component's name reads "${component.name}"; rename it if it should name ${doc.name} too, then npm run licenses:generate.`)
      }
    }
  }
  return { id, name: doc.name, draft: hasDraft, changes, notes, licences }
}

function runDoctor(root, id) {
  const result = spawnSync(process.execPath, ['scripts/module-doctor.mjs', '--draft', id], { cwd: root, encoding: 'utf8', maxBuffer: 1 << 26 })
  return { ok: result.status === 0, output: (result.stdout ?? '') + (result.stderr ?? '') }
}
function runScript(root, script) {
  return spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', '-s', script], { cwd: root, stdio: 'inherit' }).status ?? 1
}

const NEXT_STEPS = ids => [
  'Still by hand (docs/ADD_A_MODULE.md, Octatrack, steps 4-8):',
  '1. Commit, then compile the packages from the clean checkout (the output folder must not exist yet) and commit what the import changes:',
  '     image=$(docker image inspect modwerk-source-tools --format \'{{.Id}}\')',
  '     bash scripts/build-modules-isolated.sh . ../module-packages "$image"',
  '     npm run modules:import -- ../module-packages/packages --development',
  '2. npm run octatrack:module-packages: builds the USB package and completes the package row (abi, module, bytes, sha256).',
  '3. Re-pin Tape Echo\'s and Euclid\'s standalone recipes to the new asset files; npm run check fails until they are.',
  '4. The qualification record (tests.qualification, docs/MODULE_QUALIFICATION.md) and the unit evidence, then npm run modules:generate.',
  '5. A port whose author has no GitHub login here: the display author in DISPLAY_AUTHORS, src/catalog/module-authors.ts.',
  `6. ${ids.map(id => `npm run module:doctor -- ${id}`).join(', ')}, then npm run pr:ready.`,
]

/** List the drafts `ids`. Refuses (Refusal) before writing anything; returns the plans. */
export async function listModules(root, ids, options = {}) {
  const { dryRun = false, figures = {}, upstreamDir = null, sourcePaths = {}, log = console.log, doctor = runDoctor, run = runScript } = options
  const addedAt = options.addedAt ?? new Date().toISOString().replace(/\.\d+Z$/, 'Z')
  if (!ids.length || ids.some(id => !ID.test(id))) refuse('Usage: npm run module:list -- <id> [<id> ...] [--dry-run] [--cycles N --cycles-kind executed|modeled|hardware --state N] [--slots fx1|fx2|both] [--buffer N] [--added-at ISO] [--upstream-dir DIR] [--source-path upstream/FILE=PATH]')
  if (new Set(ids).size !== ids.length) refuse('Name each module once.')
  const single = [...Object.values(figures).filter(value => value !== undefined), upstreamDir, ...Object.keys(sourcePaths)].some(Boolean)
  if (single && ids.length > 1) refuse('--cycles, --cycles-kind, --state, --slots, --buffer, --upstream-dir and --source-path describe one module: list one id at a time with them.')
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(addedAt)) refuse(`--added-at must be a UTC time like 2026-11-25T08:23:53Z, not ${addedAt}.`)
  const t = tree(root), plans = ids.map(id => plan(t, id, { addedAt, figures, upstreamDir, sourcePaths }))
  for (const p of plans) if (!p.draft && p.changes.length) refuse(`${p.id} is listed already, and module:list lists drafts only. Not done for it: ${p.changes.join('; ')}.`)
  const drafts = plans.filter(p => p.draft)
  if (!drafts.length) { log(`${ids.join(', ')}: listed already; nothing to change.`); return plans }
  for (const p of drafts) {
    const result = doctor(root, p.id)
    if (!result.ok) refuse(`${p.id}: npm run module:doctor -- --draft ${p.id} has red experimental lines; fix them first.\n${result.output.trim().split('\n').slice(-40).join('\n')}`)
  }
  for (const p of plans) {
    log(p.draft ? `${p.name} (${p.id})${dryRun ? ', would change' : ''}:` : `${p.id}: listed already; nothing to change.`)
    for (const line of p.changes) log('  ' + line)
    for (const line of p.notes) log('  Note: ' + line)
  }
  const generators = [...(plans.some(p => p.licences) ? ['licenses:generate'] : []), 'modules:generate']
  if (dryRun) log(`\nDry run: nothing changed. A real run then runs npm run ${generators.join(' and npm run ')}.`)
  else {
    t.flush()
    for (const script of generators) if (run(root, script) !== 0) refuse(`npm run ${script} failed (above). The listing is written; fix what it names and run npm run ${script} again.`)
  }
  log('\n' + NEXT_STEPS(drafts.map(p => p.id)).join('\n'))
  return plans
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
  let parsed
  try {
    parsed = parseArgs({ allowPositionals: true, options: {
      'dry-run': { type: 'boolean', default: false }, cycles: { type: 'string' }, 'cycles-kind': { type: 'string' }, state: { type: 'string' },
      slots: { type: 'string' }, buffer: { type: 'string' }, 'added-at': { type: 'string' }, 'upstream-dir': { type: 'string' },
      'source-path': { type: 'string', multiple: true, default: [] },
    } })
  } catch (error) { console.error(error.message); process.exit(2) }
  const { values, positionals } = parsed
  const sourcePaths = Object.fromEntries(values['source-path'].map(item => { const at = item.indexOf('='); return at > 0 ? [item.slice(0, at), item.slice(at + 1)] : [item, ''] }))
  try {
    if (Object.values(sourcePaths).some(value => !value)) refuse('--source-path takes upstream/FILE=PATH.')
    await listModules(root, positionals, {
      dryRun: values['dry-run'], addedAt: values['added-at'], upstreamDir: values['upstream-dir'] ? resolve(values['upstream-dir']) : null, sourcePaths,
      figures: { cycles: values.cycles, 'cycles-kind': values['cycles-kind'], state: values.state, slots: values.slots, buffer: values.buffer },
    })
  } catch (error) {
    if (!(error instanceof Refusal)) throw error
    console.error(error.message); process.exitCode = 1
  }
}
