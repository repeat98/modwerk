# Digitone II: Modwerk's base boots, runs its hooks and keeps a project across a power cycle, 19 November 2026

Modwerk's Digitone II base (`sdk/machines/digitone-ii/elekloader/`, #1760) on OS 1.12, flashed with Elektron Transfer, then stock restored. Contributor's Digitone II (@prodbysmolec), results as observed on the unit and reported.

- **Stock file:** `Digitone_II_OS1.12.syx`, `7e5b8a73…2ceb35`. Elektron Transfer 1.10.3 on macOS.
- **Base:** `npm run machine:base -- digitone-ii` (m68k-elf GCC 16.2.0, binutils 2.47, the kit-pinned Elekloader checkout `3b31ef3` with the device Modwerk's builder carries): package `7a60d82ebdf30d9e6013f6ab391d4666ea92b6d4a7c7d11f679ad8c958b4bf99` (.boot 50, .run 3,656, .bss 3,120 bytes; 14 sites).
- **First images refused:** linked and packed by the pinned kit, the images were 2,725,280 and 2,724,768 bytes of `.syx` (flash end 0x28cfa0, about 2.15 MB of container). Transfer sent each to 99 %, and the unit stopped the upgrade there and kept running its OS. Elekloader 0.11's Digitone II profile caps an update at 0x200000 decoded bytes (`update_max`, "measured on a unit"); the images that ran on 18 November were about 1.92 MB.
- **Images that ran:** the same base linked by Elekloader 0.11.0's patcher, whose packer packs the main OS smaller (1,164,092 stored bytes instead of 1,395,648), each verified (sections 2, 4, 5, 7 and 8 byte for byte, the in-place depack, flash end about 0x2546xx). Their main OS is the one Modwerk's own linker writes, byte for byte:
  - base + `hello-marker-dn2` 1.0 + `hooks-check-dn2` 0.1 (toonst's builds of #1743): `.syx` `87c4dbb3e3f99cb6c3ea9583458503d7ff7c0cbef1059da74cd3f90aa77a7aa2`, main OS `699e1698…`.
  - base alone: `.syx` `a83ee7740fb8c8815c38950049f4b105dda0bd72e701c72d69f4773491948ad8`, main OS `20d418e9…`.
- **On the unit, base + examples:** it flashed and booted. The marker square showed top right and blinked (`ev_draw`, `ev_tick`); key presses grew a bar and encoder turns moved one (`ev_key`, `ev_enc`); HOOK TEST was in SETTINGS and grew the third bar, and in PERSONALIZE and grew the fourth (`ev_settings`, `ev_personalize`); TEMPO grew the fifth. A project loaded and played normally; a small change was saved, the unit powered off and on, and the project loaded with the change; several kits loaded and sounded normal.
- **On the unit, base alone:** it flashed; no marker, no HOOK TEST, the unit behaved as stock.
- **Stock 1.12** flashed back over USB and the unit ran normally.
- **Not tested:** the frame, key-LED, project-data and kit-data hooks with a subscriber (no mod uses them yet), the startup-menu recovery over MIDI DIN, long sessions, listening beyond normal playback. Images packed by the pinned kit were refused as too large, so a site build needs a packer and a size check that keep the update under the unit's limit.

## The same build, packed by Modwerk's optimal packer (#1761)

- **Image:** the refused kit-packed base + `hello-marker-dn2` + `hooks-check-dn2` image, put through `fitUpdate`: its main OS packed again by `packOptimal`, which uses the offset-reuse code as Elektron's stock stream does; written and sealed by the kit's writer, the kit's verify passed. 2,002,808 bytes decoded (limit 2,097,152); `.syx` `ed19b2f9c80286b801ae59f09df6c1726e595a7c40119316f29c0af5168bca44`; main OS `699e1698…`, the same as the image above.
- **On the unit:** Transfer sent it whole and the unit booted it. The marker showed; key presses grew the first bar, and before arming TEMPO did too; HOOK TEST in SETTINGS and PERSONALIZE ran and grew their bars, and after PERSONALIZE TEMPO grew its bar; sound normal.
