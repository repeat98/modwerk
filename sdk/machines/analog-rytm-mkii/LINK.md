# Analog Rytm MKII link

The Rytm's link over USB MIDI. Every Modwerk base carries the part for musicians' units, as the
Octatrack's and the Model:Cycles' do: a host reads the unit's identity with the set identity (which
build runs), the audio load and the diagnostics log. A development base adds the screen and memory,
and presses keys, plays pads, turns encoders and confirms an OS upgrade as a person at the panel
would: with it an agent flashes or RAM-boots a test image and drives a test without a hand on the
unit. It is the Rytm's transport the [machine recipe](../../../docs/MACHINE_RECIPE.md) asks for,
SysEx because USB MIDI is all the unit offers. The Model:Cycles' link follows this one (the same
wire, the same commands). The developer MCP's `device_status`, `device_load` and `device_log` read it
with `--elektron-midi` ([FRONTEND_MCP.md](../../../docs/FRONTEND_MCP.md#an-analog-rytm-mkii-over-its-link),
`src/engine/elektron/rytm-link.ts`); the machine page does not yet.

- Unit side: [`elekloader/base/link.c`](elekloader/base/link.c), [`link.s`](elekloader/base/link.s)
  and the log and load ([`diag.c`](elekloader/base/diag.c), [`load.c`](elekloader/base/load.c)),
  base.json's `common` (every base); [`link-dev.s`](elekloader/base/link-dev.s) and `MODWERK_DEV`,
  base.json's `dev`.
- Host side: [`tools/rytm_link.py`](tools/rytm_link.py) (Python 3 and `mido` with `python-rtmidi`).
- Written by Nathaniel Pavel; the unit results below are from his MKII on OS 1.74.

## Every base, and development bases

Every base, release or development, in every variant, answers `ident`, `load`, `diag` and `log`,
and takes runtime modules on trial (`up_part`, `up_run`, `mods`: [Loading modules](#loading-modules)).
Beyond that it reads and changes nothing: no host can press a key, read memory outside the log or
confirm an upgrade on a release base, which answers every other request `bad request`. On the
send-bus variant they cost 3,396 bytes of `.run` and 6,848 of RAM in the shared mod area, 6,148 of
it the log (voices the same; plain 3,348 and 6,848), and one site each in stock's SysEx router and
boot (`0x40083dd8`, `0x400008c6`). The boot site computes the set identity, with the data cache off
(stock's own state at that point), over the `.run` block once a boot.

**Nothing in the audio interrupt.** An idle unit pays for none of it while playing: the load and the
log run on the UI task, from the sums the lean engine's CPU mark already keeps in the interrupt
(`perf-cpu-mark.c`; the link adds the look's dearest block there: one compare and branch a block,
13 instructions instead of 10), and `sdk/tests/test_machine_base.py` refuses a link, load or log
handler on the render events. On the UI task, about 20 times a second, the link looks at an empty
ring and the log at the time since the last tick; the router runs only when a SysEx arrives.

A development base adds the rest. Any USB host can drive it with no hand on the unit, and that
includes confirming stock's OS upgrade, so a host could write the flash. Release bases never
carry it, as the Octatrack's key injection and RAM boot live only in its development bases. Build
one with

```
npm run machine:base -- analog-rytm-mkii --stock STOCK.syx --dev --out NEW-DIR
```

which builds each variant (send-bus, voices and plain) with base.json's `dev` on top, writes
`modwerk-base-analog-rytm-mkii-dev-<sha>.elemod` and checks it against no binding: a development
base is never recorded or released. Link a test image from it with
`node scripts/link-image.mjs ... --elemod DEV.elemod` as any image. The plain variant with `dev`
builds but has not run on a unit.

The link adds one project storage bit (`mw_link_carry`), so a development image has another
storage layout than the release base: link it with `--lock-in` of the image the unit runs, use a
scratch project, and do not go back from a link image to one without it on a project the link
image saved (that project's module data would read as zeros). Cost on the send-bus base, on top of
every base's part: about 5.3 KB of `.run` and 1.7 KB of RAM in the shared mod area. The RAM boot's diagnostics are 68 bytes
at `0x47FEFFBC`, above every area the linker gives the mods and 64 KB under the boot stack's top
([shared mod memory](README.md#memory-and-budgets)); `ident` names the place. A base built before that
kept them in the top 68 bytes of the 128 KiB mod area (`0x47BFFFBC`), where a full set's `.bss` or a
send effect's work area could hold them; the tool reads there when `ident` names no place.

## Arm

**GLOBAL > REMOTE CTRL**, the last row after SYSTEM, with stock's wrench icon. It is ON at every
boot, power-on included: a development image is meant to be driven. YES on the row toggles it
(OFF lasts until the next boot); RIGHT sets it ON. The row is the only place a person sees the
arm; the screen is stock's. (Bases before 21 Nov 2026 drew a 2 x 5 notch at x 126-127 of the header
bar while armed; the test runner's screen compares skip it, so references recorded with it still pass.)

Reads (`ident`, `load`, `diag`, `log`, `screen`, `mem`) work disarmed. Keys, turns, pads, `confirm` and `ramboot` need the arm,
and stop as soon as a person touches the panel: a press or turn on the panel while armed lets go
of every key and pad the link holds and refuses the link's keys, turns and pads for about 3 s (status
`a person is at the unit`). A person playing a pad is not seen: the panel's pad messages never reach
`ev_key` or `ev_enc`, where the link watches for a person. A press of the key whose event was just dispatched, in the same tick,
is what a module playing a held-back tap again through `core_key` looks like (Quick Mod Assign's
LFO tap): it counts only when the panel's key bitmap holds that key. A module's own key messages
(Control In Actions' `CIA1`) are not panel keys. A panel tap held 10 ms still counts.

## Wire format

SysEx, manufacturer 0x7D (non-commercial):

```
host -> unit  F0 7D 'M' 'W' 'L' 01 seq cmd payload.. F7
unit -> host  F0 7D 'M' 'W' 'L' 01 seq cmd|0x40 status payload.. F7
```

Numbers are u32 as five 7-bit bytes, least significant first. Byte blocks (screen, memory) are
7-bit packed in Elektron's framing: each group of up to 7 bytes follows a byte with their top
bits, the first byte's in bit 6. Status: 0 ok, 1 not armed, 2 bad request, 3 busy, 4 out of
range, 5 a person is at the unit.

| Request | cmd | Arm | What comes back |
| --- | --- | --- | --- |
| `ident` | 0x01 | no | every base: link version, armed, person-at-unit flag, counters (person, posted, refused, drops, received), the link's tick count, reset status, playing, the image label (`link-image.mjs --version`), the OS build; the RAM boot's status, the CRC32 of 356 SRAM bytes as the gate found them, and the CRC32 of an image entered from RAM; where the gate keeps its diagnostics; and the set identity (below). A release base sends the arm, person and RAM boot fields as 0. An older base ends earlier: before the set identity, or before the diagnostics' place |
| `diag` | 0x22 | no | every base: the diagnostics log's address and size in bytes (the Model:Cycles' and Digitone II's number) |
| `load` | 0x23 | no | every base: the audio block's share of its period over the last look (ten UI ticks, about half a second while the UI keeps up), that look's dearest block and the dearest block since boot (tenths of a percent), the looks and the blocks counted (`load.c`) |
| `log OFF N` | 0x24 | no | every base: up to 128 bytes of the diagnostics log from OFF, as `mem`'s reply (offset, count, bytes); nothing outside the log |
| `disarm` | 0x02 | no | turns the arm off and clears every key the link held |
| `key ID FLAGS` | 0x10 | yes | a panel key message on the UI queue with the flags as given; a held key reads as held to `is_key_held` |
| `enc N DELTA` | 0x11 | yes | an encoder message (0-7 A-H, 8 LEVEL) of one raw count, as the panel task posts it |
| `release` | 0x12 | yes | lets go of every key the link holds |
| `confirm` | 0x13 | yes | YES pressed and let go, for stock's UPGRADE OS NOW? |
| `ramboot ULEN UCRC CLEN CCRC` | 0x14 | yes | as `confirm`, but the next boot runs the upload from RAM (below) |
| `pad PAD WHAT VALUE` | 0x15 | yes | a pad (0-11, BD to CB) as the panel posts it: WHAT 1 down with a velocity (1-127), 2 its pressure (0-255, the panel's byte: MIDI sends half), 0 up (0); every view's pad and pressure methods see it as a hand on the pad. `release` and `disarm` send a held pad's pressure 0 and its up. A base before this answers `bad request` |
| `screen OFF` | 0x20 | no | development bases: 512 bytes of the frame on the screen from OFF (0 or 512) |
| `mem ADDR N` | 0x21 | no | development bases: up to 128 bytes of DDR (0x4000_0000-0x47ff_ffff) or SRAM (0x8000_0000-0x8000_ffff) |

The rows marked yes (`disarm` too) are development bases' only.

**The set identity** is the CRC32 and the length of the `.run` block: the base and every module
linked into the image, as the linker placed them, taken by the boot site before any handler runs
(the core has copied the block from the image to DDR unchanged just before). `scripts/link-image.mjs`
prints the same two numbers as `run` for the image it writes, so a host tells which build a unit runs
by comparing them; the base cannot carry its own package hash. Seen in rytm-emu on LK01 (release
send-bus base `9413108d` + Filter Hz): `fbcf1ac8`, 42,384 bytes, from both.

**The diagnostics log** is the Octatrack's layout, version 2 ([`diag.h`](elekloader/base/diag.h),
checked against the Octatrack's by `sdk/tests/test_machine_base.py`), so the site's parser reads it.
The Rytm fills the five-minute load records (the audio's mean and dearest block, the looks the
sequencer played and the longest time between two UI ticks, in audio blocks; the gap between audio
blocks stays 0, since nothing of the log runs in the interrupt) and START, BASE (the set identity),
HOT (a second at 90 % or more) and FREEZE (the UI standing still five seconds or more, logged when
it comes back) with the last 16 keys pressed and whether the sequencer played. Machines, FX, screen and tempo stay 0: not read yet. It lives in the base's RAM and
starts again at every boot. Times come from the audio's own clock (1,500 blocks a second, counted by
the CPU mark), the UI's stalls from DMA timer 0 measured against it, so no timer rate is assumed.

USB only: the router hook drops link messages from DIN. A key or turn the link posted that never
reaches `ev_key`/`ev_enc` within about a second is given up, so one lost message cannot make every
later one count as a person's.

## Loading modules

Every base carries the Octatrack's runtime loader ([`sdk/runtime/loader`](../../runtime/loader/README.md)) and
upload controller ([`sdk/runtime/upload`](../../runtime/upload/README.md), wire version 1), shared as on the
Model:Cycles, with the Rytm's glue in [`runtime.c`](elekloader/base/runtime.c) and the Model:Cycles' link transport
unchanged in [`modules.c`](elekloader/base/modules.c): `up_part` writes up to 96 bytes of an upload frame, `up_run`
runs it on the UI task, `mods` lists the pool and the live modules. A trial loads a module to RAM; Keep keeps it until
the next power cycle (nothing is saved); Undo, or ten seconds without a link request in any phase but the normal one,
puts the previous set back; a power cycle always restores the flashed set. The loader refuses while a pattern plays
(`unsafe`). A package up to 32 KiB goes in 2 KiB CHUNK frames; the pool holds 64 KiB of modules, 16 at most.

```
python3 -B sdk/runtime/loader/build.py sdk/machines/analog-rytm-mkii/elekloader/examples/hello.c -o hello.mwrm
rytm_link.py try hello.mwrm --seconds 20 [--keep]
rytm_link.py mods
rytm_link.py keep | undo
rytm_link.py remove NAME --seconds 5 [--keep]
```

The developer MCP's `device_review`, `device_trial`, `device_keep` and `device_undo` do the same with
`--elektron-midi` ([FRONTEND_MCP.md](../../../docs/FRONTEND_MCP.md#an-analog-rytm-mkii-over-its-link)). A module's
handlers run on the UI task: `module_draw` gets the core's bitmap (stock's fillrect, `FILLRECT_AT`), `module_key` the
panel's key code and whether it went down (a held key's repeats arrive as presses, as on the Model:Cycles), `module_enc` the knob (0-7 A-H, 8 LEVEL) and its count. Key codes and
addresses are OS 1.74's.

What the glue rests on (read from OS 1.74; `runtime.c`'s header has the addresses): the kernel is the Octatrack's and
the Model:Cycles' design (the switch saves d0-a7 at TCB + 0x0c, one ready list a priority), with sixteen tasks created
with constant arguments, two of them a factory test console's behind a boot flag; caches as theirs (CACR
`0xa50ce100`, data ACR0 `0x4007e020`), so DDR's mirror at +0x0800_0000 is uncached; the audio interrupt at level 5,
so the loader's level-4 lock leaves it running; sites only in stock code below its `.data` image (`0x402ce000`).

**Cost.** About 32 KB of `.run` and 108 KB of the shared mod area in every base, 96 KB of it the pool and the upload
staging. Nothing in the audio interrupt; the four UI hooks return after one test while no module is live, and the
tick counts the live modules once (16 reads, about 20 times a second).

## Where it runs (OS 1.74)

- **Receive.** Stock's SysEx router (0x40083dd8, MIDI task) gets every complete SysEx and drops
  anything that is not Elektron's. `link.s` takes its first instructions: `F0 7D 'MWL'` from USB
  (interface 2, or 4 on the auto channel) goes into a ring and no further; the rest goes on to
  stock unchanged.
- **Work.** `ev_tick` (UI task, about 20 Hz) takes the ring, acts and replies through stock's
  `sysex_send` on USB, never from the audio interrupt, and waits a tick while stock is mid-SysEx.
  `sysex_send` waits for room in the USB ring: a host that stops reading in the middle of a reply
  can hold the UI task, as stock's own SysEx can. Keep the port open until the reply.
- **Keys and encoders** go on the UI task's queue (0x4011fb56, `queue_put` 0x400013b2) as the
  panel's messages do, so the UI loop plays them through the core's `ev_key`/`ev_enc` and stock:
  modules see them too. `is_key_held` (0x40081c28) is pointed at `mw_link_held`, so a key the link
  holds reads as held there: FUNC + turn and every other held-key test behave as on the panel.
- **Screen.** Stock sends `*0x40287b68` to the display, then swaps it with `*0x40287b6c`, so the
  frame on the screen is the second; the link reads that one.

## Key flags

Stock's key scan (0x40081dac) posts a key with these flags, and the host tools send the same:

- Down: 1. Up: 0x10 only when the key is the one that went down last; any other key's up carries
  0 (stock reads bit 0 clear as the release).
- Both add 2 when the key went down while FUNC was held, so the up keeps it after FUNC is let go.
  Stock's FUNC + key handlers read that bit, not the held-key bitmap.
- Not sent: 4 on a second press inside stock's double-press time, and the up without 0x10 that
  the scan gives the keys its table at 0x418d1310 marks.

The link's own `release` posts every held key's up as a plain 0x10, so the tools let go key by key
first (newest first, FUNC last) and send `release` after. The tracker lives in the host process:
keep a hold and the keys under it in one `steps` text.

## Turns

A turn message carries a raw count, and stock treats it as the panel's. On a parameter page stock
passes every turn through a per-knob filter (0x4006f1fa) with five counters per knob:

- A rest counter climbs by one every 100 ms up to 48. A turn that finds it above 24 moves nothing:
  it shows the value and lowers the counter by 3 per count. So a knob left alone for 2.5 s or more
  swallows its next turn, and 16 counts always empty the counter.
- Below that, counts add to a remainder; every 4 counts (the parameter's divisor: 4 on TRIG and
  SRC, 3 on AMP and FILTER) give one step, times an acceleration that grows with fast turns and
  decays by a third every 100 ms. A step that moved the value clears the remainder and, for most
  parameters, puts the rest counter back up by 48.
- A turn shows the value overlay for about 2.3 s.

So one raw count on a sound parameter does nothing, and how far a burst moves a value depends on
what the knob did before. `nudgeA+3` sends one turn of 16 counts the other way (it empties the
rest counter, the remainder and the acceleration), then one turn of 4 counts per step: exactly
three steps, provided the knob rested 3 s since its last turn (`w3000`). `nudgeB+3/3` sends 3
counts a step (`/1` to `/8`). LEVEL on the tempo page and menu lists take single counts.

FUNC + turn (`+FUNC w300 nudgeA+1 -FUNC`) gives stock's coarse step, on its grid (NOT at -1: FUNC
+1 gives 0, FUNC -1 gives -12). Stock keeps whether the last turn that moved a value was with FUNC
(a byte at 0x417e32b8): the first moved FUNC turn after a plain one is dropped, and that knob's
turns stay dropped for 0.4 s. A turn 70 ms after the link's FUNC went down was taken without FUNC,
170 ms after with it: leave 300 ms between a key change and a turn.

## Flash

`rytm_link.py flash IMAGE.syx --label XXXX` sends the image with stock's OS upgrade protocol (0x50,
0x51 in 2 KiB blocks of the `.syx`, as elektroid: each block's CRC is zlib's crc32 seeded with
0xffffffff, a reply's sequence echo at bytes 2-3), presses YES at UPGRADE OS NOW?, waits for the
unit to come back and checks its label. It first presses NO three times: started from the GLOBAL
menu, stock shows OS UPGRADE / WAITING FOR SYSEX and answers every block with status 2. It
confirms only when stock answers the last block "done", and `--label` is required. Nothing is
erased before the YES; after it stock writes the flash on its own and reboots.

The machine page sends a build the same way (stock's OS upgrade over USB MIDI, `src/engine/elektron/usb-upgrade.ts`,
the Model:Cycles' sender), from its install guide's **Send over USB** (beta testers only, as the rest of the
stack until the owner releases it), and leaves the YES to the person at the unit:
any base, release or not, since the upgrade is stock's. Seen on a MKII (25 November 2026): that sender, run from the
computer, sent SR01 (958 blocks) in 7.0 s to UPGRADE OS NOW?, and NO there left the running image as it was. A page
started from GLOBAL > OS UPGRADE gets status 2 for every block; the sender then says to leave every menu.

A flashed image that hangs at boot needs MIDI DIN recovery (FUNC at power-on, OS UPGRADE): boot
every image in rytm-emu first and check it answers `ident` there.

## RAM boot

`rytm_link.py ramboot IMAGE.syx --label XXXX` runs an image without erasing or writing the flash
(stock still saves the working state first, as before a flash); a power cycle brings the flashed
OS back. The unit must run a *flashed* development base: the gate that boots from RAM is the
flashed image's, and the code that writes the request is the running image's.

1. The tool uploads the image as `flash` does, then sends `ramboot` with four numbers it works out
   from the file (`ramboot-args IMAGE` prints them): length and CRC32 of the unpacked MAIN OS,
   length and CRC32 of the ELE3 container. The base presses YES and sets a flag.
2. Stock's upgrade job validates the upload and saves the working state. Where it calls the
   erase-and-write routine (0x4004dc14 -> 0x4009f404), the base looks at the flag: clear, stock's
   routine runs (a normal flash). Set, it waits as stock does; if the staged upload has the length
   the host gave and the link is still armed, it writes the data cache's dirty lines to DDR,
   switches the data cache off, writes a mailbox over the 32-byte header of stock's upload buffer
   (0x403c8b00) straight to DDR, and resets. Nothing is erased or written.
3. At the next boot the flashed base's gate runs before stock fills SRAM (0x400008c6). It takes the
   mailbox once, and only after a software reset (RSR bit 5). It checks the mailbox's check word,
   the lengths, the container's CRC32 and that the container has a MAIN OS section for 0x40000400,
   unpacks it over the running OS with its own depacker (`depack` in `link.c`, the format
   `sdk/firmware_codec/elz.py` reads), checks the result's length and CRC32 and enters it. A
   failure before the unpack boots the flashed OS with a status; one after it resets once more,
   and the spent mailbox then boots the flashed OS.

The gate calls nothing of the bootstrap or the OS: a MKII's SRAM did not hold the 1.74 container's
bootstrap bytes (`ident`'s probe), so an earlier gate that called the bootstrap's depacker would
have refused. The gate runs from the flashed base's mod area (0x47be0000 up on a 0.7 base,
0x47b50000 up from 0.7.1), its stack at 0x48000000 down, and the unpack writes below 0x403c8b00.

The cache: stock runs DDR copyback, and the soft reset does not write dirty lines out. A mailbox
written through the cache and pushed with `cpushl` alone was not in DDR after the reset on a MKII.
`mw_cache_off` (`link.s`) evicts by reads and `cpushl`, then loads CACR without the data cache, and
only then are the mailbox and the marks written.

Boot status in `ident`: 0 the flashed OS, no RAM boot asked; 1 booted from RAM; 2 a mailbox without
a software reset; 3 check word; 4 lengths; 5 container CRC; 6 no MAIN OS section; 8 failed after
the unpack. `rytm_link.py diag [IMAGE]` reads and names what the gate found at the last boot (the
mailbox, the staged buffer's first words, the running image's marks on its way to the reset, RSR)
from the 60 bytes `ident` names; the 8 after them hold the marks. When the flashed base and a
RAM-booted image keep them in different places (one built before the move, one after), `diag` reads
where the running image says and the flashed gate wrote elsewhere: read `diag` on the flashed image.
A fill of that RAM lasted through soft resets, the bootstrap and RAM boots on a unit; a `diag` readout
of marks written there by a flashed base is not tested. Stock shows the flashed image's label whatever runs (the
label lives in the container header), so `ident`'s label stays the flashed one after a RAM boot;
its image CRC tells which image runs, and the tool compares it with the file's.

Cancelling: a press or turn on the panel, a `disarm`, or a minute without the reset cancels the
request, and a cancelled request never becomes a flash: until the carry ends (at most two minutes
after `ramboot`) the job's call resets without a mailbox and the flashed OS comes back unwritten. A
hand upgrade confirmed in that time resets the same way and must be done again. `ramboot` is
refused in the first seconds after a boot.

Limits, none checked by the base:

- The host is trusted for the four numbers; the gate checks the upload against them.
- The unpacked image must be under 0x3c8700 B (it would reach the mailbox), and the *flashed*
  image's packed MAIN OS under 0x1c8b00 B: the bootstrap reads it to 0x40200000 on every boot, and
  a longer one overwrites the staged upload (the container CRC then fails).
- The image is for the same OS release.
- A RAM-booted image saves projects, kits and +Drive data in its own storage layout and stamps the
  open project with its layout ID. The flashed OS reads that data back only when both have the
  same layout ID; an image with other modules has another one, and after the power cycle the
  flashed OS reads the stamped project's module settings, and each sound or kit the RAM-booted
  image stamped, as zeros. Stock data is not touched. RAM-boot such an image in a scratch project
  and load no other.
- A RAM-booted image with a release base answers no `ramboot`: only a power cycle leaves it.
  `rytm_link.py ramboot` reports such an image by its set identity, since a release base sends the
  RAM boot's fields as 0.
- A hang in the gate or the RAM-booted image is cleared by a power cycle. The gate runs with
  interrupts masked for the seconds its CRCs take.

The base's host-command and menu code is marked `cold` (sized, not timed), which saves about
1.1 KB. `cold` needs `noinline`, or GCC inlines it into a hot caller; and GCC also sizes what only
cold code calls, so the depacker is marked `hot`.

## Host tool

```
rytm_link.py ident                               # with the set identity: set_crc, set_bytes
rytm_link.py load                                # the audio load (every base)
rytm_link.py log [--json FILE] [--raw FILE]      # the diagnostics log (every base)
rytm_link.py screen --png shot.png               # --ascii prints it
rytm_link.py mem 0x402728bd 8
rytm_link.py steps 'GLOBAL w300 DOWN*3 YES png:shot.png NO'
rytm_link.py flash IMAGE.syx --label XX01         # stock upgrade + remote YES
rytm_link.py ramboot IMAGE.syx --label XX01       # the same upload, booted from RAM
rytm_link.py diag [IMAGE.syx]                     # what the gate found at the last boot
rytm_link.py ramboot-args IMAGE.syx | encode ... | decode FILE   # for rytm-emu
```

Steps: key taps by rytm-emu's panel names (YES, NO, FUNC, T1..T16, BD..CB, PLAY, STOP ...),
`KEY+KEY` holds all but the last, `KEY*N` repeats, `+KEY`/`-KEY` hold and let go, `encA+3` raw
counts, `nudgeA+3` and `nudgeB+3/3` steps (Turns), `w300` waits, `png:PATH` and `ascii` capture
the screen, `ident` prints the identity. `rytm_link.py diag` is the RAM boot gate's record (above); the
diagnostics log is `log`. A failed step sends `release` before the tool stops.
The unit sends MIDI clock all the time, and closing rtmidi's input then hangs, so the tool leaves
with `os._exit`. If `ramboot` waits 110 s and exits, read `ident`: the unit has usually come up and
the host's port reopen hung (2 of 33 boots).

In rytm-emu: `rytm_link.py encode ...` gives the hex for `dtboot --usb-midi HEX@CLOCK`; run dtboot
with `DTBOOT_USB_OUT=FILE`, and `rytm_link.py decode FILE --png-dir DIR` reads the replies.
rytm-emu starts a cold machine at a reset, so a RAM boot can only be seen on a unit there (or in an
emulator that keeps DDR across the soft reset; propose that to
[rytm-emu](https://github.com/trigcondition/rytm-emu), not here).

## Evidence

All on one MKII, OS 1.74, with development images built from this link on the send-bus base of
9 to 11 November 2026, before it was moved into base.json's `dev`; the base around it has changed
since, the link has not.

- rytm-emu (pinned): ident, both screen halves, mem, arm, remote NO/PLAY/STOP/TEMPO, LEVEL turns,
  every refusal, a person's press letting go of a link-held FUNC, disarm, and a full remote
  flash (889 blocks, back with the new label).
- Unit, link: `ident`, `screen`, `mem`, a remote NO. `flash` of a 16-module image: 916 blocks in
  5.9 s, back after 13.1 s with the new label, 21 s in all. Turns on NOT: `nudgeA+2` C 3 -> C#3
  and back; link-held FUNC + nudge steps by octaves (so `is_key_held` sees the link's FUNC).
  Overbridge mode (USB CONFIG: OVERBRIDGE, a 12-in, 12-out audio device): ident, screen, mem,
  keys, nudges and FUNC nudges as before, 18 posts, 0 refused, 0 drops. Power: a short flick
  reads a software reset (the supercap), a minute off reads power-on.
- Unit, RAM boot: flashed gate base, another image uploaded: boot 1, that image's CRC, still
  armed; the same image over itself: sent in 5.6 s, back after 13.2 s, about 19 s to `ident`.
  RAM boots afterwards took 16 to 21 s. A RAM-booted image's own `ramboot` did not land then (the
  request is the running image's, the gate the flashed one's); on 17 November 2026 four in a row did,
  each image built from the base of that day and RAM-booted over the one before, the flash on RB08. Two earlier gates whose mailbox
  went through the cache came back as the flashed OS: why the cache-off reset exists.
- Rytm module tests driven through the link on the unit: Improved AMP (25 cases), Quick Mod
  Assign (6), Improved SMPL (7).
- Every base's part on a unit (25 November 2026, the test rig, hands off), on the build before the
  load and log moved out of the audio interrupt (the gap between blocks was then measured): SR01 (the combo set of
  FXCJ on its voices development base with this change, layout unchanged) RAM-booted over FXCJ:
  `ident`'s set identity `91b73d51`, 207,400 bytes, as `link-image.mjs` printed; `load` 59.2 %
  stopped, 68.4 % playing (dearest block 74.2 %); the log's START and BASE, then its first
  five-minute record (mean 62.3 %, dearest block 76.5 %, 10 half seconds playing, longest block gap
  742 µs, longest run without a UI tick 371 blocks); `link-global-menu`, `link-func-nudge` and
  `pad-pressure-pad-plain` pass. SR02 (the same set on the release base) RAM-booted from SR01:
  set identity `600cdffc`, 202,044 bytes, as printed; `load` and the log (BASE `600cdffc`);
  `key`, `pad`, `enc`, `release`, `confirm`, `ramboot`, `disarm`, `screen` and `mem` all
  `bad request`.
- Every base's part in rytm-emu, on the build before its review fixes (the HOT run, the nonce): LK01 (release send-bus base `9413108d` + Filter Hz) answers `ident` with the set identity `link-image.mjs` printed, `load`,
  `diag` and the whole log (START, then BASE with the set identity), and refuses `key`, `screen`
  and `mem` (`bad request`). LD01 (the same set on development base `a24f78c1`): the runner's
  `link-global-menu`, `link-func-nudge` and `pad-pressure-pad-plain` pass. rytm-emu counts
  instructions, so its load figures are no measure of the unit's.

## Not tested

- On a unit: a flashed release base (only RAM-booted ones); the boot time the set identity adds
  (not measured: RAM boots came back in 11 to 14 s, as before); the plain and send-bus variants of
  every base's part; a HOT or FREEZE incident.
- On a unit: the plain variant with `dev`; cancelling a RAM boot by a panel press, `disarm` or the
  timeout (emulator only); a RAM boot across storage layouts read back by the flashed OS (read in
  the code only); `flash` in Overbridge mode; a watchdog in a longer gate run (none bit in 13 s
  boots); a failed `steps` step's `release` with a key held.
- Key flags: the double-press flag and the marked-key up are not sent; no stock gesture that
  needs them was tried. The event time is 0 in the link's messages: parameter turns and FUNC +
  turn match the panel's, but a stock gesture that times a hold from the event time may not.
