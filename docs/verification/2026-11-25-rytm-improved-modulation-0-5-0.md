# Analog Rytm MKII: Improved Modulation 0.5.0-experimental, QPER Live Rec retired — 25 November 2026

Nathaniel Pavel's (@npp1993) QPER Live Rec (`qperf`, 0.3.0) becomes part of Improved Mod Assign, renamed Improved Modulation (id `quick-velocity-aftertouch-assign`), and leaves the library: its folder, import records, packages, vendored package and release notes go, and saved sets that name it drop it quietly (`RETIRED_DIGI_MODULE_IDS`). Its source moved in as `src/qperf.c` with its hooks, three stock sites and claims; its tick keeps running before the rest of the module, as when the two were separate. New in 0.5.0: a second QPER + YES in the same hold undoes the apply, and SCENE + REC, STOP and PLAY act at once in scene edit and after 3 ticks on a page.

- **Same behaviour as before the fold:** in rytm-emu (2ac0f1f), the published Improved Mod Assign 0.4.0 and QPER Live Rec 0.3.0 packages linked side by side on the plain base (QB01) and this source (QF01 to QF04) give 13 byte-identical screens over FIX, SAMPLER, LFO, SCENE, QPER and quick perf rec plans; the nine screenshots are byte-identical to the files they replace.
- **Memory:** 25,752 bytes of the shared mod area (base alone 118,836 free, with the module 93,084).
- **Build:** `scripts/build-elemod-isolated.sh` in `modwerk-source-tools` from the committed tree; `package-elemod-recipe.mjs`; `verify-elemod-release-exports.mjs` reproduced all 71 current exports.
- **Unit:** the test rig and the author's hand test on development images of this source (TESTING.md); this package's own image ran in rytm-emu only.
