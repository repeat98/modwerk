# FRACT 0.10.0-experimental: hardware report

## Output-envelope build (2026-10-25)

**TSTR OFF; one FRACT track.** Partial listening result: the dissolve goal
is not met.
Package `fef9db2b444dcac1d796f5920ea36448a6a16089a0e5f6801f7fcd4faf23120a`
(22,148 bytes), source `41e4b9699c7f3e8d611aa6f7cd03633bc272dc76`, was
installed on base `d6bfff70` on 2026-10-25 with the user present. The user
reported every FRACT track set to NONE before installation. The five-second
USB trial was accepted: normal, generation 1, active `fef9db2b`; inventory
FRACT at handle 7, nothing missing. The earlier `62672f6f` is archived.
USB installation was driven by Codex with current Modwerk's device tool;
listening was performed and reported by the project owner.

The user's guitar report after installation: attacks seem less noticeable,
but at SPCE 127 individual grains remain separable and countable. Raising
SPCE from 96 to 127 feels like going further into a can-like effect rather
than merging the grains into one continuous cloud. This is partial attack
softening, not acceptance of the required ambient dissolve. The user then
asked whether a delay stage was missing; this is a design hypothesis, not
an observed explanation.

Exact controls (SIZE, DENS, SPRD, SHPE, PAN), TSTR, track and number of
instances during listening were not reported. Project save, level/pumping,
click/zipper, CPU, built-in self-test, Part/project reload, power cycle,
T3/T7 and other outstanding checks remain unverified. No audio recording
was made or analyzed. Earlier results below apply only to their named builds.


Only what was observed on a unit is recorded here. Model: Octatrack MKII,
OS 1.40C, the user's own unit; tester: the user at the unit, with Claude
Code driving the Modwerk base over USB (`scripts/device.mjs`). Base: a local
build from Modwerk `a59677e` (it reports `a1471aeb…`), installed from the
card; since 2026-10-23 the published beta base `d6bfff70…` (Modwerk
`f99681ec`), flashed from the card (`docs/MODWERK_BASE_D6BFFF70.md`).

## Earlier build: 62672f6f (SPACE's top range, variant A, on source 714dddb)

`fract-0.10.0-dev.mwrm`, 22,104 bytes, SHA-256
`62672f6f7f398e60808d8081a73f36fb53d1bb8915d5b0df4b872be4284a8892`, an
earlier package: source
`714dddbfd5a3bbf7262449b9b2bfb6d2e4246153` with SPACE's top range made the
ambient research's variant A (above SPCE 96 the wet's knee drive ×4 → ×2
and the damping 0.65 → 0.40, from the slewed mix; the full decay, fully wet
maximum and 40 Hz high-pass back), its only difference from `55f0fdff…`,
which the user installed on base `d6bfff70` on 2026-10-24 (below), and from
`ff7332b4…`. Protocol: the private kit's `UNIT_CHECK.md`
(`out/fract-hardware/kit-usb-0.10.0-dev/`); its step 1 installs over the
FRACT on the unit (same id) and saves the project, step 2 is SPACE.

- Partial result on 2026-10-24, user on base d6bfff70: installed; SPCE 96 sounded as before; at 127 guitar grain triggers remained audible. The detailed checks below were not completed.
- 1. Install (`try … --accept` over `55f0fdff`, FRACT chosen again, project
  saved), the defaults FRACT writes when chosen (POS 18, SIZE 86, REVS 127,
  SPRD 0, SPCE 0, SHPE 64; PAN 0, SCAN 64, SRNG FULL, DENS 127): PENDING: unit check of 62672f6f on 2026-10-24
- 2. SPACE (SPCE 96 and below as before; at 127 the grains dissolved into a
  long cloud without harsh highs, quieter than before; sweeps 96 ↔ 127
  without zipper or click): PENDING: unit check of 62672f6f on 2026-10-24
- 3. The sample's name above the overview: PENDING: unit check of 62672f6f on 2026-10-24
- 4. A second FRACT plays dry and shows `FRACT ON T<n>`: PENDING: unit check of 62672f6f on 2026-10-24
- 5. SHPE (0, 64, 127; SIZE swept 127 to 0 under SHPE 0 and 127; no click,
  no zipper): PENDING: unit check of 62672f6f on 2026-10-24
- 6. REVS (127 forwards, 64 about half, 0 all reversed; starts unmoved;
  SCAN on SETUP B): PENDING: unit check of 62672f6f on 2026-10-24
- 7. DENS (127 full, 96, 64, 0 sparser and quieter): PENDING: unit check of 62672f6f on 2026-10-24
- 8. CPU on MODWERK STATUS against the 2026-10-20 readings (SIZE 0 at
  pitch 0 and at the maximum pitch; SIZE 86; DENS 0): PENDING: unit check of 62672f6f on 2026-10-24
