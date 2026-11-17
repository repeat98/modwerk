# Chord Arp testing

## Release build

QH17 is the release build of Chord Arp 0.1.0-experimental for Digitakt II OS 1.17. The isolated toolchain (`scripts/build-elemod-isolated.sh`, `modwerk-source-tools` image `dd9a6fc89fce…`) built it from commit `451b89bf`. The exported package `sdk/imports/packages/chord-arp/chord-arp-0.1.0-experimental-os1.17.elemod` has SHA-256 `376ef286e47c7c2ad4402321b235913d6ad8a08898a7b8ec2d2519857b4d9e81`. Linked with the core 1.1 base package (SHA-256 `e88273edd8caf822fd33b0d16d8fd14530781d296496b6c9b650aaa0eee8b005`) and stock OS 1.17, it gives image SHA-256 `62169804e750f06fc81900a152a69f5b0a0c679ed4ff1a65a77bef293d3f44f2`. The browser builder reproduced that image byte for byte. The host pitch and lock tests pass.

On 2026-11-17, Claptom-music reported three hardware passes on QH17 on a Digitakt II running that exact image:

1. On the Arp page, turning LO from AUTO showed LO −1 and HI +2 and kept the full major chord. After pressing C, turning HI from AUTO showed HI +3 and LO 0. The same LO edit held in lock mode on trig 1.
2. With GRV, SPAN on, LEN 3 and PULS 1, a single trig on step 2 of an eight-step pattern played on steps 2, 5 and 8. Changing DIV to 1/32 and back during playback kept the hits counted from step 2.
3. First-step PLAY, STOP with no hanging notes, and one trig lock passed. After Save Project and a power cycle, ARP was still on and the lock was still there.

QH17 has not run in the Digikit emulator. Its module source is the source of QG17, a local build made with a different compiler that passed the same three tests on hardware.

### Beside other modules

Both images below link the QH17 package with base `e88273ed` and stock OS 1.17. They are local test images, not committed.

- **Track Names: pass.** Image SHA-256 `41fe9e105deece52a6244a433452432dedc76da64ced05546b5b795511e7db01` adds Track Names 0.1.3-experimental. On 2026-11-17, Claptom-music reported that a renamed track 2 showed its name on Internal Mixer 2/5, Chord Arp opened on that track and played its lock, and after Save Project and a power cycle the name, ARP ON and the lock were all still there.
- **Euclidean Scale: fail on recall.** Image SHA-256 `d0130bebef53acb22f5f0f0b4e466ca712f20282c15efc6511f160662c825349` adds Euclidean Scale 0.2.0-experimental and Track Names. Euclidean Scale worked once the scratch pattern had a scale set. After Save Project and a power cycle, Chord Arp's ARP switches came back OFF, and its locked track played single stock notes. The cause is in the base, not the module. Core kit data (`KIT_PAD` 0x573e, 194 bytes) covers the last 48 bytes of each 0x5800-byte kit record, where the project archive keeps its chunks. Core kit data clears its whole area when it saves, so with any kit-data module installed the archive is lost. Chord Arp alone keeps its settings because nothing else writes there. A separate base fix will address it.

## Hardware results on earlier builds

All of these were reported by Claptom-music on a Digitakt II running the named build.

- **QG17** (2026-11-17): LO and HI leave AUTO with the full voicing, in lock mode too. GRV keeps the rhythm anchored to its source trig when DIV changes during SPAN. First-step PLAY, STOP, a trig lock, and ARP and the lock after save and power cycle all passed.
- **QF17**: both ARP switches and a trig lock on each track survived a cold boot after Save Project.
- **QE17**: multi-trig lock editing and clearing.
- **QC17**: track selection, swing and groove, and playback from the built-in Euclidean sequencer.
- **QB17**: save and reload, and official OS 1.17 reopening a project saved with Chord Arp, with both patterns intact.
- **U117**: early and late microtiming, swing with repeats, Save Project and reload, all four RESET modes, ROOT locks over stock NOTE, and deleting a locked trig during LATCH.
- **X117 and Y117**: built-in Euclidean hits, alone and with Euclidean Scale installed.

