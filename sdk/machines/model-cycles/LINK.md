# Model:Cycles development link

A development base's link over USB MIDI: a host on the computer reads the link's identity and the unit's memory, and
presses keys and turns encoders as a person at the panel would.
It is the first piece of the Model:Cycles' USB link the [machine recipe](../../../docs/MACHINE_RECIPE.md) asks for,
SysEx because USB MIDI is all the unit offers, and it follows the
[Analog Rytm MKII's link](../analog-rytm-mkii/LINK.md) by Nathaniel Pavel: the same wire format, the same place in
the OS. No flash and no RAM boot yet.

- Unit side: [`elekloader/base/link.c`](elekloader/base/link.c), [`link.s`](elekloader/base/link.s),
  base.json's `dev`.
- Host side: [`tools/mc_link.py`](tools/mc_link.py) (Python 3 and `mido` with `python-rtmidi`).

## Development bases only

Release bases never carry it. Build one with

```
npm run machine:base -- model-cycles --stock STOCK.syx --dev --out NEW-DIR
```

which writes `modwerk-base-model-cycles-dev-<sha>.elemod`, checked against no binding: a development base is never
recorded or released. It costs about 3.3 KB of `.run` and 1.2 KB of RAM in the shared mod area.

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
| `ident` | 0x01 | link version, requests received and dropped, the link's tick count, the port the request came on, replies sent, send failures, armed, person at the unit, person presses, posted, refused |
| `disarm` | 0x02 | turns the arm off and lets go of every key the link holds |
| `key ID FLAGS` | 0x10 | a panel key message with the flags as given (bit 0 down); a held key reads as held to `is_key_held` |
| `enc N DELTA` | 0x11 | an encoder message of DELTA steps (-30 to 30), as the panel posts it |
| `release` | 0x12 | lets go of every key the link holds |
| `mem ADDR N` | 0x21 | up to 128 bytes of DDR (0x4000_0000-0x47ff_ffff) or SRAM (0x8000_0000-0x8000_ffff) |

The screen needs no command: stock answers Elektron's own screenshot request over USB.

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

## Not tested

- A request over DIN (dropped by design).
- A person pressing a key while the link holds one (the 3 s refusal), `disarm`, `release`.
- Keys under FUNC and the flags stock's panel sets on a release.
- A request while Transfer or another SysEx stream runs.
- A host that stops reading in the middle of a reply.
