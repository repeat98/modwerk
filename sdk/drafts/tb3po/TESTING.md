# TB-3PO testing

## Commands and exact revision

Source: this branch (`module/tb3po`), `sdk/octabam/modules/tb3po/` at the revision in `tests.evidenceRevision` of the
manifest. Host: Ubuntu 24.04, gcc 13.3, Python 3.13.

```sh
python3 -B sdk/octabam/modules/tb3po/test_engine.py   # engine under ASan/UBSan, generator glue freestanding, package record
python3 -B sdk/octabam/modules/tb3po/verify.py        # the same, then the package rebuilt and compared with the published one
```

| Check | Result |
|---|---|
| Integer engine against `tb3po.c`'s float generator, as written, over 50,688 cases (128 seeds × 6 scales × 3 octave ranges × 22 lengths): kind, degree and octave of every step | 0 step differences |
| Determinism; scale membership; a slide never precedes a rest; at least one note; FWD/REV/PING/RND; motifs 2–32 repeating; bad arguments refused | pass |
| DENS 127 fills every step; DENS 0 leaves one note; ACNT 127 with SLID 0 accents every note; REV reverses the pitches; another SEED or VAR changes the line | pass |
| Record writer: NOTE/VEL/LEN locks and masks per step, straight trig words, swing and other locks kept, a lock on a rest marked lock-only, mirror identical, rewrite idempotent, steps past the length untouched, VEL and LEN clamped to 127 | pass |
| `generator.c` compiles freestanding with `-Wall -Wextra -Werror` | pass |
| ColdFire package (m68k-elf-gcc 16.2.0, binutils 2.47, the toolchain image's versions): `ot_midi_generators` record at the registry's index, ABI 2, 36 bytes four-byte aligned, id `'T'`, pages SRC+ARP, order 40, every entry even and inside the image | pass; module id 08001c36, 5,032 bytes of code and data, 668 of bss, 102 relocations, 1 hook, 0 stock-code sites |

## Hardware and audio quality

Not tested. No unit has run this module. To record: tester, date, model (MKI/MKII), the base's identity, the package's
SHA-256, the synth the track drove and how it slid, what was turned, for how long, and what was heard.

## Stock flows

Not tested. To compare with and without the module, in the emulator or on a unit: MIDI NOTE SETUP with no generator
chosen (OFF row only; CHAN, BANK, PROG, SBNK as stock); the MIDI pages of a track not running TB-3PO; FUNC+AMP (ARP
SETUP) on such a track; holding a trig on a TB-3PO track (stock's NOTE page and locks); Part and project save and
reload with a TB-3PO track; choosing OFF (the line stays, the ARP page returns to stock). Deliberate changes to stock
flows: none beyond what every MIDI generator takes through the base (the SRC and AMP pages of its own track, its
arpeggiator kept off); choosing TB-3PO sets NOTE to A1, VEL to 72 and NOT2–4 off on that track, as the README says.

## Timing

The line is played by the stock MIDI sequencer: tempo, track speed, pattern and track length, swing and trig
conditions are read by it, not by the module. To verify in the emulator or on a unit (sequencing.md): a pattern with
swing set, a track speed other than 1x, a tempo change during play, a pattern change at the loop point, per-track
length mode; and that a slid note's LEN (SLEN) overlaps the next note's start at every track speed. Not run.

Stock's LEN table: the values above one step are to be read off the NOTE page's LEN formatter in the emulator
(`ot_emu` `call` on the formatter at the descriptor's third slot) and recorded here, with SLEN's default corrected if 72
sits below one step.

## Performance

Not measured. `evidence/performance.json` holds the shape and the method; every number is null until the module runs
on a unit (the base's `modwerk_cost[26]`/`[27]` around a generator's knob, as VECTOR 0.3.0 measured 0.5 ms for a
64-step rewrite) or under `cfmeter.py`. The work is one generation and an in-place record rewrite per edit on the UI
task; nothing runs at interrupt level or while playing, and no MIDI path of its own exists to flood.

## Resources

From the package header: 5,032 bytes of ColdFire code and data, 668 of bss (a 402-byte page descriptor, a 193-byte
pattern, a 64-byte lock table and the view state), one instance, in the base's module DRAM. No DSP memory, no heap.
Stack use is the UI task's and was not measured.

## Hardware

Untested.

## OT UI capture evidence

Pending: MIDI NOTE SETUP with TB-3PO in its list, the SRC page, the AMP page and its second page, captured in the
headless emulator (`scripts/capture-module-ui.py`) with the image SHA-256, module version and panel sequence recorded
in `media/capture.json`.
