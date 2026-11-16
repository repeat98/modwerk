# RINGMOD SC 0.2.1-experimental: hardware report

## This source: the USB package on an MKII (10 November 2026)

Measured from the unit's per-track USB audio by the owner's coordinating session, which drove the unit over USB.
A functional report: no chip timing or memory canaries.

- **Unit:** Octatrack MKII, OS 1.40C, RAM-booted development twin `5015d2a7…` (never flashed; MAIN.raw SHA-256
  `b0d749170f74b234f19d10538fcef8ed2e80932c6590e211ea1097d2f6ea4578`) of beta base `dd3827f0…`, the base of #1098
  with `main` merged (`4925f19d`), built with the beta flags plus `--dev`. The key bus is at Y $7E00-$7FFF.
- **Packages:** `public/octatrack-modules/ring-sc/0.2.1-experimental.mwrm`, SHA-256
  `91281f075b8515cf5587c308afa0bf6dad41eb25429e965682c5f3443babc803`; BBD Delay 0.1.2 `58b77069…`; Sidechain
  Compressor 0.2.1 bound to the twin (`fbdaad28…`; the published one, `fd275bf2…`, is bound to `dd3827f0`).
- **Material:** a project on the card with a four-on-the-floor kick on T1 (138 BPM) and sounding tracks T2 (first
  core), T5 and T6 (second core). The 20 USB channels were recorded for 8-10 s per take. Each track's 5 ms RMS was
  folded on the kick's onsets (17-22 a take) and the median taken; the figures are dB at 0-240 ms after the onset.

### Keyed, measured

| Setup | Without the key | With the key |
| --- | --- | --- |
| DUCK, T5 FX1, KEY T1 (other core) | KEY OFF: T5 -13 to -12 dB from the onset to 80 ms | -68 dB at 5 ms, -96 to -97 dB from 10 to 160 ms, back by 240 ms |
| DUCK, T2 FX2, KEY T1 (same core, first core) | FX1 FILTER, FX2 DELAY: T2 -47 dB around the onset | -100 dB at 5 ms, -111 to -119 dB to 160 ms, back by 240 ms |
| DUCK, T6 FX1, KEY T5 (same core, second core) | T6 -24 to -36 dB around the onset | -99 dB at 5 ms, -104 to -109 dB to 160 ms |
| RING, T5 FX1, KEY T1 (S&H 34, RECT 45, SLEW 0) | as DUCK's KEY OFF | -84 dB before the kick, -18 to -13 dB on it: T5 follows the kick |
| The same paths with BBD Delay 0.1.2 on T1 FX2 and T5 FX2 (the first FX2 slot of each core, whose buffer tail the key bus now uses) and Sidechain Compressor on T6 FX2 keyed from T1 | | T2 (same core) -118 to -120 dB through the kick; T5's RING follows the kick, with BBD's repeats between kicks |
| Sidechain Compressor 0.2.1 on T6 FX2 (THRS 61, RAT 60), Ring-SC on T6 at KEY OFF | KEY OFF (self-keyed): T6 -31 to -45 dB through the kick | KEY T1: 6-12 dB lower through the kick, the same away from it |

- MODE's names follow it: RING shows SLEW, S&H and RECT on the FX page.
- KEY steps OFF, T1, T2, ... T8 on the LCD; small turns move it by a fraction of a step (the encoders are continuous).
- **Left out:** RINGMOD SC on T2 FX1 did not duck from either key. That slot's trigs in the test project carry FX1
  parameter locks (the five knobs after KEY locked to 0, DPTH among them, read from the pattern in RAM), and DPTH 0 is
  untouched by design. The same module in T2's FX2 and in T5's and T6's FX1 worked. Not a module or base finding.

### The lifecycle, over USB

