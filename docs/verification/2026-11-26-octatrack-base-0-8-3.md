# Octatrack base 0.8.3: five fixes on top of 0.8.2, 26 November 2026

Source: `base/octatrack-next` after main `3e9ce92e3` (base 0.8.2, #2079) plus four changes, each its author's commit:
the frame interrupt's Part read from SRAM (#2174, Laslo), a Keep that never loses to an unreadable saved-set file
(#2109), module knob names that follow the drawn track (#2228, #2042), a USB Audio stream in the CPU limit (#2251), and
an attach watchdog that re-offers a unit a host addressed but never configured.
Base builds: see the end.

## 25 November 2026: the frame interrupt reads the current Part from SRAM (Laslo, lasl00)

- **Why:** the frame interrupt calls `0x400068e4` twice a track, 16 times a frame (`0x4000d340`, `0x4000d36c`), and it
  begins with `mvzb 0x100b14cf,%d0`, the current Part from CS1. Stock keeps the same byte in on-chip SRAM at `0x80000003`
  and writes both wherever it writes either: SRAM, then CS1 in the next instruction (`0x40062142`/`8`, `0x400621e2`/`8`,
  `0x40087ea6`/`ac`); the boot (`0x4001fa76`) and the reset (`0x40025aaa`) set CS1 and memcpy copies it to SRAM
  (`0x400208ae`). The pairs are not masked, so in the one instruction between them stock's other 94 readers of
  `0x80000003` already see a new Part and this one sees it a frame later: with the change it sees it with them.
- **Change:** `build_core.py` `PART_READ`: the six bytes at `0x400068f0` become `mvzb 0x80000003,%d0` (`op: bytes`, guard
  on the stock instruction): the same flags, one CS1 read fewer per call. The ISR's other read (`0x4000d212`) is a rare
  branch and stays.
- **Found with** `ot_emu` (stock 1.40C, project CPUCURVE: Part 1, 120 BPM, A01 a trig every four steps on T1-T4, T6, T7
  with T2 and T4 playing a 2 s loop, Dev17 C04 style) and a local counter of data accesses outside cached SDRAM by PC
  (not in this tree): over 11,025 frames A01 made 28.1 CS1 accesses a frame, 16.0 of them this read, besides 12 of the
  renderer's per-voice CS1 record. Most of the 9,000 accesses outside SDRAM go to SRAM, which is as cheap as a cache hit.
- **Emulator A/B:** development twins of this source without (`f8c3f344…`, MAIN `7a306ec6…`) and with the change
  (`30592832…`, MAIN `ceb6f9a2…`), the beta flags without controller rows plus `--dev`, the same 11,025 frames of A01:
  the same instructions over the frames (350,396,946); all 353,406 writes to the DSP host port equal (address, value,
  PC); SRAM and `0x46c80000..0x46cbffff` equal; CS1 equal but the eight bytes of the base identity. CS1 accesses 46.3 →
  30.3 a frame. At `0x400068f0` the two bytes were equal at all 176,400 calls, also on a project saved on Part 3 (the
  load writes 2 through the `0x40087ea6` pair). Not checked in the emulator: a Part switch while playing.
- **On Laslo's MKII** (OS 1.40C, the flashed base 0.8 `e1152583`, RAM boots of the two twins A, B, A; CPUCURVE3 on the
  card; `guard` 8 s readings):

  | Frame interrupt mean (longest frame) | A | B | A again |
  | --- | --- | --- | --- |
  | A01, six tracks trigging, two samples (6 readings) | 37.0-37.1 % (77.6-79.8) | 36.0 % (76.4-79.1) | 37.0-37.1 % (76.9-80.3) |
  | A03, four trigging, no sample (3) | 29.8 % (63.3-63.7) | 28.8 % (62.3-62.5) | 29.8 % (62.9-64.6) |
  | A02, empty, playing (2) | 29.8 % (40.2-40.7) | 28.8 % (39.3) | 29.8 % (40.2-40.6) |
  | stopped (2) | 29.8 % (40.1-40.3) | 28.7 % (39.1-39.3) | 29.7-29.8 % (40.1-40.4) |

  One point of the frame interrupt in every state (about 3.6 µs, 0.23 µs a CS1 byte read); the longest frame about a
  point lower where the pattern does not set it. Nothing skipped. CPU meter: 49.4-50.2 → 48.3-49.1 % on A01.
- Built on 0.8.2 (#2174's own twins): base `880c0a34538757dd…`; browser = native `.bin` `a4ecb83fcea5f609…`
  (832,628 bytes). Base-bound packages relinked.
- **Part switches while playing** (twin B, A01 playing, Laslo at the unit through the PART menu): Parts 1, 2, 3, 2, 1,
  2, 3, 4, 1 over about two minutes, the current Part read from SRAM every 4 s. Nothing skipped, no stall, no error in
  1,003,642 frames; back on Part 1 the frame interrupt read 36.0 % again (the longest frame up to 87.3 % in the readings
  that held a Part load). By ear: Part 1's sound came back cleanly each time (Parts 2-4 of the project hold no sample).
- Not run: the release image on a unit.
- **The boot clamp** (asked on #2174, read from stock 1.40C). Stock copies the 22 settings bytes from CS1 `0x100b14cc`
  to SRAM `0x80000000` at `0x4001fb4c` and only then calls the battery restore `0x40025770` (at `0x4001fb78`), whose
  first call, `0x4000fda8`, clamps a CS1 Part above 3 to 3 in CS1 alone. On stock a damaged Part above 3 would stay in
  SRAM, where stock's own SRAM readers already see it. Since 0.8.2 (#2223) `mw_boot_restore` takes that call, runs the
  checks first and, when a settings value was fixed, copies the 22 bytes into SRAM again before stock's restore (`diag.c`
  `modwerk_boot_restore`, also when the bank is refused for more than `RESTORE_TRUSTED` fixes). So on this base the SRAM
  Part is at most 3 when the restore returns. The restore runs from main's init, before the interrupt setup that follows
  it (`0x4001fc02` on). The interrupt's other Part read, `0x4000d212`, still on CS1, does the same lookup (Part × 0x18b2
  + bank base `0x46c82456` + track, the mode byte at +585122 compared with 4): with a bad Part either site would read a
  byte past the four Parts inside the bank's SDRAM, a read and no fault. Outside the one-instruction window both sites
  read the same value.

## 24 November 2026: a saved-set file the start could not read (#2109)

`modset.c` told a missing `MODWERK0.SET`/`MODWERK1.SET` from one it failed to read only by accident: `load()` returned 0
for both. With neither file whole, the restore zeroed the header, generation included, and said NONE_SAVED when both
failed to open or read; the next Keep sealed generation 1 into the other file, and a file that failed to read at that
start and read again later, holding a higher generation, won over the Keep at the next start.

- `load()` now returns absent (stock's open -12, no such file, or -10, an empty one: the logger's reading in
  `stock_140c.c`), read in full but no set, or unreadable (any other open failure, or any read failing). A header that
  is not whole is never trusted for its generation, since a write cut short inside it mixes new bytes with old.
- An unreadable file gives DAMAGED (5) instead of NONE_SAVED. With no whole set the next save goes first to the
  unreadable file, and every file the start could not read gets the set too before the save counts as saved (`pending`
  stays set and the second write follows at once). If the read-back fails, the save is SAVE_FAILED and retried.
- A newer file that read whole and then failed the restore's second read leaves nothing running, DAMAGED, and an empty
  `set[]` with its generation (it used to keep the other file's bytes).

Host tests (no firmware): `test_modset_card.c` (new; modset.c's own sector store and load) cuts the power before every
stock file call of a save, 328 cuts over eleven installs, removals and switches, with a file's length landing per sector
and only at close, and runs nine read-error cases; `test_modset.c` adds three on its pretend card. On `f99c1d523`'s
modset.c 13 and 6 checks fail (NONE_SAVED where DAMAGED belongs, the Keep losing at the next start); the power-cut sweep
passes there too. With the change all pass, with the elekloader `test_recipe.py` (41), `test_sets.c`, and the
`sdk/tests` saved-set, card guard, card shelf, volatile service, journal, loader, resident engine board and base-bound
suites.

- Built on 0.8.2 at the time (pinned m68k toolchain): base `39f56803c52277b1…` (was `c5791ec9`); browser = native `.bin`
  `5205b4afbcd20e66…` (831,672 bytes); MAIN 1,348,231 bytes (`d67ce1b5f1ab09bf…`); container 831,656 of 851,712, 20,056
  free (+188 bytes on `c5791ec9`). Base-bound packages relinked.
- Not run on a unit: the read failures cannot be made on hardware. Pending on a flashed 0.8.3: a kept set restored across
  power cycles; a Keep then two power cycles; a card with neither file starting as "Nothing saved" (2), not 5, which
  checks stock's -12 in this path; PROJ held at power-on, a Keep, a power cycle.

## 26 November 2026: module knob names follow the drawn track (#2228, #2042)

A select that renames its neighbours (Euclid's TYPE: FREQ RES DEPTH, or LEVEL -- AMT for AMP) writes the names into its
module's FX page. The USB base keeps one page per effect id (`pages[id]`, `fxpage.c`), shared by every track running the
module, and the panel ran the renaming formatter only when it drew that select, so the names one track's TYPE set showed
on every other track's main page. The sound was never affected. `modwerk_fxpage_names(page, track, part, fx)` runs a
module page's renaming formatters with the drawn track's own stored values, from three hooks in `fxpage.s` right before
the names are drawn: `mw_names_main` (0x4004e4d2), `mw_names_fx1_setup` (0x40037b8c), `mw_names_fx2_setup` (0x400377f0),
each in `DYNLOAD_HOOKS` with a SHA-256 guard. Stored values: main at store+0x126+24·track+6·fx, SETUP at
store+0x2fe+30·track+6·fx.

| Case | Why this change makes it a risk | How run | Result |
| --- | --- | --- | --- |
| Two tracks, different TYPE, main page | each track must show its own names | host test | pass; unit not run |
| FX1 vs FX2 slot of one track | the stored-value offset differs by slot | host test | pass |
| Stock effect on the page | the hook runs before every main and SETUP draw | host test | pass |
| No project loaded, page dropped | the store or page can be missing | host test | pass |
| Vector's hook at 0x4004e4c6 | patches sit close in the same drawer | build overlap and return-target checks | pass |
| LFO destination lists | they show these names too | not changed | known gap: the last-drawn track's names |
| UI and frame cost of three more hooks | they run on every draw of those pages | not run | needs the unit |

## 26 November 2026: a USB Audio stream counts in the CPU limit (#2251)

- **Report:** UNGEMACH, SYNTIZ or FM Synth picked while no computer streamed broke up once Ableton recorded 16 channels
  (MKI); picks made while it streamed were refused as PART IS BUSY, and that refusal outlived the stream.
- **Cause, on the owner's MKII** (0.8.3 development twins, USB Audio 0.4.1, macOS recording with `rec.swift`, the guard
  step's frame interrupt figures): the USB interrupt runs inside the frame interrupt's renders, so a stream stretches
  every frame rather than adding a slice after it. USB Audio's own frame block took 0.5 % of a frame.

  | Scene (twin) | No stream: longest / mean | Stream | Stretch of the mean |
  | --- | --- | --- | --- |
  | Empty pattern (1) | 33 / 24.2 % | 4 ch: 52.4 / 33.5 % | 1.38 |
  | Empty pattern (1) | 32.8 / 24.5 % | 16 ch: 69.3 / 43.1 % | 1.76 |
  | UNGEMACH trigging on T1 (1) | 66.5-73 / 37.6 % | 16 ch: 88.5-91.2 / 58.4-61.9 %, one render dropped in 6 s | 1.63 |
  | UNGEMACH (1) | 66.7 / 37.4 % | 2 ch: 76-83.6 / 52.8-53.8 % | 1.43 |
  | UNGEMACH (2, four takes) | 66.4-67.4 / 36.8-37.4 % | 16 ch: 69.4-72.6 / 43.7-44.4 % | 1.19 |
  | UNGEMACH (2, after an INPUTS reconnect) | 66.8-69.9 / 37.4 % | 16 ch: 77.7-82 / 45.9 %; and playing into INPUTS AB: 45.8 % | 1.23 |

  The stretch differed between boots (twin 1 and twin 2 differ only in a timer read twin 1 took around the USB block,
  too little to explain it); not explained. Each stream start brought frames of 95-99 % and, once, 14 late entries
  (the latest 259 µs).
- **Change:** `usb_function.c` reports from EP3's enable bits (ENDPTCTRL3) whether the host streams, and in which
  direction. `status.c` stretches what the reserve predicts and what a pick adds by `stream_factor()` (1.65 for every
  stream, the stretch a Part dropped renders at; the set's `stock` carries `stream` and `streamDuplex` as pseudo ids
  `0xffffffe0`/`1`), keeps the figures kept from a play as they would be without the stream, and names USB AUDIO STREAM
  in CPU FULL and in the predicted brake's notice when the stream is what leaves no room.
- **On the unit (twin 2, `6590dcdf` MAIN):** with 16 channels streaming, SYNTIZ on T3 of an empty pattern was refused:
  CPU FULL, SYNTIZ NEEDS +30 %, USB AUDIO STREAM. With the stream closed the same pick was made. With UNGEMACH and
  SYNTIZ on the Part, a pattern started while streaming paused SYNTIZ with the notice USB AUDIO STREAM / SYNTIZ, and
  UNGEMACH played on.
- **Host:** `test_status.c` (factor from the set and compiled, the stretched pick and its box, the brake and its notice,
  the kept figure without the stream), `test_usb_function.c` (the enable bits), `set-package.test.ts` (the ids).
- **Known limit:** a light Part with one heavy machine picked before the stream starts is not paused (its stretched
  figure stays under the brake's 122 %) and can drop that machine's renders once the stream opens, as on the MKI. The
  stream's own cost is the bigger lever (USB Audio).

## 26 November 2026: the attach watchdog waits for a configured unit

- **Seen:** on the owner's MKII, four times that day, the unit ran on with USB dead until a power cycle: after a RAM
  boot (another session's twin `46c30886`, boot 1121, ran 26 min off USB), a RAM boot right after USB Audio trials
  (twin `65f8604c`, boot 1123), a USB Audio layout change MAIN to TRACKS, and a USB Audio 0.3.0 install (boot 1125). The
  battery-RAM log shows each boot running on and no `usb` incident: the watchdog (#1985) never re-offered the unit.
- **Why:** it took any address (DEVICEADDR.USBADR, with a bus reset seen) for enumerated. A host that addressed the unit
  and then failed (macOS dropped the device: it vanished from the USB tree) left it addressed, so it was never offered
  again.
- **Change:** `ep0.c` `enumerated()`: on a base with USB functions, USB MIDI's `usbmidi_up` (set at SET_CONFIGURATION,
  cleared at a bus reset and the session's end) instead of the address. `usb_attach.h` is unchanged (its host test holds).
- **Emulator** (`ot_emu` adapted build, twin `764b6e71`, a scripted host): addressed and never configured, the unit was
  re-offered within 8 s; configured, no re-offer in 15 s. The old rule re-offered a configured unit there too, since the
  emulator keeps DEVICEADDR at 0, so the emulator cannot show the old rule's gap; the unit run below can.
- **On the unit** (owner's MKII, evening of 26 November, twins with this change: `764b6e71` running base `478c0c8d`,
  boots 1129 and 1131, and the built-in USB Audio twin `853a9af2`, boot 1130): three RAM boots, twelve USB Audio trials
  installed and rolled back (0.3.0 to 0.4.2), and two layout changes (MAIN + CUE to 16 CH and back) with the Mac
  recording and playing in. The unit stayed on USB throughout, and the log holds no `usb` incident: nothing needed a
  re-offer. So the change caused no false re-offer in normal use, but no drop happened to show that it heals one.
- **Not shown:** the re-offer healing a drop on hardware, the released 0.8.2 base (which keeps the old rule), an MKI,
  a cold start after a power cycle, Windows.
- **A different loss, open:** the same night another session's three DSP stall runs (twin `764b6e71` and a 0.8.2 twin)
  each lost USB at the rollback that removed USB Audio after a stream; `npm run device -- recover` finished each without
  a power cycle. Both bases, so not this rule. The stream had closed 1-1.5 minutes before each removal; those
  rollbacks removed sets of 18-19 packages with USB Audio among them, while the twelve above removed USB Audio alone and
  kept USB: removal within a large set is the lead, not yet separated on the unit.

## Builds and pending

- Base 0.8.3 (OS 1.40C, `npm run octatrack:base -- --beta --write`, the pinned m68k toolchain): base `c7478e593d347461…`,
  browser = native `.bin` `5361c502ea850b3e…` (836,272 bytes). Every change inside a declared site; the bootloader copy
  identical. Base-bound packages (Sidechain Compressor, Output Matrix, CC Map, Recorder Loop Fix, Analog BD) bound to it
  with their bytes unchanged. Not yet booted on a unit.
- Pending for #2251 on a unit: the release image, an MKI, 20 channels, and why the stretch differed between boots.
- Pending on a unit: Euclid on two tracks (one AMP, one LP), switching between their main and FX1/FX2 SETUP pages,
  each showing its own names, with the UI and frame cost of the three hooks; a Keep, then two power cycles; the frame
  interrupt A/B on the release image.
