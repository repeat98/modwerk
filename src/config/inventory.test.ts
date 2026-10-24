import { afterEach, describe, expect, it, vi } from 'vitest'
import { changeCount, inventoryChanges, lastInventory, listboxMove, loadStep, missingFromProject, modulesToPutBack, rememberInventory, sameModules, SAVED_BY_ANOTHER_BASE, unitState } from './inventory'

describe('making the unit match a module set', () => {
  it('adds and removes modules and switches stock effects both ways', () => {
    const changes = inventoryChanges({ moduleIds: ['everb', 'poly8'], removedStockFx: ['DARK REV'] },
      { name: 'Set', moduleIds: ['everb', 'air-chorus'], removedStockFx: ['SPRING REV'] })
    expect(changes).toEqual({ add: ['air-chorus'], remove: ['poly8'], stockOff: ['SPRING REV'], stockOn: ['DARK REV'] })
    expect(changeCount(changes)).toBe(4)
  })
  it('finds nothing to do when the unit already matches', () => {
    expect(changeCount(inventoryChanges({ moduleIds: ['everb'], removedStockFx: [] }, { name: 'Set', moduleIds: ['everb'] }))).toBe(0)
  })
  it('tells what is on the unit apart from what is only in the set', () => {
    const unit = { moduleIds: ['everb', 'poly8'], removedStockFx: [] }, set = ['everb', 'tapeecho']
    expect(['everb', 'tapeecho', 'poly8', 'repitch'].map(id => unitState(id, set, unit))).toEqual(['on', 'load', 'leaving', undefined])
    expect(unitState('everb', set)).toBeUndefined()
  })
})

describe('what the unit’s project names that it lacks', () => {
  it('finds catalogue modules by their module id, and keeps the names it cannot place', () => {
    const missing = [{ module: '873d83cc', name: 'E-Verb' }, { module: 'deadbeef', name: 'Foo' }] // 873d83cc: SHA-256("everb")
    expect(missingFromProject(missing, ['poly8', 'everb'])).toEqual({ ids: ['everb'], unknown: ['Foo'] })
    expect(missingFromProject([], ['everb'])).toEqual({ ids: [], unknown: [] })
  })
})

describe('the Octatrack hub', () => {
  afterEach(() => { vi.unstubAllGlobals() })
  it('matches a module set to the unit by its modules, in any order', () => {
    expect(sameModules(['everb', 'poly8'], ['poly8', 'everb'])).toBe(true)
    expect(sameModules(['everb'], ['everb', 'poly8'])).toBe(false)
    expect(sameModules([], [])).toBe(true)
  })
  it('remembers the last read per base and shows the newest while the unit is away', () => {
    const store = new Map<string, string>()
    vi.stubGlobal('localStorage', { getItem: (key: string) => store.get(key) ?? null, setItem: (key: string, value: string) => { store.set(key, value) } })
    expect(lastInventory()).toBeUndefined()
    rememberInventory('aa', { moduleIds: ['everb'], removedStockFx: [] }, '2026-10-12T10:00:00.000Z')
    rememberInventory('bb', { moduleIds: ['poly8', 'tapeecho'], removedStockFx: [] }, '2026-10-12T11:00:00.000Z')
    expect(lastInventory()).toEqual({ base: 'bb', moduleIds: ['poly8', 'tapeecho'], removedStockFx: [], at: '2026-10-12T11:00:00.000Z' })
    expect(lastInventory('aa')?.moduleIds).toEqual(['everb'])
    store.set('modwerk.octatrack.last-seen', '{"cc":{"moduleIds":"broken","at":"2027"}}')
    expect(lastInventory()).toBeUndefined() // a damaged record shows as never seen
  })
  it('puts back the modules last seen under another base when the card set was another base\'s', () => {
    const store = new Map<string, string>()
    vi.stubGlobal('localStorage', { getItem: (key: string) => store.get(key) ?? null, setItem: (key: string, value: string) => { store.set(key, value) } })
    rememberInventory('old', { moduleIds: ['everb', 'poly8'], removedStockFx: ['SPRING_REV'] }, '2026-10-20T10:00:00.000Z')
    rememberInventory('new', { moduleIds: [], removedStockFx: [] }, '2026-10-24T10:00:00.000Z') // the new base's first read
    const empty = { moduleIds: [], removedStockFx: [] }
    expect(modulesToPutBack('new', SAVED_BY_ANOTHER_BASE, empty)).toMatchObject({ base: 'old', moduleIds: ['everb', 'poly8'], removedStockFx: ['SPRING_REV'] })
    expect(modulesToPutBack('new', 2, empty)).toBeUndefined() // nothing saved: the unit was emptied on purpose or is new
    expect(modulesToPutBack('new', 1, empty)).toBeUndefined() // restored
    expect(modulesToPutBack('new', SAVED_BY_ANOTHER_BASE, { moduleIds: ['everb'], removedStockFx: [] })).toBeUndefined() // already synced again
    expect(modulesToPutBack('new', SAVED_BY_ANOTHER_BASE, undefined)).toBeUndefined() // not read yet
    rememberInventory('old', empty, '2026-10-21T10:00:00.000Z')
    expect(modulesToPutBack('new', SAVED_BY_ANOTHER_BASE, empty)).toBeUndefined() // the old base was empty too
  })
  it('works without storage', () => {
    vi.stubGlobal('localStorage', { getItem() { throw new Error('blocked') }, setItem() { throw new Error('blocked') } })
    expect(() => rememberInventory('aa', { moduleIds: [], removedStockFx: [] })).not.toThrow()
    expect(lastInventory()).toBeUndefined()
  })
  it('steps the guided load from review through the trial to its result', () => {
    expect(loadStep('ready', false, false)).toBe('review')
    expect(loadStep('ready', true, true)).toBe('loading') // preparing the packages
    expect(loadStep('sending', true, false)).toBe('loading')
    expect(loadStep('testing', true, false)).toBe('testing')
    expect(loadStep('trial', true, false)).toBe('trial')
    expect(loadStep('finishing', true, false)).toBe('trial')
    expect(loadStep('ready', true, false)).toBe('done') // kept, undone or failed: the link's notice says which
    expect(loadStep('idle', true, false)).toBe('done') // unplugged part way
  })
})

describe('the Octatrack page’s set list', () => {
  it('moves the set list selection with the arrow keys, Home and End, and stops at the ends', () => {
    expect(listboxMove('ArrowDown', 0, 3)).toBe(1)
    expect(listboxMove('ArrowDown', 2, 3)).toBe(2)
    expect(listboxMove('ArrowUp', 0, 3)).toBe(0)
    expect(listboxMove('ArrowUp', 2, 3)).toBe(1)
    expect(listboxMove('Home', 2, 3)).toBe(0)
    expect(listboxMove('End', 0, 3)).toBe(2)
    expect(listboxMove('Enter', 1, 3)).toBeUndefined()
    expect(listboxMove('ArrowDown', 0, 0)).toBeUndefined()
  })
})
