import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import CATALOG from '../../../vendor/elekloader/catalog/catalog.json'
import { createService } from '../elektron/builder-service.ts'
import type { Ready } from '../elektron/builder-protocol.ts'

// The kit's worker logic with the vendored catalog, its cores and mods served as Modwerk serves them under
// elekloader/. No firmware: the stock-file side is covered by the recorded parity runs (docs/VERIFICATION.md).
const BASE = 'https://modwerk.test/elekloader/'
const read = (file: string) => new Uint8Array(readFileSync(new URL('../../../vendor/elekloader/catalog/' + file, import.meta.url)))
const site = (change: (file: string, data: Uint8Array) => Uint8Array = (_, data) => data) =>
  createService(async url => { const file = url.slice(BASE.length); return change(file, read(file)) })

describe('elekloader kit with the vendored catalog', () => {
  it('loads the catalog and each pinned core', async () => {
    const handle = site()
    const ready = await handle({ call: 'init', args: { base: BASE } }) as Ready
    expect(ready.catalog).toEqual({ revision: CATALOG.revision, cores: CATALOG.cores.length, mods: CATALOG.mods.length })
    const mods = await handle({ call: 'mods' }) as { id: string; builtin: boolean; os: string; file: string }[]
    expect(mods.map(m => [m.file, m.id, m.builtin, m.os])).toEqual(CATALOG.cores.map(c => [c.file, 'core', true, c.os]).sort())
  })
  it('adds each catalog mod for its release, and refuses a file that is not the pinned one', async () => {
    const handle = site()
    await handle({ call: 'init', args: { base: BASE } })
    for (const mod of CATALOG.mods) expect(await handle({ call: 'add_catalog_mod', args: { file: mod.file } }), mod.file).toMatchObject({ ok: true, mod: { builtin: false, os: mod.os } })
    const tampered = site((file, data) => (file === CATALOG.mods[0].file ? data.slice(1) : data))
    await tampered({ call: 'init', args: { base: BASE } })
    await expect(tampered({ call: 'add_catalog_mod', args: { file: CATALOG.mods[0].file } })).rejects.toThrow('is not the file the catalog pins')
    await expect(site((file, data) => (file === CATALOG.cores[0].file ? data.slice(1) : data))({ call: 'init', args: { base: BASE } })).rejects.toThrow('is not the file the catalog pins')
  })
  it('refuses a file that is not a stock OS, and building without one', async () => {
    const handle = site()
    await handle({ call: 'init', args: { base: BASE } })
    const stock = await handle({ call: 'set_stock', args: { name: 'not-firmware.syx' }, data: read(CATALOG.cores[0].file).slice().buffer }) as { ok: boolean; file: string; error: string }
    expect(stock).toMatchObject({ ok: false, file: 'not-firmware.syx' })
    expect(stock.error).toContain('Supported: Digitakt mk1 1.53, Digitakt mk1 1.54')
    expect(await handle({ call: 'build', args: { enabled: [], version: '2.0a', name: 'test' } })).toEqual({ ok: false, error: 'Choose your stock firmware first' })
  })
})
