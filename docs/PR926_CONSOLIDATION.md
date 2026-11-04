# FRACT single-PR consolidation

## Objective and completion criteria

Keep one active submission: update draft PR #926 with the current three-grain
track-machine source, native FLEX fix, approved preview and three emulator
screenshots; then close #1108 as superseded. No new PR and no device writes.
Replace the obsolete effect tree through a descendant commit (no force push).
Keep experimental/release qualification limits explicit.

## Baseline

- Current main checked 2026-11-04: 5f28c9a8fdfdbea439cd21dc44267db702fc7f77.
- #926 original head: 213373e16d69578081d55016c2f6563108018a79.
- #1108 head: 7a57fba3477c78f2590a796549b0f3bdba3fd99c.
- Consolidation branch starts at #1108 and merges #926 ancestry with the
  current-main tree. Media and native FLEX fix are already inherited.
- Accepted private source is in the sibling fract-centered-size-20261102
  checkout, including its uncommitted centered-SIZE/UI changes. Preserve it.

## Current work

Source and owned helpers are in `sdk/drafts/fract-machine`; frozen host-only
reference code is in `sdk/tests/fixtures/fract_reference`. The current engine
is tested separately from that oracle. Current main has START but does not
preserve FR:1 at boot; the guarded private builder refuses such a base. This
draft does not change that shared registry or claim a catalogue release.

## Implementation requirements

POS moves left-to-right; SIZE grows around the center and wraps source edges.
Three grains; MAIN POS SIZE REVS SPRD SHPE PTCH, SETUP PAN/SRNG; native pitch
neutral 64. One owner T1-T4; no FX2 or SPACE active implementation. Finite AMP
envelopes silence; INF sustains. Include module-owned helpers and a clearly
labelled host-only frozen differential oracle. Keep firmware, samples and raw
captures out of Git. The public tree must contain a reproducible source check
and honest build/release instructions rather than a broken private builder.

## Validation and remaining actions

Host suite: 47 tests, OK with four archived transport tests skipped. The
boot fixture explicitly models proposed FR:1 support, not the public base.
Independent centered coordinate/UI tests and detailed CPU phase checks use
the current engine. A ColdFire source-only check must compile the actual draft
units; the old FX oracle is never a release artifact.

EGM implementation-readiness and codebase reviews identified the boot boundary,
metadata, source-check, active-engine and publication-order gaps; the draft
documentation and tests are being updated accordingly. The unlisted draft is
expected to fail catalogue/package/qualification lines in module:doctor; record
the actual results rather than changing gates. Before publishing: run source
compile and doctor; commit all source, fixtures, approved preview and three
screenshots; run pr:ready on the clean commit and reproduce native packages;
run Jev deep and investigate available findings. Recheck upstream, push the
descendant to ex1010:fract-submission, verify remote and CI, update the #926
description and #1108 explanation, and close #1108 only after verifying that
#926 contains its native FLEX fix. Media resides in `docs/media/fract/`; no
sample audio, firmware or raw captures are included.

Hardware evidence is limited to the user's short test of the private paired
build: sound, three grains, centered SIZE, CPU about 80%, no crackle reported.
Long stress, physical live-trigger deletion, and exact-public-build testing
are NOT verified. This remains a draft submission until release integration
and hardware qualification are complete.

## Source-validation checkpoint, 4 November 2026

The normal firmware-free gate compiles 10 C units and one assembler unit,
links synthetic base imports at two origins and rejects obsolete FX/SPACE
symbols. It reports 30,368 image bytes, 640 BSS bytes and 225 relocations.
Normal, CPU-profile and detailed-profile checks pass. The same gate also
passes from the temporary `sdk/octabam/modules/` location used by draft doctor.
These are synthetic compile/link results, not installed memory/cycle budgets.

The source-check filename and verifier/documentation now agree. The zero-span
callback regression now executes its binary, and that test plus the saved-word
roundtrip test select the active engine. The CPU test file passes all 10 tests.
The active grain, pitch, kernel, UI and control paths were compared with the
preserved centered-SIZE checkout; the consolidation does not redesign audio.
Approved artwork is also present at the draft's `presentation/thumbnail.svg`.
All four preview images were inspected; the sample-browser caption was corrected
to describe its actual contents without claiming it displays SAMPLE001.WAV.
The module claim is held by ex1010 and linked to #926.

Draft doctor remains red for absent catalogue/release qualification, USB package,
native comparison, pair declarations and package fingerprint. These are release
integration gaps, not successful device qualification. Its category, thumbnail,
UI claims and declaration-only cross-compatibility checks pass. A clean full
`pr:ready` and isolated package reproduction are required before pushing; record
their exact committed-head results in the PR, without weakening doctor or gates.

## Jev review and independent investigation

Deep review against main `5f28c9a8` passed both configured deterministic checks.
Jev classified 16/494 parsed chunks: zero flags and 16 uncertainties. After the
test repair, recheck classified two changed chunks and reused 14 cached results;
the ledger still contains 16 uncertainties, 478 unreviewed parsed chunks and
10 file blockers (488 deferred items total), plus 23 static-only exclusions.
The summary omitted 482 attention entries and 21 exclusion entries; the full
location ledger was inspected selectively. This is partial review, not a pass
or complete coverage; deferred fragments have not all been manually audited.

All 16 classified locations were investigated with their callers and fixtures:

- Native-reader test helpers and main: the registry and renderer share the
  actual modeled voice byte. Both frame halves retain an opted-in voice;
  refused/unpaid/malformed paths still stop it. Admission requires START and
  aligned initialized-image render/START entries. The shared ABI stays 80 bytes.
- Private builder and draft manifests: exact base identity, source/hash checks,
  stock-copy bounds/ownership and reconstruction are explicit; unsupported
  public FR:1 boot behavior is refused. Metadata declares an unlisted pending
  draft, not a public package. Private rebuilding/lifecycle remain unqualified.
- Native-view, zero-span, centered-size and page-coordinate tests: fixtures run
  under sanitizers with exit checks; the missing zero-span execution was fixed.
  Coordinates cover every admitted frame in four formats. Proposed FR:1 boot
  preservation is tested separately from the unchanged public live registry.
- Scalar, waveform-cache, recipe and profile fixtures: scalar execution/state
  comparison, bounded PCM/page cases, denied stock-copy spans and nonoverlapping
  timing windows are exercised. The oracle's shared-header limitation remains
  documented; fake timer ticks are not physical cycles.
- PAN helper: independent random state, bounded gains and the admitted 0–127
  control range were checked against the engine and full-scale fixture bounds.

Parser-blocked UI, registration, render, pool, registry and host-fixture code
was read with the relevant source/registry tests. Shape/window data and the
assembler were compared with retained authored sources and compiled normally.
Generated header/base/variant data require supported generator and package
reproduction checks, not Jev. Documentation/licences and approved media were
inspected separately. No exact-public hardware claim follows from this.
