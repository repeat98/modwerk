import { describe, expect, it } from 'vitest'
import { composeModuleMenus, menuCaveEnd, MENU_CAVE_END, OVERFLOW_END, OVERFLOW_START } from './module-menus'
import { DELAY_TABLE_TAIL, DELAY_TABLE_TAIL_END, writesDelayTableTail } from './os-patches'
import requested from './assets/requested-packages.json'
import recipes from './assets/menu-recipes.json'
import rom from './assets/rom-packages.json'
import { CATALOG_SOURCE } from '../catalog/modules'
describe('local module menu composition guards', () => {
  it('rejects an unknown selection and modified firmware before creating patches', async () => {
    await expect(composeModuleMenus(new Uint8Array(20), ['invented'])).rejects.toThrow('Unknown module')
    await expect(composeModuleMenus(new Uint8Array(20), ['repitch'])).rejects.toThrow('original OS fingerprint')
  })
  it('pins authored objects and keeps stock-site expectations as fingerprints only', () => {
    expect(recipes.revision).toBe(CATALOG_SOURCE.revision)
    expect(rom.revision).toBe(CATALOG_SOURCE.revision)
    for (const patch of recipes.repitchPatches) {
      expect(patch.guardSha256).toMatch(/^[a-f0-9]{64}$/)
      expect(patch).not.toHaveProperty('expect')
      expect(patch).not.toHaveProperty('stockBytes')
    }
    expect(recipes.proofs.some(proof => proof.overflowCursor > 0x400d24d0)).toBe(true)
    expect(recipes.proofs.some(proof => proof.regions.some(region => region.note === 'SHPE formatter' && region.bytes > 0))).toBe(true)
  })
  it('starts the overflow run past the 16 bytes the stock DELAY reads and refuses a cave there', () => {
    expect(OVERFLOW_START).toBe(DELAY_TABLE_TAIL_END)
    const cursor = 0x400d6b20
    expect(menuCaveEnd(OVERFLOW_START, 16, cursor, MENU_CAVE_END, 'overflow cave')).toBe(OVERFLOW_END)
    expect(menuCaveEnd(cursor, 16, cursor, MENU_CAVE_END, 'window cave')).toBe(MENU_CAVE_END)
    for (const [address, length] of [[DELAY_TABLE_TAIL, 4740], [DELAY_TABLE_TAIL + 8, 4], [DELAY_TABLE_TAIL - 0x20, 0x22]]) {
      expect(() => menuCaveEnd(address, length, cursor, MENU_CAVE_END, 'pinned unit')).toThrow('pinned unit is placed at 0x' + address.toString(16) + ', but the stock DELAY reads 0x400d24d0..0x400d24df')
    }
    // Before the run, outside every region: no room, not a DELAY refusal.
    expect(menuCaveEnd(DELAY_TABLE_TAIL - 0x20, 0x20, cursor, MENU_CAVE_END, 'gap')).toBe(DELAY_TABLE_TAIL - 0x20)
  })
  it('has no requested package pinned into the bytes the stock DELAY reads', () => {
    // FM Synth 0.1.2 pins its SRC page at 0x400d24d0 and fails here until FM Synth 0.1.4 moves it into DRAM.
    const pinned = requested.objects.filter(object => 'caveAddress' in object && typeof object.caveAddress === 'number')
    expect(pinned.length).toBeGreaterThan(0)
    expect(pinned.filter(object => writesDelayTableTail(object.caveAddress as number, object.bytes)).map(object => object.moduleId + ' ' + object.label)).toEqual([])
  })
})
