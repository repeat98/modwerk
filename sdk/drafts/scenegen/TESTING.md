# SCENE GEN testing

## Commands and exact revision

Source: branch `module/scenegen`, `sdk/drafts/scenegen/` at the revision in `tests.evidenceRevision` of the manifest.
Host: Ubuntu 24.04, gcc 13.3, Python 3.13; ColdFire: m68k-elf-gcc 16.2.0 and binutils 2.47 (the toolchain image's versions).

```sh
python3 -B sdk/drafts/scenegen/test_engine.py   # engine under ASan/UBSan, glue freestanding, package record
python3 -B sdk/drafts/scenegen/verify.py        # the same, then the package rebuilt and compared with the published one
```

| Check | Result |
|---|---|
| 4,000 random Parts (each slot a 0–127 knob, a 0–3 select, a 1–16 knob or no knob), every target, page set, scope and spread, scene selections and pre-existing locks: generation deterministic; the count it returns equals the bytes that changed; nothing changes outside the target scenes, the chosen tracks and the chosen pages; AMP XVOL (slot 17) never; every generated lock inside its range; within SPREAD's reach of the Part's value (SCENE A, SCENE B, 16 RAND) or within half of it of the previous scene (16 PATH) | pass; 1,338,411 generated locks |
| SPREAD 127 on 0–127 knobs reaches both ends; a 16 PATH moves (more than 60 of 90 neighbour steps change); another track's rows stay untouched; SPREAD 0 and track 8 refused | pass |
| `rows.c` compiles freestanding with `-Wall -Wextra -Werror` | pass |
| ColdFire package: the `ot_sequencer_rows` record (four rows SCN TARGET, SCN PARAMS, SCN SPREAD, SCENE GEN, order 50) at the registry's index, four-byte aligned, labels as declared, every getter and setter even and inside the image | pass; 2,640 bytes of code and data, 4,852 of bss, 80 relocations, 1 hook, 0 stock-code sites |

## Read off the unit or the emulator first

The page descriptor fields (drawn mask at + 0x18e, lowest at + 0x6a, count at + 0x9a) and the scene rows at Part +
0x662 are the layout Apply Scene documents and uses on hardware; SCENE GEN's use of them here is not run. To check: a
16 RAND on ALL ALL in a fresh project, then every scene lock read back (`ot_bank.py report`) inside its parameter's
stock range, and the crossfader morphing without a stall.

## Hardware and audio quality

Not tested. No unit has run this module. To record: tester, date, model, the base's identity, the package's SHA-256,
the project, the rows' settings and what the crossfader did.

## Stock flows

Not tested. To compare with and without the module: PROJECT > CONTROL > SEQUENCER's stock rows (CHAIN AFTER and the
others) still change as before; scene assign, edit, mute, clear, copy and paste; Part save and reload (generated
scenes kept or reverted as stock's); project save and load; Apply Scene beside it. Deliberate changes: none; the
rows are the base's shared rows.

## Timing

SCENE GEN does nothing in time: the crossfader and stock's scene morph play the scenes. Not applicable beyond checking
that a generation while playing causes no click beyond what a fader move would.

## Performance

Not measured. `evidence/performance.json` holds the method with every number null.

## Resources

From the package header: 2,640 bytes of ColdFire code and data and 4,852 of bss (the 4,096-byte undo copy, the Part's
values and ranges), one instance, in the base's module DRAM. No DSP memory, no heap. Stack use is the UI task's and was
not measured.

## Hardware

Reported by the developer, not observed by the reviewer. On 31 Oct 2026 @semierendonmez-commits reported that SCENE GEN runs on their own Octatrack MKI from a card build: "Hepsi benim kendi octatrackimde çalışıyor" ("they all run on my own Octatrack"), covering this module with the rest of the set.

Not recorded, so not claimed: the exact source revision and the image's SHA-256 (the developer was not sure which push they built), how long it ran, how many tracks and instances, which controls, modes and settings were tried, both DSP cores, the stock flows, an MKII and the USB base. To turn this into the functional hardware report docs/MODULE_QUALIFICATION.md describes: build the pinned `evidenceRevision`, record the image's SHA-256, and write down what was played and for how long.

## OT UI capture evidence

Pending: PROJECT > CONTROL > SEQUENCER with the four rows, captured in the headless emulator
(`scripts/capture-module-ui.py`) with the image SHA-256, module version and panel sequence in `media/capture.json`.
