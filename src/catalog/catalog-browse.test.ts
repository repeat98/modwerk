import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { catalogNeighbors, parseCatalogBrowse, type CatalogBrowse } from './catalog-browse'
import { CatalogNavigation } from '../components/CatalogNavigation'
import { DEFAULT_MODULE_SORT } from '../community/module-statistics'

const browse: CatalogBrowse = { route: 'all/system', query: 'health', family: 'all', sort: 'name', ids: ['digitakt-digihealth', 'digitone-digihealth'] }

describe('paging through catalog results', () => {
  it('keeps captured order and distinguishes modules with the same ID on different machines', () => {
    const first = catalogNeighbors(browse, 'digitakt-digihealth')!
    expect(first).toMatchObject({ previous: undefined, position: 1, total: 2, backHref: '#all/system' })
    expect(first.next).toMatchObject({ href: '/digitone/module/digihealth/', name: 'digihealth · Digitone' })
    const last = catalogNeighbors(browse, 'digitone-digihealth')!
    expect(last.next).toBeUndefined()
    expect(last.previous?.href).toBe('/digitakt/module/digihealth/')
    expect(last.position).toBe(2)
  })

  it('continues between machine groups and uses the canonical Octatrack slug', () => {
    const mixed = { ...browse, route: 'all', ids: ['synth', 'digitakt-digihealth', 'digitone-digihealth'] }
    expect(catalogNeighbors(mixed, 'digitakt-digihealth')?.previous?.href).toMatch(/module\/fm-synth\/$/)
    expect(catalogNeighbors(mixed, 'digitakt-digihealth')?.next?.href).toBe('/digitone/module/digihealth/')
    expect(catalogNeighbors({ ...mixed, ids: [...mixed.ids].reverse() }, 'digitakt-digihealth')?.previous?.href).toBe('/digitone/module/digihealth/')
  })

  it('restores the selection and filters after reload, dropping removed or duplicate entries', () => {
    const restored = parseCatalogBrowse(JSON.stringify({ ...browse, family: 'Utilities', ids: ['digitakt-digihealth', 'deleted-module', 'digitakt-digihealth', 'digitone-digihealth'] }))
    expect(restored).toEqual({ ...browse, family: 'Utilities' })
    expect(parseCatalogBrowse(JSON.stringify({ ...browse, route: 'effects', ids: ['miniverb'] }))?.route).toBe('effects')
    expect(parseCatalogBrowse(JSON.stringify({ ...browse, route: 'digitakt/system' }))?.route).toBe('digitakt/system')
  })

  it('preserves the recently updated default and captured order after reload', () => {
    const updated = { ...browse, sort: DEFAULT_MODULE_SORT, ids: [...browse.ids].reverse() }
    const restored = parseCatalogBrowse(JSON.stringify(updated))
    expect(restored).toEqual(updated)
    expect(catalogNeighbors(restored, 'digitone-digihealth')?.next?.href).toBe('/digitakt/module/digihealth/')
    expect(catalogNeighbors(restored, 'digitakt-digihealth')?.next).toBeUndefined()
  })

  it('does not page outside the selection or wrap a single result', () => {
    expect(catalogNeighbors(browse, 'miniverb')).toBeNull()
    expect(catalogNeighbors(null, 'miniverb')).toBeNull()
    expect(catalogNeighbors({ ...browse, ids: ['miniverb'] }, 'miniverb')).toMatchObject({ previous: undefined, next: undefined, position: 1, total: 1 })
    expect(catalogNeighbors({ ...browse, ids: ['deleted-module'] }, 'deleted-module')).toBeNull()
  })

  it('keeps beta paging only while the session has access', () => {
    const beta = { ...browse, route: 'library', ids: ['miniverb', 'airwindows-chorus'] }
    expect(parseCatalogBrowse(JSON.stringify(beta))?.ids).toEqual(['miniverb'])
    expect(parseCatalogBrowse(JSON.stringify(beta), true)?.ids).toEqual(beta.ids)
    expect(catalogNeighbors(beta, 'miniverb', true)?.next?.id).toBe('airwindows-chorus')
    expect(catalogNeighbors(beta, 'miniverb')?.next).toBeUndefined()
  })
  it('ignores invalid stored context and never builds an external return link', () => {
    for (const json of [null, '{', 'null', JSON.stringify({ ...browse, route: 'https://example.com' }), JSON.stringify({ ...browse, route: 'digitakt/configuration' }), JSON.stringify({ ...browse, ids: [1] }), JSON.stringify({ ...browse, sort: 'unknown' })]) {
      expect(parseCatalogBrowse(json)).toBeNull()
    }
  })

  it('labels chevrons with the destination and exposes the keyboard shortcuts, disabling each endpoint', () => {
    const first = renderToStaticMarkup(createElement(CatalogNavigation, { navigation: catalogNeighbors(browse, 'digitakt-digihealth')! }))
    expect(first).toContain('aria-label="Next module: digihealth · Digitone"')
    expect(first).toContain('aria-keyshortcuts="ArrowRight"')
    expect(first).toContain('disabled="" aria-label="No previous module"')
    const last = renderToStaticMarkup(createElement(CatalogNavigation, { navigation: catalogNeighbors(browse, 'digitone-digihealth')! }))
    expect(last).toContain('aria-keyshortcuts="ArrowLeft"')
    expect(last).toContain('disabled="" aria-label="No next module"')
  })
})
