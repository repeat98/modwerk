# Zoom G1 FOUR (ZD2 effects): research report

Status: **research, started with the owner's go-ahead on Discord (November 2026).** The G1 FOUR has a profile
in `sdk/machines/zoom-g1-four/` (family `zoom`, steps `format` and `load` done since 5 November 2026, `mods` open).
Modwerk lists no ZD2 effects, and nothing here is a module contract. The ZDL family (MS-70CDR, MS-50G, MS-60B, G1on) is in
[ZOOM_MULTISTOMP.md](ZOOM_MULTISTOMP.md); its pedal page, link, MIDISTOMP base and proposed
[`zdl` contract](ZDL_MODULE_CONTRACT.md) do not apply to the ZD2 pedals ([what does not carry over](#what-does-not-carry-over)).

Tags: **[HW]** observed on the developer's own G1 FOUR on firmware 2.00, in the public
[hardware test log](https://github.com/Blindsmyth/Zoom-G1Four-Custom-Fx/blob/main/docs/hardware-test-log.md);
**[FW]** read from a static disassembly of the stock 2.00 OS, never run; **[CORPUS]** parsed from Zoom's
published effect files; **[PUB]** public research by others; **[UNK]** unknown. Addresses, sizes, hashes and file
structure only: no firmware, stock effect bytes, disassembly or tables. Addresses are for OS 2.00 only.

## Inputs

| Input | Identity |
| --- | --- |
| `G1_FOUR_v2.00_Mac_E.zip` (Zoom's Mac updater, kept off the repository) | 2,507,214 B, SHA-256 `f90c831af6a8d43ec480f69d78a6a1c16369ac7902a8a85086aa581720b05010` |
| `Main.bin` (the OS, a TI AIS image) | 493,412 B, SHA-256 `43060686fce75e175a217194ab1be3aeffe0be7d59f9d3df4181d41b9d3cc5a7` |
| `ROM.bin` (bootloader, AIS) | 163,840 B, SHA-256 `5ee756a5dee51b4e790a6e6f6b6c0a8a1ea531c245a13124e8a5897530b01622` |
| `FS.bin` (factory file system) | 3,137,536 B, SHA-256 `7dd2821c02414d548b900b31586a1b42ccf1a4a4bd1e69208cb427211606f8aa` |
| `Preset.bin` / `MAIN_INFO.bin` | 45,056 B `969e9565…3d3a29` / 4,096 B `8d18a375…4022f38` |
| Effect corpus | 508 stock G-series ZD2 files from Zoom's own download server (130 of them on the G1 FOUR's list) and 489 MS Plus files, parsed in full |

Tooling: AIS unpacked with MIDISTOMP's `ais.py` approach, disassembled with TI `dis6x` (C6000 CGT 8.3) after
adding the C674x ISA attributes to the ELF (without them `dis6x` leaves the 16-bit compact instructions as data).
The research scripts stay with the developer; only the [checker and builds](#public-research) are public.

## Hardware and firmware

- TI C674x DSP (C6745 family), TI SYS/BIOS, effects loaded by TI's dynamic loader (DLOAD) [FW]. One OS
  codebase names the G1, G1X, B1 and B1X FOUR; only the G1 FOUR has been tested [FW][UNK].
- Flash: bootloader `0x000000` (160 KB), `Preset.bin` `0x028000`, OS `0x033000` (560 KB area, 80 KB unused in
  2.00), `MAIN_INFO` `0x0BF000`, file system from `0x0C0000` (about 3 MB) [FW].
- The bootloader checks only the `Zoom Corporation` marker in `MAIN_INFO` and the AIS opcodes: **no checksum
  or signature on the OS** [FW]. The official updater erases `MAIN_INFO` first and writes it last, and rewrites
  the bootloader on every update [FW]. Update mode sits in the bootloader, so a broken OS stays recoverable as
  long as the bootloader is never touched [FW, not tested]. No OS image has been modified for Modwerk, and the
  route below needs none.
- SysEx: `F0 52 00 6E <command> … F7`. Command `60` is the file system (open, read, write, delete, list, disk
  free), `64` parameters and the current patch [FW]; these are the commands zoom-zt2 uses [PUB][HW]. Several
  other commands are implemented and undocumented; never send them blindly [FW].
- File system: 766 blocks of 4 KB, a directory in four rotating copies, 105 factory files including 75 effects,
  the effect list `FLST_SEQ.ZT2` and a guard list of 80 retired effect file names the OS refuses to open [FW].
  Never name an effect after a guard-list entry.

## The ZD2 file

- A `ZDLF` header (120 bytes) around a TI C674x ELF, chunks in the order `ICON TXJ1 TXE1 INFO DATA PRMJ PRME`;
  `INFO` holds four words and the float DSP load [CORPUS], consistent with Stomphacks' ZD2 notes [PUB].
- The OS refuses a file over 163,840 B, a header target without bit `0x2`, and a header byte at offset 88 above 4.
  It does **not** check the CRC (nine stock files ship with a wrong one); keep it valid anyway for Guitar Lab and
  the installers. Unknown chunks are skipped. A malformed file is refused gracefully; a well-formed file with
  bad code is what crashes [FW][CORPUS].
- ELF invariants of all 508 stock files: `ET_DYN`, an entry symbol `Dll_*`, no undefined symbols, only `ABS32`,
  `ABS_L16` and `ABS_H16` relocations, `.text` aligned 32 and `.const` 8, `DT_TEXTREL` and never `DT_BIND_NOW`,
  `DT_INIT`, `DT_FINI` or `DT_NEEDED` [CORPUS]. Stock effects link their own divide helpers statically and some
  carry writable data and relocated jump tables [CORPUS].

## Loading and resources

| Resource | Value | Evidence |
| --- | --- | --- |
| Effect slots | 5 (the 5-effect chain) | [FW] |
| Loaded image per slot (sum of `PT_LOAD`) | 40,960 B; the largest G1-listed stock effect is 34,705 B | [FW][CORPUS]; whether an oversize image is refused or overruns is [UNK] |
| Delay buffer per slot | 529,200 B (3.0 s of mono float); smaller than the MS-70CDR's | [FW] |
| File size | 163,840 B | [FW] |
| Effect state area | about 192 B is the floor stock effects prove | [PUB] for the MS series; G1 FOUR size [UNK] |
| DSP budget per patch, per-block cycle budget, watchdog | not measured | [UNK] |

The entry routine `Dll_*` fills a 36-byte per-slot struct: the parameter-table count and pointer, an optional
footswitch table and the effect image info. Words +16 to +32 are **callbacks the firmware calls** (tap/mute,
tempo, pitch update, amp output level), not sizes. A callback left registered must match the effect's own state
layout, because the firmware calls it outside the effect's control; an effect that writes only the three
required words is complete [FW][CORPUS].

Every call gets a host context table. Word 1 is the effect bus (32 floats, processed in place); words 7 and 8
are the output shuttle pair. Words 3 and 4 point at **firmware code**, not buffers: writing through them
overwrites the running OS. Words 40 to 61 are host services (parameter read, `memcpy`, `memset`, float divide,
`int` to float, `logf`, `powf`, `sqrtf`, `sinf` and others), for edit handlers, never per sample [FW]; the divide
and `int` to float words are proven by stock use [CORPUS].

## Built on the pedal

All on one G1 FOUR, firmware 2.00, autosave off; every crash recovered with a power cycle [HW]:

| Build | Result |
| --- | --- |
| A stock effect with only its ID and name changed, and one repacked unchanged | loads and plays |
| A stock effect disassembled and reassembled unchanged, then with `.const` alignment, stripped symbols and exported profiling symbols matching stock | **crashes** in every variant (freeze or a loud high tone); the cause is [UNK] |
| A stock effect with a 32-byte, then a 96-byte compiled kernel patched over its audio function | runs: passthrough, then a clean −6 dB, so compiled code runs on the pedal |
| Tape Chorus: original code (Airwindows ToTape9 flutter, MIT) appended to a stock effect, with a trampoline at its entry | runs in stereo and mono, declared loads 10.6 % and 6.0 % |
| **CR Gain** (5 November 2026): Stomphacks' gain kernel and generated scaffold, no Zoom bytes at all, with only the header target changed from the MS Plus bit `0x0090` to `0x0002` | **runs**: plays, survives browsing past it, the Level sweep, bypass and a chain edit; removed cleanly, and the pedal boots normally afterwards |

Installing over USB with zoom-zt2's file commands (the effect file, then its record in the live effect list,
then a power cycle) and removing again work [HW]. A stall leaves the pedal powered; closing the file session
first and never power-cycling mid-transfer kept the file system whole [HW].

## Where the steps stand

- **`format`: done.** Container, ELF, entry struct, callbacks and host context are documented, and CR Gain's
  generated init, bypass and edit handler, written from Stomphacks' published ABI, work on the pedal [HW]. Only a
  one-knob effect has been tried: selectors, footswitch modes and the delay buffer are not.
- **`load`: done.** CR Gain, built from original source alone, loads on the stock 2.00 firmware, plays and is
  removed again [HW]. The reassembled stock effects still crash for reasons unknown, and no longer matter.
- **`mods`: open.** No module contract yet. The grafted builds above stay unlistable; clean-room builds like CR
  Gain are the kind Modwerk could list.

### The clean-room route

Stomphacks' pipeline (MIT) generates everything around a C kernel from its documented ABI, and the G1 FOUR takes
the result after one header change: the target bitfield, which needs bit `0x2`. Where G1 stock effects differ and
CR Gain ran anyway: one picture record in the image info instead of three, Stomphacks' own `ICON` frame, all
undecoded header fields zero, `DT_BIND_NOW` set, and no copy through the `ctx[7]`/`ctx[8]` shuttle [HW]. The
entry struct, bus layout, instance slots, coefficient slots and host-service words Stomphacks documents for the
MS-70CDR+ match the G1 FOUR's [FW][HW]. Stomphacks' ID policy and its 270 raw DSP budget are the MS Plus pedals';
the G1 FOUR shows declared load as raw/2.5 %, and its budget is [UNK].

## What does not carry over

- **The pedal page and its link** (`src/engine/zoom/`) install ZDL files into the ZDL pedals' effect list and
  check ZDL effect IDs. The G1 FOUR uses the same file commands but a different effect list and its own IDs, so
  it has no pedal page (`isZd2Pedal` in `src/devices/registry.ts`) until the link knows ZD2.
- **MIDISTOMP** does not run on the G1 FOUR, and no OS change is planned: effects load on the stock OS.
- **The `zdl` contract** is for ZDL files. A ZD2 module needs its own entry in that proposal or a sibling one,
  with Stomphacks' effect-author ID ledger as the model for IDs [PUB].
- **Ziddle** emulates the ZDL pedals; whether it runs ZD2 effects is [UNK]. It is never hardware evidence.

## Public research

- [Blindsmyth/Zoom-G1Four-Custom-Fx](https://github.com/Blindsmyth/Zoom-G1Four-Custom-Fx) (MIT): CR Gain and its
  clean-room build (`cleanroom/`, `scripts/build_cleanroom.sh`), Tape Chorus, ABI notes, safety rules and the
  hardware test log. It ships no Zoom file: the user fetches the stock effect
  from Zoom's server and builds locally.
- [mungewell/zoom-zt2](https://github.com/mungewell/zoom-zt2) (MIT): SysEx file and effect-list tools for the ZD2
  pedals; its README reports G1 FOUR testing.
- [thammer/stomphacks](https://github.com/thammer/stomphacks) (MIT): ZD2 effects from C with no Zoom bytes, for
  the MS Plus series, hardware-tested on an MS-70CDR+, with safety rules and an effect-author ID ledger. Its
  pipeline builds for the G1 FOUR too (above); its other rules were written for the MS Plus pedals, so check each.
- [freelender/nam-to-zoom](https://github.com/freelender/nam-to-zoom) (MIT): NAM A2 Lite captures as ZD2 effects
  for the MS Plus pedals, on Stomphacks' pipeline.
- [Barsik-Barbosik/Zoom-Firmware-Editor](https://github.com/Barsik-Barbosik/Zoom-Firmware-Editor): extracts
  effects from Zoom updaters; its README says repacking did not work on the G1 FOUR.

## Next steps

In order. Guitar Lab stays the fallback install, and every write to the pedal is persistent.

1. ~~An effect from original source alone runs~~ and ~~knob handlers of its own~~: done with CR Gain
   (5 November 2026).
2. **First real effects on the clean-room route:** a NAM player from nam2zoom's A2 Lite host (MIT, built on the
   same pipeline) is being worked on in Blindsmyth/Zoom-G1Four-Custom-Fx; its CPU cost is the open question.
3. **Measure the budgets:** per-block cycles on the pedal (timer counter around the audio call), the patch DSP
   limit, the state area and what an oversize image does.
4. **A ZD2 module contract** (with the `zdl` proposal or beside it), an effect-ID ledger and a recovery path
   users can follow. Owner review.
5. **The pedal page for ZD2:** the existing link taught the G1 FOUR's device ID, effect list and IDs, read-only
   first. Shared SDK work in its own pull request.
