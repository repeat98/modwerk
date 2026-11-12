import { describe, expect, it } from 'vitest'
import { MODULES } from './modules'
import { USB_AUDIO_MODULE } from '../config/usb-audio'
import { refusesAdd, type AddBlock } from './add-blocks'
import { isModuleAvailable } from './availability'
import { moduleUsbOnly } from './usb-only'
import { addAllMessage, atLimit, canAdd, limitApplies, limitBlock, limitedCount, LIMIT_REACHED, overLimit, overLimitMessage, SET_MODULE_LIMIT, withSetLimit } from './set-limit'

// Modules a card build takes (no base needed), so the limit is the only reason left to refuse a long set.
const cardIds = MODULES.map(module => module.id).filter(id => id !== USB_AUDIO_MODULE && isModuleAvailable(id) && !moduleUsbOnly(id))
const first = (count: number) => cardIds.slice(0, count)
const over = SET_MODULE_LIMIT + 3

describe('the module limit of an Octatrack set', () => {
  it('has enough card modules to test past it', () => expect(cardIds.length).toBeGreaterThan(over))

  it('counts modules, not USB Audio, which ships with the base', () => {
    expect(limitedCount([...first(2), USB_AUDIO_MODULE])).toBe(2)
    expect(limitedCount([...first(2), first(2)[0]])).toBe(2)
    expect(atLimit([...first(SET_MODULE_LIMIT - 1), USB_AUDIO_MODULE])).toBe(false)
    expect(atLimit(first(SET_MODULE_LIMIT))).toBe(true)
    expect(overLimit(first(SET_MODULE_LIMIT))).toBe(false)
    expect(overLimit(first(SET_MODULE_LIMIT + 1))).toBe(true)
  })

  it('refuses one more module once the set is full, but never a removal, a module already in it or USB Audio', () => {
    const full = first(SET_MODULE_LIMIT), next = cardIds[SET_MODULE_LIMIT]
    expect(canAdd(first(SET_MODULE_LIMIT - 1), next)).toBe(true)
    expect(canAdd(full, next)).toBe(false)
    expect(canAdd(full, full[0])).toBe(true)
    expect(canAdd(full, USB_AUDIO_MODULE)).toBe(true)
    expect(canAdd(first(over), cardIds[over])).toBe(false)
  })

  it('applies to the Octatrack only', () => {
    expect(limitApplies()).toBe(true)
    expect(limitApplies('digitakt')).toBe(false)
    expect(canAdd(first(over), cardIds[over], 'digitakt')).toBe(true)
    expect(overLimitMessage(first(over), 'sync', 'digitakt')).toBe('')
  })

  it('says how many a set has and how many to remove, from the one constant', () => {
    expect(LIMIT_REACHED).toBe(`Your set is full. ${SET_MODULE_LIMIT} modules per set is a temporary limit while larger sets are made stable on every Octatrack. Remove one to add another.`)
    expect(overLimitMessage(first(SET_MODULE_LIMIT), 'sync')).toBe('')
    expect(overLimitMessage(first(over), 'sync')).toBe(`This set has ${over} modules; ${SET_MODULE_LIMIT} is the limit for now. Remove 3 to sync.`)
    expect(overLimitMessage([...first(over), USB_AUDIO_MODULE], 'build')).toBe(`This set has ${over} modules; ${SET_MODULE_LIMIT} is the limit for now. Remove 3 to build.`)
  })

  it('adds several modules all or none, and says how many are too many', () => {
    expect(addAllMessage(first(SET_MODULE_LIMIT - 2), cardIds.slice(SET_MODULE_LIMIT - 2, SET_MODULE_LIMIT))).toBe('')
    expect(addAllMessage(first(SET_MODULE_LIMIT - 2), cardIds.slice(SET_MODULE_LIMIT - 2, over))).toBe(`Adding them would make ${over} modules; ${SET_MODULE_LIMIT} is the limit for now. Remove 3 first.`)
    expect(addAllMessage(first(SET_MODULE_LIMIT), [cardIds[SET_MODULE_LIMIT]])).toBe(`Adding it would make ${SET_MODULE_LIMIT + 1} modules; ${SET_MODULE_LIMIT} is the limit for now. Remove 1 first.`)
    expect(addAllMessage(first(SET_MODULE_LIMIT), [USB_AUDIO_MODULE])).toBe('')
    expect(addAllMessage(first(over), [cardIds[over]], 'digitakt')).toBe('')
  })

  it('marks every other module in the library unavailable once the set is full, over any conflict note', () => {
    const below = first(SET_MODULE_LIMIT - 1), full = first(SET_MODULE_LIMIT), next = cardIds[SET_MODULE_LIMIT]
    const conflict = { conflicts: [], blocks: { [next]: { kind: 'conflict', withIds: ['analog-bassdrum'], reason: 'Conflicts with Analog BD', detail: 'A conflict note from before the set was full.', key: 'spectrum:analog-bassdrum' } satisfies AddBlock } }
    expect(withSetLimit(conflict, below)).toBe(conflict)
    const { blocks } = withSetLimit(conflict, full)
    expect(blocks[next]).toEqual(limitBlock(next))
    expect(refusesAdd(blocks[next])).toBe(true)
    expect(blocks[next].detail).toBe(LIMIT_REACHED)
    expect(blocks[full[0]]).toBeUndefined()
    expect(blocks[USB_AUDIO_MODULE]).toBeUndefined()
  })
})

describe('the card build of a set over the limit', () => {
})
