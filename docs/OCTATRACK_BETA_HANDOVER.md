# Octatrack beta: handover (frozen 12 October 2026, evening)

The owner froze this work on 12 October 2026 to hand it to other agents. It sums up a long session in which
four to five agents worked in parallel. The detailed records are the docs linked below; this page says where
everything stands and what is open. Read it top to bottom before touching anything.

## The goal

Roll the Elekloader migration out to beta testers. They build the Modwerk base in the browser from their own
OS 1.40C file, install it once from the card, and then sync module sets to the Octatrack over USB from the site,
without a reboot. Everything user-facing is beta-only: visitors and ordinary members must keep seeing main's site
exactly.

## Rules the owner set (standing)

- **Never merge PR #464** (`codex/octatrack-elekloader-migration` → main). The owner merges. Merging main *into*
  the branch is allowed (c9146e66, 3dfdf6a2 did it), but one is on hold (see Open decisions).
- **Beta-only.** Every user-visible change sits behind `hasBetaUi` (`src/community/beta-ui.ts`: beta testers,
  verified admins, dev builds). After any UI change, rerun the public comparison (visitor and member against main:
  visible text, screenshots, API traffic). Tools: `~/.cache/modwerk-octatrack/frontend-tools/`.
- **The tester image stays the qualified one.** Testers' browser-built base must equal the image the owner
  flashed and tested (`dc1d7a39…`, from c9146e66). Any change to a base input (anything `build_core.py` hashes)
  makes `src/engine/elekloader/octatrack-base.test.ts` fail until the package is regenerated
  (`npm run octatrack:base -- --stock ~/Downloads/OCTATRACK_OS1.40C_dist/OCTATRACK_OS1.40C.bin --write`). Base changes
  therefore live on side branches until the owner OKs a requalification on the unit.
- **Hardware.** Only one agent talks to the owner's Octatrack at a time. Read `docs/OCTATRACK_DRIVING.md` and
  `docs/OCTATRACK_HARDWARE_TRAPS.md` first. Never flash, never power-cycle, never SAVE or SYNC the owner's project:
  ask the owner. RAM boots from the flashed base need `npm run device -- boot DIR --chunk 4096` on macOS. After any
  crash restart, ask for a power cycle before the next RAM boot (a RAM boot right after one hung at the logo once).
- **Copy.** The owner's voice: a plain first-person note, minimal, no slogans, no AI or corporate phrasing. The action
  is **"Sync to Octatrack"**. Library add buttons stay main's plain **+**: "Add to <set>" was rejected as corny.
  **Report a problem** keeps the site's yellow.
- **Design.** Keep Modwerk's own style (tokens in `src/styles.css`, `src/components/octatrack-link.css`). For
  layout and behaviour use the Apple design skill in `~/.cache/modwerk-design/apple-design-skill/` (SKILL.md: review
  first, cite file › heading, numbers not adjectives). The owner likes options shown as ASCII sketches in
  AskUserQuestion before big layout changes.
- **The machine.** Eight cores, often overloaded: run targeted tests while iterating, and the full
  `npm run check` only when the 1-minute load is under ~16, inside `lockf -k /tmp/modwerk-check.lock`. Node 24:
  `export PATH=~/.nvm/versions/node/v24.21.0/bin:$PATH`. Disk is tight: symlink `node_modules` into new worktrees.
- Every commit ends with the session's Co-Authored-By line. Stage files by name; an untracked HANDOVER.md lives in
  the Codex worktree.

## Where everything is

