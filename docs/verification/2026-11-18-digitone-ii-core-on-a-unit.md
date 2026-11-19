# Digitone II: core-dn2 0.3 boots and its six UI events run on a unit, 18 November 2026

A second Digitone II after toonst's unit (23 October 2026, [elekloader's build guide](https://github.com/toonst/elekloader/blob/3d7c2e3/docs/BUILDING.md#flash-it)): two builds of toonst's elekloader on OS 1.12, flashed with Elektron Transfer, then stock restored. Contributor's Digitone II (@prodbysmolec), results as observed on the unit and reported. Nothing here changes code, and Modwerk has not copied the core.

- **Stock file:** `Digitone_II_OS1.12.syx` from Elektron's `Digitone_II_OS1.12_dist`, `7e5b8a73…2ceb35`, the hash in [DIGITONE_II_OS_RESEARCH.md](../DIGITONE_II_OS_RESEARCH.md). Elektron Transfer 1.10.3 on macOS.
- **Tools:** [toonst/elekloader](https://github.com/toonst/elekloader/tree/3d7c2e3) at `3d7c2e3` (GPL-2.0), `python -m elekloader.sdk.build`, `lint` and `patch`, m68k-elf-gcc 16.2.0 on macOS. Its Digitone II tests (`tests/test_digitone2.py`) against this stock file: 27 passed, 5 skipped for files not given; `test_writer_no_change_is_stock` rebuilds the file byte for byte.
- **Unit before:** De-Pattern's dn2mk2 mod on OS 1.11, its +Drive data left in place.
- **Marker build:** core-dn2 0.3 + `examples/hello-marker-dn2` 1.0, container version HM01: `e38de1be806638ed7d419e1db7630359658b0a06e52a615920404cd1b7b3ee30`. The patcher verified sections 2, 4, 5, 7 and 8 byte for byte and the in-place depack (minimum gap 2,156,549 bytes). Flashed over USB: the unit restarted and booted, the inverted square showed at the top right of every screen, several kits loaded and played, sound and controls were normal. Stock 1.12 flashed back over USB.
- **Hooks build:** core-dn2 0.3 + `examples/hooks-check-dn2` 0.1, container version HC01: `5c64a9e7ac3558ed5d35e42d67bcc7dd10033295b38f1cd4a1fd9c6d4164a0fd`, lint ok, patcher verified as above. On the unit:
  - `ev_tick`: the top-right square blinked.
  - `ev_key` (order 60): the top bar grew with key presses.
  - `ev_enc`: the second bar moved with encoder turns.
  - `ev_settings`: HOOK TEST was listed after SYSTEM and selecting it grew the third bar; after leaving and reopening SETTINGS it was listed once, not twice.
  - `ev_personalize`: HOOK TEST was listed in PERSONALIZE and selecting it grew the fourth bar.
  - `ev_key` (order 40): after arming, [TEMPO] grew the fifth bar.
  - Order: the second square never appeared.
  - The bars wrapped at their count modulo 128, as the example draws them.
  - Stock 1.12 flashed back over USB and the unit ran normally.
- **Not tested:** where the unit shows the container's version field, the startup-menu recovery over MIDI DIN (toonst's unit recovered that way on 23 October), core-dn2's SysEx observers, input bridge and SHARC bridge, project save and power-cycle persistence, long sessions, listening beyond normal playback.
