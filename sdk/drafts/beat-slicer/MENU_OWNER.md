# Published menu-owner check

`menu_owner.c` is a proposed base-side helper, not a runtime module service or
installed contribution registry. Calls require the real stable loader lock,
held through any later handler resolution/invocation. It validates the complete
`runtime_owner` record and requires that exact extent to occupy a live published
position. It neither assigns an event nor extends `modwerk_runtime_api`.

A valid owner ledger record proves that the reconstructed image is still
intact and retained. It does not prove publication: staged candidates and old
rollback predecessors also have valid records. A menu must never dispatch only
because `modwerk_runtime_owner_valid` returned true. Check the current published
position as well, then enforce typed contribution admission, registry state and
complete module-set readiness. Publication alone does not supply those gates.

The optional fixed-lifetime menu lease copies the whole record. Once a query
observes it absent from current publication, or the trusted registry explicitly
retires it, it stays retired even if USB Undo later restores the same old image.
A used lease cannot be rebound or reset. A newly admitted activation needs its
own lifecycle and fresh selection authority; retained arrays still cannot be
freed merely because the owner check fails.

Explicit retirement before replacement/removal is essential. A polling check
can miss an entire replace-and-restore interval and find the same owner current
again. This helper supplies that retirement operation but does not install a
production transition hook. It is not itself a memory lease, native callback
quiescence proof or module-set transaction coordinator.

The host fixture includes the unchanged real loader tests and then exercises
staging, publication, replacement, retained rollback owners, restoration and
removal. It verifies full-record mismatch refusal and permanent observed or
explicit retirement in six loader configurations. Machine glue remains
synthetic and uploaded module code never executes. The dependency manifest pins
the exact original SDK inputs; the test checks every transitive SDK compilation
input against it. This is separate from native menu, USB and hardware evidence.

The authored helper and test extension are MIT licensed. The compiled host test
also includes the repository's unchanged GPL runtime fixture and loader, whose
licence and attribution remain in their original files. No combined test binary
is published as a module package.

A separate stock-free ColdFire fixture links and executes the helper against
explicit synthetic loader answers at every one of the 128 publication positions.
It checks complete native-sized record copies, caller-record destruction and
permanent retirement, including restoration. Stack/register and storage canaries
are checked. Those synthetic-target results are separate from the newer
`menu_owner_loader_native.py` fixture, which links and executes the unchanged real
SDK loader/SHA alongside the adapter. It covers two owners and both menu models
with the 128-position/768 KiB configuration in cached and uncached branches.
Machine services remain synthetic, no uploaded module code runs, and neither
fixture qualifies a production stock-menu/USB lifecycle.
