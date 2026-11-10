; Mixer Mode M2: midi_cc handler.S hands CCs outside 14-73 to the mixer's cc
; (vector +64) instead of step.S; the mixer passes all but CC 85-95 on to
; step.S. Replaces handler.S's mvkl / mvkh STEP, b0 at 0xC00F2818.
        .text
        .nocmp
        mvkl    .S2     0xC00F6040, b0
        mvkh    .S2     0xC00F6040, b0
