// SPDX-License-Identifier: GPL-3.0-or-later
// Updates the catalog the site's builder serves: the upstream catalog, site-owned module records, or both:
//
//   npm run elekloader:update -- [elekloader-catalog.json [--library]] [--overlay sdk/imports/elekloader-<id>-<date>.json]
//
// - The catalog: its entries for Modwerk's machines, each file downloaded from its source and checked against its pin
//   (syncCatalog). Files it no longer names are removed. With --library, only the mods Modwerk's library lists
//   (sdk/<machine>/modules/<id>/modwerk.module.json) and the mods they require are taken; the rest are not downloaded.
//   It becomes vendor/elekloader/upstream-catalog.json.
// - Site-owned pins live in each module's own record, sdk/imports/elekloader-*.json. Every record joins the served
//   catalog; --overlay names a new or changed record so only its packages need syncing.
// Then the lock and the vendor check. It prints what changed and what is left to do by hand. The new catalog and its
// lock are checked in a temporary folder first; if installing them or checking fails, the original files are restored.
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, rmdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseCatalog, sourceUrl } from '../src/engine/elektron/builder-catalog.ts'
import { KIT_FILES, UPSTREAM_CATALOG, assembleCatalog, isCatalogRecord, type CatalogFile, type Lock } from './elekloader-vendor.ts'

export { mergeCatalogOverlay } from './elekloader-vendor.ts'

/** The devices Modwerk builds for, and their machine folders under sdk/. */
export const DEVICES: Record<string, string> = { 'digitakt-mk1': 'digitakt', 'digitakt-mk2': 'digitakt-ii', 'digitone-mk1': 'digitone', 'analog-rytm-mk2': 'analog-rytm-mkii', 'model-cycles': 'model-cycles' }

type Pin = CatalogFile['mods'][number]

const sha = (data: Uint8Array) => createHash('sha256').update(data).digest('hex')

/** `catalog`'s pins for `devices` in `folder`, with the catalog (only those devices') as catalog.json: a file already
 * there with the pinned sha256 is kept, any other is downloaded from its source (`fetchFile`) and checked. */
export async function syncCatalog(catalog: CatalogFile, folder: string, devices: readonly string[], fetchFile: (url: string) => Promise<Uint8Array> = download) {
  const ours = (p: Pin) => devices.includes(p.device)
  const kept: CatalogFile = { ...catalog, cores: catalog.cores.filter(ours), mods: catalog.mods.filter(ours) }
  parseCatalog(kept)
  mkdirSync(folder, { recursive: true })
  for (const pin of [...kept.cores, ...kept.mods]) {
    const at = join(folder, pin.file)
    if (existsSync(at) && sha(readFileSync(at)) === pin.sha256) continue
    const url = sourceUrl(pin as Parameters<typeof sourceUrl>[0])
    const data = await fetchFile(url)
    if (sha(data) !== pin.sha256) throw new Error(`${pin.file}: ${url} is not the file the catalog pins (sha256 ${sha(data)}, not ${pin.sha256})`)
    writeFileSync(at, data)
  }
  writeFileSync(join(folder, 'catalog.json'), JSON.stringify(kept, null, 1) + '\n')
  return kept
}

async function download(url: string): Promise<Uint8Array> {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`${url}: ${response.status}`)
  return new Uint8Array(await response.arrayBuffer())
}

/** Throws unless `folder` holds catalog.json and exactly its pins' files, each the pinned one. */
export function verifyCatalogFolder(folder: string) {
  const catalog = parseCatalog(JSON.parse(readFileSync(join(folder, 'catalog.json'), 'utf8')))
  const pins = [...catalog.cores, ...catalog.mods], bad: string[] = []
  for (const pin of pins) {
    const at = join(folder, pin.file)
    if (!existsSync(at)) bad.push('missing: ' + pin.file)
    else if (sha(readFileSync(at)) !== pin.sha256) bad.push('not the pinned file: ' + pin.file)
  }
  for (const name of readdirSync(folder)) if (name !== 'catalog.json' && !pins.some(p => p.file === name)) bad.push('not in the catalog: ' + name)
  if (bad.length) throw new Error(folder + ' is not its catalog:\n' + bad.join('\n'))
}

