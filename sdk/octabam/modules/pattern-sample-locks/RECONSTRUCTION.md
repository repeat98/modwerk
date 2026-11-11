# Private reconstruction candidate — 30 October 2026

This experiment packages the unchanged 0.1.8 runtime using the SDK's existing
hash-guarded reconstruction mechanism. It remains a draft candidate without
catalogue publication or physical hardware qualification. The subsequent local
host-wrapper integration below supports its declaration; no scanner or loader
acceptance rule was changed.

## Candidate and exact-image proof

The final private package is
`3e13c46fb0054d05f228b045746453e0c50dbbe52fb53b3c229d598ddd7fed79`,
10,048 bytes. Nine stock-copy records reconstruct 107 bytes that coincide with
the original OS. The package stores zero placeholders in their place and guards
each source by SHA-256. It contains no firmware bytes taken from those sources.

Fresh C compilation and committed assembly both match the reference package
`28766a01…`. Replaying the candidate's guarded copies restores that entire
8,748-byte initialized image byte-for-byte; BSS remains 1,328 bytes, with the
same 167 relocations, four UI handlers and three menu openers. Relocated images
also match at three addresses. No Lock/Clear, interrupt-mask or UI behavior was
changed. The package grows by 396 bytes of copy records; this is separate from
the unchanged initialized image/BSS allocation and the still-unqualified total
stack accounting.

The [hash-only candidate declaration](evidence/reconstruction-candidate-recipe-20261030.json)
pins authored source, SDK inputs, the compiled image, source line ranges and
individual copy guards. Its two adjacent label copies avoid the overlap found
in the diagnostic matches. The ordinary standalone adapter validates the recipe
with and without a private stock reader and produces identical results.

## Software checks

- Both unchanged stock-free scanners pass the complete final package, including
  the normal packed-DSP views. Its longest weighted match is 11 (failure begins
  at 12); the separate 16-byte scan finds no forbidden literal run.
- Twelve negative recipe cases are refused: changed source inputs, compiled
  image, span hash, stock bytes, overlapping copies, relocation overlap, image
  bounds, oversized copy, invalid source address, missing provenance, an
  initializer fill and a mismatched authored-file hash.
- The production browser preflight accepts add and removal/Undo packages on all
  seven current base identities and preflights all 29 packages. A companion-only
  selection gains exactly one change when this candidate is added. A base whose
  copy capacity is below nine is refused before fetching.
- Four malformed record variants are refused structurally by browser preflight.
  A wrong source hash and an invalid stock address require the native loader's
  source checks; browser shape acceptance is recorded separately.
- The actual browser base builder rebuilt all seven public layouts from the
  private original OS. Every copy source has its expected hash in every resulting
  MAIN image. The nine sources also avoid all 541 checked write spans from 28
  published runtime packages and 17 native requested groups. This is source-byte
  and declaration compatibility, not simultaneous companion runtime coverage.

## Real-loader failure caught during testing

The first eight-copy candidate (`8c05806d…`) passed scans, reconstruction and
public-base byte comparisons, but the emulator loader refused it as malformed
before publishing anything. One source was at `0x400dfec2`, in the protected
bootloader area. Machine glue permits stock-copy sources only from
`0x40000400` through the byte before `0x400de1e0`.

The final declaration replaces that 16-byte source with two independent
eight-byte copies at `0x40001b18` and `0x40026fd0`, preserving the exact authored
destination bytes. Preparation now checks the machine's source bounds and
declared write overlaps before constructing records. The loader boundary was
left intact. The failed candidate is not counted as a successful lifecycle run.

## Emulator method

`reconstruction_emulator.py` starts the existing capture harness with a separate
process, socket and copied card. Read-only mounts provide its emulator, named
base and seed card; no physical USB interface is available.

Before the valid upload, the wrapper submits six deliberately malformed packages
through the real native USB loader. It requires upload refusal, the expected
native reason, unchanged active identity/generation and unchanged opener sites.
It then runs the existing live playback, maximum Lock/Clear, stopped/refused edit,
native project save/reload, removal, reinstallation and Undo checks.

For each attestation, every copy source is read from the live emulator and
hash-checked. Reconstructed bytes must equal the original reference image.
Only then does the unchanged original attestation compare every initialized
live byte and all three patched sites. Instruction watches reuse the original
offsets only after exact reconstruction and assembly-hash checks; model times
remain emulator observations, not physical CPU bounds.

Completed results and the exact emulator/base identities are retained in the
[combined receipt](evidence/reconstruction-local-20261030.json). Hardware audio,
physical timing, full stack qualification and first-release owner approval
remain separate work. Card UI was subsequently deferred for the author's
[USB-only first-beta scope](USB_BETA.md).

