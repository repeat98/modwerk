| SYNTH MACHINE -- the machine list's SELECTION GUARD and the engine's LOAD BUDGET, its
| numbers (2.15 the guard; 2.16 the budget). GNU as. Not assembled on its own:
| synth/manifest.py reads this file into machine.s's `remix.inc` (after the shared
| equates), so these numbers are the only place the limits live. Values only: no code,
| no data.
|
| FM SYNTH and SY DRUM render on the ColdFire; with too much of them in one Part the
| unit runs out of time and freezes. 2.15 counted tracks (at most 1 FM SYNTH track, 2 SY
| DRUM tracks, FM SYNTH beside at most 1 SY DRUM track). 2.16 prices the ACTIVE PART
| instead: every FM SYNTH track costs by the voices that may sound on it, every SY DRUM
| track a fixed amount, two amounts are paid once, and the FM voices are CAPPED so the
| Part fits the budget (machine.s ml_cap: the largest v in 4, 3, 2, 1 whose cost fits;
| the engine plays min(VOIC, cap) voices on each FM SYNTH track, poly.s po_voiccap; the
| VOIC shown is the Part's). The machine list and the paste guards (machine.s ml_guard,
| ml_over) refuse a choice only past the hard caps below or when the Part would be over
| the budget even with every FM SYNTH track mono. Retune here after a reading of
| PROCESSOR LOAD on the unit; every other line follows (the messages print the hard caps).
|
| The weights are points of PROCESSOR LOAD's worst block W above an empty project (W 34
| on the author's MKI, OS 1.40C, 18 Oct 2026, OCTATRICK 2.14 which has no guard): every
| synth track playing a 16-trig pattern of four-note chords (CHRD set, VOIC = the voice
| cap under test, DEC long enough that the chords overlap), the upper end of W's range
| read with FUNC held. Fitted to twelve readings (HANDOFF_2.16.md, section 2): 1 FM at
| VOIC 1 / 2 / 3 / 4 read 64 / 70 / 72 / 74; 2 FM at 1 / 2 / 3 / 4 each 70 / 80 / 82 / 86;
| 2 FM at 1 + 1 SY 81; 2 FM at 2 + 1 SY 92; 1 FM at 1 + 2 SY 86; 2 FM at 1 + 2 SY 88 (and,
| 16 Oct: 1 SY about 60, 2 SY 67 - 76, 1 FM at 4 + 1 SY 76 - 85). The model is within a
| point of the readings everywhere that matters and reads high where it is off.
|
|   cost of a Part with every FM SYNTH track at v voices
|     = LOAD_S_ANY * [any FM SYNTH or SY DRUM track] + LOAD_S_FM * [any FM SYNTH track]
|     + nFM * LOAD_FM_Vv + nSY * LOAD_SY_TRACK
|   allowed when the cost at v = 1 is <= LOAD_BUDGET; cap = the largest v with cost <= LOAD_BUDGET
|   (1 when none fits: a Part saved past the budget by an older build plays as saved, mono).

        .set    ML_FM_MAX, 2             | FM SYNTH tracks in the Part, at most (the hard cap: "FM SYNTH: 2 MAX")
        .set    ML_SY_MAX, 2             | SY DRUM tracks in the Part, at most (the hard cap: "SY DRUM: 2 MAX")
        .set    LOAD_S_ANY, 15           | paid once when the Part holds any FM SYNTH or SY DRUM track (the engine's shared cost)
        .set    LOAD_S_FM, 13            | paid once when the Part holds any FM SYNTH track (the FM engine's own fixed cost)
        .set    LOAD_FM_V1, 4            | per FM SYNTH track whose EFFECTIVE voice cap is 1 (the mono path)
        .set    LOAD_FM_V2, 9            | ... cap 2 (the paraphonic engine: about 5 above mono)
        .set    LOAD_FM_V3, 10           | ... cap 3 (each voice above 2 about 1.5 more)
        .set    LOAD_FM_V4, 12           | ... cap 4
        .set    LOAD_SY_TRACK, 11        | per SY DRUM track (about 11 beside FM tracks; alone it also pays LOAD_S_ANY)
        .set    LOAD_BUDGET, 54          | the most a Part may cost: a worst block of about 88 in an empty project, the
                                         | ceiling the author has run on his unit (2 FM at 4 each 86, 1 FM at 1 + 2 SY 86;
                                         | 2.15's own maximum, 1 FM at 4 + 1 SY, 85)
