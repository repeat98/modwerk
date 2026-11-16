# Chord Arp testing

## Release qualification

QE17 is the current Digitakt II OS 1.17 candidate. The Chord Arp package SHA-256 is 378fc77fc08928de4af6b6638b5bd5549c62309b54273a26fbfa64f97736e5f0. Native and browser SYX output matched at SHA-256 17ce2db034eca06950836a8fff749bfc7c425b2354b0cf50b749d57e18c2a747 on the same base as QD17. Digikit applied a shared TYPE to two held active trigs, skipped an inactive trig, edited just the remaining held trig after release, and cleared both locks together. The project fixture still restored both track settings and all 32 locks. On 2026-11-16, Claptom-music reported three hardware passes on QE17: applying the same TYPE lock to two held active trigs, editing only the remaining held trig after releasing the other, and clearing both TYPE locks together. The 32-lock save and reload result above is from Digikit.

QD17 was the preceding release candidate for Digitakt II OS 1.17. Two isolated builds reproduced Chord Arp package SHA-256 a3ecd4ad8f6b16cbf67345cd037bb5906426191766c627fecfe0e8969e6b4c9d. It uses the same core package as QC17. The native and browser SYX files matched with SHA-256 5450b7be5cdb4fd44142c686faf739e177fb4ff99f48d3f9404f71b9c99c2d28. The host test accepted 32 locks and refused the 33rd. Digikit restored both track settings and all 32 locks on save and reload. Physical testing of QD17 is pending.

QC17 was the preceding candidate for Digitakt II OS 1.17. Two isolated builds reproduced Chord Arp package SHA-256 fa48f12af8b3e09ced5e66a09d58107ae3332dbeca99a49efa0673bc97fdeae0. It links with core 1.1 package SHA-256 ea66a96f64926db4eab2790427afd2e8cee9d7189ce95d19ef2ed4c5cb3d2047. The native and browser engines produced identical SYX output, SHA-256 3f1bf67f05d81a7d9065285ca6475e17e03d47c4e2d62bbb93979eb290cd27b8. Digikit completed the swung fast playback fixture and restored two track settings and all eight trig locks through the project serializer and loader. On hardware, track selection, swing and groove, and built-in Euclidean playback passed. The tester confirmed the eight-lock limit and asked for a higher cap. Project reload and stock OS reopen were not confirmed on QC17.

## Latest hardware reference

QB17 used Chord Arp package SHA-256 6c794421fbb942b7ac257d10ef9bb5f941c4b01c7800ade32d4ba937e39e6919. Claptom-music reported that the arp enable state and trig lock survived a save and reload, and official OS 1.17 reopened the project with both patterns intact. See the QB17 report for the core and image hashes.

## Not tested

- Exact revised release build on hardware.
- MIDI tracks are outside the audio-track module scope.
- Save and reload with Euclidean Scale installed.
- Chord Arp alongside Track Names.

## Earlier trials

## Pitch engine

On Windows, GCC 16.2.0 compiled `src/arp.c` and `tests/arp_test.c` as C11 with `-Wall -Wextra -Werror`. The test executable passed all assertions. It covers both bounce directions, the other note orders, extended voicing, duplicate pitches, signed root-relative bounds, and a range with no playable notes. Rhythm tests cover lengths 1–32, all nonzero pulse counts, positive and negative rotation, hit order across the loop, and repeat indexing.

Host gate assertions passed for split deadlines, full and partial gates, wraparound, and rejection of invalid or too-short windows.

Host assertions also passed for replacement of built-in chord extensions, groove depth and velocity limits, and the combined chord-to-gate path across repeats and rests. GCC 13.1.0 compiled the pitch and rhythm engine for ColdFire 54455 with warnings treated as errors.

## Firmware

A private Digikit `d6de4d0` diagnostic linked the same C engine with a read-only stock-grid subscriber. The OS 1.17 image SHA-256 was `570640af06a9fa642badb5c7515bb911df98da467720e25a326d6f0fe1010190`. At 1/32 division it produced 114 checked requests on the swung 2× fixture and 60 on the straight 1× fixture. An independent calculation matched all pitches, velocities, gate endpoints and onsets. The diagnostic did not submit these requests to the stock queue.

