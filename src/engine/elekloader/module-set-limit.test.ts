import { describe, expect, it, vi } from 'vitest'
import baseBinding from '../../../sdk/machines/octatrack/base-binding.json' with { type: 'json' }
import { SET_MODULE_LIMIT } from '../../catalog/set-limit'
import { USB_AUDIO_MODULE } from '../../config/usb-audio'
import type { OctatrackLink } from './octatrack-link'
import { moduleSetKit, moduleSetReview, SetLimitError, USB_MODULE_IDS } from './module-set'

const ids = USB_MODULE_IDS.filter(id => id !== USB_AUDIO_MODULE), over = SET_MODULE_LIMIT + 3
const empty = { moduleIds: [], removedStockFx: [] }
const capable = { abi: 10, features: 7 | 128 | 512, maxSites: 128, maxCopies: 128 }

describe('the site’s sync of a set over the module limit', () => {
  it('reviews a set over the limit as one it cannot sync, and a trimmed one as ready', () => {
    const long = moduleSetReview({ name: 'Long', moduleIds: ids.slice(0, over) }, empty, capable, baseBinding.identity)
    expect(long.needsSync).toBe(true)
    expect(long.changes.add).toHaveLength(over)
    expect(long.problem).toBeInstanceOf(SetLimitError)
    expect(long.problem?.message).toBe(`This set has ${over} modules; ${SET_MODULE_LIMIT} is the limit for now. Remove 3 to sync.`)
    expect(moduleSetReview({ name: 'Trimmed', moduleIds: ids.slice(0, SET_MODULE_LIMIT) }, empty, capable, baseBinding.identity).problem).toBeUndefined()
  })

  it('takes a smaller set onto a unit holding more than the limit, removing the rest', () => {
    const unit = { moduleIds: ids.slice(0, over), removedStockFx: [] }
    const review = moduleSetReview({ name: 'Smaller', moduleIds: ids.slice(0, 4) }, unit, capable, baseBinding.identity)
    // Other checks may still ask something of the unit (a machine package's identity), never the limit.
    expect(review.problem).not.toBeInstanceOf(SetLimitError)
    expect(review.changes.remove).toHaveLength(over - 4)
  })

  it('refuses to prepare it before reading the unit or fetching a package', async () => {
    const inventory = vi.fn(async () => [])
    const link = { inventory, getState: () => ({ identity: { capabilities: capable, base: baseBinding.identity } }) } as unknown as OctatrackLink
    await expect(moduleSetKit(link).prepareUpdate({ name: 'Long', moduleIds: ids.slice(0, over) })).rejects.toBeInstanceOf(SetLimitError)
    expect(inventory).not.toHaveBeenCalled()
  })
})
