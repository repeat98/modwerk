# Pattern Sample Locks FUNC+PART popup entry context

This stock-free note checks the supported FUNC+PART Part Edit entry against
the exact candidate and reproduced base. It does not establish a complete
popup or system stack bound.

## Binding and rooted path

- Candidate package SHA-256:
  `3e13c46fb0054d05f228b045746453e0c50dbbe52fb53b3c229d598ddd7fed79`.
- Native-source fingerprint:
  `7ea0fbdf317bfdab6a82b22869c7029ba23901cd27a3337a4bdaf8f8beeb7e69`.
- Cached candidate ELF SHA-256:
  `4c1bb41454863f61eb4cd047d11b3f6905a1c1e7d4e391967ace95f8406fd679`.
- Exact base identity `9680e9ac861ff9313ce4f7a710a37ad2aa8e9b50b2cf8c043dafa2a0b78cdffc`,
  MAIN SHA-256 `877a8d6884cb05508a59b312a0e95498c33ce4a1e2f1fe452423b0edc74fb69e`.

The candidate declares three guarded Part Edit opener call-site hooks. At each
site the reproduced base calls the stock popup opener with a four-row argument.
The exact candidate `psl_open` body has no conditional branch before its first
call, which invokes that stock opener. The stock popup routine then calls the
window manager before returning to `psl_open`. The previously recorded exact
base range checks show those popup and manager bodies match stock
([popup boundary evidence](qualification-progress-20261104.md#popup-opener-remaining-callback-boundary)).
This root is the three exact candidate hook boundaries for the documented
FUNC+PART entry; it does not claim that every upstream stock key/window
indirection has been closed. That gap does not change the ordering inside the
candidate wrapper shared by all three hooks.

## Predicates and the five close slots

The stock opener performs menu-layout work using the four-row count and writes
the ordinary menu callback/label context, then calls the window manager. That
work does not test or constrain the manager's five live close-callback slots.
`psl_open` checks `count == 4`, the expected cursor, label and menu-callback
pointers, and `psl_native_popup() == 1` only after the stock opener returns;
these predicates decide whether to show the candidate overlay. The popup check
reads the active-popup state and current menu callback/label fields, not the
five close slots.

Track `eligible` is derived later in `start_action`, after the candidate asks
the stock UI to close the Part popup. It filters the eight pattern tracks by
their Part assignment and companion-machine metadata. It is not an opener
precondition and cannot restrict callbacks the manager already ran.

The existing exact-base callback audit identifies five initial close-callback
paths: two have complete local callback bounds and three retain unresolved
indirect callees. Those are initial image values, not a live-slot invariant.
The rooted audit is bound to this candidate and base but does not close runtime
slot writes, other module patches, callback targets outside the base image or
recursive manager entry. No candidate predicate guarantees that all five slots
are empty or point only to the two bounded paths on every FUNC+PART invocation.

## Result and closure requirement

The UI context and candidate eligibility checks do not eliminate the unknown
close-callback paths. A complete popup stack bound needs an exact base contract
that, before every manager call, restricts each live slot to null or a reviewed
finite callback set, proves those callbacks' full callees and excludes
unbounded recursion, and covers companion registrations and writes. The current
candidate does not enforce that contract. A RAM snapshot on one emulator or
device invocation can document observed slots and a measured peak, but cannot
prove the invariant across supported companion states; a static guarantee
requires a base-level registration/interface contract or a base path that
avoids arbitrary live close callbacks.

The private exact-input audit and summary remain outside Git at:

- `/Users/weiyun.wang/.cache/psl-source-bound-profile-20261103/popup-entry-20261105/audit_popup_entry.py`
  (SHA-256 `bdd69822219e052f7473f7eff7b6e2d1a6ec03386056abea551de95f34ae70b7`).
- `/Users/weiyun.wang/.cache/psl-source-bound-profile-20261103/popup-entry-20261105/popup-entry-result.json`
  (SHA-256 `c7e99c5a57fc2fed1a567cb979eb9c44b665fa7e9efaf3c906b5c5cac69d753c`).

Re-run the private audit with:

```sh
python3 /Users/weiyun.wang/.cache/psl-source-bound-profile-20261103/popup-entry-20261105/audit_popup_entry.py > /Users/weiyun.wang/.cache/psl-source-bound-profile-20261103/popup-entry-20261105/popup-entry-result.json
```

It checks candidate and base pins, the three hook sites, call ordering, source
predicates, exact popup/manager ranges and the existing callback-report binding.
No hardware, Docker or emulator was used; no runtime, check or native source was
changed.
