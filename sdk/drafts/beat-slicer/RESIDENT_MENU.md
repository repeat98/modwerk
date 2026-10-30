# Immutable resident menu openings

`resident_menu.c` is a fixed-owner, fixed-layout experiment, not a released
loader API. It reopens a menu without rewriting or reclaiming any previously
published table. All labels, callback slots, actions, backend code and the
trampoline remain pinned for the whole boot, including after owner retirement.

Materialization copies one admitted layout exactly once. Every later opening
requires ordinary native dismissal, return from the whole selection dispatcher,
an idle selection context, the same layout generation and still-valid owners.
Only the opening serial, private selection and state change. Serial exhaustion
refuses permanently; zeroing or rematerializing the object is not allowed.

Every contributed callback uses the captured/armed/consumed selection-context
path. It must match the exact table, row, callback, task, domain, owner and
opening serial. A retained callback or old armed context cannot borrow a newer
opening. The trusted adapter must still establish the uninterrupted native
arm-to-direct-call boundary and the real loader's complete owner validation.
Two numeric owner fields in a private test are not that validation.

The native fixture keeps two independent immutable layouts for stock's six-row
and nine-row SLICE menus. Each has its own non-reused opening serial; the captured
selection ticket and UI epochs also never reset. A normal BACK or NO can be
followed by another opening. Stock rows use their original callbacks without
module selection authority. Their remembered stock selection stays in range.
The UI retains its options and issues fresh request identities after reopening.

Owner retirement closes only the outstanding owned popup and refuses later
contributions, falling back to stock. The old arrays remain readable forever.
This does not implement USB removal, memory reclamation, owner replacement or
new contributions after a module-set change. Those require a reviewed shared
base registry and loader lifecycle. It is not safe to call the older mutable
composer's detach acknowledgement merely because the window is closed.

Portable tests and full native outcomes are listed separately in TESTING.md.
The fixture changes no marker itself and exposes no Apply or Undo action.
Stock clearing and grid creation remain stock operations.
