# Analog Rytm MKII: core-ar2 0.7 in the builder — 27 October 2026

The Rytm's builder now plans core-ar2 0.7 (parameter pages and page-key lists, mod machines, page functions, write-through), irpina's [core-ar2-v0.7](https://github.com/irpina/elekloader/releases/tag/core-ar2-v0.7) pre-release, built from `mods/core-ar2` at fb58292. It is pinned in its own record, `sdk/imports/elekloader-core-ar2-v0.7.json` (`core-ar2-0.7.elemod`, sha256 `f1e9cb2c…d9c1`, the release's own). 0.3's record stays, and the kit takes the newest core that every chosen module's `needs_core` allows. Downloads stay off (`DIGI_DOWNLOADS_ENABLED`).
- **Parity (the owner's stock 1.74, this computer):**
  - Core-ar2 0.7 alone: the vendored kit 0.7.0, Modwerk's linker and elekloader at fb58292 give the same patched main OS, `e43adc5f…`.
  - With the Filter Hz package: `64ec711b…`.
  - With Loop Sync 0.3.2 and Retrig Grid 0.1.0 from one lockfile: `86244f34…`.
  - From no lockfile, elekloader's store adds one intermediate ancestor ID (`0x828a73b9`) that kit 0.7.0 does not. The layout ID (`0x5b27ef74`), the fields and their offsets are the same, so the two read each other's projects.
  - With core-ar2 0.3, kit 0.7.0 and elekloader agree from no lockfile too.
- **Not linked here:** rytm2_mods v1.2's own-page mods (euclid-accents and velocity-humanise in `_submissions`) are refused by 0.4 and later, per the core's README and the release notes; their 0.4 versions contribute entries instead. Neither is in the library.
- **Not tested:** 0.7 itself on a unit by this PR. The author's units ran Send FX's pages on a local core-ar2 build at a24651d (0.6) plus one unpublished change. No browser build from a stock OS file ran here.