| Step | Result |
| --- | --- |
| Install (Keep) | accepted, generation 1, no rejections; then Sidechain Compressor and BBD Delay beside it, generation 3 |
| Picks | RINGMOD SC on T5 FX1, T2 FX1, T6 FX1 and T2 FX2; BBD on T1 and T5 FX2; COMPRESSOR on T6 FX2: each running 116-120 ms after YES; CPU 48 % with all of them placed, stopped |
| The base's self-test with all three placed | passed: 3/3 intact, two with DSP effects; peaks CPU 66.1 %, T1-4 54.1 %, T5-8 50.2 %; longest frame 391 µs; card set 3/3 |
| Removal while in use | refused, loader refusal 7; inventory unchanged |
| Removal once free | accepted |
| A 25 s trial (`try --seconds 25`, not accepted) | installed, placed on T5 FX1 and running, then rolled back by itself (Undo); T5 FX1 then showed NONE, the missing-module fallback |
| `npm run device:qualify` (TESTING.md) | passed: alone on T1 and T5 FX2 (admitted in 117 ms; core peaks 418 and 525 per mille), four instances beside four BBD instances while playing (CPU 851, core peaks 660 and 745 per mille), 12 of 12 Part switches, 120 s soak (highest core peak 749 per mille), removal |
| Crash and stall records | no new crash or stall during the module steps. One stall record from this boot predates every install: its loader counts are the twin's at boot, with no modules, in the window where the test project was loaded |

### Not run in this session

- Parameter locks and LFOs on the module's own knobs, scenes and the crossfader, eight instances a core, MKI.
- The key latency to the sample: the duck lands within one 5 ms window of the kick's onset on both paths.
- A power cycle: not testable on a RAM-booted twin. The Keeps replaced the unit's kept set; the flashed base starts
  without modules until they are installed again.

## 0.2.0: the USB package on an MKII (22 October 2026)

A functional report: the tester's hands and ears, and the coordinating session's readings over USB. Reported evidence,
not a measured qualification.

- **Unit:** Octatrack MKII, OS 1.40C, RAM-booted development twin `53ddaf60…` (never flashed; MAIN.raw SHA-256
  `712666cb0f464ed324c77aca2d7210643fdc41c18e640797030f9a90878013bd`). It is main's base at `4d4f731d` with two
  base fixes then in review: the module select's first-show step (`fix/module-select-step-first-show` `f20c3b4e`) and
  the key bus reader admission fix (`fix/keybus-reader-unknown-core` `79a52724`), built with main's flags plus `--dev`.
