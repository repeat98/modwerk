# Digitone II development link

Piece 4 of the [goal](GOAL.md): diagnostics over USB MIDI SysEx and, while armed, panel keys and encoders, in the
[Analog Rytm MKII link's](../analog-rytm-mkii/LINK.md) wire format, so one host can speak to both. It is in
development bases only (`npm run machine:base -- digitone-ii --dev`, base.json's `dev`), never in a release.

```sh
python3 sdk/machines/digitone-ii/tools/dn2_link.py ident
python3 sdk/machines/digitone-ii/tools/dn2_link.py mem 0x47f00000 64
python3 sdk/machines/digitone-ii/tools/dn2_link.py screen --png screen.png
python3 sdk/machines/digitone-ii/tools/dn2_link.py press PLAY      # keys: FUNC PLAY STOP TRIG1-16, or an id
python3 sdk/machines/digitone-ii/tools/dn2_link.py turn A 8        # encoders A-H, LEVEL
```

| Request | cmd | What comes back |
| --- | --- | --- |
| `ident` | 0x01 | link version, link messages received, dropped (ring full or too long), ticks, armed, a person at the unit, presses and turns by a person, events posted, requests refused |
| `disarm` | 0x02 | lets go of every key the link holds and turns the arm off |
| `key ID FLAGS` | 0x10 | armed: a panel key message, flags 0x01 press, 0x10 release; a held key reads as held to stock's is_key_held |
| `enc N DELTA` | 0x11 | armed: an encoder turn, 1-8 A-H, 9 LEVEL |
| `release` | 0x12 | armed: lets go of every key the link holds |
| `diag` | 0x22 | the diagnostics log's address and size, frame interrupts and UI ticks so far |
| `freeze N` | 0x23 | armed: the next UI tick stands still N frames (at most 15 s), to test FREEZE logging |
| `ramboot ULEN UCRC CLEN CCRC` | 0x14 | armed: YES at UPGRADE OS NOW?, and the staged image boots from RAM instead of being flashed (below) |
| `mem ADDR N` | 0x21 | the address, then up to 128 bytes of DDR (0x4000_0000-0x47ff_ffff) or SRAM (0x8000_0000-0x8000_ffff) |

`screen` is the host's: it reads stock's frame pointer and the frame through `mem` (no command of its own on the unit),
so a draw between its reads can tear a frame. Stock keeps two frame pointers side by side at 0x402a10c8 and sends the
first to the display, then swaps them (0x40131fd2), so the frame on the screen is the second; 128x64 pixels, 1 bit each,
in the Analog Rytm MKII's layout.

Status 0 ok, 1 not armed, 2 bad request, 3 busy, 4 out of range, 5 a person at the unit. USB only: a link message from DIN is never acted on.

`ident`, `mem` and the out-of-range refusal answered on a unit over USB ([19 November 2026](../../../docs/verification/2026-11-19-digitone-ii-link-on-a-unit.md)).

## Where it runs (OS 1.12)

- **Receive.** `link.s` observes stock's SysEx router at 0x4012197a (MIDI task), the site core-dn2 0.3's `ev_sysex`
  uses: the message in a1, its length in d1, the source in d2 (2 or 4 USB). The link copies its own messages
  (`F0 7D 'MWL'`) into a ring; every register comes back as it was and stock routes every message as before.
- **Work.** `ev_tick` (UI task) answers up to four a tick through stock's `sysex_send` (0x401236d2) on USB.
- **Waits for stock.** A tick answers nothing while stock is mid-SysEx on USB: the status byte of stock's USB MIDI
  receive parser (0x4011f3c0, the function the USB driver is given) at 0x445090ac reads 0xF0 then. The Rytm's is a word.
- **Keys and encoders.** Posted on the UI task's queue (getter 0x4013747a, queue_put 0x40001896) as the panel's
  messages are, so the UI loop plays them through the core's ev_key/ev_enc sites and stock, and modules see them too.
  A key the link holds also reads as held to stock's is_key_held (0x4011fac4, which base.json points at
  mw_link_held). Key ids and encoders were read from the panel's own messages on a unit
  ([record](../../../docs/verification/2026-11-19-digitone-ii-link-keys-on-a-unit.md)).
- **Arm.** SETTINGS > REMOTE CTRL, ON at every boot of a development base. Keys and turns need it; reads do not. A
  press or turn from a person at the panel refuses the host for about three seconds and lets go of what it held;
  the YES that turns the row on does not count. OFF stops the host until the next boot.
- **Diagnostics.** The Octatrack's log ([`diag.c`](elekloader/base/diag.c), its layout `diag.h` byte for byte), so
  the site reads it with `device-log.ts`: a START at each start, a FREEZE when the UI tick stands still five seconds
  while the frame interrupt goes on (1,500 a second, measured), each with the last 16 keys, and a load window every
  five minutes with the longest run of frames without a tick. No meters, machines or tempo yet, and the log lives in
  .bss, so it starts empty at every start ([record](../../../docs/verification/2026-11-19-digitone-ii-diagnostics-on-a-unit.md)).
- **Not yet.** The Rytm link's remote YES for a flash (on purpose: only a person's YES writes the flash); the
  diagnostics' upload from the page.