## Not tested

- QH17 in the Digikit emulator.
- On QH17 hardware: official OS 1.17 reopening a saved project (last passed on QB17), multi-trig lock editing (QE17), track selection and the built-in Euclidean sequencer (QC17), microtiming and RESET modes (U117).
- The clipped-hit note-order fix has no dedicated test. Hardware runs on QG17 and QH17 covered normal note order.
- Save and reload beside Euclidean Scale with the base fix. On base `e88273ed` it fails, as described above.
- MIDI tracks. They are outside the module's audio-track scope.

## Earlier trial builds

Digikit is Modwerk's Digitakt II emulator. Every Digikit result in this section is an emulator run. Only results the tester reported from a Digitakt II are hardware results.

### QG17 local test build

QG17 is a local test build with three playback fixes: leaving AUTO on LO or HI starts from a range that holds the whole voicing across the OCT spread, a hit clipped out of its step keeps its place in the note order, and GRV and ALL keep the rhythm anchored to the source trig when DIV changes while a phrase spans empty steps. It was built on Windows with m68k-elf-gcc 13.1.0 and elekloader against base package SHA-256 e88273edd8caf822fd33b0d16d8fd14530781d296496b6c9b650aaa0eee8b005. Its SYX SHA-256 is c4b31c316c548eebbff878bec5fc9546eadc4a47a81e6d09b74f6b3df426f072. The same tools relinked the QF17 release package to QF17's exact SHA-256. QG17's module code is not the isolated builder's output, so its package is not the release package. Host pitch and lock tests passed, and the edited sources compiled with warnings as errors. Digikit (emulator) was not run. On 2026-11-17, Claptom-music reported three hardware passes on QG17. First, turning LO from AUTO showed LO −1 and HI +2 and kept the full major chord, turning HI from AUTO showed HI +3 and LO 0, and the same held in lock mode. Second, with GRV and SPAN and a single trig on step 2, changing DIV during playback kept the hits counted from step 2. Third, first-step PLAY, STOP, a trig lock, and the ARP switch and lock after save and power cycle all passed. The clipped-hit order fix has no dedicated hardware check.

### QF17 release candidate

QF17 was the release candidate before QH17, for Digitakt II OS 1.17. Its SYX SHA-256 is f8406f34dd18bed623db0d076062ac2ae2b1fe774b5525e6e6f48c5942f5f721. It uses the catalog base package SHA-256 e88273edd8caf822fd33b0d16d8fd14530781d296496b6c9b650aaa0eee8b005. The release package SHA-256 is c8f810a10f05e74d7e357582a76ee5b9ce50ba92890ae1c25c1e0b3af8623a27. The catalog category is Playback and the browser builder reproduced the exact test image. On hardware, both ARP switches and the checked trig lock on each track survived a power cycle after Save Project. In Digikit (emulator), an explicit load restored both track settings and all 32 locks.

### QE17 multi-trig candidate

QE17 used the same Chord Arp module package on the previous core. The Chord Arp package SHA-256 is 378fc77fc08928de4af6b6638b5bd5549c62309b54273a26fbfa64f97736e5f0. Native and browser SYX output matched at SHA-256 17ce2db034eca06950836a8fff749bfc7c425b2354b0cf50b749d57e18c2a747 on the same base as QD17. Digikit (emulator) applied a shared TYPE to two held active trigs, skipped an inactive trig, edited just the remaining held trig after release, and cleared both locks together. The project fixture still restored both track settings and all 32 locks. On 2026-11-16, Claptom-music reported three hardware passes on QE17: applying the same TYPE lock to two held active trigs, editing only the remaining held trig after releasing the other, and clearing both TYPE locks together. The 32-lock save and reload result above is from Digikit (emulator). On the physical unit, the tester reported ARP off during the 32-lock reload check. Explicitly loading the saved project restored ARP. On QF17 (SYX SHA-256 f8406f34dd18bed623db0d076062ac2ae2b1fe774b5525e6e6f48c5942f5f721, base SHA-256 e88273edd8caf822fd33b0d16d8fd14530781d296496b6c9b650aaa0eee8b005), the Digikit (emulator) panel Save Project updated the archive in the startup project buffer. The same save left that buffer unchanged on QE17. Claptom-music reported a full QF17 hardware pass: after saving again and power cycling, both ARP switches and the checked lock on each track were present before using Load Project.

