| SY DRUM's step locks of its PLAYBACK SETUP controls -- the storage. The development
| line's (Octatrick 3.0, 8 Oct 2026) lock table and file codec, the same layout, so a
| project moves between that line and this module with its locks. Musical data, separate
| from the stock bank bytes. Row order: bank / pattern / audio track / step, then the
| row's controls: A..D = LSPD LDEP WAVE S&H on a SY DRUM track; E / F (a sidecar FM
| track's ALGO / MOD2 on the development line) and G..J (its GRANULAR FX page) are
| carried with the row and saved as that line saves them -- no control of this module
| writes them. Each byte is raw 0..127, or 255 for no lock: the table does not know the
| machine, so SY DRUM's maxima are applied where the value is used (the UI's edit, the
| setup stage's clamp). A RAM row is SL_ROW = 16 bytes -- A..F at +0..+5, G..J at
| +6..+9, +10..+15 padding (always 255) -- so every row stays long aligned. The sylock
| file holds six controls a row (A..F, version 2); G..J have their own file family,
| sylkgjNN (tools/gjlocks_io.h), with their own dirty mask and generation (sg_*).
| All banks are resident: the stock queue can prefetch the next bank's trigs.
| Never perform card I/O from these helpers or from the audio/sequencer path.
        .set SL_CONTROLS,12             | A..F, G..J, 2 spare
        .set SL_FILE_CONTROLS,6         | a sylock (version 2) file row: A..F
        .set SL_GJ_AT,6                 | G..J's first byte in a RAM row
        .set SL_ROW,16                  | the RAM row stride
        .set SL_ROWS,8192               | rows a bank: 16 patterns x 8 tracks x 64 steps
        .set SL_BANK_BYTES,SL_ROWS*SL_ROW  | a RAM bank: 131072
        .set SL_PROJECT_BYTES,16*SL_BANK_BYTES  | 2 MiB
        .set SL_V1_BYTES,SL_ROWS*4      | a version 1 file's payload (four controls a row): 32768
        .set SL_V1_FILE,SL_V1_BYTES+32
        .set SL_PAYLOAD_BYTES,SL_ROWS*SL_FILE_CONTROLS  | a version 2 file's payload: 49152
        .set SL_FILE_BYTES,SL_PAYLOAD_BYTES+32
| THE TABLE (16 banks x 8,192 rows x 16 bytes = 2 MiB) is uninitialised DRAM outside
| the linked runtime: octabam's DramRegion "sl_work_table" (manifest.py), placed at the
| top of the platform's arena reserve and handed to the link as a symbol (the address
| the development line uses, 0x41295de0, with the stock reserve). In the runtime image it
| would lengthen the loader's boot-time hash past what the port accepts. Its contents at
| boot are undefined, so every reader checks sl_ready_mask, which only sl_reset (it fills
| the table) and a publish set.
        .global sl_row,sl_bank_ptr,sl_mark_dirty,sl_write,sl_reset
        .global sl_payload_validate,sl_crc32,sl_file_validate,sl_file_pack,sl_file_seal,sl_bank_publish

| d0 bank, d1 pattern, d2 track, d3 step -> a0 the SL_ROW-byte row.
| All data registers preserved; invalid coordinates return a read-only FF row.
sl_row:
        lea     sl_empty_row:l,%a0
        cmpi.l  #16,%d0
        bcc     sl_row_out
        cmpi.l  #16,%d1
        bcc     sl_row_out
        cmpi.l  #8,%d2
        bcc     sl_row_out
        cmpi.l  #64,%d3
        bcc     sl_row_out
        move.l  %d0,-(%sp)
        lsl.l   #4,%d0
        add.l   %d1,%d0
        lsl.l   #3,%d0
        add.l   %d2,%d0
        lsl.l   #6,%d0
        add.l   %d3,%d0
        lsl.l   #4,%d0                  | x SL_ROW (16)
        lea     sl_work_table:l,%a0
        adda.l  %d0,%a0
        move.l  (%sp)+,%d0
sl_row_out:
        rts

| d0 bank -> a0 bank buffer, or zero if out of range. Other registers kept.
sl_bank_ptr:
        suba.l  %a0,%a0
        cmpi.l  #16,%d0
        bcc     sl_bank_ptr_out
        move.l  %d0,-(%sp)
        swap    %d0                     | x SL_BANK_BYTES (131072)
        clr.w   %d0
        add.l   %d0,%d0
        lea     sl_work_table:l,%a0
        adda.l  %d0,%a0
        move.l  (%sp)+,%d0
