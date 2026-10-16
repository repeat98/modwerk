# Octatrack beta test plan: onboarding, module sets and the loader

Written 14 October 2026 for the owner and the agents who run the tests. It covers the whole path a beta tester
walks, from an account to a kept module set, and the loader under it after the loading and packaging changes of
12 to 14 October 2026: effect ids as per-project handles and 128 of them, the union of a bank's Parts preloaded and
code moved to close holes, one independent package per module, shared stock sites as base-owned events and
tables, and the set saved on the card. Each case names its layer, its tool and its status. Results go here, in
the status column, and their detail into [OCTATRACK_MODULE_EDGE_CASES.md](OCTATRACK_MODULE_EDGE_CASES.md) and
the [migration record](OCTATRACK_ELEKLOADER_MIGRATION.md), as before. Where this plan repeats a case from the
edge-case list, it names the number there.

**What the runs are for.** The cases below are the map, not the limit. The job is to use the site and the unit with
the new base and modules the way a tester will, find the bugs and the rough edges before the rollout, fix the bugs,
and propose the workflow changes that the rough edges call for. Every session therefore ends with a tester's-eyes
pass (below) besides its scripted cases, and every finding lands in the [findings log](#findings-log) at the end of
this file, with its fix.

Status words: **open** (not run), **built** (the tool or code exists, not run against this target), **done** (run,
with the source commit, base identity and package hashes recorded), **failed** (run, with the record linked).

## Rules

- Every result names its source commit, the base identity IDENTIFY reports and the package hashes. A synthetic
  fixture is labelled synthetic. Emulator instruction counts, modelled cycles and hardware timing stay apart, and
  an old receipt is never relabelled for new source.
- The unit on the test PC is a development unit: its projects may be saved, reloaded and changed. Still ask the
  owner for every power cycle and before any flash. After a crash restart, ask for a power cycle before the next
  RAM boot. The rules and gestures are in [OCTATRACK_DRIVING.md](OCTATRACK_DRIVING.md), the failures in
  [OCTATRACK_HARDWARE_TRAPS.md](OCTATRACK_HARDWARE_TRAPS.md).
- One USB client at a time. The development session (`npm run device -- serve`), the frontend MCP and the browser
  each hold the bridge alone. Stop one before starting another.
- Software results prove no rendered layout, no audible output and no physical reboot. Those take a recorder, the
  owner's eyes and a power cycle, and stay open until they have had them.
- No firmware, stock bytes, dumps, saved sets or built images enter the repository. Receipts live under
  `~/.cache/modwerk-local/` on the test PC.

## Layers and tools

| Layer | What it covers | Tools |
|---|---|---|
| **H** host | Logic with no firmware: the loader, the DSP manager, the handle map, the saved set, the status page, the site's engine and MCP | `sdk/tests` (host C tests such as `test_dsp.c`, `test_modset.c`, `test_status.c`), vitest under `src/engine/elekloader`, `scripts/frontend-mcp*.test.mjs`, `npm run check` |
| **E** emulator | Whole images, long matrices and fault injection, about 1/15 real time under `--dsp` (6 to 8 minutes a scenario) | `ot_emu`, `scripts/verify-octatrack-dsp-loader.mjs` (pick, remove, cycles, missing, restore, probe, stock, beside, queue, union, save), `old_projects.py`, the bench socket of the vendor client |
| **U** unit, scripted | Timing, memory, the panel and the DSP on a development base RAM-booted on the owner's MKII | `npm run device -- serve`, `scripts/device-send.py`, `scripts/octatrack-qualify.py`, `-persist.py`, `-movestress.py`, `-movecollide.py`, `-movelisten.py`, `-loadbench.py`, `-measure.py`, `-xwatch.py` |
| **S** site path | Exactly what a tester's browser sends and reads: the catalogue, the packages and their validator, `OctatrackLink`, the self-test, Keep and Undo | `scripts/frontend-mcp.mjs --device-socket` ([FRONTEND_MCP.md](FRONTEND_MCP.md)), `scripts/verify-octatrack-module-sets.mjs --hardware`, the Vite dev server with the mock API and the pretend units (`?preview=usb-link&unit=base`, `unit=none`, `?preview=base-install`) |
| **B** browser | What no script reaches: Chrome's device chooser, WebUSB on each operating system, the dialogs, the layout, the pill | The owner or a tester in Chrome against the dev server or the live site, with screenshots |
| **O** owner at the unit | Power cycles, FUNC at boot, the flash, the arranger, listening | The checklists in Part 3 |

## How a run works: discover, record, fix

1. **Both hands on the controls.** The agent drives the site's path through the frontend MCP (what a tester's browser
   sends) and the unit through the development session (keys, encoders, what each track runs, memory, the loader's
   counters), with T1 so both share one USB owner. The owner does what needs Chrome, a cable or the power switch.
2. **Scripted cases first**, from the session's list in Part 3, each with its snapshot before and after.
3. **Then the tester's-eyes pass.** Walk the journey of Part 1 from the start without the scripts, as a tester who has
   never seen the site would, and note every moment of confusion, waiting, or a word that does not match the unit's
   screen. Pick effects by hand on the unit, switch Parts, pull the cable, close the tab. Write down what happened
   and what you expected, even when nothing broke.
4. **Record every finding** in the log at the end: where it was found, what happened, its kind (a bug, friction, or
   an improvement), and the exact identities (source commit, base, packages). A bug gets a reproduction in one of the
   layers above, the cheapest that shows it.
5. **Fix bugs on a branch with a regression test**, as a pull request into the integration branch; a fix to the base
   changes the tester image and needs the affected cases rerun on the new image. Write the fix's record into the
   log and, where it is a trap or a behaviour every later developer needs, into the file a reader would open for it.
6. **Propose improvements** as a short note in the log: what a tester does today, what they would do instead, what it
   costs. The owner decides; nothing user-facing changes without that decision.

**Friction already known** (so the passes do not rediscover it):

- MODULES LOADED and MODULES SKIPPED show for a moment and MISSING covers them half a second later (edge cases,
  deferred past the beta).
- A set syncs change by change; one Keep or Undo held by the base for a whole set is not built.
- The MCP's trial guard refuses more than one change, so the full set runs through the site's own path only.
- Only a module's latest version is published; a set naming an older one is normalised.
- Every unit reports the same USB serial, so the site cannot tell two units apart.
- Spectrum and Modulation appear in the chooser under their catalogue names, Spectrum79 and Modulation79.
- A tester on an iPad has the card route only (no WebUSB).
- The base install prompt cannot be closed for 10 s, by design; a tester may find that long.
- A failed sync files no report by itself yet; the tester presses Report a problem.

## Before the runs

**What has to land first** (the handover of 14 October, `HANDOVER.md` on branch `handover/all-twenty-20261014`):

1. `lane/sidechain-matrix`, `lane/machine-events` and `lane/analog-bd` merged into the integration branch, and the
   Analog BD package built through the machine-events path.
2. The owner's decision on the strict stock-free scan and runs of 0xFF. Without it no subscriber package (Repitch
   0.2.0, POLY8 0.3.0, Mute Modes 0.2.1) passes the scan.
