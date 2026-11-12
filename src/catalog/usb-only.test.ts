import { describe, expect, it } from 'vitest'
import packages from '../engine/assets/octatrack-module-packages.json'
import { moduleUsbOnly, moduleCardless, usbLagNote } from './usb-only'

describe('modules that need the Modwerk base', () => {
  it('keeps a module whose USB package requires a base DSP feature out of card firmware', () => {
    const published = { packages: [{ id: 'repitch', requires: 8 }, { id: 'tapehead' }] }
    expect(moduleUsbOnly('repitch', published)).toBe(true)
    expect(moduleUsbOnly('tapehead', published)).toBe(false)
    // Without USB sync here it does not point at a sync the member cannot start: before the release, USB isn't open to
    // them; after it, this browser (Firefox, Safari, a phone) can't reach the unit.
  })

  it('keeps a C runtime module, built from its own sources, out of card firmware', () => {
    const published = { packages: [{ id: 'beat-slicer', sources: ['device_module.c'] }, { id: 'tapehead' }] }
    expect(moduleUsbOnly('beat-slicer', published)).toBe(true)
  })

  it('says which older version a lagging USB package installs, and why', () => {
    const published = { packages: [{ id: 'playmodes', version: '0.1.1-experimental', lagsBehind: '0.2.0-experimental', lagReason: 'its recipe needs a review (#764)' }, { id: 'tapehead', version: '0.1.2-experimental' }] }
    expect(usbLagNote('playmodes', published)).toBe('Over USB this installs 0.1.1-experimental: its recipe needs a review (#764)')
    expect(usbLagNote('tapehead', published)).toBe('')
    for (const entry of packages.packages as { id: string; lagsBehind?: string }[]) expect(!!usbLagNote(entry.id)).toBe(!!entry.lagsBehind)
  })

  it('follows the published packages', () => {
    expect(moduleUsbOnly('ring-sc')).toBe(true) // RINGMOD SC: its package requires the key bus
    expect(moduleUsbOnly('beat-slicer')).toBe(true) // a C runtime module of the base's sample-editor service
    for (const entry of packages.packages as { id: string; requires?: number; sources?: string[]; usbOnly?: boolean }[]) {
      const usbOnly = !!entry.requires || !!entry.sources || entry.usbOnly === true
      expect(moduleUsbOnly(entry.id)).toBe(usbOnly)
    }
  })

  it('keeps an explicitly USB-only native package out of card firmware', () => {
    const published = { packages: [{ id: 'arp-key-locks', usbOnly: true }, { id: 'tapehead', usbOnly: false }] }
    expect(moduleUsbOnly('arp-key-locks', published)).toBe(true)
    expect(moduleCardless('arp-key-locks', published)).toBe(true)
    expect(moduleUsbOnly('tapehead', published)).toBe(false)
    expect(moduleCardless('tapehead', published)).toBe(false)
  })
})
