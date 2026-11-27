# seq-events (Digitone mk1)

The Digitone mk1's step fire as events, OS 1.43 and 1.44, so several mods
that change what the sequencer plays combine. A rhythm generator, a melody
generator and performance effects each need the same instructions of the
fire, and the loader refuses two mods on one site: without an owner, the
first such mod locks out every other. seq-events owns those sites once and
offers what they decide as events, as machine-pages does for the Digitakt's
SRC page. On its own it changes nothing the unit does.

| | |
|---|---|
| needs | core-dn1 (any 2.x or 3.x: it uses only the hook bus's `ev_tick`) |
| sites | 15, in the audio tracks' fire (the Digitone's synth tracks) and the MIDI tracks' (below) |
| tables | `ev_fire_step`, `ev_gen_trig`, `ev_fire_trig`, `ev_fire_cond`, `ev_gen_notes`, `ev_fire_notes`, `ev_fire_vel`, `ev_fire_locks` |
| exports | `sq_clock`, `sq_track_info`, `sq_stored`, `sq_rearm` (`seq-events.h`, through `digitone-mk1/seq.h`) |
| RAM | 2.4 KB code, 172 bytes data |
| sources | [../seq-events/seq.c](../seq-events/seq.c) (every device's), [dev.h](dev.h) (the Digitone's layer), [seq.s](seq.s) (its sites) |

[examples/dn-euclid](../../examples/dn-euclid) is a mod to start from.

## How it works

