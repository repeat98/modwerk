# Euclidean Scale testing

## Merged Modwerk base

On Digitakt II OS 1.17, Claptom-music reported that QK17 preserved SCF, LO, HI and the saved RNN melody after Save Project and a cold boot. Standalone KIT Save and Load restored the saved bounds and melody after changes. QK17 used Modwerk base `e88273ed`. The local image SHA-256 was `4a87420a08ff3be4f526dd80012807661b53908fa2a2e50c4d4e2dd3437f0441`.

Two isolated builds produced identical source-only recipes. Linking the catalog package (SHA-256 `8e220e314369873074e7e2c9d08f10a68a6b6cc9611557c69cd84b3b0dc921e5`) with the same base and QK17 OS label reproduced the hardware test image byte for byte.

## Local emulator build

Digitakt II OS 1.17, digikit `d6de4d0`. The module used the pinned Modwerk base `0a91dfe0c53f4b056f54a815d66aa8a7234698afa27e993868045fac6246ad7b` and compiled on Windows with m68k-elf GCC 13.1.0 and binutils 2.40. The linked emulator image SHA-256 is `51623261d813aa9af2f1a1c49172a5420d12219cba4fe2e8817035c937672a1e`. The linker found no patch-site overlap. The module has 1,602 bytes in `.run` and 8,208 bytes in `.bss`.

- The stock Euclidean page opened on the first **FUNC + AMP**. The second opened **Euclidean Scale 2/2**. A third press or **NO** returned to the stock page. The panel actions changed only the selected track's state in a two-track check. Encoder A on the neighbouring SRC page left both tracks' module state alone.
- A ten-pulse audio pattern used an F-sharp Mixolydian fixture. Encoder **A** changed recurring stock F5 notes to E5. Encoder **B** produced two different ten-note melodies. Each melody repeated for successive loops, and all its pitches were in scale. Turning **A** off restored the stock pitches. These changes were made during uninterrupted playback.
- All 122 note-ons and 74 note-offs landed in the same DSP frames as the base-only control. The maximum send-time difference within a frame was nine emulated instructions.
- The coupled ColdFire and SHARC boot reached ready with no halt or missing DSP blocks. A host test checked 55,296 combinations of the stock scales, roots and input pitches, including ties, boundaries and three successive rerolls.

The manifest and subscriptions validated against the local 1.1 base contract. This early build was tested in the emulator.

## Stock-style control layout

The local image `af182d6d6b890f3e4170ce3998bcc564ce971127dce5ecf740f2b55453b2f8c1` uses the stock page indicator and disabled-control glyph. Digikit showed the **SCF** switch, **RNN** and six crossed-out slots. The right-edge pixels matched stock SRC pages 1 and 2 exactly. The panel regression repeated both distinct in-scale melodies and matched all 196 note events to the same DSP frames as the base-only run. The image passed framing, HMAC and all 17,109 packet checksum checks.

## Pinned-toolchain image

Two isolated GCC 16.2.0 and binutils 2.47 builds produced the same module SHA-256, `e51f953221140fbc284138a9975029bca16d3a0cc842691af72e99803ad63ff2`. The linked OS 1.17 image SHA-256 is `687a3f8d29153f39f7484b70660382043cf04b547700d1a7a649c32bff387d0b`.

- Digikit reached ColdFire and SHARC ready after 7,750 DSP frames, with zero missing blocks and no halt.
- The **SCF** and **RNN** panel regression preserved the DSP frames of all 196 note events against the base-only image. The largest difference within a frame was nine emulated instructions.
- At 2× track speed, changing tempo from 120 to 125 BPM and swing from 50% to 55% during playback preserved the DSP frames and send times of all 108 note events against the base-only image.
- **Hardware trial blocker.** After **Load Project** reloaded a saved slot and after **Create New** opened a fresh project, the module retained the old RNN state for A01 track 1. The stock Euclidean setting cleared as expected. Both project paths must invalidate the module's prior state before this image can be replaced with a hardware trial candidate.

## Project reset integration

The local Windows GCC 13.1.0 build with the revised base produced image SHA-256 `61afd03e6248c405392768e72262dacbfd72fc38d7cf5dc478b44ab326d5784c`. In digikit `d6de4d0`, reloading a saved project and creating a new project both showed SCF off and restarted the RNN sequence. Saving the project and cancelling a load preserved the current settings.

The SCF and RNN playback regression matched all 38,273 captured DSP payloads from the preceding pinned module build, with a maximum send-time difference of 85 emulated instructions. ColdFire and SHARC reached ready after 7,750 DSP frames with no missing blocks or halt. The image passed preamble checksum, framing, HMAC and all 17,104 packet checksum checks.

## Pinned project reset integration

Two isolated GCC 16.2.0 and binutils 2.47 builds produced the same module SHA-256, `b01c28fb84337ee2c8fe9cdb1509f694536ea1b43295150436366e99c7909f79`, and the same base SHA-256, `c06053d6d6b61fd9b99c08205cf7225bee40e32ab1846f2872a3d7bf06f42703`. The combined OS 1.17 image is `a1d7f3d367cc9fffcbc4d9eeb2673bc5cc88121fd9f962ad6a0d2eea1ad982e8`.

