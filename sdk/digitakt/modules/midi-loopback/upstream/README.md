# MIDI Loopback for Digitakt mk1

An [elekloader](https://github.com/irpina/elekloader) mod that lets the Digitakt's
MIDI tracks (9–16) control its own audio tracks and Master FX from the inside —
no external MIDI cable needed.

## What it does

Set a MIDI track's channel to the same channel as an audio track, then use the MIDI
track's CC knobs, parameter locks, notes and MIDI LFO to modulate and sequence that
audio track. A MIDI LFO acts as a third LFO on the audio track. The same works on the
Master FX by using the FX Control Channel, and on whichever track is currently
selected by using the Auto Channel.

Four things you can do with it:

- **Audio tracks 1–8:** filter cutoff and resonance, sample tune, start and length,
  overdrive, amp attack and decay, delay and reverb sends — all from a MIDI track's
  CC page, p-locks and LFO. Notes on the MIDI track can play an audio track
  chromatically, with 4-note chords and microtiming.
- **Master FX:** set a MIDI track to the `FX CONTROL CH` and use CCs for Delay
  (85–92), Reverb (24–31), Compressor (111–119) and External Mixer (102–109).
- **Auto Channel:** a MIDI track on the Auto Channel controls whichever track is
  active on the panel.
- **External gear:** a MIDI track on a channel that is not assigned to an internal
  channel still passes through to MIDI OUT and USB OUT as normal.

## Turning it on and off

| Where | Control | What it does |
|---|---|---|
| **SETTINGS > MIDI LOOPBACK** | **[YES]** | Toggles the loopback ON/OFF. |
| | **[RIGHT]** | Turns it ON (messages on internal channels stay inside the Digitakt). |
| | **[LEFT]** | Turns it OFF (stock behaviour: messages go to MIDI OUT / USB). |
| **SETTINGS > MIDI CONFIG > CHANNELS** | — | Set the channels for audio tracks 1–8, the Auto Channel and the FX Control Channel. |
| **MIDI tracks 9–16** | **SRC page → CHAN** | Choose an internal channel, then use the AMP (CC) page and the LFO to modulate. |

The mod also shows Digitakt parameter names on the MIDI tracks' FLTR CC Select page.

## Supported firmware

- Digitakt mk1, OS **1.53** and **1.54**
- Requires **core 4.1**
- Conflicts with the `cc-labels` mod

## Build it yourself

You need Python 3.9+, git and the m68k cross compiler. With the stock Elektron OS file
(this repository never contains it):

```sh
python -m elekloader.sdk.build . --stock Digitakt_OS1.53.syx
python -m elekloader.sdk.build . --stock Digitakt_OS1.54.syx
```

The built `.elemod` files appear in `out/`. To check them:

```sh
python -m elekloader.lint out/midi-loopback-<version>.elemod \
  --stock Digitakt_OS1.53.syx --with core-4.1-os1.53.elemod
```

## Flash, and get back to stock

Build a firmware file from your stock OS and the `.elemod` on the
[elekloader site](https://elekloader.github.io/elekloader/), or with
`python -m elekloader.patch`. Send the resulting `.syx` with Elektron Transfer like a
normal OS update. The bootloader is never changed.

To go back to stock: hold **FUNC** while powering on the Digitakt, press **TRIG 4**
(OS UPGRADE), then send the original Elektron `.syx`. Do not press TRIG 2 or TRIG 3 —
those are for an empty/factory reset.

## Test status

The `.elemod` files are built and lint-clean. Hardware test details are listed in the
shop submission for this mod.

## Licence

GPL-3.0-or-later. No Elektron firmware or Elektron code is included.
