// SPDX-License-Identifier: GPL-3.0-or-later OR Elastic-2.0
// Copyright (c) 2026 Jannik Aßfalg (repeat98)
export const USB_AUDIO_MODULE = 'usb-audio-out-tracks-main-cue'
/** Whether the site publishes USB Audio as module packages (docs/OCTATRACK_USB_AUDIO_MODULE.md) rather than as the base
 * in each layout. Owner, 20 November 2026: as a module it counts toward the module limit. A constant, not read from the
 * package manifest, because the Worker's limit check reads this file and the manifest is no backend dependency;
 * usb-audio-package.test.ts requires it to match the manifest's `usbAudio`, so publishing the packages flips it. */
export const USB_AUDIO_PACKAGED: boolean = true
/** A module the base itself provides, so a module set's counts and comparisons with the unit leave it out: USB Audio,
 * until it ships as a module package. `packaged` is for tests. */
export const comesWithBase = (id: string, packaged = USB_AUDIO_PACKAGED) => !packaged && id === USB_AUDIO_MODULE
export const USB_AUDIO_VERSION = '0.2.0-experimental'
export const USB_AUDIO_REVISION = '7b2984c859732ae6c797ae49c7d61d250b1b6519'
export const USB_AUDIO_LAYOUTS = [
  { id: 'tracks-main-cue', define: 0, key: 'USB AUDIO OUT TRACKS MAIN CUE', name: 'Tracks + Main + Cue', channels: 20, pairs: ['Track 1', 'Track 2', 'Track 3', 'Track 4', 'Track 5', 'Track 6', 'Track 7', 'Track 8', 'Main', 'Cue'], tap: 'pre', description: 'Every track before its fader, plus your final Main and Cue mixes.' },
  { id: 'tracks', define: 1, key: 'USB AUDIO OUT TRACKS', name: 'Tracks · pre-fader', channels: 16, pairs: ['Track 1', 'Track 2', 'Track 3', 'Track 4', 'Track 5', 'Track 6', 'Track 7', 'Track 8'], tap: 'pre', description: 'Independent stems for recording and mixing later.' },
  { id: 'tracks-post', define: 5, key: 'USB AUDIO OUT TRACKS POST', name: 'Tracks · post-fader', channels: 16, pairs: ['Track 1', 'Track 2', 'Track 3', 'Track 4', 'Track 5', 'Track 6', 'Track 7', 'Track 8'], tap: 'post', description: 'Stems that follow track level, mutes, solo and the crossfader.' },
  { id: 'main-cue', define: 3, key: 'USB AUDIO OUT MAIN CUE', name: 'Main + Cue', channels: 4, pairs: ['Main', 'Cue'], tap: 'bus', description: 'Your final stereo mix and an independent stereo Cue bus.' },
  { id: 'main', define: 4, key: 'USB AUDIO OUT MAIN', name: 'Main', channels: 2, pairs: ['Main'], tap: 'bus', description: 'A compact stereo feed of your final Main mix.' },
  { id: 'master', define: 2, key: 'USB AUDIO OUT MASTER', name: 'Track 8 / Master', channels: 2, pairs: ['Track 8'], tap: 'pre', description: 'Track 8 after its effects, before its fader. Enable MASTER TRACK on the Octatrack for a master-bus feed.' },
] as const
export type UsbAudioLayout = typeof USB_AUDIO_LAYOUTS[number]['id']
/** `configurable` is the published package; `configurable-0.3` the output-only 0.3.0 one a unit may still run, kept
 * for its exact Undo and replaced on the next sync. */
