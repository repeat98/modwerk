# Model:Cycles development link

A development base's link over USB MIDI: a host on the computer reads the link's identity and the unit's memory, and
presses keys and turns encoders as a person at the panel would, and boots an uploaded image from RAM without
flashing it.
It is the first piece of the Model:Cycles' USB link the [machine recipe](../../../docs/MACHINE_RECIPE.md) asks for,
SysEx because USB MIDI is all the unit offers, and it follows the
[Analog Rytm MKII's link](../analog-rytm-mkii/LINK.md) by Nathaniel Pavel: the same wire format, the same place in
the OS. No flash over the link yet: a base still goes on the unit as an OS update.

- Unit side: [`elekloader/base/link.c`](elekloader/base/link.c), [`link.s`](elekloader/base/link.s),
  base.json's `dev`.
- Host side: [`tools/mc_link.py`](tools/mc_link.py) (Python 3 and `mido` with `python-rtmidi`).

## Development bases only

Release bases never carry it. Build one with

```
npm run machine:base -- model-cycles --stock STOCK.syx --dev --out NEW-DIR
```

which writes `modwerk-base-model-cycles-dev-<sha>.elemod`, checked against no binding: a development base is never
recorded or released. It costs about 5.4 KB of `.run` and 1.3 KB of RAM in the shared mod area (dev base `984a4508`:
5624 bytes `.run`, 1284 `.bss`, 8 sites).

## Arm

The link is armed at every boot: a development image is meant to be driven. `disarm` turns it off until the next
boot. Reads (`ident`, `mem`) work disarmed; keys and turns need the arm, and stop as soon as a person touches the
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
| `ident` | 0x01 | link version, requests received and dropped, the link's tick count, the port the request came on, replies sent, send failures, armed, person at the unit, person presses, posted, refused, the RAM boot's mailbox, status and image CRC, and the set identity: the CRC32 and length of the `.run` block (the base and every linked module), taken at boot before any handler runs |
| `disarm` | 0x02 | turns the arm off and lets go of every key the link holds |
| `key ID FLAGS` | 0x10 | a panel key message with the flags as given (bit 0 down); a held key reads as held to `is_key_held` |
| `enc N DELTA` | 0x11 | an encoder message of DELTA steps (-30 to 30), as the panel posts it |
| `release` | 0x12 | lets go of every key the link holds |
| `ramboot IMAGE.syx` | 0x14 | after stock's OS upgrade has taken the image: checks it, resets and boots it from RAM (below) |
| `mem ADDR N` | 0x21 | up to 128 bytes of DDR (0x4000_0000-0x47ff_ffff) or SRAM (0x8000_0000-0x8000_ffff) |

The set identity tells a host which build runs: `mc_link.py runid IMAGE.syx` computes the same two numbers from a built image and the patcher's `IMAGE.syx.json` (the `.run` block sits at the layout's `run_load` in the MAIN OS and is copied unchanged to DDR). The base cannot carry its own package hash; the build that made the image knows it. `mc_link.py rundiff IMAGE.syx` reads the running block and lists every word that differs from the image.

The screen needs no command: stock answers Elektron's own screenshot request over USB.

## RAM boot

`mc_link.py ramboot IMAGE.syx` boots an image without flashing it, so a module can be tried and dropped again with a
power cycle. The image is any Model:Cycles OS `.syx`, a stock one or one the kit linked.

1. The host uploads the image with stock's own OS upgrade (Elektron's `F0 00 20 3C 11`, commands 0x50 start and
   0x51 write, the protocol Transfer uses; the Rytm's helpers in `rytm_link.py`). Stock keeps it at `0x4028da80` and
   asks "Upgrade OS now?"; nobody answers it.
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
- **Work.** `ev_tick` (UI task) takes the ring, acts and replies with stock's SysEx send `0x400828fe(bytes, len, 0,
  port)`, which writes 144-byte parts. Its ports: 1 the MIDI setting's choice, 2 USB, 3 DIN, 4 both. Do not run
  Transfer at the same time: a reply could land between the parts of one of stock's.

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

## Not tested

- A RAM boot of an image without a development base, or of the stock `.syx`; a mailbox refused at boot (each
  status other than `booted from RAM`).
- Answering "Upgrade OS now?" after an upload meant for the RAM boot (it would flash the image as stock does).

- A request over DIN (dropped by design).
- A person pressing a key while the link holds one (the 3 s refusal), `disarm`, `release`.
- Keys under FUNC and the flags stock's panel sets on a release.
- A request while Transfer or another SysEx stream runs.
- A host that stops reading in the middle of a reply.
