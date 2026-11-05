# Production package and USB integration check — 5 November 2026

## Result and exact inputs

The normal public Octatrack package wrapper built and checked Pattern Sample
Locks in a private candidate-only catalogue fixture. Both package-build stock
scans passed, and the generated 10,048-byte package was byte-identical to the
existing tested candidate. The existing production USB integration fixture
also passed. These are host/software checks; they do not qualify hardware or
first release.

- Candidate checkout at the run: `91d8d493aecea91ae9f4cc9857393e3e06535743`.
- Then-current Modwerk `upstream/main` base: `3ae8c38d1b1bba48e3ca4368f83dffd5ff70b724`.
- Candidate native-source inventory fingerprint: `7ea0fbdf317bfdab6a82b22869c7029ba23901cd27a3337a4bdaf8f8beeb7e69` (62 files; rechecked on the follow-up documentation branch).
- Candidate package: SHA-256 `3e13c46fb0054d05f228b045746453e0c50dbbe52fb53b3c229d598ddd7fed79`, 10,048 bytes.
- Private original Octatrack OS 1.40C input: SHA-256 `34695b606eb00e1b4dded5fd0c4b66f3a460522a632e47d7416dbd220599e1ad`; no firmware bytes or extracted data are in this repository.
- Octabam developer checkout: `5f8e779fa9e8dcf5f36b2b62f7f80c7309daced4`, matching the SDK tool pin. Its only tracked checkout edits matched the reviewed local host-tool repairs.
- Actual `--upstream` input: Elekloader checkout `3b31ef3c0e43c810e3acd0be6257e2484b20fc40`, matching the vendored kit pin. At the verification commit, the vendored kit check passed at version 0.7.0/protocol 1 and catalog revision `ca38e91` (56 mods, 65 site assets).
- Host tools: Node `v24.22.1`; Python `3.15.0`; native Mach-O arm64 `m68k-elf-gcc` 16.2.0, SHA-256 `18f7e56184cf3d1b14822fbbd56a2a67e7840f499a3cf615290661f7da08275c`; GNU `m68k-elf-as` 2.47.20260726, SHA-256 `b8ec136401ac83b6b7196d49188d1d6fac115cb83be85d336b15d0d3be17b61a`; patched `dsp_asm`, SHA-256 `cc3230fd10a9294cfe24c172bd755334995dc7542a8830f0294552e10f6209d4`.
- Package inputs: `scripts/octatrack-module-packages.py` SHA-256 `fe7e191621b16b31ce997b6c5d8b60af467206138d758c47e7d4662a8a9ad78b`; `scripts/octatrack-reconstruction.py` SHA-256 `8718956033e620cfc22d3047b8adbc5708e687133a67ff94e09c5a807fbff3a9`; `sdk/machines/octatrack/module-adapters/reconstruction-recipes.json` SHA-256 `e4fd34d65e2b8e88695ab7fe2da38d1905773cfe57ee391264c3c8b70a7f8559`.

## Reproduction

The completed build used the normal public wrapper with a private candidate-only
catalogue. Its `--upstream` argument must name Elekloader: the first attempt
pointed it at `~/.cache/modwerk-upstream/octabam` and stopped before packaging
with `ModuleNotFoundError: No module named 'elekloader'`. The corrected run used
the pinned Elekloader checkout shown below; this was an input-path correction,
not a source or package mismatch.

```sh
TOOLCHAIN="$HOME/.cache/modwerk-m68k-toolchain-16.2.0"
NODE24="$HOME/.nvm/versions/node/v24.22.1/bin"
OUT="$HOME/.cache/psl-source-bound-profile-20261103/stock-bound-20261104/public-path-after-133-upstream-20261105-task-a47797b50da2-elekloader-pin"
ELEKLOADER_DSP_ASM="$TOOLCHAIN/octabam-dsp-build-5f8e779/vendor/dsp56300/build/source/dsp_host/dsp_asm"

env -u MODWERK_BOARD ELEKLOADER_DSP_ASM="$ELEKLOADER_DSP_ASM" \
  PATH="$TOOLCHAIN/prefix/bin:$NODE24:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin" \
  python3 -B sdk/drafts/pattern-sample-locks/verify_public_package.py \
  --out "$OUT" \
  --stock "$HOME/Downloads/OCTATRACK_OS1/OCTATRACK_OS1.40C.bin" \
  --upstream "$HOME/.cache/modwerk-upstream/elekloader" \
  --tested-package "$HOME/.cache/psl-source-bound-profile-20261103/stock-bound-20261104/public-path-current-main/pattern-sample-locks-0.1.8-public-path.mwrm"

env -u MODWERK_BOARD \
  PATH="$NODE24:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin" \
  "$NODE24/node" sdk/drafts/pattern-sample-locks/usb_beta_scope.mjs "$OUT"
```

