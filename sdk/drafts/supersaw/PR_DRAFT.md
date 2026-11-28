# Draft: SuperSAW-OT experimental track machine for Octatrack

**Early source-review draft; not an installable release.**

Prepared following repeat98’s direction in:
https://modwerk.app/forum/thread/82cd7541-f913-4a2e-b994-e7194a0518f6/

Source-only staging under `sdk/drafts/supersaw`; no shared base changes,
no public package, no catalogue entry and no release-readiness claim.
The original EXPORT_MANIFEST.json describes the imported archive, before
subsequent documentation updates.

## Behaviour and scope

SuperSAW-OT is José Aleixo’s monophonic saw track machine: one to seven
oscillators, detune and stereo spread, with TUNE, DETN, MIX, OSC, WIDE and LEVL
on SRC. One instance per Part. The reference sound engine is unchanged.
This source draft seeks technical review; the current public build recipe
and release qualification are incomplete. No catalogue listing is requested
by this draft. Version: `0.32.0-source-draft`.

Compatibility: Octatrack MKII OS 1.40C on the exact public Modwerk 0.7.13
base below. Modwerk 0.8, other hardware models/bases and Octabam 0.5 are not qualified.
Sub oscillator and chord mode remain deferred.

## Source and media attribution

Author and physical listening reports: José Aleixo / jokobol, with AI coding
assistance. Tim Hastie and Sam Banks notices are retained in the source and
licence files, with GPL-3.0-or-later notices for the SDK components where
specified. See provenance.json and the LICENSE files. The SVG thumbnail is
original authored signal artwork; current-version hardware UI captures still
need selection. No firmware, dumps or card images are included.

## Tested on a unit

José Aleixo’s Octatrack MKII, public Modwerk 0.7.13 base
`6d23e888c47ab959762044c4facaa0b2b55fed85527284f38f3cea4d80beb58a`,
private ABI 8 package SHA-256
`52df3143854f203044dde02d82a634bf2e5d5e1723c1adcd8c0e11a7afe2f476`.

Unassigned RAM Trial/Undo passed. José reported sound on T1 with notes at
1/4/7/9/12/15, TUNE/DETN/WIDE P-locks, FX1 filter, FX2 delay locks and short
FLEX samples on T2–T4; no clicks or saturation reported. The original timed
exit failed with needs-recovery; a later check found normal mode and an empty
inventory already at entry. After the host was changed to request operator
confirmation before Undo, two consecutive short-mode exits confirmed the
previous identity and empty inventory. None performed Keep.

The frozen engine corresponds to the historical package; rebuilding that
exact package through the current public recipe remains open. These tests
do not attest that a newly built public package has been tried.

Full journal peak: 57.1% global CPU, not an isolated renderer cost. Emulator
results are separately labelled. See sdk/drafts/supersaw/TESTING.md and its
evidence files for the recorded scope.

## Edge cases

| Case | Why this change makes it a risk | How run | Result |
|---|---|---|---|
| Wrong base, ABI, package, nonempty inventory or missing module reference | An unrelated runtime could be altered | Host preflight fixtures | pass |
| Timeout while the user has not confirmed STOP/FLEX | The former host attempted rollback automatically | Host fake-clock lifecycle; two hardware short-mode waits for Q | pass for revised manual path |
| Unknown transfer or unsuccessful rollback | Replaying an uncertain write or announcing false success | Fault-injection fixtures | pass for host refusal handling |
| Previous timed needs-recovery | Underlying firmware refusal remains unexplained | Native interrupted journal plus later state check | fail for original timed exit; internal cause open |
| Manual Undo | Restore the exact previous identity and release runtime resources | Two consecutive MKII short-mode checks | pass |
| Sound, locks and sample coexistence | A source might render incorrectly during modulation | José’s current-base T1 listening report | pass for reported scene |
| Ten-minute duration on revised client | Short-mode timing does not exercise a full ten-minute run | No new full-duration unit run yet | not run: short-mode host/manual path exercised first |
| EOF or CPU alert while still assigned | The user may not have released the source | Host control tests only | not run on unit: fault/safety cases kept to host fixtures |
| Keep, SAVE PROJECT, physical reboot and absent SW/1 | Persistent Parts may be validated before module restore | Prior local proposal and emulation are historical only | not run: public SW/1 protection and durable lifecycle require review |
| Isolated renderer and at-rest cost | Global readings cannot size this module’s real cost | No matched current-base physical measurement | not run: required measurement pending |

## Review requested

- Public source/package integration using the shared hooks and guarded copies.
- SW/1 absent-machine validation in the shared base, separately from module work.
- The unresolved firmware rollback refusal, then the remaining qualification.

## Validation commands and results

- Module document schema and frozen engine/SDK hashes: pass locally.
- Audition coordination, current/legacy lifecycle, console and recovery host checks: pass.
- Current-base unassigned RAM rehearsal, frame-only and two emulated DSPs: pass;
  emulator evidence does not qualify hardware timing or persistence.
- `MODWERK_BOARD=off npm run module:doctor -- --draft supersaw --release`:
  fail as recorded. Catalogue, public package/recipe, fingerprint, own render
  cost and full qualification remain incomplete. The page-control check flags
  a host page fixture; no check was weakened.
- Mac host recheck, 23 November: four Node test files passed against this
  checkout using simulated transport and the historical private package input.
- `npm ci`: prepare blocked by a missing upstream `src/config/usb-audio.ts`
  imported by `scripts/machine-modules.mjs` on main `6b741ea1`. No shared tool
  was edited to bypass the failure.
- `npm run pr:ready`: not claimed. Required before marking the PR ready.

What the guides lacked or got wrong, and where I fixed it: no general guide
change is proposed here. The private client’s overly broad promise to wait
for FLEX is analysed and corrected inside this module’s test tooling.

## Author attestations

Intentionally left for José’s personal review; no automatic-publication opt-in.

- [ ] I read the category guide and TESTING.md identifies untested cases.
- [ ] Source and media are mine or properly licensed, with notices and full licences retained.
- [ ] Hardware results and current UI captures match the exact build and the named tester’s observations.
- [ ] Automatically merge and publish my module update after checks pass.
- [ ] All required acceptance checks, including persistence where applicable, are personally verified.
