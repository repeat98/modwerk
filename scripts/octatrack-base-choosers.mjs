// SPDX-License-Identifier: GPL-3.0-or-later
// Modwerk's chooser composer (src/engine/choosers.ts, native-verified) for a
// development base: the stock MAIN image on stdin, {modules} as the argument;
// prints the guarded writes that add the modules' rows beside every stock row
// (as the site's default chooser does). Node 24
// (sdk/machines/octatrack/elekloader/dsp_loader.py runs it).
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { registerHooks } from 'node:module'
// The app uses bundler resolution and Vite's import.meta.env; neither exists in Node.
registerHooks({
  resolve(specifier, context, next) {
    const local = specifier.startsWith('./') || specifier.startsWith('../')
    const resolved = local && !path.extname(specifier) ? specifier + '.ts' : specifier
    const attributes = local && resolved.endsWith('.json') ? { type: 'json' } : context.importAttributes
    return { ...next(resolved, { ...context, importAttributes: attributes }), importAttributes: attributes }
  },
  load(url, context, next) {
    const result = next(url, context)
    return url.endsWith('.ts') ? { ...result, source: String(result.source).replaceAll('import.meta.env.DEV', 'false') } : result
  },
})
const { composeChoosers } = await import('../src/engine/choosers.ts')
const meta = JSON.parse(readFileSync(new URL('../src/engine/assets/chooser-metadata.json', import.meta.url), 'utf8'))
const { modules } = JSON.parse(process.argv[2])
const own = modules.map(id => meta.modules.find(module => module.id === id))
if (own.some(module => !module?.fxId || 'replaces' in module)) throw new Error('Only module effects with their own id get a chooser row in this base.')
const image = new Uint8Array(readFileSync(0))
const profile = { fx1: [...meta.stockFx1, ...own.filter(m => m.fx1).map(m => m.key)],
  fx2: [...meta.stockFx2, ...own.filter(m => !m.fx1Only).map(m => m.key)] }
const result = await composeChoosers(image, modules, profile)
const hex = bytes => Buffer.from(bytes).toString('hex')
console.log(JSON.stringify({ chooser: result.chooser, writes: result.writes.map(w => ({ ...w, bytes: hex(w.bytes) })) }))
