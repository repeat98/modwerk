# Digitone II SDK

**Platform:** elemod · **OS:** 1.12 · **Base:** core 1.1 (the Digitakt II base, [goal](GOAL.md)) · **Modules:** [`sdk/digitone-ii/modules/`](../../digitone-ii/modules/)

What a module developer needs on the Digitone II: the base's hooks, what the unit showed about its voices, its frame budget and its pages, and how a module page fits the stock ones. Every address is OS 1.12's and was read on a unit over the development link unless it says otherwise. Addresses, sizes and behaviour only: no stock bytes.

## Modwerk stack

The Digitone II follows the Octatrack's stack ([recipe](../../../docs/MACHINE_RECIPE.md)). Where it stands: the base, the Digitakt II base's core-dt2 1.1 source at the Digitone II's addresses ([`elekloader/`](elekloader/README.md)), runs on a unit and is the cumulative draft #1767; the USB link and the runtime loader are in review; flashing from the site, base updates over USB and the machine page are not built ([goal](GOAL.md)). Its contract is [`sdk/digitone-ii/core-profile/interface.json`](../../digitone-ii/core-profile/interface.json): a module uses those events, tables and exports and nothing else. The development link (SysEx over USB MIDI: memory reads, key presses, screenshots, RAM boots) is in review (#1763, #1842); the reads below were made with it.

## Core hooks

| Event | When | Handler |
| --- | --- | --- |
| `ev_tick` | the UI compose check, about 30 Hz | `void f(void *ctrl)`; set `ctrl + 0x20` to 1 to have the frame composed again |
| `ev_draw` | after stock composed the 128×64 frame | `void f(void *bmp, void *ctrl)` |
| `ev_key`, `ev_enc` | a panel key or an encoder | `int f(void *brain, char *event)`; nonzero takes it |
| `ev_settings`, `ev_personalize` | building those menus | `void f(void *menu)`; add rows with `core_addvalue` |
| `ev_frame_params` | once a frame (1,500 a second), in the frame interrupt, before the stock modulators | `void f(int16_t *values, int stride)` |
| `ev_key_leds` | every UI frame | `void f(void *mgr)` |

