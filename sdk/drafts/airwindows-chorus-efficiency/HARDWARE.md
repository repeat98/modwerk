# Hardware acceptance — AIRC011T2

Keep this candidate staged until actual results are available. No physical
run is claimed. Use the final private `AIR_CHORUS_0.1.1_AIRC011T2.bin`, not
the earlier AIRC011T1 candidate. Identity:

- Module candidate: `0.1.1-experimental`; update tag: `AIRC011T2`.
- MAIN SHA-256: `cf75abd4fca70c24def9d535aaaca454be4a97ea1d6bcb065dddada8bd038a3b`.
- Saved update SHA-256: `934db3752c56aaf5c6ee3efb3b91971e23c85d4bab847d6afcc8670cd932ba6c`.
- Saved update size: 447,088 bytes; decode/MAIN round-trip verified.

The compact private image retains stock FX1 and offers NONE/Air Chorus in
FX2. It does not enable Air Chorus in FX1. Keep your stock 1.40C update and
backups; use a disposable project for testing.

## First: reported T3 + T4 clicking

The owner can test AIRC011T2. Start with low monitoring volume. Use one Air
Chorus in FX2 on each of T3 and T4. Start SPD/RNG at 64 on both, MIX 64 on
T3 and MIX 0 on T4; slowly raise T4 MIX. If the original project is available,
repeat its exact settings and companions too. Record whether clicking occurs,
the MIX where it begins, whether returning MIX to zero stops it, and whether
removing either instance stops it. Repeat with T3 alone, T4 alone and T1/T2.
Record model, FX1 companions, other active FX, source and actual elapsed time.

Published 0.1.0 and AIRC011T2 produced bit-identical per-track audio in the
recorded full-emulator T3/T4 fixture. The reported hardware failure has not
been reproduced or fixed conclusively; the instruction reduction is a
load-related hypothesis to test, not a verified remedy. See [CLICKING.md](CLICKING.md).
Keep Air Chorus paused until the failure and release gates are resolved.

## Remaining acceptance

1. Install the exact private update using the normal OS-update procedure.
   Report model, tester, update/boot result and actual elapsed duration.
2. Play a sustained stereo source through Air Chorus in FX2, SPD/RNG/MIX 64.
   Compare with the existing release at matching settings if possible. Sweep
   all three controls and endpoints; test settled MIX 0 against dry. Report
   unwanted noise or any audible change separately from expected pitch movement.
3. Set distinct FX2 instances on T1/T5, T2/T6, T3/T7 and T4/T8, covering
   both DSP cores and the private/shared allocator buffers.
   Edit/reset/replace only one and check that other assignments, parameters
   and audio remain independent. Exercise all eight FX2 tracks if practical,
   recording the exact FX1 companions and audio/streaming workload.
4. Apply locks to SPD/RNG/MIX, instrument LFOs and scenes/crossfader changes.
   Exercise starts/stops and Part changes. Record dropouts, crashes, stuck
   controls and any untested paths.
5. Save a known Part/project baseline with distinct instances. Make unsaved
   edits, then verify Part reload and project reload restore the baseline.
   Physically reboot, retaining saved card data, and verify assignments,
   parameters and usable audio on every instance. Record each path separately.
6. Report actual observations with this exact version/tag/hash. An emulator
   project load is not a physical reboot result. Do not infer a chip timing
   margin solely from clean audio or the instruction-count benchmark.

After results, publication still needs current source/image qualification,
compiled packages, native/browser composition parity and owner review. The
historical 0.1.0 exception does not authorize this candidate's release.
