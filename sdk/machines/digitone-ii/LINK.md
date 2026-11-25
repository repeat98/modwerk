# Digitone II development link

Stage one of piece 4 of the [goal](GOAL.md): read-only diagnostics over USB MIDI SysEx, in the
[Analog Rytm MKII link's](../analog-rytm-mkii/LINK.md) wire format, so one host can speak to both. It is in
development bases only (`npm run machine:base -- digitone-ii --dev`, base.json's `dev`), never in a release.

```sh
python3 sdk/machines/digitone-ii/tools/dn2_link.py ident
python3 sdk/machines/digitone-ii/tools/dn2_link.py screen --png screen.png
```

| Request | cmd | What comes back |
| --- | --- | --- |
| `ident` | 0x01 | the link's own counters: link version, link messages received, dropped (ring full or too long), ticks |
| `screen OFF` | 0x20 | OFF, the copy's number, then 128 bytes of the frame on the screen from OFF (0, 128 … 896) |

**The unit chooses what each request returns.** No request names an address, so a USB client reads the link's counters
and the screen and nothing else of the instrument's state. Every other command, the earlier `mem` (0x21) included, is
refused with status 2 and nothing but the status.

`screen 0` copies the frame on the screen and sends its first part; `screen 128` to `screen 896` send the rest of that
copy, each with the copy's number, so the eight parts are one frame even if stock draws in between, and the host checks
the number. A part before any `screen 0`, an offset past the frame or between parts, or a frame pointer that does not
lie wholly in DDR is refused with status 4. Stock keeps two frame pointers side by side at 0x402a10c8 and sends the
first to the display, then swaps them (0x40131fd2), so the frame on the screen is the second; 128x64 pixels, 1 bit each,
in the Analog Rytm MKII's layout.

Status 0 ok, 2 bad request, 4 out of range. USB only: a link message from DIN is never acted on.

`sdk/tests/dn2_link_host.c` compiles `link.c` for the host and checks both requests and every refusal
(`test_dn2_link.py` runs it). `ident`, the first version's `mem` and its out-of-range refusal answered on a unit over USB
([19 November 2026](../../../docs/verification/2026-11-19-digitone-ii-link-on-a-unit.md)); this version's `screen` has
not run on a unit yet.

## Where it runs (OS 1.12)

- **Receive.** `link.s` observes stock's SysEx router at 0x4012197a (MIDI task), the site core-dn2 0.3's `ev_sysex`
  uses: the message in a1, its length in d1, the source in d2 (2 or 4 USB). The link copies its own messages
  (`F0 7D 'MWL'`) into a ring; every register comes back as it was and stock routes every message as before.
- **Work.** `ev_tick` (UI task) answers up to four a tick through stock's `sysex_send` (0x401236d2) on USB.
- **Waits for stock.** A tick answers nothing while stock is mid-SysEx on USB: the status byte of stock's USB MIDI
  receive parser (0x4011f3c0, the function the USB driver is given) at 0x445090ac reads 0xF0 then. The Rytm's is a word.
- **Not yet.** The Rytm link's keys, encoders, remote YES and RAM boot.
