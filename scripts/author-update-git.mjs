// Read PR Git objects as data. Never check out or execute the PR in the privileged workflow.
import { execFileSync } from 'node:child_process'
import { authorizeAuthorUpdate, parseAuthorRegistry } from '../src/release/author-updates.ts'
import { readChangeScope } from './change-scope.mjs'
import { UPSTREAM_CATALOG, assembleCatalog } from './elekloader-vendor.ts'

export function inspectAuthorUpdate(root, base, head, author) {
  if (![base, head].every(sha => /^[a-f0-9]{40}$/.test(sha))) throw new Error('Author updates require exact Git commits.')
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 32 * 1024 * 1024 })
  const tree = ref => new Map(git('ls-tree', '-rz', ref).split('\0').filter(Boolean).map(line => {
    const [metadata, path] = line.split('\t'), [mode, type, sha] = metadata.split(' ')
    return [path, { mode, type, sha }]
  }))
  const oldTree = tree(base), newTree = tree(head)
  const text = (ref, path) => git('show', ref + ':' + path)
  const registry = parseAuthorRegistry(JSON.parse(text(base, '.github/module-authors.json')))
  const published = new Set(JSON.parse(text(base, 'sdk/catalog.json')).modules.map(row => 'octabam/' + row.id))
  // The generated Digitakt/Digitone/Analog Rytm list (not committed) holds every module folder on main.
  for (const path of oldTree.keys()) { const folder = path.match(/^sdk\/(digitakt|digitone|analog-rytm-mkii|analog-four-mkii)\/modules\/([^/_][^/]*)\/modwerk\.module\.json$/); if (folder) published.add(folder[1] + '/' + folder[2]) }
  const modules = [...oldTree.keys()].filter(path => /^sdk\/(octabam|digitakt|digitone|analog-rytm-mkii|analog-four-mkii)\/modules\/[^/]+\/(octamod|modwerk)\.module\.json$/.test(path)).map(path => {
    const parts = path.split('/'), document = JSON.parse(text(base, path))
    return { folder: parts.slice(0, -1).join('/'), document, published: published.has(parts[1] + '/' + document.id) }
  }).filter(module => module.published)
  const changes = git('diff', '--name-only', '--no-renames', '-z', base, head, '--').split('\0').filter(Boolean).map(path => {
    const old = oldTree.get(path), next = newTree.get(path)
    const inspect = path.endsWith('.elemod') || path.endsWith('.json') && (!modules.some(module => path.startsWith(module.folder + '/')) || /\/(octamod|modwerk)\.module\.json$/.test(path))
    return { path, before: old ? inspect ? text(base, path) : 'present' : null, after: next ? inspect ? text(head, path) : 'present' : null,
      regular: [old, next].every(entry => !entry || entry.type === 'blob' && ['100644', '100755'].includes(entry.mode)) }
  })
  let vendor
  if (oldTree.has(UPSTREAM_CATALOG)) {
    // The served catalog (upstream plus every module record, generated and not committed), at the base and the head.
    const served = (ref, files) => assembleCatalog(path => files.has(path) ? text(ref, path) : undefined, [...files.keys()]).catalog
    const catalog = served(base, oldTree)
    let next
    try { next = served(head, newTree) } catch (error) { throw new Error('The module records do not form a valid elekloader catalog: ' + error.message, { cause: error }) }
    const artifacts = Object.fromEntries(catalog.mods.filter(row => modules.some(module => module.document.id === row.id && module.document.machine + '-mk1' === row.device)).map(row => [row.file, JSON.parse(text(base, 'vendor/elekloader/catalog/' + row.file))]))
    vendor = { catalog, next, lock: JSON.parse(text(base, 'vendor/elekloader/elekloader.lock.json')), artifacts }
  }
  const authorization = authorizeAuthorUpdate(registry, author, modules, changes, vendor)
  // An update that names a 32-bit address its published source never named (a new hook, stock routine,
  // register or flash location) needs owner review. shortcut: a tripwire, not a sandbox; an address built
  // at run time passes, so the follower hold and the owner notice stay the safety net.
  const addresses = (ref, entries, folder) => new Set([...entries.keys()].filter(path => path.startsWith(folder + '/') && /\.(c|h|s|asm|inc|cpp|py)$/i.test(path))
    .flatMap(path => (text(ref, path).match(/\b0x[0-9a-f]{8}\b/gi) ?? []).map(value => value.toLowerCase())))
  for (const module of modules.filter(module => changes.some(change => change.path.startsWith(module.folder + '/')))) {
    const known = addresses(base, oldTree, module.folder), added = [...addresses(head, newTree, module.folder)].filter(value => !known.has(value))
    if (added.length) throw new Error('New addresses in ' + module.folder + ' (' + added.slice(0, 5).join(', ') + '): reaching firmware or hardware the published version did not touch needs owner review.')
  }
  const scope = readChangeScope({ root, base, head })
  if (scope.elemod && authorization.elemod && !authorization.vendorPackages) throw new Error('A Digitakt/Digitone runtime update needs matching authored elekloader packages; source or version changes alone cannot replace the downloaded code.')
  return { ...authorization, elemodCompile: scope.elemod }
}
