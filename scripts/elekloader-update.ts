// SPDX-License-Identifier: GPL-3.0-or-later
// Updates the vendored elekloader kit, upstream catalog, site-owned module records, or a combination:
//
//   npm run elekloader:update -- [elekloader-kit-<version>.zip [--sha256 <the release's>]] [elekloader-catalog.json [--library]] [--overlay sdk/imports/elekloader-<id>-<date>.json]
//
// - The kit: every file in the zip checked against its kit.json, and the files Modwerk vendors put in place of kit/.
//   A kit of another protocol is refused: src/engine/elekloader/digi-build.ts is written for KIT_PROTOCOL.
// - The catalog: its Digitakt and Digitone entries, each file downloaded from its author's release by the kit's own
//   sync and checked against its pin. Files it no longer names are removed. With --library, only the mods Modwerk's
//   library lists (sdk/<machine>/modules/<id>/modwerk.module.json) and the mods they require are taken, so elekloader's
//   whole catalog can go in as it is; the rest are not downloaded. It becomes vendor/elekloader/upstream-catalog.json.
// - Site-owned pins live in each module's own record, sdk/imports/elekloader-*.json. Every record joins the served
//   catalog; --overlay names a new or changed record so only its packages need syncing.
// Then the lock, the elekloader licence entry and the notices, and the vendor check. It prints what changed and what
// is left to do by hand. Both new copies and their lock are checked in a temporary folder first. If installing them
// or regenerating/checking notices fails, the original files are restored.
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, rmdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { members, read } from '../vendor/elekloader/kit/src/zip.ts'
import { UPSTREAM_CATALOG, assembleCatalog, isCatalogRecord, type CatalogFile } from './elekloader-vendor.ts'

export { mergeCatalogOverlay } from './elekloader-vendor.ts'

/** The kit protocol src/engine/elekloader/digi-build.ts is written for. */
export const KIT_PROTOCOL = 1
/** The devices Modwerk builds for: digi-build.ts's DEVICE, the machine folders under sdk/. */
export const DEVICES: Record<string, string> = { 'digitakt-mk1': 'digitakt', 'digitakt-mk2': 'digitakt-ii', 'digitone-mk1': 'digitone', 'analog-rytm-mk2': 'analog-rytm-mkii' }
/** The kit files Modwerk vendors; the zip's dist/, tools/build.ts and examples/ are for sites without a bundler. */
const VENDORED = (name: string) => name.startsWith('src/') || ['tools/kit.ts', 'LICENSE', 'NOTICE', 'README.md', 'kit.json'].includes(name)

export type KitJson = { name: string; version: string; protocol: number; commit: string; files: Record<string, string> }
type Pin = CatalogFile['mods'][number]

const sha = (data: Uint8Array) => createHash('sha256').update(data).digest('hex')

