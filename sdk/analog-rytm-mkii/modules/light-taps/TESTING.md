# Light Taps testing

Evidence tier: **none** until the developer's run on this module's own build is recorded below.

## Build

- 17 November 2026, 0.1.0-experimental: compiled with Debian's `m68k-linux-gnu-gcc` and linked with core-ar2 0.7 by `scripts/link-image.mjs` against stock OS 1.74 (the stock file's hash matches Modwerk's identity). Build LT01, sha256 `49bcc1114214513c80cbf0bef857fac6ea27387246a9117304d4fb1da347e314`; `light_taps_enabled` is 1 bit of project storage at bit 0 (layout 0x2ded6b87). `src/main.c` compiles with `-Wall -Wextra` and no warnings.
- `npm run module:doctor -- light-taps`: green but "browser builder" (no catalog pin until the pull request is open) and the board claim (the board was not reachable).
- 22 November 2026, after merging main: build LT02, linked on the plain Modwerk Rytm base (`modwerk-base-analog-rytm-mkii-1c14b6b0`), the variant a set with Light Taps alone gets; sha256 `bfeeed94bf23ac9fe3810d20dd563cc1be621436bccf4b3a8734f9dcefafc5a8`. The module's source is LT01's; the base under it differs. Memory: `ramSpare` 118836 for the base alone, 117912 with Light Taps (924 bytes); `fastSpare` 0 both.
- 22 November 2026, emulator (rytm-emu 2ac0f1f, dtboot), build LT02, cold boot on a fresh card: GLOBAL, then DOWN past SYSTEM, shows **LIGHT TAPS: OFF** as the menu's last row; YES turns it to **LIGHT TAPS: ON**. Emulator result, screen only (the screenshots in `media/`, plan in `media/capture.json`): not hardware evidence, and the emulator plays no pad strikes.
- 22 November 2026, after review on #1972 (a maintainer found that a strike's mark never expired and the panel's counter wraps at 4,096 ms, so a fresh light tap a multiple of 4.096 s after a firm hit could be dropped): the module now keeps its own millisecond count and expires a strike's mark after 3 ms. Host test `tests/test_tap_timing.py` (12 cases, no firmware) passes, including a strike just before the 4,096 ms wrap with a fresh light tap a full wrap later, three wraps later, and across the module count's own 32-bit wrap. With the old 12-bit, never-expiring mark put back in a copy of `main.c`, the two wrap cases fail, so the test catches the bug. Build LT03 on the plain base, sha256 `72cad00cef4ec7908327a6828305341f54f90d668336b0b6c4e06f83387a6bf3`; memory 1,016 bytes (`ramSpare` 117820). LT01 and LT02 had this bug.
- `npm run test:procedure`: stops at step 1 until the package is pinned, which needs the pull request (see Build above).

## From the Pad Thresh experiments

The behaviour comes from Pad Thresh, a diagnostic never submitted (branch `pad-probe-prototype` on @filefolder's fork), on @filefolder's Rytm MKII, OS 1.74. These were other builds, so they are background, not this module's evidence. All reported by @filefolder, 17 November 2026:

- PT03: a light tap posts no strike to the OS (the strike counter did not move), while the same tap toggles a mute.
- PT04, from a photo of the event log: a firm hit posts the pad's key press, then its strike in the same millisecond; a light tap posts a press and, 9-14 ms later, a release, and nothing else.
- PT05: light taps played when the module posted a strike for them; with VELOCITY TO VOL on, a sound with its filter envelope on stayed silent at a low velocity, and played with the filter envelope off.
- PT06, from a photo: light taps post no pad pressure either.
- PT06: with VELOCITY TO VOL on, hard hits sounded much quieter than on stock. PT07 added the rule that a press within 3 ms after its pad's strike gets no light tap; with it, at velocity 8, it "works pretty well".

## Hardware

Results below are recorded only as the developer reports them.

- 22 November 2026, build LT01 (core-ar2 0.7 under the module, not the plain base), @filefolder's Rytm MKII, OS 1.74: "I've tested it and it all seems to work" (reported), against the list below. The final build, from the pinned package, is still to be tested.
- 22 November 2026, build LT02 (sha256 `bfeeed94bf23ac9fe3810d20dd563cc1be621436bccf4b3a8734f9dcefafc5a8`, the plain base under this module's source), @filefolder's Rytm MKII, OS 1.74: "it tests OK" (reported), against the list below. LT02 had the 4,096 ms bug fixed in LT03, so LT03, and then the pinned package's build, get the list again.
- 23 November 2026, build LT03 (sha256 `72cad00cef4ec7908327a6828305341f54f90d668336b0b6c4e06f83387a6bf3`, the plain base under this module), @filefolder's Rytm MKII, OS 1.74 (reported): the list below passes, and after a firm hit, light taps on the same pad at uneven intervals for about 15 seconds all play, so the 4,096 ms case is gone.
- 23 November 2026, load (reported): with the same project and pattern playing, light taps and firm hits for about 30 s, a throwaway readout (never committed) at `ev_render_out` order 254 showed core-ar2's `core_audio_load`, the busiest block per second (L) and since boot (P). Build LD0A, the plain base and the readout (sha256 `e844c5d5572c2d98e639ef2196baa4986a593ce4b1fbe0b8ac13ba57032dc44d`): L 71-73 %, P 76 %. Build LD0B, the same plus Light Taps with LIGHT TAPS ON (sha256 `6c3cfa2e3a10217d95ee4bb039f55b53844891e70d9383e543b8b53a26e06187`): L 71-73 %, P 75 %. No measurable difference: Light Taps runs in the panel task, not the audio interrupt.
- 23 November 2026, beside Silent Pad+Trig Settings (a maintainer's request on #1972), build LS03: the plain base, Light Taps and Silent Pad+Trig Settings 0.8.0-experimental (sha256 `65e2857d2c164a509447fdec6775c2a825b0e0fb0e7005eef0f03b0d7a109468`), LIGHT TAPS ON, SILENT PAD+TRIG and SILENT P+T LIVEREC checked (reported): stopped, a light tap selects its track silently, as a hard hit does; FUNC + a light or hard tap plays; in LIVE REC a plain light tap stays silent and records nothing, and FUNC + light tap plays and records a soft trig; with MUTE ALL SOUND checked, a muted track's pad stays silent, FUNC + pad included (an unmuted track plays with FUNC, as Silent Pad+Trig intends). The two modules patch different sites and link together; Light Taps' strike meets Silent Pad+Trig's gates as a real strike does.

To do on the unit, with the build named:

- The row: GLOBAL, past SYSTEM, LIGHT TAPS: OFF; YES turns it ON and back.
- OFF: light taps play nothing, as on stock.
- ON: light taps play softly; hard hits play once, as loud as on stock, with VELOCITY TO VOL on and off.
- Mutes and pad selection with light taps, ON and OFF.
- The setting after saving the project and a power cycle.