The separate panel preview image SHA-256 was `895bf8d7f483425a148128548c0672100d69f17d0f561d17894c826d052cc0e0`. Digikit opened all four pages through stock SETTINGS and returned to SETTINGS on NO. The Arp page showed Down–Up, LO −1 and HI +2. Pressing C returned both bounds to AUTO. Reducing LEN to 11 also reduced PULS to 11. The Groove page showed Push and a timing depth of 30 after the encoder edits.

The local A117 trial image SHA-256 is `cf4bff9b1ed97749dea6a6f1a8669d7fdc7b2c4a102af10774178326833f9c28`. In Digikit, panel-entered trigs played from the first PLAY step and on the next loop without changing the test pattern in memory. Down–Up on C5 minor produced G5, E♭5 and C5. LO and HI at zero produced only C5. The disabled control preserved the two stock trigs and their durations. Two tracks played independent major and minor phrases at the same deadlines.

The same image passed the 1/32 repeat fixture, an empty rhythm pulse, groove timing and velocity, swung 2× track timing, live tempo nudging, eight STOP and PLAY cycles, a simulated project-generation change, mute and unmute, switching to an empty pattern, and both in-panel FUNC shortcuts. The checks compared stock queue and DSP packet captures. A host test covered 65,536 trial windows with maximum repeats, full gate, groove and swing across all eight trial divisions. Hardware remains untested.

The catalogue targets core 1.0 and the trial needs 1.1. The current module doctor does not discover Digitakt II modules.

## A117 hardware report

Claptom-music reported booting the private PR #1365 trial on Digitakt II on 2026-11-09. The tested image SHA-256 was `64a9d9c79d244723bc99eddc02e84333dbed6d12a3cf9766e8952d2b03bcbd03`.

- Panel and pitch tests 1–6 passed. The later report explicitly passed test 6. LO and HI clamped against each other, and pressing C or D restored AUTO. The tester requested slower encoder response.
- Timing tests 7–11 passed. Test 12 failed. After switching to an empty pattern for one full loop and returning, the arp played only the root.
- Test 13 passed for explicit note and velocity. Moving a trig off-grid changed the heard note while it stayed in scale. The intended microtiming behavior and the MIDI and stock Euclidean subcases were not confirmed separately.
- Project reload, the 16-track pressure test, and power cycling passed. The tester reported no freezes during the 16-track run.

## L117 step-lock trial

Two isolated builds with GCC 16.2.0 and binutils 2.47 produced identical L117 images, SHA-256 `d3e9c923100f30d0e5c954a8336c6af2b940d881c0a767a9e5e227e1c39295b6`. The base package SHA-256 was `d9f41cceebe7312f8175a16bea211b4129558336c04ac5d7771ab9881c20adc0`.

Digikit confirmed independent chord and direction locks on the first PLAY trig and on step 5. Clearing the direction retained the chord lock. Clearing the step restored track settings. RECORD and trig entry kept the panel visible and created an audible stock trig. The same previously held trig could be removed from the stock panel on the first press.

The exact image arpeggiated both source trigs on the first loop after returning from the empty pattern. The microtimed source kept its shifted stock note. Bypass, root-only range, 2× swing, mute, rhythm rests, two tracks and repeated STOP and PLAY also passed. Host checks covered lock isolation, capacity, clearing, reset and 65,536 timing windows.

On Digitakt II, L117 booted and passed tests 2–4, 6 and 7. Test 1 failed on encoder precision across the panel, and ORDER, LO, HI and GATE did not respond while a trig was held during that test. In test 5, PAGE alone left the panel even though locking and clearing worked. TRK also left the panel, and trig presses could select a stock track outside RECORD. In test 8, changing swing affected step 5's repeats and gate, and adding microtiming changed its octave. In test 9, all arp switches returned to OFF after reloading the project.

## M117 encoder trial

