# Native/browser comparison scope — 5 November 2026

This stock-free investigation records the applicable offline comparison for
the USB-only Pattern Sample Locks draft and why the card verifier is not its
tool. No firmware, extracted stock, or generated catalogue file was added or
changed; no hardware was accessed.

## Exact identities

- Candidate source revision: `5a15ac390dac2475df3fb3b2ef64154e174b4182`.
- Current native-source inventory SHA-256: `7ea0fbdf317bfdab6a82b22869c7029ba23901cd27a3337a4bdaf8f8beeb7e69`
  (62 included files; documentation and evidence paths are excluded).
- Candidate USB package: 10,048 bytes, SHA-256
  `3e13c46fb0054d05f228b045746453e0c50dbbe52fb53b3c229d598ddd7fed79`.
- Reproduced base configuration SHA-256: `9680e9ac861ff9313ce4f7a710a37ad2aa8e9b50b2cf8c043dafa2a0b78cdffc`;
  private reconstructed `MAIN.raw` SHA-256 `877a8d6884cb05508a59b312a0e95498c33ce4a1e2f1fe452423b0edc74fb69e`.
  The author-reported hardware trial includes only an IDENTIFY configuration SHA;
  no physical MAIN hash is available for equality comparison.
- Matching stock OS 1.40C MAIN SHA-256:
  `164f31224bf61181e3f50e7dec40df9afcae5b16dbf6e4c0d0cc5e986af0a84e`.

The source inventory was recomputed from the current draft manifest and source
tree. The package hash was rechecked from the existing private device fixture;
these checks do not rebuild the package or repeat its wrapper/USB preflights.

## Applicable offline comparison and existing result

`src/catalog/native-comparisons.test.ts` skips a module when
`moduleCardless(id)` is true, with the source comment: “no card form to compare;
octatrack:module-packages --check rebuilds its USB package.”
`src/catalog/usb-only.ts` derives `moduleCardless` from an explicit `usbOnly`
package declaration or source-built package entry. Thus the supported
module-specific offline comparison for this declared scope is the native USB
package builder's normal build/check, not a fabricated card-composition record.
Pattern Sample Locks is still absent from `MODULES` and the public USB package
asset, so the repository-wide comparison test currently iterates over no row
for this draft. The private wrapper fixture exercises its candidate package
without changing either generated asset or treating it as admitted.

That comparison already ran in the private catalogue fixture. The existing
[public-package receipt](public-package-path-20261031.json) records a normal
public build and check of the exact 10,048-byte package, both stock scans,
five negative CLI refusals, and pinned toolchain image
`sha256:da70d46e10b243277fa3ae2e015f7258d56b3ee08ca4be47e61899958872e792`.
The five refused cases were changed native source with unchanged assembled
instructions, protected bootloader source, changed package pin, foreign source
provenance, and missing reconstruction opt-in (which exposed the strict-scan
refusal).
The [USB scope receipt](usb-beta-scope-20261031.json) binds the same package
hash and confirms it is byte-identical to the emulator-tested artifact. Its
browser-side fixture also passed library/card refusal, source-inventory parity,
add/removal Undo preflight on seven public base identities and all 29 package
preflights. The helper and native package builder hashes are recorded in
those receipts. Because these checks already passed for the exact package,
they were not rerun. Together they verify native package reproducibility,
refusal behavior and browser USB delivery preflights; they do not claim
simultaneous companion runtime coverage, card composer parity, physical
hardware evidence, or catalogue admission.

The separate `beta_package_parity.mjs` is a private component fixture: it uses
an in-memory catalogue edit, checks USB loading and a browser ColdFire-linker
component, and marks `completeCardCompositionTested: false`. Its available
private browser-parity receipt is for an earlier 9,652-byte package
(`28766a017005e664d00620d3831fc81af7449c95e1896a17121ca8fc2d306d8d`), not
this exact candidate. It is not substituted for the official cardless package
check.

## `module:verify` behavior and result

`docs/ADD_A_MODULE.md`, step 5, defines `module:verify` as a native octabam
static card-composition run plus browser comparison over module-alone,
companion, fuller-selection and refusal cases. The verifier first requires an
entry in `sdk/catalog.json`, then parses
`sdk/octabam/modules/<id>/octamod.module.json`, then requires the module to be
offered in `AVAILABLE_MODULES`. This standard card comparison does not operate
on a USB `.mwrm` package or the USB runtime-pool lifecycle.

Using Node 24.22.1, the ordinary command was run with the private original OS
file:

```sh
npm run module:verify -- pattern-sample-locks --os /Users/weiyun.wang/.cache/modwerk-pattern-sample-locks/stock/original-1.40C.bin
```

It exited 1 at the first catalogue guard with:

```text
pattern-sample-locks is not in sdk/catalog.json. List it there first (docs/ADD_A_MODULE.md, step 4).
```

The current tree has neither the catalogue entry nor the native module folder.
Consequently, this exact invocation does not reach the later “is paused; it is
not offered” guard; the draft ID is not in `PAUSED_MODULE_IDS`. No Docker image,
native selection, generated metadata, comparison record or pair file was
produced. The “paused” error is not the current failure and is not a necessary
step for the supported cardless package check.

## Prerequisite and next step

`docs/MODULE_QUALIFICATION.md` requires new modules to bind complete resource
measurements, hardware evidence and documentation to the exact version/source.
The package comparison is therefore complete but does not qualify the release:
the current module record still labels complete stack/interrupt and cost
qualification incomplete, and `USB_BETA.md` leaves first-release review open.
The smallest safe next step is to keep the candidate unlisted while the
remaining qualification and first-release owner review are completed. If the
module later gains a card form, complete the version-bound requirements before
normal catalogue admission and `module:verify`; adding a catalogue row alone is
not a valid comparison.
