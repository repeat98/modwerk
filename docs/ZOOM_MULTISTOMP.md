# Proposal: Zoom MultiStomp pedals (ZDL effects)

Status: **proposal for owner review**. Nothing here changes the site, the
machine registry or the builder. The draft profiles in
[zoom-multistomp/](zoom-multistomp/) sit outside `sdk/machines/` on purpose:
they need contract changes the owner decides first.

Source project: [themanro/ZoomMultistompZDL](https://github.com/themanro/ZoomMultistompZDL)
(MIT), a fork of [repeat98/ZoomMultistompZDL](https://github.com/repeat98/ZoomMultistompZDL),
the toolchain this builds on.

## What it is

The original Zoom MultiStomp pedals (MS-70CDR, MS-50G, MS-60B) and the
G1on/B1on family load effects as `.ZDL` files: a Zoom header around a
TI C674x ELF. The stock firmware loads them like its own effects, so no OS
image is modified. The project provides:

- a static linker that turns TI C6000 `.obj` files into ZDLs, with its own
  ABI notes and DSP safety rules (relocations, size cap, no RTS helpers);
- about 30 effects of its own (a 22-effect pack, a looper, live screens) and
  Luca Matturro's MIT Matujuice pack (12), as prebuilt, checked ZDLs;
- browser tools: a NAM capture loader and a cab IR loader that write ZDLs from
  prebuilt templates (no compiler), and a Web MIDI patch editor;
- tests against the Ziddle C674x emulator (TI build vs a host build of the
  same C), which is not hardware evidence.

## Devices

| Device | Firmware | Status (from the project's reports) |
| --- | --- | --- |
| MS-70CDR | 2.10 | Main target: effects, NAM/cab loader and patch editor tested by the owner |
| MS-50G | 3.10 | NAM and cab effects confirmed by a user ([#1](https://github.com/themanro/ZoomMultistompZDL/issues/1), [#5](https://github.com/themanro/ZoomMultistompZDL/issues/5)); patch editor writes opt-in |
| MS-60B | — | Same family; unconfirmed |
| G1on / G1Xon / B1on / B1Xon | G1Xon 1.21 | NAM loader effects reported working on a G1Xon ([#6](https://github.com/themanro/ZoomMultistompZDL/issues/6)); others unconfirmed |
| MS-100BT | — | No USB MIDI; effects installed with third-party Bluetooth tools ([#4](https://github.com/themanro/ZoomMultistompZDL/issues/4)) |

Related: [MIDISTOMP](https://github.com/matujuice/zoom-ms-midistomp) (Luca
Matturro, MIT) is custom firmware for these pedals, installed with a modified
Zoom updater: the one place Modwerk's OS-image steps could apply. Its
upcoming v2.0 reportedly raises the patch DSP limit to about 300.

Out of scope: the ZD2 pedals (MS-50G+, MS-60B+, MS-70CDR+ and the Four
series). For those, see Stomphacks and nam2zoom, which already have their
own pipelines.

## How it maps onto Modwerk

| Modwerk concept | Zoom ZDL equivalent | Gap |
| --- | --- | --- |
| Machine profile, five OS steps | Effect files on a stock OS: "format" (ZDL container and ELF documented) and "load" (a custom effect runs on stock firmware) are done for the MS-70CDR; "rebuild" and "core" have no counterpart | Step set per platform |
| Platform (`octabam`, `elemod`) | A new `zdl` platform | Contract section in `module-contract-v3.ts` |
| Module | One ZDL effect, or a NAM/cab slot built from a template | Module manifest for a prebuilt binary plus source |
| Build | Effects: prebuilt (the TI compiler cannot run in CI or the browser and is not redistributed). NAM/cab: in the browser from MIT templates (`nam_loader.js`, `cab_loader.js`, `slot_identity.js`, `cover_art.js`) | No native build in Modwerk |
| Install | Zoom Effect Manager 2.3.3+ (USB), a guided download | No USB link, runtime loader, trial or Keep/Undo: the stock firmware has no such path |
| Patches | The project's Web MIDI patch editor (MS-70CDR mapped; read-only elsewhere) | Optional integration |
| Combination budget | Summed DSP cost per patch: refused between 224.4 and 228.4 on the MS-70CDR 2.10 (measured); 6 slots | A `percent`-style budget in the profile |
| Resource rules | Effect ID unique per pedal (the project reserves 403-499, 500-699 NAM, 700-899 cab, 900-957), file name 8 characters unique, file size cap (~32 KB proven) | A per-family ID ledger, like Stomphacks' author ranges for ZD2 |
| Evidence | Owner hardware tests per release, user reports, emulator/host parity | Same evidence rules apply |

## Contract changes the drafts need

1. A `vendor` (or `family`) field, so the site can show non-Elektron devices
   apart and keep "for Elektron instruments" true for the rest.
2. `MACHINE_PLATFORMS` gains `zdl`.
3. Steps per platform: for `zdl`, `format`, `load` and `mods`, with
   `rebuild` and `core` marked not applicable rather than `open`.
4. `firmware.releases[].files` allows no stock file for platforms that never
   touch the OS (Zoom ships firmware as an updater app, not `.syx`/`.bin`).
5. `art.body` gains `pedal`, with knob count and footswitches.

## Open questions for the owner

1. Should Modwerk list non-Elektron devices at all? The README describes it as
   firmware modules for Elektron instruments.
2. If yes: a separate device family on the site, or alongside the machines?
3. Licensing: the project is MIT; the upstream toolchain carries no licence
   file and is the owner's own; Matujuice effects are MIT by their author.
4. Is a guided Effect Manager install acceptable where the base/USB lifecycle
   cannot exist?

## Proposed sequence

1. Owner decision on scope and the contract changes above.
2. Promote the draft profiles to `sdk/machines/` with the agreed fields.
3. A `zdl` module contract for prebuilt effects (binary hash, source path,
   knobs, DSP cost, effect ID, evidence), then a first module set: the 22-effect
   pack.
4. In-browser NAM and cab builds from the project's templates.
5. Optional: the patch editor as a device page.