- In digikit `d6de4d0`, saved-project reload and **Create New** both showed SCF off and started a fresh RNN sequence. Saving and cancelling a pending load preserved the current settings.
- The SCF and RNN regression reproduced all 38,273 DSP payloads of the previous pinned module image. All 196 note events matched the earlier base-only control by DSP frame, with a maximum send-time difference of nine emulated instructions.
- With the revised pinned base-only image as the control, all 111 note events matched by DSP frame and send time at 2× track speed, through live changes from 120 to 125 BPM and 50% to 55% swing. RNN produced notes in the selected F-sharp Mixolydian scale.
- ColdFire and SHARC reached ready after 7,750 DSP frames with no missing blocks or halt. The combined image passed the preamble checksum, HMAC, framing and all 17,112 packet checksums. The non-MAIN sections matched stock byte for byte.

## First hardware smoke test

On 2026-11-08, Claptom-music reported that the Digitakt II played and stopped a Euclidean pattern on stock OS 1.17, then rebooted into `P117` after the USB update with the exact combined image above. After the initial SCF and RNN playback check, the tester reported that it seemed to work.

The tester enabled RNN in a scratch project, saved it and reloaded the same slot. They confirmed that SCF was off after reload and that playback returned to the pattern's original pitches.

The tester reported hearing no skipped or extra hits during the requested live playback check. They confirmed that each RNN press produced a different melody that repeated unchanged on the next loop. The stable pitches in their stereo recording before the reported key change at about 25.9 seconds were C, D, E, F, G, A and B. The first sustained G-sharp occurred at that change.

The tester also reported that powering off from the SCF/RNN page restored the stock Euclidean page on the next boot without its two page indicators. **FUNC + AMP** had no effect until they changed pages and reopened Euclidean.

## Startup page access fix

With an initialized +Drive fixture in digikit `d6de4d0`, the P117 image reached the stock Euclidean page with an unset track-editor cache and ignored the next **FUNC + AMP**. A Windows GCC 13.1.0 build using the pinned base and the stock Euclidean view's track accessor restored the page indicators and opened the second page in that fixture. RNN updated the intended track on both tracks 1 and 2, and encoder A on SRC left both states intact.

The diagnostic image SHA-256 is `23a0b410b1fd89e1ee7d1ec6978aa13a9090baffa3170c99d78a6b64a5ee01ed`. Its playback run matched all 38,273 DSP payloads from P117 and the send times of all 196 note events.

Two GCC 16.2.0 and binutils 2.47 builds reproduced package SHA-256 `233bb2fa74afab66afe594a702848ba5e057f8241b6cd51293be7ed2d2df8725`. The linked S117 image SHA-256 is `2204192308c0e1305708f95947412263907abf95fa212057f88e5026d4787bff`. This exact image passed the initialized-card page and track checks, the project reload/create/save/cancel checks, and the 38,273-payload regression with all 196 note-event send times unchanged. It reached ColdFire and SHARC ready after 7,750 DSP frames with zero missing blocks and no halt. Preamble checksum, HMAC, framing and all 17,112 packet checksums passed.

On 2026-11-08, Claptom-music confirmed that the Digitakt II booted into S117 after the USB update with this exact image. After powering off from SCF/RNN and turning the unit back on, they reported that the stock Euclidean page showed both page indicators and one **FUNC + AMP** press opened SCF/RNN. Exact hardware timing, Create New, save and cancel in isolation, and stock recovery have not been verified on hardware.

Claptom-music also reported that the short S117 playback check passed. The requested check used C Ionian and two RNN presses, then saved and reloaded the scratch project. This used S117's trial behavior, which reset SCF and RNN on reload.

## Project persistence and controls

Windows GCC 13.1.0 diagnostic image `7c64c766907c19f218dec79581473a7ed04601b552347058c891448a7e42ba49` uses the new kit-data reset in the base. In digikit `d6de4d0`, pressing A did not change SCF. Turning A clockwise enabled it, turning A counterclockwise cleared it, and pressing B advanced the reroll. Turning A clockwise again with SCF already enabled preserved that reroll.

A saved scratch project restored SCF and the RNN generation after the tester fixture had turned SCF off. The 46 captured note-on pitches matched before and after reload. A fresh emulator process loaded the saved project from an initialized card with the same SCF and reroll state. A new project started with empty module state in the persistence diagnostic.

From Sequencer Page Setup, two **FUNC + AMP** presses followed the same page transitions as the base-only image. SCF/RNN opened on the next press from the stock Euclidean page. The old pinned base refused to link the new module because it lacks the kit-data reset guarantee.

## Pinned K117 persistence build

The tested runtime source is revision `a3d3d02c966fbe98365156c1a5d4147ecdaf412e`. Its source SHA-256 is `2f94816fbaf73a9f6ad39be17e4f10efb4e64b8115053c1fc58b76a0d78d5a82`, computed over a compact JSON map from `build.json`, `src/main.c`, `src/pitch.c`, `src/pitch.h` in that order to the SHA-256 of each Git blob's contents.

