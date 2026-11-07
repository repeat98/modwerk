# Analog Rytm MKII: Improved Envelopes 0.1.0-experimental — 7 November 2026

Nathaniel Pavel's (@npp1993) Improved Envelopes enters the library (id `envelopes`). It carries Iced-Cream's Env Reset Amp (ENV RESET AMP, from MrScruff's rytm-mods) on with a pre-fade, runs AMP HLD from no hold to AUTO, gives ATK, DEC, REL and HLD fine steps at short times, and shows every envelope knob's time. Its source-only OS 1.74 package is pinned in `sdk/imports/elekloader-envelopes-2026-11-07.json` (commit `26dd6810`).

- **Build:** `scripts/build-elemod-isolated.sh` in `modwerk-source-tools` (image `39efd52a…`) from clean checkouts of `a0aaa13f` and later commits on the branch. Exported with `package-elemod-recipe.mjs`, which reproduces it with `--check` from each; `verify-elemod-release-exports.mjs` reproduces the 43 current exports.
- **Package:** `envelopes-0.1.0-experimental-os1.74.elemod` `f9779b13…328c`.
- **Emulator:** rytm-emu `2ac0f1f`, EN01 (the plain Modwerk base `ba530f45` + this package, `b1bccf4d…`): boots; the AMP page's DEC and HLD read their times (`media/capture.json`).
- **On a unit:** the author's Analog Rytm MKII over USB, in combined sets of up to 16 modules (EV04 to ED02): AMP DEC within 0.7 % of its text from 5 ms, AMP HLD within 0.1 ms, FILTER ATK within 0.3 %, FILTER DEC and REL 1.5 % (method), ENV RESET AMP with sequencer trigs and RTRG rolls. As reported; details in the module's TESTING.md. Not run alone on a unit.