### QD17 32-lock candidate

QD17 was the preceding release candidate for Digitakt II OS 1.17. Two isolated builds reproduced Chord Arp package SHA-256 a3ecd4ad8f6b16cbf67345cd037bb5906426191766c627fecfe0e8969e6b4c9d. It uses the same core package as QC17. The native and browser SYX files matched with SHA-256 5450b7be5cdb4fd44142c686faf739e177fb4ff99f48d3f9404f71b9c99c2d28. The host test accepted 32 locks and refused the 33rd. Digikit (emulator) restored both track settings and all 32 locks on save and reload. Physical testing of QD17 is pending.

### QC17 compact archive candidate

QC17 was the preceding candidate for Digitakt II OS 1.17. Two isolated builds reproduced Chord Arp package SHA-256 fa48f12af8b3e09ced5e66a09d58107ae3332dbeca99a49efa0673bc97fdeae0. It links with core 1.1 package SHA-256 ea66a96f64926db4eab2790427afd2e8cee9d7189ce95d19ef2ed4c5cb3d2047. The native and browser engines produced identical SYX output, SHA-256 3f1bf67f05d81a7d9065285ca6475e17e03d47c4e2d62bbb93979eb290cd27b8. Digikit (emulator) completed the swung fast playback fixture and restored two track settings and all eight trig locks through the project serializer and loader. On hardware, track selection, swing and groove, and built-in Euclidean playback passed. The tester confirmed the eight-lock limit and asked for a higher cap. Project reload and stock OS reopen were not confirmed on QC17.

### QB17 package

QB17 used Chord Arp package SHA-256 6c794421fbb942b7ac257d10ef9bb5f941c4b01c7800ade32d4ba937e39e6919. Claptom-music reported that the arp enable state and trig lock survived a save and reload, and official OS 1.17 reopened the project with both patterns intact. See the QB17 report for the core and image hashes.

### Pitch engine

On Windows, GCC 16.2.0 compiled `src/arp.c` and `tests/arp_test.c` as C11 with `-Wall -Wextra -Werror`. The test executable passed all assertions. It covers both bounce directions, the other note orders, extended voicing, duplicate pitches, signed root-relative bounds, and a range with no playable notes. Rhythm tests cover lengths 1–32, all nonzero pulse counts, positive and negative rotation, hit order across the loop, and repeat indexing.

Host gate assertions passed for split deadlines, full and partial gates, wraparound, and rejection of invalid or too-short windows.

Host assertions also passed for replacement of built-in chord extensions, groove depth and velocity limits, and the combined chord-to-gate path across repeats and rests. GCC 13.1.0 compiled the pitch and rhythm engine for ColdFire 54455 with warnings treated as errors.

### Firmware

A private Digikit (emulator) `d6de4d0` diagnostic linked the same C engine with a read-only stock-grid subscriber. The OS 1.17 image SHA-256 was `570640af06a9fa642badb5c7515bb911df98da467720e25a326d6f0fe1010190`. At 1/32 division it produced 114 checked requests on the swung 2× fixture and 60 on the straight 1× fixture. An independent calculation matched all pitches, velocities, gate endpoints and onsets. The diagnostic did not submit these requests to the stock queue.

