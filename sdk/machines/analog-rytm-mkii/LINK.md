# Analog Rytm MKII development link

A development base's link over USB MIDI: a host on the computer reads the unit's identity, its
screen and memory, and presses keys, turns encoders and confirms an OS upgrade as a person at
the panel would. With it an agent flashes or RAM-boots a test image and drives a test without a
hand on the unit. It is the Rytm's transport the [machine recipe](../../../docs/MACHINE_RECIPE.md)
asks for, SysEx because USB MIDI is all the unit offers; the MCP's device tools do not reach it
yet.

- Unit side: [`elekloader/base/link.c`](elekloader/base/link.c), [`link.s`](elekloader/base/link.s),
  base.json's `dev`.
- Host side: [`tools/rytm_link.py`](tools/rytm_link.py) (Python 3 and `mido` with `python-rtmidi`).
- Written by Nathaniel Pavel; the unit results below are from his MKII on OS 1.74.

## Development bases only

Any USB host can drive the link with no hand on the unit, and that includes confirming stock's
OS upgrade, so a host could write the flash. Release bases never carry it, as the Octatrack's
key injection and RAM boot live only in its development bases. Build one with

```
npm run machine:base -- analog-rytm-mkii --stock STOCK.syx --dev --out NEW-DIR
```

which builds each variant (send-bus and plain) with base.json's `dev` on top, writes
`modwerk-base-analog-rytm-mkii-dev-<sha>.elemod` and checks it against no binding: a development
base is never recorded or released. Link a test image from it with
`node scripts/link-image.mjs ... --elemod DEV.elemod` as any image. The plain variant with `dev`
builds but has not run on a unit.

The link adds one project storage bit (`mw_link_carry`), so a development image has another
storage layout than the release base: link it with `--lock-in` of the image the unit runs, use a
scratch project, and do not go back from a link image to one without it on a project the link
image saved (that project's module data would read as zeros). Cost on the send-bus base: about
4.6 KB of `.run` and 1.8 KB of RAM in the shared mod area. The RAM boot's diagnostics use the top
68 bytes of the mod area, and nothing checks that they are free: a set without a send effect must
leave `ramSpare` of 68 B or more, or the gate writes them into a module's `.bss` at every boot. A
send effect's work area runs to the top of the mod area, so with one in the set `diag` may read the
effect's samples, and a RAM boot request writes 8 bytes into its work area just before the reset.

## Arm

**GLOBAL > REMOTE CTRL**, the last row after SYSTEM, with stock's wrench icon. It is ON at every
boot, power-on included: a development image is meant to be driven. YES on the row toggles it
(OFF lasts until the next boot); RIGHT sets it ON. The row is the only place a person sees the
arm: the base also draws a 2 x 5 notch at x 126-127 of the header bar, but on the unit it reads
as part of stock's stop square, and only screen compares see it.

Reads (`ident`, `screen`, `mem`) work disarmed. Keys, turns, `confirm` and `ramboot` need the arm,
and stop as soon as a person touches the panel: a press or turn on the panel while armed lets go
of every key the link holds and refuses the link's keys and turns for about 3 s (status
`a person is at the unit`). A press of the key whose event was just dispatched, in the same tick,
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
| `ident` | 0x01 | no | link version, armed, person-at-unit flag, counters (person, posted, refused, drops, received), the link's tick count, reset status, playing, the image label (`link-image.mjs --version`), the OS build; the RAM boot's status, the CRC32 of 356 SRAM bytes as the gate found them, and the CRC32 of an image entered from RAM |
| `disarm` | 0x02 | no | turns the arm off and clears every key the link held |
| `key ID FLAGS` | 0x10 | yes | a panel key message on the UI queue with the flags as given; a held key reads as held to `is_key_held` |
| `enc N DELTA` | 0x11 | yes | an encoder message (0-7 A-H, 8 LEVEL) of one raw count, as the panel task posts it |
| `release` | 0x12 | yes | lets go of every key the link holds |
| `confirm` | 0x13 | yes | YES pressed and let go, for stock's UPGRADE OS NOW? |
| `ramboot ULEN UCRC CLEN CCRC` | 0x14 | yes | as `confirm`, but the next boot runs the upload from RAM (below) |
| `screen OFF` | 0x20 | no | 512 bytes of the frame on the screen from OFF (0 or 512) |
| `mem ADDR N` | 0x21 | no | up to 128 bytes of DDR (0x4000_0000-0x47ff_ffff) or SRAM (0x8000_0000-0x8000_ffff) |

USB only: the router hook drops link messages from DIN. A key or turn the link posted that never
reaches `ev_key`/`ev_enc` within about a second is given up, so one lost message cannot make every
later one count as a person's.

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
have refused. The gate runs from the mod area (0x47be0000 up), its stack at 0x48000000 down, and
the unpack writes below 0x403c8b00.

The cache: stock runs DDR copyback, and the soft reset does not write dirty lines out. A mailbox
written through the cache and pushed with `cpushl` alone was not in DDR after the reset on a MKII.
`mw_cache_off` (`link.s`) evicts by reads and `cpushl`, then loads CACR without the data cache, and
only then are the mailbox and the marks written.

Boot status in `ident`: 0 the flashed OS, no RAM boot asked; 1 booted from RAM; 2 a mailbox without
a software reset; 3 check word; 4 lengths; 5 container CRC; 6 no MAIN OS section; 8 failed after
the unpack. `rytm_link.py diag [IMAGE]` reads and names what the gate found at the last boot (the
mailbox, the staged buffer's first words, the running image's marks on its way to the reset, RSR)
from the 60 bytes of the mod area below its top 8, which hold the marks. Stock shows the flashed image's label whatever runs (the
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
- A hang in the gate or the RAM-booted image is cleared by a power cycle. The gate runs with
  interrupts masked for the seconds its CRCs take.

The base's host-command and menu code is marked `cold` (sized, not timed), which saves about
1.1 KB. `cold` needs `noinline`, or GCC inlines it into a hot caller; and GCC also sizes what only
cold code calls, so the depacker is marked `hot`.

## Host tool

```
rytm_link.py ident
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
the screen, `ident` prints the identity. A failed step sends `release` before the tool stops.
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
  RAM boots afterwards took 16 to 21 s. A RAM-booted image's own `ramboot` does not land (the
  request is the running image's, the gate the flashed one's). Two earlier gates whose mailbox
  went through the cache came back as the flashed OS: why the cache-off reset exists.
- Rytm module tests driven through the link on the unit: Improved AMP (25 cases), Quick Mod
  Assign (6), Improved SMPL (7).

## Not tested

- On a unit: the plain variant with `dev`; cancelling a RAM boot by a panel press, `disarm` or the
  timeout (emulator only); a RAM boot across storage layouts read back by the flashed OS (read in
  the code only); `flash` in Overbridge mode; a watchdog in a longer gate run (none bit in 13 s
  boots); a failed `steps` step's `release` with a key held.
- Key flags: the double-press flag and the marked-key up are not sent; no stock gesture that
  needs them was tried. The event time is 0 in the link's messages: parameter turns and FUNC +
  turn match the panel's, but a stock gesture that times a hold from the event time may not.
