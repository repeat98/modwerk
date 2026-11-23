# Draft review request: SuperSAW-OT for Octatrack MKII

Prepared locally; not posted, submitted or approved.

Hi Modwerk team,

I’m José Aleixo (GitHub name recorded in this project: jokobol). I’m developing
SuperSAW-OT with AI coding assistance: a monophonic saw track machine for the
Octatrack MKII, with one to seven oscillators and six SRC controls: TUNE, DETN,
MIX, OSC, WIDE and LEVL. OSC changes oscillator count, not polyphony. A sub
oscillator and chord mode are deferred so we can focus on this version.

The reference sound engine remains unchanged. Its source components retain
Tim Hastie’s and Sam Banks’s credits and licences, with separate SDK notices;
provenance and licence files are included. No firmware, stock dumps, factory
samples or private CF images are part of the submission.

## What has been tried

The exact private package SHA-256 is
`52df3143854f203044dde02d82a634bf2e5d5e1723c1adcd8c0e11a7afe2f476` (ABI 8).
On public base 0.7.13,
`6d23e888c47ab959762044c4facaa0b2b55fed85527284f38f3cea4d80beb58a`,
whose maximum package ABI is 10:

- The published base was reconstructed locally and the unassigned RAM trial
  and Undo rehearsed in the emulator, including both DSP interpreters.
- An actual unassigned ten-second RAM trial passed on my MKII: Undo confirmed
  the previous identity and empty inventory. I did touch controls during it,
  so it is not an untouched performance baseline.
- I heard sound on T1 with notes on steps 1/4/7/9/12/15; TUNE/DETN/WIDE P-locks;
  a filter in FX1; and delay BASE/FB/WDTH/SEND P-locks on step 9 in FX2. Short
  FLEX kick, hi-hat and clap samples played on T2–T4. I heard no clicks or
  saturation in this test and liked the different oscillator-count settings.
- The full 600-reading journal reaches 57.1% global CPU; the requested readings
  visible in my screenshot reach 48.9%. Neither is an isolated renderer cost.

Historical trials on the former public base also covered AMP, LFO and more
sample tracks. These remain labelled as historical; they do not qualify this
base’s persistence or performance.

## Open issues to review

The listening trial reached its ten-minute limit before I returned T1 to FLEX.
The timed rollback failed with `needs-recovery`; its last status was recovery
with unknown active identity, without an explicit occupied-Part refusal 7.
A later recovery check found the unit already normal with known identity and
zero modules; it performed no new rollback. This does not erase the earlier
failure or establish its internal cause. `SESSION_END_REVIEW.md` records the
host-side timeout path and the remaining questions. The host client now waits
for explicit operator confirmation after its duration alert; host regressions
pass. Two subsequent short-mode trials on the same MKII/base/package waited
for my Q and confirmed Undo, the previous identity and empty inventory,
without Keep. This verifies the revised manual exit twice; it does not
establish the previous firmware refusal’s cause or qualify persistence.

The current pinned base’s known absent-machine signatures cover AB, FM, WV
and FR, but not SW/1. Its comment describes battery-restored Part validation
before saved modules are restored. We have a separate historical minimal
proposal in `SW1_BASE_PROPOSAL.patch`; it was not applied to my public base.
No Keep, saved SuperSAW project or physical reboot qualification is claimed.

Could you review:

1. The correct shared-base treatment of SW/1 during absent-machine boot validation.
2. The rollback failure and the correct public lifecycle for this track machine.
3. Integrating the runtime through the current public source/package recipe,
   followed by measured render/rest cost and the required hardware qualification.

The source manifest and USB-only declaration are present. The official recipe,
resource measurements, durable lifecycle, UI media and release checks remain
incomplete. Please treat this as an **experimental source review**, not a
request to list an approved public release. I would welcome technical feedback.

Thanks,
José Aleixo
