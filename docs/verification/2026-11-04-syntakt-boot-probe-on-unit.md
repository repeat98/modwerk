# Syntakt boot probe and DIN recovery on a unit, 4 November 2026

First hardware run of Modwerk's Syntakt core: the boot probe from `sdk/syntakt/core` (#702) on OS 1.42, and the startup-menu recovery the profile listed as untested. Contributor's Syntakt (@adeleglise), results as observed on the unit and reported. Nothing here changes code; the static record is [VERIFICATION.md](../VERIFICATION.md#syntakt-boot-probe-on-os-140-and-142--16-october-2026).

- **Stock file:** `Syntakt_OS1.42.syx` from Elektron's `Syntakt_OS1.42_dist.zip`, `ded3c59f…37c1`, the profile's hash. Elektron Transfer 1.10.3 on macOS.
- **Build:** `node scripts/verify-syntakt-core-probe.mjs` on a clean checkout of `5f28c9a8` (Node 24.22.2, Linux): `syntakt-1.42-boot-probe.syx` `f8493da70c09706337b20be1911eb8c77ca584f00d314e8d9052ec84d49f059f`, linked image `041903b6…95f6`, stored main 1,363,181 B, container 1,949,760 B, in-place margin 16,679 B, one site (0x400004b2, 8 B), 48-byte tail, stock-write checker clean. Every value equals the 16 October record, so the build reproduces.
- **Recovery before any modified build:** FUNC held at power-on, TRIG 4 (OS UPGRADE), stock 1.42 sent from Transfer's legacy SysEx page over MIDI DIN through a generic USB-to-MIDI cable (USB vendor 0xfc02). The unit booted and showed OS 1.42.
- **Probe:** flashed over USB with Transfer. The unit booted to the live UI and showed version `MW01`; a stock project played normally; two power cycles, each back to the UI; every sample slot filled (the Twinshot sound pack from the OS package) with no hang or exception screen; ten minutes of playback with no dropout, glitch or freeze.
- **Back to stock:** stock 1.42 flashed over USB; the unit showed OS 1.42.
- **Pre-existing:** faint display streaks on this unit, present on stock before the probe, unchanged by it.
- **Not tested:** the SRAM-tail signature (no read path exists yet), OS 1.40, the probe under Outbox 8, a DIN recovery from a unit that fails to boot (the run above recovered a working unit through the same menu), listening beyond normal playback.
