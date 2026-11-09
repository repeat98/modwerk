; M0 probe v2 (probe build only): the DSP Full check 0xC00BB4E0 compares the
; patch's summed effect costs against 225.0f, built as mvk 0 (0xC00BB52A) +
; mvkh 0x4361 here. 300.0f = 0x43960000, so heavier patches can be loaded and
; measured on P1. Same register, same unit: only the constant changes.
        .text
        .nocmp
        mvkh    .S2     0x43960000, b4
