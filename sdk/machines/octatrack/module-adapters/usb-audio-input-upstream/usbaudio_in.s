| usbaudio_in.s -- USB AUDIO IN: the host's channels standing in for inputs.
|
| The host's channels stand in for inputs A/B (INPUTS AB), C/D (INPUTS CD)
| or A-D (INPUTS ABCD) by the INPUTS run-time setting (usb_inputs, set by
| usbaudio.s's cfgsel); with INPUTS OFF, the IN interface (usb_in_iface,
| 5 with MIDI, 3 without) is not served and this unit never runs. Which
| inputs the channels land on is the DSP inject's
| business (rx_inject.asm, which runs the passes in_tx's flag words select): this unit
| ships the host's channels in host order, 2 or 4 x 24-bit in 4-byte
| little-endian subslots per frame, 11/12 frames per 250 us packet
| (<= 96 B for a pair, <= 192 B for four).
|
|   USB side (this unit, all in the frame transfer machine's state 7):
|     EP3 OUT up/down follows the host's SET_INTERFACE on the IN interface;
|     four dTDs stay
|     queued; each retired dTD's frames go into a 1,024-frame ring and the
|     dTD is queued again at the tail (the Chipidea add-dTD procedure, as
|     usbaudio.s does for EP3 IN).
|   DSP side: once per 16-sample frame, 16 ring frames become TX_WORDS
|     host-port halfwords for core 0 at $6320, the idle bank + $320 after the
|     DSP's mask: two passes (in_build), each a flag word then, flag 1, 16 x
|     (hi, lo) halfwords for two channels, hi = sample[23:8], lo =
|     sample[7:0]: the CD pass (CD, ABCD) and the AB pass (AB, ABCD), then
|     zero pad. The DSP inject copies them over the module's slots of the RX
|     block the next frame, and leaves the block alone on a 0 flag.
|
| Hooks (manifest.py):
|   0x4001dd0a  SET_INTERFACE: usbaudio's shim sends every interface but the
|               audio one here; the IN interface's alt 0/1 records the alt
|               and ACKs, any other alt STALLs, the rest goes on to the
|               stock (mass-storage) handler. GET_INTERFACE on the IN
|               interface is answered by usbaudio.s.
|   0x40004bc0  frame transfer state 7 (8 bytes): first visit does the work
|               and starts one more transfer; its completion is the second
|               visit, which runs stock state 7 (the frame IRQ unmask).
|   0x4001de6e  the EP0 stall store: vendor GET 0x56 answers the counters.
|
| Memory: the dTDs and packet buffers are in on-chip SRAM (SRAM_*, declared
| in the manifest's Claims.sram; the four-channel buffers reach 768 B): the
| controller reaches SRAM through the backdoor, it is not cached, so what the
| CPU writes is what the DMA reads.
| The host-port block for the DSP is in on-chip SRAM too (SRAM_TX): the CPU
| writes it there at SRAM speed and eDMA channel 0 reads it from there, as
| stock's own frame transfers do from 0x8000xxxx. Until 27 Oct 2026 it was in
| SDRAM, written through the uncached alias: in_build took 9.5-10.1 us a frame
| on Bryan T's MKII (a frame profiler, IN ABCD). The ring and the state are
| CPU-only. Packet buffers
| in SDRAM through the alias have not been measured with USB CROSSBAR on.
|
| Latency: the ring runs at IN_TARGET frames of cushion. With implicit
| feedback the host's OUT rate follows EP3 IN's packet sizes, and those
| follow usbaudio's rate servo. That servo is proportional and holds EP3 IN's
| fill at AUD_TARGET, so this ring, which mirrors EP3 IN's, holds too.
| (Before it, a +-128-frame deadband let both rings wander by its width.)
| IN_TARGET then only has to cover a block, a packet and the jitter the unit
| shows (376-395 around 384 on Bryan T's MKII, 28 Sep 2026). The two rings'
| fills sum to a constant set at stream start (README, Latency).
| SPDX-License-Identifier: MIT

.set UNCACHED,       0x08000000
.set SRAM_DTDS,      0x80007c00     | NSLOTI dTDs, 32-byte aligned (128 B)
.set SRAM_BUFS,      0x80007c80     | NSLOTI packet buffers (384 B, or 768 for four channels)
.set SRAM_TX,        0x80007880     | the host-port block for the DSP (TX_BYTES), 16-byte aligned
.set SRAM_REPLY,     0x80007f80     | EP0 reply for 0x56 (64 B)

| ---- firmware sites (1.40C) ----
.set SETUP_BMREQ,    0x46c8ce08     | the SETUP packet, byte by byte
.set SETUP_BREQ,     0x46c8ce09
.set SETUP_WVALL,    0x46c8ce0a     | wValue low = alt setting
.set SETUP_WVALH,    0x46c8ce0b
.set SETUP_WIDXL,    0x46c8ce0c     | wIndex low = interface number
.set SETUP_WLENL,    0x46c8ce0e
.set SETUP_WLENH,    0x46c8ce0f
.set EP0_SEND_TAIL,  0x4001de5c     | jsr usb_ep0_send(len, buf); addq; done
.set EP0CTRL,        0xfc0b01c0     | ENDPTCTRL0
.set EP0_TXS,        16             | ENDPTCTRL0 bit 16: TX stall
.set EP0_STATUS_IN,  0x4001d524     | zero-length EP0 IN status (ACK)
.set SETIFACE_DONE,  0x4001de74     | control-request-done
.set SETIFACE_REJOIN,0x4001dd10     | stock SET_INTERFACE after the displaced oril
.set STATE7_DONE,    0x40004bc8     | the transfer IRQ's movem restore + rte
.set FRAME_UNMASK,   0xfc04801d     | stock state 7's write (INTC0 CIMR <- 1)
.set VENDOR_REQ,     0x56           | usbaudio answers 0x55 with its own

| ---- USB controller ----
.set EPLISTADDR, 0xfc0b0158
.set ENDPTSTAT,  0xfc0b01b8
.set EPPRIME,    0xfc0b01b0
.set EPFLUSH,    0xfc0b01b4
.set EPCOMPLETE, 0xfc0b01bc
.set ENDPTCTRL3, 0xfc0b01cc
.set USBCMD,     0xfc0b0140
.set ATDTW,      0x00004000         | USBCMD add-dTD tripwire
.set PORTSC1,    0xfc0b0184
.set PORTSC_PSPD, 0x0c000000        | bits 27:26 = port speed
.set PORTSC_HS,  0x08000000         | 2 = high speed
.set QH_LIST,    0x4ec94800         | the firmware's dQH list (fallback)
.set QH_EP3OUT_OFF, 6*64            | EP3 OUT is list entry 3*2
.set EP3OUT_BIT, 0x00000008         | ENDPTPRIME/STAT/COMPLETE/FLUSH bit
.set CTRL3_RX,   0x00000084         | ENDPTCTRL3 RX half: RXE + isochronous
.set DTD_ACTIVE, 7                  | dTD token bit 7
.set DTD_ERRS,   0x68               | token: halted, data buffer error, transaction error

| ---- the eDMA / host port (as states 4/5 program them) ----
.set EDMA_SADDR, 0xfc045000
.set EDMA_NBYTES,0xfc045008
.set EDMA_CITER, 0xfc045014
.set EDMA_BITER, 0xfc04501c
.set EDMA_START, 0xfc04401e
.set CORE_SEL,   0xfc0a400c
.set HOST_ICR,   0x20000000
.set HOST_CVR,   0x20000004
.set HOST_DATA,  0x2000001c
.set DSP_DEST,   0x6320             | idle bank + $320 after the DSP's mask

| ---- geometry ----
| The frame and packet widths follow usb_inputs at run time (2 channels for
| AB/CD, 4 for ABCD; usb_inputs 0 = OFF never brings the unit up). The ring
| and in_tx hold the ABCD maxima, one shape every image.
.set NSLOTI,     4                  | dTDs kept queued (1 ms of packets)
.set IN_FRAMES,  1024               | ring, frames (power of two)
.set IN_TARGET,  96                 | cushion before consuming, 2.2 ms (see Latency)
.set BLOCK,      16                 | DSP frame
.set TX_BYTES,   320                | 2 flags + 128 halfwords (the ABCD maximum) + pad: 5 eDMA minor loops of 64
.set TX_PAIR,    192                | a pair's transfer: 2 flags + 64 halfwords + pad, 3 minor loops
.set TX_WORDS,   TX_BYTES/2
.set NCOUNT,     15                 | longs in in_counters

| wValue / wIndex / wLength from the SETUP packet, 16 bits into \r. The low
| byte is a byte move: orl reads a long at \lo, which put wLength's low byte
| in bits 31-24 and left the clamp below unable to fire.
.macro SETUP16 hi, lo, r
    mvzb    \hi,\r
    lsll    #8,\r
    moveb   \lo,\r
.endm

    .text
| ---- SET_INTERFACE (0x4001dd0a) ---------------------------------------------
| Displaced: oril #0x00400040,%d0 (d0 = ENDPTCTRL1, loaded by the stock
| movel or by usbaudio's shim). d1 is free until 0x4001dd2e reloads it;
| d2/d3 are restored by the epilogue (0x4001de74).
    .global in_setiface_shim
in_setiface_shim:
    mvzb    SETUP_WIDXL,%d1
    mvzb    usb_in_iface,%d2        | latched by cfgsel: 0 when the IN
    cmpl    %d2,%d1                 | interface is not served (INPUTS OFF)
    bnes    3f
    tstb    usb_inputs              | and never up without an output stream
    beqs    3f
    mvzb    SETUP_WVALL,%d1
    moveq   #1,%d0
    cmpl    %d0,%d1
    bhis    2f                      | interface 5 has alt 0 and alt 1 only
    moveb   %d1,in_alt              | the request; state 7 brings EP3 OUT up/down
    jsr     EP0_STATUS_IN
    jmp     SETIFACE_DONE
2:  movel   EP0CTRL,%d0             | STALL, as the stock unknown-request tail does
    bset    #EP0_TXS,%d0
    movel   %d0,EP0CTRL
    jmp     SETIFACE_DONE
3:  oril    #0x00400040,%d0         | displaced
    jmp     SETIFACE_REJOIN

| ---- vendor GET 0x56 (installed at 0x4001de6e) ------------------------------
| Displaced: movel %d0,0xfc0b01c0 -- the stall's store (ENDPTCTRL0 with the
| stall bits already set in d0). Two paths reach it: the unknown-request tail
| (0x4001de6a's bset, which usbaudio's class shim also falls back into) and a
| standard-request stall (braw 0x4001de6e at 0x4001dd00).
| bmRequestType 0xc0 / bRequest 0x56 answers in_counters (NCOUNT big-endian
| longs) instead of stalling; everything else stalls as stock. wLength comes
| from the SETUP packet: d2 is wLength on usbaudio's path but not provably on
| the 0x4001dd00 one. d1-d3 are free: the epilogue at 0x4001de74 pops d2/d3.
| The reply is copied into SRAM first: the EP0 DMA reads memory, and the
| counters live in the data cache.
    .global in_ctrl_shim
in_ctrl_shim:
    movel   %d0,%d2                 | the stall value, for the reject path
    mvzb    SETUP_BMREQ,%d1
    cmpil   #0xc0,%d1
    bnes    .Lc_stall
    mvzb    SETUP_BREQ,%d1
    cmpil   #VENDOR_REQ,%d1
    bnes    .Lc_stall
    lea     in_counters,%a0
    moveal  #SRAM_REPLY,%a1
    moveq   #NCOUNT-1,%d0
1:  movel   %a0@+,%a1@+
    subql   #1,%d0
    bpls    1b
    pea     SRAM_REPLY
    moveq   #NCOUNT*4,%d3
    SETUP16 SETUP_WLENH, SETUP_WLENL, %d0
    cmpl    %d0,%d3
    bhis    1f                      | len > wLength: send wLength
    movel   %d3,%d0
1:  movel   %d0,%sp@-
    jmp     EP0_SEND_TAIL
.Lc_stall:
    movel   %d2,%d0
    movel   %d0,EP0CTRL             | displaced: the stall
    jmp     SETIFACE_DONE

| ---- state 7 (0x40004bc0) -----------------------------------------------------
| The transfer IRQ saved d0-d1/a0-a1; everything else is saved here. The
| first visit per frame is the stock machine's; our transfer's completion
| is the second, which runs the displaced stock state 7.
| While the stream is closed the DSP needs word 0 = 0 in both of its banks
| (the transfer lands in the working bank's +$320 and the banks alternate per
| frame), not a fresh block every frame: the block is transferred until
| ZERO_BLOCKS of them have completed since the close (in_zero_sent), then
| skipped, and the first visit runs the stock state 7 itself. in_seconds
| therefore counts transfers, not frames, while closed. (Bryan T, 4 Oct
| 2026: one eDMA transfer and one interrupt pass per frame for nothing with
| no host; not measured since.)
.set ZERO_BLOCKS, 4                 | two banks; two more for margin
    .global in_state7_shim
in_state7_shim:
    tstb    in_busy
    bnes    .Ls7_second
    lea     %sp@(-40),%sp
    moveml  %d2-%d7/%a2-%a5,%sp@
    bsr     in_frame
    moveml  %sp@,%d2-%d7/%a2-%a5
    lea     %sp@(40),%sp
    tstb    in_running
    bnes    .Ls7_send
    mvzb    in_zero_sent,%d0
    cmpil   #ZERO_BLOCKS,%d0
    bccs    .Ls7_stock              | both DSP banks hold word 0 = 0
.Ls7_send:
    moveq   #1,%d0
    moveb   %d0,in_busy
    bsr     in_dma_start
    jmp     STATE7_DONE
.Ls7_second:
    addql   #1,in_seconds
    clrb    in_busy
    tstb    in_running
    bnes    .Ls7_stock
    mvzb    in_zero_sent,%d0        | one more closed block (word 0 = 0) landed
    addql   #1,%d0
    moveb   %d0,in_zero_sent
.Ls7_stock:
    moveq   #1,%d1                  | stock state 7, displaced
    moveb   %d1,FRAME_UNMASK
    jmp     STATE7_DONE

| One more host-port transfer: TX_WORDS halfwords from in_tx to core 0 at
| DSP_DEST, eDMA ch 0 exactly as states 4/5 set it up (64-byte minor loops).
in_dma_start:
    clrb    %d0
    moveb   %d0,CORE_SEL            | core 0
    moveq   #64,%d1
    movel   %d1,EDMA_NBYTES
    movel   #SRAM_TX,%d1
    movel   %d1,EDMA_SADDR
    movew   #0x81,%d0
    movew   %d0,HOST_ICR
    movew   #DSP_DEST,%d1
    movew   %d1,HOST_DATA
    | a pair sends 192 B (96 words, $x320..$x37f), ABCD 320 B: the shipped
    | images' lengths, so a pair writes no DSP word past $x37f
    | (d0/d1 only: the transfer IRQ saved those two)
    moveq   #TX_PAIR/2-1,%d0
    mvzb    usb_inputs,%d1
    cmpil   #3,%d1
    bnes    1f
    movel   #TX_BYTES/2-1,%d0
1:  movew   %d0,HOST_DATA
    movew   #0x88,%d1
    movew   %d1,HOST_CVR
    movew   #(0x8000+TX_PAIR/64),%d0    | E_LINK, the minor loops
    mvzb    usb_inputs,%d1
    cmpil   #3,%d1
    bnes    2f
    movew   #(0x8000+TX_BYTES/64),%d0
2:  movew   %d0,EDMA_CITER
    movew   %d0,EDMA_BITER
    clrb    %d1
    moveb   %d1,EDMA_START
    rts

| ---- the per-frame work ----------------------------------------------------
| May clobber d0-d7/a0-a5.
in_frame:
    addql   #1,in_frames            | state-7 visits = DSP frames
    mvzb    in_alt,%d0
    mvzb    in_running,%d1
    cmpl    %d0,%d1
    beqs    1f
    tstl    %d0
    beqs    2f
    bsr     in_up
    bras    1f
2:  bsr     in_down
1:  tstb    in_running
    beqs    .Lf_idle
    movel   #EP3OUT_BIT,%d0
    movel   %d0,EPCOMPLETE          | W1C: no IOC, so this bit never interrupts
    bsr     in_retire
    bsr     in_selfheal
    bra     in_build
.Lf_idle:
    moveal  #SRAM_TX,%a1
    clrl    %a1@                    | words 0-1 clear, both pass flags: the jacks
    rts

| Bring EP3 OUT up. High speed only: the descriptors declare the IN
| interface at high speed alone, so a full-speed host never asks. Retried
| every frame
| while the host asks for alt 1.
in_up:
    movel   PORTSC1,%d0
    andil   #PORTSC_PSPD,%d0
    cmpil   #PORTSC_HS,%d0
    bne     9f
    bsr     in_flush
    bsr     in_qh_resolve           | a0 = EP3 OUT dQH
    moveq   #15,%d1
1:  clrl    %a0@+                   | the whole dQH: its token and pointers
    subql   #1,%d1                  | are power-on garbage (usbaudio.s)
    bpls    1b
    moveal  qh_in,%a0
    | Mult must be non-zero: with Mult 0 (Linux's chipidea udc has it for
    | ISO RX) 800 of 821 packets completed with a transaction error and 0
    | bytes, then the stream stopped (Bryan T, 26 Sep 2026).
    movel   #(0x60000000+(96<<16)),%d0    | maxpkt OPKT: 96 B a pair, 192 for four
    mvzb    usb_inputs,%d1
    cmpil   #3,%d1                  | ABCD: 192 B a packet
    bne     1f
    movel   #(0x60000000+(192<<16)),%d0
1:  movel   %d0,%a0@
    moveq   #1,%d0
    movel   %d0,%a0@(8)             | next dTD: terminate
    movel   ENDPTCTRL3,%d0          | the RX half only: EP3 IN owns TX
    andil   #0xffff0000,%d0
    oril    #CTRL3_RX,%d0
    movel   %d0,ENDPTCTRL3
    clrl    in_produced
    clrl    in_consumed
    moveq   #-1,%d0
    movel   %d0,in_minfill
    clrl    in_maxfill
    moveq   #1,%d0
    moveb   %d0,in_prefill
    clrb    in_ri
    bsr     in_arm_all
    moveq   #1,%d0
    moveb   %d0,in_running
    clrb    in_zero_sent
9:  rts

in_down:
    bsr     in_flush
    movel   ENDPTCTRL3,%d0
    andil   #0xffff0000,%d0         | RX half off, TX half as it was
    movel   %d0,ENDPTCTRL3
    moveal  #SRAM_DTDS,%a1
    moveq   #NSLOTI*8-1,%d1
1:  clrl    %a1@+
    subql   #1,%d1
    bpls    1b
    clrb    in_running
    clrb    in_zero_sent            | a zero block goes out before the transfers stop
    rts

| Flush EP3 OUT, bounded, repeating while it still shows primed.
in_flush:
    movel   %d2,%sp@-
    moveq   #16,%d1
1:  movel   #EP3OUT_BIT,%d0
    movel   %d0,EPFLUSH
    movel   #0x10000,%d2            | bound: a flush with USBCMD.RS clear (session end) may never complete
2:  movel   EPFLUSH,%d0
    andil   #EP3OUT_BIT,%d0
    beqs    4f
    subql   #1,%d2
    bnes    2b
4:
    movel   ENDPTSTAT,%d0
    andil   #EP3OUT_BIT,%d0
    beqs    3f
    subql   #1,%d1
    bnes    1b
3:  movel   %sp@+,%d2
    rts

| EP3 OUT's queue head from ENDPTLISTADDR (a value outside SDRAM is not a
| list: the firmware's constant then). -> a0, cached in qh_in.
in_qh_resolve:
    movel   EPLISTADDR,%d0
    andil   #0xfffff800,%d0
    cmpil   #0x40000000,%d0
    blts    1f
    cmpil   #0x50000000,%d0
    blts    2f
1:  movel   #QH_LIST,%d0
2:  addil   #QH_EP3OUT_OFF,%d0
    movel   %d0,qh_in
    moveal  %d0,%a0
    rts

| d0 = slot (mod NSLOTI) -> a0 = its dTD, a3 = its buffer (both in SRAM).
| Clobbers d0/d1.
in_slot:
    andil   #NSLOTI-1,%d0
    movel   %d0,%d1
    lsll    #5,%d0                  | slot * 32
    moveal  #SRAM_DTDS,%a0
    addal   %d0,%a0
    moveal  #SRAM_BUFS,%a3
    lsll    #5,%d1                  | slot * 32
    addal   %d1,%a3
    addal   %d1,%a3
    addal   %d1,%a3                 | + slot * 96 (a pair)
    mvzb    usb_inputs,%d0
    cmpil   #3,%d0                  | ABCD: 192 B a slot
    bne     1f
    addal   %d1,%a3
    addal   %d1,%a3
    addal   %d1,%a3                 | + slot * 192 (four channels)
1:  rts

| Write slot d2's dTD for one packet: buffer pages, next = terminate, then
| the ACTIVE token LAST (uncached stores reach memory in program order).
| -> a0 = the dTD. Clobbers d0/d1/a3.
in_dtd_fill:
    movel   %d2,%d0
    bsr     in_slot
    moveq   #1,%d0
    movel   %d0,%a0@                | next = terminate
    movel   %a3,%a0@(8)             | page 0
    movel   %a3,%d0
    andil   #0xfffff000,%d0
    addil   #0x1000,%d0
    movel   %d0,%a0@(12)            | page 1: a buffer may straddle 4 KB
    movel   #((96<<16)+(1<<DTD_ACTIVE)),%d1   | total bytes OPKT, ACTIVE, no IOC
    mvzb    usb_inputs,%d0
    cmpil   #3,%d0                  | ABCD: 192 B a packet
    bne     1f
    movel   #((192<<16)+(1<<DTD_ACTIVE)),%d1
1:  movel   %d1,%a0@(4)
    rts

| Queue all NSLOTI dTDs as one chain and prime.
in_arm_all:
    moveq   #NSLOTI-1,%d2
1:  bsr     in_dtd_fill             | back to front: each links the next
    movel   %d2,%d0
    addql   #1,%d0
    cmpil   #NSLOTI,%d0
    beqs    2f
    moveal  %a0,%a4
    bsr     in_slot                 | a0 = the next dTD
    movel   %a0,%a4@                | this.next = next
    moveal  %a4,%a0
2:  subql   #1,%d2
    bpls    1b
    moveal  qh_in,%a1               | a0 = slot 0, the head
    movel   %a0,%a1@(8)
    clrl    %a1@(12)
    movel   #EP3OUT_BIT,%d0
    movel   %d0,EPPRIME
    rts

| Retire completed dTDs in queue order into the ring, and queue each again.
in_retire:
    moveq   #NSLOTI,%d7             | at most one lap
.Lr_next:
    mvzb    in_ri,%d2
    movel   %d2,%d0
    bsr     in_slot
    movel   %a0@(4),%d3             | token
    btst    #DTD_ACTIVE,%d3
    bne     .Lr_done                | still ACTIVE: nothing more has landed
    movel   %d3,%d0
    andil   #DTD_ERRS,%d0
    beqs    1f
    addql   #1,in_bad
    addql   #1,in_err
1:  movel   %d3,%d0
    swap    %d0
    andil   #0x7fff,%d0             | bytes left
    movel   #96,%d4
    mvzb    usb_inputs,%d1
    cmpil   #3,%d1                  | ABCD
    bne     .Lr_opkt
    movel   #192,%d4
.Lr_opkt:
    subl    %d0,%d4                 | d4 = bytes received
    bcs     .Lr_requeue             | nonsense: drop it
    movel   %d4,%d0
    mvzb    usb_inputs,%d1
    cmpil   #3,%d1                  | ABCD: 16 B a frame
    bne     .Lr_wf8
    andil   #15,%d0
    bras    .Lr_wf
.Lr_wf8:
    andil   #7,%d0                  | 8 B a frame
.Lr_wf:
    beqs    .Lr_frames
    addql   #1,in_bad               | not whole frames
    addql   #1,in_partial
.Lr_frames:
    mvzb    usb_inputs,%d1
    cmpil   #3,%d1                  | ABCD: 16 B a frame
    bne     .Lr_fs8
    lsrl    #4,%d4
    bras    .Lr_have_n
.Lr_fs8:
    lsrl    #3,%d4                  | frames: 8 B a frame
.Lr_have_n:
    movel   %d4,in_lastn
    addql   #1,in_pkts
    tstl    %d4
    beqs    .Lr_requeue
    | copy d4 frames from a3 into the ring at in_produced
    lea     in_ring,%a2
    movel   in_produced,%d5
3:  movel   %d5,%d0
    andil   #IN_FRAMES-1,%d0
    mvzb    usb_inputs,%d1
    cmpil   #3,%d1                  | ABCD: 16 B a frame
    bne     .Lr_idx8
    lsll    #4,%d0                  | frame * 16
    lea     %a2@(0,%d0:l),%a1
    movel   %a3@+,%a1@+
    movel   %a3@+,%a1@+
    bras    .Lr_copy
.Lr_idx8:
    lsll    #3,%d0                  | frame * 8
    lea     %a2@(0,%d0:l),%a1
.Lr_copy:
    movel   %a3@+,%a1@+
    movel   %a3@+,%a1@+
    addql   #1,%d5
    subql   #1,%d4
    bnes    3b
    movel   %d5,in_produced
    subl    in_consumed,%d5         | fill
    cmpil   #IN_FRAMES,%d5
    blss    .Lr_requeue
    addql   #1,in_overruns          | host ahead by a whole ring: resync
    movel   in_produced,%d0
    subil   #IN_TARGET,%d0
    movel   %d0,in_consumed
.Lr_requeue:
    bsr     in_dtd_fill             | slot d2 again, ACTIVE
    bsr     in_enqueue
    movel   %d2,%d0
    addql   #1,%d0
    andil   #NSLOTI-1,%d0
    moveb   %d0,in_ri
    subql   #1,%d7
    bne     .Lr_next
.Lr_done:
    rts

| Append the just-filled dTD (a0, slot d2) after slot d2-1, the Chipidea
| add-dTD procedure (usbaudio.s audio_pkt_build has the commentary).
| Clobbers d0/d1/d3/a1/a3/a4/a5.
in_enqueue:
    moveal  %a0,%a5                 | this
    movel   %d2,%d0
    subql   #1,%d0
    bsr     in_slot                 | a0 = previous
    moveal  %a0,%a1
    moveal  %a5,%a0
    movel   %a1@(4),%d0
    btst    #DTD_ACTIVE,%d0
    beqs    .Le_prime               | previous retired: list empty
    movel   %a0,%a1@                | previous.next = this
    movel   EPPRIME,%d0
    andil   #EP3OUT_BIT,%d0
    bnes    .Le_done                | a prime is pending: it reads the list
    moveq   #16,%d3
.Le_trip:
    movel   USBCMD,%d0
    oril    #ATDTW,%d0
    movel   %d0,USBCMD
    movel   ENDPTSTAT,%d1
    andil   #EP3OUT_BIT,%d1
    movel   USBCMD,%d0
    andil   #ATDTW,%d0
    bnes    .Le_sampled
    subql   #1,%d3
    bnes    .Le_trip
    bras    .Le_done                | never settled: the self-heal catches it
.Le_sampled:
    movel   USBCMD,%d0
    andil   #~ATDTW,%d0
    movel   %d0,USBCMD
    tstl    %d1
    bnes    .Le_done                | still running: it follows the link
    bsr     in_oldest               | a0 = the oldest ACTIVE (this at worst)
.Le_prime:
    moveal  qh_in,%a1
    movel   %a0,%a1@(8)
    clrl    %a1@(12)
    movel   #EP3OUT_BIT,%d0
    movel   %d0,EPPRIME
.Le_done:
    rts

| The oldest ACTIVE dTD in queue order from in_ri -> a0 (d0 = 1), or d0 = 0.
| Clobbers d0/d1/d3/d4/a3.
in_oldest:
    mvzb    in_ri,%d4
    moveq   #NSLOTI-1,%d3
1:  movel   %d4,%d0
    bsr     in_slot
    movel   %a0@(4),%d1
    btst    #DTD_ACTIVE,%d1
    bnes    2f
    addql   #1,%d4
    subql   #1,%d3
    bpls    1b
    moveq   #0,%d0
    rts
2:  moveq   #1,%d0
    rts

| Idle endpoint + queued dTD = prime the oldest, and count it.
in_selfheal:
    movel   ENDPTSTAT,%d0
    movel   EPPRIME,%d1
    orl     %d1,%d0
    andil   #EP3OUT_BIT,%d0
    bnes    9f
    bsr     in_oldest
    tstl    %d0
    beqs    9f
    moveal  qh_in,%a1
    movel   %a0,%a1@(8)
    clrl    %a1@(12)
    movel   #EP3OUT_BIT,%d0
    movel   %d0,EPPRIME
    addql   #1,in_reprimes
9:  rts

| 16 ring frames -> in_tx for the DSP, two passes (rx_inject.asm): the CD
| pass's flag word, then (flag 1) 16 x (C hi, C lo, D hi, D lo); the AB
| pass's flag word, then (flag 1) 16 x (A hi, A lo, B hi, B lo); hi =
| sample[23:8], lo = sample[7:0] (the host port carries 16 bits a word). A
| ring frame holds the host channels in host order (in_retire): a pair is 8
| B a frame, ABCD 16 B, A, B, C, D at +0, +4, +8, +12. Before the cushion is full,
| and on an underrun (which refills the cushion), silence: both flags 0 and
| the jacks come through.
in_build:
    moveal  #SRAM_TX,%a1
    movel   in_produced,%d0
    subl    in_consumed,%d0         | fill
    movel   %d0,in_lastfill
    tstb    in_prefill
    beqs    1f
    cmpil   #IN_TARGET,%d0
    bcs     .Lb_silence             | still filling
    clrb    in_prefill
    bras    2f
1:  cmpil   #BLOCK,%d0
    bcc     2f
    addql   #1,in_underruns
    moveq   #1,%d1
    moveb   %d1,in_prefill
    bra.w   .Lb_silence
2:  cmpl    in_minfill,%d0          | fill before this block's 16 go out
    bccs    4f
    movel   %d0,in_minfill
4:  cmpl    in_maxfill,%d0
    blss    5f
    movel   %d0,in_maxfill
5:  mvzb    usb_inputs,%d4
    | the CD pass: CD at +0, ABCD at +8
    moveq   #2,%d0
    cmpl    %d0,%d4
    beqs    6f
    moveq   #3,%d0
    cmpl    %d0,%d4
    bnes    7f
    moveq   #8,%d3                  | ABCD: C, D at +8
    bsr.s   .Lb_pass
    bras    8f
6:  moveq   #0,%d3                  | CD: the pair at +0
    bsr.s   .Lb_pass
    bras    8f
7:  clrw    %a1@+                   | no CD pass
    | the AB pass: AB and ABCD at +0
8:  moveq   #1,%d0
    cmpl    %d0,%d4
    beqs    9f
    moveq   #3,%d0
    cmpl    %d0,%d4
    bnes    10f
9:  moveq   #0,%d3
    bsr.s   .Lb_pass
    bras    11f
10: clrw    %a1@+                   | no AB pass
11: movel   in_consumed,%d5
    addil   #BLOCK,%d5
    movel   %d5,in_consumed
    rts
| One pass: flag 1, then 16 frames from in_consumed, two channels from
| frame + d3 (4 B each, LE), hi/lo halfwords to %a1@+. d4 kept.
.Lb_pass:
    moveq   #1,%d0
    movew   %d0,%a1@+               | the pass's flag
    lea     in_ring,%a2
    movel   in_consumed,%d5
    moveq   #BLOCK,%d7
.Lb_frame:
    movel   %d5,%d0
    andil   #IN_FRAMES-1,%d0
    lsll    #3,%d0                  | frame * 8 (a pair: in_retire's stride)
    moveq   #3,%d1
    cmpl    %d1,%d4
    bnes    1f
    addl    %d0,%d0                 | ABCD: frame * 16
1:  lea     %a2@(0,%d0:l),%a0
    addal   %d3,%a0                 | the pass's pair
    moveq   #2,%d6
.Lb_ch:
    movel   %a0@+,%d1               | the LE container: b0 b1 b2 b3, sample = b3 b2 b1
    byterev %d1                     | b3 b2 b1 b0
    movel   %d1,%d2
    swap    %d1                     | b1 b0 b3 b2
    movew   %d1,%a1@+               | hi = sample[23:8] (b3 b2)
    lsrl    #8,%d2                  | 00 b3 b2 b1
    mvzb    %d2,%d2                 | lo = sample[7:0] (b1)
    movew   %d2,%a1@+
    subql   #1,%d6
    bnes    .Lb_ch
    addql   #1,%d5
    subql   #1,%d7
    bnes    .Lb_frame
    rts
.Lb_silence:
    moveq   #TX_BYTES/4-1,%d1
3:  clrl    %a1@+
    subql   #1,%d1
    bpls    3b
    rts                             | both flags 0: the jacks

    .data
    .balign 4
    .global in_counters
in_counters:                        | vendor request 0x56's order (tools/hw/usb_counters.py)
in_produced:  .long 0               | frames into the ring
in_consumed:  .long 0               | frames sent to the DSP
in_pkts:      .long 0               | OUT packets retired
in_lastn:     .long 0               | frames in the last packet
in_lastfill:  .long 0               | ring fill at the last frame
in_underruns: .long 0               | blocks the ring could not supply
in_overruns:  .long 0               | ring laps (host ahead)
in_reprimes:  .long 0               | self-heal primes
in_bad:       .long 0               | err + partial
in_frames:    .long 0               | first state-7 visits (DSP frames)
in_seconds:   .long 0               | second state-7 visits (our transfer's completion)
in_minfill:   .long 0               | lowest fill while consuming, since up
in_maxfill:   .long 0               | highest fill while consuming, since up
in_err:       .long 0               | completions with a dTD error bit
in_partial:   .long 0               | completions that were not whole frames

qh_in:        .long 0
in_ring:      .space IN_FRAMES*16     | 16 B a frame (the ABCD maximum); a 2-ch
                                      | frame uses the first 8 of its slot
    .global in_alt                  | usbaudio.s answers GET_INTERFACE on the IN interface from it
in_alt:       .byte 0               | the host's request (USB interrupt)
in_running:   .byte 0               | EP3 OUT is up (state-7 owned)
in_prefill:   .byte 0               | filling the cushion
in_ri:        .byte 0               | next dTD slot to retire
in_busy:      .byte 0               | state 7: our transfer is in flight
in_zero_sent: .byte 0               | closed: blocks with word 0 = 0 completed since the close; transfers skipped from ZERO_BLOCKS

    .balign 32
