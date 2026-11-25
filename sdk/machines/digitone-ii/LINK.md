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
| `disarm` | 0x02 | turns the arm off and lets go of every key the link holds; a release the UI queue cannot take yet follows from the UI tick |
| `key ID FLAGS` | 0x10 | armed: a panel key message, flags 0x01 press, 0x10 release; a held key reads as held to stock's is_key_held |
| `enc N DELTA` | 0x11 | armed: an encoder turn, 1-8 A-H, 9 LEVEL |
| `release` | 0x12 | armed: lets go of every key the link holds |
| `mem ADDR N` | 0x21 | the address, then up to 128 bytes of DDR (0x4000_0000-0x47ff_ffff) or SRAM (0x8000_0000-0x8000_ffff) |

`screen` is the host's: it reads stock's frame pointer and the frame through `mem` (no command of its own on the unit),
so a draw between its reads can tear a frame. Stock keeps two frame pointers side by side at 0x402a10c8 and sends the
first to the display, then swaps them (0x40131fd2), so the frame on the screen is the second; 128x64 pixels, 1 bit each,
in the Analog Rytm MKII's layout.

Status 0 ok, 1 not armed, 2 bad request, 3 busy, 4 out of range, 5 a person at the unit, 6 an OS upload waits at UPGRADE OS NOW? (key and enc refused, and stock's is_key_held stops seeing the link's holds, until the next boot: a flash needs a person's YES). A press or turn the link posted before the upload completed, still in stock's queue when the prompt opens, is taken at `ev_key`/`ev_enc` before stock sees it and counted as refused; the link's releases and a person's YES and NO still reach stock. USB only: a link message from DIN is never acted on.

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
- **Not yet.** The Rytm link's remote YES and RAM boot.