| Branch | Head | What |
| --- | --- | --- |
| `codex/octatrack-elekloader-migration` (PR #464, open, mergeable, owner merges) | `2fe4b8ea` + this handover | The beta: browser base build, module sets over USB, beta gate, split-view hub, guided sync dialog, Web Lock across tabs |
| `claude/hub-merge-wip` | `cc7e67ea` | The owner's list for the hub, built and checked (1,887 tests; public views equal main) but not yet reviewed by the owner, so not on the loader branch (see Open work 1) |
| `claude/octatrack-base-stockfx` | `1f8a9d38` | Base: stock effects out of the menus (STOCKFX request 28, MWSF package, set format v2); restore message readable for 3 s. Emulator-tested, not on the unit |
| `claude/octatrack-abi7` | `29238fc5` (WIP) | Loader ABI 7: ColdFire/hybrid modules without stock bytes (hashes). Packages build; emulator refuses at commit (see Open work 3) |
| local only: `/Users/jannikassfalg/coding/modwerk-beta-sync` | `33d33577` (detached, unpushed) | Merge of main #467–#475 into the loader branch, held back by the retained-evidence decision |

Worktrees: `modwerk-beta-gate` (the beta UI; the owner's dev server runs from here), `modwerk-abi7`,
`modwerk-stockfx`, `modwerk-beta-sync`, plus finished ones (`modwerk-beta-base`, `modwerk-beta-sets`,
`modwerk-merge-dryrun`) that can go. The Codex worktree `~/.codex/worktrees/octatrack-elekloader-usb/modwerk` holds
the device tooling's `node_modules`.

Local review setup (the owner uses it): a mock API where everyone is a signed-in beta tester
(`~/.cache/modwerk-octatrack/frontend-tools/owner-mock-api.mjs`, port 18899) and Vite from `modwerk-beta-gate` on
port 15299 with `VITE_COMMUNITY_API_URL=http://127.0.0.1:18899/api`. Pretend unit:
`http://127.0.0.1:15299/?preview=usb-link&unit=base#octatrack` (`unit=none`: not connected).

## The owner's Octatrack (MKII), as left

- **Flashed** with the beta base `Modwerk-octatrack-beta3.bin` (`.bin` `9a86d7e1…`, base `dc1d7a39…`, from
  c9146e66; `~/Downloads/modwerk-usb-test/beta-9a86d7e1/`). E-Verb and Mini Verb installed and kept, saved on the
  card. Scratch project LIVE/MODWERK-TEST, bank C pattern 1 (every working Part equals its saved one). Bank B Part 2's
  working copy still has T5 FX2 at id 31 (TapeHead) from an earlier clamp: don't save it.
- **Qualified on it** (records in `docs/OCTATRACK_MODULE_EDGE_CASES.md`, `docs/OCTATRACK_ELEKLOADER_MIGRATION.md`):
  the 30-minute soak and qualification on the dev twin (8 modules, peaks under 72 %, no errors); the tester image
  over vendor requests only; a set load/keep/undo with the self-test; the flash; a power cycle restoring the set (case
  16); FUNC at boot skipping it (case 15); MISSING's NO fix on the unit.
- **Unread:** the crash record from the deliberate crash test (needs a dev base). The cause of one hang at the logo
  during a RAM boot is unknown.

## Open work

1. **Hub = configuration page** (`claude/hub-merge-wip`, `cc7e67ea`, on top of the loader branch). Built: beta Octatrack
   `#configuration` and `#octatrack` render the hub (`OctatrackHub.tsx` takes `header`/`grid`/`card` slots from App's
   `hubPage`; `hubRoute` covers both routes, so the classic configuration branch is never reached in beta). Next: the owner
   reviews it in the local setup; if they approve, merge it into the loader branch. Untested: a real unit, the card
   route's build/.bin flow inside the pane, touch devices, links into `#configuration` checked one by one. The owner's list: one page for the Octatrack (editing in
   place, the card route folded inside, nothing from the configuration page lost: ⋯ menu, Share/Compare, card route,
   ConfigurationEffects, USB Audio setup); "Sync to Octatrack" everywhere; no sync button in the top bar; keep the
   module dialog's ‹ › paging; Report a problem visible in the hub (yellow) and offered after a failed sync; "New"
   quiet, "+ New module set" under the list; no box in a box; the Octatrack photo big (~240 px+) in one horizontal
   band; tile chips Stays / Adds / Leaves with ×/Keep. The owner liked the split view in
   `~/.cache/modwerk-octatrack/frontend-tools/design/screens/2-hub-another-set.png`; the in-progress merge looked worse
   (`design/hub-merge-in-progress.png`). The owner had not yet seen cc7e67ea at the freeze.
2. **Stock effects** (`claude/octatrack-base-stockfx`): built, emulator-tested. Needs the owner's OK and a
   requalification on the unit (checklist in its commit and in the edge-cases doc, row 22). Then the stock-effect tiles
   can come back in the hub (they are hidden today).
3. **ABI 7** (`claude/octatrack-abi7`, `29238fc5`, WIP).
   - **Done:** the loader ABI 7 (`sdk/runtime/loader/loader.{c,h}`: 72-byte header, sites carry the SHA-256 of
     the stock bytes and the base reads them from running code, refusal 8 `RUNTIME_STOCK` on a mismatch, stock copies,
     rising relocations with address arithmetic, ABI 3-6 still load), host-tested including ASan. `build.py --octabam`
     builds without firmware for Preview Vol, Play Modes, Repitch, VECTOR, Analog BD, POLY8, Tape Echo and Euclid (Tape
     Echo and Euclid equal the private ABI 6 packages but for the hashes).
   - **Excluded for now:** Recorder Loop Fix and CC Map (caves), Output Matrix (stock DSP hooks), Mute Modes
     (tables), USB Audio, MIDI Scenes, Synth. Scale Quantizer grows stock tables and pins two units at 0x400d2ca8 /
     0x400d2cb0: it needs table support in the loader first.
   - **Emulator blocker:** in `ot_emu` (native and Docker) every package with stock-code sites is refused at
     commit (refusal 5), the unchanged beta1-dev base with the old Euclid too. Task 0x46105508's saved stack pointer
     reads 0, so `modwerk_machine_paused()` reports an unknown task state (33). Hypothesis: that task never starts in the
     emulator; on the unit Euclid and Tape Echo passed. Treating a never-run task as paused is a base safety change:
     review it, then prove it on the unit.
   - **Site gap:** `OctatrackLink` retries refusal 5 only on "rejected", not on a "backend" commit, so a busy
     publish of a site-bearing module fails a set load.
   - **Left:** the emulator question; the manifest and `public/octatrack-modules` entries with the `--stock` scan;
     `module-set.test.ts` (pins 4 ids and ABI 6); base regen; staging `abi7-<sha8>`; the check. Dev base:
     `~/.cache/modwerk-octatrack/abi7/dev1`, runs in `~/.cache/modwerk-octatrack/abi7/runs/` (its test packages were in a
     wiped scratchpad: rebuild them).
4. **One requalification** folding 2 and 3 into a new tester image, on the owner's unit, before either lands on the
   loader branch.

## Steps left to roll out the beta

The shortest path keeps the tester image as qualified (`9a86d7e1`): stock effects and ABI 7 come in a later round.

1. **The owner reviews the hub** (`claude/hub-merge-wip`, cc7e67ea) in the local setup (pretend unit, then the real
   unit in Chrome: connect, sync a set, self-test, Keep, Undo, missing modules, two tabs open). Fix what they find, then
   merge it into the loader branch.
2. **The owner decides the retained-evidence question** (below). Then merge main into the loader branch (the held
   merge in `modwerk-beta-sync` or a fresh one), confirm the base guard still passes, and get
   `npm run check -- --base origin/main` and PR #464's checks green. `module-paths-windows` already failed on 4fa5cb81:
   find out why.
3. **The tester note**: the owner confirms its facts, and the bracketed UI names become the final ones (the hub,
   "Sync to Octatrack").
4. **The owner merges #464.** `pages.yml` deploys the site after the owner-approval check and a full module rebuild;
   `worker.yml` applies migration `0071_base_install_prompt.sql` and deploys the Worker.
5. **Verify the live site:**
   - as a visitor and a plain member, nothing changed;
   - as the owner (admin), the beta UI shows;
   - a base built in the browser on the live site hashes to `9a86d7e1…`;
   - the four module packages download and match the manifest;
   - `/api/auth/base-install-prompt` answers.
6. **The owner adds beta testers** (Admin → Accounts → Beta testers) and sends the note.

Later, not blocking the first beta:
- stock effects (Open work 2) and ABI 7 (Open work 3) in one new tester image, requalified on the unit; testers then
  reinstall the base;
- the RAM-boot gate decision;
- reading the crash record;
- trying the card route on an iPad.

## Open decisions (the owner's)

- **Retained evidence vs main: decided 14 October 2026.** Retained evidence no longer compares shared `src/engine`,
  platform or build code, only the module's own folder and its own rows in `src/engine/assets`
  ([qualification](MODULE_QUALIFICATION.md)), so the branch's engine changes no longer fail `modules:check`.
- **The tester note** `~/Downloads/modwerk-usb-test/BETA_TESTER_NOTE.md`: its "For Jannik: facts to confirm" list
  (the self-test plays the pattern, removing a bad module after a FUNC skip, the card route replacing the base, step 5's
  effect picking).
- **When to merge #464**, and which beta testers to add (Admin → Accounts → Beta testers).
- **The RAM-boot gate** is still in the tester base: any host the tester allows on USB could boot other firmware in
  RAM without a confirmation (nothing written to flash). Removing it needs a new image and requalification.
- **iPad**: no WebUSB or Web MIDI in iPad browsers. The card route probably works (untested). Live sync would need a
  native app; the preferred transport is USB MIDI SysEx in the base.

## Records

`docs/OCTATRACK_ELEKLOADER_MIGRATION.md` (the plan and hardware runs), `docs/OCTATRACK_MODULE_EDGE_CASES.md` (what
is proven), `docs/OCTATRACK_HARDWARE_TRAPS.md`, `docs/OCTATRACK_DRIVING.md`, `docs/OCTATRACK_MORE_EFFECT_IDS.md`,
`docs/APP_DEVELOPMENT.md` (the beta gate, the hub, releasing USB to everyone), `sdk/machines/octatrack/elekloader/README.md`
("The base in the browser").
