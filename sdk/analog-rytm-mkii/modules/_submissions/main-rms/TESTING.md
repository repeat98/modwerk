# Main RMS — test report

- Module: `main-rms` 1.0.0, for Analog Rytm MKII OS 1.74 on core-ar2 0.3.
- Source: https://github.com/Iced-Cream/rytm2_mods at `afd461d4a8ef4306bb2a57d4c61ad35c362b3940` (tag `v1.2`), `main-rms`.
  `src/main-rms.s` (`0cd226a1…856d`, rytm2_mods' `main-rms/os1.74/main-rms.s`) and `include/ar2-1.74.inc`
  (`c57431f7…874b`) are byte-identical to it. The source has not changed since rytm2_mods' OS 1.74 port
  (`13ad537`), so v1.1 and v1.2 carry the same file.
- Original: MrScruff's rytm-mods `0009-main-rms`, at its default build's threshold (-18 dBFS RMS).
- Stock OS 1.74: `.syx` `cb0f99d6…e123`, main OS `34cd0c4d…1f3b`.
- Tested build R8T2 (OS 1.74, core-ar2 0.1 ported to 1.74 + eight ports): `.syx`
  `94c8b8c4f3f537132b7ee689ad1221591186f14dc605a420cdefe3df804e3c39`.
- Tested build C3A4 (OS 1.74, core-ar2 0.3 before #153 + all eleven rytm2_mods v1.2 ports): `.syx`
  `04d987ced36850eef5eb5cd1215d411edf621a5af94f980525ab561c9108f951`, main OS `fc871476…d529`.
- Tested build SXH4 (OS 1.74, released core-ar2 0.3 `6b97dfb3…3e58` + the six rytm2_mods v1.2
  objects submitted to Modwerk + a remote-control test layer that shares no site with them): `.syx`
  `e4d01a6aec250bd2af7743c9f8b0e9c560d805b52564932dddc41d872e1c5000`, main OS `0ef422bf…8fb8`.
  Without the test layer the same inputs give SX74, `.syx` `2a352718…4371`.
- Tested build MRH4 (OS 1.74, released core-ar2 0.3 `6b97dfb3…3e58` + this module alone + the same
  remote-control test layer): `.syx` `f3e304ea7454cd1b53801b19cb92b9e71add055bd26e430219328dc56b05606a`, main OS `d8aa3353…14ac`.
- Build MR74 (OS 1.74, released core-ar2 0.3 + this module): `.syx` `f4d7e60de44e77658a05747886d33945dba25d4ea0cfcdb028244e0ecaabf6c0`,
  main OS `70767ae4626140dc98244c4f29e1b09f8dbe53da534820dd5663dd23e6460053`. Emulator only.

## Hardware

On an Analog Rytm MKII with OS 1.74, 2026-10-18, Iced-Cream flashed R8T2 with Elektron
Transfer, ran the build's test steps and restored stock 1.74. This module's step:

9. Select the FX track and press AMP. Play a loud pattern: the VOL label inverts. It clears
   when the output gets quieter.

It passed. On 2026-10-20, in C3A4 (core-ar2 0.3 and all eleven v1.2 ports, including
this module's release object `cbd69edb…5d54`), each mod's own test passed again.
Relinking C3A4's core and v1.2's eleven release objects on stock 1.74 gives C3A4's main OS
byte for byte. Duration was not recorded, and the threshold was not checked against a
calibrated level on 1.74. See [the hardware report](evidence/hardware-testing.json).

On 2026-10-24 and 2026-10-25 the same unit ran SXH4, the released core-ar2 0.3 with the six
Analog Rytm MKII modules submitted together (Ctrl All, Env Reset Amp, Slice Loop, Main RMS,
Euclid Accents, Velocity Humanise) and a remote-control test layer that shares no site with
them. A scripted bench drove it over USB in a `~T` test project, took screenshots and recorded
every output over USB audio, then restored stock 1.74.

For this module: in the first runs the test pattern kept the main output at most -26.5 dBFS
(300 ms RMS), below the -18 dBFS threshold, and VOL stayed plain in every shot: no false
trigger. A short check on 2026-10-25 drove the main output to -3.4 dBFS RMS (peaks at 0 dBFS):
VOL was inverted in all six shots while it played, still inverted 0.4 s and 1.4 s after STOP
while the tails rang out, and plain again 4.4 s after STOP.

In a four-minute play with samples, delay and reverb sends and knob turns, nothing froze and
no output had a gap or level dip. Clicks flagged on the main mix also appear on a build with
the same core and test layer but none of the six modules, so they are not this module's. Results are in the
[hardware report](evidence/hardware-testing.json).

On 2026-10-25 the same unit ran MRH4: the released core-ar2 0.3 with this module as the only
module, plus the same remote-control test layer. The bench flashed the six solo builds one after
another from stock and restored stock 1.74 at the end; every flash finished without a stall.
With the main output at -3.4 dBFS (300 ms RMS, every window above the -18 dBFS threshold),
VOL on the FX track's AMP page was inverted in every shot while playing and 0.4 s and 1.4 s
after STOP while the tails rang, and plain again at 4.4 s and 8.4 s. No output froze or dropped out.

## Source build comparison

The module is a submission (`modules/_submissions/`) until the browser can build it. Modwerk's own validation and compiler path, run on this folder:

```sh
node scripts/machine-modules.mjs --drafts --base origin/main
MODWERK_CROSS=m68k-linux-gnu- node scripts/build-elemod-packages.mjs --output OUT --source-commit <commit> --drafts --module analog-rytm-mkii:main-rms
node scripts/verify-elemod-source-parity.mjs --packages OUT --oracle ORACLE --out RESULT --firmware analog-rytm-mkii:Analog-Rytm_MKII_OS1.74.syx
```

`ORACLE` held elekloader's `core-ar2-0.3.elemod` release (`core-ar2-v0.3`, 769d9aa,
`6b97dfb3…3e58`) and rytm2_mods v1.2's release `main-rms-1.0-os1.74.elemod` (`cbd69edb…5d54`).
The materialised Modwerk package linked with that core gives main OS `70767ae4…0053`,
byte-identical to the core linked with the release object, and to MR74
([source-parity.json](evidence/source-parity.json)). `.run` is 264 bytes, three sites, three
relocations.

Compiler: Ubuntu 24.04 `m68k-linux-gnu` GCC 13.3.0 and binutils 2.42. Modwerk's pinned Docker
toolchain was not run here, and CI's `elemod-source` job compiles published folders only. The
firmware and the linked builds stayed on the owner's computer.

## Emulator

[rytm-emu](https://github.com/trigcondition/rytm-emu) `c5732f0`, headless `dtboot`
([capture plan](media/capture.json)): FX, then AMP, with the sequencer stopped. Every
frame is byte-identical on MR74 and stock 1.74, as expected while the output is quiet.

The lit label was not captured. With the pattern playing and a full-scale square wave on
EXT IN (and, in separate runs, RAT at MAX, or MUP raised and THR lowered), the receive
buffer's MAIN words (`0x80007440`, `0x80007444`) peaked around -30 dBFS, well below the
-18 dBFS RMS threshold. The emulator's analog voice and compressor models are not
calibrated to the unit's levels, so the label's behaviour rests on the hardware runs.

## Load and memory

264 bytes in the shared DDR area, no `.bss`, no fast SRAM. The scan runs in the audio
interrupt once per block (about 1,500 blocks a second): 64 loads, 64 `muls.w`, and two
smoothing steps. The draw wrappers run only when the compressor view draws a knob. Static
reading, not a measurement.

## Not tested

- Other modules beside it, except rytm2_mods' own ports.
- The threshold against a calibrated level.
