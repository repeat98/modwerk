# Current compatibility candidate

0.0.19-experimental targets published base `462fbd2b…`. The 5 November compatibility audit rechecked the new base and three companion packages before updating their pins. The installer baseline check now accepts that reviewed build; unknown companions still refuse. Hardware validation is pending; follow [HARDWARE_TEST_0.0.19.md](HARDWARE_TEST_0.0.19.md). Earlier dated notes below describe historical states.

# Local Midi Mode 2 site integration

For the private MIDI CC Slots development draft, use
`http://127.0.0.1:5173/?preview=midi-cc-slots` with Python and `m68k-elf`
binutils on the development server's PATH. Its local-only compiler makes a
stock-free trial package and refuses a package digest that differs from the
software-verified local-build.json; the page reviews the connected base and installed
set before an explicit temporary USB trial, with Undo, Keep, removal and
restart verification. Keep saves the whole running set on the installed base.
A resolved Keep call is not proof of persistence: legacy diagnostics may be
missing, and a failed save can leave the module running only until power-off.
Require a completed self-test report before Keep, explicit saved-set diagnostics
and matching module IDs/layouts; require
the startup-restored result separately after reboot. This is not package-byte
readback or saved-project qualification. The page never flashes firmware.
It is outside the public catalogue. See [the draft's instructions and limits](README.md#local-app-installation-and-removal).

The opt-in local draft also has a checked card adapter: the ordinary configuration
builder accepts its reviewed companions and now downloads a USB-capable installer
ZIP: the unchanged standard base plus both initial saved module-set files. The
MIDI USB package stays independently pinned. Its local compiler needs Python and
the reviewed ColdFire tools. Historical C15 resident builds also require the
pinned Elekloader checkout through `MODWERK_ELEKLOADER`. See
[the USB-capable installer guide](USB_CARD_INSTALLER.md).

The unit can report private or newer modules absent from this checkout’s catalogue.
Keep those inventory IDs visible and use a neutral preview when their
documentation/artwork is missing; never dereference catalogue metadata just
because the unit reported a module, or discard unknown entries to render it.



## Opt-in local module drafts

Unqualified experiments can use a development-only catalogue overlay without
editing generated public catalogues or putting them in release module folders.
Midi Mode 2 uses `VITE_LOCAL_CC_SLOTS=1` in ignored `.env.local`, with metadata
in `sdk/drafts/midi-cc-slots/local-module.json` and gating in
`src/dev/local-cc-module.ts`. It preserves the installed runtime ID so inventories
and saved configurations resolve through the normal catalogue.

The Vite development plugin compiles the original source on demand and checks
the pinned package digest before normal Sync preparation checks its header,
capabilities and contents. Serve media through an explicit allowlist. Never
commit packages or firmware inputs. Keep opt-in drafts excluded from production
and default test catalogues, and test the enabled path explicitly. Until a draft
has a native card adapter, reject card builds clearly rather than omitting it.
Catalogue helpers also reach backend code: include shared source and independent
data in `LICENSES/platform.json` under the existing contribution terms.
This local workflow does not satisfy public release or hardware qualification.

Local draft flags in `.env.local` belong to each checkout and do not travel
with Git. When moving a development server to the fork's main checkout, use
the checked feature branch, install its locked dependencies and enable the same
opt-in there. Verify the server's working directory, module metadata/package
digest and media responses after switching, keeping the existing localhost
origin so saved browser configurations remain available.

## 5 November 2026 upstream sync

The local site includes upstream `eaaf60ca` while retaining the 0.0.18 package and its original base pin. The published companion compiler fingerprint changed: card/USB installer composition is intentionally blocked by the existing baseline check until a new combination is reviewed. This sync does not qualify the module for the new base or change installed firmware. The dedicated preview still targets the previously reviewed base.

Sync validation: TypeScript, frontend bundling and ESLint passed (13 existing warnings). The complete Vitest run passed 2,853 tests; local-port/socket restrictions caused additional failures, and all 12 tests across those three server suites passed when rerun with port access. Two local installer-baseline assertions remain failing because they expect the previous reviewed compiler identity. No baseline guard or review pin was relaxed. The module page and package endpoint returned HTTP 200; the served 33,434-byte package reproduced SHA-256 `8d971baca19198b9e35d7644c7c8810f917471f980eadc2db03fab8de3668451`. GitHub readiness was not established: its fetch could not resolve GitHub in the restricted run. This is a local sync, not a release.
