# Track Mutes testing

## Commands and exact revision

Stock guard at `0x40040250` (6-byte `move.l %d2,-(%sp); move.l 8(%sp),%d1`), PERSONALIZE count `0x40068fb2`, and the three ANDY `pea 0x64` sites match original OS 1.40C (`section_3_MAIN_OS.bin` SHA-256 `164f31224bf61181e3f50e7dec40df9afcae5b16dbf6e4c0d0cc5e986af0a84e`) as hashed locally; those bytes are not in this folder. `npm run module:verify` and `ot_emu` have not been run.

## Hardware and audio quality

A private card image of `0.1.0-experimental` (ELEK `TM 0.1.0`, SHA-256 `3e35f72c5985a6d3cfbd9f7a64fdeec04ac5db05792c629d4a20480189779335`) was flashed on a unit, 24 October 2026. Reported: with TRACK MUTES showing X, no change to stock — T1-T8 still selected, FUNC+T still muted. Do not treat `0.1.0-experimental` as a pass.

A private card image of `0.1.1-experimental` (ELEK `TM 0.1.1`, SHA-256 `649a48d6c4125e32e41a6006476a4109df0ec8e246da6e8a720f9d609b5b357e`) was flashed on the same unit, 24 October 2026. Reported: T1-T8 mute and unmute correctly; FUNC+T1-T8 does not select — the edit track stays T1. Do not treat `0.1.1-experimental` as a pass.

A private card image of `0.1.2-experimental` (ELEK `TM 0.1.2`, SHA-256 `69a8c7de177603fcede63b5653b0c3f8e909ca777386bad9d175cb008c2f35eb`) was flashed on the same unit, 24 October 2026. Reported: FUNC+T highlights another track but the knobs and pages still edit T1. Do not treat `0.1.2-experimental` as a pass.

A private card image of `0.1.3-experimental` (ELEK `TM 0.1.3`, SHA-256 `84c21f21553d8a99432bf4299e821141f3a293b530020964a007f6bd6024682e`) was flashed on the same unit, 24 October 2026. Reported: FUNC+T still only lights the track; T-mute chords stop at two keys. Do not treat `0.1.3-experimental` as a pass.

A private card image of `0.1.4-experimental` (ELEK `TM 0.1.4`, SHA-256 `fdd7b08b60317f3caa84c239ecc2d28d57a65a81b65fdef08672e03eb443476b`) was flashed on the same unit, 24 October 2026. Reported: no change to select or two-key mute chords; two pixels missing from the top border of the main screen only (PROJ unchanged). Do not treat `0.1.4-experimental` as a pass.

A private card image of `0.1.5-experimental` (ELEK `TM 0.1.5`, SHA-256 `e8995ba60ca59269ec41dfd58000c30ac9d894fab21c80762bedf1d5513ad4af`) was flashed on the same unit, 24 October 2026. Reported: FUNC+T still only lights green track LEDs; two tracks can light at once; mute chords still stop at two keys. Do not treat `0.1.5-experimental` as a pass.

A private card image of `0.1.6-experimental` (ELEK `TM 0.1.6`, SHA-256 `0562fc4a21583b09d673c5ad4dd8d2e664cce08a075161099d4d4a440e24233c`) was flashed on the same unit, 24 October 2026. Reported: four T keys can mute at once, but unmute follows the green focus LED (unmute T8 lights T8; another T must be pressed to unfocus T8). Do not treat `0.1.6-experimental` as a pass.

A private card image of `0.1.7-experimental` (ELEK `TM 0.1.7`, SHA-256 `ec23c6119c9bb59fbec7e80a143e1d0d52ebc1bde71b15a3043a08aadf8e1308`) was flashed on the same unit, 24 October 2026. Reported: no change — page editor stays on T1, simultaneous T mutes still temperamental. Do not treat `0.1.7-experimental` as a pass.