/** The lock: the kept kit files and the upstream catalog's text, by sha256. */
export function catalogLock(kitDir: string, upstreamText: string, revision: string, previous: Lock): Lock {
  return { ...previous, kit: { ...previous.kit, files: Object.fromEntries([...KIT_FILES].sort().map(path => [path, sha(readFileSync(join(kitDir, path)))])) }, catalog: { revision, sha256: sha(new TextEncoder().encode(upstreamText)), cores: (JSON.parse(upstreamText) as CatalogFile).cores.length, mods: (JSON.parse(upstreamText) as CatalogFile).mods.length } }
}

/** A catalog cut to Modwerk's library: the mods `listed(machine, id)` names, with the mods they require on the same
 * device and OS (`required`, as machine/id), and only Modwerk's devices. The other fields stay as they are. `leftOut`
 * names the mods (machine/id) none of whose files are kept. */
export function libraryCatalog<C extends { cores: Pin[]; mods: Pin[] }>(catalog: C, listed: (machine: string, id: string) => boolean) {
  const ours = (p: Pin) => p.device in DEVICES
  const keep = new Set(catalog.mods.filter(m => ours(m) && listed(DEVICES[m.device], m.id)))
  for (let grew = true; grew;) {
    grew = false
    for (const m of [...keep])
      for (const id of m.requires ?? [])
        for (const r of catalog.mods)
          if (id !== 'core' && r.id === id && r.device === m.device && r.os === m.os && !keep.has(r)) { keep.add(r); grew = true }
  }
  const mods = catalog.mods.filter(m => keep.has(m)), key = (m: Pin) => `${DEVICES[m.device]}/${m.id}`
  return {
    catalog: { ...catalog, cores: catalog.cores.filter(ours), mods },
    required: new Set(mods.filter(m => !listed(DEVICES[m.device], m.id)).map(key)),
    leftOut: [...new Set(catalog.mods.filter(m => ours(m) && !mods.some(k => key(k) === key(m))).map(key))].sort(),
  }
}

/** The files of one mod (or core) for one device and OS that left the catalog (`from`) and came (`to`). */
export type Change = { key: string; id: string; device: string; os: string; from: Pin[]; to: Pin[] }

/** What changed between two catalogs, file by file, grouped by mod (or core), device and OS: a catalog can hold
 * several files for one of them, such as two cores for one OS. */
export function catalogChanges(before: CatalogFile, after: CatalogFile): Change[] {
  const a = [...before.cores, ...before.mods], b = [...after.cores, ...after.mods]
  const same = (p: Pin, q: Pin) => p.file === q.file && p.sha256 === q.sha256
  const groups = new Map<string, Change>()
  const add = (p: Pin, side: 'from' | 'to') => {
    const key = `${p.id} ${p.device} ${p.os}`
    if (!groups.has(key)) groups.set(key, { key, id: p.id, device: p.device, os: p.os, from: [], to: [] })
    groups.get(key)![side].push(p)
  }
  for (const p of a) if (!b.some(q => same(p, q))) add(p, 'from')
  for (const p of b) if (!a.some(q => same(p, q))) add(p, 'to')
  return [...groups.values()].sort((x, y) => (x.key < y.key ? -1 : x.key > y.key ? 1 : 0))
}


/** A change in a line: replaced, added or removed. */
export function describeChange(c: Change) {
  const files = (pins: Pin[]) => pins.map(p => `${p.version} (${p.file})`).join(', ')
  const what = !c.from.length ? 'added ' + files(c.to) : !c.to.length ? files(c.from) + ' removed' : files(c.from) + ' -> ' + files(c.to)
  return `${c.id} for ${c.device} OS ${c.os}: ${what}`
}