sl_bank_ptr_out:
        rts

| d0 bank -> mark dirty and increment edit generation. All registers kept.
| Call after validated clipboard/block edits too. A save may clear the dirty
| bit only if the current generation still matches its immutable snapshot.
| Whole-row edits mark both files (sylock A..F, sylkgj G..J); sl_write marks
| the file of its control only (sl_mark_dirty_af / sl_mark_dirty_gj).
sl_mark_dirty:
        bsr     sl_mark_dirty_af
sl_mark_dirty_gj:
        cmpi.l  #16,%d0
        bcc     sl_mark_out
        lea     -12(%sp),%sp
        movem.l %d1/%a0-%a1,(%sp)
        lea     sg_dirty_mask:l,%a0
        lea     sg_generation:l,%a1
        bra     sl_mark_set
sl_mark_dirty_af:
        cmpi.l  #16,%d0
        bcc     sl_mark_out
        lea     -12(%sp),%sp
        movem.l %d1/%a0-%a1,(%sp)
        lea     sl_dirty_mask:l,%a0
        lea     sl_generation:l,%a1
sl_mark_set:
        moveq   #1,%d1
        lsl.l   %d0,%d1
        or.l    %d1,(%a0)
        addq.l  #1,(%a1,%d0.l*4)
        movem.l (%sp),%d1/%a0-%a1
        lea     12(%sp),%sp
sl_mark_out:
        rts

| d0 bank,d1 pattern,d2 track,d3 step,d4 control,d5 raw/FF.
| d0 returns 1 changed, 0 unchanged, -1 invalid/not ready. Other regs kept.
sl_write:
        lea     -16(%sp),%sp
        movem.l %d6/%a0-%a1,(%sp)
        move.w  %sr,%d6
        move.l  %d6,12(%sp)
        move.w  #0x2700,%sr             | check, edit and generation are atomic
        cmpi.l  #16,%d0
        bcc     sl_write_bad
        cmpi.l  #SL_CONTROLS,%d4
        bcc     sl_write_bad
        move.l  sl_ready_mask:l,%d6
        btst    %d0,%d6
        beq     sl_write_bad
        move.l  sl_blocked_mask:l,%d6
        btst    %d0,%d6
        bne     sl_write_bad
        cmpi.l  #SL_GJ_AT,%d4
        bcs     sl_write_af
        move.l  sg_blocked_mask:l,%d6    | G..J of a bank whose sylkgj file is blocked
        btst    %d0,%d6
        bne     sl_write_bad
sl_write_af:
        cmpi.l  #255,%d5
        beq     sl_write_value_ok
        cmpi.l  #SL_GJ_AT+4,%d4          | controls 10 / 11 are spare: 255 only
        bcc     sl_write_bad
        lea     sl_maxima:l,%a1
        mvz.b   (%a1,%d4.l),%d6
        cmp.l   %d6,%d5
        bhi     sl_write_bad
sl_write_value_ok:
        bsr     sl_row
        lea     sl_empty_row:l,%a1
        cmpa.l  %a1,%a0
        beq     sl_write_bad
        mvz.b   (%a0,%d4.l),%d6
        cmp.l   %d6,%d5
        beq     sl_write_same
        move.b  %d5,(%a0,%d4.l)
        cmpi.l  #SL_GJ_AT,%d4
        bcc     sl_write_gj
        bsr     sl_mark_dirty_af        | the file of the control only
        bra     sl_write_changed
sl_write_gj:
        bsr     sl_mark_dirty_gj
sl_write_changed:
        moveq   #1,%d0
        bra     sl_write_out
sl_write_same:
        moveq   #0,%d0
        bra     sl_write_out
sl_write_bad:
        moveq   #-1,%d0
sl_write_out:
        move.l  12(%sp),%d6
        move.w  %d6,%sr
        movem.l (%sp),%d6/%a0-%a1
        lea     16(%sp),%sp
        rts

| Project lifecycle only. Clear the project table and metadata; no card I/O.
| Loader then publishes each validated bank (or initializes an absent pair).
sl_reset:
        lea     -12(%sp),%sp
        movem.l %d0-%d1/%a0,(%sp)
        clr.l   sl_ready_mask:l         | close readers before clearing bulk RAM
        moveq   #-1,%d0
        move.l  %d0,sl_blocked_mask:l
        lea     sl_work_table:l,%a0
        move.l  #SL_PROJECT_BYTES/4,%d0
        moveq   #-1,%d1
