# USB-only first-beta scope — 31 October 2026

The author selected **USB-only first beta** after the card audit established
that the existing card compiler does not supply this module's four shared UI
callbacks. Card support is deferred. This is a private candidate scope, not
publication approval or a hardware waiver.

The candidate entry uses `octabam: true`, `unitName: "SAMPLE LOCKS"`,
`reconstruction: true` and `usbOnly: true`. The explicit distribution flag uses
the existing USB-only library and card-download refusal path. The native card
compiler and source importer exclude the module from their compiled-version
and source inventories. Without USB beta access, the library explains why it
cannot be added; with access, it remains available for USB sync. A card download
containing it is refused before composition.

`verify_public_package.py` builds/checks the candidate through the normal CLI
in a disposable catalogue fixture. Its output remains exactly
`3e13c46fb0054d05f228b045746453e0c50dbbe52fb53b3c229d598ddd7fed79`,
the 10,048-byte reconstructed package already exercised in the emulator.
Changing distribution metadata changes no initialized code/data, BSS,
relocation, callback or opener site. No new emulator or hardware runtime
result is inferred.

`usb_beta_scope.mjs` exercises production library/refusal, source-inventory and
USB-preflight components using that fixture. It checks both card-refusal
messages, classic-library blocking, beta-library selection, unchanged existing
card compiler source/version scope, add/removal Undo on all seven public base
identities and preflight of all 29 packages. This is not simultaneous companion
runtime coverage. The real catalogue remains untouched.

Run the normal public-path helper as documented in [RECONSTRUCTION.md](RECONSTRUCTION.md),
then, with Node 24 and checkout dependencies:

```sh
node sdk/drafts/pattern-sample-locks/usb_beta_scope.mjs /absolute/private/public-path
```

The shared card source compiler was rebuilt and its output passed the normal
importer's `--verify-existing` comparison. Existing package contents are
unchanged; generated development provenance records the changed compiler with
no release approval. Four provenance-only asset hashes were refreshed in the
existing Tape Echo/Euclid reconstruction declarations; their spans and image
pins stay unchanged.

Remaining work is exact-package physical qualification on a named base,
including practical playback/load tests and complete stack/timing assessment,
then release review and green pre-push checks. The first-release reviewer must
approve the USB-only scope. Card UI and card hardware results are not claimed.
No push, publication or physical device access occurred in this follow-up.

The [stock-free receipt](evidence/usb-beta-scope-20261031.json) records source
hashes and the completed checks: 340 frontend test files (2,766 tests passed,
one skipped), 498 SDK tests (69 skipped), typecheck, lint (zero errors, eleven
warnings), compatibility and licence checks. All 26 non-lagged published USB
packages rebuild identically; the two declared version lags are preserved.
Intermediate workspace/fixture failures and their corrections are retained.
