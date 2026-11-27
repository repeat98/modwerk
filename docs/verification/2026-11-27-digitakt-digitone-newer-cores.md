# Digitakt core 4.4 and Digitone core 5.4, 27 November 2026

Which cores were pinned beside the old ones, how every library set was linked with them, and what was not tested.

## What changed

- **Pinned from elekloader v0.11.0** (the release's `SHA256SUMS.txt` and its catalog agree), beside the cores already in the catalog:

  | File | Device and OS | SHA-256 |
  | --- | --- | --- |
  | `core-4.4.elemod` | Digitakt mk1, OS 1.53 | `b51ef98a…` |
  | `core-4.4-os1.54.elemod` | Digitakt mk1, OS 1.54 | `dc65ffd3…` |
  | `core-dn1-5.4.elemod` | Digitone mk1/Keys, OS 1.43 | `a49e6ada…` |
  | `core-dn1-5.4-os1.44.elemod` | Digitone mk1/Keys, OS 1.44 | `4fa199a6…` |

- **The kit stays 0.7.0.** `npm run elekloader:update` took the cut catalog, which is the old one plus these four pins. Its own checks passed, so the Octatrack base's pinned elekloader checkout does not move.
- **The machine profiles** (`sdk/machines/digitakt/machine.json`, `sdk/machines/digitone/machine.json`) now name core 4.4 and 5.4, so `modules:check` accepts a mod that needs a core newer than 2.1 or 2.2. Their shared mod memory is each core's `ram_area` as the builder reads it: 262,144 bytes on core 4.4 and 1,310,720 on core 5.4 (its own share about 110 KB), against 131,072 on the old cores.
- **The core choice.** The kit takes the newest core new enough for the mods. Core 4.4 patches two places Digi EQ 1.0.2 patches (`0x40044acc`, `0x400721e6` on OS 1.53), and core 5.4 two places KitBank 0.2.0 patches on OS 1.44 (`0x4000eb10`, `0x4001570e`). On kit 0.7.0 those sets would fail. `prepareBuild` now tries the next older core when a set fails to combine with the newest, as elekloader 0.11's `pick_core` does.

## How it was checked

A local Node script ran the site's `prepareBuild` on the vendored kit. It linked and built the empty set, every library mod alone and every pair, on each OS. It used the owner's stock files, recognised by their hashes: Digitakt 1.53 `9bdd44bb…`, 1.54 `f78ba80f…`, Digitone 1.43 `c5a54cc0…`, 1.44 `d4f200d0…`. The same script with the old catalog gave the baseline. No firmware or build was kept or committed.

| OS | Sets | Build before and after | Newly build | Refused before and after | On the new core | On the old core |
| --- | --- | --- | --- | --- | --- | --- |
| Digitakt 1.53 | 211 | 178 | 1 | 32 | 159 | 20 |
| Digitakt 1.54 | 379 | 339 | 1 | 39 | 313 | 27 |
| Digitone 1.43 | 4 | 4 | 0 | 0 | 4 | 0 |
| Digitone 1.44 | 2 | 2 | 0 | 0 | 1 | 1 |

- No set that built before is refused now.
- Every set on the old core holds Digi EQ (Digitakt) or KitBank (Digitone 1.44), and each builds the same bytes as before (Digi EQ alone: 1.53 `4282cc4b…`, 1.54 `5ed478fe…`; KitBank: `72527f90…`).
- CC Names with DIGISLICER now builds on both Digitakt OSes (1.53 `577c9c0f…`, 1.54 `eb3b65e6…`). Before, it was 14,856 bytes over core 2.1's 128 KB; core 4 gives mods 256 KB.
- Builds with nothing chosen: Digitakt 1.53 `a6c495de…`, 1.54 `dea6a8b9…`, Digitone 1.43 `e8c20c47…`, 1.44 `43da970c…`.
- Refusals stayed the same: the overlaps the builder already reported, such as digichain with NEIGHBOR, DIGISLICER and SOPHIE.

## Not tested

- **No build on the new cores has run on a unit.** Hardware reports for library mods were made on core 2.1 or 2.2, and those mods now build on 4.4 or 5.4. elekloader reports linting its shop's mods against these cores, not running them.
- Sets of three or more mods were not linked.
- The core interface files (`sdk/digitakt/core/interface.json` 2.1, `sdk/digitone/core/interface.json` 2.2) are unchanged. Each newer core keeps the older one's events, so library mods still link. A mod that subscribes to a newer event raises the interface in its own pull request.
