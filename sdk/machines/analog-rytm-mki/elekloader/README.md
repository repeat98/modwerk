# Analog Rytm MKI base

Modwerk's base for the Analog Rytm MKI on OS 1.74 ([recipe](../../../../docs/MACHINE_RECIPE.md)): the MKII base's
plain variant, core-ar2 0.7's source and the machine list's sections, built for the MKI. Nothing here is a second
core. `base.json` names the MKII's elekloader folder as its `source`, so core-ar2's files come from
[`../../analog-rytm-mkii/elekloader/`](../../analog-rytm-mkii/elekloader/) and stay exact copies of irpina's release.
On top of that:

- **`recipe`**: the MKI's device, addresses (`defsym`) and sites, in place of mod.json's. A site names the stock
  bytes it replaces by length and SHA-256; the build reads them from your OS.
- **`copies/`**: MKI copies of four core-ar2 files that hold more than defsyms. `base.json` names each one's
  original and that file's SHA-256, and the build refuses once the original changes, so a copy is redone, never left
  behind:
  - `pages.s`: the MKI has 11 stock pages (0..10), so page_info's fall-through bound is 10, not 11.
  - `store.c`: the MKI's addresses, and `is_image` also accepts the stored project, which the MKI keeps in its
    persistent memory at `0x20000000`, outside DDR.
  - `store.s`, `machines.c`: the MKI's addresses only.
  - `base/sendbus.c`, `base/sendbus.s`: the send bus reads the voices from the MKI's receive ring (10 words a
    frame, the eight voices first, in voice order; the block before the one about to be unpacked), not the MKII's
    fixed 12-word buffer; the kit is at project + 232. Its pages are stock parameter pages (core-ar2's core_pages,
    core_page_fns and core_params), so stock draws them and turns their knobs: the controls, SEND and a SEND FX page
    (TYPE, DEL, REV, CPU, LEV) behind the DELAY key, on hidden TEST-machine records whose RAM records copy the stock
    parameter each stands for (AMP's DEL send for SND, DEL and REV, DELAY's VOL for LEV, and so on), so each knob
    turns, accelerates and draws as that one. DEL and REV send the effect's return into stock's delay and reverb,
    inside stock's send routine (after it builds their inputs, before they run), at the level a voice with the same
    signal and send gets. CPU is the send bus's mean share of the audio block.
  - `base/locks.s`: the MKI's three lock routines (their lock tables are laid out as the MKII's).
- **`mki/`**: two variants of the core's own routines. `settings_mk1.s`: the MKI's GLOBAL builder keeps the menu in
  a3. `render_mk1.s`: the MKI's audio handler keeps no a6 frame.
- **`common`**: the MKII base's machine list sections, at the MKI's three sites.
- **`add`**: the send bus (variant `send-bus`), from the MKII base's `add` with the MKI's sites and addresses;
  `plain` stays the default until the send bus has passed on a unit. The addresses and how each was found are in
[the research report](../../../../docs/RYTM_MKI_OS_RESEARCH.md#6-the-modwerk-base-step-core).

## Build it

```sh
npm run machine:base -- analog-rytm-mki --stock /private/Analog-Rytm_OS1.74.syx
```

It needs an Elekloader kit that knows the MKI (its device profile and the ELE2 reader); the pinned kit does not
yet, and the build says so. Until then there is no `base-binding.json`. With a device registered privately, this
build gives the same package, section for section, as the one that passed on a unit (MW06, 8 November 2026).

GPL-2.0-or-later, as core-ar2 (irpina and Iced-Cream); the copies and `mki/` say what they change.
