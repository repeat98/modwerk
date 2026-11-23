# Stock OS fixes in the base

Four fixes to stock Octatrack OS 1.40C behaviour that every Modwerk base carries. None adds anything to play, pick or
set, so they are base work, not modules ([why](../../../../../docs/module-guides/README.md#choose-the-category)).
`build_core.py` links the sources below into every base, whatever its flags, and patches the six stock sites in
[`stock_fixes.py`](stock_fixes.py), each checked against the owner's OS file by its SHA-256.

Three of the fixes are Zac-Kyoti's code, MIT ([`LICENSE.kyoti`](LICENSE.kyoti)), from
[Zac-Kyoti/octatrack-kyoti-fw](https://github.com/Zac-Kyoti/octatrack-kyoti-fw) at `2cd3109` (his octabam modules
BATCH_BUGFIXES and ERASE_EMPTY_TRIGLESS_LOCKS, as [octabam](https://github.com/sambanks/octabam) pins them). His
unchanged files are in `vendor/kyoti-stock-fixes/` (`sdk/imports/kyoti-stock-fixes-2cd3109.json`); the copies here
differ only in their entry labels, renamed so they link beside the base, and in the Part fix's two snapshot bytes, which
live in `.bss` (each change is marked `MODWERK:`). `sdk/tests/test_stock_fixes.py` checks that.

| Fix | What the musician sees on stock | Source | Stock sites |
| --- | --- | --- | --- |
| Empty-pattern LED | A pattern holding only parameter locks (trigless locks, MIDI locks) shows as an unused slot under `[PTN]`, and a bank holding only such patterns stays dark under `[BANK]`. KITS, which asks the same question, copies over such a pattern. | [`pattern_led.s`](pattern_led.s) (Zac-Kyoti) | `jmp` over the content test's prologue, `0x4009a464` |
| Part-change carryover | After a pattern change into another Part, a track going from PICKUP to FLEX plays the old pickup loop, the recorder page keeps the old Part's SRC and RLEN, and a Part with a PICKUP machine reads edited. | [`part_reapply.s`](part_reapply.s) (Zac-Kyoti) | `jsr` at the select-Part handler's head `0x400621da` and tail `0x40062216` |
| Erase empty trigless locks | Erasing a trigless lock's last parameter lock leaves the step lit, on audio and MIDI tracks. An empty trigless lock placed with FUNC + TRIG stays, as on stock. | [`trigless_locks.s`](trigless_locks.s) (Zac-Kyoti) | `jsr` at the audio erase store `0x40038a5c` and the MIDI one `0x400387b8` |
| MIDI Plays-Free trig | A Plays-Free MIDI track with trig quantize DIRECT, in a pattern whose scale is PER TRACK, stalls after its first step on a manual trig. | [`plays_free.s`](plays_free.s) (Modwerk, from Zac-Kyoti's analysis) | `jsr` over `lea 0x46c775bc,%a0` at `0x4009b708` |

What each fix does, and why there, is in its source's header. No stock branch lands inside any of the six sites.

## Beside modules

- **Direct Jump Kyoti** carries Zac-Kyoti's own Plays-Free fix, a jump spliced over the faulty read at
  `0x4009b6f2..0x4009b703`. The base's entry is on the next instruction after the store, so the two never patch the
  same bytes and the module installs on this base as before. With both, the module's splice stores the right byte and
  the base stores the same byte again (`verify_stock_fixes.py --only dj` runs that). The module's copy has become
  redundant; dropping it is its author's call (`docs/MODULE_AUTHOR_UPDATES.md`).
- **KITS** finds "the next empty pattern" for FUNC + RIGHT with the content test at `0x4009a464`. On stock it copies
  over a pattern whose only content is parameter locks. KITS calls the test from its own code, so it gets the full
  scan `[PTN]` gets, and skips such patterns on this base.
- **MIDI Scenes** detours `0x4006221c`, the instruction after the Part fix's tail site; the tail's `jsr` returns there,
  so both run.
- `scripts/module-compat.py` finds no module on any of the six sites.

## Limits, as upstream states them

- `[BANK]` asks all 256 patterns on each LED refresh, so there the fix reads only the trigless-lock steps stock skips,
  at most 16 per pattern (highest step first): past that a pattern reads as stock reads it. Lock values on a step with
  no trig and no lock flag (a project edited off the unit can hold them) light `[PTN]` only. `[BANK]` is told apart by
  its call's return address (`0x4000fd8c`).
- With Octakit (not in Modwerk) the select-Part handler is replaced and the Part fix stays idle.
- Hardware evidence upstream is Zac-Kyoti's MKI (KYOTI V1.8BC/C candidates, 20 November 2026), for his code. The
  Plays-Free entry here is new code. For the Modwerk base, see the pull request's test record.

## Checks

- `verify_stock_fixes.py` runs every fix in ot_emu on a built base, and with `--stock` on the original OS, where each
  check expects the stock bug: the content test (`[PTN]`, `[BANK]` and KITS' search for an empty pattern), the LIVE
  erase on audio and MIDI tracks, the Plays-Free manual trig (with Direct Jump Kyoti's splice too), and the recorder
  settings after a pattern change into another Part. The images stay outside Git.
- `sdk/tests/test_stock_fixes.py` (no firmware): the sites, the sources against the vendored originals, and the build's
  wiring.