The completed run passed on emulator base `2e1a6128…`: all six malformed
packages were refused before publication, then the valid candidate installed in
the same session. Four attestations checked all 8,748 initialized live bytes,
all three opener sites and all nine live copy-source hashes. Live maximum Lock
and Clear changed 512 fields each, with complete pattern/mirror comparisons.
Pattern switching, recording refusal and stopped-state preservation passed.
Native Save/Reload Project restored the locks and preserved RAM preferences;
removal with the selector open, reinstallation, reset defaults and the
reinstalled trial's Undo also passed. Keep was confined to the copied emulator
card; no physical device was accessed.

DSP frames advanced from 44,149 to 276,660, with errors and stalls both remaining
zero. The dedicated playback interval advanced 82,892 native frames (over 30
model seconds). The cached CPU meter was saturated with and without the module,
so no isolated CPU percentage is inferred. These are neither audible continuity
nor physical timing results. The seven public-base builds above establish source
bytes and preflight, not this runtime coverage on those newer bases.

Two intermediate runs completed the refusal checks but stopped on harness
transaction mistakes: LEAVE must name the last offer, and later offers must
increase beyond the probe range. The final wrapper reserves 100–105 for probes
and a higher range for lifecycle offers. Those incomplete runs are retained in
the receipt and are not counted as completed lifecycle passes.

## Reproduce privately

In the pinned source-tools container, with read-only source at `/work`, verified
Elekloader at `/upstream`, and private inputs/output at `/out`:

```sh
python3 -B sdk/drafts/pattern-sample-locks/prepare_reconstruction.py \
  --out /out/new-reconstruction --stock /out/stock/original-1.40C.bin \
  --upstream /upstream --reference-package /out/v018/pattern-sample-locks-v018.mwrm \
  --reference-profile /out/apply-profile-20261030/symbols/symbols.json
```

Use Node 24 and installed checkout dependencies for the browser components:

```sh
node sdk/drafts/pattern-sample-locks/reconstruction_browser.mjs \
  /absolute/private/new-reconstruction /absolute/private/original-1.40C.bin
python3 -B sdk/drafts/pattern-sample-locks/reconstruction_sources.py \
  --candidate /absolute/private/new-reconstruction
```

Run the emulator wrapper with the capture harness's private `--emulator`, `--base`,
`--card`, `--package`, `--profile-symbols`, `--live-playback` and fresh `--out`
arguments, plus `--reference-package` and `--negative-packages` from preparation.
Use a short output mount for its Unix socket. Keep cards, firmware, objects,
packages and raw logs outside Git.

## Normal package path — 31 October 2026

The host wrapper supports an ordinary ColdFire package's SDK-owned recipe in
`module-adapters/reconstruction-recipes.json` with an explicit
`reconstruction: true` manifest entry. The declaration pins reviewed build and
provenance inputs, shared SDK sources, the original image
and the complete tested package. Existing standalone admission and all
base-pinned SDK files remain unchanged. See the
[builder contract](../../../docs/OCTATRACK_RECONSTRUCTION.md).

`verify_public_package.py` stages a disposable SDK/catalogue fixture outside Git
and calls the normal public CLI, rather than the lower-level preparation API.
Build and `--check` both pass the unchanged stock scans and produce the exact
10,048-byte `3e13c46f…` package already exercised by the emulator lifecycle above.
Five CLI probes refuse changed native source, a protected bootloader source,
a changed final-package pin, foreign provenance and removal of the explicit
opt-in (which exposes the original strict-scan failure). All fixture inputs are
restored afterward. The real catalogue remains untouched.

The existing public-package `--check` rebuilt all 26 non-lagged packages
byte-identically and preserved the two declared version lags. The full SDK
suite completed 498 tests with 69 skips, including four new reconstruction
groups. Upload/transport host checks and the native recipe suite also passed
(39 tests, two skips). The stock-free
[combined receipt](evidence/public-package-path-20261031.json) records exact
inputs, outcomes and harness corrections. These are software checks only.

Reproduce with private stock and the already tested candidate:

```sh
python3 -B sdk/drafts/pattern-sample-locks/verify_public_package.py \
  --out /out/new-public-path --stock /out/stock/original-1.40C.bin \
  --upstream /upstream \
  --tested-package /out/reconstruction-20261030/candidate3/pattern-sample-locks-0.1.8-candidate.mwrm
```

This local integration grants no publication approval and adds no physical
qualification. Physical timing/stack bounds and release review remain; card UI
is deferred under the author's USB-only first-beta scope.
