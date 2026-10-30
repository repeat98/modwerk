# DATAMATIC testing

## Commands and exact revision

Source: branch `module/datamatic`, `sdk/drafts/datamatic/` at the revision in `tests.evidenceRevision` of the manifest.
Host: Ubuntu 24.04, gcc 13.3, Python 3.13; ColdFire: m68k-elf-gcc 16.2.0 and binutils 2.47 (the toolchain image's versions).

```sh
python3 -B sdk/drafts/datamatic/test_engine.py   # engine under ASan/UBSan, glue freestanding, tables, package record
python3 -B sdk/drafts/datamatic/verify.py        # the same, then the package rebuilt and compared with the published one
```

| Check | Result |
|---|---|
| Tables: π's first 16 bits are 0010 0100 0011 1111; the four constants have 900–1150 ones in 2048 bits; PRIM matches trial division to 200; THUE matches popcount parity for all 2048 bits; FIBO begins 0100101001001010… and never has two ones together; `generate_tables.py` run again writes `tables.c` byte for byte | pass |
| Automaton: for each of the sixteen rules, row 0 is one live cell and every later cell of 64 rows follows the rule from its three neighbours on the ring | pass |
| LFSR: 128 seeds, each 2048 bits with 850–1200 ones | pass |
| DENS 0, BITS 1, STEP 1 plays exactly the stream's bits at OFFS × 8; DENS 127 plays every step, for every source | pass |
| 20,000 random settings and lengths: lines deterministic; no trig past the length; notes inside SPRD octaves above the base note (and on octaves with INTV OCT), velocities 1..VEL (VEL itself with VDAT OFF), micro-timing within JITR; bad BITS and STEP refused | pass; 337,094 notes, 182,930 off the base note |
| MIDI record writer: trig mask, NOTE and VEL locks, trig words with the micro-timing, a user's LEN lock kept and its step lock-only, a NOTE lock past the length kept, swing kept, mirror identical, rewrite idempotent | pass |
| `generator.c` compiles freestanding with `-Wall -Wextra -Werror` | pass |
| ColdFire package: the `ot_midi_generators` record (ABI 2, 36 bytes, id `'D'`, label `DATAMAT`, pages SRC+ARP, order 45) at the registry's index, four-byte aligned, every entry even and inside the image | pass; 6,936 bytes of code and data, 1,004 of bss, 113 relocations, 1 hook, 0 stock-code sites |

## Hardware and audio quality

Not tested. No unit has run this module. To record: tester, date, model, the base's identity, the package's SHA-256,
the MIDI target, what was turned and what was heard.

## Stock flows

Not tested. To compare with and without the module, in the emulator or on a unit: MIDI NOTE SETUP's list with OFF and
another generator beside DATAMAT; the SRC, AMP and FUNC+AMP pages on a DATAMATIC track and on a stock MIDI track;
holding a trig (stock's page and locks); the arpeggiator on another MIDI track; Part and project save and reload; a
track switched back to OFF (the line stays, the arpeggiator returns to stock's defaults). Deliberate changes: none
beyond what every generator takes through the base (the SRC and AMP pages while the track runs DATAMATIC).

## Timing

The stock MIDI sequencer plays the trigs and their micro-timing: tempo, speed, length and swing are its. To verify: a
pattern with swing, track speeds 2x and 4x, per-track length, a tempo change and a pattern change while playing; that
JITR's late notes land where the trig word says. Not run.

## Performance

Not measured. `evidence/performance.json` holds the method with every number null. The work is one 2048-bit stream,
one 64-step line and an in-place record rewrite per edit on the UI task; nothing runs at interrupt level or while
playing.

## Resources

From the package header: 6,936 bytes of ColdFire code and data (1,792 of them the seven tables) and 1,004 of bss (the
stream, a 64-step line and the page), one instance, in the base's module DRAM. No DSP memory, no heap. Stack use is
the UI task's and was not measured.

## Hardware

Reported by the developer, not observed by the reviewer. On 31 Oct 2026 @semierendonmez-commits reported that DATAMATIC runs on their own Octatrack MKI from a card build: "Hepsi benim kendi octatrackimde çalışıyor" ("they all run on my own Octatrack"), covering this module with the rest of the set.

Not recorded, so not claimed: the exact source revision and the image's SHA-256 (the developer was not sure which push they built), how long it ran, how many tracks and instances, which controls, modes and settings were tried, both DSP cores, the stock flows, an MKII and the USB base. To turn this into the functional hardware report docs/MODULE_QUALIFICATION.md describes: build the pinned `evidenceRevision`, record the image's SHA-256, and write down what was played and for how long.

## OT UI capture evidence

Pending: MIDI NOTE SETUP with DATAMAT in its list and the SRC, AMP and second AMP pages, captured in the headless
emulator (`scripts/capture-module-ui.py`) with the image SHA-256, module version and panel sequence in `media/capture.json`.
