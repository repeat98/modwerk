// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from 'vitest'
import { failed, linkAll, linkSet, loadPackage } from './digi-link-all.ts'

const catalogFile = (name: string) => loadPackage(new URL(`../../../vendor/elekloader/catalog/${name}`, import.meta.url), name)

describe('digi:link-all', () => {
  it('links every shipped Digitakt mk1 and Digitone mk1 module alone on the core a build picks', () => {
    for (const machine of ['digitakt', 'digitone'] as const) {
      const result = linkAll({ machine })
      expect(result.oses.flatMap(o => o.singles.failed)).toEqual([])
      expect(failed(result)).toBe(false)
      expect(result.oses.reduce((n, o) => n + o.singles.ok, 0)).toBeGreaterThan(0)
    }
  }, 20_000)

  it('refuses a set without its framework, and a table nothing declares', () => {
    const core = catalogFile('core-4.4.elemod'), names = catalogFile('cc-names-2.1.1-os1.53.elemod')
    expect(linkSet([core, names], null)).toEqual(['cc-names 2.1.1 requires dt-support'])
    names.requires = []
    expect(linkSet([core, names], null)).toEqual(['cc-names 2.1.1 adds to table dt_free_observers, which no given mod declares'])
  })
})
