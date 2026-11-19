# Digitone II development link

Stage one of piece 4 of the [goal](GOAL.md): read-only diagnostics over USB MIDI SysEx, in the
[Analog Rytm MKII link's](../analog-rytm-mkii/LINK.md) wire format, so one host can speak to both. It is in
development bases only (`npm run machine:base -- digitone-ii --dev`, base.json's `dev`), never in a release.

```sh
python3 sdk/machines/digitone-ii/tools/dn2_link.py ident
python3 sdk/machines/digitone-ii/tools/dn2_link.py mem 0x47f00000 64
```

| Request | cmd | What comes back |
| --- | --- | --- |
| `ident` | 0x01 | link version, link messages received, dropped (ring full or too long), ticks |
| `mem ADDR N` | 0x21 | the address, then up to 128 bytes of DDR (0x4000_0000-0x47ff_ffff) or SRAM (0x8000_0000-0x8000_ffff) |

Status 0 ok, 2 bad request, 4 out of range. USB only: a link message from DIN is never acted on.

`ident`, `mem` and the out-of-range refusal answered on a unit over USB ([19 November 2026](../../../docs/verification/2026-11-19-digitone-ii-link-on-a-unit.md)).

## Where it runs (OS 1.12)

- **Receive.** `link.s` observes stock's SysEx router at 0x4012197a (MIDI task), the site core-dn2 0.3's `ev_sysex`
  uses: the message in a1, its length in d1, the source in d2 (2 or 4 USB). The link copies its own messages
  (`F0 7D 'MWL'`) into a ring; every register comes back as it was and stock routes every message as before.
- **Work.** `ev_tick` (UI task) answers up to four a tick through stock's `sysex_send` (0x401236d2) on USB.
- **Waits for stock.** A tick answers nothing while stock is mid-SysEx on USB: the status byte of stock's USB MIDI
  receive parser (0x4011f3c0, the function the USB driver is given) at 0x445090ac reads 0xF0 then. The Rytm's is a word.
- **Not yet.** The Rytm link's keys, encoders, screen, remote YES and RAM boot.
