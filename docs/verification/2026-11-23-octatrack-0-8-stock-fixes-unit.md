# Octatrack base 0.8: the stock OS fixes on the unit (23 November 2026)

Post-release check of the four stock OS 1.40C fixes that base 0.8 (#1910, merged 13:03 UTC) carries from #2032. Before
the release they had run only in ot_emu: both unit attempts in #2032 failed at the twin's RAM boot.

**Result:** no live bug found. The six patched sites read back as built. The empty-pattern LED fix and the erase fix
worked by hand on the unit. A 24-module rolled-back trial with Direct Jump Kyoti, KITS and MIDI Scenes passed the
self-test. Not settled on the unit: the Part-change carryover, MIDI Plays-Free (without and with Direct Jump Kyoti), and
KITS' FUNC + RIGHT clone. The gesture did nothing over USB, so it was never tested whether a lock-only pattern survives
it. Details below.

## The build and the unit

- The owner's MKII, OS 1.40C, CF card in, through the unit queue (a hold, 15:03 to 15:23 CET).
- Release source: `b5864cce7` on main (the merge of #1910). `base-version.json` says 0.8.0, and `base-versions.json` gives
  0.8 the identity `e1152583…`.
- Development twin of that source: `678843cc…` (`build_core.py --dev` with the beta flags, as `octatrack-base.mjs`
  builds it, plus the controller rows; owner's `rel-08/twin.sh`). I rebuilt it from `b5864cce7` in my own worktree. Its
  `MAIN.raw` is byte-identical to the `twin-e115` image the owner's session built at 13:07, and its configuration hash is
  the same.
- As found: the unit was already running that twin (`678843cc`), served by the owner's `rel-08` serve. Bank C, pattern
  C04 (`0x800065bd` = `02030203`), Part 1, track T1, stopped. Inventory empty. Card set 4, 0 saved (the flashed base's
  set: a twin does not load it). C01–C16 all on Part 1. Bank C's four Parts each had working = saved. The screen showed
  MISSING MODULES (bank A names Tape Echo and Euclid). My first key closed that notice.
- No RAM boot, so the boot refusal in #2032 ("Finish or recover the existing device transaction") did not come up.
  Nothing was kept, saved, flashed or power-cycled.
- Test patterns: bank P, which was empty under `[BANK]`. I used P01, P02 and P03. Before the test, all three were empty
  (no trig masks, no lock flags, every lock byte `0xff`) and on Part 1, and bank P's Parts each had working = saved. All
  three were put back byte for byte (below).

## 1. The six sites

Read with `mem:` on the running twin. Each one matches the detour that the twin's `symbols.json` predicts (`4ef9` jmp /
`4eb9` jsr + the entry's address):

| Site | Read | Entry |
| --- | --- | --- |
| `0x4009a464` | `4ef940ae4620` | `mw_fix_pattern_led` |
| `0x400621da` | `4eb940ae48b6` | `mw_fix_part_head` |
| `0x40062216` | `4eb940ae4760` | `mw_fix_part_tail` |
| `0x40038a5c` | `4eb940ae48f0` | `mw_fix_trigless_audio` |
| `0x400387b8` | `4eb940ae4916` | `mw_fix_trigless_midi` |
| `0x4009b708` | `4eb940ae49e0` | `mw_fix_plays_free` |

**Pass.** I read the sites again inside the 24-module trial: unchanged. Direct Jump Kyoti had its own `jmp` at
`0x4009b6f2` (`4ef940d90c84…`), beside the base's entry, as the README describes.

## 2. Each fix by hand

**How the LEDs were read.** I read memory, not screenshots: a screenshot shows the screen only. The LED code uses stock's
`led_on`/`led_off` (`0x400131a0`/`0x400131c8`), and both work on a bitmap at `0x460ba98c`, one bit per LED id. The
`[PTN]` and `[BANK]` grids (`0x40035560`, `0x4007afe8`) give trig key n the ids 2n and 2n+1:

- id 2n on: the current pattern or bank;
- id 2n+1 on: the content test (`0x4009a464`, or `0x4000fd78` for `[BANK]`) answered "has content";
- both off: empty.

I read `mem:0x460ba98c:4` while PATTERN was held, or while SELECT BANK was open.

**Empty-pattern LED: pass.**

- **The lock-only patterns.** Made with the panel in grid recording:
  - P02 holds one audio trigless lock (FUNC + TRIG4 on T1), with PTCH locked (TRIG4 held, encoder A). Read back: T1
    `+0x14` = `00000008`, lock row step 4 = `44 ff…`, nothing else.
  - P03 holds the same on MIDI T1 step 6: `+0x48d0+0x14` = `00000020`, row step 6 = `34 ff…`.
- **`[PTN]`** in bank P, P01 current:
  - with only P02 made, the bitmap read `09000000`: ids 0 (P01 current) and 3 (P02 content);
  - with both made, it read `29000000`: ids 0, 3 and 5 (P03 content).
  - Stock's test reads only the trig masks, so it would have shown `01000000`.
- **`[BANK]`** from bank C, with bank P holding only those two patterns: `1a000080`. That is A and B with content, C
  current, and id 31, bank P with content. Before the patterns were made it read `1a000000`.

**Erase empty trigless locks: pass, audio and MIDI.**

- **Gesture.** In live recording (REC + PLAY), hold NO, then hold the knob push (PUSHA) for a bar. While both are held,
  the erase flags read `0x460d1a94` = 1 and mask `0x460d1a98` = 1 (parameter 0).
- **Audio, P02 T1.** I had first turned encoder A without NO taking effect, which recorded PTCH locks. So the track held
  eight trigless locks (steps 1, 3, 4, 6, 8, 10, 13, 15; mask `52ad`), each with only parameter 0 locked. After the
  erase: no lock flags, no lock values. P02 was byte-identical to its state before the test.
  - Stock clears the lock bytes but leaves the flags, so the steps would stay lit.
- **MIDI, P03 T1 step 6.** The same result: byte-identical to before.
- **Again with the 24 modules installed.** P02's single lock was erased again: byte-identical.
- **Not run:** the veto cases (one lock of two erased; a trig on the step). They passed in ot_emu (#2032).

**Part-change carryover: not run.** For a visible difference, Part 2's recorder setup (SRC/RLEN) must differ from Part
1's. Bank P's four Parts are identical. Making them differ means editing a Part, then a SAVE and RELOAD to put it back,
and I did not do that in this window. The PICKUP → FLEX audio needs a listener. Covered only by ot_emu (the recorder
cache after a pattern change into Part 2) and by Zac-Kyoti's MKI.

**MIDI Plays-Free: not run, without and with Direct Jump Kyoti.** I found no panel path to the pattern's PER TRACK scale
mode in the time:

- FUNC + PAGE opens PATTERN SCALE (master 16/16, 1×), but neither FUNC nor RIGHT there changed the mode byte
  (pattern `+0x8e55` stayed `00`);
- DOWN changed the master length to 64, and UP put it back; P02 was byte-identical afterwards;
- the per-track PLAYS FREE and trig quantize DIRECT settings were not reached either.

ot_emu covers this case: the scale byte and the step advance, with and without Direct Jump's splice.

## 3. The large set, then KITS

- **The 38-package set** (every published package that is not base-bound) was refused before any install: loader
  refusal 2, RUNTIME_MEMORY ("the module pool or a DSP memory window has no room"). Installed: none.
- **The 24-package set ran as a 600 s rolled-back trial** (`device.mjs set --seconds 600` through the shared session).
  It left out Grain, FM Synth, SYNTIZ, POLY8, Amiga, Beat Slicer, Tape Echo, BBD, E-Verb, Vector, Airwindows Chorus,
  Lo-Fi 2, Tapehead and Ring SC. It contained Mini Verb, Preview Vol, Apply Scene, Repitch, Scale Quantizer, Euclid,
  Play Modes, Mute Modes, Quantize Live Rec Toggle, **Direct Jump Kyoti** 0.2.0, Deja Vu, Arp Key Locks, Temp Save,
  Slow LFO, Bar LED, Tiempos, Track Solo, Pattern Sample Locks, **MIDI Scenes** 0.3.0, **KITS** 0.1.0, Tuner, Vibrato,
  Butter Fingers and Screen Off.
  - **Self-test passed:** 24/24 intact, 3/3 DSP effects ran, CPU peak 55.3 %, T1-4 41.6 %, T5-8 71.1 %, longest frame
    397 µs.
  - `health`: no new loader stalls or errors.
- **KITS clone: not established.** Setup in bank P:
  - P01 current, with a trig (T1 step 1);
  - P02 the audio lock-only pattern (as above);
  - P03 empty.

  I tried PTN + FUNC + RIGHT three ways over USB: a hold followed by a chord, one chord, and explicit holds. Each time
  KITS did nothing: the pattern stayed P01, P03 stayed empty, and P02 was byte-identical. Releasing PATTERN opened SELECT
  PATTERN. So the copy never ran, and the result says nothing about the fix. KITS acts only when its own READY flag is
  set and it sees PTN held (`kits.s` `kits_fright`). Which of the two was missing was not found.
  - The fix's effect on KITS rests on ot_emu: KITS' own search loop from `kits.s` skips such a pattern on the twin and
    copies over it on stock.
  - A check by a person at the panel, with a project that uses Kits, still closes it.

## Put back

- **Bank P.**
  - P01: its trig removed in grid recording.
  - P02: its lock erased by the fix itself.
  - P03: erased in check 2.
  - All three read byte-identical to their state before the test. Bank P's Parts: see the end state.
- **Unit.** Back on bank C, pattern C04, Part 1, track T1, audio side, stopped. Twin `678843cc` still running, `rel-08`
  serve untouched. No MIDI setting was changed: the MIDI key only switched the panel to the MIDI tracks, and it was
  switched back (`0x80000012` = 0).

**End state.**

- **The trial.** It ended by itself after 600 s: "no crash, stall, freeze or skipped track logged during the trial,
  rolled back". Installed: none. Inventory `[]`; card set 4, 0 saved, 0 live. `health`: 0 loader stalls, 0 errors. The
  crash and stall record counts (12, 56) were as found.
- **Bank C.** Part 1's four copies, working and saved, were byte-identical to the as-found reads. C01–C16 were still on
  Part 1.
- **Bank P Part 1.** Its working copy had one byte changed: `+0x2a`, T1's PTCH, `0x40` → `0x4c`. The knob turns that
  recorded locks during the first erase attempt had also moved the Part's own value. I turned encoder A back until it
  read `0x40` (stopped, not recording). After that, all four of bank P's Parts, working and saved, were byte-identical to
  the as-found reads.
- **The sites** read the same as in check 1. Direct Jump's span at `0x4009b6f2` was stock again: the trial rolled it back.
- The unit was given back to the queue at 15:23.

## What the guides lacked

- **No guide gives the erase gesture.** It is NO held plus a knob push (`PUSHA`–`PUSHF`), as stock's handler at
  `0x40033ca0` reads it; turning a knob instead records locks.
- **No guide says how to read the trig-key LEDs.** They are the bitmap at `0x460ba98c`.

Both belong in `docs/OCTATRACK_DRIVING.md`. I left that to a docs change, since this slice changes no guide.