/** What is left to do by hand after a catalog change: the builds a changed core changes, Modwerk's own module files,
 * and licence entries naming a catalog file that is gone. `root` is the repository; `required` names (machine/id) the
 * mods the catalog carries only because a listed mod requires them. */
export function followUps(root: string, changes: readonly Change[], manifest: { components: { id: string; usedIn?: string[] }[] }, required: ReadonlySet<string> = new Set()) {
  const out: string[] = []
  const cores = changes.filter(c => c.id === 'core')
  if (cores.length) out.push(`Cores changed (${cores.map(describeChange).join('; ')}): builds for those OS releases change. Build them and record the identities in docs/verification/<YYYY-MM-DD>-<topic>.md.`)
  for (const id of [...new Set(changes.filter(c => c.id !== 'core').map(c => `${DEVICES[c.device]}/${c.id}`))].sort()) {
    const [machine, mod] = id.split('/'), folder = `sdk/${machine}/modules/${mod}`
    const mine = changes.filter(c => c.id === mod && DEVICES[c.device] === machine), gone = mine.filter(c => !c.to.length).map(c => 'OS ' + c.os)
    if (required.has(id)) out.push(`${id} comes with the catalog because a library mod requires it: it needs no library entry.`)
    else if (!existsSync(resolve(root, folder))) { if (gone.length < mine.length) out.push(`${id} is in the catalog but not in Modwerk's library: add ${folder}/ to offer it, or leave it out of the catalog (--library).`) }
    else if (gone.length === mine.length) out.push(`${folder}/modwerk.module.json: ${mod} left the catalog for ${gone.join(', ')}. Remove those releases, or the module, then run npm run modules:generate.`)
    else out.push(`${folder}/modwerk.module.json: bring its version, releases and memory in line with the catalog, then run npm run modules:generate.`)
  }
  for (const component of manifest.components)
    for (const path of component.usedIn ?? [])
      if (path.startsWith('vendor/elekloader/catalog/') && !existsSync(resolve(root, path))) out.push(`vendor/licenses/manifest.json: "${component.id}" names ${path}, which is gone.`)
  return out
}

function run(args: string[], options: { cwd: string }) {
  const result = spawnSync(process.execPath, args, { cwd: options.cwd, encoding: 'utf8', stdio: 'inherit' })
  if (result.status !== 0) throw new Error(`node ${args.join(' ')} failed`)
}

const listFiles = (dir: string, at = ''): string[] => readdirSync(join(dir, at), { withFileTypes: true }).flatMap(entry =>
  entry.isDirectory() ? listFiles(dir, at + entry.name + '/') : [at + entry.name])

/** Makes `target` hold exactly the files of `next`, a complete staged copy. File by file, not by renaming folders:
 * on Windows a running dev server's watcher keeps them open. */
function mirror(next: string, target: string) {
  const want = new Set(listFiles(next))
  for (const name of listFiles(target)) if (!want.has(name)) rmSync(join(target, name))
  for (const name of want) {
    const data = readFileSync(join(next, name)), to = join(target, name)
    if (existsSync(to) && readFileSync(to).equals(data)) continue
    mkdirSync(dirname(to), { recursive: true })
    writeFileSync(to, data)
  }
  const prune = (at: string) => {
    for (const entry of readdirSync(at, { withFileTypes: true })) if (entry.isDirectory()) prune(join(at, entry.name))
    if (at !== target && !readdirSync(at).length) try { rmdirSync(at) } catch { /* an empty folder holds no file the lock sees */ }
  }
  prune(target)
}