A private card image of `0.1.8-experimental` (ELEK `TM 0.1.8`, SHA-256 `cfd6f4bdc34279a2eeb02c4d6c31d223c27602fbc1d9be39d944a46c270a4ee2`) was flashed on the same unit, 24 October 2026. Reported: simultaneous T mutes still unreliable; TRACK MUTES showed X on boot and did not toggle with one YES. Do not treat `0.1.8-experimental` as a pass.

A private card image of `0.1.9-experimental` (ELEK `TM 0.1.9`, SHA-256 `f0f53fa814887bd175bd1e64d4f71fd2135d4bf37dab7832592f412a66bd1ff2`) was flashed on the same unit, 24 October 2026. Reported: simultaneous T mutes more reliable than 0.1.8 but still temperamental. Do not treat `0.1.9-experimental` as a pass.

A private card image of `0.1.10-experimental` (ELEK `TM 0.1.10`, SHA-256 `85cd75cf07f608ed0fb69724018fefb7934e655b049176f19b4452f046530ddc`) was flashed on the same unit, 24 October 2026. Reported: simultaneous T mutes more reliable but still temperamental; not all eight together. Do not treat `0.1.10-experimental` as a pass.

A private card image of `0.1.11-experimental` (ELEK `TM 0.1.11`, SHA-256 `ce6e3e0f4228e4b1993eea9b33f2d49c181ed5be613dae5f02b4c2b753742763`) was flashed on the same unit, 24 October 2026. Reported: simultaneous mute still temperamental; T5-T8 together crashed (red LED, tempo hang, host saw USB). Do not treat `0.1.11-experimental` as a pass.

A private card image of `0.1.12-experimental` (ELEK `TM 0.1.12`, SHA-256 `aafe7cba3a04c61d4f47bf2995b3ddeb540985b32982251d4c9bacc2634f8f5c`) was flashed on the same unit, 24 October 2026. Reported: MIDI, REC1 and REC2 unresponsive; mute did not cover MIDI tracks. Do not treat `0.1.12-experimental` as a pass.

A private card image of `0.1.13-experimental` (ELEK `TM 0.1.13`, SHA-256 `b3be7e8623cf6e66d61c829d6ccf1485670ecce8407ffd93c70f49c3330d474f`) was flashed on the same unit, 24 October 2026. Reported: MIDI still dead; TRACK in MIDI mode not the same as audio; REC1/REC2 menu toggle crashed; unit more unstable. Do not treat `0.1.13-experimental` as a pass.

A private card image of `0.1.14-experimental` (ELEK `TM 0.1.14`, SHA-256 `c04fdefe322760a763fd578cbaab7c6acc0515bea40cb10a190ab57be18bb0e2`) was flashed on the same unit, 24 October 2026. Reported: MIDI button and REC1/REC2 recovered, but T mute coupled audio and MIDI pages (they must stay independent); simultaneous T1-T8 still temperamental. Do not treat `0.1.14-experimental` as a pass.

A private card image of `0.1.15-experimental` (ELEK `TM 0.1.15`, SHA-256 `30d14982f326a11c929008abe46b00ea261abf370bbc083320d3b1f3d253eca0`) was flashed on the same unit, 25 October 2026. Reported: audio and MIDI pages stay independent, but simultaneous T1-T8 mute/unmute is still temperamental. Do not treat `0.1.15-experimental` as a pass.

A private card image of `0.1.16-experimental` (ELEK `TM 0.1.16`, SHA-256 `2d4c33d7af287fd19d1a70b1cf2644849b46d09ff6036f84fd9be44716c4dfe2`) was flashed on the same unit, 25 October 2026. Reported: all tracks mute/unmute constantly per tick. Do not treat `0.1.16-experimental` as a pass.

A private card image of `0.1.17-experimental` (ELEK `TM 0.1.17`, SHA-256 `a4a38fac75f3d8bb9255cd4e00ac4531634085b4cc5ee755212a225ba46416b1`) was flashed on the same unit, 25 October 2026. Reported: almost perfect; occasional missed T in a chord, suspected hardware. Do not treat `0.1.17-experimental` as a pass.

