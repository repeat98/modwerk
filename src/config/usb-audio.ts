// SPDX-License-Identifier: GPL-3.0-or-later OR Elastic-2.0
// Copyright (c) 2026 Jannik Aßfalg (repeat98)
export const USB_AUDIO_MODULE = 'usb-audio-out-tracks-main-cue'
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
export type UsbAudioConfiguration = { version: typeof USB_AUDIO_VERSION; layout: UsbAudioLayout; destination: 'computer' | 'outbox'; outboxPairs: number[] }
export function usbAudioLayout(id: UsbAudioLayout) { return USB_AUDIO_LAYOUTS.find(layout => layout.id === id)! }
export function usbAudioPreset(destination: UsbAudioConfiguration['destination']): UsbAudioConfiguration {
  return { version: USB_AUDIO_VERSION, destination, layout: destination === 'outbox' ? 'tracks-post' : 'tracks-main-cue', outboxPairs: [1, 2, 3, 4] }
}
export function changeUsbAudioLayout(configuration: UsbAudioConfiguration, layout: UsbAudioLayout): UsbAudioConfiguration {
  const count = usbAudioLayout(layout).pairs.length
  return { ...configuration, layout, outboxPairs: configuration.outboxPairs.map(pair => pair <= count ? pair : 0) }
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
// The owner approved this exact experimental release without hardware tests.
// Keep validation at every public entry point; no older/future settings inherit it.
export function usbAudioBuildError(value: UsbAudioConfiguration | undefined) {
  if (value === undefined) return ''
  try { parseUsbAudioConfiguration(value); return '' }
  catch (error) { return error instanceof Error ? error.message : 'USB Audio settings are unreadable.' }
}
