# Proposal: Zoom MultiStomp pedals (ZDL effects)

Status: **proposal, with the owner's first answers**. Nothing here changes the site, the
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
| Install | Fallback: Zoom Effect Manager 2.3.3+ (USB), a guided download. Primary (planned): direct browser install, once the transfer protocol is known | No runtime loader, trial or Keep/Undo: the stock firmware has no such path |
| Patches | The project's Web MIDI patch editor (MS-70CDR mapped; read-only elsewhere) | Optional integration |
| Combination budget | Summed DSP cost per patch: refused between 224.4 and 228.4 on the MS-70CDR 2.10 (measured); 6 slots | A `percent`-style budget in the profile |
| Resource rules | Effect ID unique per pedal (the project reserves 403-499, 500-699 NAM, 700-899 cab, 900-957), file name 8 characters unique, file size cap (~32 KB proven) | A per-family ID ledger, like Stomphacks' author ranges for ZD2 |
| Evidence | Owner hardware tests per release, user reports, emulator/host parity | Same evidence rules apply |

## Contract changes the drafts need

1. A `vendor` (or `family`) field, so the Zoom pedals can be shown as one
   family (see the owner's answers below).
2. `MACHINE_PLATFORMS` gains `zdl`.
3. Steps per platform: for `zdl`, `format`, `load` and `mods`, with
   `rebuild` and `core` marked not applicable rather than `open`.
4. `firmware.releases[].files` allows no stock file for platforms that never
   touch the OS (Zoom ships firmware as an updater app, not `.syx`/`.bin`).
5. `art.body` gains `pedal`, with knob count and footswitches.

## Owner's answers (Janik, 2026-10-20)

1. **Non-Elektron devices:** yes. The "Elektron instruments" wording is stale.
2. **A family:** if modules work on more than one Zoom pedal, show them as a
   family. They do: a ZDL is the same file on every pedal of the ZDL family
   (MS-70CDR, MS-50G, MS-60B, G1on/B1on), so one module can serve the whole
   family, with compatibility evidence recorded per pedal. Known limits stay
   per pedal: DSP budget, slot count, firmware version, and which effects have
   been confirmed where.
3. **Licensing:** still open. The project is MIT; the upstream toolchain
   carries no licence file and is the owner's own; Matujuice effects are MIT
   by their author.
4. **Install:** keep Zoom Effect Manager as the **fallback**. The primary path
   should be a direct install from the browser; that needs the effect-transfer
   protocol, which is being researched on the project side (read-only first:
   list installed effects) and is not available yet.

## Proposed sequence

1. Agree the contract changes above, with the Zoom pedals as one family.
2. Promote the draft profiles to `sdk/machines/` with the agreed fields.
3. A `zdl` module contract for prebuilt effects (binary hash, source path,
   knobs, DSP cost, effect ID, evidence), then a first module set: the 22-effect
   pack.
4. In-browser NAM and cab builds from the project's templates.
5. Install: Effect Manager download as the fallback now; a direct browser
   install once the transfer protocol is understood and checked.
6. Optional: the patch editor as a device page.
