# Driving the Octatrack from an agent

How to work a real Octatrack MKII running a Modwerk development base (`build_core.py --dsp-loader --dev`) over
USB: start the link, send steps, read the unit, change things without harming the owner's project, and keep
runs short. Everything here was done on the owner's MKII on 11 October 2026. Why things fail is in
[OCTATRACK_HARDWARE_TRAPS.md](OCTATRACK_HARDWARE_TRAPS.md).

## The rules

- Never SAVE, SAVE ALL or SYNC TO CARD the owner's project, unless the owner asks to recover something.
- Do not change the owner's Parts. Test on a bank whose working Part equals its saved Part (bank B in
  LIVE/Dev12: every Part FILTER/DELAY). Check that with `mem` (below) first, and put it back with `reload`
  afterwards; then both copies must equal the saved copy read before. (Until 11 October 2026 this said
  PART+FUNC+PLAY, which clears: Dev12's bank B Part 1 is named `PART 1` from it.)
- Read the state before you change it, and after you put it back.
- RELOAD needs a Part that was saved at least once. On one that never was, it shows SAVE PART FIRST! and
  changes nothing, though the saved copy reads equal (Dev12's bank B after a RAM boot, 12 October 2026). The
  scripts then pick each changed slot's saved effect back by name (`restore_part` in `octatrack-qualify.py`), which
  restores a cleared Part's default knobs, and check both copies afterwards.
- After a power cycle, check the Part again: the unit can come back with an older working copy from the card
  (11 October 2026: a RELOAD made before the unplug was gone, and picks from before it were back).
- Keep each command short: a few steps, a time limit, its output read at once. A long run goes in the
  background and logs every step, and you look at the log.
- Never power-cycle on your own; ask the owner. Never flash.
- A Keep on a RAM-booted base overwrites the owner's kept modules. The kept set lives in two card files,
  `/MODWERK0.SET` and `/MODWERK1.SET`, written alternately and stamped with the writing base's identity
  (`modset.c`); a base loads neither file another base wrote. Two Keeps on a twin (a `try`, then a `remove`)
  replace both, and after the power cycle the flashed base starts with no modules (23 October 2026, MKII, flashed
  `a408c505`, twin `8dc7692c`). Before a twin, note the flashed set (`inventory`) and where its packages are; base-bound
  ones (Analog BD, Output Matrix) must be the copies bound to that base, from the commit that built it. Afterwards,
  power-cycle and `try` each again.
- After a crash restart, or finding the unit on the flashed base with no power cycle you know of, ask for a power
  cycle before the next RAM boot: one such boot hung at the logo (12 October 2026,
  [traps](OCTATRACK_HARDWARE_TRAPS.md#dsp-loader-dynamic-dsp-code)).

## Start the link

```sh
export PATH=~/.nvm/versions/node/v24.21.0/bin:$PATH   # Node 24; the default node is 18 and cannot load .ts
while :; do npm run device -- serve; sleep 1; done
```

Run it in a terminal of the owner's, or in a background task: those stop after two hours. It starts the USB
bridge, keeps one connection open, pings every 4 s (so MODWERK CONNECTED shows once) and comes back after a
RAM boot. One process at a time: a second `serve` or a one-shot `npm run device` fights it for the bridge. To let the
frontend MCP use the unit beside the session, start it with `serve --share /tmp/modwerk-share.sock` and the MCP with
`--device-socket /tmp/modwerk-share.sock`: each MCP control transfer runs between the session's. Then only one of them
stages modules at a time (the MCP's sync, or the session's `try`/`remove`); the session reads and presses keys.
After an unplug, a crash restart or a RAM boot, the bridge can hold a dead handle; `pkill -f usb_bridge;
pkill -f '^node scripts/device.mjs serve'` and the loop starts both again. Anchor the pattern: without `^` it also
matches any shell whose command line contains it (the loop's, or the one running `pkill`), and kills that.

**On Windows, from WSL** (12 October 2026). WSL sees no USB device, and the unit binds WinUSB by itself, so the
bridge runs in Windows Python and serves TCP; with WSL's mirrored networking (`networkingMode=mirrored` in
`.wslconfig`), WSL reaches it on 127.0.0.1. usbipd is not needed.

```sh
# Windows, once: a venv with pyusb and libusb-package (cmd expands %LOCALAPPDATA%; a path with non-ASCII
# characters cannot be passed from WSL). Then, each time:
#   "%LOCALAPPDATA%\modwerk-usb\venv\Scripts\python.exe" -B octatrack-usb-bridge.py 47811
# WSL:
while :; do node scripts/device.mjs serve --socket 47811; sleep 1; done
```

The bridge runs from a copy of `octatrack-usb-bridge.py` on the Windows side. Stop it with PowerShell's `Stop-Process` (find
it with `Get-CimInstance Win32_Process`; `wmic` is gone). `boot` and `try` on Windows need a client from 12 October
2026 or later: older ones send 4,148-byte frames, which WinUSB refuses
([traps](OCTATRACK_HARDWARE_TRAPS.md#usb-and-ep0)).

## Send steps

```sh
scripts/device-send.py 'part2 pick:T1:FX2:E-Verb stats'
perl -e 'alarm 10; exec @ARGV' scripts/device-send.py ui   # with a time limit
```

One line, steps separated by spaces, the reply printed. A request has a 20 s limit; the session answers an
error and moves on. macOS `nc -U` hangs up before the reply, so use the script.

| Step | What it does |
|---|---|
| `KEY`, `KEY+KEY`, `KEY*N` | press (holding all but the last); `T1`-`T8`, `TRIG1`-`TRIG16`, `FX1`, `FX2`, `SRC`, `AMP`, `LFO`, `FUNC`, `YES`, `NO`, `UP`, `DOWN`, `LEFT`, `RIGHT`, `PLAY`, `STOP`, `REC`, `CUE`, `PATTERN`, `BANK`, `PAGE`, `PROJ`, `PART`, `AED`, `ARR`, `MIDI`, `SCENEA`, `SCENEB`, `PUSHA`-`PUSHF` (`FUNC+PAGE`: PATTERN SCALE, where LEVEL sets the length) |
| `+KEY`, `-KEY` | hold, let go |
| `encA+3`, `encLEVEL-2`, `fader128` | encoders A-F, LEVEL, the crossfader. Some setup values take several detents a step: MIDI NOTE SETUP's CHAN, BANK and PROG did not move on `encA+3`, and `encA+20` moved CHAN by 6 (21 October 2026) |
| `w300` | wait 300 ms (rarely needed: the steps below wait for their own result) |
| `pick:T1:FX2:SPRING_REV` | pick an effect by name (spaces as `_`), FX1 or FX2: the chooser opens, LEVEL scrolls the exact rows, YES; done once the track runs it (about 120 ms after YES); fails at once if the loader refuses. A notice on screen eats its first keys and it times out after 5 s: after removing a module the bank names (MISSING MODULES) send `YES` first |
| `part1`-`part4` | switch Parts (PART + an arrow), done once the Part changed |
| `ui` | each track's FX1/FX2 as they run, the current track, Part, transport |
| `stats` | CPU, each core's mean/peak per mille, idle passes |
| `loader` | packets accepted, rejected, errors, jobs, selections, commits, rollbacks, code words per core |
| `mem:0x80000ec4:16` | RAM in hex, read-only, any length, within 0x40000400-0x40cfffff (short of the pool's end and the loader's statics), 0x46000000-0x46ffffff, 0x80000000-0x8000ffff and the battery RAM's records 0x100f0000-0x100fffff (`dev.c`); the battery-RAM Part copies are outside it |
| (any sequence) | answers within 20 s beyond its own `w` waits, else an error, and the next request runs |
| `png:/path.png` | a screenshot, 256 x 128: cheaper to read than the text rendering |
| `screen` | the screen as block characters (thousands of tokens; avoid) |
| `crash` | the last crash record (vector, PC, registers); `crashtest` makes one |
| `selftest` | PROJ > MODWERK > SELF TEST over USB: start it (transport stopped), wait, print the verdict, the modules that ran and the CPU and core peaks |
| `stall` | the last DSP stall record: why, the loader's whole report, each core's last packet header, the live FX ids, as they stood when the stall was seen (it survives the power cycle); `stalltest` writes one now |
| `guard`, `guard:MILLE` | the frame guard since the last read: the frame interrupt's longest frame, latest start and share of the CPU, the machine renders it skipped and on which tracks, and its share; `guard:MILLE` sets the share (per mille of a frame, `guard:65535` turns it off) |
| `try FILE`, `remove FILE` | install or remove a module package, accepted at once |
| `flash DIR` | after `boot DIR`: that base writes its own container (`DIR/NOT_FLASH_CANDIDATE.bin` deciphered) to NOR with stock's routines, verifies it and restarts on it; refuses any other base's. Not yet run on a unit; the owner's call ([traps](OCTATRACK_HARDWARE_TRAPS.md#writing-nor-over-usb)) |
| `boot DIR`, `boot DIR 4096` | RAM boot a `build_core.py` output; the session restarts on the new base. From the flashed `usbtest9` on macOS add 4096 (bytes a frame): it times out on the default 4,095-byte frames ([traps](OCTATRACK_HARDWARE_TRAPS.md#usb-and-ep0)) |

## The panel, as it behaves

- **Effects.** FUNC+FX1/FX2 opens the chooser (the left list; its right side are the effect's setup knobs).
  Moving the cursor does not pick; YES does. NO closes. LEVEL scrolls. `pick:` does all of it.
- **Parts.** Holding PART shows the selector: UP Part 1, RIGHT 2, DOWN 3, LEFT 4. A switch also assigns that Part to the
  current pattern (stock), so switch back to the pattern's own Part (the byte in the table below) before you leave. **Never FUNC+PLAY there
  (`PART+FUNC+PLAY`): it CLEARS the Part**, both working and saved copies, its knobs, machines and name
  (`PART 1`), and saves that (stock's Part Clear; 11 October 2026). FUNC+PLAY elsewhere clears the pattern.
  To reload, use `reload`: FUNC+PART opens RENAME, RELOAD, SAVE, SAVE ALL, keeps its cursor from last time and
  stops at RENAME, so UP three times, DOWN, YES. Do not use SAVE or SAVE ALL. `reload` reports no failure: compare
  the Part with its saved copy afterwards (SAVE PART FIRST! above).
- **Patterns.** PATTERN+TRIG n selects pattern n of this bank. Another bank: BANK, then TRIG b (bank b), then
  TRIG n (pattern n) within four seconds (the manual's "CHOOSE BANK", "CHOOSE PATTERN"). Stopped, it applies
  at once; playing, it waits for the pattern's end.
- **Samples.** FUNC+SRC opens SRC SETUP on the machine list; RIGHT enters the slot list; YES on a slot
  assigns it; YES on an empty slot opens the card browser (LIVE/AUDIO). Parts store each track's slot.
- **Modwerk's pages.** PROJ's fifth category, MODWERK (from S55, 12 October 2026), lists LOAD (the status dialog,
  also CUE+PROJ from anywhere), MODULE LOAD, MISSING and SELF TEST; NO closes each. The list keeps its cursor from
  last time, like stock's, so go UP to its top before counting rows down. On older bases these were SYSTEM >
  MODWERK and MODWERK TEST.

## Where the state is (OS 1.40C)

| What | Where |
|---|---|
| current track, Part | byte `0x80000000`, byte `0x80000003` |
| what each track runs (FX1 T1-8, then FX2) | 16 bytes at `0x80000ec4`; a Part's effects reach it at each track's next trig while playing, not at a stopped pattern change. A track without trigs keeps the last bank's effect (16 October 2026, twin of `38a0bde1`: B01's DELAY never reached trigless tracks that ran DARK REV), so test a pick's admission on tracks with trigs or in a blank project. A trigless track keeps the last bank's machine too: from bank A (Analog BD on T1) to bank B, T1 kept rendering Analog BD and asking for its lease (22 October 2026, twin `df19fdca`); a RELOAD of bank B's Part, then bank C, cleared it |
| current bank | `0x46c82456` holds its base: `0x400e21e0 + bank * 0x9b340` |
| a working Part's effects | 16 bytes at bank base `+ 0x8ed80 + part * 6322` (the whole Part is 6,322 bytes) |
| the saved copy | bank base `+ 0x9504a + part * 6322` |
| a pattern's Part | byte at bank base `+ pattern * 0x8ed8 + 0x8e57` |
| current and queued bank/pattern | bytes `0x800065bd`/`be` (current), `bf`/`c0` (queued; equal to the current ones when nothing waits); long `0x800065b8` = 1 while playing |
| effect ids and chooser rows | FX1_IDS `0x400d5f58`, FX2_IDS `0x400d5fdc` (id -> descriptor, name at +9), FX1_ID2POS `0x400d60d0`, ID2POS `0x400d6150` (id -> row) |
| chooser cursor | FX1 `0x460d5c94`, FX2 `0x460d5ca8` |
| input layers (menus, windows) | list at `0x460d165c`: two entries with no menu open |
| crash record, stall record | `0x100ff800`, `0x100ff900` (battery RAM) |

To compare a Part's working and saved copies: `mem:` both addresses with length 6322 and compare the output.

## Fast and safe habits

- One session; a handful of steps per command; `perl -e 'alarm N; exec @ARGV'` around anything that talks to
  the unit.
- Let steps wait for their result (`pick:`, `part`), not fixed `w` waits.
- After a power cycle, the first `npm run device` command often fails while the bridge reopens the unit; run it
  again before treating it as a fault. `status` then shows generation 0 and the base's own digest as the active
  set even when kept modules were restored ([case 16](OCTATRACK_MODULE_EDGE_CASES.md)); `npm run device -- do
  inventory` lists what is installed (a contributor's MKII, beta bases `38a0bde1…` and `99336d35…`, 15 October 2026).
- Before a test: `ui`, the bank and Part bytes, the Part's working-equals-saved check. After: restore and
  read them again.
- Long runs (`scripts/octatrack-qualify.py`, benchmarks) in the background with a progress log; look at the
  log instead of waiting.
- If the screen does not change for a minute, the run is stuck: kill it, restart the session, read `ui`.
- Audio: `~/.cache/modwerk-octatrack/tools/rec SECONDS OUT.wav Octatrack` records MAIN and CUE over USB
  (4 channels, 44.1 kHz, 32-bit). A sustained sound (a looped sample) shows clicks; a clap does not.
  Recording costs the ColdFire about 15 CPU points while it runs (20 October 2026, base `908f0107`: playing 61-64 %,
  recording 77-78 %), so read CPU without it. A dropout shows as a run of exact zeros or a block of 16-64 samples
  played twice inside sound; the `gap` step (longest time between frames, normally 380-420 us) is the DSP-side check.
