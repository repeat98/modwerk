# Scale Quantizer 0.1.5: the two panel sites left out

0.1.5 changes which sites the package hooks. The author's 2.21 panel publication transaction runs
only beside FM Synth, in FM Synth's own copy of the quantizer; without it the detours at
`0x4004fc84` (16 bytes) and `0x40005162` (8 bytes) only replayed the displaced stock instructions.
The wrapper leaves both out (`_without_panel`), and the runtime port omits the include's second
pass, so the package carries no stock copy of `0x4004fc84` either. The source is the author's
public v2.23 tag, `e908beb0f2c1fce3cf8b1de5178d7cb77b00d7fb`. Its added FM project-comment
write runs only beside FM Synth (`HAVE_SYNTH` is 0 here); the unused format string remains in
the native object. The native object therefore changes even though that write does not run.

## Test procedure and edge cases — 20 November 2026

Main `52b920e5` (base 0.7.12) is merged, without rebasing. The package is unchanged: 7,038 bytes,
SHA-256 `092a8a13b999d14c63df6100d84f3c5202f615120c95f3df605e8c43d3736d50`.

`npm run test:procedure -- quantizer --no-unit --package public/octatrack-modules/quantizer/0.1.5-experimental.mwrm`
(docs/TEST_PROCEDURE.md). Without `--package` it stops at step 3: `module:dev --build-only` cannot
build this module, which needs its machine path. Steps 6 to 10 ran on the emulator through
`npm run device:emulator`, on a development twin of base 0.7.12.

| # | Step | Result |
|---|---|---|
| 1 | Software checks | red on the module rules line until the owner's approval record for 0.1.5 exists; passes with a local stand-in record that is not committed |
| 2 | Beside every other module | passed: 43 active modules, 0 problems |
| 3 | Name the build | passed: the committed package, `092a8a13` |
| 4 | DSP cost model | passed |
| 5 | Emulator rehearsal | steps 6, 7 and 10 on the emulator, base 0.7.12 |
| 6 | Read the unit | passed on the emulator; on the MKI `status` and the inventory answered |
| 7 | Scripted unit pass | passed on the emulator: the trial ran, 12 of 12 Part switches, rolled back; the self-test was not answered and the frame checks did not run there. Not run on a unit |
| 8 | Soak | not run: the emulator has no USB MIDI port; not run on the unit |
| 9 | Cost on the unit | not run: needs a unit. The committed at-rest reading (0 points) is 0.1.4's, on base 0.7.8 |
| 10 | Put back | passed on the emulator: the inventory equals the start |
| 11 | Agent by hand | not run on a unit; the emulator sessions are in the two base sections below |
| 12 | Submitter's own stage | run on an MKI on 20 and 21 November 2026: the hardware section below |

**Edge cases.** Emulator results are from the sessions on base 0.7.12 (its section below); the
same sessions ran before on base 0.7.10 (the section after it). They are not hardware evidence.

| Case | Why this change makes it a risk | How run | Result |
|---|---|---|---|
| Install with Keep, then remove | the package patches 7 sites; 0.1.4 patched 9 | emulator, base 0.7.12, over USB; every site read after each step | pass (emulator, base 0.7.12): 7 patched, then 7 exact stock; the set identity returns to the empty set's |
| The two sites 0.1.5 no longer hooks, `0x4004fc84` and `0x40005162` | they must stay stock with the package installed | emulator, base 0.7.12: both read on the running base after each Keep and hashed against 0.1.4's stock hashes | pass (emulator, base 0.7.12): both stock with 0.1.5 installed, alone, beside FM Synth 0.1.4 (either order), after a power cycle, after the replace and during the upgrade trial |
| 0.1.5 installed over a kept 0.1.4 | the replace must put stock back at the two sites only 0.1.4 patched | emulator, base 0.7.12, on a card holding a project saved with 0.1.4: Keep 0.1.4 (9 sites patched), the upgrade offered as a trial and undone, then kept; reload, FOLLOW, SAVE, power cycle, MIDI; then removal | pass (emulator, base 0.7.12): one inventory entry, and the card's newest set holds only the 0.1.5 package.<br>(1) Old hook sites: both stock during the upgrade trial, after the upgrade, after SAVE PROJECT and after the power cycle.<br>(2) FOLLOW: on audio 344.531 Hz following, 365.012 Hz not following, both 365.012 Hz with FOLLOW OFF; on MIDI 3 notes at 61 OFF and 3 at 60 ON, each with its note-off.<br>(3) Undo: read during the trial (one entry, 0.1.5's 7 sites patched), then undone: 0.1.4 back with its set identity and its nine patched sites byte for byte.<br>(4) Saved settings after a reboot: settings, rows and both pitches back.<br>After removal all 9 sites stock |
| Power cycle after Keep | the boot restore replays the new 7-site set | emulator, base 0.7.12, card and battery RAM carried over | pass (emulator, base 0.7.12): active at boot; rows, settings and both pitches back |
| A project saved with 0.1.4, reloaded on 0.1.5, then SAVE PROJECT | the settings must read and write as before | emulator, base 0.7.12 | pass (emulator, base 0.7.12): same settings; the project files equal 0.1.4's save |
| Pitch and MIDI notes with FOLLOW ON and OFF | the native object changed | emulator, base 0.7.12: four windows per track, three notes per state | pass (emulator, base 0.7.12): 344.531 Hz following, 365.012 Hz not following (+1 st); 3 notes at 61 OFF, 3 at 60 ON, each with its note-off; the MIDI bytes equal those on base 0.7.10 |
| Beside FM Synth 0.1.4, quantizer installed first | FM Synth 0.1.4 carries its own copy of the quantizer and declares a conflict with Scale Quantizer | emulator, base 0.7.12: Keep the quantizer, then FM Synth 0.1.4; then the quantizer removed | pass (emulator, base 0.7.12) for the install: the loader admits both, the 7 sites hold and the two dropped sites stay stock; FM Synth 0.1.4's 24 sites include none of the quantizer's. Removing the quantizer leaves FM Synth alone with the 9 quantizer sites stock. Not played: FM Synth 0.1.4 declares the conflict |
| The same pair, FM Synth installed first | as above | emulator, base 0.7.12: Keep FM Synth 0.1.4, then the quantizer, then the quantizer removed | pass (emulator, base 0.7.12) for the install: admitted, no refusal, the same set as the other order, the 7 sites patched; its removal leaves FM Synth alone with the 9 quantizer sites stock. Not played: a declared conflict |
| Beside Tuner 0.1.0, then Tuner removed | another module's removal must leave the 7 sites | emulator, base 0.7.12; control: Tuner alone on a card where the quantizer was never installed, on bases 0.7.12 and 0.7.10 | not run: on the emulator the base refuses Tuner's removal (refusal 5, busy), also with Tuner alone on a fresh card, on 0.7.12 and on 0.7.10; cause not traced. The pair installs (self-test: 2 intact) and the quantizer's 7 sites stay patched; removing the quantizer beside Tuner restores its 7 sites and leaves Tuner whole |
| The card's saved set after the removal | the removal rewrites `MODWERK0.SET` or `MODWERK1.SET` shorter | emulator, base 0.7.12, FAT chain listing | fail: the set file's chain ends in a free cluster (`MODWERK1.SET` 7,680 -> 512 B, 15680 -> 15681 -> free). Reproduces on 0.7.12 and 0.7.10. The base's writer, not this package: #1830 |
| Undo of an install or a trial | the loader paths around the new site list | emulator, base 0.7.12: Undo of a held and an unheld 0.1.5 trial on an empty set, and of a held 0.1.5 replace over a kept 0.1.4 | pass (emulator, base 0.7.12): inventory and set identity back each time; every site stock, or 0.1.4's nine patched sites byte-identical to before |
| A refused set | the set must roll back whole | emulator, base 0.7.12: one set of 0.1.5 plus `device.mjs set`'s `+refuse` pair, on an empty set and with 0.1.4 kept | pass (emulator, base 0.7.12): refused at verify (refusal 3, conflict) before anything was applied; inventory, set identity and all 9 sites unchanged both times |
| A trial that expires with SEQUENCER open | the loader paths around the new site list | emulator, bases 0.7.12 and 0.7.10: page reopened inside the trial (SCALE and ROOT on screen), no USB request, then keys on the page; control: the same walk with Scale Quantizer 0.1.4 | fail: no crash and the 7 sites are stock from about 9 s, but the page does not redraw: it shows SCALE and ROOT until the next key, then two blank rows that do nothing (YES, arrows, LEVEL) until the page is left. 0.1.4 shows the same screens byte for byte on both bases, so this update did not introduce it. It looks like the base's expiry path; not traced |
| Installed and used nowhere: cost at rest | the owner's limit of 0.2 points of the frame interrupt applies to a new release | not yet | not run: needs a unit (`npm run device:price`); the committed reading (0 points) is 0.1.4's, on base 0.7.8 |
| All of the above on base 0.7.12 | the base moved after my runs on 0.7.10 | emulator, base 0.7.12 `254c5a75`, rebuilt from main `a241c595` | pass (emulator, base 0.7.12) for every row above but the two marked fail, the Tuner removal (not run: refused by the base on the emulator) and the cost at rest (not run: needs a unit) |
| On a unit | an emulator result is not hardware evidence | my MKI, base 0.7.12 `254c5a75`, packages sent with `npm run device -- try` | pass for the upgrade from a kept 0.1.4 (trial, roll-back four times, Keep), FOLLOW on audio and MIDI by ear, and the saved scale after a power cycle (eight runs). Not run on the unit: the two old hook sites and the at-rest cost (a development base in RAM). One observation not reproduced: SCALE one step lower after the first two runs of the sequence; TESTING.md has it |

