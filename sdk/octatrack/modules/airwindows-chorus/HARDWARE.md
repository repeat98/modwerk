# MKII test request — Air Chorus 0.1.0-experimental

The owner reports a successful 50-minute MKII test of the first candidate,
with several distinct instances and full knob sweeps. The changed AIRC0R1
candidate has an explicit current-image hardware waiver; omitted checks remain
unverified. See [the attributed report](evidence/hardware-report.md).
The following steps are available for further testing of the exact private
image in `evidence/private-build.json`.
The MAIN OS hash is also the UI capture image identity. This is a compact
development image: stock FX1 remains, FX2 offers NONE and Air Chorus. Keep
existing projects intact and use a disposable test project.

## Test steps

1. Back up your card/projects and keep your original Elektron 1.40C update
   locally. Install the private `AIR_CHORUS_0.1.0_RELEASE_TEST.bin` through the
   instrument's normal OS-update procedure. Record that the update installed
   and booted successfully, the model (MKII) and the elapsed test duration.
2. In a fresh disposable project, select a Flex or Static track playing a
   sustained stereo sound. Hold FUNC + FX2, highlight Air Chorus with UP/DOWN,
   press YES, then FX2. Confirm that SPD, RNG and MIX respond at A, B and F.
   Set SPD 64, RNG 64, MIX 64. Describe the sound and any unexpected noise.
3. Sweep each control slowly and quickly through its entire range, then try
   SPD/RNG/MIX 127 together. Distinguish expected pitch movement at moving
   taps from clicks/crackle. Return MIX to 0 and confirm settled dry output;
   select NONE and compare. Extreme modulation is intentionally capable of
   pitch and aliasing artifacts; report anything objectionable.
4. Use distinct instances on at least T1/T5 and T2/T6 so both DSP cores and
   several tracks are exercised. Give them different SPD/RNG/MIX settings;
   change only one instance and confirm the others stay independent. Test
   all eight FX2 tracks concurrently if possible. State exactly which tracks,
   other FX1 effects, signal levels and workload you actually used, including
   any dropouts, clipping, hangs or instances you did not test.
5. Add step locks to all three controls, then scene/crossfader changes and
   Octatrack LFO modulation. Try multiple track speeds and swing while the
   instrument owns the rhythm. Report clicks, stuck settings or crashes.
6. Test a Part switch and return, save/reload the Part, then save/reload the
   project. Finally power-cycle the physical MKII and reopen the saved
   project. Confirm effect assignment, control values and clean initialization.
   This last step requires a physical reboot; an emulator reload cannot replace it.
7. Switch among Air Chorus, NONE and retained stock FX1 effects on the test
   tracks. Report the exact path to any failure. Restore stock firmware if
   you need your ordinary FX2 configuration while this candidate is reviewed.

## Report to send back

- Tester identity, MKII, exact file/hash and actual duration.
- Boot/update and selection/control results; what you heard during knob sweeps.
- Tracks/instances and other effects used; isolation and maximum-load results.
- Step locks, scenes/crossfader and instrument LFO results.
- Part, project reload and **physical reboot** results separately.
- Any failure with exact settings and reproduction steps, plus coverage you skipped.

Do not check a qualification or author-release evidence box from these
instructions alone. The actual results must be attributed and reviewed.
The owner authorized release with the exact-image hardware waiver recorded in the attributed report; these optional test steps do not upgrade missing coverage.
