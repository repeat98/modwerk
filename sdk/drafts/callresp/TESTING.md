# CALL & RESPONSE testing

## Commands and exact revision

Source: branch `module/callresp`, `sdk/drafts/callresp/` at the revision in `tests.evidenceRevision` of the manifest.
Host: Ubuntu 24.04, gcc 13.3, Python 3.13; ColdFire: m68k-elf-gcc 16.2.0 and binutils 2.47 (the toolchain image's versions).

```sh
python3 -B sdk/drafts/callresp/test_engine.py   # engine under ASan/UBSan, glue freestanding, package record
python3 -B sdk/drafts/callresp/verify.py        # the same, then the package rebuilt and compared with the published one
```

| Check | Result |
|---|---|
| PHRS layouts: CCCR, CCRR and CRCR in quarters, C\|R in halves, LAYR over the whole length on two tracks and as C\|R on one, C\|R below four steps, nothing on one step | pass |
| 90,000 lines: 3,000 settings × lengths 1–64 in steps of 7 × every PHRS mode, as a call track, an answer track and a C+R track: deterministic; no trig outside the track's slots; every note's PTCH inside −12..+12 and in the scale (transposed by TRNS on responses); each unvaried call's last step sounds; without VAR every call repeats the first | pass; 303,484 call notes, 117,367 accented |
| A C+R track is step for step its call track's calls and its answer track's responses (same settings); an answer track without a call writes nothing | pass |
| The answer's call is the call track's: `cr_call` from the call settings gives exactly the call track's trigs and pitches; every degree 0–10 | pass |
| VAR 31 in CCCR changes the second and third calls and leaves the first call and the response alone | pass; 300 of 300 |
| The 31 strategies over 200 calls are pairwise distinct; HALF silent in the first half, ECHO the call two steps late, HOOK opening with the call; END ROOT closes on degree 0, 5TH on degree 4, MORE on 0, 2 or 4 | pass |
| TGHT 31 keeps the answer nearer the call than TGHT 0 (UP strategy, 400 calls) | pass; total distance 4,354 → 2,739 |
| MUT in CRCR leaves the calls and the first response alone and changes the second; in CCCR it changes the one response only | pass; 300 of 300 |
| Semitone fold for every scale, degree 0–10 and TRNS | pass |
| Record writer: trig mask, PTCH and VOL locks per step, a user's AMP lock kept and its step lock-only, a PTCH lock past the length kept, swing kept, accents never above 127, mirror identical, rewrite idempotent | pass |
| Nine-byte settings packing (60 bits): 4,000 settings round-trip, every byte below 128, an all-ones record unpacks inside every range and generates | pass |
| `machine.c` compiles freestanding with `-Wall -Wextra -Werror` | pass |
| ColdFire package: the `ot_machines` record (ABI 1, 88 bytes with the setup page and knob, `CR` 1–1, BACKING and SETUP_PAGE, order 80) at the registry's index, four-byte aligned, every entry even and inside the image | pass; module id 47735012, 14,840 bytes of code and data, 1,344 of bss, 308 relocations, 1 hook, 0 stock-code sites |

Outside the gate: the original `index.html` run in Node (neutral style, Acid nibble, Flat contour, Medium density,
Repetitive, Minor Pentatonic, 16 steps, 20,000 pairs) against `cr_call`/`cr_response` at the defaults. Per-step
densities agree within about 0.05 and mean degrees within 0.1 (call 1.86 / 1.86, SR+R response 2.08 / 2.07, UP 3.42 /
3.34, HALF 2.02 / 1.98).

## Hardware and audio quality

Not tested. No unit has run this module. To record: tester, date, model, the base's identity, the package's SHA-256,
the samples on both tracks, what was turned and what was heard.

## Stock flows

Not tested. To compare with and without the module, in the emulator or on a unit: SRC SETUP on FLEX, STATIC, THRU and
PICKUP tracks; the machine list with POLY8, Analog BD, VECTOR and FM Synth beside it; SRC SETUP on a C+R or call track
(the response's controls and VAR; the sample's own setup after the LEVEL push) and on an answer track (the sample's
own setup); YES on SRC SETUP still choosing the machine; the double tap on the track key (stock's sample pool); holding a trig (stock's page and
locks); the LEVEL push; Part and project save and reload; a track left to FLEX (the phrase stays, the signature goes,
an answer to it says NO CALL on its next edit). Deliberate changes: none beyond what every machine takes through the
base (the SRC page, and SRC SETUP on C+R and call tracks, while the track is CALL & RESPONSE's, with the LEVEL push to
stock's sample controls).

## Timing

The stock sequencer plays the trigs: tempo, speed, length and swing are its. To verify: a pattern with swing, a track
speed other than 1x on one of the pair, per-track length (the pair drifts by design), a tempo change and a pattern
change while playing. Not run.

## Performance

Not measured. `evidence/performance.json` holds the method with every number null. The work is one phrase pair of up
to 64 steps and an in-place record rewrite per track per edit on the UI task (a call or C+R track's edit rewrites its
answers too); nothing runs at interrupt level or while playing.

## Resources

From the package header: 14,840 bytes of ColdFire code and data and 1,344 of bss (three phrases, a 64-step line and the
page), one instance, in the base's module DRAM. No DSP memory, no heap. Stack use is the UI task's and was not measured.

## Hardware

Untested.

## OT UI capture evidence

Pending: SRC SETUP with CALLRESP in the machine list, a C+R track's SRC page and SRC SETUP, and an answer track's SRC
page, captured in the headless
emulator (`scripts/capture-module-ui.py`) with the image SHA-256, module version and panel sequence in `media/capture.json`.
