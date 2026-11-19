# Digitone II: the development link answers over USB, 19 November 2026

Stage one of the Digitone II development link (`sdk/machines/digitone-ii/LINK.md`, #1763) on OS 1.12, flashed with Elektron Transfer. Contributor's Digitone II (@prodbysmolec), on the same unit as the [base record](2026-11-19-digitone-ii-base-on-a-unit.md).

- **Stock file:** `Digitone_II_OS1.12.syx`, `7e5b8a73…2ceb35`. Elektron Transfer 1.10.3 on macOS, closed before the host ran.
- **Build:** `npm run machine:base -- digitone-ii --dev`, development package `7b14964a…` (.run 4,712, .bss 3,572 bytes; 15 sites), linked with `hello-marker-dn2` 1.0 by Elekloader 0.11.0's patcher and verified (sections 2, 4, 5, 7 and 8 byte for byte, the in-place depack, under the unit's update limit): `.syx` `8e87168ee2dd6d8b150d6ca364cb8e3a8ef9634ce66dd42320651636386aeecd`.
- **Host:** `sdk/machines/digitone-ii/tools/dn2_link.py` with mido 1.3.3 and python-rtmidi 1.5.8 on macOS; the unit's USB port shows as "Elektron Digitone II".
- **Boot:** it flashed and booted; the marker square showed top right (`hello-marker-dn2`).
- **`ident`:** answered every request: `link 1, received 1, dropped 0, ticks 1496`, then `received 2 … ticks 1502`, and `received 6, dropped 0, ticks 1681` after the requests below. The link counts each request, drops none, and its tick count rises with stock's UI task.
- **`mem 0x47f00000 64`:** returned 64 bytes. They are the start of the development package's `.run` section as it was built, with the boot loader's relocation filled in (the first absolute address reads `0x47f012b4`, inside the package's own area). The bytes are not recorded here, because `.run` carries stock bytes the package copies.
- **Refusals:** `mem 0x0 16` (outside DDR and SRAM) and `mem 0x47f00000 200` (over 128 bytes) each came back with status 4, out of range.
- **Not tested:** a link request while other SysEx runs on USB (the Digitone II's `USB_SYSEX_STATE` is not found yet, LINK.md), a request over MIDI DIN (the link must ignore it), long sessions with the development base.
