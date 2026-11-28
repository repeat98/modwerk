// SPDX-License-Identifier: GPL-3.0-or-later
// How full the committed Octatrack base is. A base update reaches flash through a RAM buffer in the base that writes
// it (flash.c `packed[FLASH_CONTAINER_BYTES]`, less the page it keeps back), so the packed container must fit that
// buffer. The slot behind it holds more (slots.h), and MAIN may be up to the 1.5 MiB a USB update takes
// (build_core.py USB_UPDATE_BYTES): the buffer is the limit that binds first. The container packs the stock section
// with the base, so its size needs the stock OS. --write measures the committed base in every layout, built as the
// site builds it, and records the sizes in base-sizes.json; everything else reads that record without firmware.
//
//   node scripts/base-size.mjs            Octatrack base 0.7: X of 851,712 container bytes, N free; +D since <previous base>
//   node scripts/base-size.mjs --check    the same, and fails on a missing or stale record or a base over a limit (npm run check)
//   node scripts/base-size.mjs --stock OCTATRACK_OS1.40C.bin --write   after `npm run octatrack:base -- --beta --write`
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'

export const SIZES = 'sdk/machines/octatrack/base-sizes.json'
const SOURCES = 'sdk/machines/octatrack/elekloader'
const ASSETS = 'src/engine/assets/octatrack-base'
const FIX = `run node scripts/base-size.mjs --stock OCTATRACK_OS1.40C.bin --write and commit ${SIZES}`

/** A changed path that can move the committed base's size or its limits (npm run check runs the size check then). */
export const touchesBaseSize = path =>
  /^(?:src\/engine\/assets\/octatrack-base[^/]*|sdk\/machines\/octatrack\/(?:base-[^/]*|elekloader\/.*)|scripts\/base-size\.mjs)$/.test(path)