The fire runs per track at every step, at interrupt level. Each stage it
offers runs every handler in a table, in `order`; a stage with two phases
runs every generator (`ev_gen_`: what the step is) before
every effect (`ev_fire_`: what is done to it), whatever their order. Each
handler changes in place what the one before left, the first what the stock
step made, and seq-events checks the value after each: the trig's bits
kept to `SQ_TRIG` and `SQ_LOCK` (seq-events' own, mapped to the
firmware's), a step outside the track's length ignored, a condition
outside -1..1 undone, the velocity clamped, a lock's slot outside
0..`SQ_SLOTS`-1 dropped. No firmware structure reaches a handler.

The API is one set of names for every device seq-events serves
(`elekloader/sdk/include/seq-events.h`); a mod includes its device's
header, `digitone-mk1/seq.h`, which gives the sizes and includes it.
Tracks are the audio tracks first (`SQ_AUDIO`, the Digitone's four synth
tracks), then the MIDI tracks (`SQ_TRACKS` in all); a step plays up to
`SQ_NOTES` notes (8) and locks slots below `SQ_SLOTS` (79). The Digitakt
mk1's is [../seq-events-dt1](../seq-events-dt1/README.md), on the same terms.

| stage | handler | runs |
|---|---|---|
| the step the fire reads | `int32_t f(track, step, len)` -> the step | audio and MIDI |
| does it fire | `void f(track, step, first, uint32_t *trig)`: `SQ_TRIG` (note trig), `SQ_LOCK` (lock trig) | audio and MIDI |
| a trig condition or probability | `void f(track, step, int32_t *pass)`: 1, 0, or -1 the probability decides | audio and MIDI |
| the notes | `void f(track, step, [generated,] int8_t notes[SQ_NOTES])`, in seq-events' buffer | audio and MIDI |
| the velocity | `void f(track, step, int32_t *vel)` | audio and MIDI |
| the locks | `int32_t f(track, step, struct sq_lock *out, room)` -> entries written | audio |

`first` is 1 at the trig test's read of the step word, 0 at the fire's
second read: both must get the same answer. A step that fires with no
stored note trig (a generated one) starts its notes at the track's NOTE,
as a stock single-note trig.

Beside the events:

- **The step clock** (`sq_clock[track]`): the last real step the fire
  loaded and a parity that flips on each wrap, written before any handler
  runs, so mods agree on which loop plays whatever a step handler reads.
- **The pattern** (`sq_track_info`, `sq_stored`): a track's length, the
  master length, NOTE, the keyboard's ROOT and SCALE, and its stored note
  trigs, read from the pattern when called (never a copy that a pattern
  change could leave behind): in a fire, the pattern that fire reads.
  `sq_track_info` fills at most the size it is given, so a mod built
  against a shorter struct gets its fields. A device that keeps no key for
  a track gives `root` `SQ_ROOT_NONE` (0xff) and `scale` `SQ_SCALE_NONE`
  (-2); a mod that needs a key checks for it. The Digitone keeps one for
  every track and never gives them.
- **Re-arm** (`sq_rearm`): a mod whose engine changed a track's next steps
  while the sequencer is stopped asks for it; at the end of the UI tick
  (`ev_tick`, order 90) seq-events has the sequencer prepare the track's
  first step again, once, whatever asked.

## The layout

The part every device shares is [../seq-events/seq.c](../seq-events/seq.c):
the tables and their two phases, the checks, the step clock, the re-arms,
and `sq_track_info` and `sq_stored`. It knows the firmware only through the
device layer, [dev.h](dev.h), whose functions are static inline, so the one
file it is built into inlines them:

| | the Digitone's |
|---|---|
| `dev_pattern()` | the pattern `sq_track_info` and `sq_stored` read, or 0: the active one |
| `dev_fire_begin(track, pat)` | at each fire's step load, the pattern it reads: nothing to keep here (below) |
| `dev_track_len(pat, track, &master)` | the length, 1 to `SQ_STEPS`, or -1: no pattern; the master length |
| `dev_track_info(pat, track, &info)` | every field of `struct sq_track`, or -1 |
| `dev_step_word(pat, track, step)` | a stored step word |
| `dev_trig_in(word)`, `dev_trig_out(word, trig)` | the word's note and lock trig as `SQ_TRIG`, `SQ_LOCK`, and back (bits 0 and 1) |
| `dev_generated(track, step, src)` | the step fires with no stored note trig |
| `dev_notes_in(track, step, src, generated, notes)` | the notes so far: the step's 8 stored bytes, or NOTE |
| `dev_notes_out(track, step, src, generated, notes)` | what the notes site gets: 0 for the stored notes unchanged |
| `dev_lock_set(list, slot, value)`, `dev_list_ok(list)` | a lock into the fire's lock list |
| `dev_playing()`, `dev_rearm(track)` | the transport, and the sequencer's re-arm |

`src` is what the notes site passes: here the track's data in the pattern
the fire reads.

**The pattern a fire reads.** On the Digitone the fire reads the active
pattern, at a switch too: in digiemu (1.44, the factory pattern playing,
A02 queued and switching on master step 16), every step load's pattern
pointer was the active pattern's, the first step after the switch
included, and the active pointer had moved before that step [read once,
in one run]. So `dev_pattern()` serves a fire and the UI alike.

## The sites

| | 1.43 | 1.44 | over |
|---|---|---|---|
| audio: the step load | `0x40094512` | `0x40094532` | `move.l 96(sp),d4; move.l 108(sp),d3` |
| audio: the trig test | `0x40094560` | `0x40094580` | `move.w (a3,d0.l*2),d0; and.l d0,d1` |
| audio: after the condition | `0x400945b4` | `0x400945d4` | `lea 16(sp),sp; tst.l d0` |
| audio: before the probability | `0x400945be` | `0x400945de` | `mvs.b 968(a0),d1; move.l d1,-(sp)` |
| audio: the second read | `0x400945d2` | `0x400945f2` | `add.l d3,d2; move.w (a3,d2.l*2),d2` |
| audio: the notes | `0x400945fe` | `0x4009461e` | `lea (a3,d0.l),a1; clr.l d0` |
| audio: the locks | `0x400947ae` | `0x400947ce` | `move.l #1500,d0` |
| audio: the velocity | `0x400947ea` | `0x4009480a` | `move.l 48(sp),d0; moveq #1,d1` |
| MIDI: the step load | `0x400948b4` | `0x400948d4` | `move.l 96(sp),d4; move.l 108(sp),d2` |
| MIDI: the trig test | `0x40094906` | `0x40094926` | `move.w (a2,d0.l*2),d0; and.l d0,d1` |
| MIDI: after the condition | `0x4009495a` | `0x4009497a` | `lea 16(sp),sp; tst.l d0` |
| MIDI: before the probability | `0x40094964` | `0x40094984` | `mvs.b 968(a0),d0; move.l d0,-(sp)` |
| MIDI: the second read | `0x4009497c` | `0x4009499c` | `add.l d2,d0; move.w (a2,d0.l*2),d0` |
| MIDI: the notes | `0x400949a4` | `0x400949c4` | `lea (a2,d0.l),a4; clr.l d0` |
| MIDI: the velocity | `0x40094ba2` | `0x40094bc2` | `move.l 52(sp),d1; move.l a3,d0` |

Each is a `jsr` over whole stock instructions; its routine
([seq.s](seq.s)) does the displaced work and changes only what those
instructions change. The 1.44 sites are 1.43's code 0x20 further on, with
the same stock bytes. None overlaps core-dn1's sites. Besides the sites it
reads the pattern pointer and the transport, and calls the sequencer's
re-arm (`0x40094bc2`, 1.44 `0x40094be2`), from `cflags` per OS.

## Checked

In digiemu, OS 1.44: with no handler, every fire is as with core alone;
[EUCLID](../../examples/dn-euclid) fires its rhythm on track 1; a trig
generated on a MIDI track fires as a stored one, and the re-arm makes a
stopped track's first step fire. Its source, digipivi's pvbase, runs five
sequencer mods on these events, checked step by step in an emulator suite.
The 1.43 sites are the same code at the fire's -0x20; not run on 1.43. Not
yet on a unit.
