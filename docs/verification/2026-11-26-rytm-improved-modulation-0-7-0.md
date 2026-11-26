# Analog Rytm MKII: Improved Modulation 0.7.0-experimental — 26 November 2026

Nathaniel Pavel's (@npp1993) Improved Modulation (`quick-velocity-aftertouch-assign`) lets QPER link any number of performances again and has its PERF hold act on all of them at once, adds FIX + PLAY and CHRO + PLAY (clear a sound's velocity or aftertouch links, with an undo) and LFO + PLAY, RECORD, STOP from any page (stock's LFO page clear, copy, paste), and records scene changes to the nearest step when LIVE RECORDING is quantized.

- **rytm-emu (2ac0f1f), Q701 to Q708 on the plain base 1c14b6b0:** every gesture in TESTING.md's 0.7.0 table, against stock or 0.6.0 where they differ; the undos; paste onto several with and without room; a sweep of scene changes around a step boundary. 0.6.0's ten scene checks and ten screenshots are byte-identical; two screenshots are new.
- **Rig cases:** 32 of 33 on R705 and R706; the one failure is a private case for the old SAMPLER hold.
- **Unit:** the test rig ran 13 cases on R707 (this source) on the author's unit; no hand test yet (TESTING.md). This package's own image ran in rytm-emu only.
- **Reviews:** two independent code reviews before the unit run; their findings are fixed in Q706 and Q707, and Q707's paste path has had no further review.
- **Memory:** 33,928 bytes of the shared mod area (base alone 118,836 free, with the module 84,908).
- **Build:** `scripts/build-elemod-isolated.sh` in `modwerk-source-tools` from the committed tree; `package-elemod-recipe.mjs`; `verify-elemod-release-exports.mjs` reproduced all 71 current exports. Package `6728dd9c…5cf20`, pinned at `7f1e3409`.