Two pinned builds produced base SHA-256 `c4992eba731456afa6254e28a3f51e681e98ce97bae2a6d919e0053cf4f49583` and module SHA-256 `42456b7bc35cc2b5c7e5c3a894d646a6379278237f0cbc04d51c5c29b12d6f5a`. The combined image SHA-256 is `185fc6dbb84bb99f5477d22cead24ff7fc3e7f2e60c703168b83a207bf24bcf3`.

- The exact image repeated the encoder and Page Setup checks. Saving and reloading preserved all 46 note-on pitches. A cold start and load of the saved fixture restored SCF and the reroll. Create New cleared the saved and live module state.
- At 2× track speed, with live changes from 120 to 125 BPM and 50% to 55% swing, all 111 note events matched the base-only image by DSP frame. The largest send-time difference was 14 emulated instructions.
- Digikit reached ColdFire and SHARC ready after 7,745 DSP frames with zero missing blocks and no halt. The image passed preamble checksum, HMAC, framing and all 17,115 packet checksums.
- The module uses 19,812 bytes of additional linked ColdFire DDR compared with the same base alone. The package contributes 2,871 bytes of `.run`, 16,916 bytes of `.bss`, 24 bytes of shared table entries and one alignment byte. It contributes no fast SRAM or DSP code. This allocation count excludes stock stack and transient storage.
- Isolated ColdFire callback calls in digikit with interrupts masked exercised 55,296 scale/root/pitch combinations each for SCF and first-generation RNN. Every output was in scale. Observed maxima were 128 emulated instructions for SCF and 316 for RNN. These counts exclude the stock bridge, scheduling, contention and UI work. They do not establish a real-time budget or all-track hardware load.

On 2026-11-08, Claptom-music reported that the Digitakt II booted into K117 after the USB update with this exact image. They reported that all three on-unit checks passed. Turning A switched SCF on and off, and pressing B rerolled. The saved scratch project restored SCF and the same melody. Two **FUNC + AMP** presses from Sequencer Page Setup followed stock navigation, and the next press from the stock Euclidean page opened SCF/RNN.

This was a functional hardware check. Exact hardware timing, maximum track load, Create New and stock recovery were outside the reported K117 test.

## Octave bounds, 0.2.0-experimental

Two Windows GCC 13.1.0 diagnostic builds reproduced module SHA-256 `4eefa08a00f885719e5e0dc801c95b9ee3d059c831a8ef778b6754440b9955e4`. The combined emulator image is `e7050905045a2b5fe399db36c64cc01f131bb57778650116b3725cc131a37f5f`. It adds 21,048 bytes of ColdFire DDR relative to the matching base and uses zero fast SRAM. The linker found no patch-site overlaps and verified that the main OS depacks to the patched image in place.

- In digikit, C set LO to `−1`, D set HI to `+2`, and both numbers appeared in square frames. B started the reroll. After saving the project, turning SCF off and clearing the bounds returned its module state to zero. Loading the saved slot restored SCF, both bounds and the RNN generation in live and saved state.
- Isolated ColdFire calls with interrupts masked covered all 231 ordered octave-bound pairs, all 12 roots, four stock pitches including both MIDI extremes, Ionian and chromatic masks, and two rerolls. In 44,392 calls including repeat checks, every result was in the expected scale and range. Two rerolls differed wherever the range offered more than one pitch, and repeated inputs produced the same pitch. The observed maximum was 264 emulated instructions, excluding the stock bridge and hardware scheduling.

The octave build uses the new EUS2 kit-data layout. Saved settings from the K117 trial reset to defaults on upgrade.

### Pinned O117 build

Two isolated GCC 16.2.0 and binutils 2.47 builds reproduced the base SHA-256 `c4992eba731456afa6254e28a3f51e681e98ce97bae2a6d919e0053cf4f49583` and module SHA-256 `e9de19728d177edd1d0116911df830a051cca33f7408c6fcedb65eca554f2843`. The O117 image SHA-256 is `cd26330c181016d9ef8caf5c3162d457b0c2f974de692aae6109f06bbf3bb7ae`.

- The image booted in digikit with ColdFire and SHARC coupled and ran through 9,528 DSP frames with zero missing blocks or halts.
- The project panel run restored SCF, LO `−1`, HI `+2` and the same RNN generation after clearing the live state. The boxed-range and stock-entry captures matched the diagnostic captures pixel for pixel.
- The same 44,392 direct ColdFire calls passed. The maximum on the pinned build was 268 emulated instructions. This excludes the stock bridge and hardware scheduling.
- The module adds 21,400 bytes of linked ColdFire DDR and zero fast SRAM compared with the pinned base alone. O117 passed the content checksum, HMAC, framing and all 17,125 packet checksums. All non-MAIN OS sections matched stock byte for byte.

On 2026-11-08, Claptom-music reported that the O117 hardware trial passed on their Digitakt II. The requested trial covered booting O117, checking that LO and HI at zero restricted RNN to the root, then saving and reloading the bounds and melody with LO at `−1` and HI at `+2`. Physical timing and maximum-track load were outside this trial.
