# Module resource gauges

Every catalog module needs **CPU, DSP core and memory** ratings before release. On Octatrack module pages, the CPU gauge shows the recorded [CPU price](MODULE_PERFORMANCE.md) as a percentage of an audio frame when available. For a track machine this is the per-track budget based on hardware measurements. A version-matched hardware comparison can show the observed CPU load for its named workload while the admission price is pending. Stem Rec shows its reported peak while recording eleven stems. The gauge links to the source and workload.

The catalogue assigns CPU badges from the published version's CPU price and version-matched hardware evidence. **High CPU** starts at 10% of an audio frame, or when [a stacked hardware workload](verification/2026-11-21-octatrack-stacked-cpu-limits.json) drops renders or hits CPU FULL. **Heavy CPU** starts at 30% of an audio frame for one instance or an active project-wide mode. The card and module page show the reading and its scope.

The DSP core gauge shows the measured change in core load for one active instance, in percentage points. The evidence gives the base, scene, slot and before/after readings. When the release has hardware-backed cycles per sample, those can also supply a numeric gauge. A verified ColdFire-only build shows zero cycles of module code on the DSP. Stock playback and effects can still change the core load. The [verification record](verification/2026-11-21-octatrack-direct-dsp-code.json) pins these counts to each package or approved source. Emulator counts and modeled bounds appear in the evidence.

The memory gauge uses the qualification inventory at the supported instance count, with shared and per-instance allocations in the evidence. A measured allocation can supply a scoped quantity when the full inventory is unavailable. Two readings of occupied module-pool bytes can establish a single module's allocation when both match that exact package's loader extent. The Kits reading also includes its separately measured sample-page lease. The gauge and its breakdown show decimal kilobytes (1 kB is 1,000 bytes), using up to three decimal places to preserve the exact byte count.

When a numeric record is unavailable, the page displays the relative tier labelled **Estimated**. The four tiers are **Minimal, Low, Moderate, High**. A full High arc means the highest relative tier. A scoped CPU observation keeps the estimated tier in its evidence while the release price is pending. A measured DSP load change fills the arc by the magnitude of the change, with the sign shown in the reading. Cycle counts and memory totals use a dotted arc and their recorded units.

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
