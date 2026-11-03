import { readFile, readdir, stat } from 'node:fs/promises'
import { dirname, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

export const SHARED_LICENSE = 'GPL-3.0-or-later OR Elastic-2.0'
const slash = path => path.replaceAll('\\', '/')

async function files(root, folder) {
  const entries = await readdir(resolve(root, folder), { withFileTypes: true })
  const nested = await Promise.all(entries.map(entry => {
    const path = folder + '/' + entry.name
    return entry.name === 'node_modules' ? [] : entry.isDirectory() ? files(root, path) : [path]
  }))
  return nested.flat()
}
const exists = path => stat(path).then(() => true, () => false)
// Python or shell that runs another file inside its own process, as an import would.
const LOADS_IN_PROCESS = /\bsys\.path\b|\bimportlib\b|\brunpy\b|\bexec\(|SourceFileLoader|^\s*(source|\.)\s/m

/** Follow emitted imports: type-only references do not become backend code. */
export function runtimeImports(source, path, lenient = false) {
  const output = ts.transpileModule(source, { fileName: path, compilerOptions: {
    module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2023, jsx: ts.JsxEmit.Preserve,
  } }).outputText
  const tree = ts.createSourceFile(path, output, ts.ScriptTarget.ESNext, true, ts.ScriptKind.JSX)
  const imports = []
  function visit(node) {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier) imports.push(node.moduleSpecifier.text)
    if (ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword || ts.isIdentifier(node.expression) && node.expression.text === 'require')) {
      if (node.arguments.length === 1 && ts.isStringLiteral(node.arguments[0])) imports.push(node.arguments[0].text)
      else if (!lenient) throw new Error(path + ': licence audit requires a literal module import')
    }
    // Vite also bundles workers and assets referenced relative to this module.
    if (ts.isNewExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'URL' && node.arguments?.length === 2) {
      const [specifier, base] = node.arguments
      if (ts.isStringLiteral(specifier) && specifier.text.startsWith('.') && !/^\.\.?\/?$|\/$/.test(specifier.text) && ts.isPropertyAccessExpression(base)
        && ts.isMetaProperty(base.expression) && base.expression.keywordToken === ts.SyntaxKind.ImportKeyword && base.name.text === 'url') imports.push(specifier.text)
    }
    ts.forEachChild(node, visit)
  }
  visit(tree)
  return imports
}

async function localImport(root, parent, specifier) {
  const path = resolve(root, dirname(parent), specifier.split('?')[0])
  const name = slash(relative(root, path))
  if (name.startsWith('../') || name === '..') throw new Error(parent + ': import escapes the repository')
  for (const candidate of [path, path + '.ts', path + '.tsx', path + '.mjs', path + '.js', path + '.json', resolve(path, 'index.ts')]) {
    try { if ((await stat(candidate)).isFile()) return slash(relative(root, candidate)) }
    catch (error) { if (error.code !== 'ENOENT' && error.code !== 'ENOTDIR') throw error }
  }
  throw new Error(parent + ': unresolved licence-audit import ' + specifier)
}

