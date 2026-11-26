# Driving the Octatrack from an agent

Drive an Octatrack, MKI or MKII, over USB with a development twin on your own unit: all of [the test
procedure](TEST_PROCEDURE.md) runs there, the curve included. Build it with `build_core.py` and the flags that
`scripts/octatrack-base.mjs` passes for `--beta`, without the controller rows, plus `--dev` and an `--output` outside Git,
then `npm run device -- boot` that folder. Without the controller rows the twin trusts no base-bound module (Analog BD,
Sidechain, Output Matrix). To test one on a twin, build it as `octatrack-base.mjs` does, plus `--dev`: the empty-row pass,
`base_bound.py rows` against its `symbols.json`, then the build with `--controller-policies` and `--controller-layout`.
Analog BD's reviewed recipe refuses the twin's layout, so capture a twin-only one (`build.py --octabam-machine
analog-bassdrum --base-symbols … --capture-stock-recipe`), swap it into `machine-recipes.json` for those two steps and put
the committed file back (twin `80f62ad6`, 13 November 2026).
On Windows keep the default chunk size, so a transfer fits WinUSB. The `serve` loop hands boots to that client and reconnects afterward. For failures see
[OCTATRACK_HARDWARE_TRAPS.md](OCTATRACK_HARDWARE_TRAPS.md).

## The rules

- Never SAVE, SAVE ALL or SYNC TO CARD the owner's project, unless the owner asks to recover something.
- Do not change the owner's Parts. Test on [a test bank](TEST_PROCEDURE.md#a-test-bank), first checking that its working
  Part equals its saved one (`mem` below, or `scripts/octatrack-preflight.py`); `reload` it afterwards, then both
  copies must equal the saved copy read before.
- Read the state before you change it, and after you put it back.
- RELOAD needs a Part that was saved at least once. On one that never was, it shows SAVE PART FIRST! and
  changes nothing, even when its working and saved copies matched before the test. Picking the original effects
  back can leave their knobs at defaults. Before editing a scratch Part, check whether another Part in that bank
  is byte-identical to its starting working and saved copies. To restore from that duplicate, recheck its bytes,
  select it, press `PART+FUNC+REC`, and verify COPY PART names the source. Close the selector with NO, select
  the scratch Part and press `PART+FUNC+STOP`. Verify PASTE ON PART names the destination, then close with NO.
  This uses the Part clipboard. Read back both copies and restore the pattern's original Part assignment.
- After a power cycle, check the Part again: the unit can come back with an older working copy from the card
  (11 October 2026: a RELOAD made before the unplug was gone, and picks from before it were back).
- Keep each command short: a few steps, a time limit, its output read at once. A long run goes in the
  background and logs every step, and you look at the log.
- Never power-cycle on your own; ask the owner. Never flash.
- Leave the CF card in for a trial. A twin loads no set another base wrote (`do saved` reads card set 4, FOREIGN;
  `do adopt` makes its next start load it, writing none) and a trial writes none: `device:test` fails if `saved` reads differently afterwards. `npm run device -- boot <flashed image>`
  returns to the flashed base, which loads the owner's set from the card again. Ask for no card swap or power cycle.
