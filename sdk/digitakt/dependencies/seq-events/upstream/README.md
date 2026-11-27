# seq-events (Digitakt mk1)

The Digitakt mk1's step fire as events, OS 1.53 and 1.54: the same API and
the same shared part as [the Digitone's](../seq-events-dn1/README.md), so a
mod that changes what the sequencer plays is written once for both. On its
own it changes nothing the unit does.

| | |
|---|---|
| needs | core (2.1 or 3.0: it uses only the hook bus's `ev_tick`) |
| sites | 15, in the audio tracks' fire and the MIDI tracks' (below) |
| tables | `ev_fire_step`, `ev_gen_trig`, `ev_fire_trig`, `ev_fire_cond`, `ev_gen_notes`, `ev_fire_notes`, `ev_fire_vel`, `ev_fire_locks` |
| exports | `sq_clock`, `sq_track_info`, `sq_stored`, `sq_rearm` (`seq-events.h`, through `digitakt-mk1/seq.h`) |
| RAM | 2.9 KB code, 332 bytes data |
| sources | [../seq-events/seq.c](../seq-events/seq.c) (every device's), [dev.h](dev.h) (the Digitakt's layer), [seq.s](seq.s) (its sites) |

[examples/euclid](../../examples/euclid) is a mod to start from.

## The Digitakt's terms

`digitakt-mk1/seq.h` gives the sizes: 8 audio tracks (0-7), then 8 MIDI
tracks (8-15); 4 notes a step; lock slots 0-52. Where the Digitakt differs
from the Digitone, the device layer maps it, and some things it cannot say:

- **Trigs.** The step word has one trig bit (0x0001). A note trig is that
  bit with the SYN trig on (0x0080, or the track's default when the step does
  not override it with 0x0800); a lock trig is the bit without it (what
  FUNC + trig stores, 0x6801). `SQ_TRIG` and `SQ_LOCK` map to these; when a
  handler turns one into the other, the fired copy's SYN trig and its
  override change, never the stored pattern. The FLTR and LFO trigs
  (0x0200, 0x0400) stay as they are.
- **A step whose word has 0x0004 set never fires**, whatever a handler
  answers: the fire skips it on that bit before it tests the trig. What sets
  0x0004 is not known; no step of the factory pattern has it.
- **Notes.** An audio track plays one note: `notes[0]`, its other entries
  ignored, and `notes[0]` -1 keeps the step's note. A changed note is played
  as a note lock is. A MIDI track plays up to 4: the firmware keeps notes
  2-4 relative to the first (64 none), seq-events hands them over as the
  API's intervals and back; a note outside 0-127 is dropped, as the stock
  drops it. A generated trig starts at NOTE alone (on a MIDI track, without the
  track's default chord): an empty step's note locks are not cleared, so
  they are never read.
- **No key.** The Digitakt keeps no keyboard scale: `sq_track_info` gives
  `root` `SQ_ROOT_NONE` and `scale` `SQ_SCALE_NONE`.
- **The pattern a fire reads.** At a pattern switch the sequencer fires each
  track from the next pattern (`0x4199ec40`) once that track has switched,
  before the active pointer (`0x4199ec38`) moves. `dev_fire_begin` keeps
  each track's fire pattern, and a track's facts (`sq_track_info`,
  `sq_stored`, the clock's length) come from it while it is the next one.

## The sites

| | 1.53 = 1.54 | over |
|---|---|---|
| audio: the step load | `0x4006f4dc` | `move.l 76(sp),d4; movea.l 80(sp),a2` |
| audio: the trig test | `0x4006f51a` | `move.w (a3,d0.l),d0; and.l d0,d1` |
| audio: after the condition | `0x4006f564` | `lea 16(sp),sp; tst.l d0` |
| audio: before the probability | `0x4006f56e` | `mvs.b 908(a0),d0; move.l d0,-(sp)` |
| audio: the second read | `0x4006f582` | `add.l d3,d2; move.w (a3,d2.l),d1` |
| audio: the note | `0x4006f5be` | `lea (a3,d3.l),a0; moveq #-1,d6` |
| audio: the locks | `0x4006f750` | `move.l #1500,d0` |
| audio: the velocity | `0x4006f772` | `move.l 48(sp),d0; adda.l d4,a3` |
| MIDI: the step load | `0x4006f864` | `move.l 84(sp),d4; movea.l 88(sp),a3` |
| MIDI: the trig test | `0x4006f8a4` | `move.w (a2,d0.l),d0; and.l d0,d1` |
| MIDI: after the condition | `0x4006f8ee` | `lea 16(sp),sp; tst.l d0` |
| MIDI: before the probability | `0x4006f8f8` | `mvs.b 908(a0),d1; move.l d1,-(sp)` |
| MIDI: the second read | `0x4006f90c` | `add.l d3,d2; move.w (a2,d2.l),d2` |
| MIDI: the notes | `0x4006f98a` | `lea (a2,d3.l),a0; moveq #-1,d1` |
| MIDI: the velocity | `0x4006f9a6` | `lea (a2,d3.l),a0; moveq #-1,d1` |

The audio tracks' fire is `0x4006f4be`, the MIDI tracks' `0x4006f846`: the
same addresses and bytes in 1.53 and 1.54, where only the routines they call
and the RAM they name moved. Each site is a `jsr` over whole stock
instructions, at the same places as the Digitone's; no branch lands inside
one. None overlaps core's 39 sites or machine-pages' 20, on either OS.
Besides the sites it reads the pattern pointers and the transport (1.54
`0x4199ec38`, `0x4199ec40`, `0x4199ec2c`; 1.53 0x1000 lower) and calls the
sequencer's re-arm (`0x4006fb82` on both), from `cflags` per OS.

The audio tracks' lock list has the Digitone's layout (count at +8, pairs
from +0x14, 8 apart); the MIDI tracks' (a CC list) gets no locks, as on the
Digitone.

## Checked

In digiemu, OS 1.54: with no handler, every fire is as with core alone;
[EUCLID](../../examples/euclid) fires its rhythm on track 1, its added steps
at NOTE; notes, chords, velocity and locks change as handlers say; a trig
generated on a MIDI track fires as a stored one, and the re-arm makes a
stopped track's first step fire. The 1.53 sites are the same bytes at the
same addresses; not run on 1.53. Not yet on a unit.
