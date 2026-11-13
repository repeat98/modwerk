import { USB_AUDIO_REVISION, type UsbAudioLayout } from './usb-audio'

// Relative estimates anchored to the upstream USB-hook comparison. Instruction
// counts are port observations, not real-chip cycles or whole-device CPU %, and
// they did not predict the one layout measured on a unit: a stream's cost is its
// memory traffic (sdk/machines/octatrack/elekloader/README.md, 13 November 2026).
const measuredSource = 'https://github.com/repeat98/modwerk/blob/main/sdk/machines/octatrack/elekloader/README.md'
const costSource = `https://github.com/sambanks/octabam/blob/${USB_AUDIO_REVISION}/modules/usb-audio-out-tracks-post/README.md#cost`
const source = (layout: string) => `https://github.com/sambanks/octabam/blob/${USB_AUDIO_REVISION}/modules/usb-audio-out-${layout}/README.md`
export const USB_AUDIO_CPU = {
  'tracks-main-cue': { level: 'High', score: 4, measured: true, instructions: 3438, source: measuredSource, rationale: 'Eight stereo stems plus Main and Cue. Measured on an Octatrack MKII while a computer recorded all 20 channels and a pattern played: the audio interrupt took 65 % of the processor, against 39 % with no recording. Chosen on the Octatrack, MAIN + CUE ONLY brought it to 52 % and OFF to 44 %.' },
  tracks: { level: 'Moderate', score: 3, measured: false, instructions: 2639, source: costSource, rationale: 'Eight stereo stems, with less copy work than the 20-channel feed. The upstream streaming USB hook executed 2,639 instructions per 16-sample block under the port.' },
  'tracks-post': { level: 'High', score: 4, measured: false, instructions: 4278, source: costSource, rationale: 'Eight stems plus per-track performance gain. The upstream streaming USB hook executed 4,278 instructions per block under the port. A separate MKII comparison measured +2.8 µs per frame versus pre-fader Tracks; this is not this Modwerk build or a worst-case measurement.' },
  'main-cue': { level: 'Low', score: 2, measured: false, instructions: 827, source: costSource, rationale: 'Two stereo mix buses, with less copy work than the stem feeds. The upstream streaming USB hook executed 827 instructions per 16-sample block under the port.' },
  main: { level: 'Low', score: 2, measured: false, instructions: null, source: source('main'), rationale: 'One stereo Main bus: the producer reads 32 mixdown words per block. Low is a source estimate; comparable streaming hook timing has not been reported.' },
  master: { level: 'Low', score: 2, measured: false, instructions: null, source: source('master'), rationale: 'One stereo Track 8 feed, with no other track or Main/Cue sum. Low is a source estimate; comparable streaming hook timing has not been reported.' },
} as const
export function usbAudioCpuLoad(layout: UsbAudioLayout) { return USB_AUDIO_CPU[layout] }
