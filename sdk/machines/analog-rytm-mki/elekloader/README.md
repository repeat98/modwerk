# Analog Rytm MKI base

Modwerk's base for the Analog Rytm MKI on OS 1.74 ([recipe](../../../../docs/MACHINE_RECIPE.md)): the MKII base's
plain variant, Modwerk's own core and the machine list's sections, built for the MKI. Nothing here is a second
core. `base.json` names the MKII's elekloader folder as its `source`, so the core's files come from
[`../../analog-rytm-mkii/elekloader/`](../../analog-rytm-mkii/elekloader/), and every MKI difference is passed in:

- **`recipe`**: the MKI's device, the assembly's addresses (`defsym`: the resume addresses of every site, the stock
  page bound 10, the route defaults) and sites, in place of mod.json's. A site names the stock bytes it replaces by
  length and SHA-256; the build reads them from your OS.
- **`common.cflags`**: the C sources' addresses (`CORE_*_AT`): the stored project, which the MKI keeps in its
  persistent memory at `0x20000110`, outside DDR (the core accepts it as an image there), the live project and global
  slots, the project serializer, the part saves and the machine tables.
- **`mki/`**: two variants of the hook bus's routines. `settings_mk1.s`: the MKI's GLOBAL builder keeps the menu in
  a3. `render_mk1.s`: the MKI's audio handler keeps no a6 frame.
- **`common`**: the MKII base's machine list sections, at the MKI's three sites.

No send bus yet (one variant, `plain`). The addresses and how each was found are in
[the research report](../../../../docs/RYTM_MKI_OS_RESEARCH.md#6-the-modwerk-base-step-core).

## Build it

```sh
npm run machine:base -- analog-rytm-mki --stock /private/Analog-Rytm_OS1.74.syx
```

It needs an Elekloader kit that knows the MKI (its device profile and the ELE2 reader); the pinned kit does not
yet, and the build says so. Until then there is no `base-binding.json`. The package that passed on a unit (MW06, 8 November 2026)
was built from core-ar2 0.7's source; Modwerk's own core has been assembled and compiled for the MKI, not yet built as a
package or run on a unit.

Modwerk's own sources, GPL-2.0-or-later.