A private card image of `0.1.18-experimental` (ELEK `TM 0.1.18`, SHA-256 `cc04bc517447c1b203acd18310d2c1aafb4ebdcc1fe1eba301dfb2f0a61b4987`) was flashed on the same unit, 25 October 2026. Reported: TRACK mute very stable; REC1/REC2/REC3 inaccessible in MIDI mode. Do not treat `0.1.18-experimental` as a pass.

A private card image of `0.1.19-experimental` (ELEK `TM 0.1.19`, SHA-256 `6d6c16894172438625bac7ef7c0696b258fbe4d5cd614668ec8785791ad446d5`) was flashed on the same unit, 25 October 2026. Reported: REC3 accessible in MIDI mode; REC1 and REC2 still unresponsive. Do not treat `0.1.19-experimental` as a pass.

A private card image of `0.1.20-experimental` (ELEK `TM 0.1.20`, SHA-256 `32f46248d6e515ca30a7a981e87c7c2d5ced8371322a8323cdd16bf06b22dbd4`) was flashed on the same unit, 25 October 2026. Reported: REC1/REC2 still inaccessible in MIDI mode; QUICK MUTE trigs more responsive but red/green mute LEDs off. Do not treat `0.1.20-experimental` as a pass.

A private card image of `0.1.21-experimental` (ELEK `TM 0.1.21`, SHA-256 `affe969accf636b48666164dad9ac71dfe563f51c4633fb675a8ad4681a35573`) was flashed on the same unit, 25 October 2026. Reported: QUICK MUTE chords stable; trig LEDs 5-8 unresponsive; trigs 9-12 crashed (VEC 03, ADDR 00000102). Do not treat `0.1.21-experimental` as a pass.

A private card image of `0.1.22-experimental` (ELEK `TM 0.1.22`, SHA-256 `27f58689a0a9ee248235bae4bbbe40f95e2764f454b0bea7657c345bd1b3fd08`) was flashed on the same unit, 25 October 2026. Reported: QUICK MUTE mute stable; trig 1-16 red/green LEDs unresponsive; MIDI REC1/REC2 still inaccessible. Do not treat `0.1.22-experimental` as a pass.

A private card image of `0.1.23-experimental` (ELEK `TM 0.1.23`, SHA-256 `f08d11b3de837f82941f2779d20e49e0734bbcfc0044e79ae58410ba62582f58`) was flashed on the same unit, 25 October 2026. Reported: QUICK MUTE mute and trig LEDs recovered; MIDI REC1/REC2 still inaccessible; REC1/REC2/REC3 selection LEDs unchanged (as on stock). Do not treat `0.1.23-experimental` as a pass.

A private card image of `0.1.24-experimental` (ELEK `TM 0.1.24`, SHA-256 `f1cc45dcabc4b597749ae0127b3995b0382ef94f0be2c2f49fe25bb4463e9128`) was flashed on the same unit, 25 October 2026. Reported: mute/unmute less stable than 0.1.23; MIDI REC1/REC2 still inaccessible. Do not treat `0.1.24-experimental` as a pass.

A private card image of `0.1.25-experimental` (ELEK `TM 0.1.25`, SHA-256 `f07106f0230d9717a12f1b391022ab7a353fb1c08695a2a6bcdf7d65bad795af`) was flashed on the same unit, 25 October 2026. Reported: FUNC+REC1/REC2 do not open recorder-buffer submenus on the MIDI TRACKS page. Do not treat `0.1.25-experimental` as a pass.

A private card image of `0.1.26-experimental` (ELEK `TM 0.1.26`, SHA-256 `b450037bd3bae4db1cba3a0f5478d42e8a1dbd6d18dd0456f6147b835c428de3`) was flashed on the same unit, 25 October 2026. Reported: mute, QUICK MUTE and FUNC+REC1/2 on MIDI TRACKS recovered; stock double-tap T1-T8 no longer opens the sample slot list. Do not treat `0.1.26-experimental` as a pass.

A private card image of `0.1.27-experimental` (ELEK `TM 0.1.27`, SHA-256 `9ce1acb1169595f422cd760c5e8e4d32f68a22f85767631614147fd5ac4f66c8`) was flashed on the same unit, 25 October 2026. Reported: TRACK 8 (MASTER) mute/unmute unresponsive from T and QUICK MUTE; FUNC+double-tap T opened the sample list twice then stopped. Do not treat `0.1.27-experimental` as a pass.