Two isolated builds produced the same private image, SHA-256 `73a1fff3ba3649d84444019443e4a4653d5badb353bc929f2ac9aa3702b6d249`. Digikit verified that eight same-direction raw counts made one edit, a raw delta of 30 made one edit, reversing discarded a partial movement, and changing pages cleared pending movement. In FUNC + PAGE lock mode, ORDER, LO, HI and GATE were written to trig 5 while its track settings stayed unchanged. Locked and cleared phrases played with matching releases, and RECORD and trig entry kept the panel visible. Physical encoder feel is pending.

A second Digikit run checked the threshold and the one-step cap individually on all 20 rotary controls across CHORD, ARP, RHYTHM and GROOVE, including ARP on/off and TRACK. It repeated the checks on all 18 controls available when holding trig 5 in lock mode and confirmed that the two track-only controls were ignored during that edit.

On Digitakt II, M117 test 1 partially passed. The incremental baseline felt good, and the tester requested stock response for wider ranges. Tests 2, 4 and 5 passed. Test 3 passed on active trigs and failed on inactive trig 4, which accepted a lock. The tester also reported that buttons besides NO could still leave the panel.

## N117 panel trial

Two isolated builds produced the same private image, SHA-256 `7b7628b4eb6ee305cdc7548455abc1ac64b301beed9f1f58c20a1be2b47024ad`. Digikit verified the stock filter and its UI tick for GATE, ROT, TIME and ACCNT. A held active trig used the same filter for its GATE lock, and a held empty trig created no lock or track edit. The discrete threshold passed on the held active trig. PAGE, TRK, parameter keys and non-recording trig keys stayed in the panel. The native RECORD path added a note on the expected track, PAGE advanced the lock bank, and NO cleared the active step while held and closed the panel after release. Three DSP runs matched the expected pitches and releases for locked playback, cleared playback and stock trig entry.

On Digitakt II, N117 passed the encoder and panel-key checks. The lock check failed because active trig 5 showed NO NOTE TRIG and rejected edits. Digikit reproduced the symptom with a stock note on A02 track 3 while Chord Arp opened on track 1. Selecting track 3 with H allowed the lock in that fixture.

## P117 active-track trial

Two isolated builds produced the same private image, SHA-256 `9bbf3ee7202a782f55170c397d03b2f5f132efa50288520aa226d4e2864f777f`. Digikit opened Chord Arp on stock-selected track 3 in A02. Trig 5 on lock page 1 remained empty. After advancing with PAGE, step 20 remained empty and step 21 accepted and cleared a lock in A02 track 3's lock slot. The track 1 panel, encoder and active-only lock checks also passed, and the DSP capture matched locked playback and its releases. The tester confirmed the active-trig fix on Digitakt II.

## Q117 native track selection trial

Two isolated builds produced the same private image, SHA-256 `8625b199e07ee838170d32c809c71bca3316234f61b60c8dded00a27313e06f9`. Digikit traced H to the stock track-selection function and confirmed the panel stayed open. Stock RECORD wrote to track 3 inside Chord Arp and after leaving it. The stock track buttons then selected track 4, received a trig, and Chord Arp reopened on track 4. The wide-range encoder, modal keys and active-trig lock regressions passed. The tester confirmed the track-follow behavior on Digitakt II.

## R117 scheduler trial

Two offline builds matched at SHA-256 `84466427d04c7ffac7bb4f0e236930389aeef50bf9eef84ebe755dca0609e3ac`. Host pitch and rhythm tests passed. Digikit distinguished SPAN off, SPAN on and LATCH across an eight-step loop. It measured 375 frames between 1/8 onsets at the fixture tempo and speed, distinguished NOTE, GRV and ALL, and verified both a Chord Arp ROOT lock and a stock NOTE override with ROOT set to TRIG. Restart, switching to an empty pattern and mute passed with matched releases. Hardware results are pending.

The tester confirmed SPAN, LATCH and slower divisions on Digitakt II. They reported overlapping SPAN and GROOVE SHAPE graphics, a carried chord that continued after deleting the last trig, locks restored on replacement trigs, and an audible click at step 2 with ARP both on and off. They requested that fixed ROOT begin at C5. Reset and root-lock behavior were still uncertain in that hardware run.

