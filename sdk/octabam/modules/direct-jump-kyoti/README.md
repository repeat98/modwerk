# Direct Jump Kyoti

## Overview

On the stock OS a cued pattern waits for the playing one to reach its end. With Direct Jump on, it takes over on the next step instead, locked to the master clock: it starts at the step it would be on had it been playing since you pressed PLAY, whatever its length, scale or per-track settings. The Part, START SILENT and trig conditions change as on a stock pattern change, and the last MIDI Program Change sent names the pattern that plays. Direct Jump is off at every power-on, so the stock pattern change stays the default.

Version `0.1.2-experimental`, for OS 1.40C card builds and, for beta testers, over USB on the Modwerk base, listed as DirectJmp Kyoti: a module's name on the Octatrack holds 15 characters, too few for Direct Jump Kyoti. This is Zac Kyoti's octabam module `direct-jump-kyoti` (his V7, the clock-locked landing), with his fix for stock's MIDI Plays-Free trig stall built in, as in his own Direct Jump builds. Modwerk re-encodes a few of its instructions so the USB package carries no stock code; the behaviour is his.

**Hardware status.** The author tested the timing, the Part change and the toggle on his MKI (27 September to 1 October 2026, his own builds). Modwerk's USB package ran on the owner's MKII on 24 October 2026: installed, kept, restored after a power cycle and removed on the flashed beta base, and on a development twin the toggle and clock-locked jumps between a 64- and a 16-step pattern ([evidence/hardware.md](evidence/hardware.md)). The card build has not run on a unit. Version 0.1.1 adds the author's MIDI Plays-Free fix, which he confirmed on his MKI. On 25 October 2026 the 0.1.1 and 0.1.2 packages were installed, kept, self-tested and removed on the owner's MKII on the beta base; the fix itself was not exercised on it.

## Controls

| Gesture | What it does |
|---|---|
| Hold [PTN], press [YES] | Turns Direct Jump on or off. A toast shows DIRECT JUMP ON or DIRECT JUMP OFF. Releasing [PTN] afterwards does not open the pattern chooser. |
| Hold [PTN], press a trig key, while playing | Cues that pattern, as on stock. With Direct Jump on it takes over on the next step. |

There is no menu row, page or knob, and nothing is saved: the setting lives in the module's own memory and is OFF after every power-on.

## Usage

Direct Jump changes only when a cued pattern takes over. Cue patterns the stock way, with [PTN] and a trig key; the toggle decides whether the cue waits for the end of the playing pattern (OFF, stock) or lands on the next step (ON).

### Quick tutorial: jump between patterns on the next step

1. Hold [PTN] and press [YES]: DIRECT JUMP ON appears. Release [PTN]; the pattern chooser stays shut.
2. Press [PLAY]. Hold [PTN] and press a trig key to cue that pattern: it takes over on the next step, at the step it would be on had it played since START.
3. Hold [PTN] and press [YES] again for DIRECT JUMP OFF: cued patterns wait for the end of the playing one again, as on the stock OS.

### Where the new pattern lands

The landing is clock-locked: the incoming pattern starts at the position it would hold had it been playing since START. For two 16-step patterns that is simply the next step. A 7-step pattern lands on the step a 7-step loop would be on at that moment, so it stays in phase with a loop that had been running all along. In PER TRACK mode, with tracks of different scales, the jump waits for the next clock tick at which every track sits on a step boundary (at most one common step of all the scales involved, for example 24 clock ticks with 1x, 3/4x and 1/2x tracks), so every track starts exactly on its step.

A jump changes what a stock pattern change changes: the Part (if the new pattern uses another one), START SILENT and the trig-condition counters. Cueing again before the jump lands takes the newest cue; cueing back the playing pattern cancels, and a Program Change for the playing pattern is sent again so external gear follows. No MIDI START is sent on a jump.

While the arranger or a pattern chain runs, Direct Jump leaves pattern changes to stock.

### What changes in a stock flow

One stock gesture is touched:

- **What changes and for whom.** [PTN] + [YES] toggles Direct Jump, with a toast. On the stock OS [YES] does nothing in the [PTN] layer, and releasing [PTN] then opens the pattern chooser; with this module the chooser stays shut after the toggle. Everyone with the module in their build or module set has the gesture.
- **Why.** The toggle belongs next to the pattern keys it changes, and [YES] is free in the [PTN] layer on stock. A menu row would need a settings store Modwerk does not have yet.
- **What you see and do differently.** A toast on [PTN] + [YES]. [PTN] alone, [PTN] with trig keys, [YES] alone and the chooser after a plain [PTN] tap are unchanged.
- **Turning it off.** [PTN] + [YES] again, or a power cycle. Pattern changes are stock while it is off.
- **Neighbouring flows checked** (emulator, MKII panel, against the original OS): [YES] alone; [PTN] + [YES] and the chooser on release; a stock cued pattern change while OFF (identical sequencer state on every step). Not checked: the arranger, chains, MKI panel.

## Compatibility and limitations

