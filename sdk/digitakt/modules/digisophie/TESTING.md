# SOPHIE testing

## In Modwerk

No hardware, audio or timing qualification is claimed. Evidence tier: `none`. The current builder and UI capture results are recorded below.

## Authorship correction

Modwerk metadata version `1.1.13-experimental.1` credits Sjoerd (Soejrd, @soejrd) as DigiSophie’s developer and maintainer, and Matt Estela (@mestela) as the original Sophie for Schwung algorithm author. The pinned upstream revision, native source, build inputs, compatibility and resource estimates are unchanged. Evidence remains `none`; this correction claims no new native or hardware validation.

## Upstream

The author documents their own checks in [upstream/README.md](upstream/README.md). Those results belong to the author’s v1.1.13 build with elekloader’s toolchain and core; they do not qualify a Modwerk build.

## Imported memory estimate

The author’s `digisophie-1.1.13.elemod` release object (SHA-256 `6eadc29d581b24ff84fe3fe32399b998a91375ee06182631ab499109b4a003a5`) contains 7,998 B in `.run`, 720 B in `.bss` and 4 B of table contributions: **8,722 B** in total. This counts code, initialized data, zero-filled state and contributions, not the JSON file size. It excludes the shared Modwerk core and linker alignment; the browser estimate reserves those separately. This is an upstream object measurement, not a measured Modwerk build or hardware load report.

## OS 1.54 — 30 October 2026

Version `1.1.13-experimental.3` adds Digitakt OS 1.54 (#806). Source revision: `ce17b9e4868027bafe8684054b45f28ea368bd7c`, the author's merge of irpina's OS 1.54 port. `glue.s` and `digitakt.c` now take every OS address from `os153.inc`/`os153.h` or `os154.inc`/`os154.h`; `sophie.c` and the other sources are unchanged. `build.json`'s 1.54 release carries the author's seventeen 1.54 sites from `mod.json`'s `ports`, each turned into an address, length and SHA-256 guard as for 1.53 (the 1.53 sites still match the author's `mod.json`).

Modwerk serves the author's own packages: `digisophie-1.1.13.elemod` for 1.53 (elekloader's pin, unchanged) and `release/digisophie-1.1.13-os1.54.elemod` from that commit for 1.54 (SHA-256 `51cd3aca3652e1926b6be0213269ac0b54b3c44655f06af4a79270db371b58fa`), pinned in `sdk/imports/elekloader-digisophie-2026-10-30.json`. The 1.54 object holds 7,974 B in `.run`, 720 B in `.bss` and 4 B of contributions (8,698 B); the declared 8,722 B (1.53) stays the larger figure. The 1.54 object records a `digitakt.c` SHA-256 (`93052df4…`) other than the committed file's (`69ab5551…`); `glue.s` and `sophie.c` match. Modwerk did not rebuild it from source.

Not tested: the 1.54 build on a unit, or for audio, timing, persistence or stress.

## Documentation capture — 30 October 2026

Documentation version: `1.1.13-experimental.3`, on OS 1.54. The unchanged vendored elekloader kit 0.7.0 (`patch.build`, the engine the site's builder runs) linked core 2.1 and the author's `digisophie-1.1.13-os1.54.elemod` with the owner's private stock OS 1.54 file: no overlaps, stock bytes as expected, output verified. Built-image SHA-256: `7c71c84a8937f639090b0849b72d7972d89eb28c2be9f97acecfd91600fdd1d4`. Firmware and derived images remain private.

Pinned digiemu `c1b5735835923e328f8b4950d6ba927875e5b669` with its six patched-Unicorn 2.1.4 fixes (`emu.unicorn_compat`: compatible) and Python 3.12.13 booted it to the live UI and ran [capture-plan.txt](media/capture-plan.txt) with firmware-native drawing (`hle=False`), a disposable first-boot project and no network (`sandbox-exec`, network denied). Every frame was opened for review: SOPHIE in the machine chooser, its SRC page with TUNE, MODEL, FOLD, SAMP, SWEEP, METAL, FBK and COLOR, MODEL stepping through FUSE, BOOM, PIPE and SHARD, and the stock AMP page. The chooser, FUSE and AMP frames are pixel-identical to the 1.53 captures below. [capture.json](media/capture.json) keeps the inputs, timestamps, PNG hashes and identities; the 1.53 record it replaces is in this file's history.

UI-only documentation; no hardware, audio, timing, persistence or stress qualification.

## Documentation capture — 7 October 2026

Documentation version: `1.1.13-experimental.2`. Source revision: `961c39cec699e8f8940391634aaba9fad7120792` (`.`). Native source, build declaration and pinned release objects were not changed.

The unchanged vendored elekloader kit 0.4.0 linked and verified the pinned release modules listed in [capture.json](media/capture.json) with the owner’s private stock OS 1.53 file. Built-image SHA-256: `54799123bedb06852bc925340e4edbb0dd8496070b188df4c0d3cc900e5040a1`. Module metadata version is separate from the native release versions listed in that record. Firmware and derived images remain private.

Pinned digiemu `c1b5735835923e328f8b4950d6ba927875e5b669` ran firmware-native drawing with `hle=False`, a reviewed patched Unicorn 2.1.4, Python 3.12.13 and a disposable first-boot project in a network-denied macOS sandbox. The record pins the Unicorn source, six patch hashes and local library hash. Only complete, unmodified LCD frames were retained at 6× integer scale and every retained image was opened for review.

- SOPHIE in the machine chooser.
- FUSE model source controls.
- BOOM model source controls.
- Track amplifier controls.

UI-only documentation; no hardware, audio, timing, persistence or stress qualification.

Reproduce after building the same module selection using the browser’s vendored elekloader builder and your own OS file, keeping all firmware and emulator outputs outside the checkout:

```sh
python3 scripts/capture-digi-module-ui.py \
  --emulator /path/to/pinned/digiemu \
  --firmware /private/capture/custom.syx \
  --plan sdk/digitakt/modules/digisophie/media/capture-plan.txt \
  --out /private/capture/new-session
```

Run that command inside the isolated sandbox described in [MODULE_UI_CAPTURES.md](../../../../docs/MODULE_UI_CAPTURES.md). `capture-plan.txt` is the exact panel plan used; `capture.json` retains its actual input events and selected timestamps. The capture CLI was smoke-tested from a fresh Digitakt digihealth first boot; these module captures use the same pinned emulator panel APIs. No menu state or LCD labels were injected.

Passed repository validation on 7 October 2026: `npm run modules:generate`, `npm run check`, `npm run module:doctor -- digisophie`, and `npm run modules:check -- --base origin/main`. UI documentation keeps the existing evidence tier and imported resource estimates; hardware, sound quality, persistence, stress behaviour and cycle-accurate performance remain untested in this update.
