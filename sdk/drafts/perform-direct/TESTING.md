# Perform Direct 1.0.0-experimental — evidence and pending gates

## Identity and scope

Digitakt II OS 1.17, elekloader core-dt2 1.0 and native Perform Direct 1.0, pinned to `71a5156781838fb5ef1c3e963b3949b781043a0d`. Modwerk's draft semantic version is `1.0.0-experimental`; it is outside `sdk/digitakt-ii/modules`, public discovery and browser builds. [Import identities](../../imports/elekloader-pr38-digitakt-ii.json) bind the original and adapted recipes and every authored source. No stock instructions, firmware images or keys are in this folder.

## Upstream reports

[PR #38](https://github.com/irpina/elekloader/pull/38) reports exact stock OS reconstruction, sealed output, an emulator boot, and core/Perform Direct operation on real Digitakt II hardware. The author's README describes an earlier hardware build with a PERSONALIZE enable row. That row is absent from the pinned source. These attributed functional reports do not establish exact-version worst-case timing, a 60-minute eight-track stress run, or Modwerk browser/native parity. No hardware pass is assigned to this draft.

## Actual UI capture — 4 October 2026

Built only the reviewed core and requested mod with the native elekloader remixer in a disposable local sandbox. The three upstream loader changes are draft-only overlays; every staged engine file is verified against the PR head, while the approved public Digitakt/Digitone browser engine remains unchanged. The final isolated loader composition reproduced the exact same image and sealed output hashes. Networking and credential paths were denied; writes were limited to private temporary storage. Inputs were the owner's local original OS 1.17 (SHA-256 `26c22f6652625ac2cfd47f7ee970d388ed8b6427dae3563c0a6a2f2d334350d5`) and the pinned authored source. Native compilation used m68k-elf-gcc 16.2.0. The exact temporary MAIN OS hash is `52f4d96d471ed90c8f0ee2cef0a2a0023769bca8e7bc5fb1057d6e0729c0264e`; sealed output hash is `d9a7d90d2f9750c04942d99238aeba9134d1739ab9cbc834102c169365690db1`, label `PD10`. These hashes identify local files; the files are not distributed.

The reviewed [digiemu](https://github.com/irpina/digiemu) checkout was clean at `c1b5735835923e328f8b4950d6ba927875e5b669`, with its local patched Unicorn. Used a fresh formatted disposable +Drive, A01/track 1 and stopped transport. The ordinary headless intro held timers and failed to reach a live LCD; that attempt was discarded. The real GUI runner with intro PIT3 delivery reached the stock SRC page. The final capture tool reproduced the following real panel sequence without guest RAM edits or internal menu calls:

| Input / capture | Result |
| --- | --- |
| PRESET press at 20M, release at 24M; capture at 40M | `Perform Kit=ON` on SRC |
| PRESET press at 44M, release at 48M; capture at 60M | `Perform Kit=OFF` on SRC |
| Hold FUNC at 65M; PRESET press at 72M, release at 76M; release FUNC at 80M; capture at 105M | Real PRESET/KIT menu |

Instruction milestones are emulator scheduling markers, not cycle counts or performance measurements. All three final PNGs were visually inspected. They preserve the actual 128×64 framebuffer in black/white at integer scale six (768×384); no reconstruction, cropping or relabeling. The third screen is the relevant menu access location. This mod has no enable row, selector, added settings or parameters, so no extra page is implied. Closing with NO follows stock menu behavior; it was not separately captured. No audio/DSP, project playback or hardware stress check was run for documentation capture.

[media/capture.json](media/capture.json) records exact tool/source/image/emulator hashes, setup, panel plan, PNG hashes, contributor declaration and limitations. Only these reviewed PNGs and sanitized metadata are retained. The capture contribution permits Modwerk reuse; underlying Elektron rights remain reserved and owner rights verification is pending. Reviewer approval is not legal clearance.

### Local reproduction

Read and review source and tools first. Run both commands in a network-denied disposable sandbox with no credentials, read access limited to the pinned source/toolchain/emulator and exact local stock, and write access limited to a new temporary workspace. Use an empty environment containing only the local toolchain path, locale and no-bytecode setting. Do not run these tools in CI or ordinary app checks.

```sh
python3 -B scripts/prepare-digitakt-ii-draft.py \
  --stock /local/private/Digitakt_II_OS1.17.syx \
  --output /private/tmp/unique-dt2-capture/build

/local/reviewed/digiemu/.venv/bin/python3 -B scripts/capture-digitakt-ii-ui.py \
  --emulator /local/reviewed/digiemu \
  --build /private/tmp/unique-dt2-capture/build \
  --work /private/tmp/unique-dt2-capture/session
```

The capture tool extracts locally, formats a scratch card, cold-boots, delivers PIT3 for the GUI intro, saves a temporary GUI snapshot at 550M, and runs the panel plan for 110M. It rejects missing snapshots/captures or a non-live GUI. Inspect every PNG again; live-loop counts alone do not prove the page is correct. Retain only reviewed screenshots and sanitized metadata, then remove the temporary firmware, extracted sections, packages, snapshots, card and private logs. Never delete the owner's original OS.

## Memory accounting

The native object has 28 bytes of `.run`, no BSS and no fast section. In the linked capture build it occupies DDR `0x47F001E0–0x47F001FC`. The core/module/shared tables occupy `0x47F00000–0x47F0022C` (556 bytes); shared core BSS occupies `0x47F0022C–0x47F00240` (20 bytes), for 576 bytes combined. This leaves 261568 bytes of the researched 262144-byte mod DDR area. Fast SRAM `0x8000F100–0x80010000` (3840-byte budget) is unused. The flash payload is 620 bytes including 50 bytes boot code, loaded runtime and alignment. This is allocation accounting, not stock memory usage, runtime stack high-water measurement or CPU utilization. Exact records and owner-verification status are in [qualification.pending.json](qualification.pending.json).

## Qualification still required

- Worst-case cycles during repeated PRESET/FUNC mode changes and maximum project load, including shared core overhead and an explicit workload.
- A passed real-hardware stress project for this source/build and version: at least 60 minutes, all eight audio tracks active, with actual reports reviewed by the owner. Earlier functional hardware reports are insufficient.
- Owner verification of exact memory/accounting and capture authenticity, coverage and reuse rights.
- Modwerk browser/native byte-parity and rejection cases for OS 1.17 and the actual browser engine before any firmware download is offered.
- Owner approval through PR merge. The existing eleven-module baseline is not changed or expanded.

The current user instructions require the 60-minute/eight-track evidence even though the later repository workflow text relaxes that minimum. Missing evidence stays null; these captures and allocation facts are not a qualification pass.

## Firmware-free application checks

Static tests validate strict manifest/build contracts, pinned source identities, screenshot hashes/monochrome pixels/version/build provenance, complete README/tutorial, and rejection of publication with missing timing/hardware evidence. Synthetic tests validate the sealed-container algorithm and tamper/missing-seed/trailer rejection without stock bytes. IndexedDB coverage includes restore/removal for Digitakt II alongside the existing machines. Normal `npm run check` never runs this source, emulator, firmware, DSP or hardware tests.
