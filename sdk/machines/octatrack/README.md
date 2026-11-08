# Octatrack SDK

**Platform:** octabam · **OS:** 1.40C (MKI and MKII share one image) · **Modules:** [`sdk/octabam/modules/`](../../octabam/modules/) · **Catalog:** [`sdk/catalog.json`](../../catalog.json)

Octatrack modules build on [octabam](https://github.com/sambanks/octabam) (MIT, © Sam Banks), vendored under `sdk/octabam/` with its provenance in `sdk/UPSTREAM.json` and `sdk/imports/`. DSP effects run on the DSP56300; machines, MIDI and USB modules run on the ColdFire CPU. Modwerk's browser engine composes them from each owner's stock 1.40C file.

- To add, port or update a module, follow [Add or port a module](../../../docs/ADD_A_MODULE.md).
- [The SDK README](../../README.md) describes the layout and the native verifiers.
- Octatrack modules use contract v2 (`octamod.module.json`) with the qualification gates in [MODULE_QUALIFICATION.md](../../../docs/MODULE_QUALIFICATION.md) and the frozen eleven-module baseline. They move to contract v3 (see [the SDK guide](../../../docs/SDK.md)) at their next version.
- OT UI captures follow [MODULE_UI_CAPTURES.md](../../../docs/MODULE_UI_CAPTURES.md).

## Modwerk stack

The Octatrack is the reference for [the recipe every machine follows](../../../docs/MACHINE_RECIPE.md): the Modwerk base in [`elekloader/`](elekloader/README.md), its hooks in [HOOKS.md](HOOKS.md), the USB link, loading without a reflash, base updates over USB, the MCP's device tools and the Octatrack page. Other machines copy these pieces, so when one moves, keep the recipe's links current.

Recovery: hold FUNC while powering on, choose MIDI UPGRADE and send the stock .syx over 5-pin DIN MIDI.


## Sample-editor service

The beta base carries the [sample-editor service](SAMPLE_EDITOR.md) for the AED
SLICE menu (`ot_sample_editor_actions`, index 36). Beat Slicer is its first
contributor.