3. `module-set.ts` handling event and table packages, and a public base built with `--site-events`.
4. Two images from the same source commit: the **development twin** (`build_core.py --dev --dsp-loader`, with the
   status meters and the development requests, RAM boot only) for layer U, and the **tester image** (`npm run
   octatrack:base`, the bytes a tester's browser builds) for layers S, B and O. Record the `.bin`, MAIN and base
   hashes of both.

The FX cases of Part 2 can start on the current integration base before 1 to 3 land. The machine cases run in the
emulator until the merges are in.

**Tooling to build first.** Each is small and each unblocks several cases.

| # | Tool | What it does | Status |
|---|---|---|---|
| T1 | One USB owner for layers S and U together | `device.mjs serve` offers a second socket that speaks the bridge's adapter protocol, so the frontend MCP connects through the session instead of the raw bridge. Then the site path can sync while the session reads what each track runs. Until then S and U alternate, with the bridge restarted between them | built (run 2): `npm run device -- serve --share PATH`, then the MCP with `--device-socket PATH`; each of its control transfers runs between the session's (`shareBench` in `usb-bench.mjs`, host tests). Not yet run against the unit |
| T2 | A fixture project | `ot_spec.py` builds the scratch project MODWERK-TEST2 on the development unit: bank A FX-heavy (every module FX somewhere, both slots, both cores, parameter locks, LFOs, scenes), bank B machine-heavy (POLY8, VECTOR, FM Synth, Analog BD, Scale Quantizer, with stock FLEX tracks beside them), bank C naming modules the set lacks, bank D stock only. Every working Part equals its saved Part. Described in this file once built, so it is rebuilt by one command | open |
| T3 | `octatrack-persist.py` snapshots more | Each track's machine signature, the rows of `ot_machines` and `ot_sequencer_rows`, each event's handler order, the saved set's generation and count, MATRIX | open |
| T4 | `octatrack-qualify.py` instance matrix | `--instances N` places one module on N slots of one core and then of both; `--machine` assigns tracks through the machine chooser (the Analog BD hardware plan needs the same step in `-measure.py`) | open |
| T5 | Emulator fault scenarios | A sync of k packages refused at the k-th, once per refusal code; a damaged package; another base's configuration hash; a stock-site mismatch; the host silent for 10 s mid-upload; a second client while one holds the unit. Each must end at the exact baseline inventory, and the site's words for each refusal are checked | open |
| T6 | A recorder on the test PC | `rec` is the Mac tool. The Windows PC needs a capture of the Octatrack's USB audio (MAIN and CUE) that `-movelisten.py` and the clap comparisons can call | built (run 1): `C:\Users\Public\modwerk-usb\rec.py` records the 20 USB channels (8 tracks, MAIN, CUE) with sounddevice in the bridge venv; glitch and MAIN-click detectors in the run's private tools |
| T7 | The public comparison | The visitor and member comparison against main (visible text, screenshots, API traffic) lived in `~/.cache/modwerk-octatrack/frontend-tools/` on the Mac. Port it to this PC or rebuild it | open |

## Part 1: Onboarding

The tester's path, in the order a tester meets it. B cases are the owner's in Chrome unless a tester reports them.
S cases run through the MCP, or through the dev server with the mock API where everyone is a signed-in beta tester
and the pretend unit.

### Account and access

| # | Case | Expect | Layer | Status |
|---|---|---|---|---|
| 1.1 | Register with an email address, verify, first sign-in | Signed in after the verification, led into the forum, a username set (main #195) | S (API), B | open |
| 1.2 | A member who is not a beta tester, and a visitor | Main's site exactly: the word configuration, no `#octatrack` route, no USB link, no base install prompt, beta modules paused. Checked with T7 | S, B | open |
| 1.3 | The admin grants beta access (Admin, Accounts, Beta testers) | The next session read shows the beta interface; the moderation log holds the grant. Revoking hides it on the next read; a running sync finishes first | S, B | open |
| 1.4 | A beta tester on a phone or tablet | The beta interface without the USB link and without the base install prompt. An iPad has no WebUSB, so the card route must work there | B | open |
| 1.5 | A beta tester in Firefox or Safari | No WebUSB: the site says so and offers the card route, with no error | B | open |

### The base install prompt

| # | Case | Expect | Layer | Status |
|---|---|---|---|---|
| 1.6 | The first beta visit on a computer | The dialog once, after any other dialog has closed, and not on account, sign-in, admin or legal pages. No close button for 10 s and Escape does nothing; then Later | B | open |
| 1.7 | Escape before any click | Closes for this visit only and returns on the next (Chrome's rule). Later records the marker and it never returns | B | open |
| 1.8 | The marker is shared | After Later in one browser, a second browser and a phone do not show it. `GET /api/auth/base-install-prompt` answers beta testers and administrators only. The marker is in the account export and gone with the account | S (API) | open |
| 1.9 | Reopening it on purpose | The USB card on the Octatrack page's Setup opens it at any time | B | open |

### Building and installing the base

| # | Case | Expect | Layer | Status |
|---|---|---|---|---|
| 1.10 | The wrong OS file | OS 1.30, 1.40B, a module package, a truncated 1.40C, a renamed text file: a refusal that names what is wrong, nothing downloaded, the dialog still usable | S (vitest, the MCP's firmware path), B | open |
| 1.11 | The right OS 1.40C file | The worker builds the base. The `.bin`'s SHA-256 equals the tester image `npm run octatrack:base` builds at the same commit, and on the live site the flashed image's. The build time on a slow laptop is noted | S, B | open |
| 1.12 | The copy stage | USB DISK MODE, the `.bin` at the top level, eject, leave USB DISK MODE: the instructions as written work on the MKII. A tester checks the wording on an MKI | O | open |
| 1.13 | The install stage | OS UPGRADE, YES, confirm; power stays on until the project shows; the 1.40C readme's restart prompt is followed when it appears. `check_flash_safety.py` passed on the exact `.bin` before anyone flashes it | O | done for beta3 (12 October); open for the next image |
| 1.14 | The connect stage | Chrome's device chooser once, on a click. The site recognises the base identity it expects and returns to the set, also after a page reload during the install | B | open |
| 1.15 | Windows | Chrome on Windows: WinUSB binds by itself with no driver, frames fit the 4 KiB limit, the chooser lists the Octatrack | B | open |
| 1.16 | macOS and Linux | The same on macOS. On Linux, whether the user needs device permissions and what the site says when the chooser lists nothing | B | open |
| 1.17 | A second unit, or the stock OS back on | The site sees stock, says so and offers the dialog. A kept set on the first unit is unaffected | B, U | open |
| 1.18 | FUNC held at boot | MODULES SKIPPED, everything the project names missing, the next normal boot restores the set (edge case 15) | O | done on beta3; redo on the final image |
| 1.19 | A base update later | A new tester image: the site says the base is old and leads to the card route. After the update the saved set is refused as another base's and the site reinstalls the set. The project's module map and knob bytes survive | S, O | done for the site's prompt on beta3 (run 1): base-bound and subscriber packages get "Install the latest Modwerk base from the card"; plain FX still review. The card route itself is open |

### Module sets and the library

| # | Case | Expect | Layer | Status |
|---|---|---|---|---|
| 1.20 | A new set, modules added from the library | + adds to the set you edit, which the sidebar and top bar show. Beta modules carry the badge. A module without a USB package is marked Card only and Sync is held back | S, B | open |
| 1.21 | Starting points, Import, duplicate, rename, share, export JSON, delete | Each from the ⋯ menu. Exported JSON imports back equal. A share link opens for a visitor as main's view | S, B | open |
| 1.22 | An empty set while the unit has modules | The offer to start from the unit's modules; accepting it equals the inventory | S | open |
| 1.23 | A set naming a version other than the latest | Normalised to the current version, since only the latest is published, and the review says so | S | open |
| 1.24 | A set that takes stock effects out of the menus | `prepareUpdate` refuses it; the stock tiles stay hidden while a base is connected | S | open |

### The guided sync

| # | Case | Expect | Layer | Status |
|---|---|---|---|---|
| 1.25 | Review | Stays, Adds and Leaves equal the difference to the inventory. Each package's hash matches the manifest, and the forward and Undo packages are verified before anything is sent | S | done for 19 single-module reviews on the tester image (run 1) |
| 1.26 | Sync while the unit plays | The base refuses, the site waits and says so, and goes on once the transport stops | S, U | open |
| 1.27 | Sync, self-test, Keep | Removals first, then installs. The self-test record says passed, INVENTORY equals the set, the card set is saved and read back | S | failed on the tester image (run 1): 15 of 19 kept one by one; E-Verb, Sidechain, Output Matrix and Analog BD fail the self-test (findings 3-5) |
| 1.28 | Undo | Back to the exact previous inventory, newest change first. A removed module the site does not publish is named as not restorable | S | done once on the tester image (run 1); the MCP refuses Keep over beta3's card set (finding 6) |
| 1.29 | A failed self-test | Undo by itself, the failing check named, Report a problem offered | S, with E injecting the failure | open |
| 1.30 | A refusal part way through a set | The trial rolled back, the kept changes undone newest first, the inventory at the baseline, the reason in the site's words | E (T5), S | open |
| 1.31 | The tab closes, or the cable goes, mid-trial | The base rolls back about 10 s after the last request. Reconnecting shows a consistent inventory, and the next sync sends only the difference | S, U | done once for the CLI on usbtest6; open for the site |
| 1.32 | Two tabs | The second tab says another tab is using the unit; the Web Lock releases when the first finishes | B | open |
| 1.33 | The pill | On every other page while a sync runs or waits for Keep or Undo, and for its result | B | open |
| 1.34 | A reload during the dialog | The state comes back; a pending base install returns to Connect. A trial cannot be dismissed, and closing it undoes | B | open |

### Status, Backups, MISSING and reports

| # | Case | Expect | Layer | Status |
|---|---|---|---|---|
| 1.35 | Status | Meters and the five-minute graph read while the page shows and stop when it hides. The last self-test and the card come from the base's record. What is on the unit, and this browser's last 20 syncs | S (`device_load`, `device_status`), B | open |
| 1.36 | Backups | Both saved files export with verified hashes; a base without the export says so | S (`device_saved_backup`) | done once on the private 59ba5f8b base; open on the final image |
| 1.37 | MISSING | A project naming a module the set lacks: the hub lists the names and offers Add to set; names the library does not know are shown as such; the list clears when the module arrives | S, U | built; open in a browser with the unit |
| 1.38 | Report a problem | After a failed sync and from the hub. The report carries the base identity, the set's hashes, the loader report, the self-test, the crash record and no project data. The GitHub mirror and the reporter's bell | S (API, a disposable Worker database) | open |
| 1.39 | The diagnostics invitation | After the account's first compatible connection, once any dialog has closed. Consent version 2026-10-15.1; dismissing collects nothing; a visitor never sees it | S, B | open |

### The live site after the merge

| # | Case | Expect | Layer | Status |
|---|---|---|---|---|
| 1.40 | Visitor and member unchanged | T7 against the previous deployment | S | open |
| 1.41 | The owner sees the beta interface | | B | open |
| 1.42 | A base built on the live site hashes to the flashed image | | B | open |
| 1.43 | Every published package downloads and matches its manifest hash | `verify-octatrack-module-sets.mjs` preflight against the live site | S | open |
| 1.44 | `/api/auth/base-install-prompt` answers | Migration 0071 applied | S | open |

## Part 2: The loader on the unit

Every case runs first in the emulator where it can and on the development twin after. A **smoke set** is two FX
packages and one machine package; the **full set** is all twenty. Unless a case says otherwise, run it stopped and
again playing, and read the loader counters, the crash and stall records and the longest frame gap afterwards: no
error, rejection, rollback, stall or crash, and frames never stopped.

### 2A. Install, remove, update

| # | Case | Expect | Layer | Status |
|---|---|---|---|---|
| 2A.1 | Install the full set, one by one and then as one sync | INVENTORY lists all twenty; the pool bytes noted; the self-test passes with its largest batch | E, U, S | failed (run 1): all 19 install on the dev twin without the self-test, but then the CPU sits at 100 % and the unit refuses uploads (finding 5) |
| 2A.2 | Remove a module nothing runs | Its code freed, its chooser row gone, a pool hole left; reinstalling fills it | U | done for single modules; open for the full set |
| 2A.3 | Remove a module a track runs | Refused as in use, nothing changes, the site says pick another effect first. Then with the track changed and only a saved Part naming it: allowed, MISSING names it, the slot runs dry with its bytes kept (edge case 8) | U, S | done on the twin (run 1): Air Chorus playing on T3/T4 refused with code 7, audio uninterrupted |
| 2A.4 | Update a module in place, same layout | Refused while a track runs it (edge case 7). With no track running it: the old code out, the new in, the saved Part's knob bytes unchanged, the chooser row kept | U | open |
| 2A.5 | Every refusal reaches the site in words | No free handle, DSP memory, cycles, busy (refusal 5, retried by the site), in use, a raw patch on an owned site, a stock-site mismatch, another base's configuration hash, a damaged package. Each with the live set unchanged | H, E (T5), S | open |
| 2A.6 | Install while playing | The base refuses and the site waits; a removal while playing is allowed | U, S | run 1: the base presses STOP for every install and removal while playing (finding 7) |
| 2A.7 | Pool churn | Install and remove the full set in random order 50 times; the pool's holes and largest free run tracked; the bytes back at the baseline at the end | E | open |
| 2A.8 | Install order | The five machines and the three subscribers installed in two different orders: the chooser rows, each event's handler order and the pages equal; a Part saved under one order reloads under the other | E, U | open |
| 2A.9 | A module's own project lines | PLAY MODES and SCALE QUANTIZER lines survive a save while installed and are dropped by a save while not (a known limit): seen again and still documented | U | open |

### 2B. Multiple instances

| # | Case | Expect | Layer | Status |
|---|---|---|---|---|
| 2B.1 | N instances of each FX module on one core, then on both (T4) | Up to eight of a small one. The n-th is refused by the cycle ledger exactly where the declared cost says, with the reason on screen, and the track keeps its effect | U | open |
| 2B.2 | Whole-block FX2 users | With Sidechain installed the fourth whole-block user on one core's FX2 is refused; without it, admitted | E, U | open |
| 2B.3 | Isolation between instances | Knobs, parameter locks, an LFO and a scene on one instance leave the other instance's lane and audio unchanged (recorded, T6) | U | open |
| 2B.4 | The same module on FX1 and FX2 of one track | Where the module allows both slots (TapeHead): two instances, each from its own stored bytes | U | done on the twin (run 1): TapeHead on T3 FX1 and FX2 together; not listened against dry yet |
| 2B.5 | Shared code, separate state across a Part switch | Both instances start from their own stored values after the switch | U | open |
| 2B.6 | A move with two instances of one id | One dispatch word rebinds both; listened to with the movelisten method | U | open |
| 2B.7 | Machines on several tracks | POLY8 on several tracks; Analog BD on one to four tracks, 808 and 909 mixed, with a stock FLEX track beside; FM Synth on several; VECTOR. The registry's type, assign and leave per track; stock FLEX tracks untouched | E, U | open |
| 2B.8 | T3 and T7 | A whole-block FX2 module on T3 and T7 beside other FX2 users, where stock owns words inside those blocks | U | open |

### 2C. Parts, patterns and banks

| # | Case | Expect | Layer | Status |
|---|---|---|---|---|
| 2C.1 | Part switches while playing, with Parts that differ in instance count, in which core holds a module and in the module on a slot (fixture bank A) | Each Part runs its own effects; no packet at the switch within the preloaded union; the switch dip no worse than stock's | U | done for the earlier set (12 switches); open on the fixture |
| 2C.2 | A pattern queued from another bank | Its Part's modules load at queue time, none at the switch. A bank that never fits falls back to loading what runs | U | done for one case; open for the fixture and the fallback |
| 2C.3 | A switch into a Part naming a missing module, then the module installed mid-pattern | The slot runs dry, frames go on (edge case 18); after the install the slot starts from its init with the Part's values | U | second half done on the twin (run 1): Air Chorus started on T3/T4 when it arrived |
| 2C.4 | RELOAD a Part with modules | Working equals saved afterwards; SAVE PART FIRST on a Part never saved, and nothing changed | U | done; redo on the final image |
| 2C.5 | A machine type changing at a Part switch (fixture bank B) | FLEX to POLY8 to Analog BD to FLEX across Parts while playing: voices stop cleanly, the registry assigns and leaves, no stall | E, U | open |
| 2C.6 | A track without trigs after a playing bank change | Keeps the old bank's effect until its next trig (known); seen again and documented | U | done; redo |
| 2C.7 | Scenes and the crossfader on module knobs across a switch | Recorded (T6); the bytes came back before (edge case 13), the sound has not been listened to | U | open |
| 2C.8 | Pattern chains and the arranger (edge case 19) | Bank and Part changes under the arranger with modules | O | open |
| 2C.9 | A Part switch during a move, during an install, during a waiting pick | Movecollide, with a remove step added | U | done for pick, part and install; open for remove |
| 2C.10 | FUNC+PART: RENAME, RELOAD, SAVE, SAVE ALL with modules | Each does what stock does and the map lines ride along; PART+FUNC+PLAY is never used | U | open |

### 2D. Admission at the limits

| # | Case | Expect | Layer | Status |
|---|---|---|---|---|
| 2D.1 | The full set installed, the largest selection the ledger admits on each core | The next pick is refused with its reason; a stock effect is never refused, since stock is admitted first | U | open |
| 2D.2 | MODULE LOAD with modules installed | Each module's share is of its core's DSP budget, the same figure the box after a pick and the STATUS page's DSP rows use; never seen on the unit yet | U | open |
| 2D.3 | Each module's cost on the unit | `-measure.py` typical and worst on both cores; the declared cost at least the measured one. Analog BD per its hardware plan, with `kind: hardware` afterwards | U | open |
| 2D.4 | Free words without a run that fits | Refused as memory after the base lets go of what it holds; the planner closes the hole, or the case is the known one that cannot close and is recorded as such | U | done once; redo under the full set |

### 2E. Code moves

| # | Case | Expect | Layer | Status |
|---|---|---|---|---|
| 2E.1 | Movestress, 60 steps playing, with the full set installed | No error, stall, rollback or rejected packet; no hole left; the longest frame gap noted | U | done for the earlier set; open for the full set |
| 2E.2 | Movecollide, playing: pick, Part switch, install, remove | Each succeeds or is refused as busy and retried, and the hole closes after | U | done for three kinds; open for remove |
| 2E.3 | Movelisten with TapeHead and E-Verb, then with two instances | MAIN identical sample for sample through a moving module, as before | U (T6) | done once on the Mac; open on this PC |

### 2F. Events and tables

| # | Case | Expect | Layer | Status |
|---|---|---|---|---|
| 2F.1 | Repitch and POLY8 on `ev_play_increment` | A POLY track ignores REPITCH; the other tracks repitch; both install orders | E, U | open |
| 2F.2 | Mute Modes and POLY8 on `ev_voice_bind` | A muted track's reset is dropped in OTFX-T and DT-T; POLY8's extension voices stop only when the reset is not dropped; both orders | E, U | open |
| 2F.3 | Mute Modes and Sidechain through `ev_mute_keep` | The key track keeps its audio while muted; with Sidechain removed the answer is 0 and the track mutes as stock does | E, U | open |
| 2F.4 | FM Synth and Scale Quantizer | Both installed: FM's quantizer serves; each alone works alone | E, U | open |
| 2F.5 | Output Matrix | MATRIX kept across a power cycle (O); a project saved in MATRIX and loaded without the module plays STUDIO with no box ticked (known) | E, U, O | failed (run 1): MATRIX cannot be selected in OUT CFG; NORMAL and STUDIO can (finding 1) |
| 2F.6 | Analog BD leaving | FLEX with stock defaults in both Part copies on leave and on removal; its 12 bytes kept from the validator while installed; a saved Part with its signature loaded while it is absent reads STOCK with its bytes kept and no validator complaint | E, U | blocked (run 1): ANALOG BD is listed in SRC SETUP but does not assign (finding 1) |
| 2F.7 | More contributors than a table has room for | Refused as full, nothing changed (synthetic packages) | H, E | open |
| 2F.8 | A raw patch on a base-owned site | Refused by the gate before the build and by the loader on the device | H | built (gate); open (loader) |
| 2F.9 | A row rewrite while a chooser is open | The paused-task fence covers the table readers: no stale pointer, no crash | E | open |

### 2G. Persistence and boot

One matrix. Rows: an FX module with a handle (E-Verb), a pinned FX (Tape Echo), a machine (POLY8, Analog BD), a
ColdFire-only module (Repitch, Mute Modes), a table contributor (Scale Quantizer), MATRIX. Columns: Part reload,
project reload, project change and back, RAM boot, power cycle, FUNC skip then a normal boot, SAVE TO NEW and
EXPORT TO SET (edge case 11), the battery-RAM map and the project file disagreeing (edge case 12). Expect every
assignment, knob, signature and row back byte for byte (`-persist.py` with T3). Layer U for the first four
columns, O for the rest. Status: done for E-Verb, Euclid and TapeHead through Part reload, project reload and RAM
boot; open for everything else.

### 2H. Old projects

| # | Case | Expect | Layer | Status |
|---|---|---|---|---|
| 2H.1 | A stock 1.40C project | Opens with the same effects and values | E, U | done (emulator); open on the final image |
| 2H.2 | A project saved with the static builds (Tape Echo 15, Euclid 29, TapeHead 31, Sidechain over COMPRESSOR 24) | Each slot plays what it did, or runs dry and is named | E, U | open |
| 2H.3 | A project saved on beta3 | Opens on the final image with its map lines honoured | U | open |
| 2H.4 | A project at an id past 31 | Survives save and card load (effect ids step 7) | U | done on the migration branch; redo |

### 2I. Soak and records

| # | Case | Expect | Layer | Status |
|---|---|---|---|---|
| 2I.1 | `-qualify.py --soak 1800` with the full set | Peaks under 90 %, no error, the Part back as saved, every module removed at the end | U | done for eight modules; open for the full set |
| 2I.2 | The self-test, from the panel and over USB, with the full set | Every module intact and ran, the card set saved and read back | U | open |
| 2I.3 | A deliberate crash and its record | Recovered without a power cycle; the record decoded on the next development boot (the beta3 record is still unread) | U, O | open |
| 2I.4 | The stall record | None new after every run above | U | open |
| 2I.5 | MODULES LOADED and MODULES SKIPPED readable | The deferred popup issue: the restore's message covered by MISSING after half a second | B, O | open |

### 2J. Audio

| # | Case | Expect | Layer | Status |
|---|---|---|---|---|
| 2J.1 | The clap pattern through each module on both cores against dry | Each module heard on both cores, as E-Verb, Tape Echo and Euclid were | U (T6) | done for three; open for the rest |
| 2J.2 | The switch dip | A module switch no worse than stock's hard switch, 2 ms windows against the same spot a cycle earlier | U (T6) | done once; redo under the full set |
| 2J.3 | Moves and instance isolation | 2E.3 and 2B.3 | U (T6) | open |

## Part 3: Order, sessions and the owner's part

**Session 1, no unit.** T1 to T7; the emulator fault scenarios; the host and MCP suites; the public comparison's
baseline. Nothing here needs a power cycle.

**Session 2, the unit, FX only, on the current integration base.** One power-cycle OK at the start, then RAM boots
of the twin. 2A to 2E for the FX packages, 2G's first four columns for the FX rows, 2H, 2I. Then the tester image
RAM-booted for 1.25 to 1.37 through the MCP.

**Session 3, after the merges.** The machine cases in the emulator first, then on the unit: 2A.8, 2B.7, 2C.5, 2D
whole, 2F, 2G's machine rows, and the Analog BD hardware plan.

**Session 4, the candidate.** Both images built from the release commit. `-qualify.py` on the twin, then the tester
image RAM-booted for the S cases, then the owner flashes it once. Part 1 end to end in Chrome by the owner (1.6 to
1.39), with the power-cycle batch below.

**Session 5, live.** 1.40 to 1.44 after the deploy, then the tester note.

**The power-cycle batch** (owner, about eight, each with a `-persist.py` snapshot before and after):

1. Edge case 16: a normal power cycle restores the set.
2. FUNC held at boot skips it (1.18).
3. The next normal boot restores it again.
4. After a Part with machines kept: the signatures and rows back (2G).
5. MATRIX back (2F.5).
6. After heavy churn (2E.1): the set and the Part back.
7. The battery-RAM map and the project file set to disagree (edge case 12): which wins, recorded.
8. After the crash test (2I.3): the record read.

**Only the owner can do:** the power cycles, FUNC at boot, the flash, the OS upgrade from the card, the arranger
(2C.8), the Chrome device chooser and every B case, listening where T6 is not enough, the MKI wording (1.12).

## Before the rollout (as of 15 October 2026)

Pick up here. In order; **O** needs the owner at the unit.

1. **Finish the engines-on-demand pull request** (branch `claude/octatrack-engines-integration`; steps in `docs/OCTATRACK_RESIDENT_ENGINES_ON_DEMAND.md`, "Where this stands"): changelog notes for the five rebuilt base-bound packages, docs, every CI check run serially on the WSL test PC, a development twin of the committed beta base `acf91e0a…` (on demand, merged with main after #619) checked on the unit, then the pull request.
2. **Flash the release base** (O) and check that a kept set survives a power cycle (case 1.18); until now the new bases ran from RAM only.
3. **FUNC held at boot skips the module restore** (O, edge case 15): the testers' escape hatch if a module breaks a unit at startup. Built, never run. Also run absent-module case (c) of finding 24 with it.
4. **Finding 6, a base update versus the testers' saved sets:** every beta3 tester's card holds a set for another base and the site refuses Keep there. This release changes the base again, so every tester hits it: give it a migration path.
5. **On the release base:** E-Verb kept beside a stock reverb on core 0 (findings 3 and 35; engines on demand raise core 0's arena from 2,396 to 4,418 words), a deliberate Analog BD first-note run (finding 15), VECTOR's removal (finding 29).
6. **The tester flow on the site** (section 1: sign-up, beta grant, phones and Firefox/Safari, building, copying and flashing the base, connecting on Windows/macOS/Linux, sync, failed sync, reports), through the frontend MCP with the unit at hand.
7. **The owner's open decisions** below.

Not blocking: install while playing stops the music (finding 7, say so on the site?), the MISSING dialog holds the keys (10), Part 1 once not taking (27) and a single click at 100 % CPU (9), both unconfirmed; module code's speed (20, 33; the cached-code prototype crashed, 22).

## Open decisions for the owner

1. **The beta sync path.** The site syncs a set change by change and keeps each but the last as soon as it is in;
   the MCP guard refuses more than one change. Test the site's path as it ships (this plan assumes so), or wait for
   one atomic bundle with a retained baseline journal.
2. **Scope now.** The arranger (2C.8) is in. SAVE TO NEW and EXPORT TO SET (edge case 11) and paste between
   projects (edge case 9) are listed but could wait until after the beta.
3. **Power cycles per sitting.** The batch above is about eight.
4. **Which operating systems and browsers the testers use**, so 1.15 and 1.16 cover them, and whether any tester
   has an MKI.

## Findings log

One row per finding, newest last. Kind: **bug** (behaviour against the plan or the design), **friction** (works, but a
tester stumbles), **improvement** (a workflow change to propose). Identities: the source commit, the base identity
and the package hashes the finding was seen with. A bug's row links its reproduction and its fix's pull request.

| # | Found in | What happened, what was expected | Kind | Identities | Fix or proposal | Status |
|---|---|---|---|---|---|---|
| 1 | U, twin | Sidechain, Output Matrix and Analog BD never activate: their controller slots stay BOUND, the reset never acknowledged. No KEY page on COMPRESSOR SETUP, MATRIX refused in OUT CFG, ANALOG BD does not assign (POLY8 does). The base's owned DSP job channel is closed on both cores right after boot (`owned_closed` 01 01): a refused PEEK meter read was released as a failed job, and the release closed the sticky channel | bug, blocker | run 1 | claude/fix-owned-channel-closed (regression tests in test_owned_transfer.py); verified on the unit (finding 12) | fixed |
| 2 | U, twin | Sidechain also waits in BOUND while a stock delay or reverb (or any buffer-reading module) is on T3 or T7 FX2: the idle check counts each live FX2 buffer as its whole 16K block, which overlaps Sidechain's key tail. Host tests stubbed that check | bug, blocker | run 1 | fixed in #603 (Sidechain ACTIVE beside stock delays on the unit) | fixed |
| 3 | S, U | E-Verb cannot be kept: DSP FULL beside a stock reverb or delay on core 0, self-test bit 7 "doesn't fit on the DSP, even on its own". The resident engines take 2625 words of core 0 and 1748 of core 1 for good (arenas 2396 and 3269, were about 5020). The self-test only tries T5 FX2 beside the Part's effects, never core 1, where E-Verb fits | bug and design decision | run 1 | owner: Analog BD on core 1 only plus a smaller receiver frees core 0; self-test retry on core 1 and wording as a Fix PR | open |
| 4 | S, U | An installed controller costs 15-19 points of ColdFire CPU even unused: the sc_norm and page_levels wrappers take a full lease every frame, each with about eight uncached owner and hash checks. 14 packages 69 %, + Sidechain 87 %, + Output Matrix 100 %. The self-test refuses all three ("overloads the CPU"). Reordering owner_snapshot alone recovered about 3 points | bug, blocker | run 1 | fixed in #603 (with 13; about 71 % CPU playing with all 19) | fixed |
| 5 | U, twin | At 100 % CPU the unit is locked: uploads and removals fail ("hello was not confirmed", "kept refusing the submission"), picks take over 5 s, T3 drops out for seconds. A saved set that restores into this state leaves FUNC held at boot as the only way out | bug, blocker (follows from 4) | run 1 | fixed in #603 with 4 | fixed |
| 6 | S (MCP) | After a base update every beta3 tester's card holds another base's set. The MCP refuses Keep there ("Keep would replace saved files from another base"), the site's Keep overwrites it without a word, and the tester base cannot export a backup | friction | run 1 | decide: the site says it replaces the old set, or the MCP accepts what the site does | open |
| 7 | U | Asked to install or remove while playing, the base presses STOP itself and the site retries; the music stops. By design in the code (octatrack-link.ts), but case 2A.6 expected removals while playing | friction, plan mismatch | run 1 | owner decides; the plan is corrected to the design | open |
| 8 | B | Before a power cycle Windows listed only the Octatrack's mass-storage function, no vendor interface, so Chrome showed nothing to connect | friction | run 1 | tester note: power-cycle when the site sees no unit; cause not known | open |
| 9 | U | One click on MAIN only (-0.65 to +0.47 in one sample, no track shows it) at 100 % CPU; not seen again in 30 s with the controllers or 60 s at full load | bug, unconfirmed | run 1 | rerun after 4 | open |
| 10 | U | The MISSING dialog takes the keys: PLAY does nothing until YES. A RAM boot of the twin hung once after several boots in a row (no USB device until a power cycle) | friction | run 1 | known trap for RAM boots; MISSING dialog behaviour for the owner | open |
| 11 | tools | `device.mjs` reports any refused `mem` read as "This base does not answer development requests: build it with --dev"; the dev window ends at 0x40d00000, below the loader's statics | friction (tooling) | run 1 | Fix PR: name the window in the error | open |
| 12 | U, twin (fixes) | With the owned channel fixed, Output Matrix and Analog BD reach ACTIVE; MATRIX enters, routes (T3 MN on MAIN, PHN off MAIN, recorded) and leaves with levels unchanged. Sidechain reaches ACTIVE beside stock delays on T3/T7 once its buffer claim is fixed | result | run 1 | findings 1 and 2 fixed on the unit | open |
| 13 | U, twin (fixes) | The lease cache barely lowered the controller CPU cost (Sidechain +157 per mille, was +186). The cost is the number of leases: sc_norm sits on the frame builder's page-2 copier and takes a lease for every slot every frame, although it almost never writes; page_levels leases outside MATRIX mode | bug, blocker | run 1 | fixed in #603 (read-only prechecks; Sidechain +3, Matrix +0 points) | fixed |
| 14 | U, twin (fixes) | Sidechain's in-place page record on the stock COMPRESSOR descriptor leaves bad words at +278/+282; opening COMPRESSOR's FX1 SETUP jumps to an odd address (crash record: vector 3, PC 0x40037c2a, a5 the descriptor) and the unit restarts. Removing Sidechain afterwards is refused and its slot is QUARANTINED, because the descriptor no longer hashes to what was written | bug, blocker | run 1 | fixed in #603 with 18 | fixed |
| 15 | U, twin (fixes) | Analog BD's first note (T3, with trigs) stalled the DSP: frames stopped, audio and meters frozen until a power cycle. Its renderer had not run before (on T1 without trigs nothing in its image changed). Leading hypothesis: core 1 runs away in the 808's DO loops on a stale trig offset (stock X:$20c); also the core-1 wait counter at X:$2840 overwrites Analog BD's T_INCB[0] | bug, blocker | run 1 | discriminating tests on the next build | open |
| 16 | U, twin (fixes) | Analog BD is admitted on one track per core in this Part; a second track's YES in SRC SETUP is refused with no message (voice priced 411 cycles). A quarantined Sidechain also blocks it | friction | run 1 | owner: the plan expects one to four tracks; the chooser should say why | open |
| 17 | build | The lease fix moves the base's lease entries, so Analog BD's package bytes change and its reviewed recipe (machine-recipes.json imageSha256) must be recaptured from the stock OS; Sidechain and Matrix get new hashes and trust rows. Every base change that moves those symbols needs this | process | run 1 | one recapture after all base fixes are combined | open |
| 18 | build, U | GCC 16.2 (the reviewed Docker toolchain) compiles the byte-copy loops in controller_board.c (page_write, page_revert) and analog_bd_part_board.c as `move.b (a0)+,(0,a0,d0.l)`; ColdFire takes the destination from the incremented a0, so every copy lands one byte high. That shifted Sidechain's COMPRESSOR page (finding 14: enables of slots 6-9, slot 7's widget pointer read one byte off, blank name) and makes Analog BD's Part restore write one byte high. Host tests use the host compiler and cannot see it | bug, blocker | run 1 | fixed in #603 (-fno-late-combine-instructions and an objdump gate) | fixed |
| 19 | build | page_record ignores the recipe's inheritedEnable, so Sidechain's page writes +398 = 0 over stock's enables and would switch COMPRESSOR's stock page-1 controls off even with the copy fixed | bug | run 1 | fixed in #603 | fixed |
| 20 | U | Module code and data run from the pool's uncached alias (pool + 0x08000000), so every instruction is fetched from SDRAM: about 60-90 cycles each. This, not the lease, is most of the controllers' idle cost and about 1-5 points per ordinary package | bug, performance | run 1 | prototype of cached execution with cache maintenance behind a build flag, to be measured on the unit | open |
| 21 | S, U (#603 tester image) | With #603's base the site path installs, self-tests and keeps 18 of 19 one by one (Sidechain, Output Matrix and Analog BD included); self-test CPU peak 86 % with 18. E-Verb waited for the self-test fix, which is in #603 but not yet run on the unit | result | run 1 | rerun E-Verb on the merged base | open |
| 22 | U (cached code) | A tester image built with `--cached-modules` (module code from the pool's cached alias) crashed during POLY8's trial: the unit dropped off USB and restarted on the flashed base. Crash record: vector 4 (illegal instruction) at a pool address, i.e. stale instruction cache after a module write or move. The uncached image installed POLY8 fine. On a twin, cached code saved about 5 CPU points with all 19 | bug in the prototype | run 1 | branch claude/try-cached-module-code, held back. Run 2: a CACHE TEST dev request on twin3 shows CPUSHL by address and by every way both push a dirty line to memory, so the push geometry is not the cause; finding 30 was the same failure (vector 4 in pool code, a call into memory being rewritten) on the uncached base, caused by stale per-track machine slots, so POLY8's crash is most likely that leftover call and not the cache; retry the cached image on base `362fb24d` | open |
| 23 | U (meter) | The development per-slot DSP cycle meter (`--slot-meter`, one slot per core at a time, about 35 cycles per watched call, 210 arena words per core) stalled core 0 the first time it watched a slot (core 0's last packet was the METER command on stock FILTER, T5 FX1) | bug in the prototype | run 1 | branch claude/dsp-slot-cycle-meter; owner: development builds only | open |
| 24 | U (Analog BD) | On the fixed base Analog BD reaches ACTIVE but renders exact silence. In one boot its renderer ran (calls and trig hits counted) and the record slot still showed no Analog BD record; in a later boot with Analog BD alone its renderer was never called for T3 (also as a FLEX track without a sample). Separate candidate: its DSP glue compares words with stale high bits after `and #>$ffff` (the receiver's known trap). Run 3 (twin `43fe3fc4`, 15 Oct): with T3 left as ANALOG BD in bank A Part 2, a RAM boot showed T3 as STATIC and silent (its static loop too), its renderer slots on the never-bound `0x400047f0` before and after PLAY; choosing STATIC then ANALOG BD made it play; a reboot without the module left bank A BANK UNAVAILABLE until LOAD PROJECT. The intermittent total silence after a Sidechain install (dumps from that session: every Part 2 track STATIC with stock defaults, all 16 slots `0x400047f0`, per-ping types `0xff`) is the same failure | bug, blocker | run 1, run 3 | Cause (stock read, reproduced on the emulator with stock 1.40C, twin `43fe3fc4` and the fixed twin): no Modwerk code changes a track's machine byte; Analog BD tracks stay FLEX. At boot stock restores the current bank from its battery-backed Part copies (`0x40025770`) and validates each first; the saved module set reinstalls Analog BD only about 3 s later (`modset.c`), so the base's validator seam (`mw_validate`) had no machine to protect and stock judged Analog BD's 12 bytes as FLEX SETUP values. It clamps them in place, counts the fixes and refuses the whole restore: the bank is never copied in nor applied (`0x40009094`), so every Part reads STATIC with stock defaults, no trig ever reaches the frame builder's bind (`0x4000bf74`..`0x4000c004`) and every track keeps the never-bound renderer. A later boot finds the clamped copy valid (ANALOG BD shown, its parameters lost). Fix: the base knows the PROTECT signatures of `machine-ports.json` (Analog BD, FM Synth) and keeps their 12 bytes from the validator while the machine is absent; such a track reads FLEX, renders stock's silent source until its machine is back, and choosing another machine puts stock's FLEX defaults back first (`machine_registry.c`, host tests in `test_machine_registry.c`). Binding stays stock's own: the type byte decides it, before and after Analog BD arrives or retires (`test_analog_bd_part_restore.c`: only 15 bytes change, never the type; `test_analog_bd_part_board.c`: the bind state is never written). Also `runtime.c`: both slots hold renderers (`0x400d61f0` next, `0x400d61d0` current), starts are called from their table (finding 30's retarget now covers renderer entries only). Emulator, boot with an Analog BD track in the battery copy: `43fe3fc4` refuses the restore and binds nothing; the fixed twin (configuration `1cbaf443`) restores the bank with the track's bytes kept and binds all 8 tracks to the dispatcher. Limit: stock firmware or a base without the fix still refuses such a bank at power-up; VECTOR's own validator wrapper is not replicated while it is absent | fixed (unit, 15 Oct 2026: T3 left as ANALOG BD survives a RAM boot and plays, integration twin 76e15b41) |
| 25 | owner | Owner decisions 14 Oct 2026: fixes and optimizations may go straight to the beta while no testers are active; resident engines should be placed on demand by the packer (no static reservation), flawless across Part switches and with no extra flash or card writes; the cycle meter stays in development builds; one-step set sync not chosen for now | decision | run 1 | engines-on-demand on branch claude/resident-engines-on-demand (in progress) | open |
| 26 | U, twin `025b3559` | With all 19 installed (`octatrack-qualify.py`, bank A Part 3, stock DELAY on every FX2), each FX picked alone on T1 (core 1) and T5 (core 0): Mini Verb and Tape Echo refused on both cores, Air Chorus and TapeHead refused on T5. Afterwards, with E-Verb and Euclid no longer installed, Mini Verb picked on T1 at once. This is the union-of-Parts rule (migration record, 11 October): bank A's other Parts name E-Verb, Euclid, TapeHead and Air Chorus, so their code keeps its room on both cores, and a pick of a module no Part holds must fit beside it. The resident engines' static 2,625 and 1,748 words (finding 3) leave too little. To a tester it reads as DSP MEMORY FULL on an empty-looking Part | bug, design limit | run 2 | Measured on twins 8-10 (the manager's allocator read after each refusal): with this bank's working Part reset to stock DELAY, both cores' unions were over (core 0 FILTER 441 + E-Verb 1588 + Euclid 395 = 2424 of 2396 words; core 1 with Air Chorus and TapeHead 3641 of 3269), so the union was never held, yet every pick of a module no Part names was refused, even Tape Echo's 5 words, and the plan placed both cores, so a T1 pick failed on core 0. Fixed in base `362fb24d`: per core, a union that is not held (or that the pick adds nothing to) falls back to loading what the Part runs; a held union still refuses a module that does not fit beside it. Twin10: Tape Echo and Mini Verb taken on T1 and T5; with Euclid and TapeHead removed (both unions held, 2029 and 2824 words), Tape Echo taken and Mini Verb refused on both cores. Left open: an automatic transaction that fails on one core still drops the union on both; the owner's call on whether a pick that does not fit beside a held union lets go of modules only other Parts name (they then load at their Part change) instead of refusing; engines on demand (finding 25) frees most of the room either way | fixed (twin) |
| 27 | U, twin `025b3559` | In the same run the Part switches reached Parts 2, 3 and 4 every time but never Part 1 ("did not become active", three times; the next PART+RIGHT then worked). The knob sweep just before had left T3's FX2 page open on E-Verb's page, so only PART+UP failed while a module page was open: the page may take UP even with PART held | bug, unconfirmed | run 2 | on the unit: E-Verb's FX2 page open, PART+UP, against a stock effect's page; then the same with a five-label module page | open |
| 28 | U, twin `025b3559` | Removing an ACTIVE controller (Sidechain, Output Matrix, Analog BD) fails on the first request: the board answers busy (5) at publication while it quiesces the engine, and the base drops the staged package (`upload.c`: phase ready, result backend). The site retried busy only at staging, so a sync that removed one ended with "The Octatrack refused this step.", and the host session kept the dropped offer, so it could not have staged again. A second request a moment later succeeds | bug | run 2 | this run's PR: the session forgets an offer the base dropped, the link stages again on a busy publication, `device.mjs` retries busy on both paths. Checked: Sidechain installed, ACTIVE and removed in one `remove` on the twin; regression tests for the session and the link | fixed (the site's path not yet on the unit) |
| 29 | U, twins `025b3559` and twin3 | VECTOR's removal is refused as in use (7) after a qualification run, though no Part of bank A names a machine. On twin3 (MEM window widened) it repeats: the working, saved and both battery-RAM Part copies hold no machine signature, no track is charged to it, the key/encoder cache and the layer root pages hold no pointer into its image, and closing MISSING or changing pages does not free it. After a plain install and removal (no qualification run) it leaves at once. To a tester the refusal reads "A track is playing this module's effect", which is wrong for a machine | bug | run 2 | instrument which admission check refuses (machine_ui_lifetime's chain, metadata or table admission); give machines their own refusal words | open |
| 30 | U, twin `025b3559` | Installing Output Matrix (after Sidechain was installed, Mini Verb picked on T1 FX2 and DELAY picked back) dropped the unit off USB during verify: a crash restart. Record (read on twin3): vector 4 (illegal instruction) at pool+0x1ea22 in the engine task (SP on its stack, SR mask 5), return address pool+0x1ea0e, a0 = a3 = an address in FM Synth's old state, a2 = 0x80002710. Replayed on twin3 in the same order, the owner table puts Output Matrix at pool+0x1e190, over memory FM Synth held until the qualification removed it, and the crash address is inside Output Matrix's Part-conversion code just past bytes the copy had written. So the engine task entered FM Synth's freed code, with FM Synth's state, while Output Matrix's image was being copied over it: a call into a removed module. Two exact replays (with and without VECTOR left installed, as in the crashed boot) did not crash, and no base table, stock code, SRAM, machine or sequencer row pointed into FM Synth's freed extent afterwards; FM Synth pointers were left on the engine task's stack | bug, blocker | run 2 | Root cause (twins 5-8): stock copies a machine type's renderer into the track's per-track slots (`0x400d61d0`, `0x400d61f0`) at a bind and the frame calls through them; removing FM Synth restored the type table but not the slots, so the engine task kept rendering FM Synth from freed memory. Without a play since the bind (the two replays) the slots never took FM Synth's renderer, which is why they did not crash. Fix: the loader tells the runtime when a site goes back to stock and the runtime puts matching slots back (`modwerk_machine_site_restored`, host test in test_runtime.c). Twin8 `f9727992` with freed extents filled with illegal instructions: install FM Synth, PLAY, STOP, remove, three times, slots back to stock and no crash; with the same poisoning and no slot fix, twin6 crashed. Tester base `362fb24d` not yet run on the unit | fixed (twin) |
| 31 | U | After the Part reload put DELAY back on T3 FX2 and E-Verb was removed, T3's FX2 page still showed E-Verb's name and knobs until it was entered again. Turning a knob on that stale page was not tried | friction | run 2 | check whether stock redraws a page after RELOAD; never turn a knob there on the unit before the emulator has | open |
| 32 | E, twin `025b3559` | The native `ot_emu` runs this base's `stock` scenario (PLATE REV and DARK REV bound on demand: passed), but after the Template Live project loads every install stays busy (5) and the bench's `call` goes unanswered for ten minutes. The plain emulator also never creates task p1b with this base's idle detour (the M6a gate fails), which `scripts/octatrack-emulator/build.py`'s adapted build fixes (gate passes, 10 tasks); the install replay of finding 30 still starved on the adapted build | bug (tooling) | run 2 | use the adapted build; then find why bench calls starve after the project load | open |
| 33 | U, twin12 | Module DSP code runs at 1.4-1.7 cycles an instruction on the unit, stock's at about 1: E-Verb's 382 executed instructions cost 663 cycles, SPRING REV's 314 cost 298, so one E-Verb costs 2.2 Springs for 1.2 Springs of work (migration record's hardware table). Not the loader: SPRING REV and FILTER, loaded on demand into the same arena and relocated like a module, measured 298 / 288 and 285 / 275 on twin12, as before the loader | performance | run 2 | owner's call to trace it (small DSP test programs comparing a module's instruction mix, delay-buffer access and pipeline stalls with Spring's); the biggest lever on how many modules a core holds | open |
| 34 | U, twin12 | The cycle budget books every FX slot at least the dearest stock effect (DJ EQ, 342 cycles), so stock effects alone book 88 % of core 0 (77 % of core 1) while the meter reads about 45 %; one E-Verb takes core 0 to 98 % and a second is refused DSP FULL. The budget is now on the STATUS page (DSP rows) | design limit | run 2 | owner's call: charge each stock slot its own effect's worst case (NONE 0, `stock_dsp_worst.py`), within the 90 % ceiling; a stock pick could then be refused on a full core | open |
| 35 | U, twin12 | On bank A Part 2 (DELAY on every FX2) E-Verb was refused DSP MEMORY FULL on T1: stock effects the other Parts name were preloaded on core 1 (MEM 79 %), and a pick must fit beside everything live until the switch retires, including preloaded code no track runs | bug | run 2 | let a transition overwrite live code no slot runs (the publication guard already defers publishing an id the open transaction does not keep); prove it in the emulator first | open |
| 36 | U (tooling) | `device.mjs pick`: the first pick after an install or removal often misses (once raising stock's DISARM ALL), and a notice on screen (MISSING MODULES, the STATUS page) eats its keys until the 5 s timeout; it ends with NO, which closes the budget box, so screenshots after `pick` never show the box (pick by keys instead) | bug (tooling) | run 2 | close notices before picking; retry once on a timeout; leave NO out when the box is wanted | open |
| 37 | U, twin14 (`216bc509…`, dev twin of the on-demand beta base) | With E-Verb held on core 0 for the bank's other Parts, installing Output Matrix after Analog BD was refused at verify (refusal 2, RUNTIME_MEMORY; `dl_engine_why` 2: no place below the region). Analog BD's claim had already moved E-Verb down once (one evacuation, no failure); Output Matrix's 773 words reach into it again, and its new copy must clear its own running old copy and FILTER: 801 words free for 1,588. E-Verb ran on no track of that Part | bug, design limit | run 3 | proposal (owner's call): code no track of the current Part runs may be moved in place (nothing executes it), or dropped from the held union until its Part plays; until then installing E-Verb after the controllers works | open |
| 38 | U, twins 14-16 (on demand, 15 Oct) | All 19 installed together with every engine placed (E-Verb last): qualification CPU 776 ‰, core 1 peak 716 ‰, three rounds of Part switches, Part restored byte for byte, no crash, stall or loader error. T5 refused Air Chorus, Euclid, Mini Verb and TapeHead: with all three engines core 0 has 2,224 words and the bank holds FILTER and E-Verb (2,029). T1 first-pick misses are finding 36. 8x SPRING REV on all tracks of Part 3: playing T1-4 63 %, T5-8 67 %, CPU 50 % (as on 25ab5804 in the morning). Status page: PLAY, STOP and REC reach stock with the page open, FX1 closes it and opens stock's page | result | run 3 | the T5 refusals are finding 26's held union; engines on demand lifts it only while no controller is installed | done |
| 39 | S (code walkthrough, 15 Oct) | The Sync to Octatrack dialog reviewed the set without the connected base's identity, so every set adding or removing a package bound to the published base (Sidechain Compressor, Output Matrix, CC Map, Recorder Loop Fix, Analog BD) said "Install the latest Modwerk base", and the install guide then called the current base older. The hub passed the identity, so its Sync button was enabled. A mocked review in the dialog's tests hid it | bug | main 61bf5302, base `acf91e0a…` | `LoadDialog` passes `identity.base`; regression test in `OctatrackUpgradeReview.test.ts` (claude/beta-journey) | fixed, not yet seen in Chrome |
| 40 | S (code walkthrough, 15 Oct) | A sync's result came back as a pill on the next page after Done; an error opening the unit ("Chrome couldn't open the Octatrack") showed nowhere on the Octatrack page | bug | main 61bf5302 | the pill skips a result already there when it appears; the hub's header shows the error with Connect | fixed, not yet seen in Chrome |
| 41 | S (code walkthrough, 15 Oct) | Friction on the first path: the join page led to the library, the install guide ended on an empty Status with no next step, asked for feedback in the forum while the mail says Discord, and the sync dialog asked testers to tick "Playback is stopped" although the base presses STOP itself (finding 7) | friction | main 61bf5302 | owner's picks: the join page links to Setup (the install guide), the guide ends on the set you edit, feedback in the development Discord, and the dialog says "Syncing stops playback on the Octatrack." instead of the box | done in claude/beta-journey |
| 42 | B (tester, Discord 15 Oct; set with Analog BD and Output Matrix), reproduced U | TapeHead and Mini Verb refused DSP FULL. On the unit, bank B Part 2 (FILTER/DELAY): with T1 as ANALOG BD, TapeHead on T2 FX1 and Mini Verb on T2 FX2 refused DSP FULL; with T1 back on STATIC, TapeHead on T2 taken; with ANALOG BD on T1, TapeHead on T6 taken. Analog BD's voice (411 executed instructions) is charged at 7/4, 720 cycles, plus 6 for its engine, so one ANALOG BD track books core 1 to 3,462 of 3,565 beside the eight 342-cycle floors (finding 34): 103 left, where TapeHead needs 175 over the floor and Mini Verb 378. By the same arithmetic ANALOG BD fits no track of T5-T8 (3,462 of 3,120; not tried). Output Matrix books no cycles. With T1 on STATIC, Mini Verb got DSP MEMORY FULL on T2 and T5: this static-engine twin's arena with DARK REV preloaded (finding 35), not checked on the on-demand base. Same twin, ColdFire CPU with Analog BD and Output Matrix installed: stopped 45 to 47-48 %, playing 52 to 53-54 %, so they do not explain the sluggish UI testers reported the same evening | design limit | dev twin `e429b787…` (main with #643), same ledger as `acf91e0a…`; TapeHead 0.1.2, Mini Verb 0.2.2, Analog BD and Output Matrix bound to the twin | tester: TapeHead or Mini Verb on T5-T8 while ANALOG BD is on T1-T4 (one Mini Verb there). Owner's call: finding 34's per-effect stock charge, a hardware price for Analog BD instead of 7/4, the chooser saying why (finding 16) | open |
| 43 | B (tester, Discord 16 Oct: "deleting the set … wasn't able to recognize it, so I had to reflash"; Euclid, TapeHead, E-Verb, FM Synth), U | Removing modules froze the unit once in three runs. Twin of `38a0bde1`, 16 Oct, about 15 minutes after its RAM boot: after two E-Verb picks refused DSP MEMORY FULL and a stopped bank change to A01, BBD, Mini Verb, E-Verb and Tape Echo came off (generations 12-15), then the commit removing FM Synth (`synth`) was never confirmed: the screen froze, the unit left the USB bus and only a power cycle brought it back. After it the base restored generation 15 (seven modules, FM Synth among them). The unit's own log (diag.c) has load records up to minute 15 of that boot and no incident: a freeze with the frame interrupt stopped writes nothing. The crash record (10, vector 4 at PC `0x48c4a3a4`) carries no time, so it is not tied to this. The same removal from the restored set, and the whole sequence again (the same five active hashes), went through. Expected: a removal is confirmed or refused, never a freeze | bug | twin `d90ed73b…` (dev twin of `38a0bde1…`); synth 0.1.2, Tape Echo 0.1.5, E-Verb 0.1.1, Mini Verb 0.2.2, BBD 0.1.1 | reproduce with the refused picks and the bank change before the removals; a watchdog record the frame interrupt does not depend on, so the log shows such a freeze | open |
| 44 | B (tester, Discord 16 Oct: an MKI on Chromium/Ubuntu and on Chrome/Windows) | Chrome couldn't open the Octatrack and said only "unplug it and try again". Linux needs a udev rule (and the Chromium snap its `raw-usb` connection); Windows binds WinUSB only to the base's interface, so a unit on the original OS can't be opened at all (it reads as `stock` on macOS) | friction | live site, 16 Oct | the message names the Linux and Windows causes; Setup → Can't connect? gives the rule. Not run on Linux or Windows here | #664, unverified |
| 45 | S (diagnostics pull, 16 Oct) | 0 shared records against 22 syncs the day before: the consent version `2026-10-15.1` (#657) stopped everyone's sharing, that day's cleanup deleted the older records, the consent read returned the current version so no one was asked again, and the required step in the beta note showed once per account | bug | live site, 16 Oct | #665: the read returns the stored version and reports are kept; #664: the beta gate asks again on any page (`diagnosticsLapsed`) | #665 merged, #664 |
| 46 | U (owner's MKII, 16 Oct: a sync adding E-Verb to Euclid, TapeHead, FM Synth, Preview Vol, CC Map, Play Modes, Recorder Loop and Tape Echo) | The sync's self-test stopped the DSPs (stall 16: USB dropped, only a power cycle helped), and a later power-on restoring the eight kept modules stalled again (stall 17: frames stopped after the restore, with only the background meter's PEEK in flight; stuck at the logo). On development twins the loader held the frame interrupt off for 229 µs installing Play Modes (35 stock-code sites) and 203 µs installing FM Synth (24), past the 200 µs rule (frames stop at about 300 µs): it checked, wrote and read back every site byte through the uncached alias inside the mask. Expected: a switch masks frames well under 200 µs. Sixteen self-tests of the same nine on a twin passed, so a stall needs the span to meet a bad moment | bug | base `99336d35…`; synth 0.1.2, playmodes 0.1.1, euclid 0.1.4, tapehead 0.1.2, tapeecho 0.1.5, everb 0.1.1, previewvol 0.1.2, cc-map 0.1.2, recorder-loop-fix 0.1.0 | `loader.c`: only the writes are masked, a word at a time; the checks before and after run under the lock, and a write that did not land is undone masked with its event rows. Base `a1471aeb…`. Twin of the fix: longest span 69 µs over the nine installs and a self-test (FM Synth: 48 µs of writes, 18 µs of event rows), a restore boot clean. Not yet: the exact tester image on the unit, power-ons with the set | fixed (twin) |

Run 1 identities: main 0697d597 (#585), tester image `d6b234e2…` (.bin 7ceca774, byte-identical to the committed base), dev twin `fe67ea56…` built with the same flags plus `--dev` and the five base-bound packages rebuilt against it (the controller packages came out byte-identical). Packages: the published hashes in `src/engine/assets/octatrack-module-packages.json` at that commit.

Run 2 identities (the owner's MKII on the Mac, 14 October 2026): main 0261e3df (#604); dev twin `025b3559…` (MAIN.raw
`222f7a0c…`) with the beta base's flags plus `--dev`, its trust rows equal to the committed ones, so the three controller
packages are the published bytes; CC Map and Recorder Loop Fix rebuilt against it (`c7cd39a5…`, `4fb47bef…`). The other
14 packages are the published ones. A second twin `be93ac88…` adds only a wider MEM window (a private patch for now). One recording during the
qualification (20 USB channels, 15 s) heard only T2, under knob sweeps, so it says nothing about clicks yet.
On twin3 (`dbd564da…`, twin2 plus a CACHE TEST request) the full set ran the qualification again and soaked about five
minutes before the owner called it stable: ColdFire CPU 74 to 89 % (one sample at 89 %, near the 90 % limit), core 1
peaks up to 74 %, core 0 up to 50 %, no loader error, crash or stall. 60 s of MAIN during the soak: no click or dropout
off the pattern's grid (T2 through Euclid is the only audible track, so this is not a per-module listening test).
Later twins of run 2 (all with the beta flags plus `--dev`, freed memory filled with illegal instructions): twin8 `f9727992…` (finding 30's fix), twin10 `467f6f17…` (finding 26's per-core fallback), twin12 `85cfe98c…` (STATUS page budget rows); the tester base for all of it was `362fb24d…` (PR #619). #619 merged as `18492110…` (with BBD Delay's chooser row and the startup without the outline); its twin13 `b9cd8d27…` passed the 19-module qualification on the unit on 15 October but for four T5 picks refused by the held union of Parts (E-Verb kept on core 0: 2,029 of 2,396 words), which engines on demand removes. The beta base with engines on demand is `acf91e0a…`.

### State at the end of run 1 (14 October 2026)

- **On main (#603, deployed):** owned DSP job channel kept open, Sidechain's buffer claim, controller lease cache and read-only prechecks, GCC 16.2 late-combine flag and objdump gate, inherited page enables, self-test "alone" on both cores, the rebuilt beta base (`88a659c4…` before the self-test fix; regenerate and read the current identity from `sdk/machines/octatrack/base-binding.json`) and its base-bound packages. The unit's flashed base is still beta3; the new base has only been RAM-booted.
- **Branches, not merged (pushed, work in progress):**
  - `claude/try-cached-module-code`: cached execution; crashes on POLY8 (finding 22).
    - The crashing call was the registry's `mw_assign` into POLY8's `pm_assign`. The bytes the CPU ran at that live address were not POLY8's code.
    - Leading cause: the image never fully reached memory before the instruction cache read it. `pm_assign` lies near the end of a 55 KB image, and the push in `prepare` relies on unverified CPUSHL set/way geometry.
    - Fix: write the image, relocations and copies through the uncached view, push the whole data cache, then invalidate the instruction and branch caches, so correctness doesn't depend on the cache geometry. Also refuse the install if the cached view differs from memory after the push. The comment at `runtime.c:56` about stock's CACR writes is wrong.
    - Cheapest test, with no rebuild: on the cached `--dev` twin, install POLY8 and compare `pm_assign`'s bytes, read through the uncached alias, with the package, right after the install and after a self-test.
  - `claude/dsp-slot-cycle-meter`: development meter. Its last commit holds an untested fix for the core-0 stall (finding 23): the wrapper ran the effect one DSP system-stack level deeper than stock, and core 0's stock code already pushes the stack itself. Next: assemble it, check the stack depth in ot_emu, rebuild the twin and retest.
  - `claude/resident-engines-on-demand`: the DSP side is done (relocatable engine units, a placed-address word per feature, a PLACE operation; core 0 frees about 2009 words and core 1 about 1270 when no engine is placed); design note `docs/OCTATRACK_RESIDENT_ENGINES_ON_DEMAND.md`. Still to do: the ColdFire side (manager claim/release, a dry run against the bank's union of Parts, the controller board's place and free), the `--resident-on-demand` build flag and the host tests.
- **Next on the unit:** E-Verb through the site path on the merged base; Analog BD with a prepared project; the cases still open in Part 2 (instances, Part switches with modules, persistence after flashing the new base, case 1.18 FUNC at boot).
- **Private tooling** for these runs (bridge, session, MCP relay, 20-channel USB recorder, glitch detectors, twin builds) lives outside the repository on the test PC under `~/.cache/modwerk-local/ot/beta-run1/`.

