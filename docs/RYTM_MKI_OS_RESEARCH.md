# Analog Rytm MKI OS research

Research on the Analog Rytm MKI OS file, toward the machine steps in [Add a machine](ADD_A_MACHINE.md): `format`, `rebuild`, `boot` and `core`, and what every later build must leave alone. Stock-free: hashes, layout, addresses and notes only. The firmware, the decoded image and every listing stay on the researcher's computer.

## 0. Inputs and tools

Target: `Analog-Rytm_OS1.74.syx`, from Elektron's `Analog-Rytm_OS1.74_dist.zip` (OS 1.74, 1 October 2026).

| Item | SHA-256 |
| --- | --- |
| `Analog-Rytm_OS1.74.syx` (1,630,880 bytes) | `4f0d59051b4b3ac01f336639918ceb8186e0ae1a1abf2ed9bc028b8718514cff` |
| `Analog-Rytm_OS1.74_dist.zip` | `8450d9b395df4b1f72bf22fa796b431eaefbc06afe060627ce22972c1cd5a1b1` |
| MAIN OS, depacked (2,824,228 bytes) | `6d021e22e8912cfc1ee84e619c35db0174455cbc42bf64dbec1f1d06a5ab811d` |

Tools: `src/engine/elektron/ele2.ts` (this repository: reads, rebuilds and verifies ELE2 files on the ELE3 code's transport and depacker), [elektron-firmware-tool](https://github.com/mischa85/elektron-firmware-tool) for the format's documentation, Homebrew's `m68k-elf-objdump` (`-m m68k:cfv4e`, VMA `0x40000400`), and [rytm-emu](https://github.com/trigcondition/rytm-emu) at Modwerk's pin `2ac0f1f` (its [MK1 notes](https://github.com/trigcondition/rytm-emu/blob/main/docs/MK1-PORT.md) and its `rytm_mk1_174` profile). Researched 2 to 9 November 2026; hardware session 8 November 2026 on draadpiraat's own unit.

## 1. Format (step `format`)

Measured on the file above:

- **Transport:** a 16-byte start message, 12,741 data messages of 128 bytes (116 bytes of 8-in-7 carrying 101 bytes each) and a 16-byte end message, the same transport as the ELE3 files of the Digitakt and the Rytm MKII. Device byte `0x07`. Nothing follows the last `F7`. The counters run on from 242, and every per-message checksum matches the rule `sysex.ts` implements, with the transfer constant `0x02` from the start message.
- **Preamble:** container size 1,286,744 and a content checksum (the sum over big-endian words of `(index + 1) XOR word`). The stored value matches the computed one. This settles the open item in rytm-emu's notes ("outer checksum not verified").
- **Container `ELE2`:** a build field `0176` padded with spaces at `0x04`, the 4-character version `1.74` at `0x10`, the load address `0x40000400` at `0x14`. At `0x18` one packed stream, headed by its length (1,286,709) and byte sum (both match). The container ends with 3 zero bytes, to a 4-byte boundary. There is **no section table**, digest, HMAC or signature: this is the difference from ELE3.
- **Packing:** the aPLib variant used across Elektron OS files, ending in the usual end marker. Its offset field wraps to the bias only in 32 bits, so a decoder with unbounded integers misses it ([trap](ADD_A_MACHINE.md#research-a-coldfire-os-image)). The stream depacks to 2,824,228 bytes (rytm-emu reports the same size). Modwerk's `packSection` writes the same form.

## 2. Exact rebuild (step `rebuild`)

`ele2.ts` rewrites the stock file **byte for byte** from its own stream (identical SHA-256): the container from the stock header and the stream, the preamble's length and checksum, and every data message's counter, 8-in-7 groups and checksum through `encodeSyx`, between the stock framing messages with the new count.

For a changed main OS it packs with `packSection`, writes the stock header with an optional 4-character version, and its verifier refuses the build unless:

- the transport, counters, checksums and framing match stock apart from the message count, and the container is its stream padded to 4 bytes;
- the header equals stock outside the version field, and the load address is the device's;
- the stream depacks, both with `unpackSection` and in place as the bootstrap does it (section 3), to exactly the intended image, with the in-place writer always behind the reader;
- the ranges in section 3 are byte-identical to stock, and the container ends below the calibration records.

On the owner's stock 1.74: the stock stream verifies with an in-place gap of 558,611 bytes; `packSection`'s own pack of the stock image is 1,217,124 bytes of container (smaller than stock) and verifies with a gap of 488,992 bytes; an image with one bit changed inside the bootstrap is refused. The unit tests (`ele2.test.ts`) use synthetic files only.

## 3. What a build must leave alone

Measured statically in MAIN OS 1.74:

- MAIN OS carries an **87,060-byte bootstrap image** at `0x4028C770–0x402A1B84`, its version halfword `0x0602` at `0x4028C768`. The image starts with a vector table for flash address 0.
- **At every boot, the OS entry (`0x40000592`) compares that version with the installed bootstrap's version, read from flash at `0x1FFF8`.** Only if the installed one is lower (an unsigned compare, done twice) does it call the BOOTSTRAP UPGRADE routine at `0x4011A7A4`, which erases the boot sectors and writes the embedded image to flash offset 0.
- The startup menu (TEST MODE, EMPTY RESET, FACTORY RESET, OS UPGRADE) lies inside that bootstrap image, so the recovery route lives in boot flash, which only that compare-and-upgrade path rewrites.
- The bootstrap stages the packed stream at `0x40200000` and unpacks it in place to `0x40000400` (calls at bootstrap offsets `0x1FE`/`0x204`). A denser pack narrows the gap between writer and reader ([trap](ADD_A_MACHINE.md#research-a-coldfire-os-image)), so it is checked for every build.
- NOR flash use by the OS: the bootstrap below `0x20000`, the OS container from `0x20000` (stock ends at `0x15A258`), and calibration records (`RBOW`) read at `0x780000`, `0x7C0000` and `0x7F0000`; no other flash address turned up between them. Its reads near `0x100000` go to the +Drive by 512-byte sector, not to the NOR.

Rules for every modified MKI build (`ELE2_DEVICES['analog-rytm-mki']` enforces the first and the last):

1. Keep `0x40000592–0x400005D8` (the OS entry's compare and upgrade call) and `0x4028C768–0x402A1B84` (the bootstrap and its version) **byte-identical** to stock.
2. Flash only units that have booted the stock OS 1.74 once, so the installed bootstrap is at `0x0602` and the upgrade path never runs from a modified image.
3. Never set the version above stock, mark a modified build in the version field, and never ship a modified bootstrap ([modding guidelines](../MODDING_GUIDELINES.md#keep-a-way-back)).
4. Keep the container below the calibration records at `0x780000`, and the in-place margin above zero.

## 4. Recovery: MIDI DIN only

Elektron's MKI release notes say an OS upgrade from the startup menu goes over MIDI, not USB. Rehearsed with **stock** 1.74 on draadpiraat's unit, 8 November 2026:

| Step | Result |
| --- | --- |
| Update to stock 1.74 over USB with Transfer, then back up | done |
| Startup menu (FUNC at power-on), TRIG 4 OS UPGRADE, stock 1.74 over MIDI DIN | works. Transfer cannot reach a unit in the startup menu (it needs a device connection), so the file went out through a small paced CoreMIDI sender: through a USB-MIDI interface straight to the Rytm's MIDI IN, at about 1,500 bytes/s with 20 ms between messages, in 23 min 14 s. The unit then restarted by itself and played, with no calibration or file system message |
| Same, through a chained interface (a MOTU into an AMT8 in standalone) | stalled at about 40%; a fresh start from the startup menu over the direct interface then recovered the unit |

Notes: quit Transfer before sending (set to a MIDI output it may put its own SysEx into the stream); use an interface straight into the Rytm; keep it connected while testing modified builds.

## 5. Boot (step `boot`)

Modified builds on draadpiraat's unit, 8 November 2026, each flashed over USB with Transfer, with the MIDI DIN route of section 4 at hand. The unit had booted stock 1.74 first, so its installed bootstrap is `0x0602` (rule 2).

| Build | Container | Result |
| --- | --- | --- |
| Control: the stock MAIN OS repacked by elektron-firmware-tool | 1,220,020 bytes, in-place gap 491,890 | boots, a project loads, pads and patterns play |
| Marked: the same, version field `MW01` | 1,220,020 bytes | the start-up screen shows `MW01` where stock shows `1.74` (the field is four characters); boots and plays |
| Stock 1.74 with Transfer | stock | restores the unit: the start-up screen shows `1.74` again, a project loads, pads play, Transfer reads 1.74 |
| Marked `MW05`: the stock MAIN OS packed by `ele2.ts` and `packSection` | 1,217,124 bytes, in-place gap 488,992 | boots; the start-up screen shows `MW05`, a project loads, pads and patterns play as on stock. Stock 1.74 with Transfer then restores the unit again |

All three modified builds pass `verifyEle2Build` against stock (the two elektron-firmware-tool builds were checked after they were flashed, once `ele2.ts` existed). None of them changes the bootstrap or its version check.

So a container that differs from stock only in its stream and version field boots, shows its mark, and stock brings the unit back, over USB with Transfer as well as over MIDI DIN.

## 6. The Modwerk base (step `core`)

The MKI's base is the MKII base's plain variant built for the MKI ([`sdk/machines/analog-rytm-mki/elekloader/`](../sdk/machines/analog-rytm-mki/elekloader/README.md)): core-ar2 0.7's source and the machine list's sections, with the MKI's sites and addresses. Sites were found by matching the Digitakt mk1 1.54 routines elekloader's cores hook (the MKI shares the Digitakt's UI framework; its graphics library lies at `-0x52CA0` from the Digitakt's), by core-ar2's own stock bytes with addresses masked, and by behaviour in rytm-emu; every site's stock bytes are checked by length and SHA-256 at build time.

| Part | MKI 1.74 | Notes |
| --- | --- | --- |
| boot | `0x40000620` | two calls, `jsr 0x40000506` (SRAM copy) and `jsr 0x4000055C` (`.bss` clear), as on the Model:Cycles: core.s's `VBR_FN2` path |
| tick, draw, key, encoder | `0x400A0680`, `0x400A06EC`, `0x400A1FF0`, `0x400A203A` | targets `0x400777BC`, `0x400777F2`, `0x4009E35E`, `0x4009E3EC`; ev_tick at about 20 Hz |
| settings | `0x400D545E` | in the GLOBAL builder `0x400D4E66` (once at boot), which keeps the menu in **a3**: an MKI variant of core_settings |
| render in, out | `0x4011898C`, `0x4011A16C` | vector 191 at `0x40118984`; the handler keeps **no a6 frame** and leaves through `movem.l (sp),d0-a6 ; lea 156(sp),sp ; rte`: an MKI variant of core_render_out takes those 8 bytes |
| storage routines | the MKII's at `-0x120` | all thirteen (save, load, init), same prologues; the `keep2` calls at `0x40034C62`, `0x400ADAE2` (file save), `0x40034EDC` (file load), `0x401616B4`, `0x40162062`, `0x40162284` (song copies), `0x40161A58`, `0x401626FE`, `0x40162930` (pattern copies), `0x400BC8AC`, `0x400A7FD8`, `0x400A95E2`, `0x400A9600`, `0x400C24C0` |
| velocity and aftertouch routes | `0x401187C8`, `0x400C23BA`, `0x400C2346`, `0x400C2248`, `0x400337FA` | the MKII's instructions (setAmount's operand names the MKI's SoundConfigChangedInfo, `0x40199D28`) |
| pages | page_info `0x400F87A2`, get `0x400381A0`, turn `0x400376D4`, text `0x400A5964`, views `0x400C7154`..`0x400C74AA`, page cycle `0x4003A962` | **11 stock pages** (0..10: no second sample page), same 36-byte entries and 469 parameter records. The MKI steps a view's pages by pressing its parameter key again, which reaches the same cycle |
| machines | names `0x4018D6F0`, availability `0x4018D8C8`, records `0x4018E064`, engines `0x40254430` | 53 machines with the MKII's ids, 34..52 hidden; the same offsets between the tables |
| sections | `0x400D89C8` (table `0x4021F98D`), comparators `0x400BACF2`, `0x400BAEB0` | |
| OS upgrade finish | `0x4009D514` | drain `0x40001A2A`, queues `0x405FE9E4`, `0x405FE9F4` |

Memory and storage:

- The sample pool is `0x4313E770–0x4713E7C0`, and nothing above `0x4713E920` up to the stack (`0x48000000`, run down) is named in the image. Mod area `0x47BE0000–0x47C00000`, as on the MKII.
- The MKI keeps its **stored project in persistent memory at `0x20000000`** (2 MB on CS1; rytm-emu models it), at `0x20000110`, not in DDR. The live project is at `0x40B55708`, its global slots at `+0xB50934`. The stored layout is the MKII's (kits at `+0x19D3FB`, 2,610 B; pool at `+0x1F4397`; globals at `+0x1F9DEE`; songs of 1,304 B; patterns of 13,101 B).
- The bytes core-ar2 keeps its fields in, checked in the MKI's own save and load code: a stored sound's `+0x70..+0x7B` (save clears them and writes parameters at `+28..+111` only; load never reads them), a kit's FX block `+0x50..+0x5C` (38 FX words at `+4..+79`), a global slot's `+0x4B..+0x4F` (save writes `+0..+74`). Song rows' byte +2 is zero at rest and through boot in rytm-emu; editing songs was not tested. These bytes stay after a reflash to stock.

On draadpiraat's unit, 8 November 2026, each flashed with Transfer:

| Build | Result |
| --- | --- |
| MW02, a canary of Modwerk's own: `0x47B00000–0x47F00000` filled at boot with `address ^ 0xC0DEF00D`, checked 16 KB per UI tick | `P90 E0 0` with the sample memory full, sound locks, playback and a save: never written. After a power cycle the fill and count start again |
| MW03, core.s's hook bus with a counter per event | `MW03 1349 K132 E74 S1`, `R102601 O102601`: every event, GLOBAL built once, render in and out equal; sound and timing as on stock |
| MW06, this base (no modules), linked by Modwerk's linker and written by `ele2.ts` | a scratch project loads, plays, saves and reloads; GLOBAL and the pages as on stock; it survives a power cycle; stock 1.74 then loads the same project |

`npm run machine:base` builds this base once Elekloader's kit knows the MKI (its device and the ELE2 reader, proposed upstream); with the device registered privately it gives MW06's package section for section.

## 7. Next

- The MKI in Elekloader (device, ELE2 reader, storage profile), then `base-binding.json` and the MKI in the site's linker (`LINK_DEVICES`).
- The send bus, and MKII modules rebuilt for the MKI: each module's own stock addresses found again.
- ELE2 in the site's firmware flow, next to ELE3, once a build boots.
- Later, as on the other machines: the USB link and loading modules without a reflash.