Tables: `core_projdata` (a block in the project file's header) and `core_kitdata` (a block per kit, 128 kits). The kit blocks of every module share the room a kit record has: 337 bytes, `core_kitdata_room()`. Keep yours small and say its size in the README.

### `ev_frame_params` hands over voices, not tracks

`values[stride * k + j]` is Sound parameter `j` of **voice slot `k`** (16 slots, stride 101, values in 8.8: 127.0 is `0x7f00`). OS 1.12 keeps one parameter array per voice: a polyphonic track's chord uses several slots, and a slot changes tracks from note to note. The values are the smoothed copy stock sends on (`0x800068e4 + 0x22 + 202 * k`). What a handler adds reaches the records sent to the DSP (`0x80005e60 + 0xda + 146 * k`) in the same frame, and the kit's own values (`0x80003b12 + 202 * k`) stay as they were (Voice Spread's tests, #2003). Hold every result in the parameter's range.

## Voices

Seen on a unit, 23 November 2026, playing notes over USB MIDI on tracks 1-4:

| What | Where | Notes |
| --- | --- | --- |
| A voice's track | `uint32_t` at `0x80005308 + 4 * k` | 0-15; it stays at the last track after the note ends |
| Voices holding a note | `uint32_t` at `0x80005348` | bit `k` set from note on to note off: its rising edge is a note on that slot, its falling edge the release |
| A voice's Sound | pointer at `0x800052a8 + 4 * k` | into the kit in RAM; stock copies the Sound's 101 values to the voice when it takes it |

These are stock's RAM, not part of the base's contract yet: a module that reads them names them in its README, and the first two modules that need them should propose them as a base export ([propose a hook](../../../docs/module-guides/README.md#propose-a-hook-on-the-digitakt-digitone-or-digitakt-ii)). The voice that holds the active track is not known, nor where stock keeps the active track itself: a module that needs it today follows TRK + TRIG in `ev_key`.

### Sound parameter indices

The index `j` above is the array index in stock's parameter descriptors (a table of 60-byte entries; each holds the group, the index, min, max and default in 8.8, the MIDI CC, the long, page and short names and the value's formatter). The 101 values are taken: LFO1-3 1-24 (eight each: speed, multiplier, fade, destination, waveform, start phase or slew, mode, depth), the machine's own 25-65 (which depends on the machine), filter 66-79 (type 66, frequency 67, resonance 68, envelope depth 69, delay to key tracking 70-79), amp 80-92 (envelope 80-85, delay send 86, reverb 87, chorus 88, pan 89, volume 90, 91-92), portamento 93-94, 95-99 bit reduction and routing. There is no free run for a module's own parameters: keep them in project or kit data.

## Frame budget

Measured on a unit with a bench module in `ev_frame_params` (23 November 2026). DTIM0 (`0xfc07000c`) counts freely at about 132 MHz; a frame is about 88,000 counts (667 µs, periods 84,600-93,600). DTIM2 counts too, at about a sixth of that; DTIM3 is a tick timer, not a free count.

| Work in the hook | Counts a frame | Share |
| --- | --- | --- |
| the hook alone | about 370 | 0.4 % |
| one simple LFO on each of the 16 slots | about 1,100 | 1.3 % |
| 8 a slot | about 4,000 | 4.6 % |
| 64 a slot | about 28,300 | 32 %, still stable |
| 128 a slot | about 56,000 (projected) | hung the unit |

So stock leaves roughly 30-60 % of a frame. A module's per-voice work should stay in the low single percent; measure yours the same way and give the figure in `resources.load`.

## Panel input

`ev_key` and `ev_enc` get stock's event: the key or encoder at `event + 12` (`int32_t`) and at `event + 16` a key's flags (1 press, `0x10` release) or a turn's delta (one per detent). Key codes: TRIG PAGE 1, SYN 2, FLTR 3, AMP 4, FX 5, MOD 6, PERFORM 7, SAVE PROJ 8, TAP TEMPO 9, YES 10, UP 11, NO 12, LEFT 13, DOWN 14, RIGHT 15, TRK 16, FUNC 17, KB SETUP 18, REC 19, PLAY 20, STOP 21, PAGE 22, PTN 23, SONG 24, TRIG 1-16 25-40; encoders A-H 1-8, LEVEL 9. A handler that takes a press should also take its release, and one that lets stock have the press must let it have the release.

## Pages

### How stock builds them

- **Page records**: 37 records of 44 bytes at `0x42433c00`, filled at boot: a short name ("LFO2"), a title ("MOD"), eight control ids (A-H) and a word. MOD's are records 4, 5 and 6 (LFO1-3). The getter at `0x400c25d8` answers ids above 36 with an empty record before the table.
- **Controls are descriptors**: a control id is the descriptor's index (321 entries, LFO1's controls 75-83, LFO2's 85-93, LFO3's 95-103). Stock reads that table directly in more than fifty places, so a module cannot add descriptors.
- **A page key's sub-pages** are a vector of record ids in its page view (the current page view at `*(void **)0x44648980 + 0xbc`; its key at `+0x88`, the vector at `+0x7c`, `+0x80`, `+0x84`): MOD's is `[4, 5, 6]`. The title "MOD (n/3)", UP and DOWN and the position marker on the right all follow that vector.

Seen on a unit (a probe module, RAM boot, 23 November 2026): with MOD's vector pointed at 4, 16 and 300 ids, stock titled the pages "MOD (n/4)" up to "MOD (n/300)", DOWN and UP stepped through all of them (past 256), stopping at the ends. Two sub-pages that share a record also share its controls' state (some stayed blank), so a new page needs a record of its own. Pointing a stock vector at a module's array was a probe only: stock may grow or free it.

**What a real extra sub-page needs from the base** (not built; a proposal for the base draft): a hook at the record getter's site that answers ids from 37 up with records modules contribute, the base adding those ids to the page key's vector where stock builds it, and an export that draws a stock control's look with a value the module supplies. Without descriptors, such a page's controls cannot be locked, sent as MIDI CCs or modulated by stock's LFOs. The 20 callers of the record getter have not all been checked for arrays indexed by record id.

### The screen

`ev_draw` runs after stock composed the frame. The composed frame's buffer is at `*(uint8_t **)0x402a10c8`: 128×64, column by column, eight bytes a column, the top eight rows in the last byte, bit 0 the topmost. Stock's text routine and fonts are not exported to modules: draw with your own.

### Laying a page out like stock's

Measured from the unit's screens (OS 1.12, the MOD, FLTR and AMP pages):

| Element | Where |
| --- | --- |
| Pattern box ("A01") | x 0-14, y 0-9 |
| Title bar | x 17-127, y 0-9, lit with dark text from x 19, y 2; one corner pixel off at each end |
| Track box ("SYN 3") | x 0-14, y 13-36; LEV meter x 0-14, y 40-56, its label at y 59 |
| Controls | centres at x 33, 59, 86, 111; A-D y 13-29, E-H y 40-56 (17 pixels square) |
| Labels | 5 pixels tall, centred under the control, at y 32 and y 59 |
| Position marker | the right edge, x 125-127 |
| Envelopes | over A-D, x 21-124, y 13-29: one-pixel lines, 3×3 hollow nodes at the corners, dotted guides at the stage edges |

A page drawn over a stock page can leave stock's left column (pattern box, track box, LEV) as stock drew it and repaint only x 16-127 below the title bar, so the pattern and track shown stay right without the module knowing them. Show a control's number for about a second after it is turned, as stock does.

## Build and recovery

Build a module with `node scripts/build-elemod-packages.mjs --output DIR --source-commit SHA --drafts --module digitone-ii:<id>` and link it with the base for your own OS 1.12 file ([goal](GOAL.md)). A RAM boot over the development link leaves the flash as it was; a power cycle brings the flashed OS back. Hold FUNC while powering on and choose OS UPGRADE to restore stock 1.12 over MIDI DIN.
