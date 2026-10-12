# `synth` — SYNTH MACHINE (octabam build notes, 2.12 engine, 2.13 quantizer)

Adapted from Sam Banks's octabam `modules/synth/README.md` (pinned at
`949f3be`, MIT) for the octatrick line the module now carries: the 2.12 engine,
page and chooser, and the 2.13 quantizer.

A two-operator FM synth machine built from
[timhastie/octatrick-modules](https://github.com/timhastie/octatrick-modules)
at `48b89e7` (tag `v2.13`; its `synth/` files are the same bytes as `v2.12`
`ca13ed8`), vendored under `upstream/`.
`Kind.CF_PATCH`: the voice engine and the FM SYNTH chooser as DRAM units
(`poly.s`, `machine.s`), the PLAYBACK page as a pinned ROM cave (`page.s`;
the page descriptor itself is cloned from the unit's own ROM at first use,
so no stock bytes ship), `SymbolRef`s on the kind table's FLEX renderer,
STATIC renderer and FLEX START entries, and detours. No DSP code, no FX2
row. The engine owns the AMP envelope of a synth track.

## What selects the engine

- **The machine list (2.10; shared since 2.11).** FM SYNTH is the sixth row
  of SRC SETUP (FUNC + SRC) and of SELECT MACHINE TYPE. Since 2.11 the rows
  after PICKUP are a table in `machine.s` (`ml_rows`), assembled per build
  through the units' `remix.inc` (`HAVE_SYDRUM`; the shared equates in
  `engine_abi.inc`): FM SYNTH always, the author's SY DRUM when a build
  carries it. The six row-count / row-bound constants that 2.10 poked
  (5 -> 6) are six detours reading the table's count, and five more detours
  widen the machine window's row clamp, so SELECT MACHINE TYPE scrolls like
  SRC SETUP. This package carries FM SYNTH alone: one table row, the same
  six rows as 2.10, `HAVE_SYDRUM` 0. The choice is stored as FLEX
  plus `FM`, 1 in the track's unused NEIGHBOR PLAYBACK bytes (Part and
  battery-RAM shadow); any other row clears it. `machine.s` is the author's
  adaptation of Modwerk's 0.1.1 chooser: the same signature and Part
  validator wrap, a sample-free source supplier (`po_fmsource`) and START
  callback (`po_fmstart`) in `poly.s`.
- **A machine change resets the track to init (2.12).** To or from FM SYNTH,
  through either list (`fm_choose`), the slot assigner (`po_assign` ->
  `ml_became`) or the file browser (`po_loadsel`, with the new `po_unload`
  detour at `0x40022732` keeping the slot's marker state across the browser's
  unload), `machine.s` `ml_reset` writes the new machine's init into the
  track's PLAYBACK, PLAYBACK SETUP, AMP, AMP SETUP, LFO and LFO SETUP bytes
  (Part, battery-RAM shadow and live lane); step and scene locks and FX1 /
  FX2 are kept, as at a stock machine change.
- **Marker files.** A FLEX track whose sample is named `FMSYNTH*.wav` or
  `SYNTH*.wav` still plays FM, as in every earlier version.

The PLAYBACK page reads PTCH RATO INDX FINE FDBK DEC (title FM SYNTH; PTCH in
semitones, FINE in cents, DEC 127 = HOLD); the LFO page VOIC (1 = mono, 2..4 =
paraphonic) and CHRD (32 chord shapes, each with inversions, lockable per
step, snapped onto the bundled quantizer's scale); LFO SETUP's destination
list shows the FM names; GLIDE is the quantizer's row; LEG is on AMP SETUP.
Since 2.12 the frame builder's metronome-click clear (`0x4000b2c8`) is stock
again: the earlier `po_stop` hook there released held notes at every click.
`upstream/synth/README.md` is the author's full description, with every
measurement.

Since 2.13 the bundled quantizer also acts on MIDI tracks: with a scale on, the
NOTE knob (`qz_mknob` at `0x40055382`, the knob handler's MIDI clamp before
its store `0x4005538a`, which stays stock), NOTE locks (`qz_mplock` at
`0x40050b98`) and the MIDI CHROMATIC keys (`qz_mkey` at `0x400436a8`) follow
SCALE and ROOT; the CHROMATIC drawer hook `qz_octnum` sits at the common
argument push `0x400449be` (Modwerk #264, now the author's own form).
`upstream/quantizer/README.md`, "MIDI tracks (2.13)", is his description.

## How it is built here

`manifest.py` executes `upstream/synth/manifest.py` (the author's manifest,
its stock expectations replaced by address/length/SHA-256 guards and its
precompiled page blob removed) and `upstream/quantizer/manifest.py` (the
matching quantizer, relabelled `fm_*` so it never aliases the public Scale
Quantizer's objects). It adds the page as a `Linked` unit pinned at
`0x400d24d0` with a `reference` to the author's ratified page bytes (the build
fails if `page.s` or the toolchain drifts from them), and one guarded poke at
the page resolver (`0x40031ece`) that jumps to `pg_resolve` at the cave's
+16, the same bytes the author's `emit_page` writes. `poly.s`, `machine.s`,
`page.s` and `engine_abi.inc` are the author's files byte for byte, and so are
the quantizer's `quantizer.s`, `core.s`, `keys.s` and `scale.s`. The
author's manifest declares Analog BD as a native `conflicts` entry; the
wrapper clears it, because Modwerk declares conflicts in
`octamod.module.json`. The DRAM units are linked
into the platform runtime with the other DRAM units and depacked at boot into
the arena reserve.

## Collisions

`tempo-bus` also uses the second free gap, so the ledger refuses that pair.
The public Scale Quantizer and Analog BD overlap the bundled quantizer's and
the chooser's hooks and are refused. The engine shares the platform reserve
with the other DRAM modules inside one runtime.

## Updating

Re-vendor `upstream/` at the new pin, convert any new stock expectation to a
guard (`stock-guards.json` lists them), keep the page `reference` equal to the
author's ratified page hash, and rebuild; the guards, the page reference and
the engine's reads of the quantizer's pinned addresses either hold or the
build refuses.
