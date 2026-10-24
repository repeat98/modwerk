# Composed Flex source backend

`flex_source.c` joins the existing bounded metadata decoder and PCM copy into
the preview-session backend. It is original portable code with no stock
addresses, lifetime allocator, hook installation or admission switch.

The base must supply verified readable regions, a stable current source
lifetime, and the same nonblocking ownership boundary used by all relevant
writers. Metadata and PCM bindings must refer to the same control and readiness
regions. The object starts with `held = 0`; bindings and callbacks remain alive
and unchanged until every session retires. One background owner uses it, with
no concurrent calls or session reentry. Repeated acquisition while held refuses
without calling the underlying lock.

Session capture and copy occur while this boundary is held. The session checks
the source again after reacquiring and after copying, and before returning a
plan. The copy also matches the nonzero source lifetime and verifies current
format, extent and page geometry. Private decoding/planning happens after
release. Neither a successful capture nor a completed preview permits writes.

`bs_flex_source_markers_locked` captures all 64 records under that same lock
and identity. A caller composing a candidate must still validate the current
session and marker table together while locked; this helper does not grant a
publication token or compare the table with an earlier preview by itself.

The host/native fixtures cover 32 previews, ten invalidations and ownership
refusals, retaining full settings/PCM equality. Native tests execute stock page
lookup with synthetic regions and lifetimes. They do not qualify live source
admission, complete recorder/UI writer coverage, cache handling, physical lock
latency, the installed editor, or USB lifecycle. Static and recorder sources
remain unsupported. Production integration belongs behind the reviewed shared
base ownership interface, not a second module-owned stock hook.

The private `--profile-locks` full boot now measures exact source mask/restore
instruction intervals without instrumenting native code. It separates async
coordination from metadata-only validation and PCM copies with before/after
validation, reconciles every interval with lock counters, and checks saved SR.
See TESTING.md for the exact source-bound workload and measured maxima. A
bounded copy size or reader-step count alone does not bound metadata validation
cost; these instruction measurements do not establish physical lock latency.

The full-marker profile creates 64 records through the stock grid menu before
admission, then checks complete plans with EXACT/64-beat requests and normal
recording recovery. This measures one maximum metadata-count workload; format,
allocation geometry, physical timing and cache costs remain separate dimensions.
Historical evidence stays bound to its original source when report wording or
scenario flags are corrected.

The 0.1.49 metadata helper processes two complete records per iteration to reduce protected address/branch overhead. It still copies every active and inactive record in volatile order. Compare matched source-bound four-marker and full-table instruction profiles in TESTING.md; these do not establish physical latency or broaden source admission.
