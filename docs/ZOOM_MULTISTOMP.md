# Proposal: Zoom MultiStomp pedals (ZDL effects)

Status: **proposal, with the owner's first answers; the machine contract part is in.** The
four pedals have profiles in `sdk/machines/zoom-*/` (family `zoom`, all in
research) and machine pages on the site. Modwerk lists no ZDL effects yet:
that needs the `zdl` platform and module contract (steps 3 onward below).

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
| Install | Now: Zoom Effect Manager 2.3.3+ (USB), a guided download. Planned: a browser install from the owner's own Zoom updater ([below](#installing-on-stock-firmware)) | No runtime loader, trial or Keep/Undo: Effect Manager reflashes the whole effect file system; per-effect USB replacement is now demonstrated |
| Patches | The project's Web MIDI patch editor (MS-70CDR mapped; read-only elsewhere) | Optional integration |
| Combination budget | Summed DSP cost per patch: refused between 224.4 and 228.4 on the MS-70CDR 2.10 (measured); 6 slots | A `percent`-style budget in the profile |
| Resource rules | Effect ID unique per pedal (the project reserves 403-499, 500-699 NAM, 700-899 cab, 900-957), file name 8 characters unique, file size cap (~32 KB proven) | A per-family ID ledger, like Stomphacks' author ranges for ZD2 |
| Evidence | Owner hardware tests per release, user reports, emulator/host parity | Same evidence rules apply |

## Contract changes

Done (22 October 2026):

1. A `family` field (`elektron` by default, or `zoom`); the machine menu shows
   the Zoom pedals as one group.
2. Steps per family: Zoom pedals have `format`, `load` and `mods` only.
3. A Zoom firmware release lists no stock file (Zoom ships firmware as an
   updater app, not `.syx`/`.bin`).
4. `art.body` gains `pedal` (the MultiStomp stompbox) and `floor` (the G1on
   series): original line drawings of each layout, never a product photo.

Still to come: `MACHINE_PLATFORMS` gains `zdl`, with its module contract.

## Owner's answers (Janik, 2026-10-20)

1. **Non-Elektron devices:** yes. The "Elektron instruments" wording is stale.
2. **A family:** if modules work on more than one Zoom pedal, show them as a
   family. They do: a ZDL is the same file on every pedal of the ZDL family
   (MS-70CDR, MS-50G, MS-60B, G1on/B1on), so one module can serve the whole
   family, with compatibility evidence recorded per pedal. Known limits stay
   per pedal: DSP budget, slot count, firmware version, and which effects have
   been confirmed where.
3. **Licensing:** the project is MIT; the upstream toolchain
   (repeat98/ZoomMultistompZDL) is MIT since October 2026; Matujuice effects
   are MIT by their author.
4. **Install:** keep Zoom Effect Manager as the **fallback**. The primary path
   should be a direct install from the browser; that needs the effect-transfer
   protocol, which is being researched on the project side (read-only first:
   list installed effects) and is not available yet.
   *Update, 23 October 2026:* the protocol is known now: Effect Manager reflashes
   the whole effect file system, while the pedal also accepts per-effect USB writes; see the next section. Until that path is
   qualified, Effect Manager is the install path.

## Installing on stock firmware