The separate panel preview image SHA-256 was `895bf8d7f483425a148128548c0672100d69f17d0f561d17894c826d052cc0e0`. Digikit (emulator) opened all four pages through stock SETTINGS and returned to SETTINGS on NO. The Arp page showed Down–Up, LO −1 and HI +2. Pressing C returned both bounds to AUTO. Reducing LEN to 11 also reduced PULS to 11. The Groove page showed Push and a timing depth of 30 after the encoder edits.

The local A117 trial image SHA-256 is `cf4bff9b1ed97749dea6a6f1a8669d7fdc7b2c4a102af10774178326833f9c28`. In Digikit (emulator), panel-entered trigs played from the first PLAY step and on the next loop without changing the test pattern in memory. Down–Up on C5 minor produced G5, E♭5 and C5. LO and HI at zero produced only C5. The disabled control preserved the two stock trigs and their durations. Two tracks played independent major and minor phrases at the same deadlines.

The same image passed the 1/32 repeat fixture, an empty rhythm pulse, groove timing and velocity, swung 2× track timing, live tempo nudging, eight STOP and PLAY cycles, a simulated project-generation change, mute and unmute, switching to an empty pattern, and both in-panel FUNC shortcuts. The checks compared stock queue and DSP packet captures. A host test covered 65,536 trial windows with maximum repeats, full gate, groove and swing across all eight trial divisions. Hardware remains untested.

### A117 hardware report

Claptom-music reported booting the private PR #1365 trial on Digitakt II on 2026-11-09. The tested image SHA-256 was `64a9d9c79d244723bc99eddc02e84333dbed6d12a3cf9766e8952d2b03bcbd03`.

- Panel and pitch tests 1–6 passed. The later report explicitly passed test 6. LO and HI clamped against each other, and pressing C or D restored AUTO. The tester requested slower encoder response.
- Timing tests 7–11 passed. Test 12 failed. After switching to an empty pattern for one full loop and returning, the arp played only the root.
- Test 13 passed for explicit note and velocity. Moving a trig off-grid changed the heard note while it stayed in scale. The intended microtiming behavior and the MIDI and stock Euclidean subcases were not confirmed separately.
- Project reload, the 16-track pressure test, and power cycling passed. The tester reported no freezes during the 16-track run.

### L117 step-lock trial

Two isolated builds with GCC 16.2.0 and binutils 2.47 produced identical L117 images, SHA-256 `d3e9c923100f30d0e5c954a8336c6af2b940d881c0a767a9e5e227e1c39295b6`. The base package SHA-256 was `d9f41cceebe7312f8175a16bea211b4129558336c04ac5d7771ab9881c20adc0`.

Digikit (emulator) confirmed independent chord and direction locks on the first PLAY trig and on step 5. Clearing the direction retained the chord lock. Clearing the step restored track settings. RECORD and trig entry kept the panel visible and created an audible stock trig. The same previously held trig could be removed from the stock panel on the first press.

The exact image arpeggiated both source trigs on the first loop after returning from the empty pattern. The microtimed source kept its shifted stock note. Bypass, root-only range, 2× swing, mute, rhythm rests, two tracks and repeated STOP and PLAY also passed. Host checks covered lock isolation, capacity, clearing, reset and 65,536 timing windows.

On Digitakt II, L117 booted and passed tests 2–4, 6 and 7. Test 1 failed on encoder precision across the panel, and ORDER, LO, HI and GATE did not respond while a trig was held during that test. In test 5, PAGE alone left the panel even though locking and clearing worked. TRK also left the panel, and trig presses could select a stock track outside RECORD. In test 8, changing swing affected step 5's repeats and gate, and adding microtiming changed its octave. In test 9, all arp switches returned to OFF after reloading the project.

### M117 encoder trial

Two isolated builds produced the same private image, SHA-256 `73a1fff3ba3649d84444019443e4a4653d5badb353bc929f2ac9aa3702b6d249`. Digikit (emulator) verified that eight same-direction raw counts made one edit, a raw delta of 30 made one edit, reversing discarded a partial movement, and changing pages cleared pending movement. In FUNC + PAGE lock mode, ORDER, LO, HI and GATE were written to trig 5 while its track settings stayed unchanged. Locked and cleared phrases played with matching releases, and RECORD and trig entry kept the panel visible. Physical encoder feel is pending.