export type UsbAudioPackageKind = UsbAudioLayout | 'configurable' | 'configurable-0.3'
export const isConfigurable = (kind?: UsbAudioPackageKind) => kind === 'configurable' || kind === 'configurable-0.3'
export type UsbAudioConfiguration = { version: typeof USB_AUDIO_VERSION; layout: UsbAudioLayout; destination: 'computer' | 'outbox'; outboxPairs: number[] }
export function usbAudioLayout(id: UsbAudioLayout) { return USB_AUDIO_LAYOUTS.find(layout => layout.id === id)! }
export function usbAudioPreset(destination: UsbAudioConfiguration['destination']): UsbAudioConfiguration {
  return { version: USB_AUDIO_VERSION, destination, layout: destination === 'outbox' ? 'tracks-post' : 'tracks-main-cue', outboxPairs: [1, 2, 3, 4] }
}
export function changeUsbAudioLayout(configuration: UsbAudioConfiguration, layout: UsbAudioLayout): UsbAudioConfiguration {
  const count = usbAudioLayout(layout).pairs.length
  return { ...configuration, layout, outboxPairs: configuration.outboxPairs.map(pair => pair <= count ? pair : 0) }
}
/** Choose an install preset when editing a selection. Missing settings on an existing audio set mean classic 20-channel audio. */
export function usbAudioForSelection(ids: readonly string[], previous?: { moduleIds: readonly string[]; usbAudio?: UsbAudioConfiguration }): UsbAudioConfiguration | undefined {
  if (!ids.includes(USB_AUDIO_MODULE)) return undefined
  if (previous?.moduleIds.includes(USB_AUDIO_MODULE)) return previous.usbAudio
  return USB_AUDIO_PACKAGED ? changeUsbAudioLayout(usbAudioPreset('computer'), 'main') : undefined
}
export function suggestedUsbAudioPairs(layout: UsbAudioLayout): number[] {
  const count = usbAudioLayout(layout).pairs.length
  return Array.from({ length: 4 }, (_, index) => index < count ? index + 1 : 0)
}
export function parseUsbAudioConfiguration(value: unknown): UsbAudioConfiguration {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('USB Audio settings are unreadable.')
  const item = value as Record<string, unknown>
  if (Object.keys(item).some(key => !['version', 'layout', 'destination', 'outboxPairs'].includes(key)) || item.version !== USB_AUDIO_VERSION || !USB_AUDIO_LAYOUTS.some(layout => layout.id === item.layout) || (item.destination !== 'computer' && item.destination !== 'outbox')) throw new Error('USB Audio settings use an unsupported version or layout.')
  const layout = usbAudioLayout(item.layout as UsbAudioLayout)
  if (!Array.isArray(item.outboxPairs) || item.outboxPairs.length !== 4 || item.outboxPairs.some(pair => !Number.isInteger(pair) || pair < 0 || pair > layout.pairs.length)) throw new Error('Choose four valid Outbox stereo output assignments.')
  return { version: USB_AUDIO_VERSION, layout: layout.id, destination: item.destination as UsbAudioConfiguration['destination'], outboxPairs: [...item.outboxPairs] as number[] }
}
/** An imported set supplies the initial choices for this installation. The mode
 * (ALL, OFF or buses only) is the player's on-device setting. */
export type UsbAudioSetPreset = Pick<UsbAudioConfiguration, 'layout'> & Partial<Omit<UsbAudioConfiguration, 'layout'>>
export function usbAudioInstallPreset(configuration?: UsbAudioSetPreset): number {
  if (!configuration) return 0
  const value = parseUsbAudioConfiguration({ version: USB_AUDIO_VERSION, destination: 'computer',
    outboxPairs: suggestedUsbAudioPairs(configuration.layout), ...configuration })
  const layout = { 'tracks-main-cue': 0, tracks: 1, 'tracks-post': 1, 'main-cue': 2, main: 3, master: 4 }[value.layout]
  let word = 0x80000000 | (layout << 2)
  if (value.layout === 'tracks-post') word |= 1 << 5
  if (value.destination === 'outbox') word |= 1 << 6
  for (let i = 0; i < 4; ++i) word |= value.outboxPairs[i] << (8 + 4 * i)
  return word >>> 0
}

/** Recover the original site configuration from an installed preset. Later panel edits
 * belong to the unit and are still associated with that preset after a base update. */
export function usbAudioFromInstallPreset(word?: number): UsbAudioConfiguration | undefined {
  if (word === undefined || !Number.isInteger(word) || word < 0x80000000 || word > 0xffffffff) return undefined
  const layouts: UsbAudioLayout[] = ['tracks-main-cue', word & 32 ? 'tracks-post' : 'tracks', 'main-cue', 'main', 'master']
  const layout = layouts[(word >>> 2) & 7]
  if (!layout) return undefined
  const outboxPairs = [8, 12, 16, 20].map(shift => (word >>> shift) & 15)
  if (outboxPairs.some(pair => pair > usbAudioLayout(layout).pairs.length)) return undefined
  const value: UsbAudioConfiguration = { version: USB_AUDIO_VERSION, layout, destination: word & 64 ? 'outbox' : 'computer', outboxPairs }
  return usbAudioInstallPreset(value) === word ? value : undefined
}

// The owner approved this exact experimental release without hardware tests.
// Keep validation at every public entry point; no older/future settings inherit it.
export function usbAudioBuildError(value: UsbAudioConfiguration | undefined) {
  if (value === undefined) return ''
  try { parseUsbAudioConfiguration(value); return '' }
  catch (error) { return error instanceof Error ? error.message : 'USB Audio settings are unreadable.' }
}
