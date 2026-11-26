// SPDX-License-Identifier: GPL-3.0-or-later
import { readFile, writeFile } from 'node:fs/promises'
import { basename } from 'node:path'
import { build } from '../vendor/elekloader/kit/src/patch.ts'
import { buildDt2RenderFirmware } from '../src/engine/elekloader/dt2-render-build.ts'
import { parseBuildMods } from '../src/engine/elekloader/digi-preflight.ts'
import { readEle3Syx } from '../src/engine/elektron/ele3.ts'
import { planDt2Render, unpackDt2SharcSection } from '../src/engine/elektron/dt2-sharc.ts'

const [stockPath, outputPath] = process.argv.slice(2)
if (!stockPath || !outputPath) {
  throw new Error('Usage: node scripts/dt2-render-probe.ts <private OS 1.17 .syx> <private probe output .syx>')
}

const coreName = 'core-1.0.elemod'
const [stock, core] = await Promise.all([
  readFile(stockPath),
  readFile(new URL('../vendor/elekloader/catalog/' + coreName, import.meta.url)),
])
const [kit] = await build({ path: basename(stockPath), data: stock }, [{ path: coreName, data: core }], 'MW01')
if (!kit?.syx) throw new Error('The kit did not produce a .syx')

const sharc = unpackDt2SharcSection(readEle3Syx(stock).stored.get(7))
const dispatcher = 0x200a0000
// Unconditional 48-bit RTS, padded to a loader word boundary.
const callback = (address: number) => ({ address, bytes: Uint8Array.of(0xbe, 0x0a, 0, 0, 0, 0, 0, 0) })
const plan = await planDt2Render(sharc, dispatcher, [callback(dispatcher + 0x200)], [callback(dispatcher + 0x300)])
if (!plan) throw new Error('The probe did not produce a render plan')
const mods = parseBuildMods([{ name: coreName, bytes: core }])
const { output, facts } = await buildDt2RenderFirmware(stock, kit.syx, mods, plan)
await writeFile(outputPath, output, { flag: 'wx' })
console.log(JSON.stringify(facts, null, 2))
