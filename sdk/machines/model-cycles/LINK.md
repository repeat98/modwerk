# Model:Cycles link

The Model:Cycles' link over USB MIDI. Every Modwerk base carries the part for musicians' units, as the Octatrack's
does: a host reads the link's identity with the set identity, the audio load and the diagnostics log, and loads
modules to RAM on trial without a reflash. Development bases add memory reads, panel keys and encoder turns, and
booting an uploaded image from RAM.
It is the Model:Cycles' USB link the [machine recipe](../../../docs/MACHINE_RECIPE.md) asks for,
SysEx because USB MIDI is all the unit offers, and it follows the
[Analog Rytm MKII's link](../analog-rytm-mkii/LINK.md) by Nathaniel Pavel: the same wire format, the same place in
the OS. No flash over the link yet: a base still goes on the unit as an OS update.

- Unit side: [`elekloader/base/link.c`](elekloader/base/link.c), [`link.s`](elekloader/base/link.s);
  base.json's `add` (every base) and `dev` (`MODWERK_DEV`).
- Host side: [`tools/mc_link.py`](tools/mc_link.py) (Python 3 and `mido` with `python-rtmidi`).

## Every base, and development bases

Every base answers `ident`, `diag`, `load`, `log` and the loader (`up_part`, `up_run`, `mods`). It costs 38214 bytes
of `.run` and 115796 of `.bss` in the 256 KiB shared mod area, 96 KB of it the module pool and the upload staging
(release base `646706ff`). Any USB host can load modules, as on the Octatrack; a trial goes back on its own when the
host falls quiet for ten seconds, and a power cycle always restores the flashed set.

Development bases add `mem`, `key`, `enc`, `release`, `disarm` and `ramboot` (a release base answers them `bad
request`). Build one with

```
npm run machine:base -- model-cycles --stock STOCK.syx --dev --out NEW-DIR
```

which writes `modwerk-base-model-cycles-dev-<sha>.elemod`, checked against no binding: a development base is never
recorded or released (dev base `3cbee647`: 42258 bytes `.run`, 116596 `.bss`, 9 sites).

## Arm

In a development base the link is armed at every boot: a development image is meant to be driven. `disarm` turns it off until the next
boot. Reads (`ident`, `mem`, `log`) and the loader work disarmed; keys and turns need the arm, and stop as soon as a person touches the
panel: a press or turn on the panel lets go of every key the link holds and refuses the link's keys and turns for
about 3 s (status `a person is at the unit`). The Cycles has no settings hook yet, so there is no menu row for the arm.

## Wire format

SysEx, manufacturer 0x7D (non-commercial):

```
host -> unit  F0 7D 'M' 'W' 'L' 01 seq cmd payload.. F7
unit -> host  F0 7D 'M' 'W' 'L' 01 seq cmd|0x40 status payload.. F7
```

Numbers are u32 as five 7-bit bytes, least significant first. Byte blocks are 7-bit packed in Elektron's framing.
Status: 0 ok, 1 not armed, 2 bad request, 3 busy, 4 out of range, 5 a person is at the unit.

| Request | cmd | What comes back |
| --- | --- | --- |
| `ident` | 0x01 | link version, requests received and dropped, the link's tick count, the port the request came on, replies sent, send failures, armed, person at the unit, person presses, posted, refused (the five arm fields 0 in a release base), the RAM boot's mailbox, status and image CRC, and the set identity: the CRC32 and length of the `.run` block (the base and every linked module), taken at boot before any handler runs |
| `disarm` | 0x02 | development bases: turns the arm off and lets go of every key the link holds |
| `key ID FLAGS` | 0x10 | development bases: a panel key message with the flags as given (bit 0 down); a held key reads as held to `is_key_held` |
| `enc N DELTA` | 0x11 | development bases: an encoder message of DELTA steps (-30 to 30), as the panel posts it |
| `release` | 0x12 | development bases: lets go of every key the link holds |
| `ramboot IMAGE.syx` | 0x14 | development bases: after stock's OS upgrade has taken the image: checks it, resets and boots it from RAM (below) |
| `mem ADDR N` | 0x21 | development bases: up to 128 bytes of DDR (0x4000_0000-0x47ff_ffff) or SRAM (0x8000_0000-0x8000_ffff) |
| `diag` | 0x22 | the diagnostics log's address and size (bytes), as the Digitone II's |
| `load` | 0x23 | the audio's share of the CPU over the last half second, the window's dearest block and the dearest block since boot (tenths of a percent), windows and blocks counted |
| `log` | 0x24 | up to 128 bytes of the diagnostics log from an offset into it, as `mem`'s reply (offset, count, bytes); nothing outside the log (`mc_link.py log`) |
| `up_part` | 0x31 | the runtime loader: a part of an upload frame, an offset and up to 96 bytes packed ([below](#loading-modules)) |
| `up_run` | 0x32 | runs the frame's first N bytes as one wire request; the upload controller's 144-byte response, packed |
| `mods` | 0x33 | the module pool's free bytes and largest run, the last refusal, the live count and up to three inventory entries from the n-th |

The set identity tells a host which build runs: `mc_link.py runid IMAGE.syx` computes the same two numbers from a built image and the patcher's `IMAGE.syx.json` (the `.run` block sits at the layout's `run_load` in the MAIN OS and is copied unchanged to DDR). The base cannot carry its own package hash; the build that made the image knows it. The developer MCP reads the same identity with `device_status` (`--elektron-midi`, [FRONTEND_MCP.md](../../../docs/FRONTEND_MCP.md#a-modelcycles-over-its-link)) and names the matching image in `--elektron-images`. `mc_link.py rundiff IMAGE.syx` reads the running block and lists every word that differs from the image.

The screen needs no command: stock answers Elektron's own screenshot request over USB.

## Loading modules

Every base carries the Octatrack's runtime loader ([`sdk/runtime/loader`](../../runtime/loader/README.md))
and upload controller ([`sdk/runtime/upload`](../../runtime/upload/README.md), wire version 1), with the Cycles'
glue in [`elekloader/base/runtime.c`](elekloader/base/runtime.c) and the transport in
[`modules.c`](elekloader/base/modules.c). Where the Octatrack carries one wire frame in an EP0 data stage, the link
carries it in parts: `up_part` writes up to 96 bytes at an offset (each message 124 bytes at most, under the 128 of
stock's own upgrade messages), then `up_run` runs the frame on the UI task. 0x30 stays free: the Digitone II's link takes a whole frame there in one
SysEx (`upload`); the Model:Cycles' limit for one message has not been measured, so it takes parts. A package up to 32 KiB goes in CHUNK frames
of 2 KiB; the pool holds 64 KiB of modules, 16 at most.

```
python3 -B sdk/runtime/loader/build.py sdk/machines/model-cycles/elekloader/examples/hello.c -o hello.mwrm
mc_link.py try hello.mwrm --seconds 20 [--keep]
mc_link.py mods
mc_link.py keep | undo
mc_link.py remove NAME --seconds 5 [--keep]   # an empty package with NAME's id: that module out, on trial
```

The developer MCP does the same with `device_review`, `device_trial`, `device_keep` and `device_undo`
([FRONTEND_MCP.md](../../../docs/FRONTEND_MCP.md#a-modelcycles-over-its-link)), through
[`mc-link.ts`](../../../src/engine/elektron/mc-link.ts)'s `mcUploadTransport` and the site's `UploadSession`.

A module patches stock code at declared sites: [`tools/build_sites.py`](tools/build_sites.py) `--sites SITES.json` (around the loader's `build.py`) takes them in base.json's format (a `jsr`
or `jmp` to a function of the module, the stock bytes' SHA-256), and the base checks the running code before it
patches and puts the stock bytes back at an undo or a removal. [`examples/frames.c`](elekloader/examples/frames.c)
detours the call that ends each composed frame and shows the frames counted; `frames2.c` is its next version.

- `try` loads the package to RAM on trial and pings once a second; at the end it undoes the set, or keeps it with
  `--keep`. Ten seconds without a link request in any phase but the normal one put the previous set back, as an
  unplugged Octatrack does: Ctrl-C ends a trial that way.
- Nothing is saved: a kept module lives until the next power cycle, which always restores the flashed state.
- The loader refuses while a pattern plays (`unsafe`): stock's is_playing words (`0x40a78874 | 0x40a7883c`).
- The base identity a BEGIN names is the SHA-256 of the set CRC (`ident`'s `set CRC`, big-endian); `try` checks it.
- A module's handlers run on the UI task: `module_draw` gets the core's bitmap (`fw_fill`, `fw_text`), `module_key`
  the panel's key code and whether it went down, `module_enc` the knob and `ev+16`. Key codes and addresses are OS
  1.13's.
- What the glue rests on (read from OS 1.13): the kernel is the Octatrack's design (the switch saves d0-a7 at TCB +
  0x0c, the running task at `0x422fef30`, one ready list a priority from `0x422feec8`), with the twelve tasks the OS
  creates through `0x400019ec`; caches as the Octatrack's (CACR `0xa50ce100` at boot, data ACR0 `0x4007e020`), so
  DDR's mirror at +0x0800_0000 is uncached, as the OS's own reverb and delay lines use it; the audio interrupt at
  level 5, so the loader's level-4 lock leaves it running; sites only in stock code below its `.data` image
  (`0x4019b590`).

## RAM boot

`mc_link.py ramboot IMAGE.syx` boots an image without flashing it, so a module can be tried and dropped again with a
power cycle. The image is any Model:Cycles OS `.syx`, a stock one or one the kit linked.

1. The host uploads the image with stock's own OS upgrade (Elektron's `F0 00 20 3C 11`, commands 0x50 start and
   0x51 write, the protocol Transfer uses; the Rytm's helpers in `rytm_link.py`). Stock keeps it at `0x4028da80` and
   asks "Upgrade OS now?"; nobody answers it. YES there flashes the image, as stock does; NO leaves the unit running
   the OS it runs. `mc_link.py ramboot` reads the arm first and uploads nothing while the link is disarmed, so a
   refused RAM boot never leaves that question behind; should the unit refuse it anyway, the tool says to answer NO.
2. `ramboot` carries the container's length and CRC32 and the MAIN OS's length and CRC32. The link checks that stock's
   upload is complete (header byte 0 = 3) and has that length, else status 4.
3. The bootstrap stages the flashed, packed MAIN OS at `0x40200000` on every boot, over `0x4028da80`. The link copies
   the container to `0x46000040`, writes the data cache out and switches it off, writes a mailbox at `0x46000000`
   (magic, the four numbers, a check word) and resets as stock's flash routine does at its end. Nothing is erased or
   written to flash.
4. At the next boot the base's `ev_boot` handler, before stock copies `.data` and clears `.bss`, takes the mailbox
   only after a software reset (RSR), checks the check word, the lengths and the container's CRC32, unpacks its MAIN
   OS over the flashed one at `0x40000400`, checks that CRC32 and enters it as the bootstrap does. Each mailbox is
   used once.
5. A power cycle brings the flashed OS back.

`ident` reports the mailbox (`asked`, `spent`, `booted`), the status (`booted from RAM`; else why not: no software
reset, check word, lengths, CRC, no MAIN OS, failed after unpacking) and the CRC of the image that runs. The flashed
image must carry a development base: only its `ev_boot` handler boots from RAM.

## Where it runs (OS 1.13)

- **Receive.** Stock's MIDI input hands every complete SysEx (status byte F0, table `0x40112950`) to its router
  `0x400812f6(msg, len, port)`, which serves Elektron's `F0 00 20 3C` (Transfer, the OS upgrade, the screenshot) and
  universal `F0 7E`. `link.s` takes its first two instructions: `F0 7D 'MWL'` goes into a ring and no further;
  everything else goes on to stock unchanged.
- **Keys and encoders** go on the UI task's queue (its address at `0x40148cd0`, `queue_put` `0x40001fba`) as the
  panel's messages do: `{type 0 key / 1 encoder, id, flags or a signed step in the top byte, time}`. The UI loop
  (`0x400080e6`) plays them through the core's `ev_key`/`ev_enc` and stock, so modules see them too. Stock's
  `is_key_held` (`0x4007faf4`: the table `0x4010ae5c`, codes 0-38, into the panel's bitmap `0x40f95744`) is pointed
  at `mw_link_held`, so a key the link holds reads as held. Key codes: FUNC 1, TRACK 2, PATTERN 3, RETRIG 4, TRIG n
  is 15 + n. Encoders: 1 LEVEL/DATA, 2-15 the parameter knobs (seen on a unit: 2 PITCH, 13 CHANCE, 14 REVERB, 15 DELAY); 0 is
  not one the main screen reads.
- **USB only.** A request from USB arrives with port 2. The link drops its messages from any other port.
- **Work.** `ev_tick` (UI task) takes the ring, acts and replies on USB through stock's USB MIDI writer
  `0x40003396(len, bytes)` in 144-byte parts, under stock's USB lock for the whole reply and never while another
  sender's SysEx is open (below).

### Stock's send from two tasks

Read from OS 1.13's code, 25 November 2026. Stock's SysEx send `0x400828fe(bytes, len, error flag, port)` returns
at once while `0x40fe4228` is 0, splits a message into 144-byte parts and hands each to `0x400826b0(len, bytes,
port)`. For USB (port 2, and 4 with DIN) that takes stock's USB lock (`0x400032ca`: a kernel mutex at `0x422ff010`,
`0x40001cc4`, which makes another task wait; `0x400032da` gives it back), writes the part with `0x40003396` and
gives the lock back. So one part is never torn, but the lock is free between the parts of a message. `0x40003396`
turns MIDI bytes into USB MIDI packets and keeps its SysEx state across calls (`0x404a096c`: `0xF0` from a SysEx's
`F0` until its `F7`), so a part of another sender between two parts of a message breaks both.

Two tasks do send. The UI task does (the link, and stock's own MIDI out). Stock's SysEx router runs in the MIDI task
and jumps straight to the handler of an Elektron message (`F0 00 20 3C id sub cmd`, table `0x40148d08`): for id
`0x10` (Transfer and the screenshot) `0x40085702` builds its reply in a writer of 144-byte parts (`0x400823f6`,
flushed through `0x400822ec` into `0x400828fe`), so stock's replies to Transfer leave from the MIDI task. Before
this, a link reply of more than one part (LOG, UP_RUN and MEM are about 170 bytes) could take a part of Transfer's
reply between its own, or put one of its parts into Transfer's.

The link now writes a reply through `0x40003396` itself, in the same 144-byte parts, holding the lock from the first
part to the last; a stock sender waits for it as for any part. It acts on no request while `0x404a096c` is `0xF0`
(another sender is between its parts) and takes the next one at a later tick. If a SysEx opens between that look
and the lock, the reply is held, not dropped (its request has run: an `UP_RUN` may have kept or undone a set), and
goes out at a later tick; no request is acted on while a reply is held, and a RAM boot waits for its reply. The lock
cannot be held across stock's own send: its give-back frees it whatever its owner took before.

Can `0x404a096c` stay `0xF0`? It is cleared when a write ends a SysEx (`F7`) and by the USB MIDI driver's setup
(`0x40003112`, run when the host configures the port), so a message cut short by unplugging USB is forgotten when
it comes back. `0x40fe4228` is set once and never cleared, so stock's send does not stop between parts. But the
writer that builds Transfer's replies (`0x400823f6`) sends whatever it holds when it is closed (`0x40082324`), and
whether every reply ends in `F7` before that was not read. So the wait has a limit: a SysEx open for more than
about a second (30 UI ticks) no longer holds the link, and its reply's `F7` ends the open one.

Left as stock has it: id `0x04`'s commands 1 and 3 (`0x40080822`, `0x4008084a`) write a 9-byte reply on USB with
`0x40003396` in the MIDI task without the lock, as they do beside stock's own senders. Which of the two tasks runs
first was not read (the scheduler's order of priorities); the link covers both orders. On a unit: not run yet on
this build.

The audio load (`base/load.c`, `load.s`, every base): the base's probe replaces the audio interrupt's call of the audio function (OS 1.13 `0x40059382`, `jsr 0x4005979e`) and reads DMA timer 0 before and after it, 90,112 ticks a codec block. Over 750 blocks (half a second) the busy ticks give the share; about 25 instructions a block. On the Model:Cycles every voice runs whether a pattern plays or not, so the load hardly changes with the sequencer. The developer MCP's `device_load` reads it (`--elektron-midi`).

The diagnostics log (`base/diag.c`, `diag.h`, every base) is the Octatrack's, layout version 2, so the site's parser reads it unchanged (`sdk/tests/test_machine_base.py` checks the layout word for word). Every five minutes a load record: the mean of the half-second windows and the dearest block (per mille), the longest time between two codec blocks (µs) and the longest run of blocks without a UI tick. Incidents: START and BASE (the set identity) at a boot's first tick, HOT for a second at 90 % or more, FREEZE when the UI tick stands still for five seconds while audio runs, each with the six tracks' machines and the last 16 keys pressed. The DSP fields, the tempo, the screen and `playing` stay 0. It lives in the base's memory and starts again at every boot: a freeze that needs a power cycle is lost with it. The audio interrupt keeps the sums; the UI tick alone writes the records. `test_diag.c` runs it on the host. The developer MCP's `device_log` reads it through `log` (`--elektron-midi`).

## Evidence

On the submitter's Model:Cycles, OS 1.13, 23 November 2026, `mc_link.py` from a Mac over USB:

| Image | Request | Result |
| --- | --- | --- |
| `79efd1ec…` (base 2e5243e6 with the first link, any port) | `ident` | link version 1, port USB, one request, nothing dropped |
| the same | `mem 0x40000400 16` | `40 00 04 e8` and zeros, the stock OS's first bytes |
| `6054da89…` (the link limited to USB, dev base `bf2f8ac4`) | `ident` after a fresh flash | port USB, one request, nothing dropped |
| `ccb406b4…` (keys and encoders, dev base `26dee268`) | `key 2 1`, then `key 2 0` | the unit acts as with TRACK held, then let go |
| the same | `enc 2 10` on the main page | PITCH changes as with a turn |
| the same | `enc 13 10`, `enc 14 10`, `enc 15 10` | CHANCE, then REVERB, then DELAY change |
| `089e13a9…` flashed (dev base `984a4508`) | `ramboot` with `f39676d6…` (the same base and a test module that blinks TRIG 16) | upload in 3.2 s, status ok, the unit resets by itself; TRIG 16 blinks; `ident`: mailbox `booted`, `booted from RAM`, CRC `0x36fc4fa1`, the uploaded MAIN OS's |
| the same | a power cycle after it | the flashed image boots, TRIG 16 does not blink |
| `924efa4c…` (dev base `cef3a17a`, the set identity, with the TRIG 16 test module) | `ident` after a fresh flash, 24 November 2026 | set CRC 4076761892 (`0xf2fe7324`), 5764 bytes, as `runid` computes; `rundiff`: the running block byte for byte the image's |
| the same, flashed again later | `ident` after the flash, then after a power cycle | set CRC `0xf2fe7324`, 5764 bytes, both times |
| `bf6c9ff8…` (a dev base that also kept a copy of the block as the gate saw it; not on this branch) | `ident` after the flash and after a power cycle; `rundiff --at` the copy | the CRC at boot, the CRC at the request and `runid` agree (`0xadac0c2e`, 5916 bytes); the copy matches the image byte for byte |
| `0b9fe54c…` (dev base `4cd5cdd9`, the load probe) | `load` four times over a minute, a pattern stopped and playing | 73.0 to 74.7 % a half second, the dearest block 79.1 to 80.9 %, 84.9 % since boot, the same stopped and playing; the unit sounds as before (tester's report); `load` was 0x22 in that base |
| `407fa7d5…` (dev base `bfde5a8e`, the log) | `log` after six minutes with a pattern playing | START, BASE `0x82e35a4a` (as `runid` computes), a load record: mean 73.8 %, dearest block 82.9 %, 600 windows, longest block gap 714 µs, 53 blocks without a tick; the machines in START and BASE read 255: written at the boot gate, before stock had set up its memory |
| `520f99e7…` (dev base `0740bb23`, START and BASE at the first tick) | `log` right after the flash | START and BASE `0x4f182a66` (as `runid` computes) with the machines 0, 4, 4, 2, 0, 5 and the last window's 74.0 % |
| `acb91ea5…` (dev base `4d8f07a0`, the runtime loader), RAM-booted from `520f99e7…` | `ident`, then `mods` | booted from RAM, set CRC `0x6310cf37`, 41860 bytes (as `runid` computes); pool 65536 bytes free, no module live, no refusal |
| the same | `try hello.mwrm --seconds 20`, a pattern stopped | on trial; the 3x3 square at the top right on every page; undone after 20 s, the square gone; 0 live |
| the same | `try hello.mwrm --seconds 5 --keep`, then `mods` after 15 s | kept (generation 5), 1 live (`2cf24dba`), 65200 bytes free; the square still there after 15 s |
| the same | `try` again while a pattern plays | `enter: unsafe`, the kept module unchanged |
| the same | a power cycle | the flashed image runs (set CRC `0x4f182a66`), the square gone |
| `acb91ea5…` RAM-booted again | `try hello.mwrm --seconds 60`, Ctrl-C on trial, `mods` 15 s later | the square went about 10 s after Ctrl-C; 0 live, no refusal |
| the same | `try frames.mwrm --seconds 20` (site `0x40007678`), then `mem 0x40007678 6` and the masked-span counters | "F1 n" on the screen, the unit as usual; undone; the site holds `4e b9 40 07 00 a4` again; 11 masked spans, the longest 874 DMA-timer counts (about 6.5 µs, 1 % of a codec block) |
| the same | `try frames.mwrm --seconds 5 --keep`, then `try v2/frames.mwrm --seconds 20` | "F1 n", on trial "F2 n" counting on, after the undo "F1 n" again; 1 live (`594cfd26 frames`) |
| the same | `try hello.mwrm --seconds 5 --keep` beside frames, then `remove frames --seconds 5 --keep`, `mem 0x40007678 6` | 2 live, "F1 n" and the square; after the removal 1 live (`2cf24dba`), "F1" gone, the square stays, 65200 bytes free; the site holds the stock bytes |
| `7c794349…` (dev base `d1cc7df8`, the loader at 0x31-0x33), RAM-booted | `try frames.mwrm --seconds 10` | on trial, "F1 n" counting (the OS composes frames without a turn too); undone, 0 live |
| `7c794349…` RAM-booted again | the developer MCP: `device_review` and `device_trial` with `frames.mwrm` for 15 s, `device_undo`, a second trial and `device_keep`, `device_status` | "F1 n" all 15 s (the MCP's pings); undone to the base's set; kept: 1 live (`594cfd26 frames`) |
| the same | `try hello.mwrm --seconds 30`, PLAY on trial; STOP 5 s after the tool ends | the pattern plays without dropouts (tester's report); at the end `enter: unsafe (phase trial)`, the square stays while playing and goes about 10 s after the tool ended; 0 live |
| `7c794349…` RAM-booted from `520f99e7…` | `try big33.mwrm` (33,832 bytes, past the 32 KiB staging), `mods` 15 s later | `begin: limit (too large)`; nothing loaded, 65536 bytes free, no refusal counted (the controller refuses before the loader sees it) |
| the same | `try --keep` two modules of 31,832 bytes each, then a third | both kept, 1504 bytes free; the third `verify: rejected`, last refusal `memory`, the two still live and drawing |
| the same, after a power cycle and a new RAM boot | `hello` and `frames` kept, then `try grab.mwrm --seconds 25` (its key and encoder hooks take every event); keys and turns on trial | three modules live: the square, "F1 n" and the last key or turn; the unit does nothing with them; after the undo 2 live, keys and turns act as usual |
| the same | `key 2 1`, then a person presses TRIG 3; `enc 2 10` at once and again 4 s later | the link lets go of TRACK and the press is taken (the track stays); `a person is at the unit`, then `ok` and PITCH up |
| the same | `key 2 1`, `release` 3 s later; `disarm`, `enc 2 10`, `ident` | TRACK held, then let go; `not armed`, PITCH unchanged; `armed 0` |
| the same, disarmed | `ramboot` with the stock `.syx` (old tool: uploaded first) | `not armed`; the unit kept the image and asked "Upgrade OS now?"; YES flashed stock 1.13 |
| `520f99e7…` flashed again | `ramboot` with the stock `.syx` | no question on the unit; it resets into stock from RAM; `ident` no reply (stock has no link) |
| the same | a power cycle | the flashed image (`0x4f182a66`), armed |
| the same | `disarm`, then `ramboot` (the tool now reads the arm first) | `the link is not armed …; nothing was uploaded`, no question on the unit |
| the same | the stock `.syx` sent with stock's upgrade, NO at "Upgrade OS now?" | the unit runs on without a reset; `ident`: `0x4f182a66` |
| `ec928894…` (release base `4d4d91d2`: link, load, log, loader; stock 1.13 + the base alone, as the site builds it), flashed with stock's upgrade | `ident`, `mods`, `load`, `log`, then `key 2 1` and `mem` | set CRC `0x15eddb5a`, 38052 bytes (as `runid` computes), armed 0; pool 65536 free, 0 live; the load (71.6 %); START and BASE `0x15eddb5a` read through `log`; `key` and `mem` `bad request` |
| the same | `try hello.mwrm --seconds 5`, then `--seconds 3 --keep` | the square for 5 s, gone after the undo; then kept, 1 live |
| the same | `try frames.mwrm` while a pattern plays | `enter: unsafe`, the kept module unchanged |
| the same | `try frames.mwrm --seconds 60`, Ctrl-C after about 5 s | "F1 n" counting, gone about 10 s after Ctrl-C; the square stays |
| the same | `frames` kept, `try v2/frames.mwrm --seconds 10` | "F1 n", 10 s "F2 n", "F1 n" again; 2 live |
| the same | `try grab.mwrm --seconds 20` (takes every key and turn), then `remove frames --keep` | the unit ignores keys and turns on trial and acts as usual after the undo; "F1" gone, 1 live, 65200 bytes free |
| the same | `try` the 33,832-byte package; two 31,832-byte modules kept, then a third | `limit (too large)`; 3 live, 1168 bytes free, the third `rejected` (`memory`) |
| the same, Transfer open and connected | `try grab.mwrm --seconds 10`, `load`, `log`, `ident` | on trial and undone, the load and the log read; 0 requests dropped, 0 send failures; Transfer still connected |
| the same | a power cycle | 65536 bytes free, 0 live, no module on the screen |
| `89edf78e…` (release base `646706ff`: the review round's fixes and whole-reply sends; stock 1.13 + the base alone), flashed with stock's upgrade, 25 November 2026 | `ident` | set CRC `0x7c774e99`, 38272 bytes (as `runid` computes); RAM boot mailbox empty, status none, image CRC 0 (a release base sends 0) |
| the same | `try frames.mwrm --seconds 10`, `mods` | "F1 n" for 10 s, undone (generation 2), 0 live, 65120 bytes free |
| the same | `hello` and `corner` (both on the draw hook) kept, then `remove corner --keep` | both squares, 2 live; then only hello's square, 1 live (`2cf24dba`) |
| the same | `try frames.mwrm --seconds 5` while a pattern plays | `enter: unsafe`, no "F1 n", the square stays, the pattern plays without dropouts |
| the same | `try frames.mwrm --seconds 60`, Ctrl-C after about 5 s | "F1 n" gone about 10 s after Ctrl-C; the square stays |
| the same | `try frames.mwrm --seconds 3 --keep`, then `remove frames --keep` | "F1 n" stays, 2 live; after the removal "F1" gone, 1 live |
| the same, Transfer open and connected | `load`, `log`, `try frames.mwrm --seconds 10`, `ident` | 74.3 / 79.0 / 83.7 %; START and BASE `0x7c774e99`, two load records; on trial and undone; 419 requests, 0 dropped, 418 replies, 0 send failures; Transfer still connected (macOS) |
| the same | stock 1.13 with Transfer, then this base from the site's send dialog | stock boots and plays as stock, `ident` unanswered; back on the base: set CRC `0x7c774e99` |
| `1d6c4052…` (development base `d0a26304`, the same source), flashed | `ident` | set CRC `0xb8018c7a`, 42296 bytes, armed; the RAM-boot words read the mailbox as DDR holds it after a cold boot (`4291608025`, `3082223327`, `0xd7f97dbd`): a development base only writes it at a RAM boot |
| the same | `try frames.mwrm --seconds 5`, `--seconds 3 --keep`, `remove frames --keep`, `mem 0x40007678 6` after each | stock bytes `4e b9 40 07 00 a4` after the undo and after the removal; `4e b9 4f e1 6d e0` while kept (the module's code in the uncached alias) |
| the same | `mem` of the masked-span counters after those three | 6 spans, the longest 982 DMA-timer counts (7.27 µs; 874 = 6.47 µs before the flush pushed all four ways) |
| the same | `ramboot` of the same image, `ident` | uploaded in 3.3 s; `ok` before the reset (the held reply went out first); booted from RAM, image CRC `0xe6d65848` (the upload's MAIN OS) |
| the same, RAM-booted, with a test module that holds `ev_tick` for 6 s on TRIG 16 (not in this repository) kept | TRIG 16 while a pattern plays, then `log` | the screen and keys stand still for about 6 s while the audio plays on without dropouts, no reset; four FREEZE incidents, each 9001 or 9002 blocks without a tick (6.0 s), CPU 72-73 %, the six machines and the last keys (TRIG 16 = 31); trigs pressed in the 6 s play when the UI task runs again (stock's key queue) |

## Not tested

- A RAM boot of an image without a development base on the flash; a mailbox refused at boot (each status other than
  `booted from RAM`).

- A request over DIN (dropped by design).
- Keys under FUNC and the flags stock's panel sets on a release.
- A request while Transfer sends (it offers the Model:Cycles no sample upload; tested with Transfer open and connected) or another SysEx stream runs.
- A host that stops reading in the middle of a reply.
- A HOT incident on a unit (FREEZE: seen, above).
- A site under a task paused inside it (the switch is refused and retried).
- A site's stock bytes after an undo on a release base (`mem` is development-only; seen on a development base).
- A trial's pool extent is freed at the next change, not at its undo (seen: 416 bytes held until then).
