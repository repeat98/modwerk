# The Octatrack recipe for every machine

Every machine Modwerk has unlocked, and every machine in the works, gets the stack the Octatrack beta runs on: a Modwerk base with hooks, a USB link, loading without a reflash, base updates over USB, the MCP's device tools, the site's machine page and, where it helps, an emulator ([owner, 28 October 2026](decisions/2026-10-28-modwerk-base-every-machine.md)). With it, modules from different people install side by side on one unit and are tested the same way on every machine. Without it each module carries its own copy of what others need, and the machine ends up with module-level patching.

Read this before you plan a core, a base or the first modules for any machine other than the Octatrack, and before a module that needs a stock site other modules will want too. The machine's own guide (`sdk/machines/<id>/README.md`) says where it stands and what comes next.

## Rules

- **The base is Modwerk's.** It lives in this repository, and its hooks, budgets and releases are decided here (owner: for the Rytm on 27 October 2026, for every machine on 28 October). Where an upstream core exists (elekloader's core-ar2 and core-a4, toonst's digitakt2-perform, MIDISTOMP for the Zoom pedals, the LXR-02's published source), start from its source at a pinned release, vendored with its licence and provenance in `sdk/imports/`, and credit it. The base keeps that licence, so read a newer release's licence before taking it: digikit is AGPL-3.0 on GitHub today, while the copies elekloader carries came under GPL-2.0-or-later. Do not wait for upstream to take a hook. Until a machine's base ships, its current core stays the release authority, and its guide says so.
- **What several modules share belongs to the base.** That covers a send bus, an FX list, a page or menu rows the modules share, per-kit state or a sample-editor service. Each module adds one record to the base's table, as Octatrack effects join `fxmap.c`'s FX list and `fxpage.c`'s pages and machines join `machine_registry.c`. A module never carries a bus, list or page set for other modules, and it holds one effect ([one effect per module](module-guides/effects.md#one-effect-per-module)). Before the base exists, a module that needs such a site waits for it or ships together with an owner-reviewed base pull request that adds the hook. A site only one module will ever need stays that module's own declared patch ([choose how a module hooks in](module-guides/README.md#choose-how-a-module-hooks-in)).
- **Extend the Octatrack's pieces, do not design new ones.** A machine adds its glue, addresses and pages to the loader, link, builder, MCP and page below.
- **A module never needs a base rebuild.** It carries its own engine, tables and controller code in its package ([plan](OCTATRACK_PACKAGE_DSP_HOOKS.md#owner-decision-and-plan-22-october-2026)).
- **The whole-image build stays the fallback.** The Octatrack's card build, or a full `.syx` sent with Transfer, keeps working for anyone without the USB route. The beta's flows never end in it ([USB lifecycle](ADD_A_MODULE.md#octatrack-base-and-usb-lifecycle)).
- **Beta first.** The machine page is beta-only (`hasBetaUi`) until the owner releases it.
- **Owner review.** A base, a link, a loader port and a page are shared SDK work: each goes in its own pull request, never inside a module release. Unlocking a new device starts with messaging the owner ([talk to the owner first](ADD_A_MACHINE.md#talk-to-the-owner-first)).

## The pieces

| Piece | On the Octatrack | What a new machine adds |
| --- | --- | --- |
| Base | [`sdk/machines/octatrack/elekloader/`](../sdk/machines/octatrack/elekloader/README.md), built in the browser from the user's own stock OS ([`octatrack-base.ts`](../src/engine/elekloader/octatrack-base.ts)); firmware never enters CI | Its base source in `sdk/machines/<id>/`, started from the upstream core's source; the same browser build |
| Hooks | [`events.json`](../sdk/machines/octatrack/events.json) generates [`HOOKS.md`](../sdk/machines/octatrack/HOOKS.md) and `include/modwerk_events.h`: call, take and table hooks, each with an order band and a room | The same registry format, starting with the core's UI hooks and the shared sites the first modules need |
| Admission | The loader refuses a package past a hook's room or the declared budgets; `compatibility.uiClaims` and the [pairwise check](module-guides/README.md#cross-compatibility) | The machine's budgets in `machine.json`'s `sdk` |
| USB link | Vendor interface on the unit ([`ep0.c`](../sdk/machines/octatrack/elekloader/ep0.c), [`sdk/runtime/upload/`](../sdk/runtime/upload/README.md), [USB vendor interface](../sdk/machines/octatrack/elekloader/README.md#usb-vendor-interface)); host side [`octatrack-link.ts`](../src/engine/elekloader/octatrack-link.ts), [`upload-session.ts`](../src/engine/elekloader/upload-session.ts), [`module-set.ts`](../src/engine/elekloader/module-set.ts); identify, inventory, status, load meters, self-test results and the unit's log ([`diag.c`](../sdk/machines/octatrack/elekloader/diag.c)) | A transport on the machine's USB: a vendor interface like the Octatrack's, or SysEx where USB MIDI is all the unit offers (the [LXR-02 plan](LXR_02.md)) |
| Loading without a reflash | [Runtime loader](../sdk/runtime/loader/README.md): review, trial in RAM, self-test, Keep, Undo; a power cycle restores the stock state | The glue its [porting section](../sdk/runtime/loader/README.md#porting-to-another-machine) lists (Octatrack: [`runtime.c`](../sdk/machines/octatrack/elekloader/runtime.c)) |
| Base install and update | First install from the card, later updates over USB on two slots with at most one restart ([`flash.c`](../sdk/machines/octatrack/elekloader/README.md#updating-the-base-over-usb-flashc), [two-slot base](OCTATRACK_TWO_SLOT_BASE.md)); the maker's recovery stays the floor | Its first-install route and recovery in `machine.json` (`flash`, `recovery`), then the same USB update |
| MCP device tools | [`frontend-mcp.mjs`](../scripts/frontend-mcp.mjs) with [`octatrack-usb-bridge.py`](../scripts/octatrack-usb-bridge.py) ([device tools](FRONTEND_MCP.md#then-test-the-connected-device)) | Its link behind the same tools, not new ones |
| Site page | [`OctatrackHub.tsx`](../src/components/OctatrackHub.tsx): hero, Status, module sets, guided sync ([the beta page](APP_DEVELOPMENT.md#octatrack-base-install-prompt)) | The same page, generalized, with only the unit pages that fit the machine |
| Module packages | Each module builds a USB package beside its card build (`npm run octatrack:module-packages`) | A package format the loader admits, built from the module's source |
| Emulator | `ot_emu` from `npm run upstream:tools` | Optional: use one where it exists; build or extend one (upstream, not here) only when the unit is too slow or risky to iterate on. Never hardware evidence |

## Where each machine stands

| Machine | Status | Today's core | Base and USB | Emulator | Next |
| --- | --- | --- | --- | --- | --- |
| Octatrack | available | Modwerk base (beta) | done | `ot_emu` | the reference |
| Digitakt, Digitone | preview | Modwerk cores, interfaces 2.1 and 2.2 (in development, frozen) | not started | digiemu | grow the core into the base, then the loader glue (the Octatrack's ColdFire family) |
| Analog Rytm MKII | preview | elekloader core-ar2 0.3 | planned: a Modwerk base from core-ar2 0.3's source, with the send bus and an FX list first (27 October 2026) | rytm-emu | the base plan, for owner review |
| Analog Four MKII | research | elekloader core-a4 0.2 | not started | none known | as the Rytm: same platform |
| Digitakt II | research | digitakt2-perform 1.0 | not started | none known | a base from the core source |
| Syntakt | research | Modwerk boot probe | not started | none known | the core stage, planned as the base |
| Digitone II, Analog Keys, Model:Cycles | research | none | not started | none known | the machine steps first ([add a machine](ADD_A_MACHINE.md)) |
| Zoom MultiStomp | research | MIDISTOMP | the base builds in the browser; flashing it, a SysEx hello and loading without a reboot are not built | none | [plan](ZOOM_MULTISTOMP.md#plan) |
| LXR-02 | research | published source | planned: SD-card base, USB-MIDI SysEx link | none | [plan](LXR_02.md) |
| Tonverk | research | none | closed: signed, encrypted updates | none | nothing without Elektron's agreement |

When a piece moves, update this table and the machine's guide in the same pull request.
