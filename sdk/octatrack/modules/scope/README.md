# Scope

Version 0.2.0-experimental · by @ilia-murzinov · Modwerk catalog module.

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

1. Select an audio track that is making sound. No effect slot is required.
2. Hold [DOWN] first, then press [TEMPO]. The full-panel SCOPE window opens.
3. Turn DATA ENTRY A (GAIN) and B (TIME). Press [UP] or [DOWN] to cycle OSC, XY and ALL.
4. Press [TEMPO], [YES] or [NO] to close. Hold [DOWN] and press [TEMPO] again to reopen.

## Compatibility and limitations

- **0.2.0** needs the public Modwerk **0.8.1** beta base (Elektron OS **1.40C**).
  Install SCOPE from the catalog USB package. **No USB Audio module is
  required.** SCOPE does not use an effect slot and **works beside Tuner** in
  the same set.
- Hold **[DOWN]** before **[TEMPO]**. TEMPO alone stays stock.
- Standalone: Tuner is not required.
- Shipped USB package `f8a1ffeb`. See [TESTING.md](TESTING.md) for which bases
  were flashed or RAM-booted for each check.

## Tests and measurements

See [TESTING.md](TESTING.md).

## Authorship and licences

ilia-murzinov, MIT. See [LICENSE](LICENSE). The octabam copy under
`upstream/modules/scope/` is Sam Banks's MIT work; see [upstream/LICENSE](upstream/LICENSE).

## Screens and audio

LCD captures in this folder are from the **0.2.0** catalog package on a
**development twin** RAM-booted from OS 1.40C (see TESTING.md). They show
[SCOPE opening while B02 plays](media/scope-all-live.png) and [a live trace
after DOWN+TEMPO](media/scope-live-trace.png). The same package on the flashed
**0.8.1** release base passed the open-window check while B02 played (28
November 2026, TESTING.md). No MAIN/CUE audio capture was available during the
dev-twin captures.
