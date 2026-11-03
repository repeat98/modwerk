# Marker candidate preflight

`marker_edit.c` prepares a complete before/after marker table from a validated
preview. It never writes native settings, invokes stock sanitation, saves files
or performs rollback. The conservative **preserve ordinals or refuse** policy remains
a proposal for owner review, not released behavior.

All existing records must appear at the same indices in the proposed starts.
Preserving only their positions would still let an inserted earlier slice change
the meaning of a pattern's numbered slice reference. Missing records and shifted
ordinals get distinct refusals. Existing start, end and loop fields stay exact.

Accepted new records follow the retained prefix, end at the next new start or
trim end, and disable their loops. The current conservative policy refuses
overlap, records outside trim, duplicate/unsorted starts, invalid loops, count
above 64, lengths below `min(sample_frames, 64)`, and extents outside positive
signed 32-bit range. It does not silently clamp old metadata or shorten an old
slice to fit a new one. This means many proposed grids on an already-sliced
sample will be refused; a preview must explain that restriction.

Validation finishes before the first output write. Failure leaves output
untouched. On success both snapshots include all 64 records, including inactive
rows: adding slices can overwrite inactive bytes that exact failure rollback
must retain. This does not require a player-facing Undo action.
Unused rows after the new count are copied unchanged. Before/after equality
helpers compare the count and every record field, so an intervening inactive-row
change also refuses the expected-table match.

These comparisons alone supply neither source identity nor authorization to publish.
The [candidate binder](EDIT_CANDIDATE.md) now binds them to an exact portable
preview session and revalidates the complete table under supplied ownership.
A future native service must bind the candidate to the session's owner/source,
content/metadata generation, chosen tempo and qualified playback policy, recheck
under the shared ownership boundary, and atomically publish with the actual
editor/voice/working-copy refresh. Full source validation is still required even
when marker bytes match. No stock parser is used as a transaction shortcut.

Host and target tests cover 2,144 retained-prefix candidates, 386 full-table
mutation checks, refusals and numeric boundaries. Twenty-four authored Flex/
Static candidates retain exact active/inactive records through real stock sort
and sanitation, with unrelated tempo/name/track calls mocked. The restoration
step writes synthetic memory only. These fixtures do not establish physical
persistence, pattern playback, native commit/rollback, UI visibility or click-free sound.
