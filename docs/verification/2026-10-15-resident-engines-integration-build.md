# Resident engines on demand: the integration build on the unit — 15 October 2026

Moved from `docs/OCTATRACK_RESIDENT_ENGINES_ON_DEMAND.md` on 27 October 2026; history, not current instructions.

## The integration build on the unit

Twin built from this branch before the base regeneration (on demand, `--dev`, configuration `76e15b41…`), on the owner's MKII:

- **All three engines:** placed at boot restore and by install, arena 2,224 / 3,125 (Sidechain 423 words). Eight switches between identical Parts while playing: T3 and MAIN bit-exact, no loader packet, no engine job.
- **Sidechain key phase:** T5 (COMPRESSOR, KEY T3, MON ON) lags T3 by 32 samples on 5 of 5 enables (two blocks); the earlier base gave 89 or 121 depending on the enable. On the key-phase twin, 9 of 9 equal. MON: swapping T5's COMPRESSOR for FILTER with MON on gives exact silence.
- **Evacuation:** SPRING REV at the top of core 1 (under Analog BD), sustained as a drone (all six knobs up, HP 0); installing Sidechain moved it and placed the engine. Under the drone (T3 0.34-0.36 RMS): no click (no 20 ms block above the drone's own second-difference texture), no dropout. Counters: moves and evacuations up by one, no failure.
- **Picks during an engine job:** three PLATE REV picks on T5 while Output Matrix installed: all taken, no selection refused or rolled back. Before the fix the same timing gave DSP LOAD FAILED once on the unit.
- **Analog BD on a restored Part (finding 24):** T3 left as ANALOG BD survives a RAM boot with the module in the saved set: FLEX type and marker kept, the drum plays. Before the fix the bank restore was refused: a default bank without trigs, which the unit's autosave then kept ("total silence", first blamed on Sidechain).
- **Development trap:** a RAM boot after a session of resident engine installs and removals sometimes drops the unit off USB until a power cycle (seen twice without a stray session).

## Where it stood (end of 15 October 2026)

The beta base is regenerated on demand on top of main after #619 (`acf91e0a…`, which adds the startup without the wave's outline and the two-section MODWERK STATUS page; Analog BD's recipe recaptured again, only its image hash changed). Steps 1 and 2 are done (merged with main, 15 October evening). Next:

1. Changelogs: a 15 October note on the current version of the five base-bound modules (four rebuilt, CC Map bytes unchanged); the Sidechain key-phase note now ships in the beta base.
2. This note's Status and Open → Beta base, and one line in the beta test plan naming tester base `acf91e0a…` and the finding 17 recapture.
3. The checks `npm run pr:ready` runs, serially and memory-capped (the parallel run OOMs the WSL test PC), including `import-module-build --check-only --verify-existing` for the rebuilt packages.
4. A development twin of exactly this configuration plus `--dev`, then on the unit: boot, the three engines, a Part sweep, an Analog BD reboot. Then the pull request.
