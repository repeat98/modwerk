# SPDX-License-Identifier: GPL-3.0-or-later
"""The switchable UAC2 output on one 20-channel source ring.

All layouts use the same aligned tracks, Main and Cue. The package publishes
only complete descriptor profiles. The base latches one while detached.
"""
import hashlib
import struct
import runpy
from types import SimpleNamespace
from pathlib import Path

HERE = Path(__file__).resolve().parent
SOURCE_SHA = 'c1f39d2a21870cb5596c487388c61a1be1b9e35ec6860a9eb305268eca2287a8'


def checked(text, old, new):
    if text.count(old) != 1:
        raise ValueError('Configurable audio seam changed: ' + old[:64])
    return text.replace(old, new)


def configure_source(text):
    # Use the existing per-sample POST_WORD and gain history for either stem
    # layout. The independently timed Main and Cue writes below are shared.
    for marker in ('| d2 = the stem', '    | The gain history', '| ==== TRACKS POST', '    .balign 4\npost_hidx:'):
        old = '.if USB_LAYOUT == LAYOUT_TRACKS_POST\n' + marker
        text = checked(text, old, '.if 1\n' + marker)
    text = checked(text, 'audio_frame_shim_body:\n', '''audio_frame_shim_body:
    mvzb    mwua_post,%d0
    bsr     post_frame
    lea     post_gtab,%a0
    movel   %a0,mwua_gain
''')
    start = text.index('    moveq   #RB_TRACKS-1,%d7\n2:  movel   %a0@,%d2')
    end = text.index('    bpl     2b\n', start) + len('    bpl     2b\n')
    loop = text[start:end]
    post = loop.replace('2:  movel   %a0@,%d2', '2:  POST_WORD %a4@, 0').replace('movel   %a0@(4),%d2', 'POST_WORD %a4@+, 4')
    text = text[:start] + '''    tstb    mwua_post
    beq     .Lpre_words
    movel   %a4,%sp@-
    moveal  mwua_gain,%a4
''' + post + '''    movel   %a4,mwua_gain
    moveal  %sp@+,%a4
    bra     .Lstems_done
.Lpre_words:
''' + loop + '.Lstems_done:\n' + text[end:]
    text = checked(text, '    movel   %d4,aud_produced\n.endif\n', '    movel   %d4,aud_produced\n    bsr post_emac_leave\n.endif\n')
    text = checked(text, '    tstb    usbaudio_alt\n    bnes    .Lproduce', '''    tstb    mwua_off
    beqs    .Loutput_on
    addql   #8,aud_produced
    addql   #8,aud_produced
    bra     .Loutput_idle
.Loutput_on:
    tstb    usbaudio_alt
    bnes    .Lproduce''')
    text = checked(text, '    moveq   #1,%d0\n    moveb   %d0,aud_closed', '.Loutput_idle:\n    moveq   #1,%d0\n    moveb   %d0,aud_closed')
    # Initialize only the transmitted words while OFF, for every width and
    # speed. The first producing block on resume clears the old ring cushion.
    text = checked(text, '    moveal  %a3,%a1\n    movel   %d4,%d3', '''    moveal  %a3,%a1
    tstb    mwua_off
    beq     .Laudio_copy
    bsr     mwua_packet_bytes
    lsrl    #2,%d6
.Lzero_packet:
    clrl    %a1@+
    subql   #1,%d6
    bne     .Lzero_packet
    bra     .Lcopied
.Laudio_copy:
    movel   %d4,%d3''')
    # Full speed has room for one pair. Track layouts retain their stereo sum.
    # Buses, T8 and the first Outbox pair come from the aligned source ring.
    text = checked(text, '    beqs    .Lcopy_fs\n', '''    bnes    .Lwide_ring
    tstb    mwua_fs_sum
    bne     .Lcopy_fs
.Lwide_ring:
''')
    text = text.replace('    bsr     audio_copy80', '    bsr     mwua_route')
    start = text.index('    movel   %d4,%d6\n', text.index('\n.Lcopied:'))
    end = text.index('6:  | ---- the dTD:', start)
    text = text[:start] + '    bsr mwua_packet_bytes\n' + text[end:]
    # A full-speed sourced pair needs the same delay as the high-speed ring.
    text = checked(text, '    tstb    aud_hs\n    beq     97f', '    tstb aud_hs\n    bne 96f\n    tstb mwua_fs_sum\n    bne 97f\n96:')
    cap = '    movel   #(0x60000000+(PKT_MAX_HS<<16)),%d0'
    text = checked(text, cap, '''    mvzb mwua_pairs,%d0
    moveq #96,%d1
    mulu.l %d1,%d0
    swap %d0
    oril #0x60000000,%d0''')
    text += '''
    .text
mwua_packet_bytes:                 | d4 frames; d6 result, d1 scratch
    movel %d4,%d6
    lsll #3,%d6
    tstb aud_hs
    beqs 1f
    mvzb mwua_pairs,%d1
    mulu.l %d1,%d6
1:  rts
mwua_route:                        | a0 dTD, a3 buffer, a5 wrap, a6 slot
    tstb aud_hs
    beqs 1f
    tstb mwua_direct
    bne audio_copy80
    moveq #0,%d1
    bras 2f
1:  moveq #1,%d1
2:  movel %a0,%sp@-
    movel %d1,%sp@-
    movel %d0,%sp@-
    movel %a2,%sp@-
    movel %a1,%sp@-
    bsr mwua_copy
    moveal %sp@,%a1
    movel %sp@(8),%d4
    lea %sp@(16),%sp
    moveal %sp@+,%a0
    bsr mwua_packet_bytes
    addal %d6,%a1
    rts
    .bss
    .balign 4
mwua_gain: .space 4
'''
    return text


