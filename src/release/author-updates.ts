import { compareModuleVersions } from '../catalog/versions.ts'

export const AUTHOR_RELEASE_REQUEST = 'Automatically merge and publish my module update after checks pass.'
export const AUTHOR_RELEASE_EVIDENCE = 'I verified the source, licences, UI and qualification reports, including instance isolation and Part/project/reboot persistence where applicable; no required acceptance check is failed or untested.'
export const ACTIONS_BOT_ID = 41898282
export type AuthorRegistry = { schemaVersion: 1; accounts: Record<string, number> }
export type AuthorModule = { folder: string; document: Record<string, unknown> }
export type AuthorChange = { path: string; before: string | null; after: string | null; regular: boolean }
/** The served elekloader catalog (upstream plus every module record) at the base and at the head, assembled by trusted code. */
export type AuthorVendor = { catalog: Record<string, unknown>; next: Record<string, unknown>; lock: Record<string, unknown>; artifacts: Record<string, Record<string, unknown>> }
const CATALOG_RECORD = /^sdk\/imports\/elekloader-[a-z0-9][a-z0-9.-]*\.json$/
const object = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
const same = (a: unknown, b: unknown): boolean => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b))
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical)
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, canonical(item)]))
  return value
}
export function parseAuthorRegistry(value: unknown): AuthorRegistry {
  const registry = object(value), accounts = object(registry.accounts)
  if (registry.schemaVersion !== 1 || Object.keys(registry).sort().join(',') !== 'accounts,schemaVersion' || !Object.keys(accounts).length) throw new Error('Invalid module author registry.')
  for (const [login, id] of Object.entries(accounts)) if (!/^[a-z0-9-]{1,39}$/.test(login) || !Number.isSafeInteger(id) || Number(id) < 1) throw new Error('Pin each module author to an immutable GitHub account ID.')
  return registry as AuthorRegistry
}
function checked(body: unknown, text: string) {
  return typeof body === 'string' && body.split(/\r?\n/).some(line => /^\s*- \[[xX]\] /.test(line) && line.replace(/^\s*- \[[xX]\] /, '').trim() === text)
}
export function authorRequestedRelease(body: unknown) { return checked(body, AUTHOR_RELEASE_REQUEST) && checked(body, AUTHOR_RELEASE_EVIDENCE) }
/** Select an event candidate only; live PR ownership, opt-in, scope and exact CI are rechecked before merge. */
export function authorReleaseEvent(value: unknown): { head: string; number?: number; runId?: number } {
  const event = object(value), run = object(event.workflow_run), pr = object(event.pull_request)
  const validId = (id: unknown): id is number => Number.isSafeInteger(id) && Number(id) > 0
  const validHead = (head: unknown): head is string => typeof head === 'string' && /^[a-f0-9]{40}$/.test(head)
  if ('workflow_run' in event) {
    if (event.action !== 'completed' || run.event !== 'pull_request' || run.status !== 'completed' || run.conclusion !== 'success' || !validId(run.id) || !validHead(run.head_sha)) throw new Error('Only successful PR workflow completions can request author release.')
    return { head: run.head_sha, runId: run.id }
  }
  const head = object(pr.head).sha
  if (event.action !== 'edited' || pr.state !== 'open' || pr.draft || object(pr.base).ref !== 'main' || !validId(pr.number) || !validHead(head)) throw new Error('Only edits to an open main PR can request author release.')
  return { head, number: pr.number }
}
const packageNames = ['dsp-packages', 'coldfire-packages', 'resident-dsp', 'rom-packages', 'bootstrap-package', 'menu-recipes', 'descriptor-recipes', 'platform-writes', 'requested-packages', 'utility-packages', 'usb-audio-packages', 'module-build']
function manifestPath(folder: string) { return folder + '/' + (folder.startsWith('sdk/octabam/') ? 'octamod' : 'modwerk') + '.module.json' }
export function moduleReleaseId(module: AuthorModule) { return module.folder.startsWith('sdk/octabam/') ? String(module.document.id) : String(module.document.machine) + '-' + module.document.id }
function ownership(document: Record<string, unknown>) { return { id: document.id, machine: document.machine, author: document.author, maintainers: document.maintainers, license: document.license, exclusive: document.exclusive, effectId: object(document.compatibility).effectId } }
function packageProjection(value: unknown, ids: Set<string>, changedPackages: Set<string>, name: string, depth = 0): unknown {
  if (Array.isArray(value)) return value.filter(item => {
    const row = object(item)
    return !ids.has(String(row.moduleId ?? row.id)) && !(Array.isArray(row.moduleIds) && row.moduleIds.some(id => ids.has(String(id)))) && !(name === 'resident-dsp' && ids.has('character') && row.hasCharacter === true)
  }).map(item => packageProjection(item, ids, changedPackages, name, depth + 1))
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(Object.entries(value).filter(([key]) => {
    if (depth === 0 && key === 'sourceCommit') return false
    if (depth === 0 && name === 'module-build' && key === 'sourceTreeSha256') return false
    if (depth === 0 && name === 'resident-dsp' && key === 'character' && ids.has('character')) return false
    if (depth === 0 && name === 'requested-packages' && key === 'analog' && ids.has('analog-bassdrum')) return false
    return true
  }).map(([key, item]) => {
    if (depth === 0 && key === 'moduleVersions') return [key, Object.fromEntries(Object.entries(object(item)).filter(([id]) => !ids.has(id)))]
    if (depth === 0 && name === 'module-build' && key === 'files') return [key, Object.fromEntries(Object.entries(object(item)).map(([file, entry]) => [file, changedPackages.has(file) ? null : entry]))]
    return [key, packageProjection(item, ids, changedPackages, name, depth + 1)]
  }))
}
function authorizeVendor(vendor: AuthorVendor | undefined, changes: readonly AuthorChange[], ids: Set<string>, next: Map<string, Record<string, unknown>>) {
  const paths = changes.filter(change => change.path.startsWith('vendor/elekloader/') || CATALOG_RECORD.test(change.path))
  if (!paths.length) return new Set<string>()
  if (!vendor?.next) throw new Error('An author package needs a previously approved elekloader catalog.')
  const catalog = object(vendor.next)
  const oldRows = Array.isArray(vendor.catalog.mods) ? vendor.catalog.mods.map(object) : [], rows = Array.isArray(catalog.mods) ? catalog.mods.map(object) : []
  const id = (row: Record<string, unknown>) => String(row.device).replace(/-mk1$/, '') + '-' + row.id
  const identity = (row: Record<string, unknown>) => [row.id, row.device, row.os, row.license, row.author, row.requires, row.needs_core]
  const project = (value: Record<string, unknown>) => ({ ...value, revision: null, mods: (value.mods as unknown[]).map(object).map(row => ids.has(id(row)) ? identity(row) : row) })
  if (!same(project(vendor.catalog), project(catalog))) throw new Error('Other elekloader modules, cores, OS targets and licences require owner review.')
  // The lock pins the kit and the upstream catalog, so an author update never changes it. A module record may hold
  // only the author's own pins, before and after.
  const permitted = new Set<string>()
  for (const record of paths.filter(change => CATALOG_RECORD.test(change.path))) {
    const pins = [record.before, record.after].flatMap(text => text === null ? [] : Object.values(object(JSON.parse(text))).filter(Array.isArray).flat().map(object))
    if (!pins.length || pins.some(row => !ids.has(id(row)))) throw new Error('Elekloader records of other modules or cores require owner review.')
    permitted.add(record.path)
  }
  for (const row of rows.filter(row => ids.has(id(row)))) {
    const old = oldRows.find(item => same(identity(item), identity(row)))
    if (!old || typeof row.file !== 'string' || typeof old.file !== 'string' || !/^[A-Za-z0-9_.-]+\.elemod$/.test(row.file) || !next.has(id(row))) throw new Error('Invalid author elekloader package identity.')
    if (same(row, old)) throw new Error('Update every approved OS package for each released Digi module.')
    if (![next.get(id(row))?.version, String(next.get(id(row))?.version).split('-')[0]].includes(row.version as string)) throw new Error('The released elekloader package must match the updated module version.')
    const source = object(row.source), moduleSource = object(next.get(id(row))?.source)
    if (source.repo !== object(old.source).repo || 'https://github.com/' + source.repo !== moduleSource.repository || source.commit !== moduleSource.revision || typeof source.commit !== 'string' || !/^[a-f0-9]{40}$/.test(source.commit)) throw new Error('Pin author packages to the approved repository and exact updated module source commit.')
    const file = 'vendor/elekloader/catalog/' + row.file, packageEdit = paths.find(change => change.path === file)
    if (!packageEdit?.after || packageEdit.after === packageEdit.before) throw new Error('A native release must include its updated elekloader package.')
    const pkg = object(JSON.parse(packageEdit.after)), original = vendor.artifacts[old.file]
    if (!original || pkg.elemod !== 2 || pkg.id !== row.id || pkg.version !== row.version || pkg.license !== row.license || pkg.author !== original.author || !same(pkg.target, original.target)) throw new Error('The authored package must retain its approved module, author, licence and stock target.')
    permitted.add(file)
    if (old.file !== row.file) {
      const removed = paths.find(change => change.path === 'vendor/elekloader/catalog/' + old.file)
      if (!removed || removed.after !== null) throw new Error('Remove the obsolete author package when renaming its release.')
      permitted.add(removed.path)
    }
  }
  if (paths.some(change => !permitted.has(change.path))) throw new Error('Elekloader changes outside the author packages require owner review.')
  for (const moduleId of ids) if (/^(digitakt|digitone)-/.test(moduleId) && !rows.some(row => id(row) === moduleId)) throw new Error('Every released Digi module needs matching approved native packages.')
  if (![...permitted].some(path => path.endsWith('.elemod'))) throw new Error('An author package update must change a pinned native package.')
  return permitted
}

