# Digitone II: the diagnostics log, in the Octatrack's layout, read from a unit, 19 November 2026

The Digitone II development link's diagnostics (`sdk/machines/digitone-ii/elekloader/base/diag.c`, the Octatrack's `diag.c` and its layout, `diag.h`, byte for byte), on the contributor's Digitone II (@prodbysmolec), installed over USB with the OS upgrade protocol (the developer pressed YES).

- **Rates, measured first** with a build that counted them (`diag` over 30.27 s of wall time): the frame interrupt (`ev_frame_params`) ran 1,501.6 times a second (48 kHz / 32), the UI tick 30.03 times, one in 50 frames. The log's clock is the frame count at 1,500 a second.
- **Build:** `npm run machine:base -- digitone-ii --dev`, development package `bf387913e19d7b321d13fb03d361377a707d4e4b05c42239cd4cfc00e3d8466b` (.run 8,113, .bss 10,560 bytes; 16 sites; no jump to an odd address), linked with `hello-marker-dn2` 1.0 by Elekloader 0.11.0's patcher: `.syx` `68b73acd89bd30f062d26ce378f62ea1324bcc432beb62e29318aeca3a68800c`.
- **Read by the site's parser:** `dn2_link.py diag --save` read the 6,148-byte log through `mem`, and `parseDeviceLog` (`src/engine/elekloader/device-log.ts`, unchanged) read it: version 2, boot 1, a START incident at second 0.
- **FREEZE:** `dn2_link.py freeze 6` (armed) held the UI tick for 6 s: the display, keys and LEDs stood still (the developer: "das komplette Gerät ist gefreezt"), then the unit went on. The log then held a FREEZE incident at second 14 with `a` 9,050 frames (6.03 s). A second run logged another, at second 156, 9,050 frames, its keys the last one pressed before it (FLTR, 0x03).
- **Earlier build:** with a placeholder rate, the log also wrote a load window (five minutes counted at 1,000 frames a second) that the parser read.
- **Not tested:** whether the audio went on during the freeze (not reported), a real freeze (one that ends in a restart is lost: the log lives in .bss), load windows at the measured rate, long sessions.