A second Digikit (emulator) run checked the threshold and the one-step cap individually on all 20 rotary controls across CHORD, ARP, RHYTHM and GROOVE, including ARP on/off and TRACK. It repeated the checks on all 18 controls available when holding trig 5 in lock mode and confirmed that the two track-only controls were ignored during that edit.

On Digitakt II, M117 test 1 partially passed. The incremental baseline felt good, and the tester requested stock response for wider ranges. Tests 2, 4 and 5 passed. Test 3 passed on active trigs and failed on inactive trig 4, which accepted a lock. The tester also reported that buttons besides NO could still leave the panel.

### N117 panel trial

Two isolated builds produced the same private image, SHA-256 `7b7628b4eb6ee305cdc7548455abc1ac64b301beed9f1f58c20a1be2b47024ad`. Digikit (emulator) verified the stock filter and its UI tick for GATE, ROT, TIME and ACCNT. A held active trig used the same filter for its GATE lock, and a held empty trig created no lock or track edit. The discrete threshold passed on the held active trig. PAGE, TRK, parameter keys and non-recording trig keys stayed in the panel. The native RECORD path added a note on the expected track, PAGE advanced the lock bank, and NO cleared the active step while held and closed the panel after release. Three DSP runs matched the expected pitches and releases for locked playback, cleared playback and stock trig entry.

On Digitakt II, N117 passed the encoder and panel-key checks. The lock check failed because active trig 5 showed NO NOTE TRIG and rejected edits. Digikit (emulator) reproduced the symptom with a stock note on A02 track 3 while Chord Arp opened on track 1. Selecting track 3 with H allowed the lock in that fixture.

### P117 active-track trial

Two isolated builds produced the same private image, SHA-256 `9bbf3ee7202a782f55170c397d03b2f5f132efa50288520aa226d4e2864f777f`. Digikit (emulator) opened Chord Arp on stock-selected track 3 in A02. Trig 5 on lock page 1 remained empty. After advancing with PAGE, step 20 remained empty and step 21 accepted and cleared a lock in A02 track 3's lock slot. The track 1 panel, encoder and active-only lock checks also passed, and the DSP capture matched locked playback and its releases. The tester confirmed the active-trig fix on Digitakt II.

### Q117 native track selection trial

Two isolated builds produced the same private image, SHA-256 `8625b199e07ee838170d32c809c71bca3316234f61b60c8dded00a27313e06f9`. Digikit (emulator) traced H to the stock track-selection function and confirmed the panel stayed open. Stock RECORD wrote to track 3 inside Chord Arp and after leaving it. The stock track buttons then selected track 4, received a trig, and Chord Arp reopened on track 4. The wide-range encoder, modal keys and active-trig lock regressions passed. The tester confirmed the track-follow behavior on Digitakt II.

### R117 scheduler trial

Two offline builds matched at SHA-256 `84466427d04c7ffac7bb4f0e236930389aeef50bf9eef84ebe755dca0609e3ac`. Host pitch and rhythm tests passed. Digikit (emulator) distinguished SPAN off, SPAN on and LATCH across an eight-step loop. It measured 375 frames between 1/8 onsets at the fixture tempo and speed, distinguished NOTE, GRV and ALL, and verified both a Chord Arp ROOT lock and a stock NOTE override with ROOT set to TRIG. Restart, switching to an empty pattern and mute passed with matched releases. Hardware results are pending.

The tester confirmed SPAN, LATCH and slower divisions on Digitakt II. They reported overlapping SPAN and GROOVE SHAPE graphics, a carried chord that continued after deleting the last trig, locks restored on replacement trigs, and an audible click at step 2 with ARP both on and off. They requested that fixed ROOT begin at C5. Reset and root-lock behavior were still uncertain in that hardware run.

