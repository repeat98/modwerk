# Quick Mod Assign

An Analog Rytm MKII mod by npp1993 (Nathaniel Pavel). Version 0.1.0-experimental, OS 1.74 with core-ar2 0.7.

## Overview

Linking velocity or aftertouch to a parameter on stock takes a trip through SOUND SETTINGS: FUNC + FLTR, down to VELOCITY MOD, YES, scroll a long list for the destination, turn the amount, then NO, NO back to the page. Quick Mod Assign does it from the page you are playing:

- **Hold FIX and turn a knob**: that parameter is linked to velocity, and the turn sets the amount.
- **Hold RTRG and turn a knob**: the same for aftertouch.

It fills stock's own four velocity and four aftertouch slots of the selected sound, so the links save with the kit, show in SOUND SETTINGS as usual and keep playing on a unit without the mod.

## Controls

| Control | Where | What it does |
| --- | --- | --- |
| FIX + turn a knob | SYNTH, SAMPLE, FILTER, AMP and LFO pages of a sound track, also in PERF, SCNE, MUTE and CHRO | Links the parameter to velocity. The amount, -128 to +127, starts from the slot's own and follows the turn; a popup shows `VEL`, the knob's name and the amount. The parameter's own value does not move. |
| RTRG + turn a knob | as above | The same for aftertouch (`AT`). Once a pad is played during the hold, the knobs work as stock for the rest of it, so pad retrigs and a knob tweak still go together. Stock's RETRIG popup and LEVEL's retrig rate are unchanged. |
| FIX tap | anywhere stock takes it | Toggles fixed velocity as on stock, on the release instead of the press. |

A parameter already linked keeps its slot. A new one takes the first slot with no destination or an amount of 0; turning a slot back to 0 frees it. With all four slots holding other parameters a popup says `VEL SLOTS FULL` (`AT SLOTS FULL`) and nothing changes. A parameter that is not in stock's destination list gives a popup and no change.

FUNC + FIX (stock's FIXED VELOCITY), a held trig (stock's lock), the TRIG page and the FX track stay stock. With FIX or RTRG held, the turn is this mod's even with TRK held, so Ctrl All's all-tracks move does not run.

## Usage

1. Select a sound track, press FLTR.
2. Hold FIX and turn FRQ to the right: the popup reads `VEL FRQ +20`. Harder hits now open the filter.
3. Hold RTRG and turn DEC on the AMP page: pad pressure now lengthens the decay.
4. FUNC + FLTR, SOUND SETTINGS, VELOCITY MOD shows the same links, ready to fine-tune.

## Changes to stock flows

- **FIX's toggle moves to the release.** What changes: on the pages and pad screens, a FIX press is held back until the release, so a hold with a turn leaves fixed velocity as it was. Why: the press cannot know whether a turn follows; stock toggles at the press. What you see: the FIX state changes when you let go. Elsewhere, and with FUNC held, FIX is stock's. Checked: a tap, two taps, a hold with a turn, FUNC + FIX, in rytm-emu.
- **FIX or RTRG held changes what a knob turn does.** What changes: on a sound page, a turn sets a mod slot instead of the parameter. Why: that is the mod. Stock does nothing special with FIX or RTRG held and a knob turned (checked in rytm-emu: the knob edits as normal). With RTRG, playing a pad first gives stock's turn back for that hold.

## Compatibility and limitations

- OS 1.74 only, with core-ar2 0.7. No other module is needed.
- It patches no stock site: the turn comes through core-ar2's `core_params` table (an entry for every parameter id with only a turn function, ahead of the others, order 5). It subscribes to `ev_key` and `ev_tick`. No storage.
- Stock's LFO DST knob opens its list on a turn rather than turning, so FIX + DST shows stock's list.
- A turn moves the amount by at least one step for each knob event, more when turned fast, whatever the parameter's own resolution.
- Not tested on a unit: see [TESTING.md](TESTING.md).

## Tests and measurements

rytm-emu on OS 1.74, build QM03 ([TESTING.md](TESTING.md)). Memory: about 2,000 bytes of code and 52 bytes of data in the 128 KiB shared mod area. Load: UI only, on key events and knob turns; nothing runs in the audio path.

## Authorship and licences

Original code by npp1993 (Nathaniel Pavel), GPL-3.0-or-later ([LICENSE](LICENSE)). The OS 1.74 addresses were read by the author from their own stock firmware; the build carries addresses only, no stock bytes. No Elektron firmware is included.
