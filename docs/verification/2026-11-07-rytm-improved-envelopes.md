# Analog Rytm MKII: Improved Envelopes 0.1.0-experimental — 7 November 2026

Nathaniel Pavel's (@npp1993) Improved Envelopes enters the library (id `envelopes`). It runs AMP HLD from no hold to AUTO, gives ATK, DEC, REL and HLD fine steps at short times, and shows every envelope knob's time. ENV RESET AMP stays with Env Reset Amp, which installs beside it. Its source-only OS 1.74 package is pinned in `sdk/imports/elekloader-envelopes-2026-11-07.json` (commit `2c53a220`).

- **Build:** `scripts/build-elemod-isolated.sh` in `modwerk-source-tools` (image `39efd52a…`) from a clean checkout of `ed0cac20`. Exported with `package-elemod-recipe.mjs`, which reproduces it with `--check`; `verify-elemod-release-exports.mjs` reproduces the 49 current exports.
- **Package:** `envelopes-0.1.0-experimental-os1.74.elemod` `3c5016ae…dc30`. Linked on the plain base `ba530f45`: ramSpare 113,776 alone (EN02, 5,228 bytes for the module) and beside Env Reset Amp 1.0.0 (EN03).
- **Beside Env Reset Amp:** no shared bytes; the HOLD rule holds after its drop record, read in OS 1.74's state machine (module `upstream/README.md`).
- **Emulator:** rytm-emu `2ac0f1f`, EN02 (the plain base + this package, `c8835018…`): boots; the AMP page's DEC and HLD read their times (`media/capture.json`).
- **On a unit:** the author's Analog Rytm MKII over USB, in combined sets of up to 16 modules (EV04 to ED02): AMP DEC within 0.7 % of its text from 5 ms, AMP HLD within 0.1 ms, FILTER ATK within 0.3 %, FILTER DEC and REL 1.5 % (method). As reported; details in the module's TESTING.md. This package: not yet run on a unit.