Findings from recording Zoom Effect Manager 2 on an MS-70CDR 2.10 (two full
install cycles), written up in the project's
[EFFECT-INSTALL-PROTOCOL.md](https://github.com/themanro/ZoomMultistompZDL/blob/main/docs/EFFECT-INSTALL-PROTOCOL.md):

- Effect Manager has no per-effect transfer. The owner starts the pedal in
  update mode, and Effect Manager erases and rewrites the whole effect file
  system (2.7 MB) over USB MIDI, then the pedal reboots. Adding one effect
  rewrites them all.
- So its image must hold every effect that stays on the pedal, Zoom's
  included, and Effect Manager does not read them back from the pedal.
- The pedal itself can do more (probes on the owner's MS-70CDR 2.10, normal
  mode, 23 October 2026): it answers the file commands that zoom-zt2 uses on
  the ZD2 pedals. It reports its disk usage, lists all 162 files with their
  sizes, and reads a file back: its effect list read this way matches
  Effect Manager's copy byte for byte. So a full backup over USB is
  possible, and stock effects can come from the user's own pedal. It also
  writes and deletes single files: a test file was written, read back
  identical, kept over a power cycle (the pedal booted and played normally)
  and deleted. Replacing an installed effect works as well: Loop was swapped
  0.03 -> 0.02 -> 0.03 over USB, and each build ran after a power cycle. So a
  per-effect install without update mode or stock updaters is possible.
  Adding a new effect (its file, then one record in the effect list) and
  removing it again work too: the pedal listed and loaded the added effect
  after a power cycle, and after removal everything else was unchanged.
- In normal mode, Effect Manager learns which effects are installed by
  writing a temporary patch with several effect ids into the edit buffer and
  reading it back. That works without update mode.

The owner's plan (Janik, 23 October 2026), the same as for the Octatrack OS:
the user opens their own copy of Zoom's updater in the browser, which never
uploads it. The updaters are free downloads on each pedal's support page, and
their `FS.bin` holds that pedal's stock effects. The browser takes the stock
effects from it, adds the chosen Modwerk effects, builds the image and flashes
it.

Checked offline, nothing written to a pedal:

- The project's `tools/zoom_fs.py` rebuilds both captured Effect Manager
  images byte for byte, and builds the second one from independent sources
  (the MS-70CDR updater, the owner's own stock copies and the project's
  effects) except for four stock effects no local updater held.
- Effect Manager installs stock effects with their debug sections removed;
  TI's `strip6x` reproduces that exactly (99 of 104 checked; the other five
  are newer builds that Effect Manager takes from another pedal's updater).
  Some effects and `CMN_DRV.ZDL` (needed by the amp effects) are only in the
  MS-50G, G1Xon or B1Xon updaters, so a user may need more than one updater.
- Effect Manager's own effect library offers many more effects than a pedal
  has installed, drawn from every pedal it supports. Its order (which the
  pedal's effect list follows) and the full set of sources are still to be
  mapped; until then a browser install covers the effects the user's updaters
  hold.

Before any browser write, in this order:

1. A browser builder (no `strip6x` in the browser: a port, checked against
   it on every stock effect) that reproduces Effect Manager's image from the
   same selection.
2. The read-only "what is installed" check over USB.
3. A first write on the maintainer's own pedal with the stock updater ready
   for recovery, then a documented recovery path for users.

What this means for the Octatrack interface ([ADD_A_MACHINE.md](ADD_A_MACHINE.md#aim-for-the-octatracks-interface)):
stock Zoom firmware has no way to load an effect into RAM, so there is no
trial, Keep or Undo; installs write persistent storage. Zoom's firmware with
effect files stays the route without a base, like the Octatrack's card build,
with that resource reason for the exception, for owner review.

## The base: MIDISTOMP

Owner, 27 October 2026: the pedals get the Octatrack beta's setup, with Luca
Matturro's [MIDISTOMP](https://github.com/matujuice/zoom-ms-midistomp) (MIT)
as the base: Zoom's own 2.10 patched in the browser from the user's own
updater, flashed once in update mode, then modules over USB. Luca agreed to
mod selection and to his transport block as the shared tempo contract.

- `vendor/midistomp/` holds MIDISTOMP at a pinned revision
  (`sdk/imports/midistomp-*.json`): `LICENSE`, `models/` and `asm/` unchanged,
  and its patches in `midistomp.json`, converted by
  [`scripts/midistomp-import.ts`](../scripts/midistomp-import.ts) without Zoom's
  bytes. Each `expect` becomes a sha256 (as the Octatrack's `stock_guard`), a
  text `replace` becomes writes at the addresses it hits in the stock 2.10 OS,
  and a run of 16 or more bytes a patch repeats from Zoom's files (part of the
  boot picture, a register-restore sequence) becomes a copy from the user's
  own file.
- [`zoom-base.ts`](../src/engine/zoom/zoom-base.ts), with `ais.ts` (a port of
  zoomms' `ais.py`), applies them in the browser. From the stock MS-70CDR 2.10
  Mac updater (27 October 2026) it builds `hello` and MIDISTOMP V1.2 byte for
  byte as zoomms does: `ZOOM_MS70CDR_APP='…/ZOOM MS-70CDR v2.10 Updater.app'
  npx vitest run src/engine/zoom`. Firmware never enters CI.
- A new MIDISTOMP revision: run the import on a clean checkout with
  `--app '<stock Mac updater>.app'`, then refresh the zoomms hashes in
  `zoom-base.test.ts` (`zoomms build-mac` at that revision).

### Flashing from the browser (next)

Nothing writes to a pedal yet. Before the first write of our own:

1. **Record one flash on the wire.** Only Effect Manager's write of the effect
   area has been recorded, never the OS write. Record MIDISTOMP's updater (its
   own builder, or `zoomms build-mac`) flashing an MS-70CDR, with MIDI
   Monitor's spy driver. Use MIDISTOMP's updater, not Zoom's: Zoom's rewrites
   the bootloader on every update, MIDISTOMP's never does. Recovery: update
   mode (hold Up and Down while plugging in USB) and Zoom's 2.10 updater. The
   capture carries Zoom's OS, so it stays private.
2. **The flasher**, on the pedal page's link (SysEx framing, 8-into-7 packing
   and CRC32 in `zoom-protocol.ts`). In update mode the identity's version
   reads "1.1…" (the bootloader) and `01` answers `00 00`. Messages are
   `F0 52 00 61 <command> … F7`, numbers in 7-bit groups, least significant
   first: erase `0A` + address (5) + length (5); write `02` + address (5) +
   length (2) + 2,048 bytes packed 8-into-7, high bits first, + CRC32 of the
   block XOR `0xFFFFFFFF` (5); finish `04`, and the pedal reboots. Each answers
   `00 00`. The recording settles anything the OS write does differently.
3. **Its steps**, the stock updater's script with MIDISTOMP's skips
   (`zoomms/macapp.py`): erase `0x0EF000` +`0x1000` (the OS trailer first, so
   an interrupted flash shows); if the boot logo changed, erase `0x3FD000`
   +`0x3000` and write `Preset.bin`; erase `0x040000` +`0xB0000`; write
   `Main.bin` (720,896 bytes, 352 blocks). Never `0x000000` (the bootloader)
   or `0x0F0000` (the effects).
4. **Tests:** a fake pedal that must receive exactly the recorded messages,
   byte for byte; then `hello` (it only renames the VERSION menu entry) on a
   real MS-70CDR, its owner putting it in update mode.

## Plan

In order, with who (27 October 2026). Effect Manager stays the fallback
install throughout.

1. The read-only pedal page and its link: #956 (Manro).
2. ~~The base built in the browser~~: done (#991).
3. The recording and the browser flasher (above), first run with `hello`.
4. A hello base: a MIDISTOMP patch that answers a Modwerk SysEx hello
   (version, then status), so the site knows a pedal runs the base (Luca,
   with Modwerk agreeing the message).
5. Which MIDISTOMP features depend on each other, so they can be picked as
   mods (Luca). Shared parts, such as the transport block, go into the base.
6. `OctatrackHub` taking a machine instead of `ZoomHub` copying it, then the
   base install and update on the pedal page, effect sync (file plus
   effect-list record, then a power cycle, as proven) and module sets.
7. The project's own knob handlers instead of the stock ones every built
   effect carries (Manro): until then no ZDL effect can be listed. Then the
   `zdl` module contract (effect-ID ledger, DSP limit 300 under MIDISTOMP 2)
   and a first module set.
8. Later: the Windows `.exe` as input (a port of `zoomms/parts.py`), the
   MS-50G and MS-60B (their stock updaters resolve and check the patches),
   loading effects without a reboot, in-browser NAM and cab builds, and the
   patch editor as a device page.