### S117 deletion and layout trial

Two offline builds matched at SHA-256 `6e26bea6a5ad4719e30cf6805c253047adf3a04154c468a514aca918cbf7ef21`. Digikit (emulator) confirmed that live removal of the only source trig ended LATCH at the next loop boundary with matching releases, including with a chord lock on the deleted source. Deleting and immediately replacing a trig cleared its lock both inside and outside Chord Arp, and a neighboring lock survived until its own trig was deleted. The first ROOT edit selected C5 and pressing F restored TRIG. The Groove frame showed SPAN and the graph in separate areas.

Stock OS 1.17, S117 with ARP off, and S117 with ARP on each produced just the programmed step 5 note-on per loop in an eight-step Digikit (emulator) fixture. The step 2 click was not reproduced as a sequencer note event. Its audible cause remains unverified.

The tester reported that the step 2 click was gone on S117.

### U117 playback and project trial

Two offline builds matched at SHA-256 `767e1f602cfddd4b72c3f252618ebdf3487706d578997b240e4c943ac1a07da5`. Digikit (emulator) confirmed that a late trig retained all three arp pitches at its shifted deadline. With adjacent trigs, an early trig started 63 DSP frames before its straight-grid onset and the preceding phrase released before it. At 2× with swing, the first phrase kept its straight-grid gate lengths and repeat spacing, and the shortened windows kept all repeats with matched releases. Live tempo, live track speed, pattern return and deleting a latched source also ran through the stock scheduler.

A Digikit (emulator) test called the stock full-project serializer and loader on the active project. It restored two enabled tracks and all 128 step locks. Loading the same stock project image with its archive marker removed cleared the arp state. The test exercised the firmware project buffer rather than physical storage.

The tester reported PASS for all three U117 hardware checks on Digitakt II. Early and late microtiming, swing with repeats, and Save Project followed by reload passed.

The tester also reported PASS for all four RESET modes on U117. The eight-step hardware fixture used C5 note trigs on steps 1 and 3, MAJ, UP, 1/16, SPAN on, and a three-pulse rhythm with one active pulse. CONT, NOTE, GRV, and ALL each produced the expected pitches on the expected steps.

The tester confirmed the two remaining U117 hardware checks. ROOT set to TRIG followed the stock NOTE value. A G5 Chord Arp ROOT lock on step 5 overrode its stock D5, and clearing the lock restored D5. With LATCH active, deleting the locked minor trig let the phrase finish the current loop. Re-adding the trig used the track's major chord.

### X117 and Y117 hardware reports

Standalone X117 uses the Digitakt II base that passes built-in Euclidean hits to Chord Arp. Two pinned builds reproduced image SHA-256 b15a9d2357d3bcc2cefc3e94cd9996790e67d644dbef9df1de01acad50dccb76. In Digikit (emulator), four built-in hits over two loops started phrases at the stock hit times and bypass restored the original single notes. Claptom-music reported successful playback on Digitakt II.

Combined Y117 adds Euclidean Scale. Its image SHA-256 is 76ba91b57c347d6d1c37c518250cc9a2f65ec7073a46eff9ad2aff570e6e5c9c. Digikit (emulator) reproduced the X117 note starts and releases with both modules installed. Claptom-music reported that the combined hardware test worked.

### QB17 hardware report

On 2026-11-16, Claptom-music reported that Chord Arp played on a physical Digitakt II and that saving and reloading the scratch project on QB17 restored the arp enable state and trig lock. Official OS 1.17 then reopened the same project with the A01 kick on step 1 and the A02 snare on step 5 intact.

The QB17 SYX SHA-256 was 9ef3258f10bfa9fd283c21ec3bc9b3d0ddf6c67ec07e02dc0eadf61f53accf30. It used the exact core catalog package from Modwerk PR #1571, SHA-256 510fae56f99e8029784e45e14a8beaf6977afe6e2177d253bb79c458b95046ee. Track Names and the Perform modules were outside this hardware test.