## RAM boot

`dn2_link.py ramboot IMAGE.syx` runs an image without erasing or writing the flash; a power cycle brings the
flashed OS back. The unit must run a *flashed* development base: the gate is the flashed image's. The Analog Rytm
MKII link's RAM boot ([its LINK.md](../analog-rytm-mkii/LINK.md#ram-boot)), at OS 1.12's addresses, with one change.

1. The host uploads the image with stock's OS upgrade, then sends `ramboot` with the unpacked MAIN OS's length and
   CRC32 and the container's (the Rytm link's `ramboot_args`). The base presses YES and sets a flag.
2. Stock's upgrade job validates the upload and saves the working state. Where it calls the erase-and-write routine
   (0x4010921c -> 0x40139104), the base looks at the flag: clear, stock's routine runs. Set, it waits and drains as
   stock does, writes the data cache's dirty lines out, switches the data cache off and, if the staged upload has the
   length the host gave and the link is still armed, **copies the container to 0x47000000**, writes a mailbox over the
   32-byte header of stock's upload buffer (0x4038bec0) and resets. Nothing is erased or written.
3. At the next start the flashed base's gate runs at 0x4000053e, before stock fills SRAM and clears its RAM
   (0x402fb000-0x466b8c50, the staged upload included) and before the data cache comes on. It takes the mailbox once,
   only after a software reset, checks it, the copy's CRC32 and its MAIN OS section, unpacks it over the running OS
   with the Rytm link's depacker and enters it. A failure before the unpack boots the flashed OS; one after it resets
   once more, and the spent mailbox boots the flashed OS.

The change: the Digitone II's bootstrap reads the flashed image's packed MAIN OS to 0x40400000 on every start, inside
the staged upload, so the upload is copied before the reset to DDR neither the bootstrap nor stock's start touches.
The CRCs stand guard: a copy that did not survive boots the flashed OS. The same 8 bytes as the Rytm's boot site, the
same reset and the same cache settings on OS 1.12.

Status in `ident` and `bootdiag`: 0 the flashed OS; 1 booted from RAM; 2 a mailbox without a software reset; 3 check
word; 4 lengths; 5 the copy's CRC; 6 no MAIN OS section; 8 failed after the unpack. `bootdiag` reads what the gate
found (the mailbox, the staged struct's first words, the marks of the way to the reset, RSR) from 0x47feffbc.

Cancelling: a press or turn on the panel or a `disarm` cancels the request, and a cancelled request never becomes a
flash: for two minutes after `ramboot` the job's call resets without a mailbox, so the flashed OS comes back
unwritten.

On a unit, 20 November 2026: an image without the marker booted from RAM (boot 1, its own CRC), a power cycle brought
the flashed one back, and stock then flashed normally from this base ([record](../../../docs/verification/2026-11-20-digitone-ii-ram-boot-on-a-unit.md)).
RSR read 0x20 after a power cycle too, so the software-reset check does not tell them apart here; the mailbox, lost
with the DDR's contents at power-off, does.

Limits: the unpacked OS must end below the mailbox (0x38bac0 bytes), the container fit the copy (0x300000 bytes);
the host refuses others. The gate's C code, compiled for a computer, unpacked a development image's container to the
linker's main OS byte for byte (19 November 2026).
