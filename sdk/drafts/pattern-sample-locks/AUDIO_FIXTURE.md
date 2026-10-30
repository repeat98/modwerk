# Sample-inclusive playback fixture

`prepare_audio_fixture.py` clones a private seed project and creates eight
original two-second stereo WAVs. T1–T4 use Flex, T5–T8 Static; each has its own
sample slot and identifiable tone (256, 384, 512, 640, 768, 896, 1,024 and
1,152 Hz). The files are included explicitly in the FAT card image and read
back by hash. Markers, Part assignments, 120 BPM, track/pattern lengths and
stored bank checksums are prepared offline.

Bank A has four saved 64-step patterns with 512 sample trigs each:

| Pattern | Initial SAMPLE locks | Other locks |
| --- | --- | --- |
| A01 | Empty; maximum Lock changes 512 fields | None |
| A02 | All assigned slots; maximum Clear changes 512 fields | None |
| A03 | All assigned slots | First other slot, neutral pitch |
| A04 | All assigned slots | Last other slot, matching the profiling fixture |

Project records, card images, generated WAVs and captured PCM stay outside Git.
The source project and extracted stock records never enter the repository.

```sh
python3 -B sdk/drafts/pattern-sample-locks/prepare_audio_fixture.py \
  --seed-card /private/seed-card.img --out /private/new-audio-fixture
```

The independent emulator wrapper reuses the real-loader refusal probes and
whole-image/site attestation from `reconstruction_emulator.py`. It overrides
the older capture harness's `--main-level off` with explicit level 64. Earlier
runs using the disabled main level are not audio-output evidence.

The wrapper requires native loaded machine/sample assignments and all 512 trig
bits, then captures the main mix and eight per-track DSP stems. Every stem must
be non-silent and its own expected tone must dominate the other seven fixture
frequencies. It captures with the module closed, through maximum Lock and Clear
on A01, before and through Clear on A02–A04, and after native module removal.
Complete track/mirror/index comparisons and transport checks accompany edits.
The runner explicitly stops playback before entering the loader for teardown,
then restarts the same pattern for the comparison without the module. PCM and
audio-ring drop counts are recorded.

Use the existing reconstruction command arguments plus `--fixture` pointing at
the prepared `fixture.json`, and run `audio_fixture_emulator.py` instead of
`reconstruction_emulator.py`. Supply a fresh private `--out`; the emulator,
base and seed inputs remain read-only, and only the new process/card/socket are
used. No physical USB interface is accessed.

## Completed result — 31 October 2026

The complete run passed on named emulator base `2e1a6128…`, package `3e13c46f…`.
Ten PCM windows verified both main channels and all eight expected track tones:
80 track-tone checks, including all four saved patterns, through maximum Lock
and Clear, and after native removal. Expected-frequency energy fractions across
the captured stems were 99.79–99.99%. No audio-ring overwrite was reported.

Complete working/canonical-mirror records and active lock-index bytes matched
after edits. Six live image/site/copy-source attestations passed; all three
opener sites were restored on removal. DSP frames advanced from 47,582 to
106,873 with errors and stalls remaining zero. Two fresh generations from the
same helper revision produced byte-identical cards, with every included WAV
read back by hash.

The [stock-free receipt](evidence/audio-fixture-20261031.json) retains identities,
per-window metrics and the first incomplete run. That run passed its three audio
windows but the loader correctly refused teardown while playback was running.
The final runner stops before entering the loader and restarts for the final
comparison. No firmware or loader rule was changed.

Three synthetic measurement checks separately accepted correct tones and refused
silence and swapped track samples (`python3 -B test_audio_fixture.py`). These
sanity checks do not replace the native captures above. Private fixture bundles
contain the project and all eight WAVs; no binary or project record is committed.

This checks native emulator output. Non-silence and tone identity do not prove
absence of edit-related glitches, physical continuity, CPU cost or total stack
safety. Captured PCM needs separate continuity analysis and physical playback
qualification. A prepared project alone is not a playback pass.

## Physical preflight — 31 October 2026

The sample-inclusive project is installed as `PSLTEST_261031` / `PSL AUDIO TEST`
on the author’s card, with all 60 files verified after transfer. On the MKII’s
public base `2aa35c39…`, DSP execution recovered after an author-performed
restart. The initial post-restart recordings had unconfirmed playback; the
author clarified that PLAY had not been pressed. Their constant values do not
establish a USB audio fault. A repeat with explicitly confirmed advancing,
audible playback passed: all eight expected track tones and all eight tones
in Main were verified in a new three-second USB recording. No test module was
installed. This preflight does not qualify edit continuity, CPU or stack use.
See [physical preparation results](TESTING.md#physical-fixture-preparation--31-october-2026).

`device_audio_preflight.py CAPTURE.wav --out RESULT.json` checks the eight
expected track tones and their presence in Main in a 20-channel, 44.1 kHz
PCM16/PCM32 WAV. It refuses silent output and missing/wrong tones. It reads
host recordings only; provenance and device identity belong in a separate
receipt. A passing tone check alone does not prove glitch-free edits.
