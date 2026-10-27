# FRACT module changes

## 0.10.0-experimental (2026-10-25)

First release prepared for the Modwerk catalogue. Set **TSTR OFF**; only one
FRACT track works. Modwerk release notes:
[docs/modwerk/grnyv1.json](../../docs/modwerk/grnyv1.json).

- First Modwerk release of FRACT, a granulator on FX2: three overlapping grains read from the Flex sample on its track. Main page POS, SIZE, REVS (grain direction), SPRD (scatter), SPCE (a diffused stereo reverb) and SHPE (grain window); SETUP page PAN, SCAN, SRNG and DENS (density). Pitch follows the track's own PTCH.
- Set TSTR to OFF on the Flex track (hold FUNC, press SRC, encoder E): with timestretch on, the granulator stays off by design and FRACT seems to do nothing.
- FRACT runs on one track at a time: on a second track it plays that track's sample dry, without SPACE, and its page shows FRACT ON T<n>. STOP frees it; on the next PLAY the lowest track with FRACT takes it.
- Installed over USB as a Modwerk runtime package. Its single stock-code site sits just after the stock fetch call that POLY8 patches, so the two can be installed together (the loader's admission test passes for the pair on the host; not tested on a unit). FRACT on a POLY8 track granulates the primary voice's sample only.
- On the track whose FRACT plays, the stock trig declick is cleared, so trigs no longer click on the grains; every other track keeps it.
- SPACE above SPCE 96 darkens the tail and drives its soft limiter less hard. Linked stereo output-envelope smoothing reduces repeated pluck swells at the fully wet maximum, without changing SPCE 0-96 or the grains. The four synthetic guitar/pad acceptance cases improve envelope periodicity by 2.6-7.4 dB; individual attacks may remain audible depending on source and settings. The cloud is quieter than the dry it replaces. Exact package `fef9db2b` was installed on an Octatrack MKII on 2026-10-25; the owner heard softer attacks but still countable grains at SPCE 127, so the cloud goal is not claimed.
- Parts saved with earlier FRACT development builds load REVS, SCAN and DENS (and SHPE from early 0.10.0 builds) at other values: set REVS 127, SCAN 64, DENS 127 and SHPE 64, or choose FX2 NONE and then FRACT, which writes every default.
- FX2 effect id 7. FRACT's development builds used 9, which LOFI2 now holds: a Part saved with one of them does not bring FRACT back, so choose FRACT again on that FX2. Over USB, remove the earlier build and load a project that never had it before installing this one: while the loaded project's module map still names FRACT at 9, the base refuses FRACT at 7.
- Limits: SETUP controls (PAN, SCAN, SRNG, DENS) take no locks, LFOs or scenes on OS 1.40C; Thru and Neighbor machines are untested; SPACE costs more DSP than any stock effect (407.38 executed instructions a sample at worst; four fit a core). Tested on the host, QEMU and octemu for this source; an earlier development build ran on an Octatrack MKII on 2026-10-20 (install, the one-track rule, a Part switch, a power cycle, the missing-module path, the base self-test, removal), and earlier SPACE builds installed on the current base on 2026-10-23 and 2026-10-24 (the first also survived a power cycle). The exact package was accepted on the unit on 2026-10-25; the remaining control and persistence checks are unverified.

Source revision: `41e4b9699c7f3e8d611aa6f7cd03633bc272dc76`; package built with
Modwerk `9ec79ed25d9f` and Elekloader `c150ac583a4b`.
`fract-0.10.0-dev.mwrm` (22,148 bytes), SHA-256
`fef9db2b444dcac1d796f5920ea36448a6a16089a0e5f6801f7fcd4faf23120a`. No publication or unit qualification
is claimed. Full history: root [CHANGELOG.md](../../CHANGELOG.md).

## 0.9.4-experimental (private SDK staging, 2026-10-17)

- Preserve the accepted 0.9.4 A engine and byte-identical native MAIN with the
  current Modwerk SDK. No granular or SPACE sound change.
- Add the v2 module contract, tutorial, resource limitations, thumbnail and
  module-local licence/attribution texts. Align the native SDK key and author
  identity with the contract.
- Use `FRACT_SDK` to select the SDK checkout, with precedence over the legacy
  `GRNYV1_SDK` alias. The pinned default and internal module ID remain stable.
- Align the descriptor export, image verifier and native view fixture with the
  public `FRACT` SDK key; the accepted A MAIN image remains byte-identical.
- Correct historical capture versions and distinguish firmware image hashes
  from PNG file hashes. Current-version UI capture evidence remains pending.
- Declare actual cave/source-hook collisions with MIDI Scenes, POLY8 and FM
  Synth. Browser/native companion placement and owner review remain pending.
- Keep source-built browser packages, base/USB arena and hook lifecycle work,
  silicon resource qualification and all physical FRACT tests pending.

This is a local staging record, not a Modwerk catalogue release or submission.
