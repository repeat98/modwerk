import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { catalogNeighbors, parseCatalogBrowse, type CatalogBrowse } from './catalog-browse'
import { CatalogNavigation } from '../components/CatalogNavigation'
import { DEFAULT_MODULE_SORT } from '../community/module-statistics'
import { asBeta } from './beta-fixture'
import { DIGI_MODS } from '../devices/digi-mods'

const browse: CatalogBrowse = { route: 'all/system', query: 'perform', family: 'all', sort: 'name', ids: ['digitakt-digiperform', 'digitone-digiperform'] }

describe('paging through catalog results', () => {
  // No module shares an ID across the Digi machines today, so a Digitone twin of digiperform stands in for one.
  const original = DIGI_MODS.slice()
  beforeAll(() => { DIGI_MODS.push({ ...DIGI_MODS.find(mod => mod.device === 'digitakt' && mod.id === 'digiperform')!, device: 'digitone', title: 'digiperform' }) })
  afterAll(() => { DIGI_MODS.splice(0, DIGI_MODS.length, ...original) })
  it('keeps captured order and distinguishes modules with the same ID on different machines', () => {
    const first = catalogNeighbors(browse, 'digitakt-digiperform')!
    expect(first).toMatchObject({ previous: undefined, position: 1, total: 2, backHref: '#all/system' })
    expect(first.next).toMatchObject({ href: '/digitone/module/digiperform/', name: 'digiperform · Digitone' })
    const last = catalogNeighbors(browse, 'digitone-digiperform')!
    expect(last.next).toBeUndefined()
    expect(last.previous?.href).toBe('/digitakt/module/digiperform/')
    expect(last.position).toBe(2)
  })

  it('continues between machine groups and uses the canonical Octatrack slug', () => {
    const mixed = { ...browse, route: 'all', ids: ['synth', 'digitakt-digiperform', 'digitone-digiperform'] }
    expect(catalogNeighbors(mixed, 'digitakt-digiperform')?.previous?.href).toMatch(/module\/fm-synth\/$/)
    expect(catalogNeighbors(mixed, 'digitakt-digiperform')?.next?.href).toBe('/digitone/module/digiperform/')
    expect(catalogNeighbors({ ...mixed, ids: [...mixed.ids].reverse() }, 'digitakt-digiperform')?.previous?.href).toBe('/digitone/module/digiperform/')
  })

  it('restores the selection and filters after reload, dropping removed or duplicate entries', () => {
    const restored = parseCatalogBrowse(JSON.stringify({ ...browse, family: 'Utilities', ids: ['digitakt-digiperform', 'deleted-module', 'digitakt-digiperform', 'digitone-digiperform'] }))
    expect(restored).toEqual({ ...browse, family: 'Utilities' })
    expect(parseCatalogBrowse(JSON.stringify({ ...browse, route: 'effects', ids: ['miniverb'] }))?.route).toBe('effects')
    expect(parseCatalogBrowse(JSON.stringify({ ...browse, route: 'digitakt/system' }))?.route).toBe('digitakt/system')
    expect(parseCatalogBrowse(JSON.stringify({ ...browse, route: 'all/scenes', family: 'Scenes' }))).toMatchObject({ route: 'all/performance', family: 'Scenes' })
    expect(parseCatalogBrowse(JSON.stringify({ ...browse, route: 'analog-rytm-mkii/scenes' }))?.route).toBe('analog-rytm-mkii/performance')
  })

  it('preserves the recently updated default and captured order after reload', () => {
    const updated = { ...browse, sort: DEFAULT_MODULE_SORT, ids: [...browse.ids].reverse() }
    const restored = parseCatalogBrowse(JSON.stringify(updated))
    expect(restored).toEqual(updated)
    expect(catalogNeighbors(restored, 'digitone-digiperform')?.next?.href).toBe('/digitakt/module/digiperform/')
    expect(catalogNeighbors(restored, 'digitakt-digiperform')?.next).toBeUndefined()
  })

  it('does not page outside the selection or wrap a single result', () => {
    expect(catalogNeighbors(browse, 'miniverb')).toBeNull()
    expect(catalogNeighbors(null, 'miniverb')).toBeNull()
    expect(catalogNeighbors({ ...browse, ids: ['miniverb'] }, 'miniverb')).toMatchObject({ previous: undefined, next: undefined, position: 1, total: 1 })
    expect(catalogNeighbors({ ...browse, ids: ['deleted-module'] }, 'deleted-module')).toBeNull()
  })

  it('keeps beta paging only while the session has access', () => asBeta(() => {
    const beta = { ...browse, route: 'library', ids: ['miniverb', 'airwindows-chorus'] }
    expect(parseCatalogBrowse(JSON.stringify(beta))?.ids).toEqual(['miniverb'])
    expect(parseCatalogBrowse(JSON.stringify(beta), true)?.ids).toEqual(beta.ids)
    expect(catalogNeighbors(beta, 'miniverb', true)?.next?.id).toBe('airwindows-chorus')
    expect(catalogNeighbors(beta, 'miniverb')?.next).toBeUndefined()
  }))
  it('ignores invalid stored context and never builds an external return link', () => {
    for (const json of [null, '{', 'null', JSON.stringify({ ...browse, route: 'https://example.com' }), JSON.stringify({ ...browse, route: 'digitakt/configuration' }), JSON.stringify({ ...browse, ids: [1] }), JSON.stringify({ ...browse, sort: 'unknown' })]) {
      expect(parseCatalogBrowse(json)).toBeNull()
    }
  })

  it('labels chevrons with the destination and exposes the keyboard shortcuts, disabling each endpoint', () => {
    const first = renderToStaticMarkup(createElement(CatalogNavigation, { navigation: catalogNeighbors(browse, 'digitakt-digiperform')! }))
    expect(first).toContain('aria-label="Next module: digiperform · Digitone"')
    expect(first).toContain('aria-keyshortcuts="ArrowRight"')
    expect(first).toContain('disabled="" aria-label="No previous module"')
    const last = renderToStaticMarkup(createElement(CatalogNavigation, { navigation: catalogNeighbors(browse, 'digitone-digiperform')! }))
    expect(last).toContain('aria-keyshortcuts="ArrowLeft"')
    expect(last).toContain('disabled="" aria-label="No next module"')
  })
})