`verify_public_package.py` requires `--out` to be a new private directory for a
fresh run. The completed run's output directory is the value above; its report
hashes and the package hash are recorded below. The production catalogue and
tracked source tree were not modified by either fixture.

## Checks and private reports

The public wrapper build and `--check` both passed with both stock scans. All
five expected refusal probes passed (exit 1): changed native source with
unchanged assembled instructions, protected bootloader source, changed final
package pin, foreign source provenance, and missing reconstruction opt-in
(strict stock-scan refusal). Test/diagnostic-only edits left output identical,
and native inputs were restored after the probes.

The USB fixture confirmed the candidate stays USB-only and excluded from card
compiler versions/sources, the existing card-source fingerprint is unchanged,
classic-library selection is blocked, and beta library selection allows USB.
Candidate add/removal Undo preflights passed on all seven public base identities;
all 30 packages passed the combined preflight. Simultaneous runtime companions
were not tested.

The private files remain outside Git at `~/.cache/psl-source-bound-profile-20261103/stock-bound-20261104/public-path-after-133-upstream-20261105-task-a47797b50da2-elekloader-pin/`:

- `public-path.json`, SHA-256 `cc6422ce5f6c666ed1e73d77220f16f6df47db6f237e8c1e1af9b05566907be2`.
- `usb-beta-scope.json`, SHA-256 `888b5fd050490e7e14e9d748d87ce815ed657c34d793962bbf29f1bcbec03ecd`.
- `pattern-sample-locks-0.1.8-public-path.mwrm`, SHA-256 `3e13c46fb0054d05f228b045746453e0c50dbbe52fb53b3c229d598ddd7fed79`.
- Private build helper `verify_public_package.py`, SHA-256 `3589a5de5dafb1068733ab1b11c4185896736f0cc3bac8488ae37be80af8e190`; USB fixture helper `usb_beta_scope.mjs`, SHA-256 `645fd56b7d5c8223b12435947eeaa939e605585519f4dcea10ff5273140253d2`.

## Base movement and limits

After the check, `upstream/main` advanced from the tested base `3ae8c38d` to
`884aca3a2a2d75d095ea388bd84a78e251dde8ee` by merging PR #1235, then to
`4c8566b8c963be6401910f19de636137101cafee` and
`8a547f4ac1f114260a5b598a52084a8287d960bd` before readiness validation. PR
#1222's intervening change added the Analog Rytm Quick Fill Trig Conditions
Elekloader overlay and import record; PR #1237 changed only the hook-registry
guide and its changelog. Across these updates, the Octatrack package manifest,
candidate native source, reconstruction recipe, loader/runtime, package
builder and Elekloader kit/tool source did not change. The new Rytm overlay
updates the separate Elekloader site catalog, regenerated on the follow-up
branch as revision `568b623` (57 mods, 66 assets); that overlay is outside the
Octatrack candidate-only fixture and its 30-package preflight. This report
remains bound to checkout `91d8d493` and tested base `3ae8c38d`; it is not
represented as a new build at current `upstream/main` `8a547f4a`.

This closes only the production package-path and USB software-integration
check. It adds no hardware result, simultaneous-companion result, cycle bound,
complete stack/memory bound, measured CPU budget, or edited-pattern persistence
result. The reported MKII trial remains bound only to a unit reporting
configuration SHA-256 `9680e9ac861ff9313ce4f7a710a37ad2aa8e9b50b2cf8c043dafa2a0b78cdffc`; no physical MAIN hash/readback was captured. The separate high-load report retains unexplained SAMPLE changes on one pattern, with cause unknown. Worst-case ColdFire cycles, complete shared-stack/memory accounting, applicable performance/stress coverage, edited-pattern persistence, public catalogue/changelog/site integration and first-release owner review remain open; the separate owner release-path answers requested in [PR #1088](https://github.com/repeat98/modwerk/pull/1088#issuecomment-6655933465) are pending.
