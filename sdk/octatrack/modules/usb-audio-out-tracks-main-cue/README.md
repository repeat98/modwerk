# USB Audio 0.2

## Overview

Send Octatrack audio over class-compliant USB at 44.1 kHz, 24 bits. Choose
Computer for recording, or Outbox 8 for physical outputs. This experimental
release is owner-approved without current-build hardware tests. Chip timing
and complete hardware memory bounds remain unmeasured.

The selectable layouts and shared USB stack are imported from Octabam
`7b2984c859732ae6c797ae49c7d61d250b1b6519`, under MIT. The classic
twenty-channel source and its USB MIDI/reset fixes are retained from 0.1.4;
configurations without `usbAudio` settings keep that code path.

## Controls

There is no new Octatrack page or panel control. Open USB Audio setup in
Modwerk, choose a destination and one audio source, then save:

| Audio to send | USB channels | Signal tap |
| --- | ---: | --- |
| Main mix | 2 | Final stereo Main mix |
| Main + Cue mixes | 4 | Final Main and separate Cue |
| Track 8 / Master | 2 | Track 8 after effects, before LEVEL; enable MASTER TRACK for a master mix |
| 8 tracks before track levels | 16 | Track pairs before LEVEL |
| 8 tracks following track levels | 16 | Track LEVEL, mute, solo and XLV/crossfader applied |
| 8 tracks + Main + Cue | 20 | Eight tracks before LEVEL, plus Main and Cue |

Tracks following LEVEL exclude MAIN LEVEL and master effects on tracks 1–7.
With a master track, tracks 1–7 lead track 8 by 32 samples. The USB channel
map is sequential in the order shown in Modwerk. Four Outbox selectors name
physical stereo outputs; their helper text names the USB source pair. Off
sends no signal to that physical pair. Duplicate assignments are permitted.
Assign in order uses the first four available stereo signals and leaves
remaining outputs off. A smaller audio source turns unavailable assignments
off and reports that change. Destination/tab changes preserve draft choices;
only Add to configuration / Save setup stores them. Discard restores saved
settings. Copy assignments copies the plan for the external Outbox app.

## Usage

Use the configurator to choose the source before building the firmware.

### Record a mix or send Main + Cue to Outbox

1. Choose and save: open USB Audio setup, choose Outbox 8 and Main + Cue mixes, then Assign in order. Save the setup to the named configuration and build locally from your own OS 1.40C file.
2. Connect and route: connect the Octatrack USB port to Outbox 8. In Elektron's Outbox app, match Main / USB 1/2 to physical outputs 1/2 and Cue / USB 3/4 to physical outputs 3/4. Modwerk stores this plan; it does not program the Outbox hardware.
3. Use and reset: Main is the final stereo mix; Cue is the separate stereo Cue bus. Outputs 5/6 and 7/8 are off. To use different signals, change and save the source and assignments, rebuild, and update the external app. Stop the stream before changing cabling.

[Open Elektron's Outbox app](https://app.elektron.se/outbox8). Choose Computer and Use classic 20-channel setup to return to the previous implementation.

For a computer, select the Octatrack USB audio input in your DAW and use
the shown stereo channel pairs. Full multichannel operation needs a
high-speed host. USB input / Crossbar are outside this release. No sample
rate, bit depth or native track-control defaults are changed by the GUI.

## Compatibility and limitations

- Original Octatrack OS 1.40C only; inherited stock is recovered and guarded
  from the visitor's verified local file. No firmware is distributed.
- Like every DRAM module, the build gives up about 10 MB of sample memory
  to the platform reserve; the finished build shows how much it reserves. A
  project that filled Flex and recorder memory on the stock OS can then show
  OUT OF MEMORY when a Flex sample loads. Shorten the recorder reservation
  in the project's memory settings or the recorders' RLEN, or load long
  samples into a Static machine
  ([#433](https://github.com/repeat98/modwerk/issues/433)).
- One USB audio source per build. The required shared USB MIDI receiver,
  clock timestamp path and combined ISR are included.
- Outbox UAC2 accepts the 44.1 kHz SET_CUR control data stage and rejects
  unsupported rates. Hardware handshake operation has not been tested.
- At full speed, track layouts fall back to a stereo sum and Main + Cue
  to Main. Full multichannel operation requires high-speed USB.
- The selected shared stack produces only while streaming, clears the
  startup cushion on reopening, and requests alternate setting 0 on USB
  reset/session end. Cable recovery and startup audio on actual hardware
  are untested. Windows and Linux host behaviour are untested.
- Classic configurations preserve their older source path and schema.
  New backups use schema 4 and include the USB settings and routing plan.
  Old configurations are not silently assigned new audio settings.
- Post-LEVEL tap timing and master exclusions are described above.
  Current-build hardware, real-chip cycles, canaries, and complete memory
  bounds are unmeasured. Historical upstream results do not qualify 0.2.

## Tests and measurements

[TESTING.md](TESTING.md) records commands, evidence and coverage limits.
[evidence/layouts.json](evidence/layouts.json) contains hashes and linked
section sizes for six layouts alone, with Quantizer, and with Tape Echo +
Euclid. The shared build/import pipeline reproduces the source-only
packages in isolation, without firmware or network. Original firmware
integrity, stock descriptor/curve checks and packaging round trips remain
required.

CPU badges are relative estimates. Pinned upstream streaming USB-hook
instruction counts per 16-sample block are Main/Cue 827, pre-LEVEL Tracks
2,639, Tracks + Main + Cue 3,438 and post-LEVEL Tracks 4,278. Main and Track 8
are low source estimates with comparable timing unreported. These are port
instruction observations, not chip cycle or whole-device CPU percentages.
Linked section sizes do not establish complete stack / DMA bounds.

## Authorship and licences

Mark Roberts (markandrus/octemu) wrote USB audio/MIDI; Bryan T contributed
Main/Cue channels and alignment work; Sam Banks and Octabam contributors
added layouts, shared-stack integration and Outbox support.
allmyfriendsaresynths (@clickysteve) contributed the post-LEVEL gain engine. Modwerk adds
the configurator, configuration persistence and shared-composer packaging.
The imported source is MIT: see [LICENSE](LICENSE), source comments,
[layouts/UPSTREAM-AUDIO.md](layouts/UPSTREAM-AUDIO.md) and
[layouts/UPSTREAM-POST.md](layouts/UPSTREAM-POST.md). Exact imported file
identities are in the source-only package and SDK import record. See
[LEGACY.md](LEGACY.md) for preserved classic documentation and historical
measurements. Elektron rights remain reserved for locally recovered stock.

## Screens and audio

This automatic USB contribution adds no dedicated Octatrack page or
controls, so `access.noUiReason` documents the narrow publication
exception. Modwerk's existing module page presents the setup and USB
channel map. No hardware LCD image, host enumeration screenshot or audio
capture is claimed. Current software-only verification and the hardware
waiver are stated explicitly in TESTING.md.
