# Module resource gauges

Every catalog module must have populated **CPU, DSP core and memory** gauges before a release. The gauges show rough relative demand using four tiers: **Minimal, Low, Moderate, High**. The arc steps are ordinal, not percentages of chip utilization or remaining headroom. A full High arc means the highest relative tier, not an overloaded processor. No exact CPU or DSP capacity denominator is needed for these gauges.

Ratings are estimates backed by source inspection or a documented comparison. Consider expensive modes, modulation/control changes, active voices and buffers. Audio effects/voices are rated per active instance; project-wide features such as USB Audio are rated while enabled. State a different workload explicitly. Minimal is useful for a small or absent added processing path; it is not a claim that the whole device consumes zero resources. Scores must not be summed across modules, processors or memory spaces.

## New modules and updates

Declare `resources.impact` in `sdk/octatrack/modules/<id>/octamod.module.json`. Start with [the incomplete template](../public/module-resource-impact.example.json); its null levels intentionally fail validation until assessed. Include:

- `conditions`: the workload, mode/modulation assumptions, active instance count and treatment of shared allocations.
- `cpu`, `dsp`, `memory`: each requires a `level` (`minimal`, `low`, `moderate`, `high`), `basis` (`source-estimate` or `measured-comparison`), nonempty `rationale`, and a module-local text `source`.

Explain what performs the work and why the tier is reasonable relative to simpler/heavier modules or a named comparison. A static instruction count or emulator comparison can inform a tier without being promoted to a hardware percentage. Memory tiers may be approximate, but must mention material buffers, code/state/tables and whether a reservation is shared or reused. The owner reviews the rationale and cited record before merging; schema validation does not establish the truth of a rating.

`scripts/modules.mjs` validates every module, verifies the referenced records exist and are nonempty, and rejects missing/incomplete gauge ratings. This gate runs in `modules:check`, `modules:generate`, `npm run check`, `npm run build`, PR CI and release CI. Draft manifests remain parseable without ratings, but cannot enter a release. There is no build flag or UI fallback that supplies generic ratings for missing metadata.

These UI estimates **do not replace** the existing [qualification requirements](MODULE_QUALIFICATION.md) for worst-case cycle evidence, exact memory inventory and real-hardware evidence. The existing cycle budget is an explicitly documented test basis, not a gauge claiming an exact whole-chip headroom percentage.

## Existing frozen versions

[sdk/module-resource-estimates.json](../sdk/module-resource-estimates.json) adds initial source-backed ratings for the eleven existing versions without editing their frozen module folders, version pins, evidence or qualification baseline. Entries pin the exact version and complete-folder SHA-256 from the existing baseline. The generator checks the unchanged folder before resolving this companion into the generated page metadata.

This companion can only reference the original baseline versions; it cannot provide ratings for a new or changed folder. PR checks preserve it once committed. A later module update needs an increased version, `resources.impact` in its own manifest and all normal qualification/OT UI evidence. Current pending-build and suspended-module restrictions continue to apply. All initial ratings remain explicitly estimated; none add measured cycle, total-memory or hardware claims to old records.
