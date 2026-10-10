// One source of truth for local checks, PR compilation and release scheduling.
import { execFileSync } from 'node:child_process'
import { readFileSync, lstatSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { manifestBuildFields } from './module-source.mjs'

const moduleFolder = /^sdk\/(octabam|digitakt|digitone)\/modules\/[^/]+\//
const manifest = /^sdk\/(octabam|digitakt|digitone)\/modules\/[^/]+\/(octamod|modwerk)\.module\.json$/
const catalogs = new Set(['src/catalog/module-documents.json', 'src/catalog/machine-modules.json'])
const json = text => text === null ? null : JSON.parse(text)
const canonical = value => JSON.stringify(value, (_, item) => item && typeof item === 'object' && !Array.isArray(item)
  ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b))) : item)

/** Everything beyond these presentation fields remains a code/behaviour change. */
export function withoutDocumentation(document) {
  if (!document) return document
  const result = { ...document }
  for (const key of ['presentation', 'access', 'controls', 'tests', 'media']) delete result[key]
  return result
}
function catalogIdentity(value) {
  if (Array.isArray(value)) return value.map(catalogIdentity)
  if (!value || typeof value !== 'object') return value
  if (value.id && value.version) return withoutDocumentation(value)
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, catalogIdentity(item)]))
}
export function isDocumentationPath(path) {
  return path === 'src/community/module-changelogs.json' || /\.md$/i.test(path) || !!(moduleFolder.test(path) && /^(media|presentation|evidence)\//.test(path.replace(moduleFolder, '')) && /\.(png|svg|jpe?g|webp|gif|wav|mp3|flac|ogg|mp4|webm|json|txt)$/i.test(path))
    || moduleFolder.test(path) && path.endsWith('/qualification.example.json')
    || /^docs\/.*\.(png|svg|jpe?g|webp|gif)$/i.test(path)
}
export function isDocumentationChange({ path, before, after, regular = true }) {
  if (!regular) return false
  if (isDocumentationPath(path)) return true
  if (before === null || after === null) return false // New/removed modules and catalogs are never prose edits.
  if (manifest.test(path)) return canonical(withoutDocumentation(json(before))) === canonical(withoutDocumentation(json(after)))
  if (catalogs.has(path)) return canonical(catalogIdentity(json(before))) === canonical(catalogIdentity(json(after)))
  return false
}

function digiFirmwareFields(text) {
  const document = json(text)
  if (!document) return null
  // Version/credit/title changes alter displayed metadata, not the linked firmware.
  const result = withoutDocumentation(document)
  for (const key of ['version', 'name', 'category', 'author', 'maintainers', 'license', 'evidence']) delete result[key]
  return result
}
function nativeChange(change, machine) {
  const { path, before, after } = change
  if (isDocumentationPath(path)) return false
  const match = path.match(manifest)
  if (match) {
    if ((machine === 'octatrack') !== (match[1] === 'octabam')) return false
    if (before === null || after === null) return true
    return machine === 'octatrack' ? manifestBuildFields(before) !== manifestBuildFields(after)
      : canonical(digiFirmwareFields(before)) !== canonical(digiFirmwareFields(after))
  }
  if (path === 'sdk/catalog.json' && machine === 'octatrack' && before !== null && after !== null) {
    const identity = text => { const value = json(text); return { sourceRevision: value.sourceRevision, modules: value.modules.map(({ id, version }) => ({ id, version })) } }
    return canonical(identity(before)) !== canonical(identity(after))
  }
  const common = /^sdk\/(build|runtime)\//.test(path)
  if (machine === 'octatrack') return common || /^sdk\/octabam\/(modules|platform|tools|dsp|licenses)\//.test(path)
    || path === 'sdk/catalog.json' || /^src\/engine\/assets\/(?!elemod\/)/.test(path)
    || /^scripts\/(build-module-packages\.py|build-utility-packages\.py|build-usb-audio-packages\.py|build-modules-isolated\.sh|import-module-build\.mjs|module-source\.mjs)$/.test(path)
  return common || /^sdk\/(digitakt|digitone|elemod|machines)\//.test(path) || /^vendor\/elekloader\/(catalog\/|elekloader\.lock\.json$)/.test(path)
    || /^sdk\/octabam\/(scripts\/vendor\.sh|tools\/patches\/|tools\/harness\/dsp_host)/.test(path)
    || /^scripts\/(build-elemod[^/]*|elemod-elf\.mjs|verify-elemod-source-parity\.mjs)$/.test(path)
    || /^src\/engine\/assets\/elemod\//.test(path)
}
function compilerJob(text, name) {
  const lines = text?.split('\n') ?? [], start = lines.indexOf('  ' + name + ':')
  if (start < 0) return ''
  let end = start + 1
  while (end < lines.length && !/^ {2}[a-z][\w-]*:$/.test(lines[end])) end++
  return lines.slice(start, end).filter(line => !/^ {4}(needs|if):/.test(line)).join('\n').trimEnd()
}
function workerCatalog(value) {
  const modules = Array.isArray(value.modules) ? value.modules : Object.values(value.modules ?? value)
  return modules.map(module => ({ id: module.id, machine: module.machine, name: module.name, version: module.version,
    author: module.author, maintainers: module.maintainers, summary: module.presentation?.summary, evidence: module.evidence?.tier,
    testSummary: module.tests?.summary })).sort((a, b) => String(a.id).localeCompare(String(b.id)))
}
// Whole trees the Worker compiles from: a test checks that every file worker.ts imports falls under these, so a new
// import cannot silently miss the deploy. A few frontend-only files here only cause a harmless extra deploy.
const workerTrees = /^(server|migrations|src\/(community|catalog|devices|config|legal))\//
const workerFiles = ['worker.ts', 'wrangler.worker.jsonc', 'package-lock.json', 'src/hosting.ts', 'src/support.ts', 'sdk/catalog.json', '.github/workflows/worker.yml', '.github/module-authors.json']
function workerChange({ path, before, after }) {
  if (catalogs.has(path) && before !== null && after !== null) return canonical(workerCatalog(json(before))) !== canonical(workerCatalog(json(after)))
  if (/\.test\.ts$/.test(path) || /\.tsx$/.test(path) || isDocumentationPath(path)) return false
  return workerTrees.test(path) || workerFiles.includes(path)
}

export function classifyChanges(changes) {
  const scope = { documentation: changes.length > 0 && changes.every(isDocumentationChange), modules: false, elemod: false, windows: false, worker: false, logger: false }
  for (const change of changes) {
    scope.modules ||= nativeChange(change, 'octatrack')
    scope.elemod ||= nativeChange(change, 'elemod')
    if (change.path === '.github/workflows/module-pr.yml') {
      scope.modules ||= compilerJob(change.before, 'octatrack-source') !== compilerJob(change.after, 'octatrack-source')
      scope.elemod ||= compilerJob(change.before, 'elemod-source') !== compilerJob(change.after, 'elemod-source')
    }
    if (change.path === '.github/workflows/pages.yml') scope.modules ||= compilerJob(change.before, 'source-packages') !== compilerJob(change.after, 'source-packages')
    scope.worker ||= workerChange(change)
    scope.logger ||= change.path.startsWith('sdk/runtime/logging/') && !isDocumentationPath(change.path)
    scope.windows ||= /^src\/catalog\/module-folder\.|^scripts\/(modules|module-qualification)\.mjs$/.test(change.path)
  }
  scope.windows ||= scope.modules || scope.elemod
  return scope
}

/** Compare exact Git trees; local checks also include unstaged and untracked edits. */
export function readChangeScope({ root, base, head = null }) {
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 32 * 1024 * 1024 })
  const commit = git('rev-parse', '--verify', base + '^{commit}').trim()
  if (head) git('rev-parse', '--verify', head + '^{commit}')
  const names = git('diff', '--name-only', '--no-renames', '-z', commit, ...(head ? [head] : []), '--').split('\0').filter(Boolean)
  if (!head) names.push(...git('ls-files', '--others', '--exclude-standard', '-z').split('\0').filter(Boolean))
  const read = (ref, path) => {
    if (!ref) {
      try { return { text: readFileSync(resolve(root, path), 'utf8'), regular: lstatSync(resolve(root, path)).isFile() } }
      catch (error) { if (error.code === 'ENOENT') return { text: null, regular: true }; throw error }
    }
    const entry = git('ls-tree', ref, '--', path).trim()
    if (!entry) return { text: null, regular: true }
    return { text: git('show', ref + ':' + path), regular: entry.startsWith('100644 ') || entry.startsWith('100755 ') }
  }
  return classifyChanges([...new Set(names)].map(path => {
    // Only manifests/catalogs/workflows need their contents; never dump image or firmware bytes.
    const inspect = manifest.test(path) || catalogs.has(path) || path === 'sdk/catalog.json' || /^\.github\/workflows\/(module-pr|pages)\.yml$/.test(path)
    if (!inspect) return { path, before: '', after: '', regular: true }
    const before = read(commit, path), after = read(head, path)
    return { path, before: before.text, after: after.text, regular: before.regular && after.regular }
  }))
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2), get = flag => args[args.indexOf(flag) + 1]
  if (!args.includes('--base') || !get('--base')) throw new Error('Usage: change-scope.mjs --base <commit> [--head <commit>]')
  const scope = readChangeScope({ root: resolve(fileURLToPath(new URL('..', import.meta.url))), base: get('--base'), head: args.includes('--head') ? get('--head') : null })
  for (const [key, value] of Object.entries(scope)) console.log(key + '=' + value)
}
