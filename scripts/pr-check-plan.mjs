// The local check and the PR matrix select work from the same diff. A change to the
// checker itself, dependencies, an unknown input or a non-regular file uses every gate.
import { basename, relative, resolve } from 'node:path'
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, realpathSync } from 'node:fs'

import { fileURLToPath } from 'node:url'
import { isDocumentationPath, reachesSdkSuite, scopeFromArgs } from './change-scope.mjs'

const sdkIndependent = new Set(['desktop', 'repository tools', 'site tooling', 'site assets', 'styles', 'database', 'documentation', 'tests', 'release note'])
const testFile = /^(?:src\/.*\.test\.ts|(?:scripts|desktop\/src)\/.*\.test\.mjs)$/
const code = /\.(?:[cm]?js|tsx?)$/
const checks = /^scripts\/(?:check|pr-ready|change-scope|pr-check-plan|machine-slots)\.mjs$/
const catalog = /^(?:sdk\/|vendor\/|public\/(?:licenses|octatrack-modules|zoom-effects|module-media)\/|public\/module-[^/]+\.json$|src\/(?:catalog\/|engine\/assets\/|devices\/(?:machine-contract|machines\.generated|registry)\.)|\.github\/module-authors\.json$)/
const asset = /^(?:public|src)\/.*\.(?:png|webp|jpe?g|gif|svg|ico|woff2?|wav|mp3)$/