def source(root, module, layout, functions, load, sine_curve, package_hooks, *, usb_input=None):
    path = root / 'sdk/octatrack/modules' / module / 'layouts/usbaudio.s'
    raw = path.read_bytes()
    if hashlib.sha256(raw).hexdigest() != SOURCE_SHA:
        raise ValueError('Review the licensed multi-layout producer before adapting it.')
    post = load('usb_post', HERE.parent / 'elekloader/usb_post.py')
    text = functions.packet_readiness(functions.audio_source(raw.decode()))
    text = functions.audio_storage_source(text)
    text = checked(text, '    .include "remix.inc"', functions.audio_include(layout) + post.include(sine_curve(post)))
    text = configure_source(text)
    text = package_hooks(text)
    text = checked(text, '    jsr     audio_frame_shim', '    jsr mwua_begin_frame\n    jsr     audio_frame_shim')
    # Reuse the licensed fixed-clock SET_CUR handler as an ev_usb_control
    # callback. d2 is callee-saved and carries the verified request length.
    start = text.index('.Lctrl_set:\n')
    end = text.index('.Lctrl_stock:\n', start)
    set_cur = text[start:end].replace('jmp     SETIFACE_DONE', 'bra     .Lclock_answered').replace('.Lctrl_stock', '.Lclock_reject')
    set_cur = checked(set_cur, 'movel   #0x00408080,%d0', 'movel   #0x00048080,%d0')
    text = text[:start] + set_cur + '''.Lclock_answered:
    moveq #1,%d0
    bra .Lclock_return
.Lclock_reject:
    moveq #0,%d0
.Lclock_return:
    movel %sp@+,%d2
    rts
''' + text[end:]
    text = checked(text, '    beq     .Lctrl_set', '    beq     .Lctrl_stock')
    text = checked(text, '    movel   EP0_BUF,%d0', '''    movel   EP0OUT_DTD+4,%d0
    andil   #0x7fff0068,%d0         | reject a short or failed clock write
    bne     1f
    movel   EP0_BUF,%d0''')
    text = checked(text, '.Lmwc_class:\n', '''.Lmwc_class:
    cmpil #0x21,%d0
    bne .Lclock_get
    tstb SETUP_WVALH-1
    bne .Lmwc_no
    tstb 0x46c8ce0f
    bne .Lmwc_no
    movel %d2,%sp@-
    mvzb 0x46c8ce0e,%d2
    bra .Lctrl_set
.Lclock_get:
''')
    text = checked(text, 'mwua_bus_end: ', 'mwua_bus_end:\n    clrb uac2_set_pending\n    | ')
    if usb_input:
        text = checked(text, '.set USB_IN, 0\n', '.set USB_IN, 1\n')
        text = usb_input.package_source(text)
    return text


def records(root, module, supported, functions, usb, function_block, descriptor_records, *, usb_input=None):
    descriptors = SimpleNamespace(**runpy.run_path(str(root / 'sdk/octatrack/modules' / module / 'layouts/descriptors.py')))
    keys = [supported[i] for i in (0,1,3,4,0)]
    names = ('mwua_fs','mwua_hs','mwua_other_fs','mwua_other_hs')
    speeds = ((False, False),(True, False),(False, True),(True, True))
    rows = []
    for hs, other in speeds:
        blocks = [function_block(functions, usb, descriptors, key, hs, other) for key in keys]
        if hs:
            # The Outbox profile has four stereo outputs, 12 frames per poll.
            records = [bytearray(r) for r in descriptor_records(blocks[-1])]
            for r in records:
                if r[:3] == bytes([17,0x24,2]): r[8] = 8
                if r[:3] == bytes([16,0x24,1]): r[10] = 8
                if r[:3] == bytes([7,5,0x83]): struct.pack_into('<H',r,4,12*8*4)
            blocks[-1] = b''.join(records)
        rows.append(blocks)
    if usb_input:
        profiles = []
        for (hs, other), output_only in zip(speeds, rows):
            def block(key, name):
                return function_block(functions, usb, descriptors, key, hs, other, audio_input=name)
            blocks = usb_input.descriptor_profiles(keys, output_only, block)
            profiles.append([(3 if hs and i >= len(keys) else 2, value) for i, value in enumerate(blocks)])
        return usb_input.records(names, profiles), max(len(value) for row in profiles for _, value in row)

    length = len(rows[0][0])
    if any(len(b) != length for row in rows for b in row):
        raise ValueError('USB profiles must have equal descriptor lengths.')
    lines = ['.data','.balign 4','mwua_function:', '.long 2,36', f'.short 2,{length}', '.long 0x00080000',
             '.long '+','.join(names), '.short 5', '.global mwua_requested,mwua_active', 'mwua_requested: .byte 0','mwua_active: .byte 0']
    for name, blocks in zip(names, rows):
        lines.append(name+':')
        for block in blocks: lines.append('.byte '+','.join(map(str,block)))
    return '\n'.join(lines)+'\n', length