const safePath = path => typeof path === 'string' && /^[\w./-]+$/.test(path) && !path.startsWith('/') && !path.split('/').includes('..')
export async function checkPlatformLicenses(root) {
  const manifest = JSON.parse(await readFile(resolve(root, 'LICENSES/platform.json'), 'utf8'))
  if (manifest.schemaVersion !== 1 || manifest.licensor !== 'Jannik Aßfalg (repeat98)'
    || JSON.stringify(manifest.backendPaths) !== JSON.stringify(['server/', 'functions/', 'migrations/', 'worker.ts'])) throw new Error('Invalid platform licence scope')
  for (const key of ['sharedFiles', 'dataFiles', 'pipelineFiles']) {
    if (!Array.isArray(manifest[key]) || new Set(manifest[key]).size !== manifest[key].length || !manifest[key].every(safePath)) throw new Error('Invalid platform licence inventory: ' + key)
  }
  const shared = new Set(manifest.sharedFiles), data = new Set(manifest.dataFiles), pipeline = new Set(manifest.pipelineFiles)
  const backend = path => manifest.backendPaths.some(prefix => prefix.endsWith('/') ? path.startsWith(prefix) : path === prefix)
  // Owner-written workflows and build, release, device and service tools outside the backend folders: ELv2-only too.
  for (const path of pipeline) {
    if (!/^(scripts\/.+\.(mjs|py|sh)|\.github\/workflows\/[\w.-]+\.yml)$/.test(path)) throw new Error('Invalid pipeline path: ' + path)
    const source = await readFile(resolve(root, path), 'utf8'), mark = path.endsWith('.mjs') ? '//' : '#'
    if (!source.replace(/^#!.*\n/, '').startsWith(mark + ' SPDX-License-Identifier: Elastic-2.0\n' + mark + ' Copyright (c) 2026 ' + manifest.licensor + '\n')) throw new Error(path + ': missing Elastic-2.0 declaration')
    if (/\.(py|sh)$/.test(path) && LOADS_IN_PROCESS.test(source)) throw new Error(path + ': ELv2 pipeline script loads other code in-process; needs an ownership/licence review')
    if (path.endsWith('.py')) for (const [, from, names] of source.matchAll(/^\s*(?:from\s+(\w+)|import\s+([\w, ]+))/gm)) {
      for (const name of from ? [from] : names.split(',').map(name => name.trim().split(' ')[0])) {
        const sibling = slash(relative(root, resolve(root, dirname(path), name)))
        if (!pipeline.has(sibling + '.py') && (await exists(resolve(root, sibling + '.py')) || await exists(resolve(root, sibling)))) throw new Error(path + ': ELv2 pipeline script imports the local module ' + name)
      }
    }
  }
  for (const path of shared) {
    if (!path.startsWith('src/') || !path.endsWith('.ts')) throw new Error('Invalid shared source path: ' + path)
    const source = await readFile(resolve(root, path), 'utf8')
    if (!source.startsWith('// SPDX-License-Identifier: ' + SHARED_LICENSE + '\n// Copyright (c) 2026 ' + manifest.licensor + '\n')) throw new Error(path + ': missing shared licence declaration')
  }
  for (const path of data) {
    if (!path.endsWith('.json')) throw new Error('Invalid independent data path: ' + path)
    JSON.parse(await readFile(resolve(root, path), 'utf8'))
  }
  const elastic = await readFile(resolve(root, 'LICENSES/Elastic-2.0.txt'), 'utf8')
  const serverTerms = await readFile(resolve(root, 'server/LICENSE'), 'utf8')
  if (serverTerms !== 'Modwerk platform backend\nCopyright (c) 2026 ' + manifest.licensor + '\n\n' + elastic) throw new Error('server/LICENSE: platform terms are stale')
  if (JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8')).license !== 'SEE LICENSE IN LICENSE') throw new Error('package.json: mixed repository needs the scoped licence pointer')

  async function graph(entries, kind) {
    const queue = [...entries], seen = new Set()
    while (queue.length) {
      const path = queue.pop()
      if (seen.has(path)) continue
      seen.add(path)
      if (kind !== 'frontend' && !backend(path) && !shared.has(path) && !data.has(path) && !(kind === 'pipeline' && pipeline.has(path))) throw new Error(path + ': ' + kind + ' runtime dependency needs an ownership/licence review')
      if (kind === 'frontend' && (backend(path) || pipeline.has(path))) throw new Error(path + ': GPL frontend must not import the ELv2-only ' + (backend(path) ? 'backend implementation' : 'pipeline'))
      if (!/\.(ts|tsx|mjs|js)$/.test(path)) continue
      const imports = runtimeImports(await readFile(resolve(root, path), 'utf8'), path)
      for (const specifier of imports) if (specifier.startsWith('.')) queue.push(await localImport(root, path, specifier))
    }
    return seen
  }
  const backendEntries = ['worker.ts', ...(await files(root, 'server')).filter(path => path.endsWith('.ts')), ...(await files(root, 'functions')).filter(path => path.endsWith('.ts'))]
  const reached = new Set([...await graph(backendEntries, 'backend'), ...await graph([...pipeline].filter(path => path.endsWith('.mjs')), 'pipeline')])
  await graph(['src/main.tsx'], 'frontend')
  for (const path of [...shared, ...data]) if (!reached.has(path)) throw new Error(path + ': remove unused paths from the backend licence inventory')

  // GPL code must not pull ELv2 pipeline code into its own program; running it as a separate program is fine.
  const pipelineName = path => path.slice(path.lastIndexOf('/') + 1), moduleStems = [...pipeline].filter(path => path.endsWith('.mjs')).map(path => pipelineName(path).slice(0, -4))
  const scriptNames = [...pipeline].filter(path => /\.(py|sh)$/.test(path)).map(pipelineName)
  for (const folder of ['scripts', 'src', 'sdk']) {
    if (!await exists(resolve(root, folder))) continue
    for (const path of await files(root, folder)) {
      if (pipeline.has(path) || !/\.(ts|tsx|mts|mjs|js|py|sh)$/.test(path) || /\.d\.m?ts$/.test(path)) continue
      const source = await readFile(resolve(root, path), 'utf8')
      if (/\.(py|sh)$/.test(path)) {
        const name = scriptNames.find(name => source.split('\n').some(line => line.includes(name) && LOADS_IN_PROCESS.test(line)))
        if (name) throw new Error(path + ': GPL code must not load the ELv2 pipeline script ' + name + ' in-process')
      } else if (moduleStems.some(stem => source.includes(stem))) {
        for (const specifier of runtimeImports(source, path, true)) {
          if (specifier.startsWith('.') && pipeline.has(await localImport(root, path, specifier))) throw new Error(path + ': GPL code must not import the ELv2 pipeline file ' + specifier)
        }
      }
    }
  }
  return manifest
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
  const inventory = await checkPlatformLicenses(root)
  console.log('Platform licence boundary: ' + inventory.sharedFiles.length + ' shared helpers, ' + inventory.pipelineFiles.length + ' pipeline files; independent backend and GPL frontend checked')
}
