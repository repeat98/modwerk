# Flex metadata capture

`flex_metadata.c` decodes the observed 1.40C Flex control/settings layout into
the portable preview snapshot and complete marker table. It adds no firmware
address, hook, exported ABI, owner identity or installed source provider.

The caller supplies verified, aligned, readable regions and their word extents,
the editor kind/slot, the current project-tempo value and base-owned lifetime
identities. Capture refuses an unavailable pool, another editor source, an
unsupported loaded format, busy/empty source, invalid trim/count, missing
identity, truncated regions or address wrap. Refusal leaves outputs unchanged.
All pointers and source fields must stay stable under the same native ownership
boundary used by every writer and PCM copy. `volatile` is not synchronization.

The snapshot carries complete start/end/loop records, including inactive rows;
the separate table capture also retains all 64 rows. Neither sanitizes records
or changes settings. Session comparison uses active metadata; candidate
comparison separately checks the complete table before publication. Both tempo
values are copied independently, with no fallback when one is missing. The
planner validates the chosen value. The decoder uses the stock 44.1 kHz frame
clock; it does not recover an original file's header rate.

Native binding still must prove the selected project-tempo getter's behavior
with pattern tempo and external clock, lifetime invalidation, complete writer
coverage and cache/lock ownership. A decoded snapshot alone does not establish
PCM ownership or make an unsuccessful/released slot readable. Static and
recorder sources are deliberately outside this Flex component.

Run `test_flex_metadata.py` for host sanitizers and `metadata_native.py` with
the pinned stock-free CPU runner for compiled ColdFire execution. The fixtures
exercise all 128 slots, four loaded formats and counts 0/1/64, malformed
bindings, output preservation, and integration with the preview/candidate
callbacks. They distinguish selected-tempo invalidation from an unavailable
unselected tempo and reject changed inactive rows at candidate validation.
Memory, identities, PCM and locks in those fixtures remain synthetic. No live
reader, physical behavior or timing qualification follows.
