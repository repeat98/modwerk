# Quick Mod Assign

An Analog Rytm MKII mod by npp1993 (Nathaniel Pavel). Version 0.1.0-experimental, OS 1.74 with core-ar2 0.7.

## Overview

Linking velocity or aftertouch to a parameter on stock takes a trip through SOUND SETTINGS: FUNC + FLTR, down to VELOCITY MOD, YES, scroll a long list for the destination, turn the amount, then NO, NO back to the page. Quick Mod Assign does it from the page you are playing:

- **Hold FIX and turn a knob**: that parameter is linked to velocity, and the turn sets the amount.
- **Hold SAMPLER and turn a knob**: the same for aftertouch.

While either key is held, every knob already linked shows its amount the way stock shows a performance lock (an inverted box with +n), and a V or an A sits in the screen's top-left corner. Envelope graphics follow the amount as they do for a lock. The mod fills stock's own four velocity and four aftertouch slots of the selected sound, so the links save with the kit, show in SOUND SETTINGS as usual and keep playing on a unit without the mod.

## Controls

| Control | Where | What it does |
| --- | --- | --- |
| FIX held | SYNTH, SAMPLE, FILTER, AMP and LFO pages of a sound track, also in PERF, SCNE, MUTE and CHRO | Shows the velocity links: a V in the corner, each linked knob inverted with its amount. Turning a knob links it, or changes its amount, -128 to +127. The parameter's own value does not move. |
| SAMPLER held | as above | The same for aftertouch, with an A. |
| FIX tap | anywhere stock takes it | Toggles fixed velocity as on stock, on the release instead of the press. |
| SAMPLER tap | anywhere | Opens the recorder, as on stock. After a hold with a turn it does not. |

A parameter already linked keeps its slot. A new one takes the first slot with no destination or an amount of 0; turning a slot back to 0 frees it. A slot at 0 still shows as +0 while the key is held (a new kit links FILT FRQ and FILT RES to velocity at 0). With all four slots holding other parameters a popup says `VEL SLOTS FULL` (`AT SLOTS FULL`) and nothing changes. A parameter that is not in stock's destination list gives a popup and no change. Each knob event moves the amount at least one step, more when turned fast, whatever the parameter's own resolution.

FUNC + FIX (stock's FIXED VELOCITY), the FX track, and a performance or scene pad or a trig that holds stock's lock edit keep stock's behaviour: a pad pressed in PERF or SCNE during a hold makes a performance or scene lock as usual, and the V or A comes back when it is let go. During a hold the other key does nothing.

## Usage

1. Select a sound track, press FLTR.
2. Hold FIX and turn FRQ to the right: FRQ's knob turns into a box reading +20 and a V shows in the corner. Harder hits now open the filter.
3. Hold SAMPLER and turn DEC on the AMP page: pad pressure now lengthens the decay.
4. FUNC + FLTR, SOUND SETTINGS, VELOCITY MOD shows the same links, ready to fine-tune.

## Changes to stock flows

- **FIX's toggle moves to the release.** What changes: on the pages and pad screens, a FIX press is held back until the release, so a hold with a turn leaves fixed velocity as it was. Why: the press cannot know whether a turn follows; stock toggles at the press. What you see: the FIX state changes when you let go. Elsewhere, and with FUNC held, FIX is stock's. Checked: a tap, two taps, a hold past key repeat, a hold with a turn, FUNC + FIX, in rytm-emu.
- **SAMPLER held with a turn does not open the recorder.** Stock opens it on SAMPLER's release, also after a knob turn; with this mod a turn during the hold makes it an assignment instead. A tap opens the recorder as before. Checked in rytm-emu.
- **FIX or SAMPLER held changes what a knob turn does.** What changes: on a sound page, a turn sets a mod slot instead of the parameter, drawn as a performance lock. Why: that is the mod. Stock does nothing special with FIX or SAMPLER held and a knob turned (checked in rytm-emu: the knob edits as normal). It applies while the key is held only.
- **During a hold, some knobs do nothing.** What changes: with FIX or SAMPLER held, the TRIG page's knobs, a knob turned with a trig held, and FUNC + a knob no longer edit (stock's lock edit, which the hold switches on, refuses TRIG parameters, and the mod refuses a link with a trig held so none is made by accident). Why: the hold is for links; a trig edit or a fine FUNC edit can wait until the key is let go. What you see: the knob does not move. Considered: passing these turns to stock, which stock's lock edit does not allow without a patch of its own. Checked in rytm-emu: TRIG page, a trig held, both key orders.
- **The other key does nothing during a hold.** What changes: FIX pressed during a SAMPLER hold does not toggle fixed velocity, and SAMPLER pressed during a FIX hold does not open the recorder. Why: a key brushed mid-assignment should not change the sound or leave the page. Checked in rytm-emu.

## Compatibility and limitations

- OS 1.74 only, with core-ar2 0.7. No other module is needed.
- It patches no stock site. It sets its own locker in stock's parameter UI while a key is held, as QPERF does with QPER, and adds a `core_params` entry for every parameter id with only a turn function (order 5) for a turn that reaches stock's parameter edit. It subscribes to `ev_key`, `ev_enc`, `ev_tick` and `ev_draw`. No storage.
- A performance or scene pad, or a trig, that holds stock's locker when FIX or SAMPLER goes down or during the hold keeps it; the mod shows its V or A and its amounts again within a tick of it letting go.
- Stock's LFO DST knob opens its list rather than turning, so FIX + DST does nothing.
- On a unit, build QM06 (FIX + knob, slots full, the FIX key, save and power cycle) passed by the author's report; SAMPLER and the lock-style display (QM07 on) are emulator-only so far: see [TESTING.md](TESTING.md).

## Tests and measurements

rytm-emu on OS 1.74 ([TESTING.md](TESTING.md)), and the author's unit on an earlier build. Memory (build QM09's link map): 3,704 bytes of code and initialised data and 40 bytes of `.bss` in the 128 KiB shared mod area. Load: UI only, on key events, knob turns and the screen's draw; nothing runs in the audio path.

## Authorship and licences

Original code by npp1993 (Nathaniel Pavel), GPL-3.0-or-later ([LICENSE](LICENSE)). The OS 1.74 addresses were read by the author from their own stock firmware; the build carries addresses only, no stock bytes. No Elektron firmware is included.
