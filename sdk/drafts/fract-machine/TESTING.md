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
The FR:1 boot-preservation fixture runs on the host only; it is not hardware
evidence. Session-wide command results belong in the consolidation record/PR;
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
not tested for a listed release. Physical live-trigger deletion and long stress:
not tested. The pre-merge private-pair check below establishes only its stated
base/boot behavior, not the complete public-release lifecycle.

### Pre-merge base check — 5 November 2026

On the owner's physical Octatrack running OS 1.40C, USB installed the
`tracks-main-cue` base built from #926 source revision
`1e227430fbfaf3db6f95f19e1be2703d7e58fc42`:

- Base ID: `9b3ba41715140d5fae07868a8b2adc6d89c3ec0272d8ab34c332461cf990a14c`.
- Private FRACT package SHA-256: `a5a35eaaeb22d2361b6e8d73c9acc96df640eb4f1306dae719b2c6bb17bbae9b`.
- Installed set ID: `59cad7f1cc080efb79ecb09624fd1a22173ea392d4887c11a9474f2dee21a05f`; inventory contained one FRACT.

The owner reported successful completion of the requested short checklist:
ordinary machines and FRACT played, a Part containing FRACT was saved, the unit
was powered off/on, and the track returned as FRACT and played. The exact
project/Part name, ordinary-machine names and elapsed test time were not
supplied; these listening and panel observations are owner-reported.

Independent USB readback after that power cycle confirmed the exact base and
set IDs above, one FRACT in inventory, normal/known-active operation and a new
boot session. Slot 1 generation 7 was whole and confirmed, with one boot try
and no fallback; the previous confirmed slot 0 generation 6 remained intact.
Before the power cycle, the supported self-image update and FRACT Keep were
acknowledged, the saved set was read back (one saved/live module), and native
SELF TEST passed with 1/1 modules intact and no failures (0 DSP-effect modules).
SELF TEST was not restarted after power-on; postboot checks were read-only.

This satisfies the two short checks requested for base `9b3ba417` before source
merge. It does not qualify Undo/removal, missing-module behavior, companion
modules, long stress or a future listed package, and is not a release approval.
No firmware, card/NVRAM images, samples or USB memory dumps are included.

## OT UI capture evidence

The three images in `docs/media/fract/screenshots/` were supplied by ex1010 from
the private prototype in octemu. They show selection, sample loading and playing;
the screenshot README records rights and preview limitations. They do not prove
public source identity, hardware operation or listening qualification. Additional
release control-page captures and exact image/emulator/setup provenance remain
pending. No source sample, firmware, raw framebuffer, card or NVRAM is included.
