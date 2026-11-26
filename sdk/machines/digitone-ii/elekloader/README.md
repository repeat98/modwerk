# Digitone II base

Modwerk's base for the Digitone II on OS 1.12 ([recipe](../../../../docs/MACHINE_RECIPE.md), [goal](../GOAL.md)): the
Digitakt II base's core-dt2 1.1 source, built for the Digitone II, as the Rytm MKI's base reuses the MKII's (owner,
19 November 2026). Nothing here is a second core. `base.json` names the Digitakt II's elekloader folder as its
`source`, so core-dt2's files come from [`../../digitakt-ii/elekloader/`](../../digitakt-ii/elekloader/) and stay
exact. On top of that:

- **`device.json`**: the Digitone II device, which the pinned Elekloader kit lacks; `machine:base` and the site's
  builder carry it.
- **`recipe`**: the Digitone II's device, its 24 addresses (`defsym`) and 14 sites, in place of mod.json's. They are
  the addresses core-dn2 0.3 (toonst's elekloader fork at `3d7c2e3`, GPL-2.0-or-later) builds this same source with,
  and its builds ran on two units ([evidence](../../../../docs/verification/2026-11-18-digitone-ii-core-on-a-unit.md)).
  A site names the stock bytes it replaces by length and SHA-256; the build reads them from your OS.
- **`copies/`**: Digitone II copies of three core-dt2 files. `base.json` names each one's original and its SHA-256,
  and the build refuses once the original changes, so a copy is redone, never left behind:
  - `mod.json`: OS 1.12, and no `.fast` area (no `fast.s`, `core_fast` or its copier on `ev_tick`): SRAM is not
    qualified on this OS, so the device has no SRAM code area.
  - `store.s`: the kit loader holds the record in a2 and the kit's RAM in a3, the other way round from the
    Digitakt II.
  - `store.c`: a kit record leaves 337 bytes after its end mark (`KIT_ROOM`), so the room buffer holds 340.

One variant, `plain`: none of the Digitakt II base's sequencer and project additions (`add`), whose Digitone II sites
are not found yet. No DSP bridge either: the base links mods for the ColdFire only, and Modwerk's linker refuses a mod
that brings DSP code.

## Build it

```sh
npm run machine:base -- digitone-ii --stock /private/Digitone_II_OS1.12.syx
```

It matches [`base-binding.json`](../base-binding.json), the identity that ran on a unit; a deliberate change records a new one with `--write` once that build has run on a unit. The site builds the same package from its catalog (`sdk/imports/elekloader-modwerk-base-digitone-ii-2026-11-19.json`).

GPL-2.0-or-later, as core-dt2 (irpina); the copies say what they change.