- OS 1.40C. The author tested the clock-locked timing, the Part change and the toggle on his MKI; Program Change on fast re-cues, MIDI tracks, START SILENT and the trig-condition reset he verified in his emulator only. Modwerk's USB package ran on an MKII (the toggle, jumps, a power cycle, removal); a jump into another Part, per-track scales and external MIDI were not tried on it.
- OFF at every power-on and not stored in the project: turn it on again after a restart.
- While the arranger or a pattern chain runs, pattern changes stay stock.
- With differing track scales in PER TRACK mode the jump waits for the next tick where every track is on a step boundary (see above).
- A jump changes the Part through stock's own Part-change path, so stock's known Part-change carryover issues (a track going from PICKUP to FLEX can keep the old Part's pickup loop; see the author's notes) happen on a jump as on a stock pattern change.
- With [Play Modes](../playmodes/README.md): each jump runs through the stock path that starts the transport, which Play Modes watches, so Play Modes restarts its per-track state on a jump as it does on PLAY. Not yet tested together.
- No conflicts are declared. The upstream module also refuses octabam's DIRECT JUMP (Tim Hastie's CHAIN AFTER option) and OCTAKIT, neither of which Modwerk has.

**The MIDI Plays-Free fix is built in.** Upstream, the module `requires` the author's BATCH_BUGFIXES bundle for its MIDI Plays-Free fix ([upstream/README.md](upstream/README.md), "Required: the bugfix bundle"). On stock, a Plays-Free MIDI track with trig quantize DIRECT under PER TRACK scale stalls after its first step when you start it with its trig key, because stock seeds that track's scale from the wrong byte. Direct Jump reads that same byte to place each track, so without the fix it would place such a track with the master's scale instead of its own. Modwerk modules never depend on another module, so from 0.1.1 Direct Jump carries the fix itself, as the author's standalone Direct Jump image does: his `patch_trigscale.s`, from the same pin. It fixes the stall too, whether Direct Jump is on or off. The source still reads any scale byte above 6 as the master's, as a backstop. The bundle's other two fixes are not included: the empty-pattern LED is unrelated to Direct Jump, and the Part-change carryover fix is the one the author measured as independent of it (the Part-change trace, Program Changes on fast re-cues and the whole timing matrix identical with and without it). Version 0.1.0 shipped without the Plays-Free fix.

Hook sites: the landing countdown read in phase D of the sequencer's tick handler at `0x400a1f72` and the MIDI START gate in its landing path at `0x400a221c` (both `jsr`, replaying what they displace), the [PTN] release at `0x40043418` (`jmp`), the [PTN] layer's YES press slot at `0x400bf0c0`, which is empty on stock, and, for the Plays-Free fix, the per-track scale seed of a track's manual start at `0x4009b6f2` (a `jmp` to the fix, which redoes the 18 stock bytes there for audio tracks and reads a MIDI track's own scale). No other catalogue module claims any of them.

## Tests and measurements

[TESTING.md](TESTING.md) has the commands and every result: the unit's bytes, the emulator gate (the toggle, OFF against the original OS, three jumps against reference runs, and the MIDI Plays-Free stall on the original OS against the fix), the USB package's stock-free scan, and what was not tested. Emulator results say nothing about a real unit's timing or audio.

## Authorship and licences

Zac Kyoti designed Direct Jump and wrote its ColdFire source (MIT, [LICENSE](LICENSE)); Sam Banks integrated it into octabam (MIT, [upstream/OCTABAM_LICENSE](upstream/OCTABAM_LICENSE)). Thanks to Sebastien Michel (uvbproject) for investigating the port in [pull request #856](https://github.com/repeat98/modwerk/pull/856); nothing from it is in the module. The author's own description is kept in [upstream/README.md](upstream/README.md) and octabam's wrapper page in [upstream/OCTABAM_README.md](upstream/OCTABAM_README.md). `../../../imports/direct-jump-kyoti-b725fb1.json` records each copied file with its source pin: `upstream/README.md` and `LICENSE` are the author's files byte for byte; `patch_directjump_v7.s` is his file with three kernel posts routed through one helper and two instructions swapped (marked MODWERK); `patch_trigscale.s` is his MIDI Plays-Free fix from BATCH_BUGFIXES with one instruction moved and its label renamed (marked MODWERK); `manifest.py` declares the same units and sites with SHA-256 guards in place of stock bytes. The Modwerk gate (`verify.py`), documentation and thumbnail are GPL-3.0-or-later. No firmware, stock code, built image or card is included.

## Screens and audio

Captured from the real LCD in the headless emulator, MKII panel; provenance is in [media/capture.json](media/capture.json). They show the emulator, not a unit. The module makes no sound of its own, so there is no audio preview.

![Octatrack main screen with a notification box reading DIRECT JUMP ON.](media/ot-direct-jump-on.png)
![Octatrack main screen during playback showing pattern A02 as the playing pattern.](media/ot-jump-landed.png)
![Octatrack main screen with a notification box reading DIRECT JUMP OFF.](media/ot-direct-jump-off.png)