## S117 deletion and layout trial

Two offline builds matched at SHA-256 `6e26bea6a5ad4719e30cf6805c253047adf3a04154c468a514aca918cbf7ef21`. Digikit confirmed that live removal of the only source trig ended LATCH at the next loop boundary with matching releases, including with a chord lock on the deleted source. Deleting and immediately replacing a trig cleared its lock both inside and outside Chord Arp, and a neighboring lock survived until its own trig was deleted. The first ROOT edit selected C5 and pressing F restored TRIG. The Groove frame showed SPAN and the graph in separate areas.

Stock OS 1.17, S117 with ARP off, and S117 with ARP on each produced just the programmed step 5 note-on per loop in an eight-step Digikit fixture. The step 2 click was not reproduced as a sequencer note event. Its audible cause remains unverified.

The tester reported that the step 2 click was gone on S117.

## U117 playback and project trial

Two offline builds matched at SHA-256 `767e1f602cfddd4b72c3f252618ebdf3487706d578997b240e4c943ac1a07da5`. Digikit confirmed that a late trig retained all three arp pitches at its shifted deadline. With adjacent trigs, an early trig started 63 DSP frames before its straight-grid onset and the preceding phrase released before it. At 2× with swing, the first phrase kept its straight-grid gate lengths and repeat spacing, and the shortened windows kept all repeats with matched releases. Live tempo, live track speed, pattern return and deleting a latched source also ran through the stock scheduler.

A Digikit test called the stock full-project serializer and loader on the active project. It restored two enabled tracks and all 128 step locks. Loading the same stock project image with its archive marker removed cleared the arp state. The test exercised the firmware project buffer rather than physical storage.

The tester reported PASS for all three U117 hardware checks on Digitakt II. Early and late microtiming, swing with repeats, and Save Project followed by reload passed.

The tester also reported PASS for all four RESET modes on U117. The eight-step hardware fixture used C5 note trigs on steps 1 and 3, MAJ, UP, 1/16, SPAN on, and a three-pulse rhythm with one active pulse. CONT, NOTE, GRV, and ALL each produced the expected pitches on the expected steps.

The tester confirmed the two remaining U117 hardware checks. ROOT set to TRIG followed the stock NOTE value. A G5 Chord Arp ROOT lock on step 5 overrode its stock D5, and clearing the lock restored D5. With LATCH active, deleting the locked minor trig let the phrase finish the current loop. Re-adding the trig used the track's major chord.

## X117 and Y117 hardware reports

Standalone X117 uses the Digitakt II base that passes built-in Euclidean hits to Chord Arp. Two pinned builds reproduced image SHA-256 b15a9d2357d3bcc2cefc3e94cd9996790e67d644dbef9df1de01acad50dccb76. In Digikit, four built-in hits over two loops started phrases at the stock hit times and bypass restored the original single notes. Claptom-music reported successful playback on Digitakt II.

Combined Y117 adds Euclidean Scale. Its image SHA-256 is 76ba91b57c347d6d1c37c518250cc9a2f65ec7073a46eff9ad2aff570e6e5c9c. Digikit reproduced the X117 note starts and releases with both modules installed. Claptom-music reported that the combined hardware test worked.

## QB17 hardware report

On 2026-11-16, Claptom-music reported that Chord Arp played on a physical Digitakt II and that saving and reloading the scratch project on QB17 restored the arp enable state and trig lock. Official OS 1.17 then reopened the same project with the A01 kick on step 1 and the A02 snare on step 5 intact.

The QB17 SYX SHA-256 was 9ef3258f10bfa9fd283c21ec3bc9b3d0ddf6c67ec07e02dc0eadf61f53accf30. It used the exact core catalog package from Modwerk PR #1571, SHA-256 510fae56f99e8029784e45e14a8beaf6977afe6e2177d253bb79c458b95046ee. Track Names and the Perform modules were outside this hardware test.