- A Keep on a RAM-booted base overwrites the owner's kept modules. The kept set lives in two card files,
  `/MODWERK0.SET` and `/MODWERK1.SET`, written alternately and stamped with the writing base's identity
  (`modset.c`); a base loads neither file another base wrote. Two Keeps on a twin (a `try`, then a `remove`)
  replace both, and after the power cycle the flashed base starts with no modules (23 October 2026, MKII, flashed
  `a408c505`, twin `8dc7692c`). A base with no set of its own on the card saves first to `/MODWERK1.SET`, then to each
  other file in turn (`modset.c` `slot`), so one Keep on a twin replaces only that file. The kept set's whole-set identity
  (USB request 38, order-free: `journal.h` `runtime_journal_set_digest`) names its exact packages: hash candidate files
  the same way to find them before a twin overwrites anything (flashed `dfa43813`, 20 November 2026). A twin's RAM boot
  that restores its kept set can take 72 s to answer on USB, past `boot`'s 60 s wait: keep polling `status`. Boot into a kept twin from another image: the one boot from a twin into itself, seconds
  after its Keep, never enumerated (Windows, `a328967d`, same day). Before a twin, note the flashed set (`inventory`) and where its packages are; base-bound
  ones (Analog BD, Output Matrix) must be the copies bound to that base, from the commit that built it. Afterwards,
  power-cycle and `try` each again. `npm run device -- lifecycle` is such a pair too: it accepts a test module, then
  its removal. It is not a read; never run it on a unit whose kept set matters (30 October 2026, MKII, twin `04e94075`).
  The flashed base can also come back short of a machine with no Keep at all (30 October 2026, MKII, flashed
  `b30d9b09`, after a twin `04e94075` whose `try` ended needs-recovery): the boot's restore loaded FM Synth but refused
  SYNTIZ as busy while the project played (`diaglog`'s set record names the refused module; code 5), and every later
  submission was refused ("The device kept refusing the submission"; `recover` found nothing). A RAM boot of the
  flashed base's own image, transport stopped, restored both. Check `inventory` after any twin and any power cycle,
  and leave the transport stopped for the first seconds after a boot.
  To listen to a machine on a twin, start its `try` first, then load the project: a project loaded while the machine
  was absent keeps its tracks drawn as FLEX until a trig or a Part change. Listen during the trial, and load a project
  without the machine before it ends. A machine's trial that ends while tracks name it answers needs-recovery, and
  what plays afterwards is not the module's sound (30 October 2026, MKII, twin `04e94075`).
  A machine with a DSP engine needs its whole package built for the twin (`base_bound.build` with the twin's binding,
  its recaptured recipe in place): the twin build's own `rows/<id>-work` package is the controller alone, and the
  base refuses that machine's pick without a box, the track staying on its old machine (Analog BD, 17 November 2026).
- Verify an Undo's active identity and inventory after the reply; a ready host UI alone is insufficient. On a contributor's MKII (25 October 2026, private base `52c291c2…`), a 12-module timed Undo left recovery/active unknown and standard
  rollback retries still returned needs-recovery. Stop installing and ask the owner to power-cycle when recovery cannot finish;
  a USB replug does not end it, and a RAM boot from it fails (22 November 2026, #1386).
- After a crash restart, or finding the unit on the flashed base with no power cycle you know of, ask for a power
  cycle before the next RAM boot: one such boot hung at the logo (12 October 2026,
  [traps](OCTATRACK_HARDWARE_TRAPS.md#dsp-loader-dynamic-dsp-code)).
- A unit the host never enumerates after a start (#1985: about one RAM boot in three on 22 November 2026) offers itself
  again from base 0.8 on, within 5 s and up to five times, and logs a `usb` incident; still absent, replug the hub first.

A whole set publishes and rolls back one acknowledged engine turn per changed
row, up to 128 rows. The frontend gives publication and Undo/recovery 500 ms a
row, ten seconds at least; 20 changes at 200 ms between requests took 3.8
seconds before USB latency. An
unconfirmed reply still stops the connection, and restoration is verified
before reporting success.

## Taking turns on the unit

Every session on one computer shares its one unit, and the device commands wait in line for it by themselves
(`npm run unit -- status`): what waits, what goes beside a turn, holding and keeping the turn across commands, the
owner's priority and stuck holders are in [UNIT_QUEUE.md](UNIT_QUEUE.md).

## Start the link

**One Elektron device on the Mac's USB.** The bridge opens the first device with Elektron's vendor id that offers the Modwerk interface; before 27 October 2026 it opened the first Elektron device of any kind, so an Analog Rytm on Overbridge plugged in beside the Octatrack made every request fail ("unit went away", "no unit running the test base"). Unplug other Elektron devices before a RAM boot or a flash all the same: on that day a RAM boot staged with a Rytm attached failed part-way and hung at the logo, and the retry with the Rytm unplugged came back. Other USB audio gear too: on 10 November 2026 a RAM boot with a Zoom pedal on another hub started but never came back on USB, and with the pedal unplugged every boot did (cause not separated).

**The unit must run a Modwerk base.** A unit on the stock OS or an octabam card remix offers only USB mass storage (interface class 8), so `serve` says "No unit running the test base (Modwerk vendor interface) on USB" whatever the cable, hub or other devices. Check before debugging cables: `ioreg -r -c IOUSBHostInterface -l -w0 | grep -E '"(USB Product Name|bInterfaceClass)" ='` shows the Octatrack with class 255 (the Modwerk interface) only under a base; class 8 alone means no base.

Keep emulator socket paths short, including the host path behind a container bind mount. A long host output path can fail with `usb: cannot listen` even when its container alias is short.

```sh
export PATH=~/.nvm/versions/node/v24.21.0/bin:$PATH   # Node 24; the default node is 18 and cannot load .ts
while [ -f scripts/device.mjs ]; do npm run device -- serve; sleep 1; done
```

Run it in a terminal of the owner's, or in a background task: those stop after two hours. Start it from a checkout
that stays, not a pull request's worktree: once that is removed, the link is gone and the loop ends (a `while :` loop
failed every second instead and held the unit, 28 October 2026). It starts the USB
bridge, keeps one connection open, pings every 4 s (so MODWERK CONNECTED shows once) and comes back after a
RAM boot. One process at a time: a second `serve` or a one-shot `npm run device` fights it for the bridge. To let the
frontend MCP use the unit beside the session, start it with `serve --share /tmp/modwerk-share.sock` and the MCP with
`--device-socket /tmp/modwerk-share.sock`: each MCP control transfer runs between the session's. Then only one of them
stages modules at a time (the MCP's sync, or the session's `try`/`remove`); the session reads and presses keys.
The session’s `try FILE` accepts immediately. For a temporary trial, use the MCP’s review/trial/Undo flow or
the one-shot `npm run device -- try FILE` without `--accept`; do not use session `try` as an automatic Undo test.
A private module-only trial does not inherit the flashed base's kept module set. To test companions, prepare copies bound to the exact temporary base and review/trial the complete set; a Keep on the twin is not an inventory-recovery step. A host client's own trial timer can also remove the set while its USB keepalive is still healthy. State the timeout and distinguish it from a RAM clear or restart.

Keep one uploader owner throughout a retained trial. A second
`UploadSession.connect` sends HELLO and advances the vendor sequence. The host
reads the current sequence before each command, including ENTER on timed Undo. Shared observers
may read identity, inventory and load or drive panel requests; do not SUBMIT
another upload frame while the first client retains ownership. Close paired Modwerk browser tabs before a native USB Audio trial. When the unit reconnects with new audio interfaces, a paired tab can claim the vendor interface and run its unfinished-sync recovery.

After an unplug, a crash restart or a RAM boot, the bridge can hold a dead handle; `pkill -f usb_bridge;
pkill -f '^node scripts/device.mjs serve'` and the loop starts both again. Anchor the pattern: without `^` it also
matches any shell whose command line contains it (the loop's, or the one running `pkill`), and kills that.
A sequence can also stall past the 20 s limit below (24 October 2026, once, a twin, after `PLAY` and a pick; the unit
answered as soon as the session restarted). So give `device-send.py` an alarm, and when the session stops answering,
kill the serve with the second `pkill`.

**On Windows, from WSL** (12 October 2026). WSL sees no USB device, and the unit binds WinUSB by itself, so the
bridge runs in Windows Python and serves TCP; with WSL's mirrored networking (`networkingMode=mirrored` in
`.wslconfig`), WSL reaches it on 127.0.0.1. usbipd is not needed.

```sh
# Windows, once: a venv with pyusb and libusb-package (cmd expands %LOCALAPPDATA%; a path with non-ASCII
# characters cannot be passed from WSL). Then, each time:
#   "%LOCALAPPDATA%\modwerk-usb\venv\Scripts\python.exe" -B octatrack-usb-bridge.py 47811
# WSL:
while [ -f scripts/device.mjs ]; do node scripts/device.mjs serve --socket 47811; sleep 1; done
```

The bridge runs from a copy of `octatrack-usb-bridge.py` on the Windows side. Stop it with PowerShell's `Stop-Process` (find
it with `Get-CimInstance Win32_Process`; `wmic` is gone). `boot` and `try` on Windows need a client from 12 October
2026 or later: older ones send 4,148-byte frames, which WinUSB refuses
([traps](OCTATRACK_HARDWARE_TRAPS.md#usb-and-ep0)).

**On Windows without WSL**, give the session and its share port numbers, since Windows has no Unix sockets:
`MODWERK_DEV_SOCKET=47812 node scripts/device.mjs serve --socket 47811 --share 47813`. With the same
`MODWERK_DEV_SOCKET`, `device-send.py`, `device:qualify`, `device:test` and `octatrack-measure.py` reach it over TCP;
`device:price` takes `--socket 47812 --share 47813` and `device:test` `--share 47813`.

## Send steps

```sh
scripts/device-send.py 'part2 pick:T1:FX2:E-Verb stats'
perl -e 'alarm 10; exec @ARGV' scripts/device-send.py ui   # with a time limit
```

One line, steps separated by spaces, the reply printed. After each step that presses, turns or changes something
the session waits 60 ms; after a read (`health`, `state`, `stats`, `ui`, `mem:`, `crash`, `stall` and the like) it
does not, so a read costs a few milliseconds (`state` 3 ms, `health` 20 ms over the Windows bridge, 19 November 2026). A request has a 20 s limit; the session answers an
error and moves on. macOS `nc -U` hangs up before the reply, so use the script.

| Step | What it does |
|---|---|
| `KEY`, `KEY+KEY`, `KEY*N` | press (holding all but the last); `T1`-`T8`, `TRIG1`-`TRIG16`, `FX1`, `FX2`, `SRC`, `AMP`, `LFO`, `FUNC`, `YES`, `NO`, `UP`, `DOWN`, `LEFT`, `RIGHT`, `PLAY`, `STOP`, `REC`, `CUE`, `PATTERN`, `BANK`, `PAGE`, `PROJ`, `PART`, `AED`, `ARR`, `MIDI`, `SCENEA`, `SCENEB`, `PUSHA`-`PUSHF` (`FUNC+PAGE`: PATTERN SCALE, where LEVEL sets the length). The names are the MKII panel's codes; an MKI has no `PROJ`, `PART`, `AED` or `ARR` key |
| `+KEY`, `-KEY` | hold, let go |
| `encA+3`, `encLEVEL-2`, `fader128` | encoders A-F, LEVEL, the crossfader. Some setup values take several detents a step: MIDI NOTE SETUP's CHAN, BANK and PROG did not move on `encA+3`, and `encA+20` moved CHAN by 6 (21 October 2026); LFO SETUP's WAVE takes about four detents a step; SRC SETUP's TSTR (encoder E) moved only on a large turn (`encE+40` went OFF to BEAT after seven `encE+2` did nothing, 27 October 2026). A step is one signed byte: keep it within ±127, as `encB+200` turned WAVE backwards (24 October 2026) |
| `w300` | wait 300 ms (rarely needed: the steps below wait for their own result) |
| `pick:T1:FX2:SPRING_REV` | pick an effect by name (spaces as `_`), FX1 or FX2: the chooser opens, LEVEL scrolls the exact rows, YES; done once the track runs it (about 120 ms after YES); fails at once if the loader refuses. A notice on screen eats its first keys and it times out after 5 s: after removing a module the bank names (MISSING MODULES) send `YES` first |
| `part1`-`part4` | switch Parts (PART + an arrow; an MKI: Parts below), done once the Part changed |
| `ui` | each track's FX1/FX2 as they run, the current track, Part, transport |
| `stats` | CPU, each core's mean/peak per mille, idle passes. One reading is not a measurement: on 27 October 2026 (MKII, a dev twin, stopped, nothing changing) it swung between 41 % and 60 % within ten seconds. Take ten readings in each state, or time the hook itself with `modwerk_cost` (`profile`) |
| `health` | one JSON line for scripts: the DSP frames, the loader's stalls and errors, the UI tick's watch count, CPU, the crash and stall records' counts (battery RAM, so earlier ones stay counted) and the transport. Development bases. [A fast soak](#a-fast-soak) reads it after every operation |
| `loader` | packets accepted, rejected, errors, jobs, selections, commits, rollbacks, code words per core |
| `mem:0x80000ec4:16` | RAM in hex, read-only, any length, within 0x40000400-0x40cfffff (short of the pool's end and the loader's statics), 0x46000000-0x46ffffff, 0x80000000-0x8000ffff and the battery RAM's records 0x100f0000-0x100fffff (`dev.c`); the battery-RAM Part copies are outside it |
| (any sequence) | answers within 20 s beyond its own `w` waits, else an error, and the next request runs |
| `png:/path.png` | On bases advertising the Screen capability (MWCP bit 13), the Hub and this command read the same on-demand frame. Older development twins also answer the request. A screenshot, 256 x 128: cheaper to read than the text rendering. It shows stock's menus too (PERSONALIZE, read on an MKI twin) |
| `screen` | the screen as block characters (thousands of tokens; avoid) |
| `crash` | the last crash record (vector, PC, registers); `crashtest` makes one. The PC and the stack read as names (`mw_frame_exit+0x2c`) when the running base was built with `octatrack:base -- --out` or started with `boot DIR` on this computer; your own names for stock addresses go in `~/.cache/modwerk-local/octatrack/addresses.json` (`{"0x…": "name"}`), never in Git. `diaglog` and `diagnostics:pull` name them the same way |
| `selftest` | PROJ > MODWERK > SELF TEST over USB: start it (transport stopped), wait, print the verdict, the modules that ran and the CPU and core peaks |
| `saved`, `restore` | the card set's result code, modules saved and live, read without a test: 1 restored at this start, 7 saved since. `restore`: each module of this start's restore, loaded or left out and why. To try a set from the card, `node scripts/octatrack-card-set.mjs --out DIR ID…` writes `MODWERK0.SET` for the published base; on a used card run the same script with `--out CARD --import DIR/MODWERK0.SET` to select that export ahead of `MODWERK1.SET` and keep the recovery slot, then power-cycle |
| `dspmap`, `dspmap:watch:N` | each core's DSP code arena drawn as 64 cells, a letter per placed block and `.` per free words, then each block's name, start, words and the slots running it (else `preloaded`: code another Part of the bank names). `watch:N` redraws it for N seconds (at most 15) whenever a block comes, goes or moves, so compaction shows: on 24 October 2026 removing a Mini Verb between SPRING REV and DARK REV left a 538-word hole and DARK REV moved down into it 2.1 s later |
| `profile`, `profile:N` | the base's tick profile (`modwerk_cost`, diag.h): each UI tick hook's µs a tick over N seconds (3, at most 15) and the frame transfer's µs a frame. It reads the address from the build `boot DIR` last started (`~/.cache/modwerk-octatrack/last-boot`) and refuses when another base runs. On 24 October 2026 it showed the controller tick at 814 µs with 26 modules installed, 212 µs after the fix in #880 |
| `selftest:trace` | the same, printing each half second's phase, progress, the CPU the test recorded and the meter's latest window beside it: what a CPU or core peak came from |
| `stall` | the last DSP stall record: why, the loader's whole report, each core's last packet header and what it was (BIND, WRITE, PEEK and the rest, and whether it was still in flight when the frames stopped), whether a pick, Part change or install was under way, the live FX ids, as they stood when the stall was seen (it survives the power cycle), then the 128 frames before it (46 ms): each frame's gap to the one before (363 µs on time) and how long the frame interrupt before it ran. A long gap after a long run is the frame interrupt's own work, after a short one something else held it off; `stalltest` writes one now |
| `guard`, `guard:MILLE` | the longest frame interrupt, latest start and CPU share since the last read, plus the configured frame share. The skip count and track mask accumulate since boot. Subtract two counts to measure skips during a run. `guard:MILLE` sets the share (per mille of a frame, `guard:65535` turns it off) |
| `late`, `late:off`, `late:on` | the late-entry wait since the last read: the latest frame-interrupt entry against the DSP's frame grid, the entries 80 to 190 µs late, how many of them waited and the longest wait; it is on in every base, `late:off` turns it off on a development base for a with/without comparison ([what it is](MODULE_PERFORMANCE.md)). Each wait skips a DSP frame, a click, so every base also logs a `late` incident with the count since boot, at most one in ten minutes, and the entries 190 µs or later, which no wait holds (also live in `diaglog`); a trial fails on either |
| `try FILE`, `remove FILE` | install or remove a module package, accepted and kept at once: each one writes the card's set, so on a twin they replace the owner's kept modules (25 October 2026). For a trial that rolls back by itself, use `npm run device -- try FILE --seconds N --socket /tmp/modwerk-share.sock`; `npm run device:test` drives a package through such a trial ([the same run without a Keep](ADD_A_MODULE.md#octatrack-base-and-usb-lifecycle)). The `value` it prints each second is shared by every installed module's tick ([API](OCTATRACK_API.md#core-entry-points)). A table owner (Mute Modes) is not removed while its menu is open: the refusal is 7, `RUNTIME_IN_USE`, whose text speaks of tracks; leave the menus and remove again |
| `cpu`, `cpu:PERCENT` | the CPU budget: its allowance, what the Part's machines book and the tracks refused; then each machine track's longest render since the last read, both passes of a frame, in percent of a frame (its peak; a machine's CPU price is its mean cost, [measured with `guard`](MODULE_PERFORMANCE.md)). `cpu:PERCENT` sets the allowance |
| one-shot `npm run device:price -- [--out FILE.json] [ID or FILE.mwrm …]` | what a module costs, measured beside the running session (`serve --share /tmp/modwerk-share.sock`, a development twin): for each USB package, or each `.mwrm` file of an unpublished build, a timed trial, then the frame interrupt's share, the CPU meter and both DSPs while the selected pattern plays, before it, with it installed and used nowhere, and for an effect on one slot of `--slot` (T1) at its defaults (a `.mwrm` file of a published effect, named after its id, takes the effect's slots and name from its catalogue row; one of a new effect gets only the at-rest reading, 17 November 2026); `--socket` is the session's socket and `--share` the shared one; the trial is rolled back and the slot's effect picked back. It presses PLAY and STOP itself, so set the scene up first and leave the transport stopped. A machine in use and other settings are not measured. It waits for an upload however long it takes: cutting one short left MODWERK SYNC / RECEIVING MODULES at 57 % on the unit until `npm run device -- recover --socket /tmp/modwerk-share.sock` (14 November 2026). On that day, with four FLEX tracks sounding on an MKII, FM Synth 0.1.2 cost 19.1 points of the frame installed on no track, POLY8 0.3.1 13.5, Repitch 0.2.0 7.9, Euclid 3.0 and every other module under 1 |
| one-shot `npm run device -- lifecycle` | not a read-out: the single-slot loader test. It stages and accepts test modules, and on a base with module sets it stops at "removal empties the slot" and leaves an unnamed module 0 kept on the card, which a power cycle keeps (26 October 2026, MKII, flashed `92a13ff0`). `npm run device -- remove --seconds 3 --accept` takes it out. For the module list: `npm run device -- do inventory` |
| `flash DIR` | after `boot DIR`: that base writes its own container (`DIR/NOT_FLASH_CANDIDATE.bin` deciphered) to NOR with stock's routines, verifies it and restarts on it; refuses any other base's. Not yet run on a unit; the owner's call ([traps](OCTATRACK_HARDWARE_TRAPS.md#writing-nor-over-usb)) |
| `boot DIR`, `boot DIR 4096` | RAM boot a `build_core.py` output; the session restarts on the new base. Refused over a flashed update not yet confirmed: each restart spends one of its two starts (`--spend-tries` overrides). `node scripts/octatrack-bootsoak.mjs DIR --socket PATH` repeats it in batches of 15 until one does not come back (20 boots so far: up to one loss in seven). From the flashed `usbtest9` on macOS add 4096: it times out on the default 4,095-byte frames ([traps](OCTATRACK_HARDWARE_TRAPS.md#usb-and-ep0)) |

STATE's `recording` bit reports sampler recorders. Check live-sequencer recording
separately when qualifying an edit's recording refusal; that bit alone does not
establish whether live recording started or stopped.

## A fast soak

`node scripts/octatrack-soak.mjs` plays a seeded run of USB MIDI at the unit (program changes and bursts of them,
START and STOP, the crossfader, scenes, mutes, levels and FX knobs, transitions weighted most) and reads `health` after
every operation. It stops at the first failure: a new crash or stall record, a loader stall or error, DSP frames still
for 0.6 s, or the UI tick still for 1.5 s. Then it reads `stall`, `crash` and `diaglog` into the run's log, which holds
every operation, so `--replay LOG [--until N]` plays the same run again. The default is three minutes at 20 operations a
second, about as many operations as an hour at a player's pace.

Measured on an MKII on OS 1.40C, development twin `0ad7efc5` of main, 20 November 2026 (`--profile pc`, 30 s a rate,
programs 0-3): asked for 5, 10, 20, 40 and 60 operations a second, it held 4.7, 9.4, 18.7, 32.1 and 33.8, and 87,
163, 269, 403 and 425 pattern changes landed a minute. A health read took 16 to 19 ms (median), 20 to 23 ms (p95).
One read after every operation caps the runner at about 34 operations a second, so a `--rate` above 30 buys
nothing. `--profile mix` at 20 a second held 18.7, with 140 pattern changes a minute. No run logged a new crash or
stall. Each CC was checked on its own against the Part's bytes and the screen: level 7, mute 49, FX1 knobs A-F
34-39, FX2 knobs A-F 40-45, scenes A and B 55 and 56, the crossfader 48.

- MIDI goes through `scripts/octatrack-midi-bridge.py` on the computer the unit is plugged into (on Windows the device
  venv's Python, through winmm; port 50124, beside the USB bridge's: on a Windows host with WSL's mirrored
  networking 47812 refused the bind, 19 November 2026). Start it before the run and stop it after: while it runs it holds the
  unit's MIDI port. After a RAM boot it reopens the port on a failed send (copies before 25 November 2026 must restart).
- The project: track channels 1-8, and TRANSP RECV and PROG CH RECV on in PROJECT > MIDI > SYNC. A project with
  them off ignores START and program changes without an error: the summary then shows no pattern changes and the
  stopped CPU. Program changes arrive on the channel PROG CH RECV names; set to CH AUTO, that is MIDI > CHANNELS'
  AUTO channel, so pass that as `--pc-channel` (11 on the MKII of 20 November 2026). Track CCs go out on the track
  channels, the crossfader and scenes on `--auto-channel` (the unit took them on channel 1 too). Effects of the
  modules under test belong on the Parts that `--programs` reaches. A program change while playing lands at the
  pattern's end, so short patterns at a high tempo give the most transitions. MIDI STOP pauses the sequencer, which
  `health` reads as stopped from base 0.8 (as playing before).
- `--replay LOG --shrink --reset DIR` finds the shortest prefix of a failed run that still fails: before each replay it
  RAM-boots `DIR` (a development twin; serve in its loop) and waits out the base's 25 s panel hold, so each try costs
  about a minute, and halving needs about a dozen tries for two thousand operations.
- Nothing is installed, kept or flashed. A run that leaves the unit off USB needs the owner's power cycle, as always.

## The panel, as it behaves

A KEY reply confirms posted bytes, not stock's action: check the menu or transport change and the key's release
(moving UI/DSP counters prove nothing). After a navigation timeout, stop and read the held-key rows (`boot.c`'s
`modwerk_post_key`) before retrying; they can be clear while stock still holds FUNC (a physical STOP once pasted).

Remote keys wait for a whole physical report. The panel sends two-byte reports, and a USB KEY rung between a
fader report's two bytes once left TRIG5-7 held or lost a FUNC release
([base issue #1110](https://github.com/repeat98/modwerk/issues/1110)). Since November 2026 the base queues remote
keys and encoder steps (and the self-test's PLAY and STOP) and rings them from its tick only when the panel's parser
expects a report's first byte, so a key arrives up to a tick (16 ms) after its request. Sixteen wait at most; the
KEY reply is 0 for one more. The host test covers both orderings on a model of the parser's state, and keys, chords,
Part and bank switches and picks ran through the queue on an MKII twin (13 November 2026); the interleaving itself
was not replayed against the real parser. An earlier fresh-RAM-boot hardware probe also misdelivered FUNC, cause
not isolated: verify each held-row transition and stock modifier release, and stop on a mismatch.

- **After a RAM boot.** The base shows BASE UPDATE / WAITING FOR MODWERK for 25 s and holds the panel, then MISSING
  MODULES when the bank names modules the twin lacks (YES closes it); keys sent before that are lost, so read
  `mem:0x80000000:1` after selecting a track before going on (14 November 2026).
- **Machines.** Double-tap the track key, then LEFT, opens the machine list on the track's own row: STATIC, FLEX, THRU,
  NEIGHBOR, PICKUP, then the installed module machines, so the first of them is five DOWN from STATIC. YES picks, and
  NO closes a CPU FULL box together with the list. Check the pick by the Part's bytes (type at Part `+0x22 + track`,
  signature at `+0x3c + 30 * track`). POLY8 turns TSTR and LOOP off in SRC SETUP and leaving it does not turn them
  back on (0.3.1 and 0.3.3); FM Synth and Amiga left no Part byte changed.
- **Trig keys.** In the TRACKS trig mode TRIG9-16 trig tracks 1-8; TRIG1-8 do not. Holding FUNC, DOWN opens the trig
  mode menu, a second DOWN moves to CHROMATIC and releasing FUNC picks it (UP twice goes back).
- **Grid recording.** REC toggles, and a remote REC can be lost: press one trig and read the track's mask in the
  pattern (`+0x6 + 0x91a * track` from the pattern's start, two bytes for steps 1 to 16) before placing the rest.
- **Effects.** FUNC+FX1/FX2 opens the chooser (the left list; its right side are the effect's setup knobs).
  Moving the cursor does not pick; YES does. NO closes. LEVEL scrolls. `pick:` does all of it.
- **Parts.** Holding PART shows the selector: UP Part 1, RIGHT 2, DOWN 3, LEFT 4. A switch also assigns that Part to the
  current pattern (stock), so switch back to the pattern's own Part (the byte in the table below) before you leave. **Never FUNC+PLAY there
  (`PART+FUNC+PLAY`): it CLEARS the Part**, both working and saved copies, its knobs, machines and name
  (`PART 1`), and saves that (stock's Part Clear; 11 October 2026). FUNC+PLAY elsewhere clears the pattern.
  To reload, use `reload`: FUNC+PART opens RENAME, RELOAD, SAVE, SAVE ALL, keeps its cursor from last time and
  stops at RENAME, so UP three times, DOWN, YES (`savepart`: DOWN twice). Do not use SAVE or SAVE ALL on a Part you changed.
  **An MKI has no PART key** (#2099): FUNC + MIDI opens the Part window, an arrow moves its cursor, YES selects;
  FUNC + BANK there opens the menu. Steps choose by the MKII flag (`0x46c8d18c`); `device:emulator -- --mki`. After a RAM boot
  every Part counts as never saved and RELOAD shows SAVE PART FIRST! (MKII, 20 November 2026), so `device:test`,
  `device:qualify` and `test:procedure` (`octatrack-part-state.mjs`) SAVE the Part once before they change anything,
  while its working copy equals its saved one: the same bytes, and their closing RELOAD then works (`test:procedure`'s
  also after its soak). `reload` reports no failure: compare the Part with its saved copy afterwards.
- **Patterns.** PATTERN+TRIG n selects pattern n of this bank. Another bank: BANK, then TRIG b (bank b), then
  TRIG n (pattern n) within four seconds (the manual's "CHOOSE BANK", "CHOOSE PATTERN"). Stopped, it applies
  at once; playing, it waits for the pattern's end.
- **Samples.** FUNC+SRC opens SRC SETUP on the machine list; RIGHT enters the slot list; YES on a slot
  assigns it; YES on an empty slot opens the card browser (LIVE/AUDIO). Parts store each track's slot.
- **Modwerk's pages.** PROJ's fifth category, MODWERK (from S55, 12 October 2026), lists STATUS (the status dialog,
  also CUE+PROJ from anywhere), MODULE COST, MISSING, SELF TEST and, on a base with it, MODULES (every installed
  module, ON or OFF: UP and DOWN move, YES switches the one under the cursor at once, stopped, and the last line says
  why when it can't). Each page is a level of the menu (base 0.8.2): NO, and LEFT or RIGHT (on STATUS any arrow),
  closes it back to the MODWERK list with the cursor on its row; PROJ closes the menu as stock's does. Before 0.8.2 NO
  closed the whole menu. On a development base with SETTINGS, open it, then choose a module such as USB AUDIO.
  UP and DOWN highlight its options, YES applies the highlighted one, and NO returns to the module list. The PROJ menu keeps its cursor from
  last time, like stock's, so go UP to its top before counting rows down. On older bases these were SYSTEM >
  MODWERK and MODWERK TEST.

`device:price --memory --out FILE.json` also records bytes in the module pool and program words on each DSP core after every reading. These are tracked allocations. Pair them with the module's region inventory for state, existing reservations and buffers.

## Where the state is (OS 1.40C)

| What | Where |
|---|---|
| current track, Part | byte `0x80000000`, byte `0x80000003` |
| what each track runs (FX1 T1-8, then FX2) | 16 bytes at `0x80000ec4`; a Part's effects reach it at each track's next trig while playing, not at a stopped pattern change. A track without trigs keeps the last bank's effect (16 October 2026, twin of `38a0bde1`: B01's DELAY never reached trigless tracks that ran DARK REV), so test a pick's admission on tracks with trigs or in a blank project. A trigless track keeps the last bank's machine too: from bank A (Analog BD on T1) to bank B, T1 kept rendering Analog BD and asking for its lease (22 October 2026, twin `df19fdca`); a RELOAD of bank B's Part, then bank C, cleared it. On 24 October 2026 (twin of `f14e7fa3`, stopped) a RELOAD did not: switching to another Part and back (`part2 part1`) applied the Part's effects, and `pick:` of the effect the Part already names leaves the live slot as it is (it times out) |
| current bank | `0x46c82456` holds its base: `0x400e21e0 + bank * 0x9b340` |
| a working Part's effects | 16 bytes at bank base `+ 0x8ed80 + part * 6322` (the whole Part is 6,322 bytes) |
| the saved copy | bank base `+ 0x9504a + part * 6322` |
| a pattern's Part | byte at bank base `+ pattern * 0x8ed8 + 0x8e57` |
| current and queued bank/pattern | bytes `0x800065bd`/`be` (current), `bf`/`c0` (queued; equal to the current ones when nothing waits); long `0x800065b8` 1 playing, 0 stopped, 2 paused (PLAY while playing, MIDI STOP) |
| effect ids and chooser rows | FX1_IDS `0x400d5f58`, FX2_IDS `0x400d5fdc` (id -> descriptor, name at +9), FX1_ID2POS `0x400d60d0`, ID2POS `0x400d6150` (id -> row) |
| chooser cursor | FX1 `0x460d5c94`, FX2 `0x460d5ca8` |
| input layers (menus, windows) | list at `0x460d165c`: two entries with no menu open |
| crash record, stall record, the frames before the stall | `0x100ff800`, `0x100ff900`, `0x100ffb30` (battery RAM) |

To compare a Part's working and saved copies: `mem:` both addresses with length 6322 and compare the output.

## Fast and safe habits

- One session drives at a time; a handful of steps per command; `perl -e 'alarm N; exec @ARGV'` around anything that
  talks to the unit (its time includes any wait in line). Another session's RAM boot mid-trial replaces your image and
  ends the trial, which is why a boot waits for the turn like a trial does ([taking turns](#taking-turns-on-the-unit)).
- Let steps wait for their result (`pick:`, `part`), not fixed `w` waits.
- After a power cycle, the first `npm run device` command often fails while the bridge reopens the unit; run it
  again before treating it as a fault. `status` then shows generation 0 and the base's own digest as the active
  set even when kept modules were restored ([case 16](OCTATRACK_MODULE_EDGE_CASES.md)); `npm run device -- do
  inventory` lists what is installed (a contributor's MKII, beta bases `38a0bde1…` and `99336d35…`, 15 October 2026).
- Before a test: `ui`, the bank and Part bytes, the Part's working-equals-saved check. After: restore and
  read them again.
- Long runs (`npm run device:test`, `npm run device:qualify`, benchmarks) in the background with a progress log; look at the
  log instead of waiting.
- If the screen does not change for a minute, the run is stuck: kill it, restart the session, read `ui`.
- Audio: `~/.cache/modwerk-octatrack/tools/rec SECONDS OUT.wav Octatrack` records MAIN and CUE over USB
  (4 channels, 44.1 kHz, 32-bit). A sustained sound (a looped sample) shows clicks; a clap does not.
  Recording costs the ColdFire about 15 CPU points while it runs (20 October 2026, base `908f0107`: playing 61-64 %,
  recording 77-78 %), so read CPU without it. A dropout shows as a run of exact zeros or a block of 16-64 samples
  played twice inside sound; the `gap` step (longest time between frames, normally 380-420 us) is the DSP-side check.
