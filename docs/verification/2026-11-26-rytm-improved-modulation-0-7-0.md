# Analog Rytm MKII: Improved Modulation 0.7.0-experimental — 26 November 2026

Nathaniel Pavel's (@npp1993) Improved Modulation (`quick-velocity-aftertouch-assign`) lets QPER link any number of performances again and has its PERF hold act on all of them at once, adds FIX + PLAY and CHRO + PLAY (clear a sound's velocity or aftertouch links, with an undo) and LFO + PLAY, RECORD, STOP from any page (stock's LFO page clear, copy, paste), records scene changes to the nearest step when LIVE RECORDING is quantized, and rewrites RECORD + YES, which stalled the UI in rytm-emu on a looped scene take (in 0.6.0 too).

- **rytm-emu (2ac0f1f), Q701 to Q713 on the plain base 1c14b6b0:** every gesture in TESTING.md's 0.7.0 table; the undos; paste onto several with and without room; a sweep of scene changes around a step boundary; RECORD + YES after a loop, playing and stopped, and by ear with sequenced trigs. Nine of 0.6.0's screenshots are byte-identical, one shows the new APPLY AT LOOP START, two are new.
- **Rig cases:** 42 of 43 on R711; the one failure is a private case for the old SAMPLER hold.
- **Unit:** the test rig ran R707 (13 cases) and R712 (RECORD + YES after a loop, and ten cases again) on the author's unit, and the author tested both by hand (TESTING.md). This package's own image and Q713's last review fixes ran in rytm-emu only.
- **Reviews:** five independent code reviews and an audit of the module's loops of stock calls; findings fixed in Q706, Q707, Q712 and Q713. Q713's last fixes have had no further review.
- **Memory:** 35,508 bytes of the shared mod area (base alone 118,836 free, with the module 83,328).
- **Build:** `scripts/build-elemod-isolated.sh` in `modwerk-source-tools` from the committed tree; `package-elemod-recipe.mjs`; `verify-elemod-release-exports.mjs` reproduced all 71 current exports. Package `528ff5fb…4e61c`, pinned at `c7931c78`.
