import { describe, expect, it } from 'vitest'
import { moduleHasUpdate, moduleIsNew, moduleViewsToRemember } from './module-updates'

const current = { id: 'tapehead', version: '0.2.0-experimental' }
const other = { id: 'repitch', version: '0.1.1-experimental' }
const baseline = [current.id, other.id]

describe('updates since viewing a module', () => {
  it('does not label a first encounter, unchanged release or rollback as an update', () => {
    for (const viewed of [undefined, current.version, '0.3.0-experimental', 'corrupt']) {
      expect(moduleHasUpdate(current, viewed)).toBe(false)
    }
    expect(moduleHasUpdate(current, '0.1.1-experimental')).toBe(true)
  })

  it('uses semantic ordering for numeric and prerelease changes', () => {
    expect(moduleHasUpdate({ ...current, version: '0.10.0' }, '0.9.0')).toBe(true)
    expect(moduleHasUpdate({ ...current, version: '0.2.0' }, '0.2.0-rc.10')).toBe(true)
    expect(moduleHasUpdate({ ...current, version: '0.2.0-rc.10' }, '0.2.0-rc.2')).toBe(true)
  })

  it('establishes only displayed baselines and keeps later grid visits unread', () => {
    expect(moduleViewsToRemember([other], {}, baseline)).toEqual([other])
    const viewed = { [current.id]: '0.1.1-experimental', [other.id]: other.version }
    expect(moduleViewsToRemember([current, other], viewed, baseline)).toEqual([])
    expect(moduleViewsToRemember([other, current], viewed, baseline)).toEqual([])
    expect(moduleViewsToRemember([current], viewed, baseline)).toEqual([])
  })

  it('acknowledges only the module whose details were opened', () => {
    const viewed = { [current.id]: '0.1.1-experimental', [other.id]: '0.1.0-experimental' }
    expect(moduleViewsToRemember([current, other], viewed, baseline, current.id)).toEqual([current])
    expect(moduleHasUpdate(current, current.version)).toBe(false)
    expect(moduleHasUpdate(other, viewed[other.id])).toBe(true)
  })
})


describe('new catalog additions', () => {
  it('leaves the first visit, loading state and unseen modules in the initial catalog unlabelled', () => {
    expect(moduleIsNew(current, undefined, null)).toBe(false)
    expect(moduleIsNew(current, undefined, baseline)).toBe(false)
    expect(moduleViewsToRemember([other], {}, baseline)).toEqual([other])
    expect(moduleIsNew(current, undefined, baseline)).toBe(false)
  })

  it('keeps later additions unread through filtering, sorting and version changes', () => {
    const initial = [other.id], viewed = { [other.id]: other.version }
    expect(moduleIsNew(current, undefined, initial)).toBe(true)
    expect(moduleViewsToRemember([current, other], viewed, initial)).toEqual([])
    expect(moduleViewsToRemember([other, current], viewed, initial)).toEqual([])
    expect(moduleViewsToRemember([other], viewed, initial)).toEqual([])
    expect(moduleIsNew({ ...current, version: '0.3.0' }, undefined, initial)).toBe(true)
    expect(moduleHasUpdate(current, undefined)).toBe(false)
  })

  it('acknowledges only an opened addition, then detects later updates to it', () => {
    const initial = [other.id], opened = { [current.id]: current.version }
    expect(moduleViewsToRemember([current, other], {}, initial, current.id)).toEqual([current, other])
    expect(moduleIsNew(current, opened[current.id], initial)).toBe(false)
    expect(moduleHasUpdate({ ...current, version: '0.3.0' }, opened[current.id])).toBe(true)
  })
})
