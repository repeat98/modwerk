# FRACT source draft

Version 0.1.1-experimental · author @ex1010

## Overview

FRACT is a three-grain sample track machine. POS moves through the sample from
left to right; SIZE expands the grain span around that center and wraps at the
sample edges. It uses native FLEX for pitch and voice playback. This replaces
the earlier FX2/SPACE proposal in the consolidated draft submission #926.

This folder stages a USB-only release candidate. It is not yet a selectable
module or qualified public download. The prospective package is reproducible
without firmware; `release/README.md` lists the remaining publication steps.
The source provenance baseline is ex1010/modwerk commit
`5b5aa328c1bbed129ab6b1a65efb9353b93ede8f`, with accepted uncommitted
centered-SIZE/UI edits and the consolidation changes in this branch. That pin
identifies the baseline, not byte identity or hardware evidence for this tree.

## Controls

All numeric controls use 0–127 saved values; PTCH retains native FLEX's formatter
and bounded pitch editor. Defaults below are the saved values.

| Page | Control | Default | Behavior |
| --- | --- | --- | --- |
| MAIN A | POS | 18 | Grain center, left to right across the source. |
| MAIN B | SIZE | 86 | Grain duration/span, expanding around POS and wrapping at edges. |
| MAIN C | REVS | 127 | Forward probability: 127 forward, 0 reverse, intermediate values mix directions at grain births. |
| MAIN D | SPRD | 0 | Random displacement of grain centers around POS. |
| MAIN E | SHPE | 64 | Grain window shape; short sizes constrain available shapes. |
| MAIN F | PTCH | 64 | Native FLEX pitch; 64 is neutral. |
| SETUP A | PAN | 0 | Random grain stereo width; 0 keeps both channels balanced. |
| SETUP C | SRNG | FULL | Spread range: FULL source, or LOCAL capped at 88,200 source frames. |

Three grains overlap at fixed maximum density. Finite AMP envelopes silence the
voice; INF sustains. Disabled SETUP slots are not user controls. There is no
active SPACE processor or FX2 effect.

## Usage

On a compatible private paired build, select one track T1–T4, open SRC SETUP and
choose FRACT. Open its sample browser and select a loaded FLEX-pool sample.
Return to MAIN for POS/SIZE and the remaining controls. Only one FRACT owner is
admitted at a time. The instructions describe the private prototype interface;
this source draft cannot be installed from the public configurator.

## Quick tutorial

1. On a compatible private paired build, choose FRACT in SRC SETUP on T1 and load a FLEX sample.
2. Open MAIN, keep PTCH at 64, move POS, then increase SIZE to expand the span around the center.
3. Play the track, try SPRD and REVS, then stop playback and select a stock machine to leave FRACT.

## Compatibility and limitations

Target OS is Octatrack 1.40C. The registry has eight audio-track slots; the
current FRACT admission policy allows one owner on T1–T4 only. This is an
intentional private prototype limit, not eight simultaneous instances.

START dispatch from #1029 is merged. The inherited native-FLEX reader fix is
included with the source and media in merged #926; #1108 was closed as
superseded by that consolidation. The base keeps FR:1 at boot (`known[]`, added in #926). On 5 November 2026,
the owner completed the short physical check on base `9b3ba417` with a private
paired FRACT build; USB confirmed that exact base and module set after power-on.
See TESTING.md for identities, reported observations and limits. No catalogue
entry, listed USB/card package, compatibility pair proof or listed-release
hardware qualification exists.

Part/project reload, cold boot, Keep/Undo, replacement/removal, missing-module
fallback, live-trigger deletion, stress and companion-module qualification remain
open for the exact public build. Do not infer these from host tests or previews.

## Tests and measurements

See [TESTING.md](TESTING.md). From the repository root, with the ColdFire
toolchain on PATH, run:

```sh
python3 -B sdk/drafts/fract-machine/verify.py
python3 -B sdk/drafts/fract-machine/check_source.py --cpu-profile
python3 -B sdk/drafts/fract-machine/check_source.py --cpu-profile --cpu-profile-detail
python3 -B -m unittest discover -s sdk/tests -p 'test_fract*.py'
npm run module:doctor -- --draft fract-machine
```

The gate runs the firmware-free source check. It compiles the current engine and
assembly, checks code generation/imports and links at two origins with synthetic
base imports; it creates no installable package and proves no audio or lifecycle
behavior. Doctor intentionally reports absent listing/release integration rows
for an unlisted draft. Do not add catalogue/package rows or weaken gates to
hide them. Record all other failures before release.

`build_private.py --help` lists the separate private paired build inputs: exact
base source/build proofs/package, an Elekloader checkout and the user's own
original OS 1.40C. It verifies FR:1 preservation, START ABI, source/base identities
and stock-free output; a base without them is rejected. Outputs and stock files
stay outside Git; no device writes are part of source validation.

## Authorship and licences

FRACT is original work by ex1010/toli. Retain [LICENSE](LICENSE), file-level SPDX
notices and [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md), including the Octabam
MIT notice. The source bundle contains no firmware, extracted stock routines,
samples, memory dumps or built images. Source references use addresses and hashes
and reconstruct any required stock bytes from the user's own OS file.

The host-only historical oracle under `sdk/tests/fixtures/fract_reference/`
freezes the earlier scalar implementation for differential tests; it is not
linked into the machine. Its helpers still use shared support headers, so its
independence is limited to the frozen implementation files.

## Screens and audio

[Artwork and three emulator previews](../../../docs/media/fract/README.md) show
selection, sample loading and playback. These private-prototype captures do not
qualify this source tree or hardware audio. Artwork is MIT; screenshots retain
the underlying interface rights described beside them. No sample audio is
included. Full release capture provenance and all required control pages remain
pending; the manifest's screenshot list is intentionally empty for this draft.

## USB release candidate — 6 November 2026

`runtime-build.json` describes the C/assembly build through the shared host
recipe compiler, `scripts/source-runtime-package.py`. It contributes the same
machine and START records through `runtime.json`; the granular engine, controls
and UI are unchanged. The reviewed base-export guard accepts all seven published
USB layouts whose runtime addresses match. Older or unknown bases refuse the
machine callbacks. This candidate has the canonical runtime identity
`fract-machine`; the earlier private `grnyv1` package is a separate module and
must be replaced as a controlled set, not installed alongside it.

From the repository root:

```sh
python3 -B scripts/source-runtime-package.py --recipe sdk/drafts/fract-machine/runtime-build.json --output /path/outside/git/fract-machine.mwrm
python3 -B -m unittest discover -s sdk/tests -p 'test_source_runtime_package.py'
```

The second command checks recipe confinement, exported imports, each of the
seven allowed base IDs, wrong-digest refusals and source-only reproducibility.
Original-OS reconstruction and both strict stock-free scans were additionally
run locally; no OS file is included. The candidate's exact-package hardware
lifecycle remains pending, as does the first-release owner's approval.