async function main(root: string, argv: string[]) {
  const usage = 'Usage: npm run elekloader:update -- [elekloader-catalog.json [--library]] [--overlay sdk/imports/elekloader-<id>-<date>.json]'
  const paths: string[] = []
  let overlayPath: string | undefined, library = false
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--library') library = true
    else if (argv[i] === '--overlay') overlayPath = argv[++i]
    else if (argv[i].startsWith('--')) throw new Error(usage)
    else paths.push(argv[i])
  }
  const from = paths.find(p => p.toLowerCase().endsWith('.json'))
  if ((!paths.length && !overlayPath) || paths.length !== (from ? 1 : 0) || (library && !from)) throw new Error(usage)
  const vendor = resolve(root, 'vendor/elekloader'), kitDir = join(vendor, 'kit'), catalogDir = join(vendor, 'catalog')
  const scratch = mkdtempSync(join(tmpdir(), 'modwerk-elekloader-')), notes: string[] = []
  const catalogNext = join(scratch, 'catalog')
  let keepScratch = false
  try {
    const lockBefore = JSON.parse(readFileSync(join(vendor, 'elekloader.lock.json'), 'utf8')) as Lock
    // Upstream pins are locked on their own; each module's record in sdk/imports/ adds its pins, so the served catalog
    // is upstream-catalog.json plus every record.
    if (overlayPath && !(dirname(resolve(overlayPath)) === resolve(root, 'sdk/imports') && isCatalogRecord('sdk/imports/' + basename(overlayPath)) && existsSync(resolve(overlayPath))))
      throw new Error('--overlay takes a module record in sdk/imports/ (elekloader-<id>-<date>.json); the catalog includes every record there.')
    const repo = (path: string) => existsSync(resolve(root, path)) ? readFileSync(resolve(root, path), 'utf8') : undefined
    const records = readdirSync(resolve(root, 'sdk/imports')).map(name => 'sdk/imports/' + name)
    const recordPins = records.filter(isCatalogRecord).flatMap(path => { const record = JSON.parse(repo(path)!) as CatalogFile; return [...record.cores, ...record.mods] })
    const notRecord = (pins: Pin[]) => pins.filter(pin => !recordPins.some(own => own.file === pin.file))
    const oldCatalog = assembleCatalog(repo, records).catalog
    let upstream = JSON.parse(repo(UPSTREAM_CATALOG)!) as CatalogFile, required: ReadonlySet<string> = new Set()
    const devices = Object.keys(DEVICES)
    // into a copy of the current folder: files already there with the pinned sha256 are not downloaded again
    cpSync(catalogDir, catalogNext, { recursive: true })
    if (from) {
      // A full catalog can hold module-record pins too; they stay in their records.
      const source = JSON.parse(readFileSync(resolve(from), 'utf8')) as CatalogFile
      let next: CatalogFile = { ...source, cores: notRecord(source.cores), mods: notRecord(source.mods) }
      if (library) {
        // only what Modwerk's library lists, what that requires, and what the module records require
        const owned = new Set(recordPins.map(m => `${DEVICES[m.device]}/${m.id}`))
        const withRecords = assembleCatalog(path => path === UPSTREAM_CATALOG ? JSON.stringify(next) : repo(path), records).catalog
        const cut = libraryCatalog(withRecords, (machine, id) => owned.has(`${machine}/${id}`) || existsSync(resolve(root, `sdk/${machine}/modules/${id}/modwerk.module.json`)))
        next = { ...next, cores: notRecord(cut.catalog.cores), mods: notRecord(cut.catalog.mods) }
        required = cut.required
        if (cut.leftOut.length) console.log(`--library: left out ${cut.leftOut.length} mods Modwerk's library does not list: ${cut.leftOut.join(', ')}`)
        if (required.size) console.log(`--library: kept as requirements of library mods: ${[...required].join(', ')}`)
      }
      upstream = await syncCatalog(next, catalogNext, devices)
    }
    const upstreamText = JSON.stringify(upstream, null, 1) + '\n'
    const site = assembleCatalog(path => path === UPSTREAM_CATALOG ? upstreamText : repo(path), records), newCatalog = site.catalog
    try { await syncCatalog(site.catalog, catalogNext, devices) }
    catch (error) {
      // raw.githubusercontent.com serves repeat98/modwerk's commits, and a fork's only once a pull request names them
      if (!overlayPath) throw error
      throw new Error((error as Error).message + '\nA package pinned at a commit on your fork answers 404 until its pull request to repeat98/modwerk is open: push, open the PR, then run --overlay again.', { cause: error })
    }
    writeFileSync(join(catalogNext, 'catalog.json'), site.text)
    const named = new Set([...newCatalog.cores, ...newCatalog.mods].map(p => p.file))
    for (const name of readdirSync(catalogNext)) if (name !== 'catalog.json' && !named.has(name)) rmSync(join(catalogNext, name))
    verifyCatalogFolder(catalogNext)
    const lock = JSON.stringify(catalogLock(kitDir, upstreamText, upstream.revision, lockBefore), null, 1) + '\n'

    // Keep every affected file, the regenerated distribution notices included: a later error must not leave a new
    // catalog beside an old lock, or a partly regenerated set of notices.
    const folders = ['vendor/elekloader/catalog']
    const files = ['vendor/elekloader/elekloader.lock.json', UPSTREAM_CATALOG, 'vendor/licenses/manifest.json', 'vendor/licenses/elekloader.txt',
      'sdk/octabam/licenses/THIRD_PARTY_NOTICES.txt', 'public/licenses/THIRD_PARTY_NOTICES.txt', 'public/licenses/THIRD_PARTY_NOTICES.html']
    const originals = new Map(files.map(path => [path, existsSync(resolve(root, path)) ? readFileSync(resolve(root, path)) : undefined]))
    for (const path of folders) cpSync(resolve(root, path), join(scratch, 'original', path), { recursive: true })
    for (const [path, data] of originals) if (data !== undefined) {
      mkdirSync(dirname(join(scratch, 'original', path)), { recursive: true })
      writeFileSync(join(scratch, 'original', path), data)
    }
    try {
      mirror(catalogNext, catalogDir)
      writeFileSync(resolve(root, UPSTREAM_CATALOG), upstreamText)
      writeFileSync(join(vendor, 'elekloader.lock.json'), lock)
      run(['scripts/licenses.mjs', '--write'], { cwd: root })
      run(['scripts/elekloader-vendor.ts'], { cwd: root })
    } catch (error) {
      const failures: unknown[] = []
      for (const path of folders) {
        try { mirror(join(scratch, 'original', path), resolve(root, path)) } catch (failure) { failures.push(failure) }
      }
      for (const [path, data] of originals) {
        try {
          if (data === undefined) rmSync(resolve(root, path), { force: true })
          else writeFileSync(resolve(root, path), data)
        } catch (failure) { failures.push(failure) }
      }
      if (failures.length) {
        keepScratch = true
        throw new AggregateError([error, ...failures], `The update failed and could not restore every file. Original files remain in ${join(scratch, 'original')}.`, { cause: error })
      }
      throw error
    }
    const changes = catalogChanges(oldCatalog, newCatalog)
    console.log(`Catalog: ${oldCatalog.revision.slice(0, 7)} -> ${newCatalog.revision.slice(0, 7)}, ${newCatalog.cores.length} cores and ${newCatalog.mods.length} mods${changes.length ? ':' : ', no file changed.'}`)
    for (const c of changes) console.log('  ' + describeChange(c))
    if (newCatalog.revision !== oldCatalog.revision) notes.push('Configuration backups made before this name the old catalog revision. They still import, with their modules checked again against the library.')
    const manifestPath = resolve(root, 'vendor/licenses/manifest.json')
    const todo = [...followUps(root, changes, JSON.parse(readFileSync(manifestPath, 'utf8')), required),
      'Run npm run check, then record the update in docs/verification/<YYYY-MM-DD>-<topic>.md (vendor/elekloader/README.md, "Updating").']
    for (const note of notes) console.log('Note: ' + note)
    console.log('Left to do:\n' + todo.map(item => '  - ' + item).join('\n'))
  } finally {
    if (!keepScratch) rmSync(scratch, { recursive: true, force: true })
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try { await main(resolve(dirname(fileURLToPath(import.meta.url)), '..'), process.argv.slice(2)) }
  catch (error) { console.error((error as Error).message); process.exitCode = 1 }
}