- 9. End state (kept installed, or removed): PENDING: unit check of 62672f6f on 2026-10-24
- Exceptions, clicks or other observations: PENDING: unit check of 62672f6f on 2026-10-24

Not part of that check, and not run on a unit for this build: two
instances with different settings (FRACT's second instance is a bypass by
design; SPACE on two tracks at once), Part save and reload, project save and
reload, a power cycle with only the card and battery RAM, a busy project
(the user's full project), PAN 127, the overview's fill time, SPACE on T3
and T7, and POLY8 installed alongside.

## An earlier build: 55f0fdff (SPACE's dry-floor top range, source ce7014f), 2026-10-24

On base `d6bfff70`: installed with `try --accept` over `ff7332b4`
(generation 1, active `55f0fdff`, inventory FRACT at handle 7, nothing
missing; the base's log records the saved set `[140ced32]`). The user's
listening: at SPCE 0 the dry grains are fine (not "like in a can"); at SPCE
127 "I hear every grain, just with space on it", the ambient smear gone;
whether the harsh highs of `ff7332b4` had left, the user could not tell.
That report is why `62672f6f` replaces this top range
(`docs/AMBIENT_RESEARCH.md`). The rest of the unit check was not run on
this build. The base's log also held an older stall record (record 5,
reason 1), not examined yet; when it was written is not known.

## An earlier build: ff7332b4 (FX2 id 7, source 57db580), 2026-10-23

On base `d6bfff70`: installed with `try --accept` with the working project
loaded (generation 1, inventory FRACT at handle 7), FRACT chosen on T1, the
project saved, power cycle: MODULES LOADED, FRACT still on T1, nothing
missing (the base's log: the boot starts with FX2 T1 = 7, the restore's set
`[140ced32]`). The user then reported SPCE at its maximum far too bright,
with the other frequencies dropping; that report is why `55f0fdff` changes
SPACE's top range. The rest of the unit check was not run on this build.

## An earlier build: 72b10956 (source 8ed2af0), 2026-10-20

Recorded in the project's `docs/HARDWARE_RUNTIME.md` ("0.10.0-dev,
2026-10-20") and `docs/M0_MEASUREMENT.md` ("0.10.0-dev on the unit"). It is
evidence for that build only. That package had the same DSP program
(`engine.asm` is unchanged since `8ed2af0`) and the same hook site; it did
not yet have the sample's name, the second-FRACT bypass, SHPE, REVS, DENS,
SCAN on SETUP B or the span kernel.

- Package `72b10956ecda18faa3551df8aa1f3164c83312fad5f9d3ef3fedcf5c87953bb3`,
  trial from 21:43:27 (`try --seconds 3600`); the base admitted the site
  `0x400041cc` with no refusal. A light project: a sample on T1, the other
  tracks empty (opening the user's full project after USB DISK MODE showed
  the base's "DSP STOPPED", cleared by a power cycle).
- CPU (MODWERK STATUS, current value): nothing installed 48-49 stopped, 56
  with T1 playing; FRACT installed on no track 54-55; FRACT on T1 at track
  pitch 0 63-68; PCM24 stereo at the maximum pitch 65-72; an overview fill
  66-72 against 65-72 without; mono formats with LOOP ON through the end
  about 70; minimum SIZE 71 at pitch 0 and up to 78 at the maximum pitch. No
  reading reached 100 and no exception came up.
- Trigs on steps 1, 5, 9 and 13 with LOOP OFF: no click and no change at
  FRACT's trigs ("the grains sound on their own; with trigs there is no
  difference").
- Accepted install; FRACT on T5 (the other core): grains and SPACE. FRACT
  on T1 as well: T1 played its sample dry, with SPACE still on (this build
  had no bypass of a second FRACT's SPACE), POS/SIZE/SCAN without effect;
  after STOP and PLAY T1 took over and T5 played dry.
- A Part switch away and back kept FRACT and its values. Project saved,
  power off and on: MODULES LOADED, FRACT back on T1 and T5 with the same
  values. FUNC held at start-up: "MISSING MODULES: FRACT 1 NOT INSTALLED",
  then `missing` listed FRACT; a plain power cycle restored it with the
  same values and sound.
- Base self-test (transport stopped): "selftest passed; modules 1/1 intact,
  1 with DSP effects; together 1/1 ran (last batch - - - - 0x9 - - -),
  peaks CPU 63.5% T1-4 44.4% T5-8 54.5%; longest frame 390 us; card set 1,
  1/1".
- `remove --accept` with FX2 NONE on T1 and T5: accepted, inventory empty;
  reinstalled at the user's request.

Not recorded in that session: the page check with a photo, PAN 127, the
fill time, SPACE on T3/T7, POLY8 alongside, RELOAD PART as such.
