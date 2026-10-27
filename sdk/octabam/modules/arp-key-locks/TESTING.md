# ARP KEY LOCKS: tests

Version `0.1.0-experimental`. The results below are from the host and the ColdFire emulator; the run on the author's MKII is in [evidence/hardware.md](evidence/hardware.md).

## What ran it

- Stock OS 1.40C (`OCTATRACK_OS1.40C_dist.zip`, SHA-256 `370c55a3…`, the repository's reference), kept outside the repository.
- Emulator: octabam's `ot_emu` from `npm run upstream:tools` (octabam `8250be0`) for card builds; Modwerk's adapted `ot_emu` (`scripts/octatrack-emulator/build.py`) for the base. Neither runs a unit's timing.
- Compiler: GCC 16.2 and binutils 2.47 in the repository's toolchain image (`sdk/build/Dockerfile`).
- Base: the beta base with `ev_midi_note_key`, `ev_arp_setup_knob` and `ev_arp_setup_text` (pull request #857), `2b032fd9…`.
- Project: a copy of a user project rewritten by octabam's `tools/verify/midi_fixture.py` (MIDI track 1 on channel 1 arpeggiates chords on steps 3, 5 and 9, MODE UP, 120 BPM); the locks were written into its bank file. Kept outside the repository.

## Host

`python3 -B verify.py` builds `test_akl.c` with `-Wall -Wextra -Werror` (also run with AddressSanitizer and UBSan) and checks:

- every one of the 84 keys on every note 1-127 lands in the key, moving at most one semitone down;
- the example progression (step 1 C MIN, 5 F DOR, 9 G PHR, 13 C MIN) on all 16 steps; a lock wrapping round the loop; a lock past the track's length in PER TRACK mode ignored; a dropped note (-1) left dropped;
- the knob: a lock starts from the track's KEY, steps per count, turns below OFF into no lock, clamps at B LOC, writes the pattern and its battery-backed copy and sets the edited flags; trig keys on page 2 lock steps 17-32;
- the KEY box text: `DOR`/`C#`, OFF, `--`, `LOC`/`B`.

In the toolchain image it also checks that `akl.s` is exactly what GCC 16.2 makes of `akl.c` (`-mcpu=5475 -O2 -ffreestanding -fno-builtin -fno-common -fno-pic -fno-late-combine-instructions`), and `sdk/runtime/m68k_codegen.py` found no post-increment hazard in the object.

## Emulator: the playing step

`0x800064d0 + 8 + track` holds the step the sequencer prepares next; the playing step is `0x800064e0 + 8 + track`, which changes when the track's tick counter (`0x800064f0 + 8 + track`) returns to 0. An earlier build read the first and changed every key one step early. Keys whose notes agree at the boundaries hide that (C MIN, F DOR and G PHR are one set of notes), so the playback runs below include C MAJ then C LYD on step 5: the F♯ on step 4 must become F. That run fails on the old reading and passes now.

## Emulator, card build

A local remix with ARP KEY LOCKS alone, built by Modwerk's `sdk/octabam` (`make bus`): its three detours (6, 8 and 6 bytes) plus the DRAM loader, 112 bytes changed against stock in all.

- **Playback.** The arpeggio with and without the module, the same input: every note-on came on the same frame, and every note was the reference note moved into the key of its step. Four locks (C MIN, F DOR, G PHR, C MIN on steps 1, 5, 9, 13): 13 of 13 notes. One lock (G PHR on step 13), held from step 13 round the loop: 13 of 13. An OFF lock on step 1 and C# MIN on step 9: 13 of 13. No note left on in any run.
- **The gesture.** In grid recording, MIDI ARP SETUP open, trig 5 held, F turned: step 5's spare lock byte took the value (three single counts from KEY OFF: C PHR) and the track's KEY byte was not written. Without the module the same input changed the track's KEY (0, 4, 8, 12 at four counts a report), as on stock.
- **Arp note shifts.** One setting, arp note N +1, on the first trig's step (stock's arp from that trig: three notes before the next trig): exactly the N-th note of that trig's arpeggio moved, for N = 1 to 3, nothing after the next trig, every note on the same frame. The arp's place in its sequence is `0x46c77b17 + 10 × track` while a note is sent (`+0x16` is its speed timer). On the panel, trig 9 held: D picked N1 to N4 (nothing stored), E +1 stored note 4 +1 and E -3 made it -2; the arp's step mask and the trig mask did not change.
- **No side effects.** Pressing and releasing trig 5 in ARP SETUP changed neither the track's trig mask nor the arp's step mask, with and without the module.
- **The KEY box.** LCD captures (media/): OFF with no trig held, `--` holding a trig without a lock, C MIN after six counts, F DOR holding the step locked to it, and the track's KEY again on release. Stock redraws the box when a trig is pressed.

## Emulator, USB on the base

The package (`sdk/runtime/loader/build.py --octabam arp-key-locks --name "ARP KEY LOCKS"`, stock-free scan with `--stock`), as first checked here, before the arp note shifts: 1,884 bytes of code and data, 40 of bss, 24 relocations, 3 hooks, no stock-code site. The submitted package `1d086d7b…` (with the shifts and a `module_tick` hook) has 4,396 bytes of code and data, 84 of bss, 68 relocations, 4 hooks and no stock-code site; rebuilt on 26 October 2026 after #857 merged into `main`, it came out byte for byte the same. The repository's package scan then refused it: a run of 16 bytes in `unit.s` (the KEY text entry, which called the slot's drawer encoded as stock does) and one of 13 in `akl.s` (`akl_claims`' end beside `akl_note`'s start) also occur in the stock OS. The entry now loads the drawer through d0 and builds its argument with `moveq`/`add.l`, and `akl_claims` moved below `akl_note` in `akl.c`; the same instructions in effect, and the host tests pass. The published package, `7962c35a…` (named Arp Key Locks, as the catalogue), shares at most 10 bytes in a run with the stock OS. It has not run in the emulator; on the author's MKII it was kept, played GAMUT's locks and stayed kept through a power cycle (evidence/hardware.md, fourth session). Package `907a03cf…` (27 October 2026, built from `53b2b444`: the arp note shift stored + 7, so N16 -1 is no longer read as no setting) has 4,400 bytes of code and data, 84 of bss, 68 relocations, 4 hooks and no stock-code site, shares at most 10 bytes in a run with the stock OS, and rebuilds byte for byte; on the author's MKII it was kept, played its locks before and after saving and reloading the project and after a power cycle, and was removed and kept again (evidence/hardware.md, fifth session). It has not run in the emulator. The other results above and the first three sessions in evidence/hardware.md are for `1d086d7b…`. On the adapted emulator, base `2b032fd9…`, through the emulated USB link as the site does (stage, activate, trial, hold, accept): kept, inventory `ARP KEY LOCKS`, no refusal. Each event's subscriber list held the package's record, the note entry's bytes were the relocated code, and the claims answered in place: track 1 (locks) yes, track 4 (none) no, ARP SETUP's knob and text with no trig held no. The emulator cannot press PLAY after a USB install, so playback over USB is not tested; it runs the same code as the card build.

With nothing installed, the base matched stock: identical MIDI with KEY OFF, C MAJ and F MIN; identical locks and KEY changes from held-trig turns on the NOTE, ARP and ARP SETUP pages; four pixel-identical ARP SETUP captures.

## Performance

[evidence/performance.json](evidence/performance.json); emulator figures, not chip timing.

- **Per note, key locks only (an earlier build).** The note hook runs in the MIDI sequencer's tick interrupt (`0x400a1e0c`, vector 0x60), once per note a track sends. PC watches on its entry and its two exits, a 64-step pattern whose only lock is just after the notes (each new step scans the whole pattern on the locked track, and on the two others): 832 instructions at most, on a new step; 70 to 97 when the step's answer is cached. Statically, at most 64 x 10 instructions of scan plus about 190 around it.
- **Per note and per tick, with arp note shifts.** The same 64-step pattern with a shift on step 14: at most 900 instructions a note, 84-109 cached, at most 2,004 in one tick (5 notes). A static bound for the dearest possible tick (eight tracks, four notes each, every answer uncached, no trigs so both scans run 64 steps, the base's dispatch over USB): about 17,600 instructions, 281,600 cycles at 16 an instruction; package `907a03cf…` decodes the shift with at most one more instruction a note, 17,632 and 282,112, against one tick at 300 BPM (2,200,000 cycles).
- **Load and stress, 62 s, the same input on the original OS and on the card build** (`ot_emu --mkii --dsp --frame`): one three-byte message every ms (note on, CC, note off on channels 1-8) and a clock byte every 10 ms (250 BPM), the 64-step project with a G PHR lock, STOP and PLAY at 7, 22, 37 and 52 s, Part 2 and back at 30 and 31 s. Longest frame interrupt (entry `0x4000aad4` to epilogue `0x4000d9a6`): 23,201 instructions on both, 131.9 µs in the port's time. Idle: 59.20 % and 59.22 % (the current build; the key-locks-only build gave 59.22 % too). Every message reached its handler on both images (the module run's note-off watch counted one entry more than was sent: a double count, none missing). MIDI OUT: 206 note-ons with their note-offs on both, 44 moved into the key with the module, none left on.

`npm run perf:audit -- check evidence/performance.json`:

```
✓ record          coldfire record for arp-key-locks@0.1.0-experimental
✓ cycles          worst event 32064 of 2200000 cycles (1%)
✓ stock benchmark under the same flood the longest frame interrupt grows by 0.0 us (0.0% of the 362.8 us frame) and idle time falls by -0.0 points vs stock
✓ stress          1000 messages/s at 250 BPM for 62 s, no stuck note, no hang, 0 dropped
```

## Submission checks (26 October 2026)

- **Native/browser (`npm run module:verify -- arp-key-locks`):** 158 selections, 66 matching images (all outside the platform writes), 92 matching refusals, 0 mismatches. Native pairs: 31 modules, 465 pairs in 3 contexts, none refused with ARP KEY LOCKS. The chooser-metadata row the run adds is left out: the module has no effect id, and that file is a base input.
- **Packages:** card packages compiled in the isolated toolchain image and imported; `octatrack:module-packages -- --check` with the toolchain: every package identical, ARP KEY LOCKS `7962c35a…` (ABI 8, no stock-code site), at most 10 non-zero bytes in a run shared with the stock OS.
- **`module:doctor`:** every line green.

## Not tested

On a unit (see evidence/hardware.md for what did run): card builds; the MKI panel; LEN and the arp note editor with a trig held; copying, clearing or placing trigs over locked steps; TRAN other than 0; notes from MIDI IN; Part copy and reload.
