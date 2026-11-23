# Octatrack SDK

**Platform:** octabam · **OS:** 1.40C (MKI and MKII share one image) · **Modules:** [`sdk/octatrack/modules/`](../../octabam/modules/) · **Catalog:** [`sdk/catalog.json`](../../catalog.json)

Octatrack modules build on [octabam](https://github.com/sambanks/octabam) (MIT, © Sam Banks), vendored under `sdk/octabam/` with its provenance in `sdk/UPSTREAM.json` and `sdk/imports/`. DSP effects run on the DSP56300; machines, MIDI and USB modules run on the ColdFire CPU. Modwerk's browser engine composes them from each owner's stock 1.40C file.

- To add, port or update a module, follow [Add or port a module](../../../docs/ADD_A_MODULE.md).
- [The SDK README](../../README.md) describes the layout and the native verifiers.
- [Card-build events](card/README.md): where two modules meet on a card build, which has no base events (`modwerk_card_ev_trig_muted`, the counterpart of `ev_trig_muted`).
- Octatrack modules use contract v2 (`octamod.module.json`) with the qualification gates in [MODULE_QUALIFICATION.md](../../../docs/MODULE_QUALIFICATION.md) and the frozen eleven-module baseline. They move to contract v3 (see [the SDK guide](../../../docs/SDK.md)) at their next version.
- OT UI captures follow [MODULE_UI_CAPTURES.md](../../../docs/MODULE_UI_CAPTURES.md).

## Modwerk stack

The Octatrack is the reference for [the recipe every machine follows](../../../docs/MACHINE_RECIPE.md): the Modwerk base in [`elekloader/`](elekloader/README.md), its hooks in [HOOKS.md](HOOKS.md), the USB link, loading without a reflash, base updates over USB, the MCP's device tools and the Octatrack page. Other machines copy these pieces, so when one moves, keep the recipe's links current.

Recovery: hold FUNC while powering on, choose MIDI UPGRADE and send the stock .syx over 5-pin DIN MIDI.


## Stock OS fixes

Every base carries four fixes to stock OS 1.40C that add nothing to play, pick or set: the empty-pattern LED (which also
keeps KITS from copying over a pattern holding only parameter locks), the Part-change carryover, erasing a trigless
lock's last parameter lock, and the MIDI Plays-Free trig. Three are Zac-Kyoti's code (MIT). The sources, their six stock
sites and how they sit beside Direct Jump Kyoti, KITS and MIDI Scenes are in
[`elekloader/stock-fixes/`](elekloader/stock-fixes/README.md). A new stock fix goes there too.

## Sample-editor service

The beta base carries the [sample-editor service](SAMPLE_EDITOR.md) for the AED
SLICE menu (`ot_sample_editor_actions`, index 36). Beat Slicer is its first
contributor.

## Shared scale

[`modwerk_scale.s`](modwerk_scale.s) holds octabam's 52-ID scale catalogue and one pure snap,
`modwerk_scale_snap(note, id, root)`: the nearest note in the scale, the lower one on a tie, the rule Scale
Quantizer plays. It keeps no state, so the base and a card build each pass the scale and root they keep. C modules
include [`include/modwerk_scale.h`](include/modwerk_scale.h); assembly modules push the three longs and `jsr`.
Link the file into the build; it reads its table PC-relative and has no stock address. On card builds, link it as a Linked unit: a source CavePatch keeps only `.text` and would drop the table.

- IDs are octabam's (`modules/scales`, vendored at `vendor/octabam-scales/`,
  `sdk/imports/octabam-scales-755a02ac.json`): an ID never changes meaning, and a new scale takes the next one.
- Scale Quantizer saves SCALE as its own index 1..24. `modwerk_scale_from_quantizer[n]` gives the catalogue ID with
  the same mask: IDs 1..7 are the same, 8..24 differ. Read an old project's SCALE through it.
- `sdk/tests/test_shared_scale.py` checks the table against the vendored file. With ColdFire binutils and Unicorn,
  it also runs the snap against Scale Quantizer's `qz_msnap` and octabam's `sc_snap`, note for note.
- A shared file doesn't lift the FM Synth and Scale Quantizer conflict on card builds.
