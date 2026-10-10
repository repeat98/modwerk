import { describe, it, expect } from 'vitest'
import { USB_AUDIO_LAYOUTS, USB_AUDIO_MODULE, changeUsbAudioLayout, suggestedUsbAudioPairs, parseUsbAudioConfiguration, usbAudioBuildError, usbAudioPreset, type UsbAudioConfiguration } from './usb-audio'
import { newConfiguration, validateConfiguration } from './workspace'
import { createSelection, parseSelection } from './selection'
import { sharedConfiguration } from '../community/forum-contract'

describe('USB Audio configuration lifecycle', () => {
  it('preserves a non-default channel map through storage, copies and backups', () => {
    const settings = { ...usbAudioPreset('outbox'), outboxPairs: [1, 3, 5, 8] }
    const stored = newConfiguration('Outbox', [USB_AUDIO_MODULE], false, undefined, 'octatrack', settings)
    const recovered = validateConfiguration(JSON.parse(JSON.stringify(stored)))
    const copy = newConfiguration('Copy', recovered.moduleIds, recovered.keepStockFx2, recovered.moduleVersions, 'octatrack', recovered.usbAudio)
    const backup = { ...createSelection(copy.moduleIds, null, false, copy.moduleVersions, copy.usbAudio), name: copy.name }
    expect(backup.schemaVersion).toBe(4)
    expect(parseSelection(JSON.stringify(backup)).usbAudio).toEqual(settings)
    expect(copy.usbAudio).toEqual(settings)
    expect(copy.usbAudio?.outboxPairs).not.toBe(settings.outboxPairs)
    const shared = sharedConfiguration({ name: copy.name, moduleIds: copy.moduleIds, moduleVersions: copy.moduleVersions, keepStockFx2: copy.keepStockFx2, usbAudio: copy.usbAudio })
    expect(shared.usbAudio).toEqual(settings)
  })
  it('keeps legacy 20-channel builds and backups without an implicit upgrade', () => {
    const legacy = newConfiguration('Existing USB', [USB_AUDIO_MODULE])
    expect(validateConfiguration(legacy).usbAudio).toBeUndefined()
    expect(createSelection(legacy.moduleIds, null).schemaVersion).toBe(3)
    expect(usbAudioBuildError(undefined)).toBe('')
    expect(usbAudioBuildError(usbAudioPreset('outbox'))).toBe('')
    expect(usbAudioBuildError({ ...usbAudioPreset('outbox'), version: '0.1.0-experimental' } as unknown as UsbAudioConfiguration)).toBe('USB Audio settings use an unsupported version or layout.')
  })
  it('clears unavailable pairs when switching to a smaller feed, and permits intentional duplicate routing', () => {
    const next = changeUsbAudioLayout({ ...usbAudioPreset('outbox'), outboxPairs: [1, 3, 5, 8] }, 'main-cue')
    expect(next.outboxPairs).toEqual([1, 0, 0, 0])
    expect(parseUsbAudioConfiguration({ ...next, outboxPairs: [1, 1, 2, 0] }).outboxPairs).toEqual([1, 1, 2, 0])
  })
  it('rejects corrupt maps, versions, extra payloads and settings attached to another module or machine', () => {
    const valid = usbAudioPreset('outbox')
    for (const item of [null, [], { ...valid, version: '0.1.2-experimental' }, { ...valid, layout: 'all' }, { ...valid, destination: {} }, { ...valid, firmware: 'bytes' }, { ...valid, outboxPairs: [1, 2, 3] }, { ...valid, outboxPairs: [1, 2, 3, 9] }, { ...valid, outboxPairs: [1, 2, 3, 1.5] }]) expect(() => parseUsbAudioConfiguration(item)).toThrow()
    expect(() => newConfiguration('Invalid', [], false, undefined, 'octatrack', valid)).toThrow('require')
    expect(() => newConfiguration('Invalid', ['miniverb'], false, undefined, 'digitakt', valid)).toThrow()
    const backup = { ...createSelection([USB_AUDIO_MODULE], null, false, undefined, valid), name: 'USB' }
    expect(() => parseSelection(JSON.stringify({ ...backup, schemaVersion: 3 }))).toThrow('version 4')
    expect(() => parseSelection(JSON.stringify({ ...backup, modules: [{ id: 'euclid', version: '0.1.2-experimental' }] }))).toThrow('USB Audio selected')
  })
  it('assigns available stereo pairs in order and leaves unused physical outputs off', () => {
    expect(suggestedUsbAudioPairs('main')).toEqual([1, 0, 0, 0])
    expect(suggestedUsbAudioPairs('main-cue')).toEqual([1, 2, 0, 0])
    for (const layout of USB_AUDIO_LAYOUTS) {
      const next = { ...usbAudioPreset('outbox'), layout: layout.id, outboxPairs: suggestedUsbAudioPairs(layout.id) }
      expect(parseUsbAudioConfiguration(next)).toEqual(next)
    }
    expect(suggestedUsbAudioPairs('tracks-post')).toEqual([1, 2, 3, 4])
  })
  it.each(USB_AUDIO_LAYOUTS)('accepts valid mappings for $id', layout => {
    expect(parseUsbAudioConfiguration({ ...usbAudioPreset('computer'), layout: layout.id, outboxPairs: [layout.pairs.length, 0, 1, 1] }).layout).toBe(layout.id)
  })
})
