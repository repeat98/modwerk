# Handover: Octatrack cost batch after base 0.8 (23 November 2026, 15:40)

Branch `handover/octatrack-cost-batch-2026-11-23`, never to be merged. It holds this note, the scripts that ran on
the owner's MKII, and `results/`. A job on the owner's PC commits the last results here when the queued unit runs
end (see "Still running").

## Where 0.8 stands

- Base 0.8 is merged (#1910) and live since 13:03. The cost procedure (#2043) is merged: from 24 November every
  module release needs a curve that is not saturated, a clean admission run and a price bound to its version.
  #1976 and #1869 are closed as superseded by Tape Echo 0.1.9.
- **#2032 (Zac-Kyoti's four stock fixes) shipped in 0.8 without a run on hardware.** dev-f2 reported this; its
  `verify-2032` agent ran the owed checks on a 0.8 twin from 15:03 (large-set trial, KITS clone, bank P). Ask dev-f2,
  or read its record, for the result.

## Euclid 0.1.6 (#1868) and Repitch 0.2.2 (#1866): the earlier "saves nothing" was wrong

The A/B at 14:40 compared an awake module with an awake one. On twin `678843cc` a rest check (`restcheck.sh`) read
each module's `rests` sites with `mem:` while it was installed in a rolled-back trial. They stayed patched
(`4ef9…` jmp) at 0, 6 and 12 seconds playing and after STOP:

- **Euclid** is an effect, so the base keeps it awake while any Part of the project names its effect id. Dev17 bank A,
  the working copy of Part 1, had Euclid on T4 FX1 (also Tape Echo on T4 FX2 and Air Chorus on T5 FX2).
- **Repitch** answered in use although no Part sets TSTR to REPITCH. Every C04 track is on TSTR AUTO, and for AUTO
  `rp_find` reads the bound sample's TSMODE (`+0x110` of a settings record at `0x100d…`, outside what `mem:` reads).
  Most likely Dev17's samples carry TSMODE REPITCH. `tstr_resolve` (0x40007d96, voice renderer) stays patched by
  design, so part of Repitch's +2.1 remains even when it rests.

The owner then declared Dev17 a scrap project. `fair.sh` puts stock FILTER on bank A Part 1 T4 FX1, sets every
bank C Part 1 track to TSTR NORM, repeats the rest check, alternates old and new at rest twice, and finally sets
TSTR back to AUTO (other sessions' records use Dev17 C04 as their scene). Results: `results/fair/`.

Read them like this: in `restcheck-read.txt`, a site that reads `= stock` during the trial means the module rested.
Only then does the at-rest A/B in `ab.log` say what the update saves.

## Amiga 0.3.1 (#1979) and SYNTIZ 0.1.1 (#1978)

Both branches have main merged and are pushed (`4c9f39b2d`, `4be16b8ec`; still drafts). Their packages rebuild byte
for byte on base 0.8: Amiga `9cbb7481…`, SYNTIZ `c3a97ecc…`. A fresh worktree needs `npm run prepare` before
`octatrack:module-packages`, or the FX page step fails on `module-changelogs.json`.

Amiga, `machab.sh`, twin `678843cc`, curve on Dev17 C04, picks on C02:

| | at rest | curve first / each | admission empty / medium | first reading |
|---|---|---|---|---|
| 0.3.0 (published) | +0 | 30.1 / 8.3 | admitted 51.0 % / admitted 111.9 % | 111.7 % |
| 0.3.1 | +0.1 | 28.2 / 6.8 | admitted 50.8 % / admitted 108.8 % | 109.5 % |

No render was dropped and nothing stalled. Both curves saturate C04, so the procedure marks both NOT RELEASABLE as
records. 0.3.1 is cheaper by about 2 points on the first copy and 1.5 on each further one, much less than the 22 Nov
estimate (22.1 against 26.6). The written records were removed from the branch; a copy is in
`results/amiga-031-frame-cost.json`. Next: read the curve on a pattern with room (`--measure-pattern`, the tool's
own hint), then hand the owner the approval values.

SYNTIZ, same twin and scenes (finished 15:35):

| | at rest | curve first / each | admission empty / medium | first reading |
|---|---|---|---|---|
| 0.1.0 (published) | +0 | 27.5 / 5.1 | admitted 64.2 % / admitted 101.9 % | 101.1 % (saturated) |
| 0.1.1 | +0 | 18.6 / 5.5 | admitted 56.0 % / admitted 95.4 % | 97.7 % |

SYNTIZ 0.1.1 passes the procedure cleanly and is about 9 points cheaper on the first copy. Its record is committed
on #1978 (`32df915a6`: `evidence/frame-cost.json` and the `frame-costs.json` line). It still needs the owner's
approval file before release.

## Laslo (Lasl00)

He took the rest peaks: each of POLY8, FM Synth, SYNTIZ, Amiga, Grain and VECTOR installed alone and unused on
CPUTEST with a 0.8 dev twin, then all six, then into the code (board thread `3ae6f861`). The owner's reply
`61b4cefb` tells him a module rests only while no Part names it, and how to check that with `mem:` on its `rests`
sites. His original Discord message was most likely a DM, which the bot cannot read or send. After the rest peaks
he plans the controllers in the UI tick and the missing prices.

Background for him and for us: in the 0.8 readiness run, six unused machines added about +8 points to the longest
frame on Dev17 C03, while the mean rose only 1.7. Dev17 may name some of them, which would keep them awake there.

## Next steps

1. Read `results/fair/`. If Euclid and Repitch now rest, decide from the A/B whether 0.1.6 and 0.2.2 are worth
   releasing. If Repitch still does not rest with TSTR NORM, its `ev_in_use` path has a bug (TESTING.md lists the
   AUTO/TSMODE case as not run).
2. SYNTIZ 0.1.1 is ready for the owner's approval file. Amiga 0.3.1: re-read the curve on a pattern with room,
   then its approval file.
3. Mini Verb 0.2.4 (#2027) needs only the owner's approval file.
4. POLY8 0.3.4 (#1863) stays on hold: it failed its playback test.

## Where things live on the owner's PC (WSL)

- Worktrees in `~/modwerk/.wrangler/`: `amiga-031`, `syntiz-011`, `euclid-016`, `repitch-022`, and `cost-record`
  (main plus #2043 tooling, used for the published-version readings).
- Scripts, packages and logs: `~/.cache/modwerk-local/ot/rel-08/` (`pk/` holds the private packages; `restcheck/`,
  `restcheck-1500/`, `fair/`). The twin is `678843cc`, served by the rel-08 loop (`q/dev.sock`, `q/share.sock`).
- The original WSL session: `3d447a4e` in `~/.claude/projects/-home-jannikassfalg-modwerk/`; its memory
  `base-08-release.md` has the correction.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
