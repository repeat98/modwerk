# FRACT native FLEX and START contract

This document describes the current three-grain source draft, not the archived
SPACE/source-stage experiment or a release-qualified package. The shared START
dispatch from #1029 is merged; FRACT uses that API rather than patching a stock
START site itself.

## Native control view

`native_source.h` supplies the temporary stock SRC view used during native render
and START. FRACT's custom POS/SIZE/REVS/SPRD values must never be interpreted as
stock START/LEN/loop/slice controls. The adapter validates track and published
ping lane, snapshots all six MAIN words (including fractional bytes) and six
SETUP bytes, substitutes whole-source forward looped playback with slices,
retrigger and cached TSTR disabled, then restores the exact custom bytes.

In the current layout, MAIN F supplies native pitch, with saved 64 neutral and
the native range clamped to `0x0400..0x7c00`. Older layout markers use neutral
pitch until control migration. SETUP E is disabled and does not control pitch.
Ordinary FLEX remains outside FRACT's custom translation.

`start.c` revalidates FRACT ownership and delegates to stock START through that
view, returning stock's result. `registration.c` contributes the ordinary
80-byte ABI-1 machine descriptor and a separate START record through
`runtime.experimental.json` (`ot_machines` / `ot_machine_starts`). The profile
requires explicit prototype, START and grain-only build gates. It declares
`MODWERK_MACHINE_NATIVE_FLEX` so the base retains the native voice reader across
both render halves while suppressing stock retrigger processing of custom SRC
bytes. The inherited native-FLEX fix belongs to the same draft submission #926.

## Registry and lifecycle boundaries

The base registry has eight audio-track slots. FRACT admission intentionally
permits one owner on T1–T4. Missing/duplicate/invalid START records and rejected
owners must fail closed. Existing shared START selection, voice protection and
retained-image lifetime belong to the base, not to module-owned replacement
patches. Finite AMP envelopes must silence the voice; INF sustains.

The base keeps FR:1 among its boot-preserved signatures (`known[]` in
`machine_registry.c`, added in #926); that base has not yet run on a unit.
`build_private.py` requires a compatible exact paired base with FR:1
preservation and START ABI 1 and refuses any other. Shared-base
integration and generated package rebuilding need owner review before this can
become a listed release. Do not remove that check to obtain a build.

## Reproducible evidence

`verify.py` runs `check_source.py` without firmware. That compiles the current
C engine and assembly kernel, enforces MCF54455 code generation and approved
imports, and links at two origins using synthetic base imports and a temporary
identity. No installable package is produced. Normal/profile/detail commands
and the host suite are in [README.md](README.md); results and evidence limits
are in [TESTING.md](TESTING.md).

Host tests cover native-view restoration, START policy, grain behavior and UI
logic. Tests of the historical frozen scalar oracle are labelled host-only.
Neither those tests nor the private emulator previews establish exact-public
boot/audio/USB behavior. Short private hardware feedback is reported separately.

Before release, validate the exact public source-built package across both
trigger halves, stock retriggers, empty/unloaded samples, locks/LFOs, owner
changes, STOP, Part/project changes, Keep/Undo, replacement/removal, missing
module reload and physical reboot. Physical live-trigger deletion, long stress,
companion loads and exact-public-build listening remain untested.
