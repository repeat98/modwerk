# Machine Pages 1.2.1 on the Digitakt, 27 November 2026

Machine Pages is the framework that draws the SRC pages of added Digitakt machines. This record covers the port of irpina's 1.2 to Modwerk's Core 2.1 build: what changed, how every library set was linked with it, which screens were compared, and what was not tested.

## What changed

- **Source.** irpina's Machine Pages 1.2 (elekloader `6e1e099`, tag `machine-pages-v1.2`) and its SDK header, unchanged except for the port. The port adapts it to Core 2.1 the way sumedho adapted 1.1 (`sdk/digitakt/dependencies/machine-pages/NOTICE`):
  - the descriptor's UI tail is read directly;
  - `fw_active_track`, `fw_kit`, `fw_voice_params` and `fw_track_blocks` come from per-OS flags, at the addresses core 4.4 exports;
  - four symbols name parts of `mp_legacy_tables` for the `keep2` sites that reached them by addend.
- **`build.json`** is irpina's `mod.json` with stock bytes as SHA-256 guards. Its `keep2` sites become plain `jsr`, `lea` and guarded `bytes` sites, by their stock opcode.
- **Two of irpina's declarations are left out:**
  - the site at `0x400318b2`, which CC Names hooks (see below);
  - the claim on the stock table range Machine Pages rewrites at run time (OS 1.53 `0x401abeec`–`0x401ac058`, 1.54 `0x401ac1ec`–`0x401ac358`), which `build.json` cannot express. No library mod patches either range.
- **Packages.** `machine-pages-1.2.1-os1.53.elemod` (`9f28e199…`) and `-os1.54.elemod` (`593cc105…`), compiled from source in the pinned toolchain and pinned in `sdk/imports/elekloader-machine-pages-2026-11-27.json`. They replace 1.2 (`93092ba3…`, `1ab853a2…`), sumedho's port of irpina's 1.1.

## How it was checked

A local Node script ran the site's `prepareBuild` on the vendored kit 0.7.0 with core 2.1 and core 4.4 (#2298's catalog). It used the owner's stock files, recognised by their hashes (Digitakt 1.53 `9bdd44bb…`, 1.54 `f78ba80f…`), and linked and built the empty set, every Digitakt library mod alone and every pair. DT-FM 1.2.1 and OB-1 0.6, the authors' released files, were added for the check only. A run with Machine Pages 1.2 gave the baseline.

| OS | Sets | Same result as with 1.2 | Changed | Sets with DT-FM or OB-1 that build |
| --- | --- | --- | --- | --- |
| Digitakt 1.53 | 232 | 211 (179 build, 32 refused) | 0 | 13 of 21 |
| Digitakt 1.54 | 436 | 379 (340 build, 39 refused) | 0 | 43 of 57 |

- Every set builds on the same core as before. Digi EQ's sets still build on core 2.1, and the rest on 4.4.
- The first build kept irpina's site at `0x400318b2`, the `cmpi.l #0xa4,d5` that 1.2 raises to `#0xab`. With it, CC Names was refused beside SOPHIE, STRING, RAM Machines and Live Looper. CC Names hooks that instruction and reads every parameter's label itself, so the port leaves it stock. That is the run above.
- OB-1 0.6 builds beside every library mod except DigiChain, Digi Mono, Digi Poly, NEIGHBOR and DIGISLICER (Machine Pages' own conflicts) and Digi EQ (core 2.1 only). It now builds beside CC Names as well.

## Screens compared

Pinned digiemu `c1b5735`, firmware-native drawing, OS 1.54, disposable first-boot project, no network:

- **SOPHIE**, run through its own capture plan (chooser, FUSE, BOOM after a knob turn, AMP): every PNG is byte-identical to its committed screenshot, on core 4.4 (`fa1ede44…`) and on core 2.1 beside Digi EQ (`0468a09f…`).
- **OB-1 0.6** (`db675074…`): the machine list, its oscillator page and its second page (MIX) draw through 1.2.1's two-page layout.

## Not tested

- Any build on a unit: sound, knobs, parameter locks, MIDI CCs, saving and reloading a project, a power cycle.
- Sets of three or more mods.
- The extra values' labels where `0x400318b2` would have shown them.
