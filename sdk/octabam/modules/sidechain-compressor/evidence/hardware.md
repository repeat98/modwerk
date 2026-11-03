# Sidechain Compressor author-reported hardware operation

## 0.2.0-experimental

Tester: **Zac Kyoti** (the module's author), 26 October 2026, on an
**Octatrack MKI**. Image: Modwerk's native build of this source, the module
alone with the stock FX2 effects kept (`sidechain-compressor:true` in the
coverage set), MAIN OS SHA-256
`131142e1839bf1a62b48929dee396cc23b1f2f27f33595a9e6f39bf57f7be22e`, flashed
from a `.bin` card update wrapped from that MAIN OS (version field
`MW_SC021`, `.bin` SHA-256
`6a02a0672a7888390667af1bab0b4920652b5ca26cd820a6b9cbc9e450468aa4`; the
wrapper changes no MAIN OS byte). Author pin: Zac-Kyoti/octatrack-kyoti-fw
`b0d49bf32d3fcc2e3ce7e9cec67f4fbb2619e511`.

The author was given this checklist with the image:

1. KBAS and KWID across their whole range, with MON on and off.
2. MON shows OFF on the left and ON on the right; a project saved with an
   earlier version comes up with MON OFF.
3. KEY turned with the encoder pressed moves one position per detent.
4. Switching MON, and changing KEY with MON on, fades without a click.
5. A project saved with MON ON comes back ON after a power cycle and reload.

and reported: "MW_SC021, OCTABAM33, and KYOTI v1.6 all flashed, working
fine. All good."

The first 0.2.0 image (`MW_SC020`, 24 October 2026) ducked correctly but
broke KBAS and KWID (silence, level jumps and squeals): the key-filter
table's address came from a register the gain store had already moved. That
image is superseded; this source loads the table by its own literal.

### Limits

- A functional report: duration, project, material and tempo were not
  reported, and the checklist items were confirmed together, not one by one.
- No measured chip timing, memory canary, recording, recovery or stress test;
  cross-core key latency was not measured.
- The flashed image is the module alone; the Modwerk download (with the core
  logger), the USB beta base and selections with other modules were not
  flashed.

## 0.1.2-experimental

Tester: **Zac-Kyoti** (the module's author), 10 October 2026, on an
**Octatrack MKI**. Image: Modwerk's native build of this source, the module
alone with the stock FX2 effects kept (`sidechain-compressor:true` in the
coverage set), MAIN OS SHA-256
`2816f0bce5aaabfadac6dba9e778dc184b8af3e4a611990d6e6b3e36095bc5eb`, flashed
from a `.bin` card update wrapped from that MAIN OS (version field
`140C_SC012`; the wrapper changes no MAIN OS byte). Source: octabam
`922878234b22221a1c298b3c7e0b3bdeffb468a9`, author pin
Zac-Kyoti/octatrack-kyoti-fw `329b801cf90f32cbca97c6699a908908968e4df6`.

The author was given this checklist and reported "Flashed. All tests pass":

1. A project saved before the module was installed (stock firmware or 0.1.1),
   holding a COMPRESSOR, opens with page 2 at KEY OFF, KFLT and KGN centred,
   MON OFF.
2. Two instances with different settings on different tracks, FX slots and
   DSP cores: COMPRESSOR on T1 FX1 keyed from T5, and COMPRESSOR on T5 FX2
   keyed from T1. Both duck; editing one leaves the other unchanged.
3. MON ON plays the key; MON OFF restores the track.
4. Part save, edit, Part reload; project save and reload; a power cycle.
   After each, both compressors return with the settings the author made,
   not reset to OFF.
5. No crash, click or wrong screen observed.

## Limits

- A functional report. Duration, project, sample material and tempo were not
  reported.
- Two instances, not the sixteen-slot maximum the cycle and memory models
  price. No overload was reported; none was measured.
- No measured chip timing, memory canary, recording, recovery or stress test.
  Cross-core key latency and rate locking were heard, not measured.
- The flashed image is the module alone. The Modwerk download composes the
  same module-owned bytes with the platform writes (core logger); that image
  and selections with other modules were not flashed.

## 0.1.1-experimental

Fresh hardware evidence for 0.1.1 was waived by the owner on 5 October 2026
(`sdk/sidechain-compressor-build-approval.json`); see TESTING.md for the
historical upstream report it retained.
