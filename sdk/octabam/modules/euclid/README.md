# Euclid

Version: 0.1.3-experimental · author: [Jannik Aßfalg](https://github.com/repeat98)

## Overview

A stereo Euclidean modulation effect for either FX slot. It follows the
Octatrack transport, track speed and swing grid. A 1–64-step rhythm drives
one of five destinations: 12 dB/octave low-pass, band-pass, high-pass,
notch, or amplitude. The rhythm keeps rolling across pattern loops; PLAY
resets phase.

The `euclid` remix retains the stock Plate, Spring and Dark Reverb rows in
FX2. Their descriptors, DSP code and dispatch entries stay stock.

## Controls

| Page | A | B | C | D | E | F |
|---|---|---|---|---|---|---|
| Main | FREQ | RES | DEPTH | DEC / LEN | STEPS | PULSE |
| Setup | ROT | RATE | TYPE | ATK / EDGE / SLEW | OUT mode | MIX |

FREQ is the base cutoff for LP/BP/HP/NOTCH and the base gain for AMP. DEPTH is
bipolar: its center leaves the destination static, positive values increase
it on a pulse, and negative values decrease it. RES controls the four filter
types and is inert for AMP. MIX zero is exact dry passthrough.

TYPE offers LP, BP, HP, AMP and NOTCH. AMP retains value 3 so existing saved
parts remain compatible; NOTCH is appended at value 4. The filter modes use
the same two-pole TPT state-variable core, with NOTCH summing its low-pass and
high-pass taps. AMP applies the Euclidean control signal as gain, so it can
produce rhythmic level envelopes, gates and stepped/random amplitude. In AMP,
the panel renames FREQ/RES/DEPTH to LEVEL/--/AMT; every filter type restores
the original names.

STEPS displays 1–64; PULSE displays 0–64 and is limited internally to STEPS.
STEPS, PULSE and ROT use the full dial arc without changing stored values or
encoder increments. This uses the remixer's shared `WIDE_STEPPED` formatter
support rather than an effect-owned panel detour.

## Usage

ROT shifts both the rhythm and captured random values right. RATE offers
1/32, 1/16, 1/8, 1/4 and 1/2 relative to track speed; 1/16 is one track
step. A RATE change joins the next point on the new grid without replaying a
backlog.

The output selector names itself ENV, GATE, RAND or LOOP:

- **ENV:** each pulse retriggers an attack and curved decay. ATK ranges from
  immediate to one step. DEC reaches eight steps and may cross several rests.
- **GATE:** each pulse opens the destination for LEN, from 1/128 to one step.
  EDGE smooths both transitions and is limited to half the gate length.
- **RAND:** each pulse chooses and holds a new level. SLEW controls the
  transition, up to one step.
- **LOOP:** freezes the last random value heard at every Euclidean position.
  ROT moves the captured values with the rhythm; returning to RAND resumes
  generation.

Zero pulses and STOP return to the base cutoff or gain. Captured values
survive transport restarts but are runtime state, not project data.

### Track swing and SWING ALL

Euclid automatically follows the swing amount and selected swing steps of
its audio track, including changes made with SWING ALL.
Rotation and odd Euclidean lengths do not rotate the track swing grid. The
1/32 subdivision interpolates the surrounding track-step offsets.

Select the audio track, press **REC** to enter Grid Recording, then press
**FUNC+BANK** to open **TRACK TRIG EDIT**. Select **SWING** with UP/DOWN:
turn **LEVEL** for that track, or hold **FUNC** while turning LEVEL for
**SWING ALL**. Use the TRIG keys on the SWING row to choose the affected
steps. **50%** means straight timing. The default swing mask selects the
even-numbered steps; changing the amount keeps each track's mask.

![Octatrack TRACK TRIG EDIT with SWING selected on track 1 and SWING TR1:62 displayed.](media/ot-swing-track.png)

This actual stock 1.40C menu capture shows the shared track settings that
Euclid reads. See [swing capture provenance](docs/swing-capture.md) and the
[Octatrack MKII manual, sections 12.10 and 12.10.3](https://www.elektron.se/wp-content/uploads/2024/09/Octatrack-MKII-User-Manual_ENG_OS1.40A_210414.pdf#page=73).
On MKI, FUNC is labelled FUNCTION; the same REC, FUNCTION+BANK and LEVEL
workflow applies.

## Quick tutorial: follow the track swing

1. Select the audio track with its TRACK key, hold FUNC and press FX1 or FX2, then select Euclid with LEVEL and confirm with YES.
2. Press the same FX key to return to the main page. Set STEPS to 16 and PULSE to 5; in SETUP, keep RATE at 1/16 and OUT at ENV.
3. Press REC to enter Grid Recording, then hold FUNC and press BANK to open TRACK TRIG EDIT. Select SWING with UP/DOWN and turn LEVEL to set the track swing amount; 50% is straight timing.
4. For an all-track change, hold FUNC while turning LEVEL on the SWING row. SWING ALL changes every track's amount; Euclid follows the amount and swing steps of the track it occupies.
5. Press NO to close the menu and REC to leave Grid Recording. Start playback on a track with audible audio: Euclid's pulses follow its track swing grid. Press STOP to return to the base cutoff or gain, or set MIX to 0 for dry audio.

## Compatibility and limitations

Use an audio track on Octatrack MKI or MKII with base OS 1.40C. Euclid can
occupy FX1 or FX2. No module conflicts are declared. The swing grid belongs
to the track; rotating Euclid or using an odd cycle length does not rotate
that grid. Captured LOOP values are runtime state and are not saved in the
project. STOP returns to the base cutoff or gain; PLAY resets rhythm phase.

Current hardware status remains untested. This documentation update retains
0.1.2-experimental's evidence and unchanged runtime inputs; the new swing
capture demonstrates the stock menu only. It adds no audio, hardware or
performance qualification. Costs and remaining measurements are described
below and in [TESTING.md](TESTING.md).

## Implementation

`control.c` is the integer rhythm/envelope engine. `generate_control.py`
compiles it to the checked-in `control.s` and appends `hooks.s`. The frame
hook publishes the modulated FREQ value after stock scene and LFO processing,
which otherwise overwrites it. Both PLAY paths call one reset routine and
restore the condition codes produced by the displaced stock PLAYING store.

Firmware addresses and sequencer-record strides are named and cited in the
firmware documentation. Track scale, length, swing and masks are read once
per track even when Euclid occupies both FX slots. The ColdFire engine derives
only the envelope timing used by the active output mode; stopped and inactive
instances skip it.

`filter.asm` contains the stereo two-pole TPT state-variable core and a
dedicated AMP path. AMP reproduces the original gain arithmetic exactly while
skipping the coefficient lookup, reciprocal divide and stereo filters; on the
host instruction meter it falls from about 2,276 to 462 instructions per
16-sample block. Returning to a filter clears the hidden integrators before
processing. Cutoff ramps per sample. Its reciprocal denominator follows a moving
cutoff to avoid closing-sweep overshoots, but a held cutoff reuses the exact
coefficient instead of paying for a 24-step divide on every sample. All DSP
state is initialized and private to the instance; no audio buffer is
allocated.

## Tests and measurements

`make check REMIX=euclid` runs the Euclid suite as part of the normal verify
target. It checks the native control laws, checked-in ColdFire assembly,
executed hook traces, caller registers and PLAY condition codes, both DSP
payloads, LP/BP/HP/NOTCH response, AMP unity/silence and instruction cost,
rapid TYPE changes, cutoff sweeps, stock-row
isolation and the real panel renderer. With `OT_PROJECT` it also boots a
copied project under the ColdFire port and checks full playback. No test
writes to the source project or hardware.

The current revision has not been hardware-tested by these tools.

The declared native suite and instruction costs above are source records;
this editorial update did not rerun them. No comparable whole-chip load
percentage or final storage measurement is supplied. The original test
record and hardware status remain in [TESTING.md](TESTING.md).

## Authorship and licences

Euclid is by [Jannik Aßfalg (@repeat98)](https://github.com/repeat98), using
octabam by Sam Banks. Module source retains its [MIT licence](LICENSE);
see [SDK attribution](../../THIRD_PARTY.md) for component credits.
The original UI captures have their [media rights declaration](media/LICENSE.md).
Current captures have contributor declarations in [FX capture provenance](docs/fx-capture.md)
and [swing capture provenance](docs/swing-capture.md); underlying Elektron
interface rights remain reserved.

## Screens and audio

Audio track FX1 or FX2 SETUP: Euclid in the effect chooser. These captures use FX2.

1. Select an audio track with its TRACK key.
2. Hold FUNC and press FX1 or FX2 to open that effect slot's SETUP.
3. Turn LEVEL to Euclid and press YES to assign it.
4. Press the same FX key to close SETUP for FREQ, RES, DEPTH, DEC, STEPS and PULSE.
5. Hold FUNC and press that FX key again for ROT, RATE, TYPE, ATK, output mode and MIX. Labels change with TYPE and output mode.

![Euclid main controls in its default filter/envelope mode: FREQ, RES, DEPTH, DEC, STEPS and PULSE.](media/ot-controls-monochrome.png)

![Euclid selected in FX2 SETUP: ROT, RATE, TYPE, ATK, ENV output mode and MIX.](media/ot-setup-monochrome.png)

These are actual headless-emulator LCD captures, not hardware results. See
[TESTING.md](TESTING.md), [current FX capture provenance](docs/fx-capture.md),
[original capture record](media/capture.json) and [media rights](media/LICENSE.md). The track swing capture above is
recorded separately in [swing capture provenance](docs/swing-capture.md).
No audio preview is included.

**Audio preview.** [Listen](media/audio-preview.mp3). One pad, played three times at 123 BPM: dry, then Euclid as a low-pass pulse filter (FREQ 36, RES 70, DEPTH 110, DECAY 56, STEPS 16, PULSE 5), then as amplitude pulses (TYPE AMP, FREQ 127, DEPTH 0, STEPS 12, PULSE 7). Each pass is level-matched to the dry one. Swing is not applied. It is an offline render on a computer through the module's own code, not a recording of an Octatrack. The sample, settings and method are in [audio-preview.json](media/audio-preview.json); rights are in [media rights](media/LICENSE.md).

## Clock reset safety (0.1.4)

Both PLAY paths save the full status register, mask interrupts while resetting Euclid's clock, and restore the previous interrupt mask and condition flags. The C reset clears initialized before rewriting the clock and publishes it last, with compiler memory barriers. This ports [octabam #620](https://github.com/sambanks/octabam/pull/620), pinned at 6f9e5bc9. Track timing, swing, phase policy and controls are unchanged.
