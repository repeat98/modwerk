### Agent test on the unit, 2026-11-27

Command: `npm run device:test -- --share /tmp/modwerk-share.sock --testing-entry sdk/drafts/cx-osc/TESTING.md sdk/drafts/cx-osc/cx-osc.mwrm`

- Package `cx-osc.mwrm`, Cx Osc, SHA-256 `f52815adb0d5cdb0f1926c519f8319ce4527f1adcc52313d502023fb306065ad`
- Installed as a trial in RAM and rolled back at the end: nothing was kept
- Self-test with the package installed: selftest passed; modules 1/1 intact, 0 with DSP effects; together 0/0 ran (last batch - - - - - - - -), peaks CPU 0% T1-4 0% T5-8 0%; longest frame 384 us; card set 4, 0/1
- CX OSC (machine) alone, playing: T1 core peak 338 per mille, CPU 457 per mille, its render peak 19.4 % of a frame, T5 core peak 420 per mille, CPU 435 per mille, its render peak 16.4 % of a frame
- CX OSC T1, mean frame interrupt: quiet 28.3 %, triggered 33.3 %, added +5.0 points; price 12 %.
- CX OSC T5, mean frame interrupt: quiet 30.8 %, triggered 36.4 %, added +5.6 points; price 12 %.
- All at once, playing (machines T1-T8: CX OSC, CX OSC, CX OSC, refused, refused, refused, refused, refused): CPU 536, T1-4 peak 338, T5-8 peak 429 per mille
- Part switches: 12 of 12 ran their own effects within 3 s
- Crash test: not run
- Inventory at the end: the same as before the run
- Result: passed

Left for the developer at the unit: listening (how it sounds and plays, timing by ear), MIDI, scenes and recording, the module beside the other modules installed on the unit, the Keep, the power cycle and what survives it.