A private card image of `0.1.28-experimental` (ELEK `TM 0.1.28`, SHA-256 `1a48e4b6dee7bf69307cf13208276d30ba0788e941053388e114c4e14894c919`) was flashed on the same unit, 25 October 2026. Reported: FUNC+double-tap T never opened the sample list; MIDI button unresponsive (no LED, no MIDI page); T8 in MASTER mode still unmuteable from T8 and QUICK MUTE trig 8. Do not treat `0.1.28-experimental` as a pass.

A private card image of `0.1.29-experimental` (ELEK `TM 0.1.29`, SHA-256 `78e880e979f73ec180b5549f1c94a090015240314094acd1917e9603d85278b9`) was flashed on the same unit, 25 October 2026. Reported: with T8 in MASTER mode, focus hangs on MASTER TRACK and that title supersedes SRC/AMP/LFO/FX1/FX2. Do not treat `0.1.29-experimental` as a pass.

A private card image of `0.1.30-experimental` (ELEK `TM 0.1.30`, SHA-256 `db1214a4cca187cfff0db4f2adeaf19f23774af05a13cdd9dc5d68b4c5256ef2`) was flashed on the same unit, 25 October 2026. Reported: with AED open, FUNC+T1-T8 select does not show that track's waveform. Do not treat `0.1.30-experimental` as a pass.

A private card image of `0.1.31-experimental` (ELEK `TM 0.1.31`, SHA-256 `0afc74c3615cc42047d446de6ebc597769c227d5a15f312f11d6be625c2ec956`) was flashed on the same unit, 25 October 2026. Reported: AED still does not follow FUNC+T1-T8. Do not treat `0.1.31-experimental` as a pass.

A private card image of `0.1.32-experimental` (ELEK `TM 0.1.32`, SHA-256 `80ea9496ada52964401c3d0786dd7b21bbeb77e45a4e075faeaa473183adc624`) was flashed on the same unit. Reported: with AED open, FUNC+T follows the selected track's waveform as desired. That is reported hardware from one tester on this card build, not a verified stress pass. USB Keep/Undo and `ot_emu` were not tested. Do not treat `0.1.32-experimental` as verified.

## Stock flows

`0.1.0`–`0.1.25` same-unit as above. USB Keep/Undo, scenes, sampling: not tested.

## Performance

Static bound only. Authored ColdFire in `trackmutes.s` is 438 instruction lines. Worst-case event used for qualification is that whole unit if every opcode ran once (438), as a conservative static ceiling, not a measured path. Stock `jsr` callees, cache and wait states are not included. Chip wall-clock and `ot_emu` executed-instruction traces are unmeasured. New-module `perf:audit` remains open.

## Resources

Static estimate of the authored unit: 1688 bytes (instruction-length sum of `trackmutes.s` at 2/4/6 bytes plus `.asciz`/`.byte`/`.long`; `m68k-elf-as` was not on this Windows host, so this is not the linker report). Plus two six-byte T-key detours, ANDY length pokes, a row-count poke, and relocated PERSONALIZE pointer arrays in stock space (not counted as extra module RAM). One PERSONALIZE word and its ANDY shadow are stock SRAM. No DSP memory. One instance.

## Hardware

`0.1.0`–`0.1.32` same-unit, 24–26 October 2026, as above. Hardware LCD photographs 25 October 2026 show SYSTEM STATUS `TM 0.1.32` and TRACK MUTES empty then ticked. AED follow of FUNC+T on this card is reported, not photographed, and not verified under stress. See [evidence/hardware.md](evidence/hardware.md).

## OT UI capture evidence

Hardware LCD photographs, 25 October 2026, in `media/` (`capture.json`). SYSTEM STATUS stamp reads `TM 0.1.32`. PERSONALIZE shows TRACK MUTES empty and ticked. Never commit firmware, dumps or cards.
