# Proposed typed menu contribution

`menu_package.c` is a base-side admission prototype for the editor-service
proposal. It assigns no event/table index, package feature bit or released ABI,
and changes neither the production loader nor its admission policy. It checks
one descriptor after its exact loader owner is published; it does not make a
package installable or prove that a whole module set is ready.

The proposed fixed 64-byte record contains a schema/size, ordering key, action
ID, image-relative handler offset and inline label. Reserved fields must be
zero. `menu_package.h` specifies its byte layout. The decoder first validates
the full owner against the real ledger and live position, then bounds the
record inside that owner's initialized image. BSS, an odd entry, the image
preamble, descriptor overlap, truncation and pointer arithmetic overflow are
refused. Labels are nonempty printable ASCII, at most 31 bytes with a NUL and
zero padding. An in-range entry is not proof of valid executable code; authored
handler code and its nonblocking C contract still require review.

Admission validates one bounded copy and freezes its fields and label in
base-owned storage. It never retains a package label pointer. The stable loader
lock pins the image but does not stop real-time module code from writing data;
the caller must additionally establish that this descriptor is stable during
the copy. A copied owner digest identifies reconstruction, not a fresh hash of
every live mutable byte. This prototype does not solve concurrent descriptor
publication or supply that native exclusion boundary.

The resulting menu view uses the existing owner-backed backend. Resolution
accepts only its admitted action and revalidates the complete current owner
lease before returning an entry. Trusted base code must retain the lock through
the call, validate actual selection authority and module-set readiness, and
retire the activation before replacement/removal. Restoring an image never
revives an explicitly retired binding. Neither admission nor resolution grants
PCM access or marker-write authority.

## Checks

`test_menu_owner_loader.py --package` extends the existing actual-loader matrix
with both stock menu models, 30 malformed records, eight altered owner fields
and four legal entry/label boundary cases per layout. It checks staged refusal,
immutable copied metadata, wrong-action refusal, one-time binding, replacement,
restoration, fresh activation and final allocation recovery. Failed operations
leave outputs unchanged. An independent Python/hashlib oracle binds the original
fixture package and controller identities; no package binary is committed.

`menu_owner_loader_native.py --package --sets` compiles the same tests for
ColdFire. Its original four-byte return-42 callback is actually reconstructed by
the unchanged loader, resolved through the typed binding and called through the
owner-backed menu model. Machine/cache/task/DSP services remain synthetic. The
host run does not execute uploaded ColdFire instructions. Reports retain the
source and unchanged SDK dependency hashes; see TESTING.md for completed runs.

The remaining production work includes reviewed table assignment and loader
preflight, stable metadata capture, native menu reference lifetime, transition
hooks, complete-set readiness and exact browser/USB/hardware qualification.
The real stock menu, source provider and Beat Slicer planner are not installed
by this isolated fixture.