/** The limits, read from the base's source as build_core.py reads them. */
export function baseLimits(root) {
  const flash = readFileSync(join(root, SOURCES, 'flash.h'), 'utf8').match(/#define FLASH_CONTAINER_BYTES (0x[0-9a-f]+)u/)
  const usb = readFileSync(join(root, SOURCES, 'build_core.py'), 'utf8').match(/^USB_UPDATE_BYTES = (0x[0-9a-f]+)$/m)
  if (!flash || !usb) throw new Error(`${SOURCES}: FLASH_CONTAINER_BYTES (flash.h) or USB_UPDATE_BYTES (build_core.py) moved; read it anew in scripts/base-size.mjs.`)
  return { container: Number(flash[1]) - 256, main: Number(usb[1]) }  // flash.c keeps one 256-byte page of the buffer back
}

/** How the site names a base: its version, or the start of its identity for a base from before versions. */
export const baseName = (identity, versions) => versions.bases.find(base => base.identities.includes(identity))?.version ?? identity.slice(0, 8)
const bytes = value => value.toLocaleString('en-US')
const largest = record => Object.entries(record.layouts).reduce((a, b) => b[1].container > a[1].container ? b : a)

/** base-sizes.json's line for the committed base (`binding`: base-binding.json) and what is wrong with it. */
export function baseSizeReport({ sizes, binding, versions, limits }) {
  const name = baseName(binding.identity, versions), at = sizes.bases.findIndex(base => base.identity === binding.identity), record = sizes.bases[at]
  if (!record) return { line: `Octatrack base ${name}: no size recorded`, problems: [`${SIZES} has no record of the committed base ${name} (${binding.identity.slice(0, 8)}): ${FIX}.`] }
  const problems = [], layouts = Object.keys(binding.variants ?? { 'tracks-main-cue': binding.identity }).sort(), recorded = Object.keys(record.layouts).sort()
  if (at !== sizes.bases.length - 1) problems.push(`${SIZES}: the committed base ${name} is not the last record; ${FIX}.`)
  if (recorded.join() !== layouts.join()) problems.push(`${SIZES} records the layouts ${recorded.join(', ')} of base ${name}, which has ${layouts.join(', ')}: ${FIX}.`)
  for (const [layout, size] of Object.entries(record.layouts)) {
    if (size.container > limits.container) problems.push(`Base ${name}, ${layout}: its packed container is ${bytes(size.container)} bytes, ${bytes(size.container - limits.container)} more than the ${bytes(limits.container)} a base on a unit takes to write it (flash.c packed[FLASH_CONTAINER_BYTES], less one page).`)
    if (size.main > limits.main) problems.push(`Base ${name}, ${layout}: its MAIN image is ${bytes(size.main)} bytes, ${bytes(size.main - limits.main)} more than a USB update takes (build_core.py USB_UPDATE_BYTES, ${bytes(limits.main)}).`)
  }
  const [layout, size] = largest(record), free = limits.container - size.container, previous = sizes.bases[at - 1]
  const change = previous && size.container - largest(previous)[1].container
  const since = previous ? `; ${change < 0 ? '-' : '+'}${bytes(Math.abs(change))} since ${previous.base}` : ''
  return { line: `Octatrack base ${name}: ${bytes(size.container)} of ${bytes(limits.container)} container bytes, ${free < 0 ? bytes(-free) + ' over' : bytes(free) + ' free'}${since}`
    + ` (largest layout ${layout}; MAIN ${bytes(size.main)} of ${bytes(limits.main)})`, problems }
}

const readJson = (root, path) => JSON.parse(readFileSync(join(root, path), 'utf8'))
const committed = root => ({ sizes: existsSync(join(root, SIZES)) ? readJson(root, SIZES) : { schema: 1, bases: [] }, binding: readJson(root, 'sdk/machines/octatrack/base-binding.json'),
  versions: readJson(root, 'sdk/machines/octatrack/base-versions.json'), limits: baseLimits(root) })

/** npm run check: the line, or an error naming every problem. */
export function checkBaseSize(root) {
  const { line, problems } = baseSizeReport(committed(root))
  if (problems.length) throw new Error(problems.join('\n'))
  return line
}

/** base-sizes.json with `record` as the newest base, in place of an earlier record of the same base or version. */
export const withRecord = (sizes, record) => ({ schema: 1, bases: [...sizes.bases.filter(base => base.identity !== record.identity && base.base !== record.base), record] })

/** A base package's MAIN and container bytes in each layout, built from `stock` as the site builds it. */
export async function measureBase({ stock, text, fills, variants, binding }) {
  const [{ buildBase }, { applyVariantPatch }, formats] = await Promise.all([import('../src/engine/elekloader/octatrack-base.ts'),
    import('../src/engine/elekloader/base-variants.ts'), import('../src/engine/elektron/firmware-formats.ts')])
  const [, device] = await formats.load(stock)
  const size = async (packageText, packageFills, identity, layout) => {
    const built = await buildBase(stock, packageText, packageFills)
    if (built.base !== identity) throw new Error(`${layout}: the package builds base ${built.base.slice(0, 8)}, not ${identity.slice(0, 8)} (base-binding.json).`)
    const parsed = formats.parse(built.bin, device)
    return { main: formats.mainImage(parsed, device).length, container: parsed.container.length }
  }
  const layouts = Object.entries(binding.variants ?? { 'tracks-main-cue': binding.identity }), sizes = {}
  for (const [layout, identity] of layouts) {
    const variant = identity === binding.identity ? null : variants.variants.find(item => item.layout === layout)
    if (identity !== binding.identity && !variant) throw new Error(`${layout}: no variant in ${ASSETS}-variants.json.`)
    sizes[layout] = variant ? await size(applyVariantPatch(text, variant.patch, variant.packageSha256), variant.fills, identity, layout) : await size(text, fills, identity, layout)
  }
  return sizes
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { values: args } = parseArgs({ options: { check: { type: 'boolean', default: false }, write: { type: 'boolean', default: false }, stock: { type: 'string' } } })
  const root = fileURLToPath(new URL('..', import.meta.url))
  if (args.write) {
    if (!args.stock) throw new Error('Usage: node scripts/base-size.mjs --stock OCTATRACK_OS1.40C.bin --write')
    const { sizes, binding, versions } = committed(root)
    const layouts = await measureBase({ stock: new Uint8Array(readFileSync(args.stock)), text: readFileSync(join(root, ASSETS + '.elemod'), 'utf8'),
      fills: readJson(root, ASSETS + '-fills.json'), variants: readJson(root, ASSETS + '-variants.json'), binding })
    writeFileSync(join(root, SIZES), JSON.stringify(withRecord(sizes, { base: baseName(binding.identity, versions), identity: binding.identity, layouts }), null, 1) + '\n')
  }
  const { line, problems } = baseSizeReport(committed(root))
  console.log(line)
  for (const problem of problems) console.error(problem)
  if (problems.length && args.check) process.exitCode = 1
}