function area(path) {
  if (testFile.test(path)) return 'tests'
  if (checks.test(path) || path.endsWith('.d.ts') || /^(?:\.github\/workflows\/|LICENSE|eslint\.config\.|vite(?:st)?\.config\.|tsconfig|package(?:-lock)?\.json$)/.test(path)) return 'full'
  if (/^changelog\/[^/]+\.md$/.test(path)) return 'release note'
  if (catalog.test(path) || /^src\/community\/module-changelogs(?:\/|\.ts$)/.test(path)) return 'module'
  if (/^docs\/.*\.(?:png|svg|jpe?g|webp|gif)$/i.test(path) || path.toLowerCase().endsWith('.md')) return 'documentation'
  if (/^src\/.*\.css$/.test(path)) return 'styles'
  if (/^migrations\/.*\.sql$/.test(path)) return 'database'
  if (/^(?:server\/|functions\/|worker\.ts$|wrangler(?:\.worker)?\.jsonc$)/.test(path)) return 'worker'
  if (/^desktop\//.test(path)) return 'desktop'
  if (/^src\/release\//.test(path)) return 'release'
  if (/^scripts\/(?:maintenance-bot\/|agent-|discord|diagnostics-|lane\.|directory-lock\.|pr-triage\.|retest-queue\.)/.test(path)) return 'repository tools'
  if (/^scripts\/(?:module-pages|forum-pages|site-pages|page-html|seo(?:-content)?|retain-module-media)\./.test(path)) return 'site tooling'
  if (/^scripts\/(?:author-|release-|verify-merge-|sync-module-releases|auto-merge-author-)/.test(path)) return 'release'
  if (/^scripts\/(?:module|machine|build-|verify-|import-|sdk-|base-|octatrack|elemod|elekloader|dsp-|package-|mirror-|prepare-|frontend-mcp|runtime|license|perf-|firmware-|stock-|zoom-)/.test(path)) return 'tooling'
  if (asset.test(path) || /^(?:public\/(?:_headers|app-startup\.js|push-sw\.js|manifest\.webmanifest|robots\.txt|auth\/.*\.html)$|redirect\/|index\.html$)/.test(path)) return 'site assets'
  if (/^src\//.test(path) && code.test(path)) return 'frontend'
  return 'full'
}

export function planPrChecks(scope) {
  const files = scope?.files ?? []
  const areas = new Set(files.map(area))
  // A manifest with documentation-only changes stays on the existing documentation path.
  const full = !files.length || scope?.wide || areas.has('full')
  const has = (...names) => names.some(name => areas.has(name))
  const notesOnly = areas.size === 1 && has('release note')
  const docs = !full && !!scope?.documentation && !notesOnly
  const docContracts = docs || files.some(file => area(file) !== 'release note' && isDocumentationPath(file))
  const lintFiles = files.filter(file => code.test(file) && !file.startsWith('vendor/'))
  const shared = files.some(file => /^src\/(?:engine|catalog|config|devices)\//.test(file) && !testFile.test(file) && !file.endsWith('.tsx'))
  const native = !docs && (full || has('module', 'tooling') || shared || !!(scope?.modules || scope?.elemod || scope?.windows || scope?.base))
  const metadata = native || docContracts
  // Native-only sources are compiled and qualified by their machine checks. Metadata
  // and published assets can also change what the website imports or serves.
  const moduleWebInputs = files.some(file => area(file) === 'module' && !/\.(?:c|cc|cpp|h|hpp|s|asm|ld|py|sh)$/i.test(file))
  const bundle = full || has('styles', 'frontend', 'site assets', 'site tooling', 'tooling') || moduleWebInputs || files.some(file => file.startsWith('src/release/'))
  const sdk = !docs && (full || files.some(file => reachesSdkSuite(file) && !sdkIndependent.has(area(file))))
  const inline = !full && !docs && !has('module', 'tooling', 'worker', 'database')
  const parts = docs || inline ? [] : ['test:1/2', 'test:2/2']
  if (sdk) parts.push('sdk')
  return {
    areas: [...areas].sort(), full, docs, docContracts, metadata, native, sdk, inline, parts, bundle,
    lint: full || lintFiles.length > 0, lintFiles,
    types: full || moduleWebInputs || has('tooling') || files.some(file => /\.tsx?$/.test(file) || /^(?:src|server|functions)\/.*\.json$/.test(file)),
    doctor: native || files.includes('scripts/module-doctor.test.mjs'),
    guides: full || docs || has('documentation', 'module', 'tooling'),
  }
}

// Vite knows imports. These additional families cover discovery by directory, generated
// data, subprocesses and public URLs, which an import graph cannot see.
const fileConsumers = {
  module: /^(?:src\/(?:catalog|config|devices|engine|release|tooling)\/|scripts\/(?:module|machine|octatrack|elemod|package-|frontend-mcp|base-|firmware-|fx-|mirror-|stock-|verify-|zdl-|zoom-|synth-|utility-|usb-|perf-|author-|sync-module|loader-))/,
  tooling: /^(?:scripts\/|src\/(?:tooling|release|catalog)\/|desktop\/src\/)/,
  documentation: /^(?:src\/catalog\/|scripts\/(?:docs|module-pages|site-pages)\.test)/,
  'repository tools': /^(?:scripts\/(?:agent-|discord|lane\.|maintenance-bot\/|pr-|diagnostics-|directory-lock\.)|src\/catalog\/agent-board-context\.)/,
  'site tooling': /^scripts\/(?:app-startup|module-pages|site-pages|forum-pages|seo|retain-module-media)\.test/,
  desktop: /^desktop\/src\//,
  release: /^(?:src\/release\/|scripts\/(?:author|verify|module-source|sync-module|pr-|maintenance-bot\/))/,
  'site assets': /^(?:scripts\/(?:app-startup|module-pages|site-pages|seo|redirect|static-security-policy|push-runtime|retain-module-media)\.test|src\/catalog\/)/,
}

export async function affectedTests(checkout, scope, plan) {
  // Vite resolves symlinked worktrees and temporary directories before building its graph.
  const root = realpathSync(checkout)
  const paths = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z', '--', 'src', 'scripts', 'desktop/src'], { cwd: root, encoding: 'utf8', maxBuffer: 32 * 1024 ** 2 })
  const candidates = [...new Set(paths.split('\0').filter(path => testFile.test(path) && existsSync(resolve(root, path))))]
  const inputs = scope.files
  const inputNames = inputs.filter(path => area(path) !== 'release note')
  const selected = new Set()
  const families = plan.areas.map(name => fileConsumers[name]).filter(Boolean)
  if (plan.docContracts) families.push(fileConsumers.documentation)
  for (const file of candidates) {
    if (inputs.includes(file) || families.some(pattern => pattern.test(file))) {
      selected.add(file)
      continue
    }
    const source = readFileSync(resolve(root, file), 'utf8')
    // Test sources, fixtures and tools also read files by name without importing them.
    if (inputNames.some(path => source.includes(path) || source.includes('/' + basename(path)))) selected.add(file)
  }
  const related = inputs.filter(path => !testFile.test(path) && (code.test(path) || /\.(?:css|json|svg|html)$/.test(path)))
  if (plan.areas.includes('module')) related.push('src/catalog/module-documents.json', 'src/catalog/machine-modules.json', 'src/community/module-changelogs.json')
  if (plan.areas.includes('database')) related.push('src/community/test-server.ts')
  if (inputs.some(path => /^wrangler(?:\.worker)?\.jsonc$/.test(path))) related.push('worker.ts')
  if (inputs.some(path => /^(?:src\/(?:engine|catalog|config|devices|storage)\/|scripts\/frontend-mcp)/.test(path))) {
    for (const file of candidates) if (file.startsWith('scripts/frontend-mcp')) selected.add(file)
  }
  if (related.length) {
    const { createVitest } = await import('vitest/node')
    const runner = await createVitest({ root, run: true, watch: false, related: related.map(path => resolve(root, path)) })
    try {
      for (const spec of await runner.getRelevantTestSpecifications()) selected.add(relative(root, spec.moduleId).split('\\').join('/'))
    } finally { await runner.close() }
  }
  return [...selected].sort()
}

// Vitest rejects a shard larger than its file set. Assign scoped files once, including
// the case where a Worker change has only one test. The full suite keeps Vitest's sharding.
export function filesForShard(files, part) {
  if (!part?.startsWith('test:')) return files
  const [index, count] = part.slice(5).split('/').map(Number)
  if (index < 1 || index > count) throw new Error('Invalid test shard: ' + part)
  return files.filter((_, i) => i % count === index - 1)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const scope = scopeFromArgs(process.argv.slice(2), true)
  const { parts } = planPrChecks(scope)
  console.log('parts=' + JSON.stringify(parts))
  for (const key of ['modules', 'windows', 'elemod', 'logger']) console.log(key + '=' + scope[key])
}