- **Package under test:** `public/octatrack-modules/ring-sc/0.2.0-experimental.mwrm`, 2,416 bytes, SHA-256
  `2ba32a49c49fbda951ae3658d663e6e8663d7ff6680e27e5b089b163d7e0a187`, from DSP source `29fb0952`; evidence revision
  `60d3ac17` (later commits change only the render gate's tolerances and records, not the package).
- **Tester:** npp1993 (the module's author) at the unit; installs, removals, self-tests and memory reads driven over
  USB by a coordinating session. One session, one unit.
- **Setup:** KEY T1 with a kick on T1, the effect on another track; other modules on the twin as the session needed
  (Sidechain Compressor for the shared-bus steps).

### By ear and hand (the tester)

| Check | Result |
| --- | --- |
| KEY on the first visit after install (the base's step fix) | steps cleanly, several encoder ticks a track (the encoders are continuous: no detents) |
| DPTH right after turning KEY | moves at its fine resolution, no jump |
| Stock FILTER knobs | unchanged |
| DUCK (the 21 October behaviour) | pass |
| Plain RING (S&H, RECT and SLEW at 0) | pass |
| RECT swept | pass |
| SLEW through 0, turned quickly and slowly | pass (no click); a lock or an LFO on SLEW crossing 0 was not tried on the unit |
| S&H 127 → 0 | the long hold stops at once: pass |
| The three names follow MODE (ATK, HOLD, REL / SLEW, S&H, RECT) on a MODE change, a page change and leaving and re-entering the FX page | pass |
| Two instances: T4 FX1 (KEY T1, DUCK) and T5 FX2 (KEY T1, RING, DPTH 64), so both cores and both slots | both work; T5's knobs do not affect T4 |
| Part: SAVE, change knobs, RELOAD | the saved values come back |
| Project: save, load another project, load it back | RINGMOD SC on T4 FX1 and T5 FX2 with its saved values; the live effect ids read handle `0x0a` on both; the bus live afterwards |

### Readings over USB (the coordinating session)

| Step | Result |
| --- | --- |
| Install alone | key bus flags `01 01 01`, `kb_reset` `0402 0402`, receiver masks `08 08`; the bus engine placed on both cores (offsets `106b` / `10eb`), reserved `0065`, held `08`; the charge rows `4b425553` = 72 on both cores |
| Sidechain Compressor installed after it | masks `09 09`; no second key bus job (offsets unchanged); Sidechain's engine at `0f29` / `0fa9`, reserved `01a7`, held `09`; the key bus row kept |
| The base's self-test with both | passed: 2/2 intact; peaks CPU 52.8 %, T1-4 27.7 %, T5-8 37.5 %; longest frame 401 µs; record +0 = 2, failed bits 0, refusal (+92) 0 |
| Self-test with two instances (T4 FX1, T5 FX2) | passed; peaks CPU 66.7 %, T1-4 21.8 %, T5-8 39.5 %; longest frame 384 µs. `stats` while playing: CPU 559, T1-4 210 / 217, T5-8 394 / 395 (per mille) |
| Removal, Sidechain first | masks `08 08`, the bus stays, flags `01 01 01` |
| Removal, RINGMOD SC alone | everything back to 0, the arena `10d0` / `1150`, no key bus row |
| Sidechain first, then RINGMOD SC installed | flags `00 00 01` → `01 01 01`, masks `09 09`, no new key bus job, the key bus row appears |
| RINGMOD SC removed first (beside Sidechain), then Sidechain | `00 00 01` and masks `09 09`, then all clear |
| Reinstall | the bus comes back |
| Removal while a track uses it | refused, loader refusal 7 (in use), as designed (the first attempts were refused because it was still on T4 FX1); accepted once FX1 was NONE |
| The base's admission fix, read only | `mask_known` 3, `closed` 0, MWEV +53 bit 7 clear throughout; the self-test record's refusal (+92) held the loader's own code: 7 after the in-use refusal, 5 (BUSY) after a reinstall the bridge retried successfully; never 10 |

### Not run in this session

- **Not run on a unit for any 0.2.0 build:** parameter locks and LFOs on the unit (including a lock or LFO on SLEW
  through 0), installing while playing with a stale seed, the window and buffer reads, the missing-module message,
  scenes and the crossfader, eight instances a core, MKI.
- **Carried from 21 October, not re-measured:** the key latency (T4 0, T2 16, T5 32 samples, correlation 1.000)
  was measured on the key bus re-check that day, not through this module's RING path. The key bus path is unchanged
  since, and RING with S&H, RECT and SLEW at 0 equals 0.1.0 sample for sample in `dsp_host`, so the figures are
  expected to hold; they are not observed for this source.
- **Power cycle:** not testable on a RAM-booted twin; not tested.
- **Observed, probably a base matter:** after the project reload the unit showed "MISSING SPECTRUM" once (Spectrum
  was never used; its legacy id is `0x0a`, the handle RINGMOD SC held). The missing list then showed only LOFI2, which
  had been removed. Likely the base's legacy-name fallback while rebinding after an intermediate project without
  Modwerk effect lines; followed up separately, not a RINGMOD SC change.

### Limits

- One MKII, one session, by the module's author; ears and hands, nothing recorded or measured on the unit's audio.
- A RAM-booted development twin carrying two base fixes not yet on main; the flashed main base was not used for this
  source.

## History

- **21 October 2026, the 0.2.0 build before RECT** (package `64dc83b9…`, twin `f178641b…`): DUCK, MODE's SETUP label,
  plain RING, S&H and SLEW by ear, beside seven other modules (TESTING.md).
- **21 October 2026, 0.1.0** (never published, package `8063657f…`, twin `2e467c17…`): the key bus re-check (latency
  above), install and charge, KEY's labels and step, DUCK by ear; the buzz at the very shortest ATK, HOLD and REL
  (TESTING.md).