/** The files of a kit zip that Modwerk vendors, once every file in it is the one its kit.json names. */
export async function readKitZip(raw: Uint8Array): Promise<{ kit: KitJson; files: Map<string, Uint8Array> }> {
  const list = members(raw), tops = new Set(list.map(m => m.filename.split('/')[0]))
  if (tops.size !== 1) throw new Error('This is not a kit zip: its files are not in one elekloader-kit-<version>/ folder.')
  const [top] = tops, all = new Map<string, Uint8Array>()
  for (const m of list) {
    if (m.filename.endsWith('/')) continue
    const name = m.filename.slice(top.length + 1)
    if (!name || name.split('/').some(part => !part || part === '.' || part === '..' || part.includes('\\'))) throw new Error('The kit zip names a file outside its folder: ' + m.filename)
    all.set(name, await read(raw, m))
  }
  const json = all.get('kit.json')
  if (!json) throw new Error('This is not a kit zip: it has no kit.json.')
  const kit = JSON.parse(new TextDecoder().decode(json)) as KitJson
  if (kit.name !== 'elekloader-kit' || typeof kit.version !== 'string' || !/^[0-9a-f]{40}$/.test(String(kit.commit)) || !kit.files || typeof kit.files !== 'object')
    throw new Error('kit.json is not an elekloader kit\'s.')
  if (top !== 'elekloader-kit-' + kit.version) throw new Error(`The zip's folder is ${top}, not elekloader-kit-${kit.version} as its kit.json says.`)
  if (kit.protocol !== KIT_PROTOCOL)
    throw new Error(`This kit speaks protocol ${kit.protocol}. src/engine/elekloader/digi-build.ts is written for protocol ${KIT_PROTOCOL}: update it and KIT_PROTOCOL first.`)
  const bad: string[] = []
  for (const [name, hash] of Object.entries(kit.files)) {
    const data = all.get(name)
    if (!data) bad.push('missing: ' + name)
    else if (sha(data) !== hash) bad.push('not the file kit.json names: ' + name)
  }
  for (const name of all.keys()) if (name !== 'kit.json' && !(name in kit.files)) bad.push('not in kit.json: ' + name)
  if (bad.length) throw new Error('The kit zip does not match its kit.json:\n  ' + bad.join('\n  '))
  return { kit, files: new Map([...all].filter(([name]) => VENDORED(name))) }
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

function run(args: string[], options: { capture?: boolean; cwd: string }) {
  const result = spawnSync(process.execPath, args, { cwd: options.cwd, encoding: 'utf8', stdio: options.capture ? ['ignore', 'pipe', 'inherit'] : 'inherit' })
  if (result.status !== 0) throw new Error(`node ${args.join(' ')} failed`)
  return result.stdout ?? ''
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
  const usage = 'Usage: npm run elekloader:update -- [elekloader-kit-<version>.zip [--sha256 <hex>]] [elekloader-catalog.json [--library]] [--overlay site-catalog.json]'
  const paths: string[] = []
  let expected: string | undefined, overlayPath: string | undefined, library = false
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--sha256') expected = argv[++i]
    else if (argv[i] === '--library') library = true
    else if (argv[i] === '--overlay') overlayPath = argv[++i]
    else if (argv[i].startsWith('--')) throw new Error(usage)
    else paths.push(argv[i])
  }
  const zip = paths.find(p => p.toLowerCase().endsWith('.zip')), from = paths.find(p => p.toLowerCase().endsWith('.json'))
  if ((!paths.length && !overlayPath) || paths.length !== [zip, from].filter(Boolean).length || expected !== undefined && (!zip || !/^[0-9a-fA-F]{64}$/.test(expected)) || library && !from) throw new Error(usage)
  const vendor = resolve(root, 'vendor/elekloader'), kitDir = join(vendor, 'kit'), catalogDir = join(vendor, 'catalog')
  const scratch = mkdtempSync(join(tmpdir(), 'modwerk-elekloader-')), notes: string[] = []
  const kitNext = join(scratch, 'kit'), catalogNext = join(scratch, 'catalog')
  let keepScratch = false
  try {
    const before = JSON.parse(readFileSync(join(kitDir, 'kit.json'), 'utf8')) as KitJson
    let after = before, changedKit: string[] = [], kitCount = 0
    if (zip) {
      const raw = new Uint8Array(readFileSync(resolve(zip)))
      if (expected && sha(raw) !== expected.toLowerCase()) throw new Error(`${zip} has sha256 ${sha(raw)}, not the ${expected} given.`)
      if (!expected) notes.push(`The zip's sha256 is ${sha(raw)}: compare it with the release's SHA256SUMS.txt, or pass --sha256.`)
      const { kit, files } = await readKitZip(raw)
      for (const [name, data] of files) { mkdirSync(dirname(join(kitNext, name)), { recursive: true }); writeFileSync(join(kitNext, name), data) }
      changedKit = [...files.keys()].filter(name => !existsSync(join(kitDir, name)) || sha(readFileSync(join(kitDir, name))) !== sha(files.get(name)!))
      after = kit; kitCount = files.size
    }
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
    const nextKit = zip ? kitNext : kitDir, tool = join(nextKit, 'tools/kit.ts'), devices = Object.keys(DEVICES).flatMap(key => ['--device', key])
    // the kit's own sync, the new kit's if there is one, into a copy of the current folder: files already there
    // with the pinned sha256 are not downloaded again
    cpSync(catalogDir, catalogNext, { recursive: true })
    if (from) {
      // A full catalog can hold module-record pins too; they stay in their records.
      const source = JSON.parse(readFileSync(resolve(from), 'utf8')) as CatalogFile
      let next: CatalogFile = { ...source, cores: notRecord(source.cores), mods: notRecord(source.mods) }
      if (library) {
        // only what Modwerk's library lists, what that requires, and what the module records require: the rest is not downloaded.
        const owned = new Set(recordPins.map(m => `${DEVICES[m.device]}/${m.id}`))
        const withRecords = assembleCatalog(path => path === UPSTREAM_CATALOG ? JSON.stringify(next) : repo(path), records).catalog
        const cut = libraryCatalog(withRecords, (machine, id) => owned.has(`${machine}/${id}`) || existsSync(resolve(root, `sdk/${machine}/modules/${id}/modwerk.module.json`)))
        next = { ...next, cores: notRecord(cut.catalog.cores), mods: notRecord(cut.catalog.mods) }
        required = cut.required
        if (cut.leftOut.length) console.log(`--library: left out ${cut.leftOut.length} mods Modwerk's library does not list: ${cut.leftOut.join(', ')}`)
        if (required.size) console.log(`--library: kept as requirements of library mods: ${[...required].join(', ')}`)
      }
      writeFileSync(join(scratch, 'upstream.json'), JSON.stringify(next, null, 1) + '\n')
      run([tool, 'sync', join(scratch, 'upstream.json'), catalogNext, ...devices], { cwd: root })
      upstream = JSON.parse(readFileSync(join(catalogNext, 'catalog.json'), 'utf8')) as CatalogFile
    }
    const upstreamText = JSON.stringify(upstream, null, 1) + '\n'
    const site = assembleCatalog(path => path === UPSTREAM_CATALOG ? upstreamText : repo(path), records), newCatalog = site.catalog
    writeFileSync(join(scratch, 'site.json'), site.text)
    run([tool, 'sync', join(scratch, 'site.json'), catalogNext, ...devices], { cwd: root })
    writeFileSync(join(catalogNext, 'catalog.json'), site.text)
    const named = new Set([...newCatalog.cores, ...newCatalog.mods].map(p => p.file))
    for (const name of readdirSync(catalogNext)) if (name !== 'catalog.json' && !named.has(name)) rmSync(join(catalogNext, name))
    // The incoming kit must read the catalog even for a kit-only update. Generate and verify its lock before
    // replacing any installed file: the worker protocol and the catalog schema can change independently. The lock
    // pins the kit and the upstream catalog alone; the served folder is verified whole.
    const upstreamDir = join(scratch, 'upstream'), lockPath = join(scratch, 'elekloader.lock.json')
    mkdirSync(upstreamDir)
    writeFileSync(join(upstreamDir, 'catalog.json'), upstreamText)
    for (const pin of [...upstream.cores, ...upstream.mods]) cpSync(join(catalogNext, pin.file), join(upstreamDir, pin.file))
    const lock = run([tool, 'lock', '--kit', nextKit, '--catalog', upstreamDir], { capture: true, cwd: root })
    writeFileSync(lockPath, lock)
    run([tool, 'verify', upstreamDir, '--lock', lockPath, '--kit', nextKit], { cwd: root })
    run([tool, 'verify', catalogNext], { cwd: root })

    const manifestPath = resolve(root, 'vendor/licenses/manifest.json')
    let manifest = readFileSync(manifestPath, 'utf8')
    if (after.commit !== before.commit) {
      if (manifest.includes(before.commit)) manifest = manifest.split(before.commit).join(after.commit)
      else notes.push(`vendor/licenses/manifest.json does not name the previous kit commit ${before.commit}: point its elekloader entry at ${after.commit} by hand.`)
    }
    const notice = readFileSync(join(nextKit, 'NOTICE'), 'utf8').trimEnd() + '\n\n'
      + readFileSync(join(nextKit, 'LICENSE'), 'utf8').trimEnd() + '\n'

    // Keep every affected file, including the generated distribution notices. A later generation/verification
    // error must not leave a new kit beside an old lock, or a partially regenerated set of licence notices.
    const folders = [...(zip ? ['vendor/elekloader/kit'] : []), 'vendor/elekloader/catalog']
    const files = ['vendor/elekloader/elekloader.lock.json', UPSTREAM_CATALOG, 'vendor/licenses/manifest.json', 'vendor/licenses/elekloader.txt',
      'sdk/octabam/licenses/THIRD_PARTY_NOTICES.txt', 'public/licenses/THIRD_PARTY_NOTICES.txt', 'public/licenses/THIRD_PARTY_NOTICES.html']
    const originals = new Map(files.map(path => [path, existsSync(resolve(root, path)) ? readFileSync(resolve(root, path)) : undefined]))
    for (const path of folders) cpSync(resolve(root, path), join(scratch, 'original', path), { recursive: true })
    for (const [path, data] of originals) if (data !== undefined) {
      mkdirSync(dirname(join(scratch, 'original', path)), { recursive: true })
      writeFileSync(join(scratch, 'original', path), data)
    }
    try {
      if (zip) mirror(kitNext, kitDir)
      mirror(catalogNext, catalogDir)
      writeFileSync(resolve(root, UPSTREAM_CATALOG), upstreamText)
      writeFileSync(join(vendor, 'elekloader.lock.json'), lock)
      writeFileSync(manifestPath, manifest)
      writeFileSync(resolve(root, 'vendor/licenses/elekloader.txt'), notice)
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
    if (zip) console.log(`Kit: ${before.version} (${before.commit.slice(0, 7)}) -> ${after.version} (${after.commit.slice(0, 7)}), ${changedKit.length} of ${kitCount} files changed${changedKit.length ? ': ' + changedKit.join(', ') : ''}.`)
    const changes = catalogChanges(oldCatalog, newCatalog)
    if (from || overlayPath) {
      console.log(`Catalog: ${oldCatalog.revision.slice(0, 7)} -> ${newCatalog.revision.slice(0, 7)}, ${newCatalog.cores.length} cores and ${newCatalog.mods.length} mods${changes.length ? ':' : ', no file changed.'}`)
      for (const c of changes) console.log('  ' + describeChange(c))
      if (newCatalog.revision !== oldCatalog.revision) notes.push('Configuration backups made before this name the old catalog revision. They still import, with their modules checked again against the library.')
    }
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
