# Writing trigs into the pattern (Digitakt mk1, OS 1.54)

Research for a pattern generator mod (a meloDICEr-style random melody generator): how a mod can write trigs, NOTE, VELOCITY and LENGTH into the active pattern, as a user's edit would, from the UI task.

**Status:** static analysis of the stock OS 1.54 MAIN image, then checked in the digiemu emulator (see [Emulator results](#emulator-results)). Nothing here has run on a unit. Confidence: **H** read in the code, **M** strong inference, **G** guess, **E** confirmed in the emulator. [Hardware checks](#hardware-checks) lists what to confirm with [dtpeek.py](dtpeek.py) before any mod relies on it. OS 1.53 is not mapped yet (see [OS 1.53](#os-153)).

## Emulator results

digidice ([sdk/drafts/digidice](../../drafts/digidice/README.md)) and a probe mod were run in digiemu v0.4.1 on OS 1.54 (report: [evidence/emulator.md](../../drafts/digidice/evidence/emulator.md)).

- **E:** the trig, NOTE, VEL and LEN setters called from `ev_tick` and `ev_key` write the bytes listed under [Track data](#track-data) (flags +0x000, VEL +0x080, LEN +0x0C0, NOTE +0x280). The track's own setters notify; no extra `changed(NULL)` was needed.
- **E:** the sequencer plays the edit at once. Voice starts and the recorded audio follow the written steps and notes, so the "mirror" question below does not affect a generator.
- **E:** on an audio track NOTE 60 is C5 (0), no transpose. On MIDI tracks the same setters and layout work (track 9 written, track 1 unchanged).
- **E:** the LEN index counts eighths of a step up to 4 steps (index 0–31), then quarters to 8 steps (32–47), then halves to 16 steps (48–63).
- **E:** a key event's flags (`ev+16`) carry 1 for a press, 2 with FUNC held, 4 for a double press and 0x10 for a release. Two presses of TRIG 140 ms apart arrive as `19/1` then `19/5`; 960 ms apart, both are `19/1`. Stock OS 1.54 does nothing extra on a double press on TRIG. FUNC+YES and FUNC+NO are stock ("Prj must be re-saved!" on an unsaved project); FUNC+BANK is the metronome.
- **Not confirmed:** the undo snapshot. The arguments in [Recommended call sequence](#recommended-call-sequence-m) (`…, 0, 0, 1`) match no stock caller; the stock ones pass `(1, 0, 1)` (CLEAR PATTERN), `(1, 1, 0)`, `(0, 1, 0)` and `(1, 0, 0)`. Runs with a snapshot hit digiemu's own OS 1.54 heap fault (stock stops the same way after CLEAR PATTERN), so the snapshot could not be judged there. digidice v1 takes none.

The MAIN image loads at `0x40000400`. Every routine takes its arguments on the stack, `this` first; the result is in d0.

## Summary

- The OS already has a setter for each per-step field, and they are the same ones the grid, the TRIG page and live recording use (H). Each one clamps the step, ignores steps past the track's length, writes one byte and notifies.
- NOTE, VEL, LEN, micro timing and condition are plain per-step arrays, not p-locks, so a generator does not use up the pattern's p-lock capacity (H).
- No mutex protects pattern data. The stock UI writes it from the UI task, and so can a mod from `ev_tick` or `ev_key` (M). Do not call the setters from `ev_render_in` or `ev_render_out`: notifying allocates memory and takes queue mutexes (H for what they call).
- A stock undo snapshot can be taken before writing (H for the code).
- digislicer already calls `NOTESET` and `LOCKSET` from the UI task on 1.53 and 1.54 ([os154.h](../modules/digislicer/src/os154.h)), which is precedent for this approach.

## Reaching a track

```c
app = 0x40138882();              /* OS_APP: the project singleton */
pat = 0x40015786(app);           /* OS_PATTERN: app + 0xAFC + n * 0x64C, n = the active pattern, 0..127 */
trk = 0x40012a02(pat, t);        /* OS_PTRACK: pat + 0x70 + t * 0x58, t = 0..15 */
data = (*(void *(**)(void *))(*(u32 *)trk + 40))(trk);   /* vtable slot 10: the track's data */
```

`OS_APP`, `OS_PATTERN` and `OS_PTRACK` are digislicer's names. Tracks 0–7 are the audio tracks and 8–15 the MIDI tracks; both use the same data layout (H).

## Track data

64 entries per array, indexed by step. -1 means "the track's default".

| Offset | Type | Field | Setter | Conf. |
| --- | --- | --- | --- | --- |
| +0x000 | u16[64] | step flags; bit 0x0001 = a trig | `0x40026050(trk, step, mask, on)` | H |
| +0x080 | s8[64] | VELOCITY | `0x40024b2a(trk, step, v)`, no clamp | H |
| +0x0C0 | s8[64] | LENGTH, an index into the table at `0x40191590` | `0x40024ba4(trk, step, v)`, no clamp | H |
| +0x100 | s8[64] | micro timing, -23..+23 | `0x40024c1e(trk, step, v + 64)` | H |
| +0x140 / +0x180 / +0x1C0 | 64 each | retrig length / rate / velocity curve | `0x40024d3c` / `0x40024cb2` / `0x40024dc6` | M |
| +0x200 | s8[64] | trig condition, -1 = none | `0x400245b2(trk, step, v)` | H |
| +0x240 | s8[64] | sound lock (audio tracks) | `0x4002483c` | M |
| +0x280 | s8[64] | NOTE, 0..127 | `0x40024942(trk, step, v)` (`OS_NOTESET`) | H |
| +0x2C0 / +0x300 / +0x340 | s8[64] | NOTE 2–4 (MIDI chords) | `0x400249bc` / `0x40024a36` / `0x40024ab0` | H |
| +0x380 / +0x381 / +0x384 | s8 | track default VEL / LEN / NOTE | | H |
| +0x388 | s16 | track length (per-track scale mode) | `0x40024f94` | H |
| +0x38B | s8 | track speed index | `0x4002506c` | H |

The effective length of a track is `0x40024700(trk)` (H); every setter returns without writing at or past it. `track_t` is 0x38F bytes (H).

Trig flags (H): `0x400261c2(trk, step, on)` turns a note trig on or off. Turning a new trig on first resets the step's NOTE, VEL and LEN to -1, so set them afterwards. Turning a trig off also clears the step's parameters and p-locks. `0x4002622a(trk, step, 1)` makes a trigless lock trig instead.

The TRIG page reaches the same setters through `TrigParameterSet::set` `0x4000f79c(set, id, value << 8, step)`: id 18 NOTE, 19 VEL, 20 LEN, 21 micro, 22 condition, 26–28 NOTE 2–4 (H).

P-locks live elsewhere: `pattern + 0x38F0 + t * 0x1B35`, 108 bytes per step (M for the address arithmetic). The saved pattern holds at most 80 locked (track, parameter) rows (H for the loader).

## Making playback and the screen see an edit

Each setter calls the track's `changed` (vtable +0x10) with a `TrackStepChangedInfo`. That posts a "Track::updateMirror" job to a low-priority worker task and notifies the observers (H). After a bulk edit, call `changed(trk, NULL)` once, which covers the whole track, as the stock PASTE TRIGS (`0x40026c16`) does (H).

**Open question:** what the mirror is. One reading of the code says the sequencer plays the mirror, so an edit is heard once the worker has run. The other says the sequencer plays the runtime data directly (`*(u32 *)0x4199EC38` points into the 128 resident patterns at `0x409BBC18 + n * 0x1EC68`) and the mirror is the serialised save image. The call sequence below is correct either way. Hardware check 4 settles it.

## Recommended call sequence (M)

From `ev_tick` or `ev_key` only:

```c
/* optional: a stock undo snapshot, kind 1 */
0x4001a2f2(app, n, 0, 0, 1);      /* n = 0x40092890(0x401389c4()), clamped to 0..127 */

for (s = 0; s < steps; s++) {
    if (on[s]) {
        0x400261c2(trk, s, 1);        /* note trig; resets NOTE/VEL/LEN to -1 */
        0x40024942(trk, s, note[s]);
        0x40024b2a(trk, s, vel[s]);   /* 0..127 or -1: not clamped */
        0x40024ba4(trk, s, len[s]);   /* a LEN index or -1: not clamped */
    } else {
        0x400261c2(trk, s, 0);        /* also clears that step's locks */
    }
}
(*(void (**)(void *, void *))(*(u32 *)trk + 16))(trk, 0);   /* changed(NULL) */
```

**Undo:** `0x40017fb8(app, n, 1)` restores a kind-1 snapshot and shows "Undo Pattern". The stock CLEAR PATTERN action (`0x4002c1d6`) first tries to undo kind 1, so the stock clear-pattern combo would undo a dice (G for which keys). Any later copy, paste or clear replaces the snapshot.

## Not used: injecting key presses

Synthesizing the key and encoder presses a user would make is possible (the UI queue is `0x40610c28`), but it needs grid recording on and the TRIG page showing, the user sees every step of it, and it cannot fake keys the OS reads straight from the key bitmap (FUNC, PAGE, REC, STOP). Calling the setters directly is quieter and needs less research.

## Hardware checks

Needs a build with **digihealth** (it answers the read-only PEEK channel on USB) and `python-rtmidi`. Close Elektron Transfer first. Keep dumps out of the repository.

```sh
python3 sdk/digitakt/research/dtpeek.py hello
python3 sdk/digitakt/research/dtpeek.py peek 0x4199EC38 4    # the sequencer's pattern pointer
```

1. **The active pattern:** the word at `0x4199EC38` equals `0x409BBC18 + n * 0x1EC68` for the selected pattern n (A01 = 0), and the pattern number at that address + 0x1EC64 equals n (its width is unconfirmed).
2. **Step arrays:** on track 1 of an empty pattern, enter one trig on step 3 with NOTE, VEL and LEN changed on the TRIG page. Dump track 1 (`dump <pattern> 0x38F a.bin`) before and after, then `diff`. Expect flag bit 0x0001 at +0x004, and bytes at +0x83, +0xC3 and +0x283. Note how the LEN index maps to the displayed length.
3. **A trigless lock trig:** its flags read 0x6801. The track length at +0x388 reads 16 in a default pattern.
4. **The mirror:** read the Track handle's +0x20 (the mirror pointer) and dump the mirror before and shortly after an edit, to find out whether the sequencer reads it.
5. **MIDI tracks:** repeat check 2 on track 9 (t = 8).

## OS 1.53

Only digislicer's addresses (`OS_APP`, `OS_PATTERN`, `OS_PTRACK`, `OS_NOTESET`, `OS_LOCKSET`) exist for 1.53, in [os153.h](../modules/digislicer/src/os153.h). The other routines need mapping from a stock 1.53 image. Elektron's download page offers only 1.54 now. A first mod can target 1.54 alone.

## Method

The stock `Digitakt_OS1.54.syx` (SHA-256 `f78ba80f…3e3cf6`, as in [machine.json](../../machines/digitakt/machine.json)) was decoded with the vendored elekloader kit (`Syx.section(3)`) and disassembled with GNU objdump (`-m m68k:cfv4e --adjust-vma=0x40000400`). The OS keeps its C++ RTTI names (`Pattern`, `Track`, `TrackStepChangedInfo`, `ValueWithMirror<…>`), which lead to the vtables, the setters and the notification chain. The firmware and the disassembly stay on the developer's computer.
