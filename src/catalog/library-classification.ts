// SPDX-License-Identifier: GPL-3.0-or-later OR Elastic-2.0
// Copyright (c) 2026 Jannik Aßfalg (repeat98)
import type { ModwerkModule } from './module-contract-v3.ts'

// Categories group modules by the part of the instrument a musician wants to change.
// Types describe the particular function within that category. Keys are public browse routes.
export const LIBRARY_CATEGORY_LABELS = {
  effects: 'Effects',
  machines: 'Machines',
  playback: 'Sampling & playback',
  sequencing: 'Sequencing',
  modulation: 'Modulation',
  performance: 'Performance',
  'midi-usb': 'MIDI & USB',
  system: 'System',
  standalone: 'Standalone firmware',
} as const
export type ModuleCategory = keyof typeof LIBRARY_CATEGORY_LABELS
export const LIBRARY_CATEGORIES = Object.keys(LIBRARY_CATEGORY_LABELS) as ModuleCategory[]

type Classification = readonly [category: ModuleCategory, type: string]
type Manifest = { id: string; category: ModwerkModule['category']; presentation: { family: string } }

// Shared names for families that have been published under different labels.
const families: Readonly<Partial<Record<string, Classification>>> = {
  Sequencer: ['sequencing', 'Pattern sequencing'],
  Sequencing: ['sequencing', 'Pattern sequencing'],
  'Sequencer recording': ['sequencing', 'Live recording'],
  'Sequencer note generator': ['sequencing', 'Note generation'],
  'Sample pattern generator': ['sequencing', 'Pattern generation'],
  'Pattern editing': ['sequencing', 'Pattern editing'],
  MIDI: ['midi-usb', 'MIDI control'],
  'Synth machines': ['machines', 'Synthesis'],
  'Sample machines': ['machines', 'Sampling'],
  'Sample track machine': ['machines', 'Sampling'],
  Playback: ['playback', 'Sample playback'],
  'Recorder buffer playback': ['playback', 'Sample playback'],
  'Sample workflow': ['playback', 'Sample editing'],
  LFO: ['modulation', 'LFO'],
  'Track mute behavior': ['performance', 'Mutes & solos'],
  'Track audition': ['performance', 'Mutes & solos'],
  'Incoming MIDI control': ['midi-usb', 'MIDI control'],
  'MIDI parameter feedback': ['midi-usb', 'MIDI control'],
  'Output routing': ['system', 'Audio routing'],
  Routing: ['system', 'Audio routing'],
  Mixer: ['system', 'Audio routing'],
  Transport: ['sequencing', 'Transport'],
  'Parts and Kits': ['system', 'Kits & parts'],
}

// An author's broad family can cover different functions. Qualify exceptions by instrument
// because module IDs can be reused (e.g. the Octatrack and Rytm versions of Temp Save).
const modules: Readonly<Partial<Record<string, Classification>>> = {
  'octatrack/euclid': ['effects', 'Rhythmic filter'],
  'octatrack/vibrato': ['effects', 'Vibrato'],
  'octatrack/quantizer': ['sequencing', 'Scale quantization'],
  'octatrack/playmodes': ['sequencing', 'Pattern playback'],
  'octatrack/direct-jump-kyoti': ['sequencing', 'Pattern playback'],
  'octatrack/dejavu': ['modulation', 'LFO'],
  'octatrack/quantize-live-rec-toggle': ['sequencing', 'Live recording'],
  'octatrack/arp-key-locks': ['midi-usb', 'Arpeggiator'],
  'octatrack/temp-save': ['system', 'Save & recall'],
  'octatrack/tuner': ['system', 'Tuner'],
  'octatrack/stem-rec': ['playback', 'Recording'],
  'octatrack/butter-fingers': ['sequencing', 'Pattern editing'],
  'analog-rytm-mkii/analog-bd': ['machines', 'Drum synthesis'],
  'analog-rytm-mkii/chorus': ['effects', 'Chorus'],
  'analog-rytm-mkii/flanger': ['effects', 'Flanger'],
  'analog-rytm-mkii/phaser': ['effects', 'Phaser'],
  'analog-rytm-mkii/wavefolder': ['effects', 'Waveshaping'],
  'analog-rytm-mkii/env-reset-amp': ['modulation', 'Envelope'],
  'analog-rytm-mkii/improved-amp': ['modulation', 'Envelope'],
  'analog-rytm-mkii/lfo-rnd': ['modulation', 'LFO'],
  'analog-rytm-mkii/quick-velocity-aftertouch-assign': ['modulation', 'Modulation routing'],
  'analog-rytm-mkii/voice-dac': ['effects', 'Voice processing'],
  'analog-rytm-mkii/euclid-accents': ['sequencing', 'Rhythm generation'],
  'analog-rytm-mkii/slice-loop': ['sequencing', 'Pattern generation'],
  'analog-rytm-mkii/quick-fill-trig-condition': ['sequencing', 'Pattern editing'],
  'analog-rytm-mkii/kit-ab': ['system', 'Kits & parts'],
  'analog-rytm-mkii/ctrl-all': ['performance', 'Performance controls'],
  'analog-rytm-mkii/ctrl-in-perf': ['performance', 'Macros'],
  'analog-rytm-mkii/control-in-actions': ['performance', 'Performance controls'],
  'analog-rytm-mkii/qperf': ['performance', 'Macros'],
  'analog-rytm-mkii/scene-mutes': ['performance', 'Mutes & solos'],
  'analog-rytm-mkii/silent-pad-trig': ['performance', 'Mutes & solos'],
  'analog-rytm-mkii/temp-save': ['system', 'Save & recall'],
  'analog-rytm-mkii/main-rms': ['system', 'Meter'],
  'analog-rytm-mkii/comp-preview': ['system', 'Meter'],
  'digitakt/crossfader': ['performance', 'Crossfader'],
  'digitakt/digiperform': ['performance', 'Macros'],
  'digitakt/digimatrix': ['modulation', 'Modulation routing'],
  'digitakt/digieq': ['effects', 'Equalizer'],
  'digitakt/digihealth': ['system', 'Diagnostics'],
  'digitone/digihealth': ['system', 'Diagnostics'],
  'digitakt/digiutils': ['system', 'Meter'],
  'digitakt/digineighbor': ['machines', 'Audio routing'],
  'digitakt/digisophie': ['machines', 'Drum synthesis'],
  'digitakt/live-looper': ['machines', 'Looper'],
  'digitakt/sample-tools': ['playback', 'Sample editing'],
  'digitakt/euclidean': ['sequencing', 'Rhythm generation'],
  'digitakt/midi-retrig': ['midi-usb', 'MIDI retrig'],
  'digitakt/note-accumulator': ['sequencing', 'Note generation'],
  'digitakt-ii/euclidean-scale': ['sequencing', 'Scale quantization'],
  'digitakt-ii/mute-latch': ['performance', 'Mutes & solos'],
  'digitone/digitables': ['sequencing', 'Note generation'],
}

export function libraryClassification(machine: string, document: Manifest): Classification {
  const { category, presentation: { family } } = document
  if (category === 'standalone') return [category, family]
  const key = machine + '/' + document.id
  return modules[key] ?? (Object.hasOwn(families, family) ? families[family] : undefined) ?? [category === 'scenes' ? 'performance' : category, family]
}
