import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import LOCK from '../../../vendor/elekloader/elekloader.lock.json'
import CATALOG from '../../../vendor/elekloader/catalog/catalog.json'
import RYTM from '../../../sdk/machines/analog-rytm-mkii/machine.json'
import RYTM_BASE from '../../../sdk/machines/analog-rytm-mkii/base-binding.json'
import RYTM_INTERFACE from '../../../sdk/analog-rytm-mkii/core-profile/interface.json'
import * as kit from '../../../vendor/elekloader/kit/src/devices.ts'
import { ddrFor } from '../../../vendor/elekloader/kit/src/link.ts'
import { cmpVersions } from '../../../vendor/elekloader/kit/src/elemod.ts'
import * as own from './kit-devices.ts'
import { LINK_DEVICES } from './elemod.ts'
import { DIGI_CORES } from '../../devices/digi-mods.ts'

// kit-devices.ts is the kit's src/devices.ts with Modwerk's lines marked MODWERK (vendor/elekloader/README.md,
// "Replaced kit files"). The marked lines hold the Analog Rytm MKII's mod area for Modwerk's base 0.7.1 on; everything
// that states that area is held to them here, so the builder, the linker, the base and the pages cannot drift apart.
const read = (path: string) => readFileSync(new URL('../../../' + path, import.meta.url), 'utf8')
const sha = (text: string) => createHash('sha256').update(text).digest('hex')
const AREA: [number, number] = [0x47b50000, 0x47f00000], OLD: [number, number] = [0x47be0000, 0x47c00000], SINCE = '0.7.1'
const range = ([start, end]: readonly number[]) => '0x' + start.toString(16) + '-0x' + end.toString(16)

describe('the kit\'s device profiles as Modwerk ships them', () => {
  it('is the upstream file the lock names, but for the lines marked MODWERK', () => {
    const source = read('src/engine/elektron/kit-devices.ts')
    const moved = "import { str } from '../../../vendor/elekloader/kit/src/py.ts'   // MODWERK: was './py.ts'"
    expect(source.split(moved).length).toBe(2)
    const upstream = source.replace(moved, "import { str } from './py.ts'").split('\n').filter(line => !line.includes('MODWERK')).join('\n')
    expect(sha(upstream)).toBe(LOCK.kit.replaced['src/devices.ts'])
    // Modwerk's lines add to one profile only
    expect(source.split('\n').filter(line => line.includes('MODWERK') && !line.trimStart().startsWith('//') && line !== moved)).toEqual([`  coreDdr: [['${SINCE}', [0x47b50000, 0x47f00000]]],   // MODWERK`])
  })
  it('gives the larger area to Modwerk\'s base alone: no other Rytm core in the catalogue is new enough for it', () => {
    // coreDdr goes by version only, so an upstream core-ar2 0.7.1 or later would be linked in an area nobody checked it
    // against. Before one joins the catalogue, give Modwerk's base a version of its own scheme or check that core there.
    const modwerk = new Set(Object.values(RYTM_BASE.variants))
    const others = CATALOG.cores.filter(core => core.device === 'analog-rytm-mk2' && !modwerk.has(core.sha256))
    expect(others.length).toBeGreaterThan(0)
    for (const core of others) expect(cmpVersions(core.version, SINCE), core.file).toBeLessThan(0)
  })
  it('is what the kit links with: its own file re-exports it', () => {
    expect(kit.ANALOG_RYTM_MK2).toBe(own.ANALOG_RYTM_MK2)
    expect(kit.devices()).toBe(own.devices())
  })
  it('gives a Rytm set on base 0.7.1 or later the 3.7 MiB area, and one on a 0.7 base the 128 KiB as before', () => {
    const device = kit.ANALOG_RYTM_MK2
    expect(device.ddr).toEqual(OLD)
    expect(device.coreDdr).toEqual([[SINCE, AREA]])
    for (const version of ['0.3', '0.7', '0.7.0']) expect(ddrFor(device, version), version).toEqual(OLD)
    for (const version of ['0.7.1', '0.7.2', '0.8', '1.0']) expect(ddrFor(device, version), version).toEqual(AREA)
    // no other machine's area moved
    for (const other of kit.devices().filter(item => item !== device && !['digitakt-mk1', 'digitone-mk1'].includes(item.key))) expect(other.coreDdr, other.key).toEqual([])
  })
  it('holds Modwerk\'s own linker, the published base, its send bus, the budget and the profile to that area', () => {
    const link = LINK_DEVICES.find(item => item.key === 'analog-rytm-mk2')!
    expect(link.ddr).toEqual(kit.ANALOG_RYTM_MK2.ddr)
    expect(link.coreDdr).toBe(kit.ANALOG_RYTM_MK2.coreDdr)
    // every variant the site builds on is new enough for the area
    const variants = Object.values(RYTM_BASE.variants).map(identity => CATALOG.cores.find(core => core.sha256 === identity)!)
    expect(variants.length).toBe(3)
    for (const core of variants) expect(ddrFor(kit.ANALOG_RYTM_MK2, core.version), core.file).toEqual(AREA)
    expect(RYTM_BASE.package).toBe('core-' + SINCE + '.elemod')
    // the interface a module asks for (resources.core) stays 0.7: 0.7.1 moves the layout, not what a module may use,
    // so a new module still links on irpina's core-ar2 0.7 and on older development bases
    expect(RYTM.sdk.core.version).toBe('0.7')
    expect(RYTM_INTERFACE.interface).toBe('0.7')
    // the send bus ends its effects' work area where the linker ends the mods' RAM
    expect(read('sdk/machines/analog-rytm-mkii/elekloader/base/sendbus.c')).toMatch(new RegExp('^#define MODS_END 0x' + AREA[1].toString(16) + '\\b', 'm'))
    expect(RYTM.sdk.budgets.find(budget => budget.name === 'Shared mod memory')!.value).toBe(AREA[1] - AREA[0])
    expect(DIGI_CORES['analog-rytm-mkii'].areaBytes).toBe(AREA[1] - AREA[0])
    expect(RYTM_INTERFACE.memory).toMatchObject({ area: range(AREA), from: SINCE, before: { area: range(OLD) } })
  })
})
