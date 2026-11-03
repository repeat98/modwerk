# Modwerk SDK

To add, port or update a module, follow [Add or port a module](../docs/ADD_A_MODULE.md). This page describes what is in `sdk/`. For machine profiles, contract v3 and evidence tiers, see [the SDK guide](../docs/SDK.md).

| Machine | Platform | Guide |
| --- | --- | --- |
| Octatrack MKI/MKII | octabam | [machines/octatrack](machines/octatrack/README.md) |
| Digitakt mk1 | elemod (preview) | [machines/digitakt](machines/digitakt/README.md) |
| Digitone mk1 and Keys | elemod (preview) | [machines/digitone](machines/digitone/README.md) |
| Every other machine | — | [Add a machine](../docs/ADD_A_MACHINE.md) |

## Layout

| Path | What |
| --- | --- |
| `octabam/` | octabam's builder, tools and platform runtime, from [octabam](https://github.com/sambanks/octabam) (MIT; credits in `octabam/LICENSE` and `octabam/THIRD_PARTY.md`), pinned in [UPSTREAM.json](UPSTREAM.json) |
| `octabam/modules/<id>/` | Octatrack modules: source, `manifest.py`, `octamod.module.json`, docs, media |
| `octabam/platform/` | internal stock-loader and USB MIDI infrastructure, not public modules |
| `digitakt/`, `digitone/`, `elemod/` | Digitakt and Digitone cores and modules |
| `drafts/<id>/` | modules staged outside the catalog until they qualify |
| `catalog.json` | the Octatrack modules the site offers, each at an exact version |
| `imports/` | ported source history: repository, commit and file hashes; code and preserved upstream files stay exact, while local module README, TESTING and CPU guides can be edited without checksum updates |
| `templates/` | what `npm run module:new` copies |
| `build/Dockerfile` | the pinned, firmware-free toolchain that compiles module packages |
| `module-qualification-baseline.json`, `module-release-waivers.json`, `*-build-approval.json` | owner-approved exceptions, each bound to exact versions and hashes ([qualification](../docs/MODULE_QUALIFICATION.md)) |

The shared builder now admits Analog BD with Mini Verb, Tape Echo, Euclid, TapeHead and Sidechain Compressor, subject to actual DSP and menu capacity. The engine and shared reverb helper have explicit reservations on both cores; Tape Echo fits in the remaining Spring Reverb gap, while larger inserts use the fewest additional reverb regions that fit. This supersedes the stock-effects-only restriction in the historical module releases and composition proofs. Module algorithms and versioned hardware evidence are unchanged; these new combinations have composition verification, not new hardware qualification. See [the current verification record](../docs/VERIFICATION.md#analog-bd-with-custom-effects--7-october-2026).

## Octatrack native development

Native work needs Python 3.12+, CMake, the patched DSP56300 assembler and disassembler, GNU `m68k-elf` tools and your own original OS 1.40C, kept outside the repository. Read `octabam/docs/remixer/MODULES.md` and `PLACEMENT.md` before changing memory claims. Do not run unreviewed manifests on a trusted computer: compile them in isolation, without credentials. The current preserved upstream sources use newer f-string syntax: the full SDK suite ran with Homebrew Python 3.14 here, while macOS system Python 3.9 cannot parse them. Helpers that temporarily add adapter directories to `sys.path` must restore it before the separate Octabam tests import their own `build` module.

Stock code that modules depend on is described by address, length and SHA-256 guards. `stock_guard.py` reads your own extraction and fails closed when it is missing or altered. `npm run sdk:check` covers those guards with synthetic fixtures, without firmware or an emulator.

### Native verifiers

Each verifier compares Modwerk's browser builder with native octabam on your own firmware. They run locally, never in CI, and keep no firmware in the checkout.

| Script | Compares |
| --- | --- |
| `npm run module:verify -- <id> --os <OS update>` | any module, on its coverage set, in the toolchain image; writes `native-comparisons/<id>.json`. `--all --check` repeats the browser side of every record |
| `scripts/verify-sdk-native.py --raw-os <MAIN OS> --vendor <tools>` | the original seven modules and the loader |
| `scripts/verify-requested-native.mjs <OS update> <proofs>` | Analog BD, MIDI Scenes, USB Audio and Scale Quantizer |
| `scripts/verify-utility-native.mjs <OS update> <proofs> <packaging>` | every subset of the buildable modules with CC Map and Preview Vol |
| `scripts/verify-tapehead-native.mjs <OS update> [all\|requested\|utilities]` | TapeHead selections |
| `scripts/verify-sidechain-native.mjs <OS update> [--shard=i/n]` | every selection containing Sidechain Compressor |

Results and their coverage are recorded in each module's `TESTING.md`; those up to 25 October 2026 also in [VERIFICATION.md](../docs/VERIFICATION.md). A matching image is proof of composition, not of hardware safety.

## Versions and approval

Every module has a semantic version. Any change to its code needs a strictly higher one (documentation and media edits do not), and `sdk/catalog.json` pins the exact version the site offers. The owner merging the pull request approves it. After the merge, automation compiles the merged commit and publishes only if it reproduces the committed packages; a failed build keeps the previous release.