Tested on a unit: my Octatrack MKI, OS 1.40C, base 0.7.12 (`254c5a75`), 20 and 21 November 2026. The upgrade from a kept 0.1.4 (trial, roll-back, Keep), FOLLOW on audio and MIDI by ear, and the saved scale after a power cycle all work. Not read on the unit: the two old hook sites and the at-rest cost. The record is the next section.

## Author-reported hardware — 20 and 21 November 2026 (0.1.5, over USB)

Tim Hastie tested the 0.1.5-experimental package (`092a8a13`, 7,038 bytes) on his **Octatrack MKI,
OS 1.40C, Modwerk base 0.7.12** (identity `254c5a75`, byte-identical to the file the site's installer builds,
installed with OS UPGRADE from the card) on 20 and 21 November 2026. The packages were sent with
`npm run device -- try FILE` and kept with `--accept`. After every trial and every Keep the unit's
own verdict was "no crash, stall, freeze or skipped track logged during the trial". His words on
the five tests below: "Yes, all five tests pass, including midi". **Reported by the author**, not
independently repeated.

- tested on: 2026-11-20 and 2026-11-21
- tester: timhastie
- model: MKI
- base: 0.7.12 `254c5a75`, flashed
- 1. Upgrade from a kept 0.1.4 (`33700b93`): with 0.1.4 kept, PROJECT > CONTROL > SEQUENCER ends in
  SCALE, ROOT, GLIDE, TRACK and FOLLOW. A 120 s trial of 0.1.5 over it, rolled back: the rows and
  the chosen scale stayed during the trial and after it, and the unit reported 0.1.4 active again. 0.1.5 kept over 0.1.4: rows and scale still there, and the
  unit reports `092a8a13` active.
- 2. Undo: the roll-back of a 0.1.5 trial over the kept 0.1.4 ran four times, each time back to 0.1.4.
- 3. FOLLOW on audio, with 0.1.5 kept: the same pitched sample on T1 and T8 at PTCH +1, SCALE MAJOR,
  ROOT C. AUDIO 1 following sounds one semitone below AUDIO 8 not following; with AUDIO 1 FOLLOW
  OFF both sound the same.
- 4. FOLLOW on MIDI: MIDI 1 with NOTE C# plays C with FOLLOW ON and C# with FOLLOW OFF.
- 5. Saved settings after a power cycle (SAVE PROJECT, power off and on): in eight runs SCALE read
  after the restart as it was saved. The runs: an edit alone (twice), the same version kept again,
  0.1.5 kept directly over 0.1.4 after the scale was turned down and after it was turned up, a
  same-version trial rolled back, and the whole upgrade sequence twice (trial, roll-back, Keep),
  once with the page reopened between the steps and once with it open throughout.
- One observation, not reproduced: in the first two runs of the upgrade sequence SCALE read one
  step lower after the save and the power cycle (MAJOR came back as OFF, MINOR as MIXOLYD). LEFT
  and RIGHT change the selected row's value by one step on this page, so one LEFT press before the
  save would give exactly this; that is not established. The base's log on the unit lists every
  start since the install in sequence, so no battery-RAM clear happened.
- limitations: a functional check, not a load or stress qualification. The two sites 0.1.5 no
  longer hooks were not read on the unit, and the at-rest cost (procedure step 9) was not measured:
  both need a development base started in RAM, which these runs did not use. Play time beyond
  these checks was not recorded.

## Base 0.7.12 — 20 November 2026

