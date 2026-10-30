# LOGACID testing

## Commands and exact revision

Source: this branch (`module/logacid`), `sdk/octabam/modules/logacid/` at the revision in `tests.evidenceRevision` of the
manifest. Host: Ubuntu 24.04, gcc 13.3, Python 3.13.

```sh
python3 -B sdk/octabam/modules/logacid/test_engine.py   # engine under ASan/UBSan, generator glue freestanding, package record
python3 -B sdk/octabam/modules/logacid/verify.py        # the same, then the package rebuilt and compared with the published one
```

| Check | Result |
|---|---|
| Integer engine against `tb3po.c`'s float generator, as written, over 50,688 cases (128 seeds × 6 scales × 3 octave ranges × 22 lengths): kind, degree and octave of every step | 0 step differences |
| Determinism; scale membership; a slide never precedes a rest; at least one note; FWD/REV/PING/RND; motifs 2–32 repeating; bad arguments refused | pass |
| DENS 127 fills every step; DENS 0 leaves one note; ACNT 127 with SLID 0 accents every note; REV reverses the pitches; another SEED or VAR changes the line | pass |
| Record writer: NOTE/VEL/LEN locks and masks per step, straight trig words, swing and other locks kept, a lock on a rest marked lock-only, mirror identical, rewrite idempotent, steps past the length untouched, VEL and LEN clamped to 127 | pass |
| Sample-track record writer: PTCH/HOLD/VOL/DEPTH locks and masks per step, slide chains (the slid note holds longer, the next step a lock-only step with a PTCH lock and a slide trig, no trig), straight trig words, swing and other locks kept, no DEPTH lock without the stock FILTER on FX1, rewrite idempotent, steps past the length untouched | pass |
| PTCH values inside 4..119 in steps of 5 for every scale, root, degree and octave; the pitch class is the root's plus the degree's | pass |
| Nine-byte settings packing: 4,000 random settings round-trip, every byte below 128, an all-ones record unpacks inside every range | pass |
| `generator.c` and `machine.c` compile freestanding with `-Wall -Wextra -Werror` | pass |
| ColdFire package (m68k-elf-gcc 16.2.0, binutils 2.47, the toolchain image's versions): the `ot_midi_generators` record (ABI 2, 36 bytes, id `'L'`, pages SRC+ARP, order 40) and the `ot_machines` record (ABI 1, 88 bytes, `LA` 1-1, flags BACKING, SETUP_PAGE, order 50) at the registry's indices, four-byte aligned, every entry even and inside the image | pass; module id f489c795, 10,784 bytes of code and data, 1,384 of bss, 239 relocations, 2 hooks, 0 stock-code sites |

## Hardware and audio quality

Not tested. No unit has run this module. To record: tester, date, model (MKI/MKII), the base's identity, the package's
SHA-256, the sample (and its tuning) or the synth the track drove, how slides sounded, what was turned, for how long,
and what was heard.

## Read off the unit or the emulator first

Three constants in the source are assumptions until a stock project is inspected (`ot_spec.py` / a saved bank under
`ot_bank.py`, or the emulator's RAM): the slide-trig mask's index in the audio track record (`SLIDE_MASK` in
`machine.c`, assumed 3: place a slide trig with the stock keys on an empty track and see which of masks 1, 3 and 9 takes
the bit); the number of AMP HOLD units in one sequencer step (`LOGACID_HOLD_STEP` in `engine.h`, assumed 16: set HOLD to
one step on the AMP page and read the Part byte); and the Part offset of a track's FX1 effect id (`FX1_ID` in
`machine.c`, assumed `0x000 + t` from `ot_project.py`'s file offset 0x009 less the 9-byte record header: set FX1 to
FILTER and look for a 4 there). The MIDI generator's SLEN default (72) needs stock's LEN table from the NOTE page's
LEN formatter. Each is one line to correct, then a rebuild.

## Stock flows

Not tested. To compare with and without the module, in the emulator or on a unit: MIDI NOTE SETUP with no generator
chosen (OFF row only; CHAN, BANK, PROG, SBNK as stock); the MIDI pages of a track not running LOGACID; FUNC+AMP (ARP
SETUP) on such a track; holding a trig on a LOGACID track (stock's NOTE page and locks); Part and project save and
reload with a LOGACID track; choosing OFF (the line stays, the ARP page returns to stock). Deliberate changes to stock
flows: none beyond what every machine and MIDI generator takes through the base (a sample track's SRC page and SRC
SETUP rows while the track is LOGACID's, with the LEVEL push to stock's sample controls; a MIDI track's SRC and AMP
pages, its arpeggiator kept off); choosing LOGACID on a MIDI track sets NOTE to A1, VEL to 72 and NOT2–4 off, as the
README says. For the sample track also compare: SRC SETUP on a FLEX, STATIC, THRU and PICKUP track; the chooser's
rows with POLY8, Analog BD, VECTOR and FM Synth installed beside it (the base's eight rows); holding a trig on a LOGACID
track (stock's PTCH and the generated locks); Part and project save and reload; a track left to FLEX (the line stays,
the signature goes).

## Timing

The line is played by the stock MIDI sequencer: tempo, track speed, pattern and track length, swing and trig
conditions are read by it, not by the module. To verify in the emulator or on a unit (sequencing.md): a pattern with
swing set, a track speed other than 1x, a tempo change during play, a pattern change at the loop point, per-track
length mode; on a sample track that a slid note's HOLD reaches the next step at every track speed and the lock-only
step glides the pitch without a retrigger; on a MIDI track that a slid note's LEN (SLEN) overlaps the next note's
start. Not run.

Stock's LEN table: the values above one step are to be read off the NOTE page's LEN formatter in the emulator
(`ot_emu` `call` on the formatter at the descriptor's third slot) and recorded here, with SLEN's default corrected if 72
sits below one step.

## Performance

Not measured. `evidence/performance.json` holds the shape and the method; every number is null until the module runs
on a unit (the base's `modwerk_cost[26]`/`[27]` around a generator's knob, as VECTOR 0.3.0 measured 0.5 ms for a
64-step rewrite) or under `cfmeter.py`. The work is one generation and an in-place record rewrite per edit on the UI
task; nothing runs at interrupt level or while playing, and no MIDI path of its own exists to flood.

## Resources

From the package header: 10,784 bytes of ColdFire code and data, 1,384 of bss (two 402-byte page descriptors, two
193-byte patterns, two 64-byte lock tables, the view and layer state), one instance, in the base's module DRAM. No
DSP memory, no heap. Stack use is the UI task's and was not measured.

## Hardware

Reported by the developer, not observed by the reviewer. On 31 Oct 2026 @semierendonmez-commits reported that LOGACID runs on their own Octatrack MKI from a card build: "Hepsi benim kendi octatrackimde çalışıyor" ("they all run on my own Octatrack"), covering this module with the rest of the set.

Not recorded, so not claimed: the exact source revision and the image's SHA-256 (the developer was not sure which push they built), how long it ran, how many tracks and instances, which controls, modes and settings were tried, both DSP cores, the stock flows, an MKII and the USB base. To turn this into the functional hardware report docs/MODULE_QUALIFICATION.md describes: build the pinned `evidenceRevision`, record the image's SHA-256, and write down what was played and for how long.

## OT UI capture evidence

Pending: SRC SETUP with LOGACID in the machine list, the SRC page and SRC SETUP's second page on a sample track; MIDI
NOTE SETUP with LOGACID in its list, the SRC page, the AMP page and its second page on a MIDI track; captured in the
headless emulator (`scripts/capture-module-ui.py`) with the image SHA-256, module version and panel sequence recorded
in `media/capture.json`.
