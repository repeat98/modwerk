# Air Chorus efficiency candidate — 0.1.1-experimental

This is an unpublished optimization of the existing Air Chorus 0.1.0 DSP.
The owner requested that it stay staged for hardware testing. The published
module, catalog, packages, previous approval and downloads remain at 0.1.0.
No earlier hardware result or waiver covers this candidate.

Published 0.1.0 is now paused after a report of rhythmic clicking with T3 + T4
instances as MIX rises. [CLICKING.md](CLICKING.md) records the investigation.
The optimized image is ready for the owner's comparison, but is not a verified
clicking fix. Keep it staged and Air Chorus hidden pending actual results.

The goal is lower DSP cost with the same sound: preserve the full stereo
sweep, Airwindows air compensation, three-point interpolation, 48-bit states,
per-sample control smoothing and saved control meanings. The verification
compares actual assembled DSP output with the published implementation byte
for byte, including dirty history, ring wraps, moving controls and every
trigger split offset. See [TESTING.md](TESTING.md) for measured results and
limits, and [HARDWARE.md](HARDWARE.md) for the next acceptance step.

The DSP changes remove repeated air-state calculations and temporary spills,
read the three adjacent delay taps together using aligned modulo addressing,
select the valid startup-history case once per triplet, share stereo
coefficients, retain cascade intermediates and combine arithmetic with memory
moves. They retain the original arithmetic truncation points. No interpolation,
smoothing, buffer precision or modulation-rate reduction is introduced.

## Reproduce the candidate

From the repository root, with Python 3.12 or newer:

```sh
python3 sdk/drafts/airwindows-chorus-efficiency/prepare.py --output /private/tmp/air-chorus-candidate
```

Choose a new directory. This exports tracked repository source and overlays
only the candidate DSP and its verification helpers. It pins the published
assembly hash before preparing anything, saves the original assembly for A/B
comparisons, sets the staged manifest/catalog to 0.1.1 and adds version-matched
release notes to the staged `src/community/module-changelogs.json`, preserving
history. It reuses the published reference, control, instance and stress tests
and the shared native builder. It never reads firmware.

The prepared tree's old qualification, screenshots and package records are
historical. Preparation does not qualify or publish the candidate. Use
`build_private.py` in its module folder with your original 1.40C MAIN OS and
the reviewed toolchain, as described in [TESTING.md](TESTING.md). Keep firmware,
raw renders, logs containing stock data and emulator cards outside Git.

## FX1 and the stock Chorus investigation

Stock Chorus processes audio on the DSP. Its DSP program is 329 words on
each core, and its two channel buffers are 1,536 words apart. Its 3,072-word
allocation fits FX1. Air Chorus requires 16,384 words for its existing long
stereo sweep; FX1 supplies 3,072. Saving cycles alone does not make those
buffers fit. Addresses, hashes and analysis are recorded in
[evidence/stock-chorus-inspection.json](evidence/stock-chorus-inspection.json).

The stock routine's parallel arithmetic/memory work informed the final
instruction-packing optimization here. The algorithm remains Airwindows
Chorus; no extracted stock code or tables are included.

The owner wants a CPU path considered only if matched measurements show a
substantial efficiency gain. A CPU port could place full-size buffers in separately reserved SDRAM, but
its cost and routing must be measured. Stock Chorus is not such a port.
Stock DELAY's existing CPU/DMA integration, also used by Tape Echo, operates
after FX2. Using that hook would not put chorus ahead of an independently
selected FX2 effect. Correct FX1 placement needs a verified new signal-routing
path, buffer ownership, per-slot instance isolation, latency alignment and
CPU deadline evidence. No CPU port or FX1 support is claimed here.

A shorter-range DSP FX1 variant is another possibility, but would change the
available sweep. The owner has not approved that tradeoff. This candidate
keeps the complete sound/range and remains FX2-only.

## Promotion after hardware testing

Record actual version/image-matched results, including distinct instances on
both cores and Part/project/physical reboot persistence. Then update the
published module/version/catalog/release notes, regenerate metadata, compile
and import stock-free packages, rerun native/browser composition parity and
`npm run module:doctor -- airwindows-chorus`. Run
`npm run check -- --base origin/main` before committing. The owner reviews
publication; the 0.1.0 waiver must not be extended silently.

Chris Johnson / Airwindows authored the original Chorus (MIT). Jannik Assfalg
ported it; these optimizations retain the same attribution and [MIT licence](LICENSE).

## Promoted to beta

On 9 October 2026 the owner authorized this candidate as Air Chorus 0.1.1 for the beta tester class, waiving current hardware evidence for the exact published source. The release module is now `sdk/octabam/modules/airwindows-chorus`; this draft retains the original investigation evidence. The T3/T4 hardware symptom remains unconfirmed.
