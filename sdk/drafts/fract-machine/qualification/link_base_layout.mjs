// Private layout receipt only. Stock bytes remain in memory; no USB or firmware output.
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { URL, pathToFileURL } from 'node:url'
import { parseArgs, TextEncoder } from 'node:util'

async function main() {
  const { values } = parseArgs({ options: { 'base-tree': { type: 'string' }, stock: { type: 'string' }, output: { type: 'string' } } })
  if (!values['base-tree'] || !values.stock || !values.output) throw new Error('Name --base-tree, --stock and a new --output layout receipt')
  const root = pathToFileURL(resolve(values['base-tree']) + '/')
  const { fillBase, baseIdentity } = await import(new URL('src/engine/elekloader/octatrack-base.ts', root))
  const { recoverStockDsp } = await import(new URL('src/engine/stock-dsp.ts', root))
  const formats = await import(new URL('vendor/elekloader/kit/src/formats.ts', root))
  const { build } = await import(new URL('vendor/elekloader/kit/src/patch.ts', root))
  const stock = new Uint8Array(readFileSync(values.stock))
  const [parsed, device] = await formats.load(stock)
  const cores = await recoverStockDsp(formats.mainImage(parsed, device))
  const text = fillBase(readFileSync(new URL('src/engine/assets/octatrack-base.elemod', root), 'utf8'),
    JSON.parse(readFileSync(new URL('src/engine/assets/octatrack-base-fills.json', root), 'utf8')), cores)
  const [, manifest] = await build({ path: values.stock, data: stock },
    [{ path: '/octatrack-base.elemod', data: new TextEncoder().encode(text) }], 'ELEKLOADER')
  if (!manifest._map || !manifest.link) throw new Error('The base did not produce a linked layout')
  writeFileSync(values.output, JSON.stringify({ baseIdentity: baseIdentity(text), link: manifest.link,
    _map: Object.fromEntries(manifest._map) }, null, 2) + '\n', { flag: 'wx' })
}

await main()