sl_reset_table:
        move.l  %d1,(%a0)+
        subq.l  #1,%d0
        bne     sl_reset_table
        lea     sl_generation:l,%a0
        moveq   #16,%d0
sl_reset_generations:
        clr.l   (%a0)+
        subq.l  #1,%d0
        bne     sl_reset_generations
        lea     sg_generation:l,%a0      | the G..J file family's
        moveq   #16,%d0
sl_reset_gj:
        clr.l   (%a0)+
        subq.l  #1,%d0
        bne     sl_reset_gj
        clr.l   sg_dirty_mask:l
        clr.l   sg_blocked_mask:l
        clr.l   sl_ready_mask:l
        clr.l   sl_blocked_mask:l
        clr.l   sl_dirty_mask:l
        movem.l (%sp),%d0-%d1/%a0
        lea     12(%sp),%sp
        rts

| a0 a file payload, d0 its byte count. d0=0 valid, -1 bad value (each byte
| 0..127 or 255: every control's maximum is 127, sl_maxima). All other registers
| preserved, no clamping of stored creative data. a byte count, so the same
| check serves a version 1 (four controls a row) and a version 2 (six) payload.
sl_payload_validate:
        lea     -8(%sp),%sp
        movem.l %d1/%a0,(%sp)
        move.l  %d0,%d1
sl_pv_byte:
        mvz.b   (%a0)+,%d0
        cmpi.l  #127,%d0
        bls     sl_pv_next
        cmpi.l  #255,%d0
        bne     sl_pv_bad
sl_pv_next:
        subq.l  #1,%d1
        bne     sl_pv_byte
        moveq   #0,%d0
        bra     sl_pv_out
sl_pv_bad:
        moveq   #-1,%d0
sl_pv_out:
        movem.l (%sp),%d1/%a0
        addq.l  #8,%sp
        rts

| CRC-32/ISO-HDLC: a0 bytes,d0 length -> d0 CRC. Other registers preserved.
| The table is generated from polynomial0xedb88320; no stock bytes used.
sl_crc32:
        lea     -20(%sp),%sp
        movem.l %d1-%d3/%a0-%a1,(%sp)
        move.l  %d0,%d1
        moveq   #-1,%d0
        lea     sl_crc_table:l,%a1
        tst.l   %d1
        beq     sl_crc_done
sl_crc_byte:
        mvz.b   (%a0)+,%d2
        eor.l   %d0,%d2
        andi.l  #255,%d2
        move.l  (%a1,%d2.l*4),%d3
        lsr.l   #8,%d0
        eor.l   %d3,%d0
        subq.l  #1,%d1
        bne     sl_crc_byte
sl_crc_done:
        not.l   %d0
        movem.l (%sp),%d1-%d3/%a0-%a1
        lea     20(%sp),%sp
        rts

| d0 expected bank,a0 file,d1 exact file length -> d0 status,d1 generation.
| Status0 success; -1 header/length/bank, -2 version, -3 CRC, -4 values.
| version 1 (SL_V1_FILE bytes, four controls a row) and version 2
| (SL_FILE_BYTES, SL_CONTROLS a row) are both valid; the caller widens a version
| 1 payload (sl_io's read_bank) before publishing it. Any other version is -2.
| d1 is zero on failure. All other registers preserved. No live state touched.
sl_file_validate:
        lea     -16(%sp),%sp
        movem.l %d2-%d3/%a0-%a1,(%sp)
        move.l  %d0,%d2
        cmpi.l  #10,%d1
        bcs     sl_fv_header
        cmpi.l  #16,%d2
        bcc     sl_fv_header
        move.l  (%a0),%d0
        cmpi.l  #0x53594c4f,%d0
        bne     sl_fv_header
        move.l  4(%a0),%d0
        cmpi.l  #0x434b5300,%d0
        bne     sl_fv_header
        mvz.w   8(%a0),%d0
        move.l  #SL_V1_BYTES,%d3
        cmpi.l  #1,%d0
        beq     sl_fv_length
        move.l  #SL_PAYLOAD_BYTES,%d3
        cmpi.l  #2,%d0
        bne     sl_fv_version
sl_fv_length:
        moveq   #32,%d0
        add.l   %d3,%d0
        cmp.l   %d0,%d1
        bne     sl_fv_header
        mvz.w   10(%a0),%d0
        cmpi.l  #32,%d0
        bne     sl_fv_header
        cmp.w   12(%a0),%d2
        bne     sl_fv_header
        tst.w   14(%a0)
        bne     sl_fv_header
        move.l  16(%a0),%d0
        cmp.l   %d3,%d0
        bne     sl_fv_header
        moveq   #28,%d0
        bsr     sl_crc32
        cmp.l   28(%a0),%d0
        bne     sl_fv_crc
        movea.l %a0,%a1
        lea     32(%a0),%a0
        move.l  %d3,%d0
        bsr     sl_crc32
        cmp.l   24(%a1),%d0
        bne     sl_fv_crc
        move.l  %d3,%d0
        bsr     sl_payload_validate
        tst.l   %d0
        bne     sl_fv_values
        move.l  20(%a1),%d1
        moveq   #0,%d0
        bra     sl_fv_out
sl_fv_header:
        moveq   #-1,%d0
        bra     sl_fv_error
sl_fv_version:
        moveq   #-2,%d0
        bra     sl_fv_error
sl_fv_crc:
        moveq   #-3,%d0
        bra     sl_fv_error
sl_fv_values:
        moveq   #-4,%d0
sl_fv_error:
        moveq   #0,%d1
sl_fv_out:
        movem.l (%sp),%d2-%d3/%a0-%a1
        lea     16(%sp),%sp
        rts

| d0 bank,d1 generation,a0 a RAM bank (SL_ROW-byte rows),a1 output SL_FILE_BYTES
| -> d0=0/-1. writes a version 2 file -- each row's A..F (G..J and the
| padding dropped: they go to the sylkgj file), then sl_file_seal. Word moves only.
| Caller snapshots immutable output before I/O; other registers preserved.
sl_file_pack:
        lea     -16(%sp),%sp
        movem.l %d3/%a0/%a2,(%sp)
        lea     32(%a1),%a2
        move.l  #SL_ROWS,%d3
sl_fp_copy:
        move.w  (%a0)+,(%a2)+
        move.w  (%a0)+,(%a2)+
        move.w  (%a0)+,(%a2)+
        lea     SL_ROW-6(%a0),%a0        | skip G..J and the padding
        subq.l  #1,%d3
        bne     sl_fp_copy
        movem.l (%sp),%d3/%a0/%a2
        lea     16(%sp),%sp
                                        | (falls into the seal)
| d0 bank,d1 generation,a1 a file whose SL_PAYLOAD_BYTES payload at +32 is filled
| -> its version 2 header and both CRCs, d0=0/-1 (bank out of range or a bad
| value). Other registers preserved. also restore's empty file and the
| reader's re-seal of a widened version 1 file.
sl_file_seal:
        lea     -24(%sp),%sp
        movem.l %d1-%d3/%a0-%a2,(%sp)
        move.l  %d0,%d2
        cmpi.l  #16,%d2
        bcc     sl_fs_bad
        lea     32(%a1),%a0
        move.l  #SL_PAYLOAD_BYTES,%d0
        bsr     sl_payload_validate
        tst.l   %d0
        bne     sl_fs_bad
        move.l  #0x53594c4f,%d0
        move.l  %d0,(%a1)
        move.l  #0x434b5300,%d0
        move.l  %d0,4(%a1)
        move.l  #0x00020020,%d0         | version 2, header 32
        move.l  %d0,8(%a1)
        move.w  %d2,12(%a1)
        clr.w   14(%a1)
        move.l  #SL_PAYLOAD_BYTES,%d0
        move.l  %d0,16(%a1)
        move.l  %d1,20(%a1)
        lea     32(%a1),%a0
        move.l  #SL_PAYLOAD_BYTES,%d0
        bsr     sl_crc32
        move.l  %d0,24(%a1)
        movea.l %a1,%a0
        moveq   #28,%d0
        bsr     sl_crc32
        move.l  %d0,28(%a1)
        moveq   #0,%d0
        bra     sl_fs_out
sl_fs_bad:
        moveq   #-1,%d0
sl_fs_out:
        movem.l (%sp),%d1-%d3/%a0-%a2
        lea     24(%sp),%sp
        rts

| d0 bank,d1 generation,a0 validated version 2 payload (SL_CONTROLS a row)
| -> d0=0/-1; other regs kept. each row's six bytes go to the RAM row, its
| padding := 255. G..J (+6..+9) := 255 too -- the sylkgj loader publishes them
| after this (gjlocks_io.h). Project/bank loader only, while stock is also publishing.
sl_bank_publish:
        lea     -24(%sp),%sp
        movem.l %d1-%d3/%a0-%a2,(%sp)
        move.l  %d0,%d2
        cmpi.l  #16,%d2
        bcc     sl_bp_bad
        move.l  #SL_PAYLOAD_BYTES,%d0
        bsr     sl_payload_validate
        tst.l   %d0
        bne     sl_bp_bad
        movea.l %a0,%a2
        move.l  %d2,%d0
        bsr     sl_bank_ptr
        move.l  #SL_ROWS,%d3
sl_bp_copy:
        move.w  (%a2)+,(%a0)+
        move.w  (%a2)+,(%a0)+
        move.w  (%a2)+,(%a0)+
        move.w  #-1,(%a0)+               | +6..+15 (G..J, padding)
        move.l  #-1,(%a0)+
        move.l  #-1,(%a0)+
        subq.l  #1,%d3
        bne     sl_bp_copy
        lea     sl_generation:l,%a0
        move.l  %d1,(%a0,%d2.l*4)
        moveq   #1,%d3
        lsl.l   %d2,%d3
        lea     sl_ready_mask:l,%a0
        or.l    %d3,(%a0)
        not.l   %d3
        lea     sl_dirty_mask:l,%a0
        and.l   %d3,(%a0)
        lea     sl_blocked_mask:l,%a0
        and.l   %d3,(%a0)
        moveq   #0,%d0
        bra     sl_bp_out
sl_bp_bad:
        moveq   #-1,%d0
sl_bp_out:
        movem.l (%sp),%d1-%d3/%a0-%a2
        lea     24(%sp),%sp
        rts

        .section .data
        .balign 4
sl_empty_row:
        .long   0xffffffff,0xffffffff,0xffffffff,0xffffffff  | SL_ROW 16
sl_maxima:
        .byte   127,127,127,127,127,127,127,127,127,127,0,0,255,255,255,255  | A..J, 2 spare
sl_ready_mask:
        .long   0
sl_blocked_mask:
        .long   0
sl_dirty_mask:
        .long   0
sl_generation:
        .fill   16,4,0
        .global sg_dirty_mask,sg_blocked_mask,sg_generation
sg_dirty_mask:                           | the G..J file family (sylkgjNN, tools/gjlocks_io.h)
        .long   0
sg_blocked_mask:                         | a bank whose sylkgj file is FUTURE / unreadable: G..J not written
        .long   0
sg_generation:
        .fill   16,4,0
        .section .text

        .balign 4
sl_crc_table:
        .long 0x00000000,0x77073096,0xee0e612c,0x990951ba
        .long 0x076dc419,0x706af48f,0xe963a535,0x9e6495a3
        .long 0x0edb8832,0x79dcb8a4,0xe0d5e91e,0x97d2d988
        .long 0x09b64c2b,0x7eb17cbd,0xe7b82d07,0x90bf1d91
        .long 0x1db71064,0x6ab020f2,0xf3b97148,0x84be41de
        .long 0x1adad47d,0x6ddde4eb,0xf4d4b551,0x83d385c7
        .long 0x136c9856,0x646ba8c0,0xfd62f97a,0x8a65c9ec
        .long 0x14015c4f,0x63066cd9,0xfa0f3d63,0x8d080df5
        .long 0x3b6e20c8,0x4c69105e,0xd56041e4,0xa2677172
        .long 0x3c03e4d1,0x4b04d447,0xd20d85fd,0xa50ab56b
        .long 0x35b5a8fa,0x42b2986c,0xdbbbc9d6,0xacbcf940
        .long 0x32d86ce3,0x45df5c75,0xdcd60dcf,0xabd13d59
        .long 0x26d930ac,0x51de003a,0xc8d75180,0xbfd06116
        .long 0x21b4f4b5,0x56b3c423,0xcfba9599,0xb8bda50f
        .long 0x2802b89e,0x5f058808,0xc60cd9b2,0xb10be924
        .long 0x2f6f7c87,0x58684c11,0xc1611dab,0xb6662d3d
        .long 0x76dc4190,0x01db7106,0x98d220bc,0xefd5102a
        .long 0x71b18589,0x06b6b51f,0x9fbfe4a5,0xe8b8d433
        .long 0x7807c9a2,0x0f00f934,0x9609a88e,0xe10e9818
        .long 0x7f6a0dbb,0x086d3d2d,0x91646c97,0xe6635c01
        .long 0x6b6b51f4,0x1c6c6162,0x856530d8,0xf262004e
        .long 0x6c0695ed,0x1b01a57b,0x8208f4c1,0xf50fc457
        .long 0x65b0d9c6,0x12b7e950,0x8bbeb8ea,0xfcb9887c
        .long 0x62dd1ddf,0x15da2d49,0x8cd37cf3,0xfbd44c65
        .long 0x4db26158,0x3ab551ce,0xa3bc0074,0xd4bb30e2
        .long 0x4adfa541,0x3dd895d7,0xa4d1c46d,0xd3d6f4fb
        .long 0x4369e96a,0x346ed9fc,0xad678846,0xda60b8d0
        .long 0x44042d73,0x33031de5,0xaa0a4c5f,0xdd0d7cc9
        .long 0x5005713c,0x270241aa,0xbe0b1010,0xc90c2086
        .long 0x5768b525,0x206f85b3,0xb966d409,0xce61e49f
        .long 0x5edef90e,0x29d9c998,0xb0d09822,0xc7d7a8b4
        .long 0x59b33d17,0x2eb40d81,0xb7bd5c3b,0xc0ba6cad
        .long 0xedb88320,0x9abfb3b6,0x03b6e20c,0x74b1d29a
        .long 0xead54739,0x9dd277af,0x04db2615,0x73dc1683
        .long 0xe3630b12,0x94643b84,0x0d6d6a3e,0x7a6a5aa8
        .long 0xe40ecf0b,0x9309ff9d,0x0a00ae27,0x7d079eb1
        .long 0xf00f9344,0x8708a3d2,0x1e01f268,0x6906c2fe
        .long 0xf762575d,0x806567cb,0x196c3671,0x6e6b06e7
        .long 0xfed41b76,0x89d32be0,0x10da7a5a,0x67dd4acc
        .long 0xf9b9df6f,0x8ebeeff9,0x17b7be43,0x60b08ed5
        .long 0xd6d6a3e8,0xa1d1937e,0x38d8c2c4,0x4fdff252
        .long 0xd1bb67f1,0xa6bc5767,0x3fb506dd,0x48b2364b
        .long 0xd80d2bda,0xaf0a1b4c,0x36034af6,0x41047a60
        .long 0xdf60efc3,0xa867df55,0x316e8eef,0x4669be79
        .long 0xcb61b38c,0xbc66831a,0x256fd2a0,0x5268e236
        .long 0xcc0c7795,0xbb0b4703,0x220216b9,0x5505262f
        .long 0xc5ba3bbe,0xb2bd0b28,0x2bb45a92,0x5cb36a04
        .long 0xc2d7ffa7,0xb5d0cf31,0x2cd99e8b,0x5bdeae1d
        .long 0x9b64c2b0,0xec63f226,0x756aa39c,0x026d930a
        .long 0x9c0906a9,0xeb0e363f,0x72076785,0x05005713
        .long 0x95bf4a82,0xe2b87a14,0x7bb12bae,0x0cb61b38
        .long 0x92d28e9b,0xe5d5be0d,0x7cdcefb7,0x0bdbdf21
        .long 0x86d3d2d4,0xf1d4e242,0x68ddb3f8,0x1fda836e
        .long 0x81be16cd,0xf6b9265b,0x6fb077e1,0x18b74777
        .long 0x88085ae6,0xff0f6a70,0x66063bca,0x11010b5c
        .long 0x8f659eff,0xf862ae69,0x616bffd3,0x166ccf45
        .long 0xa00ae278,0xd70dd2ee,0x4e048354,0x3903b3c2
        .long 0xa7672661,0xd06016f7,0x4969474d,0x3e6e77db
        .long 0xaed16a4a,0xd9d65adc,0x40df0b66,0x37d83bf0
        .long 0xa9bcae53,0xdebb9ec5,0x47b2cf7f,0x30b5ffe9
        .long 0xbdbdf21c,0xcabac28a,0x53b39330,0x24b4a3a6
        .long 0xbad03605,0xcdd70693,0x54de5729,0x23d967bf
        .long 0xb3667a2e,0xc4614ab8,0x5d681b02,0x2a6f2b94
        .long 0xb40bbe37,0xc30c8ea1,0x5a05df1b,0x2d02ef8d