Base 0.7.12 rebuilt from main `a241c595` with the repository's base script: identity
`254c5a75a139255e057e69532bb952daffef5039ffeee0e6c9fabda302e5bb91`, equal to the committed
binding; package, fills, sources, binding and base versions equal the committed files. The
script's controller-policies check does not match on main itself (Analog BD's row hashes
`machine_ports.py`, which #1896 changed); the base is built with the committed file, as the
script does. The package is unchanged: 7,038 bytes, SHA-256
`092a8a13b999d14c63df6100d84f3c5202f615120c95f3df605e8c43d3736d50`. Every result below is from
`ot_emu` built by `scripts/octatrack-emulator/build.py` (its inputs equal main's), MKII panel,
copied cards. No unit ran. Sites were checked as on base 0.7.10: hashes of the bytes read on the
running base against the stock hashes in the packages' own site tables.

**Test procedure on the emulator.** `npm run device:emulator -- --image MAIN.raw --emulator OT_EMU --
npm run test:procedure -- quantizer --package public/octatrack-modules/quantizer/0.1.5-experimental.mwrm`
on a development twin of 0.7.12 (`build_core.py` with the beta flags, no controller rows, plus
`--dev`; configuration `d24c5acb`), 97 s. Steps 1 to 4 pass with a local stand-in approval record
that is not committed. Steps 6, 7 and 10 pass on the emulator: the trial ran, 12 of 12 Part
switches, rolled back, inventory unchanged; in step 7 the self-test was not answered (it asks for
the transport to be stopped), and the frame checks and the crash test did not run (the DSP frames
stand still on the emulator). Steps 8 and 9 are not run there by design; 11 and 12 are a unit's.

**Install, remove, replace.**

- USB Keep: Scale Quantizer listed, all seven sites patched; `0x4004fc84` and `0x40005162` stay
  stock. Removal restores all seven and leaves all nine of 0.1.4's sites stock; the set identity
  returns to the empty set's. After a power cycle the set is restored at boot, and Keep works
  again on an emptied set.
- Upgrade from a kept 0.1.4, on a card holding a project saved with 0.1.4: one inventory entry,
  and the card's newest set holds only the 0.1.5 package. After removal all nine sites are stock.
  - Old hook sites: `0x4004fc84` and `0x40005162` read stock during the upgrade trial, after the
    upgrade, after SAVE PROJECT and after a power cycle.
  - FOLLOW on audio: AUDIO 1 following plays 344.531 Hz, AUDIO 8 not following 365.012 Hz
    (+1 semitone), both 365.012 Hz with AUDIO 1 OFF. FOLLOW on MIDI: three notes at 61 with
    FOLLOW OFF and three at 60 with FOLLOW ON, each with its note-off.
  - Undo: the upgrade offered as a trial over the kept 0.1.4, read during the trial (one entry,
    0.1.5's seven sites patched, the two old sites stock), then undone, brings back 0.1.4, its set
    identity and its nine patched sites byte for byte.
  - Saved settings after a reboot: scale bytes `0000008401000002`, the rows and both pitches
    come back after SAVE PROJECT and a power cycle.
- Undo of a held and of an unheld 0.1.5 trial brings back the starting inventory, set identity
  and sites; Undo of a held 0.1.5 replace trial over 0.1.4 brings back 0.1.4's nine patched sites
  byte for byte.
- A set of 0.1.5 plus `device.mjs set`'s `+refuse` pair is refused at verify (refusal 3), before
  anything was applied, and nothing of it stays: inventory, set identity and sites unchanged, on
  an empty set and with 0.1.4 kept.
- A trial that expires with the quantizer's SEQUENCER rows open: no crash, and the seven sites
  are stock about 9 s after the last USB request. The open page does not redraw by itself: it
  shows SCALE and ROOT until the next key, then two blank rows that do nothing (YES, arrows,
  LEVEL) until the page is left. Reopened, it shows the stock rows only. Scale Quantizer 0.1.4 in
  the same walk shows the same screens byte for byte, so this update did not introduce it; it looks like the
  base's expiry path (not traced).

**Project, rows, pitch, MIDI.**

- A project saved with 0.1.4 reloads through PROJECT > RELOAD: scale bytes `0000008401000002`
  before and after. SAVE PROJECT writes project files byte-identical to 0.1.4's.
- SEQUENCER shows SCALE MAJOR, ROOT C, GLIDE OFF, TRACK and FOLLOW (AUDIO 8 shows FOLLOW OFF);
  YES on AUDIO 1's FOLLOW turns it OFF and ON again. The screens equal those on base 0.7.10.
- Pitch, four windows per track: with AUDIO 1 following, T1 plays 344.531 Hz and T8 365.012 Hz
  (+1 semitone); with AUDIO 1 OFF both play 365.012 Hz.
- After SAVE PROJECT and a power cycle, the rows, the settings and both pitches come back.
- MIDI UART output: three note-on/off pairs at 61 with FOLLOW OFF, three at 60 with FOLLOW ON,
  channel 2, velocity 100, no stray bytes; byte-identical to the run on base 0.7.10.

**Beside other modules.**

- FM Synth 0.1.4 as released, in both orders: the loader admits the pair without a refusal and
  ends at the same set; the seven sites are patched and the two dropped sites stay stock. FM Synth
  0.1.4 patches none of the quantizer's sites; it still declares the conflict, so the pair was not
  played. Removing the quantizer leaves FM Synth alone. Removing FM Synth in the session that kept
  it is refused (refusal 5, busy), also with FM Synth alone on a card where the quantizer was never
  installed, on this base and on 0.7.10; it does not involve this package.
- Tuner 0.1.0: both install and the self-test reports both intact. Removing the quantizer beside
  Tuner restores its seven sites and leaves Tuner whole. Removing Tuner is refused (refusal 5,
  busy), also with Tuner alone on a card where the quantizer was never installed; it does not
  involve this package. The cause is not traced, and a unit may behave differently.

**Saved module sets.** The issue reported in #1830 reproduces on base 0.7.12: removing the
quantizer rewrote `/MODWERK1.SET` from 7,680 to 512 bytes, and the file's last cluster still
links to a cluster the write marked free. Writes into a new or larger slot stay clean.

**Not run on this base:** hardware; the cost at rest of 0.1.5 (procedure step 9, a unit's);
Tuner's removal beside the quantizer (refused by the base on the emulator); the full 16-window pitch matrix and
the lock walk; FOLLOW on FM tracks; the whole catalogue set; an empty-battery cold boot;
procedure steps 8, 9, 11 and 12.

## Base 0.7.10 — 20 November 2026

Base 0.7.10 rebuilt from main `cda22b81` with the repository's base script (the six other USB
layouts skipped; package, fills, sources, binding, controller policies and base versions all equal
the committed files): identity `b1c76d06dbe7638df87831d9d6793deb0dcb7cdc169101d96627b7b05c894f9a`.
The package is unchanged: 7,038 bytes, SHA-256
`092a8a13b999d14c63df6100d84f3c5202f615120c95f3df605e8c43d3736d50`. Every result below is from
`ot_emu` built by `scripts/octatrack-emulator/build.py`, MKII panel, copied cards. No unit ran.
Sites were checked by hashing the bytes read on the running base against the stock hashes in
the packages' own site tables; the two sites 0.1.5 no longer hooks were read through 0.1.4's table.

**Test procedure on the emulator.** `npm run device:emulator -- --image MAIN.raw --emulator OT_EMU --
npm run test:procedure -- quantizer --package public/octatrack-modules/quantizer/0.1.5-experimental.mwrm`
on a development twin of 0.7.10 (`build_core.py` with the beta flags, no controller rows, plus
`--dev`; configuration `ed563610`), 95 s. Steps 1 to 4 pass with a local stand-in approval record
that is not committed. Steps 6, 7 and 10 pass on the emulator: the trial ran, 12 of 12 Part
switches, no fault logged, rolled back, inventory unchanged; in step 7 the self-test was not
answered (it asks for the transport to be stopped) and the frame checks did not run (the DSP
frames stand still on the emulator). Steps 8 and 9 are not run there by design; 11 and 12 are a
unit's.

**Install, remove, replace.**

- USB Keep: Scale Quantizer listed, all seven sites patched; `0x4004fc84` and `0x40005162` stay
  stock. Removal restores all seven and leaves all nine of 0.1.4's sites stock; the set identity
  returns to the empty set's. After a power cycle, Keep works again.
- Upgrade from a kept 0.1.4, on a card holding a project saved with 0.1.4: one inventory entry,
  and the card's newest set holds only the 0.1.5 package. After removal all nine sites are stock.
  - Old hook sites: `0x4004fc84` and `0x40005162` read stock after the upgrade, after SAVE PROJECT
    and after a power cycle.
  - FOLLOW on audio: AUDIO 1 following plays 344.531 Hz, AUDIO 8 not following 365.012 Hz
    (+1 semitone), both 365.012 Hz with AUDIO 1 OFF. FOLLOW on MIDI: three notes at 61 with
    FOLLOW OFF and three at 60 with FOLLOW ON, each with its note-off.
  - Undo: the upgrade offered as a trial over the kept 0.1.4, read during the trial (one entry,
    0.1.5's seven sites patched, the two old sites stock), then undone, brings back 0.1.4, its set
    identity and its nine patched sites byte for byte.
  - Saved settings after a reboot: scale bytes `0000008401000002`, the rows and both pitches
    come back after SAVE PROJECT and a power cycle.
- Undo of a held and of an unheld 0.1.5 trial brings back the starting inventory, set identity
  and sites; Undo of a 0.1.5 replace trial over 0.1.4 brings back 0.1.4's nine patched sites
  byte for byte.
- A set of 0.1.5 plus `device.mjs set`'s `+refuse` pair is refused at verify (refusal 3), before
  anything was applied, and nothing of it stays: inventory, set identity and sites unchanged, on
  an empty set and with 0.1.4 kept.
- A trial that expires with the quantizer's SEQUENCER rows open: no crash, and the seven sites
  are stock about 9 s after the last USB request. The open page does not redraw by itself: it
  shows SCALE and ROOT until the next key, then two blank rows that do nothing (YES, arrows,
  LEVEL) until the page is left. Reopened, it shows the stock rows only. The same walk with
  Scale Quantizer 0.1.4 in the trial shows the same screens byte for byte, so this update did not
  introduce it; it looks like the base's expiry path (not traced).

**Project, rows, pitch, MIDI.**

- A project saved with 0.1.4 reloads through PROJECT > RELOAD: scale bytes `0000008401000002`
  before and after. SAVE PROJECT writes project files byte-identical to 0.1.4's.
- SEQUENCER shows SCALE MAJOR, ROOT C, GLIDE OFF, TRACK and FOLLOW (AUDIO 8 shows FOLLOW OFF);
  YES on AUDIO 1's FOLLOW turns it OFF and ON again. The screens equal those on base 0.7.9.
- Pitch, four windows per track: with AUDIO 1 following, T1 plays 344.531 Hz and T8 365.012 Hz
  (+1 semitone); with AUDIO 1 OFF both play 365.012 Hz.
- After SAVE PROJECT and a power cycle, the rows, the settings and both pitches come back.
- MIDI UART output: three note-on/off pairs at 61 with FOLLOW OFF, three at 60 with FOLLOW ON,
  channel 2, velocity 100, no stray bytes; byte-identical to the run on base 0.7.9.

**Beside other modules.**

- FM Synth 0.1.4 as released, in both orders: the loader admits the pair without a refusal and
  ends at the same set; the seven sites are patched and the two dropped sites stay stock.
  Removing the quantizer leaves FM Synth alone. FM Synth 0.1.4 patches none of the quantizer's
  sites; it still declares the conflict, so the pair was not played. FM Synth's own removal went
  through in a later session after a power cycle; removed in the session that kept it, it is
  refused (refusal 5, busy), also with FM Synth alone on a card where the quantizer was never
  installed.
- Tuner 0.1.0: both install and the self-test reports every module intact. Removing Tuner is
  refused by base 0.7.10 (refusal 5, busy), also after a power cycle and with Tuner alone in the
  set; the set stays whole and the quantizer's sites stay patched. On a fresh card where the
  quantizer was never installed, Tuner alone is kept and its removal is refused the same way, so
  it does not involve this package. On base 0.7.9 the same removal went through. The cause is
  not traced, and a unit may behave differently.

**Saved module sets.** The issue reported in #1830 reproduces on base 0.7.10: removing the
quantizer rewrote `/MODWERK1.SET` from 7,680 to 512 bytes, and the file's last cluster still
links to a cluster the write marked free. Writes into a new or larger slot stay clean.

**Not run on this base:** hardware; Tuner's removal beside the quantizer (refused by the base on the emulator);
the full 16-window pitch matrix and the lock walk; FOLLOW on FM tracks; the whole catalogue set;
an empty-battery cold boot; procedure steps 8, 9, 11 and 12.

## Current main, base 0.7.9 — 19 November 2026

Main `2c164121` (base 0.7.9) is merged, without rebasing. The quantizer's sources are unchanged.

**Builds and checks.** The package rebuilds byte for byte: two `--check` runs reproduce all 40
committed packages, and two kept-link builds give the same 7,038 bytes, SHA-256
`092a8a13b999d14c63df6100d84f3c5202f615120c95f3df605e8c43d3736d50`. The linked object is
identical to the one verified on 15 November. The package does not bind to the base: it has no
`requiredBase`, and the base files that changed under it (`build.py`, `machine_ports.py`) do not
change its bytes. Alignment: 7 detours and 19 hooks resolve to even addresses; 363 direct
branch targets are even, no instruction sits at an odd address, and 8 indirect calls are outside
that static check. The isolated Docker build and development import pass; only source-commit
metadata and the quantizer's rows move. Native source fingerprint:
`931d9cd97feb3e46a9ac0d72581d7587980d92d0e9cd9838cc38ae479a66e8d1`.

**Emulator.** Native `ot_emu`, MKII panel, copied cards, base built from main `2c164121`:
identity `dfa438130710fea9dfac40296d1a7db79b6ba3efc45c77b043ae6d45f44d3921`. No unit ran.

- USB Keep: the inventory lists Scale Quantizer and all seven sites differ from stock.
  Removal restores the seven exact stock bytes. After a power cycle, Keep works again.
- An old-base saved set is ignored; the 0.1.5 set restores at boot.
- A project saved with 0.1.4 reloads through PROJECT > RELOAD with 0.1.5 installed: the scale
  bytes come back unchanged (`0000008401000002`: C MAJOR, AUDIO 3 and 8 and MIDI 2 not
  following). SAVE PROJECT then writes project files byte-identical to 0.1.4's.
- SEQUENCER shows SCALE MAJOR, ROOT C, GLIDE OFF, TRACK and FOLLOW. TRACK steps to AUDIO 8,
  which shows FOLLOW OFF. YES on AUDIO 1's FOLLOW turns it OFF and ON again.
- Pitch, four windows per track, same sample, Part PTCH +1: with AUDIO 1 following, T1 plays
  344.531 Hz and T8 (not following) plays 365.012 Hz, +0.9997 semitone. With AUDIO 1 set to OFF,
  both play 365.012 Hz. These match the 15 November values on the earlier base.
- After SAVE PROJECT and a power cycle, the rows, the settings and both pitches come back.
- MIDI UART output: three note-on/off pairs at 61 with FOLLOW OFF, three at 60 with FOLLOW ON
  in C MAJOR, channel 2, velocity 100, no stray bytes.
- Beside Tuner 0.1.0: both install, the self-test reports three modules intact, and removing
  Tuner leaves the quantizer's seven sites in place.
- Beside FM Synth 0.1.4 as released: the loader admits both (no refusal), and the quantizer's
  sites stay in place. FM Synth 0.1.4 still declares a conflict with `quantizer`, so the
  configurator flags this pair as a conflict; it is not a supported set and was not played.
- BlackPyramids has no released package on main, so the pair was not tested. Keep FOLLOW OFF on
  its tracks until it is.
- Self-test snapshots stay in progress (0 of 2 done, none failed), as before.

**Saved module sets.** The base rewrites `/MODWERK0.SET` or `/MODWERK1.SET` after every Keep or
removal. When the new set is shorter than the file it replaces, the file's last cluster still
links to a cluster the write marked free. This reproduced here with the removal of FM Synth,
of Tuner and of Scale Quantizer. The quantizer never writes these files; it is a base issue,
reported to the owner separately. Persistence of the quantizer's
own settings was checked through SAVE PROJECT, RELOAD and a power cycle on a card whose set files
were sound; no SAVE was run on a card with a broken set chain.

**Not run on this base:** hardware; the full 16-window pitch matrix and the lock walk (a short
four-window check per FOLLOW state replaces them); FOLLOW on FM tracks; Undo and the whole
catalogue set; an empty-battery cold boot.

## Builds and checks — 15 November 2026

The USB package first built on 13 November from main `208f05a6` is unchanged after merging
main `328f2fb5`: 7 sites (was 9), 5 stock copies (was 6), 5,852 bytes of code and data, no bss,
105 relocations and 19 hooks. Package: 7,038 bytes, SHA-256
`092a8a13b999d14c63df6100d84f3c5202f615120c95f3df605e8c43d3736d50`.
Two additional source-only rebuilds reproduce the committed bytes, following the three earlier
identical builds. Static disassembly finds all 363 direct control-flow destinations even; the
28 resolved take-hook and row-callback pointers are even and inside code. Eight indirect stock
callbacks remain outside that static claim. The strict stock-free scan finds a longest shared run of 11 non-zero bytes
(fails at 12). The catalogue-wide check reproduces all 34 packages but is red on the unchanged
SYNTIZ strict scan, whose longest non-zero run is 21 bytes.

The source-only isolated Docker build uses the pinned `modwerk-source-tools` image
`sha256:0db04819ba7c59e422ac32a5a519ba2c19760ac73f46a30bf94018d10edb7ac7`.
Development import and `--check-only --verify-existing` pass. The package metadata now names
0.1.5 and its current sources; no release approval was supplied. The POLY8 bundled-declaration
signature is corrected, and the module compatibility and package-fingerprint checks pass.
`module:doctor -- quantizer` still refuses the actual owner's 0.1.4 approval for this new version.
No 0.1.5 owner approval is fabricated, and these results are not release qualification.
The import record pins the public v2.23 quantizer files. At the owner's request, the root README
is now re-vendored byte for byte from that same revision; its earlier 38,138-byte archive did
not match its recorded revision. After the correction and merging main `fccb6d96`, the
157-file import check and all four requested-import tests pass. The actual native-source
fingerprint and 7,038-byte package are unchanged from the independently verified build.
The test version assertion changes only from 0.1.4 to 0.1.5.

## Emulator — 15 November 2026

These new runs use the default base from main, without #1272: MAIN SHA-256
`f0e8d4175eaf33ce9baf3d3ab1864944635d15c2bd5c7396a23da474e599b61f`.
All 233 recorded base inputs match main `328f2fb5`; the changes since its build are on another
machine. Native `ot_emu`, MKII panel, a disposable project and copied card images; no unit,
physical MIDI connection or hardware timing measurement. Every session takes the rig lease;
successful session completions report no player present, no guard abort and no timeout.

- USB Keep installs 0.1.5 and the inventory lists it. All seven package spans differ from
  their stock guards while installed. Removal restores all seven exact stock SHA-256 guards,
  and another Keep succeeds. Self-test snapshots, including one after a further 180-tick
  settle request, remain in progress (0 of 2 done, 1 intact, 0 failed); they are not a completed
  self-test pass.
- SEQUENCER has eight rows: the stock three, SCALE, ROOT, GLIDE, TRACK and FOLLOW. DOWN
  past FOLLOW stays there. AUDIO 8 OFF → MIDI 1 ON → AUDIO 8 OFF redraws without closing
  the page. Individual LEFT/RIGHT presses clamp TRACK at AUDIO 1 and MIDI 8, YES wraps
  MIDI 8 to AUDIO 1, and YES toggles FOLLOW. Eight SEQUENCER captures compared with an
  actual 0.1.4 installation on the same base are byte-identical as exported files (stock
  rows, SCALE, ROOT, TRACK and the saved FOLLOW states). Those earlier exports used fixed
  delays, so their equality alone does not prove completion of the renderer or complete-frame
  identity.
- With FLEX tracks 1 and 8, the same sample, Part PTCH +1 and trigs 1/5/9/13, C MAJOR
  makes both tracks play at the same pitch while both follow. With AUDIO 8 FOLLOW OFF,
  T8 plays 0.99975 semitones above T1. Effective PTCH words are `0x4000` and `0x4500`.
  This is a relative interval measurement: the inherited sample fixture has effects, and its
  measured neutral output (344.53125 Hz) is not the source WAV's 220 Hz. Initial captures
  with TSTR AUTO contained an onset followed by a decay tail and are not pitch evidence;
  the usable captures have LEN 128 and TSTR OFF.
  A later dry comparison sets both effects to NONE on T1 and T8 through the native UI.
  0.1.4 and 0.1.5 measure identically: 344.53125 Hz on both tracks with FOLLOW ON;
  344.53125 and 365.011137 Hz with AUDIO 8 OFF (0.999668 semitone). Each 300 ms window's
  DC mean is removed before measuring its 103/108 cycles. The dry output still has DC and
  differs from the 220 Hz source; the cause is unresolved, so this establishes equal relative
  pitch behavior between the versions, not absolute source-sample fidelity.
- A four-lock walk uses the displayed values +1.2, +3, 0 and +2 semitones. SCALE OFF and
  AUDIO 1 FOLLOW OFF preserve that vector; C MAJOR produces +2, +2, 0, +2 and D MAJOR
  produces +1, +2, -1, +2. Sixteen measured second-bar windows agree within 0.001 semitone,
  with at least 80 measured cycles per window. The first value is +1.2, not the historical
  +1 tie case; nearest-degree expectations follow `qz_asnap`. This is not an absolute
  sample-pitch or effect-quality measurement.
- The literal historical knob walk displays 0 → +2 → +4 → 0, with native Part bytes
  64 → 74 → 84 → 64. The first attempt at an integer-lock playback walk was an invalid
  fixture: its step 9 screen actually reads +0.2, initially misread as 0.0. Both the original
  and post-playback screenshots show +0.2. Its measured +0.20016 with SCALE OFF or FOLLOW
  OFF, and about +1 in D MAJOR, agree with that actual input. The expected-zero analysis
  remains failed and is retained, but it does not establish a quantizer defect or test the
  intended zero lock. The erroneous screenshot-verification metadata is explicitly corrected
  in the private evidence record. No expected value or tolerance was relaxed.
  One bounded completion reached a displayed 0.0 and raw byte `0x40` through the native
  C MAJOR editor, then returned SCALE to OFF without editing that value. Before playback,
  the four observed bytes were `45/4f/40/4a`. The last zero-byte read is while TRIG9 is
  held; no zero/event check follows its release before PLAY. After playback, the third
  address reads `0xff`, no third-step PTCH event is observed, and its audio holds the
  preceding step's pitch. The trace does not establish when that value disappeared.
  The unchanged four-case analysis fails: its presumed neutral reference is actually
  the preceding +3 pitch. That attempt failed to establish persistent-zero acceptance. Its cause
  could be the stock editor, module or fixture and is unresolved; the final verification
  press/release toggling the trig is a hypothesis, not a proven cause. All captures and
  failed analysis are retained. No further builder retry or changed tolerance is used.
- On a MIDI track, FUNC+DOWN is held through the popup redraw, CHROMATIC selected, and
  release returns to a responsive C3 keyboard. NOTE 61 and MIDI channel 2 are visible.
  Actual emulator UART0 output then sends three note-on/off pairs at note 61 with FOLLOW
  OFF, and three pairs at note 60 with FOLLOW ON in C MAJOR, all on channel 2 at velocity
  100. Each note-on has its matching note-off; no physical MIDI device is involved.
- An actual SAVE PROJECT completes before card flush. Both `project.work` and
  `project.strd` contain SCALE 1, ROOT 0, MIDI_SCALE_OFF 2 and AUDIO_SCALE_OFF 132
  (AUDIO 3, AUDIO 8 and MIDI 2 OFF). A fresh boot with the completed battery-RAM image
  and no posted project load restores these settings; TRACK starts at AUDIO 1.
- With an actual 0.1.4 installation, SAVE PROJECT completes with the same four scale comments.
  After USB replacement by 0.1.5, all four project/bank work and stored files remain byte-identical.
  Native PROJECT → RELOAD under the restored 0.1.5 module restores the exact settings
  `0000008401000002`, including AUDIO 3, AUDIO 8 and MIDI 2 OFF. The earlier forced project load
  during a fresh emulator boot with empty battery RAM had left those bytes zero. The explicit
  reload is the successful migration result. A bounded fresh-boot comparison using the actual
  0.1.4-saved card, empty battery RAM and the same forced project load also reads all-zero scale
  bytes under 0.1.4. Those matching cold-boot/default observations are retained; the restore/load
  order is not qualified by the successful explicit reload.

## Independent follow-up — 15 November 2026

A separate run on the same package and main-only base completes the original integer-lock
case. After release of every key and with recording off, the actual stored pitches are
69/79/64/74 (+1/+3/0/+2), all four note events are present, and SCALE is OFF. They remain intact
through all four plays. The unchanged 0.01-semitone check passes all 16 windows: SCALE OFF
[1,3,0,2], C MAJOR [0,2,0,2], T1 FOLLOW OFF [1,3,0,2], and D MAJOR [1,2,-1,2]. Maximum error is
0.000325162 semitone; native effective-pitch words agree with each measured window.

Independent USB Keep/removal restores all seven sites, and explicit reload preserves all four
0.1.4-saved project/bank files. SAVE and a fresh emulator using only the saved card and completed
battery-RAM snapshot restore the settings, four locks and four note events. Its sample FOLLOW
check passes all 16 windows (maximum error 0.000268994 semitone); actual MIDI output has three
matched note-on/off pairs at 61 with FOLLOW OFF and 60 with FOLLOW ON, channel 2, velocity 100.
These are emulator results, not physical reboot or hardware evidence. They complete the
intended acceptance case without turning either earlier failed setup into a pass or proving
why the earlier zero lock and event disappeared. The incomplete self-test and fidelity limits
below remain.

## Base 0.7.1 follow-up — 16 November 2026

Main `1737f320b334c01a9af88f33f9863d1111c1ae7d` is merged, without rebasing. This is a
bounded compatibility follow-up for the base's installed-module ON/OFF controls and saved-set
shelf, followed by its status-display patch. It does not relabel the full 15 November pitch
matrix above as tested on this base. No quantizer executable code changed in this follow-up.

**Saved-file acceptance withdrawn; submission held.** Independent file-allocation checks
found a corrupt stored project in the original SAVE/OFF sequence and reproduced a dangling
saved-slot chain in two matched controls. The observations below do not qualify persistence.
The supported file-open/truncate/close sequence and repair direction are pending on #1597.

The wrapper's initial docstring now names the actual public v2.23 source and archived root
README. On matched source and base inputs, its executable AST is identical after removing
only that initial docstring; actual before/after assembly reproduces the same 7,038-byte
package and SHA-256 above. The real native-source fingerprint changes from historical
`6d43e1316d17393b1089b88657cc8e17f97e4d1f8d1153b6ac1258341f617ed7` to
`931d9cd97feb3e46a9ac0d72581d7587980d92d0e9cd9838cc38ae479a66e8d1`.
The pinned, network-disabled source build passes with source-tree fingerprint
`a63afd6cbadfdbccae5ff1bcb3f2411f6a78203838a66157339dc10bd13962a0`.
Official development import and verification pass. Generated source assets change only their
source-commit metadata and four quantizer object-source hashes for the wrapper; dependent
import, machine-port and recipe fingerprints are refreshed. The quantizer runtime package and its recipe's image, copies and fills remain unchanged.
Initial stale-fingerprint failures are retained;
correcting those source pins clears them without changing a checker or owner approval.
The final all-package reproduction matches all 34 packages, with quantizer's strict scan at
11 bytes; the unchanged SYNTIZ package still fails at 21 bytes against the 12-byte threshold.

The complete seven-layout base 0.7 reproduction passed on main `eaae18b9`. After the reviewed
status/version-only merge, a scoped default-layout 0.7.1 reproduction matches its committed
package, fill, source, binding and browser/native output. The other six 0.7.1 layouts were not
rebuilt. The native fixture uses base identity
`c8f6cd05233a02ab95f085994651487b6db7ca1a7648f88b4974dc9224c9eaf9`, MAIN SHA-256
`c237097982e7b0d03f50f0b0608d3521c32df957fac4cf18eda374c744b4e7aa`.
These are serial native emulator sessions at normal priority under a rig lease, with copied
cards and completed battery-RAM snapshots, not hardware or empty-battery cold-boot evidence.

- An older-base saved set is reported FOREIGN. USB Keep installs 0.1.5, removal restores all
  seven exact stock guard hashes, and reinstall succeeds, but the saved-slot write has the
  allocation finding below. Native PROJECT RELOAD preserves
  all four 0.1.4-saved project/bank files byte for byte and restores `0000008401000002`, with
  the fixture's unchanged event/lock state in that bounded reload session.
- The original SAVE/OFF sequence combined a 0.1.4-derived card with battery RAM from a
  different saved session. After OFF, the 3,960-byte stored project's logical data shares
  clusters 5407 and 5408 with `MODWERK0.SET`, confirmed independently in both FAT copies.
  Cluster 20825 is only an unused chain tail. No intermediate audit separates SAVE from OFF,
  so the first damaging write is unknown; mixed histories are not a proven cause. A completed
  SAVE screen and zero flush errors do not clear the corruption.
- Two matched card/battery controls reproduce a separate invalid transition: removal shortens
  the saved slot from 7,680 to 512 bytes but leaves its first cluster pointing to a free cluster
  in both FAT copies. The original-layout control observes `5406 -> 5407 -> FREE` immediately
  after removal; re-Keep preserves it. Reading back the 512 logical bytes does not validate
  the remaining chain. The stock API, wrapper and emulator remain possible causes.
- The original mixed-history sequence observes live locks 69/79/64/74, four note events,
  C MAJOR and FOLLOW settings. The actual MODULES page shows Scale Quantizer ON;
  YES changes it to OFF, restoring all seven stock guards. Two request-40 inventory reads
  report the same OFF package and leave it inactive.
- That sequence's short paired sample check passes eight measured second-bar windows with the unchanged
  0.01-semitone tolerance: module ON gives [0,2,0,2], module OFF gives [1,3,0,2]. Maximum error
  is 0.000363677 semitone. All four locks and note events remain intact. This uses the same
  DC-removed relative-pitch method as the historical runs. It is a live relative-pitch
  observation, not an absolute-fidelity or persistence claim.
- In the matched original-layout control, SAVE moves the stored project to clusters
  15700/15701 without reusing 5407. OFF writes a valid version-2, generation-4 set and matching
  shelf containing the exact package, preserving all four immediate post-SAVE project/bank
  logical hashes. The other matched control also preserves those files through OFF; its
  preceding SAVE changes both bank files. Neither control reproduces the original logical
  project corruption. Both run in one process and do not cover the original fresh-mount
  boundary, so neither establishes the whole remove/SAVE/OFF path as safe.
- The original sequence's fresh processes observe OFF inventory and stock guards, then ON
  with all seven installed detours, live settings, locks and events. The actual status page
  shows base 0.7.1 with five rows. These saved-battery restarts come from a chain containing
  the corrupt stored project; they do not establish correct on-card project persistence.
  Independent request-40 reads on a validated matched OFF state leave its generation and
  audited files unchanged. Restart/audio/MIDI acceptance after a filesystem repair is pending.
- In the original final fresh ON restart, actual MIDI UART0 output has three matched note-on/off
  pairs at note 61 with FOLLOW OFF and three at note 60 with FOLLOW ON in C MAJOR, channel 2,
  velocity 100, with zero stray data. This is a short live MIDI observation, not a physical
  MIDI test or a saved-project acceptance pass.

The historical full pitch matrix, UI gallery, incomplete self-test, earlier failed fixtures
and unqualified items remain as recorded above and below. No full pitch or synthetic
power-cut matrix was repeated for this base follow-up. The owner approval remains unchanged.

## Current-version UI documentation — 15 November 2026

The gallery uses six actual 0.1.5 framebuffer exports: PROJECT > CONTROL with
SEQUENCER selected; SCALE MAJOR; ROOT C; GLIDE OFF; TRACK AUDIO 8 with FOLLOW OFF;
and the MIDI trig-mode popup with CHROMATIC selected. Each was visually reviewed
with its caption; the selected saved-project FOLLOW capture visibly shows OFF.
These are original 768×384 PNGs,
integer scale 6, gray palette 24/240, with no reconstructed labels or edited pixels.

`media/capture.json` records the actual capture date, source files, default-base
hash and separately installed USB-package hash. The first four images follow a
completed native LOAD PROJECT. FOLLOW and MIDI use the completed saved card and
battery-RAM restoration with no newly posted load. All use a populated disposable
synthetic project, not an empty card. The fixed emulated clock is not the capture
date. The interactive key/encoder plans and original PNG hashes are retained.

The old 0.1.4 PNGs remain at their original paths. Their actual record, manifest
media fields and rights declaration are preserved under `media/0.1.4/`;
none is relabelled. The current README, media captions and manifest now describe
0.1.5 and distinguish the older hardware reports. These retained exports used fixed
input/run delays and did not trace renderer completion. They document the visible
interface, not complete-frame pixel equivalence, hardware, audio or qualification.

## Limits at this version

Not tested yet on 0.1.5: hardware; complete timing, memory and stress qualification; every
scale, root and pitch endpoint; Static and Pickup; tempo/swing/track-speed/pattern-change
combinations; Part-copy and Part-save combinations; FM FOLLOW beside the currently released
FM Synth. Released FM Synth (0.1.2 to 0.1.4) declares a conflict, so it is not forced into this set.
The held FM chromatic-key mark issue described in the PR is a code-reading finding, not a
new capture. The first integer-lock walk had the incorrect +0.2 input described above;
the bounded completion also failed, with its cause unresolved. Both remain recorded as failures.
The independent follow-up above establishes the intended integer-lock playback case.

The 13 November #1272-base lifecycle/co-install/catalogue runs are earlier evidence on their
own base, not repeated results on this base. The MKI reports below concern 0.1.4's card build,
not this USB package. No timing or hardware result is inferred from emulator instruction counts.

# Scale Quantizer 0.1.4 testing

Version: `0.1.4-experimental`. Author source: timhastie/octatrick-modules
`8f6f564a9c42636ed4c5cc6ad314ee6b7ce69e5c` (his 2.21 line plus the TRACK / FOLLOW rows,
released with Octatrick 2.22 on top of v2.21), `quantizer/` byte for byte. The files were
vendored on 29 October from his working commit `990eff8`, whose `quantizer/` is identical to
`8f6f564`'s; the wrapper `manifest.py` docstring still names `990eff8` and is left as is,
because that file's SHA-256 is bound in the committed package records (`src/engine/assets/requested-packages.json`,
`media/capture.json`, the machine adapters). Records made on 29 October 2026 on
macOS with Node 24.21.0, Python 3.13, m68k-elf binutils 2.47, and the `modwerk-source-tools`
image `sha256:0db04819ba7c59e422ac32a5a519ba2c19760ac73f46a30bf94018d10edb7ac7` (colima).
No firmware, stock bytes, card images or raw renders are committed.

## Beside FM Synth (31 October 2026)

FM Synth 0.1.4 bundles this module's author source byte for byte (his `bb784c4`, whose `quantizer/` equals `8f6f564`'s) and declares `quantizer` in its `compatibility.conflicts`, as agreed with the owner on #555 (31 October 2026): both would patch the same sites, and a module may not hook into another module's code, rows, tables or files. This module's `conflicts` stays empty, as on main (the module whose change makes the pair collide flags it, docs/module-guides/README.md 'Who flags'); `manifest.py`'s note that FM Synth declares a conflict with this module is true. This module alone is unchanged by any of it.

## On current main (31 October 2026)

The branch was rebased onto main `00ecaf52` (#1029, #1094 and #1095 since `886098f5`; the quantizer recipe's pin of `sdk/runtime/loader/build.py` follows main's). The card image rebuilt at the rebased head (TEST3) is byte-identical to TEST2: update file `ec4b811fe6620f06eb6ba9fd23c18e996830f8fea255cf6552fdcc4d089ff808` (449,848 B), MAIN `22541cd628f8064cb6d12e81a0481b17ffad9e737fd968454ae6eb419bb735e8`, container `fcf9160d…`; the author's MKI report of 30 October 2026 (below) therefore stands for this image, and on 1 November 2026 he ran the TEST3 sheet on the same bytes (next section). The branch was then rebased onto main `4ce910bb` (1 November 2026); none of the card build's inputs changed between `00ecaf52` and `4ce910bb` (the module folder, `sdk/octabam/{platform,tools,dsp,licenses}`, the exporter, the module adapters, the package script and `build_core.py`: an empty diff), so the image is not rebuilt.

## Author-reported hardware — 1 November 2026 (TEST3)

Tim Hastie reports the Scale Quantizer 0.1.4-experimental TEST3 sheet passing on his **Octatrack MKI on 1 November 2026**; his words, one line for three sheets: "scale quantizer ... pass". TEST3 is the image above, byte for byte TEST2 (update file `ec4b811fe6620f06eb6ba9fd23c18e996830f8fea255cf6552fdcc4d089ff808`, 449,848 bytes, MAIN `22541cd628f8064cb6d12e81a0481b17ffad9e737fd968454ae6eb419bb735e8`), rebuilt on main `00ecaf52`. **Reported by the author**, not independently repeated here. `octamod.module.json` keeps `tests.hardwareStatus` `reported` and adds a `tests.gates` line; no `tests.qualification` object, for the reason given under the 30 October report.

- tested on: 2026-11-01
- tester: timhastie
- model: MKI
- summary: the TEST3 sheet's checks, all reported passing: SEQUENCER has eight rows ending in TRACK and FOLLOW and DOWN past FOLLOW does nothing; TRACK AUDIO 8 with FOLLOW OFF, then TRACK to MIDI 1 and back, reads ON and OFF as it turns without leaving the page, and TRACK stops at AUDIO 1 and MIDI 8; with the same pitched sample on T1 and T8 at PTCH +1 and trigs on 1, 5, 9 and 13, C MAJOR with AUDIO 8 FOLLOW OFF plays T1 at the root and T8 a semitone higher, and AUDIO 8 FOLLOW ON plays both the same; after SAVE and a power-cycle SCALE reads MAJOR, TRACK is back at AUDIO 1, AUDIO 8 still reads FOLLOW OFF and T8 still plays +1.
- limitations: play time and readings were not recorded; the report is the sheet's pass line. Whether the optional step (a 2.21-saved project with SCALE rows OFF) was run is not stated. A functional check of the sheet's items, not a load or stress qualification; no cycle or memory figure is measured.

## This cut: 2.21 + TRACK / FOLLOW (29 October 2026)

What changed against the v2.20 cut below:

- The sixteen per-track rows (MIDI 1..8 SCALE, AUDIO 1..8 SCALE) are two rows: TRACK
  (AUDIO 1..8, MIDI 1..8; a RAM byte of the unit, AUDIO 1 at power-on, not saved; it
  changes no sound) and FOLLOW (ON / OFF for that track, on the same battery-RAM bits
  as before). The module contributes five SEQUENCER rows (SCALE, ROOT, GLIDE, TRACK,
  FOLLOW): within the base's eight over USB, the same five on the card (tables 3 + 5,
  row-count poke 3 -> 8). The project-file lines are unchanged.
- 2.21 adds two guarded detours, `qz_panel_stage` (0x4004fc84, 16 bytes) and
  `qz_panel_commit` (0x40005162, 8 bytes), and includes `remix.inc` twice (the flags,
  then `panel_transaction.inc.s`); without FM Synth they assemble to their replays.
  The wrapper declares the two new guards (28 detours + the poke);
  `quantizer_runtime.py` writes the standalone include at both sites and calls it from
  the octabam root. The author's include enables the transaction beside SYNTH MACHINE,
  where it writes FM's engine state (`sy_state`); FM Synth bundles its own copy and
  conflicts with this module, so the wrapper gives the include a selection without FM
  Synth. Before that, the card-build object assembled for the whole requested set named
  `sy_state` and did not link alone; the card image and the USB package are the same
  either way.

Results:

- Card build (`scripts/export-composition-proofs.py --vendored-sdk --static-stock
  --modules quantizer --select quantizer:true`, private stage with the local 1.40C):
  MAIN `22541cd628f8064cb6d12e81a0481b17ffad9e737fd968454ae6eb419bb735e8` (1,116,202 B),
  update `ec4b811fe6620f06eb6ba9fd23c18e996830f8fea255cf6552fdcc4d089ff808` (449,848 B);
  rebuilt identical from the committed tree.
- USB package: the machine recipe re-captured for the new sources (6 copies, hashes
  only); `quantizer/0.1.4-experimental.mwrm` 7,210 B
  `33700b9339c0d0e619716cf6358ac83c9912c9881e30721411d2bf79897bbe04`, 19 hooks, 9
  stock-code sites; `octatrack:module-packages --check --stock`: 27 identical, rc 0.
- Card-build packages: Docker isolated build + `modules:import --development`; GNU link
  proofs refreshed in the toolchain image (7); standalone recipes' four asset pins
  refreshed.
- Emulator (ot_emu, MKII panel, a card with tracks 1 and 8 FLEX on one sine sample,
  trigs 1/5/9/13, Part PTCH +1 st): on the card
  image above, PROJECT > CONTROL > SEQUENCER lists stock's three rows, SCALE, ROOT,
  GLIDE, TRACK (AUDIO 1), FOLLOW (ON); DOWN past FOLLOW stays there. TRACK = AUDIO 8,
  FOLLOW = OFF sets bit 7 of `0x100b14eb`; turning TRACK to MIDI 1 shows FOLLOW ON in the
  first LCD read 60 ms after the turn, back to AUDIO 8 shows OFF, and TRACK turns change
  no stored byte. TRACK stops at AUDIO 1 and MIDI 8, [YES] wraps MIDI 8 to AUDIO 1, [YES]
  toggles FOLLOW. Playing in C MAJOR, track 1's PTCH word is snapped from +1 to 0 st by
  `qz_atrig` at every trig while track 8 (FOLLOW OFF) keeps +1; with AUDIO 8 FOLLOW ON
  both snap. SAVE PROJECT writes `#SEQUENCER_MIDI_SCALE_OFF=2` and
  `#SEQUENCER_AUDIO_SCALE_OFF=132` (AUDIO 3, AUDIO 8, MIDI 2 OFF) and a `project.work`
  byte-identical to the one the author's 2.21 writes for the same settings; after a power
  cycle (battery RAM in, no load posted) the bits are back and TRACK starts at AUDIO 1;
  a project saved by 2.21 with those tracks OFF loads with the same tracks OFF. The
  SEQUENCER screens of stock's rows and SCALE / ROOT / GLIDE are pixel-identical to
  2.21's. Every screen of these walks is pixel-identical to the author's standalone 2.21 +
  TRACK / FOLLOW build. The six media PNGs were re-captured from this image
  (`scripts/capture-module-ui.py`, ot_emu `07a7c08e`); only `ot-track-rows.png` changed.
- Checks: in this tree, without the owner's records: `sdk:imports:check`
  pass (82 files); `test_requested_imports` and `test_quantizer_group_participants` pass;
  lint (0 errors) and typecheck pass; `octatrack:module-packages --check --stock` 27
  identical. `modules:generate`, `modules:check` and `npm run check` stop at "quantizer:
  owner-approved update does not cover this module version" (owner record);
  `modules:compat -- quantizer` reports one problem, "POLY8 bundled quantizer declaration
  drift" (owner record `composition.json`). The vitest failures this tree adds over main
  follow from those two records (the generated catalogue documents stay at 0.1.3, so
  "Compiled module versions differ from the catalog" and the changelog test) and from the
  Analog BD composition proofs, which are not refreshed: this Mac's exporter output differs
  from the committed record also for selections without the quantizer.

## The v2.20 cut (25-27 October 2026)

The sections below record the earlier 0.1.4 cut (author v2.20 `fd18f55`, nineteen
SEQUENCER rows, card MAIN `e1c4f103...`), kept as history. Its TEST1 hardware report
applies to that image, not to this cut's.

## What changed against 0.1.3

The 2.19 source adds seven hooks to the 0.1.3 set: `qz_mknob`, `qz_mplock`,
`qz_mkey` (MIDI NOTE knob, NOTE locks and chromatic keys), `qz_mnote` (the
sequencer's MIDI note stage: NOTE, chords, TRAN, the arpeggiator), `qz_mprev`
(GRID RECORDING chord preview), `qz_atrig` (the frame builder's trig path: what
a Static or Flex track plays follows the scale) and `qz_heldmark` (the held-key
mark on the chromatic keyboard). The SEQUENCER tables grow by 19 rows (SCALE,
ROOT, GLIDE, MIDI 1..8 SCALE, AUDIO 1..8 SCALE) and the window count from 3 to
22. The settings are battery-RAM bytes: SCALE, GLIDE, ROOT, the MIDI-off bits and
the AUDIO-off bits. 0.1.3's #181 / #264 drawer fix is in the author's line since
2.13; `upstream/quantizer/quantizer.s` is no longer edited here.

## Guards

`manifest.py` declares every guard of the module in Modwerk's form,
`stock_guard(address, length, sha256)`: the 26 detours and the SEQUENCER
row-count poke, each the SHA-256 of the original 1.40C bytes at that site. The
author's manifest runs with its `stock_guard.py` stood in for, and each of its
detours and its poke gets the guard declared for its site; the wrapper checks
that the sites are exactly the declared ones and that each guard covers what
the hook overwrites (`pad_to`, or the poke's write). The 20 sites 0.1.3 also
hooks carry the same digests as on main. `sdk/imports/octabam-363861e.json`
lists the 27 guards under `stockGuards` (path `modules/quantizer/manifest.py`),
and `sdk/tests/test_requested_imports.py` matches them against the file.

A clean checkout without firmware therefore declares the real guards. The USB
package rebuilds identical with and without the developer's OS, and POLY8's
seam guards for `qz_octkey` and `qz_octnum` match (no seam drift).

The vendored `upstream/quantizer/manifest.py` is the author's v2.20 file byte
for byte. It names no stock bytes: each of its 26 detours and its poke takes
`stock_guard(site, length)`, which his `stock_guard.py` would read from the
build's MAIN OS section. The wrapper stands in for that reader while the
manifest loads and answers each site with the guard declared above. Re-vendored
from v2.19, and again from `7cca7a2` and `fd18f55`, the declaration is unchanged: the same sites,
lengths, units, tables and `module_signature` (`80c6db12...`).

## Card build (native, macOS)

`scripts/export-composition-proofs.py --vendored-sdk --static-stock --modules quantizer
--select quantizer:true` on a private stage of this checkout (the local 1.40C beside
it, outside Git), menus from `defaultChoosers(['quantizer'], true)`:

- 26 detours placed (qz_boot and qz_defaults into the ROM core), the three SEQUENCER
  tables grown 3 + 19, the window count poke; ROM units 204 + 45 + 6 = 255 bytes.
- MAIN image `e1c4f1036f88644a85f02b9009cd915a41c62c04a06c5ad7fd9902a172c8e412`
  (1,116,117 bytes); update file
  `f33e20bf7da813bc55e5135e86b25346de86271a1d020fa7f289673b4452d524` (449,836 bytes).
- Rebuilt from commit `ae5a5ef0` (after the guard change), from a fresh clone at
  `193d7877` (the v2.20 files at `a0e8df4`) and from a fresh clone at `ce285c1b` (the
  files at `7cca7a2`) and from a fresh clone at `3a01cc1b` (the files at `fd18f55`): both
files identical each time, runtime ELF `a51a75e3...`.

## Author-reported hardware — 30 October 2026 (TEST2)

Tim Hastie reports every item of the Scale Quantizer 0.1.4-experimental TEST2 sheet working,
tested on an **Octatrack MKI, OS 1.40C, on 30 October 2026**: in his words, "passed all
checks". The image is the one above: update file
`ec4b811fe6620f06eb6ba9fd23c18e996830f8fea255cf6552fdcc4d089ff808` (449,848 bytes), MAIN
`22541cd628f8064cb6d12e81a0481b17ffad9e737fd968454ae6eb419bb735e8`. **Reported by the author**,
not independently repeated here. The same facts are in `octamod.module.json`
(`tests.hardwareStatus` `reported`, a `tests.gates` line); no `tests.qualification` object is
added, because the contract wants worst-case cycles and exact memory beside the hardware block
and this cut measures neither.

- tested on: 2026-10-30
- tester: timhastie
- model: MKI
- summary: every item of the sheet worked. SEQUENCER has eight rows ending in TRACK and FOLLOW
  and DOWN past FOLLOW does nothing; TRACK AUDIO 8 with FOLLOW OFF, then TRACK to MIDI 1 and
  back, reads ON and OFF as it turns without leaving the page, and TRACK stops at AUDIO 1 and
  MIDI 8; with the same pitched sample on T1 and T8 at PTCH +1 and trigs on 1, 5, 9 and 13,
  C MAJOR with AUDIO 8 FOLLOW OFF plays T1 at the root and T8 a semitone higher, and AUDIO 8
  FOLLOW ON plays both the same; after SAVE and a power-cycle SCALE reads MAJOR, TRACK is back
  at AUDIO 1, AUDIO 8 still reads FOLLOW OFF and T8 still plays +1.
- limitations: play time and the MIDI gear used were not recorded; whether the optional step
  (a 2.21-saved project with SCALE rows OFF) was run is not stated. A functional check of the
  sheet's items, not a load or stress qualification; no cycle or memory figure is measured.

## Author-reported hardware — 26 October 2026

Tim Hastie reports PASS for every item on the Scale Quantizer 0.1.4-experimental
TEST1 hardware sheet, tested on an **Octatrack MKI, OS 1.40C, on 26 October 2026**.
This is **reported by the author**; it has not been independently repeated here. The reported checks include:

- Switching MAJOR/MINOR moves the playing PTCH locks with the scale and restores
  them when switching back.
- All nineteen SCALE rows appear on SEQUENCER.

The tested update file is
`f33e20bf7da813bc55e5135e86b25346de86271a1d020fa7f289673b4452d524`
(449,836 bytes), with MAIN image
`e1c4f1036f88644a85f02b9009cd915a41c62c04a06c5ad7fd9902a172c8e412`
(1,116,117 bytes). `QZR/RECORD_QZR.txt` records the clean native build at
`193d787795465bd7d93b05a1f6e7e7c9a55525aa`; the card-build section above records
later byte-identical rebuilds. This hardware report is bound to those complete
image identities, not a claim that the current branch HEAD was tested on hardware.
The existing `tests.evidenceRevision` remains the revision of the historical
software evidence.

The report does not supply a test duration, project/track load, maximum-instance
or stress measurements, ColdFire cycle measurements, or complete memory bounds.
It does not establish USB hardware behavior. `tests.hardwareStatus` is `reported`;
full qualification and the owner approvals listed below remain outstanding.

## Card-build packages (Docker)

From the committed tree at `ac8faff8`: `scripts/build-modules-isolated.sh . <new dir>
<image ID>` (no network, no firmware), then `npm run modules:import -- <dir>/packages
--development`. The import is commit `ae5a5ef0`: the quantizer's requested packages at
0.1.4 and the new source identity in every asset file. After the v2.20 files the same
two steps from `92100a66` give commit `a15865d1`: no compiled object changes, only the
source identity (`sourceCommit`, `sourceTreeSha256` and the source pins). After the
`7cca7a2` files, the same two steps from `e7bb02ae` give commit `c8480276`, and after the
`fd18f55` files the same two steps from `9cd357db` give commit `3496d816`: again only
the source identity (`9cd357db` changes the wrapper's docstring pin, so its digest moves
in `requested-packages.json`).

Three records follow the import (commit `193d7877`; refreshed again in `ce285c1b` after the
`7cca7a2` files and in `3a01cc1b` after the `fd18f55` files, each time: the link proofs come out identical, the Analog BD record changes only
in its header's `moduleSourceTreeSha256` with all 212 proofs identical, and the four
standalone pins follow the import again; `verify-analog-bd-native.mjs` passes again):

- `src/engine/assets/requested-link-proofs.json`: `scripts/export-requested-link-proofs.py`
  in the toolchain image (no firmware). The four proofs with the quantizer take
  0.1.4's object; the other eleven are unchanged.
- `src/engine/assets/analog-bd-composition-proofs.json`: `scripts/export-composition-proofs.py
  --suite analog-bd --static-stock --vendored-sdk` on the developer's 1.40C, six shards
  merged in the suite's order. The 28 selections with the quantizer change (26 images,
  2 refusals that now stop at a different fit), the other 184 are identical, no
  selection flips between built and refused, and the header's `moduleSourceTreeSha256`
  follows `module-build.json`. `scripts/verify-analog-bd-native.mjs` passes: 162 native
  OS and GNU bootloader comparisons, 50 matching refusals, 6 complete firmware round
  trips.
- `sdk/machines/octatrack/module-adapters/standalone-recipes.json`: Tape Echo's and
  Euclid's pins of `dsp-packages.json`, `descriptor-recipes.json`, `menu-recipes.json`
  and `rom-packages.json`, the four files the import rewrites; then
  `octatrack:module-packages -- --check` prints every package identical.

## USB package

`sdk/runtime/loader/build.py --octabam-machine quantizer` through
`machine_ports.effective()` and `quantizer_runtime.port()`: 18 take events and the
`ot_sequencer_rows` contribution (19 hooks), 7 stock-code sites, 6,084 bytes of
code and data, 131 relocations, recipe in `machine-recipes.json` (5 copies, 0 fills);
strict stock-free scan: longest run shared with stock 11 non-zero bytes (fails at 12).
Package `quantizer/0.1.4-experimental.mwrm`: 7,374 bytes,
`bfcbacf27c9d938f080359116c13881bf52bd77b720f74e212a083809732c3a7`. After the guard
change, after the v2.20 files and after the `7cca7a2` and `fd18f55` files, it rebuilds identical
without any OS file (and with it). The five machine recipes re-pin `machine-ports.json`, and the quantizer's recipe the
wrapper and the two v2.20 files; all five packages rebuild identical.

Over USB the base shows stock's three SEQUENCER rows and eight contributed rows
(`events.json` room, `SEQ_ROWS 11` in `machine_registry.c`): SCALE, ROOT, GLIDE and
MIDI 1..5 SCALE appear; MIDI 6..8 SCALE and AUDIO 1..8 SCALE stay ON and cannot be
reached there. Card builds show all nineteen rows.

## Emulator (ot_emu `07a7c08e`, MKII panel)

On the card build's MAIN image above (`e1c4f103...`, the same bytes before and after
the guard change and the v2.20 files):

- **The rows** (25 October 2026, the disposable SYTEST project, card read-only): from
  PROJECT > CONTROL > SEQUENCER one DOWN at a time, all nineteen rows draw and scroll in
  order: SCALE (OFF), ROOT (C), GLIDE (OFF), MIDI 1..8 SCALE (ON), AUDIO 1..8 SCALE
  (ON); AUDIO 8 SCALE is last and a further DOWN stays on it.
- **Menu and knob** (same project): LEVEL sets SCALE to MAJOR; on a Flex track PTCH
  0 steps to +2 and +4 semitones (Part byte 64, 74, 84) through `qz_knob`; on AUDIO 1
  SCALE, LEVEL left sets OFF; the MIDI trig-mode popup opens and closes, CHROMATIC on a
  MIDI track reads `C 3` and the panel stays responsive.
- **Recorded notes follow the scale** (a Flex sine track, PTCH locks +1, +3, 0, +2 on
  steps 1, 5, 9, 13; pitch by zero crossings over each step):

  | Setting | Steps 1, 5, 9, 13 (semitones) |
  | --- | --- |
  | SCALE OFF | +1, +3, 0, +2 |
  | MAJOR, ROOT C | 0, +2, 0, +2 |
  | MAJOR, ROOT C, AUDIO 2 SCALE OFF | +1, +3, 0, +2 |
  | MAJOR, ROOT D | +1, +2, -1, +2 |

  Every value is the nearest scale degree, ties to the lower, and the stored locks
  still read +1, +3, 0, +2 afterwards. `qz_atrig` runs on every trig. The first trig
  after PLAY in the SCALE OFF run read the Part's 0 instead of its +1 lock; that run is
  the stock path, so the table uses the second bar.
- **UI captures**: `scripts/capture-module-ui.py` with an empty scratch card and the plan
  in [media/capture.json](media/capture.json). The five screens 0.1.3 also shows are
  pixel-identical; `ot-track-rows.png` is new. `capture.json` names the wrapper and the
  v2.19 upstream files as they were when the captures were taken (wrapper `014b9038...`);
  the image it names is the one this version builds.

## Checks on this branch

Two passes on commit `193d7877`, each from a fresh clone of this branch with `npm ci`,
`origin/main` = `98f17ed6`, 25 October 2026: first without any OS file (as CI runs),
then with the developer's 1.40C MAIN OS in `sdk/octabam/out/raw/` and the Elekloader
and octabam tool checkouts named by `ELEKLOADER_UPSTREAM`, `MODWERK_UPSTREAM` and
`OCTABAM_NATIVE`. One pass each; nothing was changed between steps.

Pass in both: `licenses:check`, `machines:check`, `elekloader:check`,
`licenses:generate` and `machines:generate` (no diff), the module changelogs,
`sdk:imports:check` (82 files), `lint`, `typecheck`, and
`npm run octatrack:module-packages -- --check` (with the OS also `--stock`): all 25
packages print `identical` (the quantizer `bfcbacf27c9d938f`, Tape Echo, Euclid and
Analog BD included; Play Modes is kept by its declared lag), and with the OS every
strict scan is at most 11 non-zero bytes.

Docker (the toolchain image above), as the module PR workflow runs it: the isolated
package build from the clean clone, the upload controller compile, and
`import-module-build.mjs --development --check-only --verify-existing` (passes: the
fresh build reproduces the committed packages, provenance aside).

Stop in both, for the owner:

- `npm run check -- --base origin/main` and `modules:check -- --base origin/main` stop at
  "quantizer: owner-approved update does not cover this module version": the approval
  record names 0.1.3. This version's native source (`moduleNativeSourceSha256`) was
  `b06f49f3b02d8db5e0d717db05968bd1d3762f99911d7182e1243cad3a3a38a0` at `193d7877`; at `3a01cc1b`
  it is `729c3fa443566c26c70a7bca585ecdd38b1548b1f74e946acde263dc739413e3` (the wrapper's docstring pin moved).
- `modules:generate` stops at the same record, so the module media are not generated and
  `build:bundle` stops at the first missing media file.
- `modules:compat` (also `-- quantizer`): one problem, "whole set: composition: POLY8
  bundled quantizer declaration drift". `composition.json` holds the signature of 0.1.3's
  declaration (`f9b186d8...`); this version's is `80c6db12...`. No seam drift, no byte
  overlap, no room problem (`ot_machines` full, not used by this module).
- `modules:pairs` stops on the same drift.
- `npm run module:verify -- quantizer --os <1.40C>` (toolchain image, `--jobs 6`): the
  native side builds the first selections (18 here: 16 built, the quantizer alone
  1,116,117 bytes, and the two beside FM Synth refused by their conflict), then stops on
  the same POLY8 drift; no record is written. How many selections report before that
  stop varies from run to run, even at the same `--jobs 6` (18 here, 37 in a verifier's
  run at `95d9d074`, 9 at `ce285c1b`, 18 in a verifier's run at `54c683c3`, 36 at `3a01cc1b`);
  only the stop at the drift is stable.

`npm run test`: without the OS 2,565 of 2,602 pass, with it 2,566. The failures are
`module-pages` 33 (the media `modules:generate` did not write), `module-qualification` 1
(the approval record), `native-comparisons` 1 (the record is 0.1.3's) and `module-doctor`
1 (its lines below); without the OS also `module-publication` 1, its 15-second timeout.

`npm run sdk:check`: without the OS, 450 tests, 5 failures and 4 errors; with it, 458
tests, 5 failures, 1 error and 20 skips. The five failures and one error are the POLY8
drift (the every-combination gate with quantizer, synth and poly8; the repository
gate; `test_fm_normalizes_only_its_exact_redundant_quantizer`). The other three errors
without the OS are the Elekloader checkout missing from its default path.
`test_quantizer_group_participants` and `test_requested_imports` pass.

`npm run module:doctor -- quantizer`: catalogue entry, library, category guide,
thumbnail, packages ("compiled into the committed packages at 0.1.4-experimental") and
declaration checks pass; module rules (the approval record), native comparison (0.1.3's
record) and cross-compatibility (the drift) do not.

Re-run at `3a01cc1b` (the `fd18f55` files and the records after them; the commit after
it changes only this file), one pass from a fresh clone with the developer's OS and the
Elekloader and octabam checkouts, Docker included, 25 October 2026: the same results as
the pass with the OS above, apart from the known 15-second `module-publication` timeout,
which hit this time (vitest 2,565 of 2,602: the same 36 and that one). `sdk:check` 458
tests, 5 failures, 1 error, 20 skips, `modules:compat` the one drift, the USB check 25
identical (the quantizer `bfcbacf27c9d938f`; strict scans at most 11), the isolated build,
the upload controller compile and `import-module-build.mjs --development --check-only
--verify-existing` pass, and `module:verify` stops at the drift (36 reported: 34 built, 2
refused beside synth). The earlier re-run at `ce285c1b` (the `7cca7a2` files) gave the same
results without the timeout.

## Beside FM Synth

FM Synth bundles its own copy of this quantizer (labels `fm_*`) and lists
`quantizer` in `compatibility.conflicts` (above); the declaration ledger refuses the
two together, so a build selects one. Over USB both ports subscribe the same 18 take
events (FM at 40, Scale Quantizer at 50) and contribute rows with the same labels,
and the keyed table shows one set. With 2.19 sources on both sides, FM's bundled copy
and this module would both patch the seven sites that have no event (`qz_mknob`,
`qz_mplock`, `qz_mkey`, `qz_mnote`, `qz_atrig`, `qz_mprev`, `qz_heldmark`), and the
base would refuse the second package. FM Synth on main is still 0.1.2 (2.9 sources),
so nothing meets there today.

## Open

- The 30 October 2026 MKI report of TEST2 and the 1 November 2026 MKI report of TEST3 (the
  same bytes) are the author's own (above): not independently repeated; play time, readings
  and MIDI gear not recorded.
- Owner: the approval record for 0.1.4 and POLY8's composition signature; then
  `module:verify`, `modules:pairs -- --write` and `modules:generate`.
- `src/engine/assets/analog-bd-composition-proofs.json` is not refreshed (see the checks
  above); it needs the reference toolchain's run.
- Base: side-by-side USB installs with a 2.19-or-later FM Synth need events at the nine
  guarded sites.

## Historical evidence

0.1.3 (11 October 2026) repaired the standalone MIDI trig-mode popup (#181); its
record is in this file's history. Earlier versions pinned octatrick-modules v2.9.
