# Final qualification attempt — 31 October 2026

The USB-only MKII candidate remains **unqualified for public release**. The later
[public-base lifecycle run](MKII_PUBLIC_LIFECYCLE.md) passed scoped selector
Undo, exact-package Keep/reboot, removal/reboot and original-file restoration.
This record retains the preceding failed remote-input attempt and software audit.
Complete system stack qualification and first-release approval remain open.
The module runtime and version remain unchanged.

## Completed software checks

Upstream `886098f5` was merged into the preparation branch at `31bb81c8`.
`npm run pr:ready` reports Ready: frontend 2,766 tests passed with one skipped,
and the complete SDK/check pipeline passed. This is repository readiness, not
module release approval.

The ordinary public wrapper builds and checks the exact 10,048-byte candidate
`3e13c46fb0054d05f228b045746453e0c50dbbe52fb53b3c229d598ddd7fed79`.
Both unchanged stock scans and all five negative CLI probes pass. The private
USB-only catalogue fixture passes library/card refusal, source-inventory parity,
add/removal Undo preflight on seven public bases and all 29 package preflights.
No real catalogue admission or new companion runtime coverage is implied.

The isolated, network-disabled source builds also pass: the Octatrack artifact
inventory and version pins validate against committed packages, and all 28
current source-only elemod release exports reproduce. On this Mac, Git needed
an explicit `safe.directory=/source` configuration for the archived container
mount; the first Octatrack attempt stopped on that environment error. The retry
used the same immutable toolchain image and unchanged build/import scripts.

Fresh GCC 16.2.0 compilation passes the MCF54455 instruction guard and matches
the committed assembly and tested initialized runtime: 8,748 initialized bytes,
1,328 BSS bytes and 167 relocations. All 33 authored function frames remain
static or compiler-bounded, without authored recursion. Including four bytes
per internal call, authored paths are key 500 bytes, draw 296, encoder 44,
opener 40 and tick 16. Seven indirect call-graph edges remain outside those sums.
Stock callees, caller context and interrupt nesting are still excluded. The
earlier sampled hardware maximum of 612/8,192 bytes is not a stack canary or
total bound. Full system stack qualification remains open; no waiver is asserted.

## Open-selector Undo attempt

The original flashed base `2aa35c39…` was initially normal with empty live
inventory. The validated private development base `20ed7910…` was RAM-booted.
One transport and one upload session staged, activated, started and rolled back
the exact singleton candidate. The full initialized image and all three opener
sites were attested after installation. The loaded fixture's four pattern and
working/saved Part hashes matched the earlier fixture.

The first NO press did not produce its expected held-row transition, so the
runner stopped before opening the selector. Its owning session confirmed Undo
and normal state. A fresh read confirmed empty inventory, the original active
identity, stopped transport, released keys/FUNC and zero DSP errors/stalls.
That failure path did not complete the planned post-Undo site/data comparisons.
It does not qualify removal with a selector open.

With no modules installed, a separate FUNC press also failed: six polls through
500 ms showed no FUNC transition, and after release row 0 held bits `0x25`
(TRIG1, TRIG3 and TRIG6), while stock FUNC remained zero. The normalized fader
stayed zero in these observations; no remote fader event was sent. This is a
further development input failure without Sample Locks. Its precise cause is
not isolated by this run; the earlier split-packet reproduction is related
evidence, not a captured explanation of this event. Physical stillness was
requested, not independently measured throughout every packet.

No further panel events were sent. USB ownership was released and an author
power cycle was requested to leave the RAM base and clear input state. This
attempt contains no Apply, project Save, Keep or flash.

## Exact-package persistence

The original preflight reported saved state 4 (FOREIGN), despite its empty
live inventory. It lacks the read-only saved-set export request. Keep would
replace card files belonging to another base, so it was not attempted.
The existing rule in [DEVICE_TEST.md](DEVICE_TEST.md) is explicit: never Keep
over foreign saved files. Backup and review must precede any decision to use a
spare card or explicitly replace those files.

A private export-capable base build was refused by the existing MCF54455 guard
for indexed addressing in `dsp.c.o`; it was never loaded. The fallback is a
physical restart and USB Disk Mode to copy and hash both saved files. No guard
was weakened and no unrelated firmware fix is included here.

The later run backed up and validated both files, temporarily preserved them
in a separate card folder, then tested the exact singleton on public base
`2aa35c39…`. Keep/reboot and removal/reboot passed. Card readback verified the
exact candidate package and newer empty set; all 60 fixture files were unchanged.
Both original saved files were restored byte-for-byte. A final author restart
verified the original public base and empty live inventory before USB release.
See [the later method and limits](MKII_PUBLIC_LIFECYCLE.md); the older
nineteen-module literal-wrapper result is no longer the only persistence evidence.

The [stock-free receipt](evidence/final-qualification-20261031.json) pins the
private raw records and distinguishes pass, failed attempt and not performed.
Firmware, card files, raw RAM, compiled private bases and dumps remain outside Git.
