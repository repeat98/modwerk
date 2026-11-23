# Octatrack restore outcomes over USB on the owner's MKII: 23 November 2026

The base's RESTORE request (43, `feat/octatrack-restore-outcomes`, `e859f8fd4` on `base/octatrack-next` `9ac83b232`) on
the owner's MKII, OS 1.40C. Project LIVE/Dev17, Part 1, stopped throughout. One unit turn, 11:02-11:05, through the
unit queue. No flash, no power cycle, no Keep, no card write. Nothing was saved and no Part or pattern was switched.

**Builds.**
- **Development twin** `001e038ff7706eda64409d55200d9b675e50edc5cd14ba2b682c1c89b01649f2`: `build_core.py` with the
  beta flags but `--usb-input`, no controller rows, plus `--dev`.
- **Found running and booted back:** the owner session's twin `856cbbcf` (rel-08 t36).

**A restore on a twin without a Keep.** A twin restores no set another base wrote (card set 4, FOREIGN), and a twin's
own set needs a Keep, which would replace the owner's. The development request ADOPT TEST (`do adopt`) makes the twin's
next start restore the card's set the flashed base wrote, read-only: that start writes no set.

| Step | `saved` | RESTORE (`do restore`) | Installed |
| --- | --- | --- | --- |
| Twin booted on the card | 4, 0 saved | result 4, count 0, no entries | none |
| `adopt`, RAM boot | 1, 4 saved, 4 live | result 1, count 4: Grain 29,248 B, Vibrato 3,446 B, Euclid 10,100 B, Mini Verb 2,770 B, all loaded | the four |
| `guardtest` (blames the first installed package), RAM boot | 10, 3 saved, 3 live | result 10, count 4: **Grain left out, refusal 256 (the boot guard), check 0**; Vibrato, Euclid, Mini Verb loaded | Vibrato, Euclid, Mini Verb |
| `adopt:off`, boot back to `856cbbcf` | 4, 0 saved | (that twin predates the request) | none |

**The site's reader on these replies.** `do restore` parses the replies with the site's own `UsbVendorTransport.restore()`.
On the guarded reply:
- the Status card line reads "Not all loaded at startup · 3 of 4 modules running. Sync your modules to put the rest back.";
- the list names Grain, "The last start crashed or froze while loading it, so it was left out. A sync tries it again.";
- the diagnostics field is `[{"id":"grain","refusal":256,"check":0}]`.

This was rendered from the reply by `leftOutAtStartup` and `restoreDiagnostic`, not in a browser.

**Two modules left out for different reasons: not reached on the unit.** The card's set holds only these four modules,
and the twin's loader admits all of them. Neither way to make a second one refused was safe or possible:
- **A package the loader refuses:** it would have to reach a set a start restores, and that means writing the card (a
  Keep).
- **A twin without a feature a kept module needs:** Grain needs site events, but a base without `--site-events` no
  longer links (unresolved `ev_*` and frame-guard symbols).
- **Playing or a busy loader at the start:** neither can be arranged. The restore runs before the link is up, and only
  while the transport is stopped.

So the loader-refusal entry (its refusal, check and the pool's largest free run) is shown by the host test only:
`test_modset.c`, with guard, memory refusal and loaded in one set.

**Not tested.** A loader refusal at a start on hardware; a set past one page (more than five packages) on hardware;
the release image; MKI; a power-cycled start.
