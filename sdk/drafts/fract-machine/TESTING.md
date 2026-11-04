# FRACT testing

## Commands and exact revision

This is an unlisted source draft. The manifest pins the private source baseline
`5b5aa328c1bbed129ab6b1a65efb9353b93ede8f`; accepted centered-SIZE/UI changes and
consolidation edits were uncommitted when staged. That baseline is not an exact
qualification fingerprint for the final public tree. Run and record source
checks against the final committed revision before publication.

The README lists reproducible host, normal/profile/detail ColdFire source-check
and draft-doctor commands. `verify.py` invokes `check_source.py`; its synthetic
imports and temporary base identity validate compile/link behavior only. Tests
using `OG_FRACT_CURRENT_ENGINE` exercise the current engine; the explicitly
host-only `fixtures/fract_reference/` files are a historical differential oracle.
A proposed FR:1 preservation fixture is not evidence that public main implements
that policy. Session-wide command results belong in the consolidation record/PR;
this report does not invent results before those runs finish.

## Hardware and audio quality

User-reported short PRIVATE paired-build audition: sound with three grains,
centered SIZE, CPU approximately 80%, and no crackle reported. This is reported
functional evidence only. Exact image/source hashes, machine model, elapsed
minutes and full workload were not supplied here. It does not qualify this
public source tree. Aliasing, DC, clipping and parameter-extreme audio behavior
on the exact public build: not tested.

## Stock flows

Exact-public tests of transport, parameter locks, LFOs, scenes, MIDI, recording,
Part/project changes, stock machine restoration and shared-module composition:
not tested. The intended deliberate change is a custom SRC machine with its own
MAIN/SETUP controls; selecting a stock machine leaves FRACT. That transition
still needs exact-build hardware validation.

## Performance

Worst-case cycles, matched stock benchmark and long stress run: not tested for
this exact public build. The user's approximately 80% private CPU reading is
not isolated per-instance ColdFire cost or a remaining-headroom guarantee.
Optional profile/detail source checks compile telemetry; they do not execute it
on a unit or establish real-time timing.

## Resources

Exact linked code/state/table/buffer/stack/padding inventory and processor budgets
for an installable public package: unmeasured. The source check prints synthetic
image/BSS/relocation counts, not native package placement or maximum-load
qualification. Current admission allows one owner on T1–T4, with three grain
heads; do not extrapolate to more instances or companions.

## Hardware

Exact-public build cold boot, USB install, self-test, Keep/Undo, replacement,
removal, missing-module reload, Part/project persistence and physical reboot:
not tested. Physical live-trigger deletion and long stress: not tested. Public
main lacks FR:1 boot preservation, and `build_private.py` deliberately refuses
it. Resolve shared-base integration with owner review before qualification.

## OT UI capture evidence

The three images in `docs/media/fract/screenshots/` were supplied by ex1010 from
the private prototype in octemu. They show selection, sample loading and playing;
the screenshot README records rights and preview limitations. They do not prove
public source identity, hardware operation or listening qualification. Additional
release control-page captures and exact image/emulator/setup provenance remain
pending. No source sample, firmware, raw framebuffer, card or NVRAM is included.
