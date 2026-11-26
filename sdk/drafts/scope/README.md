# Scope

Version 0.1.0-experimental · by @ilia-murzinov · draft, not Modwerk-qualified.

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

- Lists **Tuner** as a conflict: both patch the TEMPO opener, frame ISR tail
  and UI-loop head. A Modwerk set cannot install both until a base hook owns
  those sites (octabam shares them through HOOKS). Propose that hook for a
  later release if both should coexist.
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

No Modwerk monochrome captures yet. Capture with
`scripts/capture-module-ui.py` before listing.