/** Base-branch documents and registry are the authority. PR metadata never grants access. */
export function authorizeAuthorUpdate(registry: AuthorRegistry, author: unknown, modules: readonly AuthorModule[], changes: readonly AuthorChange[], vendor?: AuthorVendor) {
  parseAuthorRegistry(registry)
  const account = object(author), login = typeof account.login === 'string' ? account.login.toLowerCase() : ''
  if (registry.accounts[login] !== account.id || account.type !== 'User') throw new Error('This GitHub account is not a registered module author.')
  const touched = modules.filter(module => changes.some(change => change.path.startsWith(module.folder + '/')))
  if (!touched.length) throw new Error('An author release must update an existing published module.')
  const next = new Map<string, Record<string, unknown>>()
  for (const module of touched) {
    const handles = [object(module.document.author).github, ...(Array.isArray(module.document.maintainers) ? module.document.maintainers : [])]
    if (!handles.some(handle => typeof handle === 'string' && handle.toLowerCase() === login)) throw new Error('Another author owns ' + moduleReleaseId(module) + '.')
    const manifest = changes.find(change => change.path === manifestPath(module.folder))
    if (!manifest?.after || !manifest.before) throw new Error('Update the manifest and semantic version for ' + moduleReleaseId(module) + '.')
    const document = object(JSON.parse(manifest.after))
    if (!same(ownership(document), ownership(module.document))) throw new Error('Ownership, licence and module identity changes require owner review.')
    if (typeof document.version !== 'string' || typeof module.document.version !== 'string' || compareModuleVersions(document.version, module.document.version) <= 0) throw new Error('Increase the semantic version for ' + moduleReleaseId(module) + '.')
    // A contributor cannot make a new owner waiver, or carry one into changed runtime code.
    if (object(document.tests).releaseWaiver || object(object(document.tests).qualification).hardware && object(object(object(document.tests).qualification).hardware).kind === 'owner-waived') throw new Error('Owner release waivers require owner review.')
    next.set(moduleReleaseId(module), document)
  }
  const ids = new Set(touched.map(moduleReleaseId)), octatrack = touched.some(module => module.folder.startsWith('sdk/octabam/'))
  const changedPackages = new Set(changes.filter(change => change.path.startsWith('src/engine/assets/')).map(change => change.path.slice('src/engine/assets/'.length)))
  const vendorPaths = authorizeVendor(vendor, changes, ids, next)
  let packages = false
  for (const change of changes) {
    if (!change.regular || Array.from(change.path).some(char => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127) || change.path.split('/').some(part => ['.', '..', '.git', '.github', '.gitattributes', '.gitmodules'].includes(part)) || /\.(bin|syx|zip|exe|dll|dylib)$/i.test(change.path)) throw new Error('Unsafe author update path: ' + change.path)
    const own = touched.find(module => change.path.startsWith(module.folder + '/'))
    if (own) {
      if (change.path === own.folder + '/' + object(own.document.license).file || /^(?:licen[cs]e|copying|notice)(?:[._-]|$)/i.test(change.path.split('/').at(-1) ?? '')) throw new Error('Licence text changes require owner review.')
      continue
    }
    if (vendorPaths.has(change.path)) continue
    if (change.path === 'sdk/catalog.json' || change.path === 'src/catalog/module-documents.json') {
      if (!change.before || !change.after) throw new Error('Catalog removal requires owner review.')
      const before = object(JSON.parse(change.before)), after = object(JSON.parse(change.after))
      const project = (value: Record<string, unknown>) => {
        if (!Array.isArray(value.modules)) throw new Error('Invalid generated catalog.')
        return { ...value, modules: value.modules.map(item => {
          const row = object(item)
          if (!ids.has(String(row.id))) return row
          if (change.path === 'sdk/catalog.json') return { ...row, version: null }
          return { id: row.id, machine: row.machine, ownership: ownership(row) }
        }) }
      }
      if (!same(project(before), project(after))) throw new Error('Catalog changes outside the author modules require owner review.')
      for (const item of after.modules as unknown[]) {
        const row = object(item), id = String(row.id)
        if (ids.has(id) && row.version !== next.get(id)?.version) throw new Error('Stale author module catalog version.')
      }
      continue
    }
    // Each module's release notes are their own file, named by its release ID.
    const notes = change.path.match(/^src\/community\/module-changelogs\/([a-z0-9-]+)\.json$/)
    if (notes) {
      if (!ids.has(notes[1])) throw new Error('Release notes for another module require owner review.')
      if (!change.before || !change.after) throw new Error('Release history cannot be removed.')
      const before: unknown = JSON.parse(change.before), after: unknown = JSON.parse(change.after)
      if (!Array.isArray(before) || !Array.isArray(after)) throw new Error('Invalid release notes for ' + notes[1] + '.')
      if (before.some(note => !after.some(item => same(item, note)))) throw new Error('Preserve published release notes.')
      continue
    }
    if (/^sdk\/imports\/[a-z0-9-]+\.json$/.test(change.path) && !change.before && change.after && octatrack) {
      const record = object(JSON.parse(change.after))
      if (!Array.isArray(record.modules) || !record.modules.length || record.modules.some(id => !ids.has(String(id))) || !Array.isArray(record.files) || record.files.some(file => !touched.some(module => String(object(file).path).startsWith('modules/' + module.document.id + '/')))) throw new Error('Import records must concern only the author modules.')
      continue
    }
    if (octatrack && packageNames.some(name => change.path === 'src/engine/assets/' + name + '.json') && change.before && change.after) {
      // These exact files must reproduce the fixed compiler's output in octatrack-source.
      // No compiler, common runtime, proof-only file or application code is allowed.
      const name = change.path.slice('src/engine/assets/'.length, -5), before = JSON.parse(change.before), after = JSON.parse(change.after)
      if (name !== 'usb-audio-packages' || !ids.has('usb-audio-out-tracks-main-cue')) {
        if (!same(packageProjection(before, ids, changedPackages, name), packageProjection(after, ids, changedPackages, name))) throw new Error('Compiled packages for another module or common runtime require owner review.')
      }
      if (name === 'module-build' && object(after).approval !== null) throw new Error('A PR cannot fabricate release approval.')
      packages = true
      continue
    }
    throw new Error('Owner review required for ' + change.path + '.')
  }
  return { modules: [...ids].sort(), octatrack, packages, elemod: touched.some(module => !module.folder.startsWith('sdk/octabam/')), vendorPackages: vendorPaths.size > 0 }
}

/** Job names bind CI to the event's base and head, including fork PRs with no API PR association. */
export function requireAuthorChecks(run: unknown, jobs: readonly unknown[], repository: string, head: string, base: string, workflowId: number, scope: { octatrack: boolean; packages: boolean; elemodCompile: boolean }) {
  const value = object(run)
  if (object(value.repository).full_name !== repository || value.workflow_id !== workflowId || value.path !== '.github/workflows/module-pr.yml' || value.event !== 'pull_request' || value.head_sha !== head || value.status !== 'completed' || value.conclusion !== 'success') throw new Error('Author release requires successful current Module PR checks.')
  const rows = jobs.map(object), required = ['scope / ' + base + ' / ' + head, 'module-contract']
  if (scope.octatrack || scope.packages) required.push('octatrack-source')
  if (scope.elemodCompile) required.push('elemod-source')
  for (const name of required) if (rows.filter(job => job.name === name && job.status === 'completed' && job.conclusion === 'success').length !== 1) throw new Error('Missing successful author release check: ' + name)
}
