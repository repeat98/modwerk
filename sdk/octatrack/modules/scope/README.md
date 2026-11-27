# Scope

Version 0.2.0-experimental · by @ilia-murzinov · draft, not Modwerk-qualified.

## Overview

Hold **[DOWN]** and press **[TEMPO]** to open a full-panel scope of the
selected audio track after its effects and before its fader. **OSC** draws
a mono polyline, **XY** plots left against right, and **ALL** shows eight
mini level strips in track-pad order. No effect slot.

## Controls

| Control | Range | Default | What it does |
| --- | --- | --- | --- |
| GAIN (A) | 0..40 | 20 | Vertical scale. Centre is 0 dB. Push A resets and clears the peak. |
| TIME (B) | 0..9 | 3 | How much of the ring maps across the panel. |
| VIEW | OSC / XY / ALL | OSC | **[UP]** / **[DOWN]** cycle the three views. |

Release **[CUE]** to toggle the G/P HUD. **[RIGHT]** shows help; **[LEFT]**
returns. Clip `!` appears only when the recent peak reaches 0 dBFS.

## Usage

1. Select an audio track that is making sound.
2. Hold **[DOWN]**, then press **[TEMPO]**. SCOPE fills the panel.
3. Turn DATA ENTRY **A** and **B**, or press **[UP]** / **[DOWN]** to change view.
4. Press **[TEMPO]**, **[YES]** or **[NO]** to close.

## Quick tutorial

1. Play a track with clear level. Hold **[DOWN]** and press **[TEMPO]**.
2. Turn **A** until the waveform fills most of the height without clipping.
3. Press **[DOWN]** twice to reach **ALL**, then **[TEMPO]** to close.

## Compatibility and limitations

- **0.2.0** subscribes to `module_key`, `module_tick` and `ev_usb_frame` and
  patches no stock site, so **Tuner** can share a set. Confirm on your base
  that `ev_usb_frame` runs every audio block (ring fill and draw depend on it).
- **0.1.0** patched three stock sites; see PR #2182.
- Hold **[DOWN]** before **[TEMPO]**. TEMPO alone stays stock.
- Standalone: TUNER is not required.
- Draft only: no Modwerk USB package or `device:qualify` evidence yet.

## Tests and measurements

See [TESTING.md](TESTING.md).

## Authorship and licences

ilia-murzinov, MIT. See [LICENSE](LICENSE). The octabam copy under
`upstream/modules/scope/` also carries edits by octabam's maintainers (its
manifest's evidence records and README), under octabam's MIT licence (Sam
Banks), kept as [upstream/LICENSE](upstream/LICENSE).

## Screens and audio

The author's MKII LCD captures from the 0.2.0 package on a RAM-booted
development base show [SCOPE opening while B02 plays](media/scope-all-live.png)
and [a live trace after pressing DOWN](media/scope-live-trace.png).
The capture provenance is in the module manifest. No MAIN/CUE audio capture
was available from that base, so audible continuity is not established by
these screenshots.
