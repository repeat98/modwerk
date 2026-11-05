| Digi Perform: the hook after the engine's LFO stage, and the SETTINGS rows.
| The logic is in perf.c. Firmware addresses are OS 1.53's; OS154 selects 1.54's.
| Adapted from Digi Matrix's glue (MIT, the digi1_mods authors), see NOTICE.

        .ifdef  OS154
        .equ    .LF_4017ac20, 0x4017af20
        .else
        .equ    .LF_4017ac20, 0x4017ac20
        .endif

        .text

| ---------------- render: after the LFO stage (0x40077eb2) ---------------------------------------
| Replaces "lea (16,sp),sp; clr.l d0", the two instructions after the LFO stage's call, while its
| arguments are still on the stack: (sp) = the smoothed parameter words after our return address.
| digiperform_post adds the macros' offsets into them.
        .balign 2
        .globl  digiperform_posthook
digiperform_posthook:
        move.l  4(%sp), -(%sp)                  | the smoothed words
        jsr     digiperform_post
        addq.l  #4, %sp
        move.l  (%sp), %d0                      | our return address
        lea     20(%sp), %sp                    | it, and the 16 bytes the lea dropped
        move.l  %d0, -(%sp)
        clr.l   %d0                             | the clr.l this replaced
        rts

| ---------------- SETTINGS: the PERFORM row -----------------------------------
        .globl  digiperform_settings
digiperform_settings:
        pea     row_perform
        move.l  8(%sp), -(%sp)                  | the menu
        jsr     core_additem
        addq.l  #8, %sp
        rts

| label: builds the std::string in a0
        .macro  ROWLABEL fname, sname
        .balign 2
\fname:
        link    %a6, #-4
        move.l  %d2, -(%sp)
        pea     -1(%a6)
        pea     \sname
        move.l  %a0, %d2
        move.l  %a0, -(%sp)
        jsr     .LF_4017ac20                      | std::string(this, const char*, alloc&)
        lea     12(%sp), %sp
        move.l  %d2, %d0
        move.l  -8(%a6), %d2
        unlk    %a6
        rts
        .endm

        ROWLABEL row_label_perform, str_perform
        ROWLABEL row_label_title, str_title

        .balign 4
row_perform:
        .long   row_label_perform, digiperform_select, digiperform_rowdraw, digiperform_change
str_perform:
        .asciz  "PERFORM EDIT"
        .balign 2

| ---------------- the audio TRIG page's key handler: TRIG again opens the page ------------------------
| ParametersSeqNoteView (the audio tracks' TRIG page) keeps its key handler in vtable slot 2: (this, event) ->
| nonzero when it took the key. digiperform_trigkey (perf.c) takes a second press of TRIG; anything else goes
| to the stock handler, whose own arguments are still on the stack. The MIDI tracks' pages are not touched.
        .equ    STOCK_AUDIO_TRIG_KEY, 0x40033076

        .balign 2
        .globl  digiperform_trigview_audio
digiperform_trigview_audio:
        pea     STOCK_AUDIO_TRIG_KEY                | the stock handler, for a replayed press
        move.l  12(%sp), -(%sp)                 | event
        move.l  12(%sp), -(%sp)                 | this
        jsr     digiperform_trigkey
        lea     12(%sp), %sp
        tst.l   %d0
        bne.s   1f
        jmp     STOCK_AUDIO_TRIG_KEY
1:      rts

| ---------------- the TRIG page's title: "Perform mode" while the page is open ------------------------
| Slot 19 of the audio view's vtable builds the page's title: (this), the std::string goes to a0. While the page
| is open from the TRIG page the title is ours, and the firmware's own header animation shows it; every other
| time the stock builder runs, its arguments untouched.
        .equ    STOCK_PAGE_TITLE, 0x40030930

        .balign 2
        .globl  digiperform_title_view
digiperform_title_view:
        tst.l   digiperform_title_on
        bne.s   1f
        jmp     STOCK_PAGE_TITLE
1:      jmp     row_label_title

str_title:
        .asciz  "Perform Mode"
        .balign 2

