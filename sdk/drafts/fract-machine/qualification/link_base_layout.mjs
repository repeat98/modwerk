// Private layout receipt only. Stock bytes remain in memory; no USB or firmware output.
import { readFileSync, writeFileSync } from 'node:fs'
import { parseArgs } from 'node:util'
import { fillBase, baseIdentity } from '../../../../src/engine/elekloader/octatrack-base.ts'
import { recoverStockDsp } from '../../../../src/engine/stock-dsp.ts'
import * as formats from '../../../../vendor/elekloader/kit/src/formats.ts'
import { build } from '../../../../vendor/elekloader/kit/src/patch.ts'

const { values } = parseArgs({ options: { stock: { type: 'string' }, output: { type: 'string' } } })
if (!values.stock || !values.output) throw new Error('Name --stock and a new --output layout receipt')
const root = new URL('../../../../', import.meta.url)
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
