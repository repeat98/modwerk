# SPDX-License-Identifier: GPL-3.0-or-later
"""Adapt the pinned OctaBam input receiver to Modwerk's shared USB and DSP owners."""
import hashlib
from pathlib import Path

HERE = Path(__file__).resolve().parent
UPSTREAM = HERE / 'usb-audio-input-upstream'
SOURCES = {
    'usbaudio_in.s': '52866a53fa457ffdbbaef06c3c2e4ff8bdb6a99371f0ea9a5174dee1574ba46b',
    'rx_inject.asm': 'cfe86116205e7b38e87bfb900543e99ebca19694e007486bc9a48ce56f57d6c4',
}
STAGE = 0x80007880
DESTINATION = 0x6360  # Core 0. The DSP loader occupies $6320-$635f.
MAGIC = 0x5549
DSP_FRAME_SITE = 0x88
STOCK_FRAME_GUARD = hashlib.sha256(bytes.fromhex('627000000204')).hexdigest()


def source(name):
    raw = (UPSTREAM / name).read_bytes()
    if hashlib.sha256(raw).hexdigest() != SOURCES[name]:
        raise ValueError(f'Review the OctaBam USB input source before adapting {name}.')
    return raw.decode()


def replace(text, before, after):
    if text.count(before) != 1:
        raise ValueError('USB input integration seam drifted: ' + before.splitlines()[0])
    return text.replace(before, after)


def dsp_source():
    # Two header words precede Bryan's flags. Consume the marker so a late,
    # missing or removed sender leaves the jacks live on both DSP banks.
    return replace(source('rx_inject.asm'), '''        add     #>$320,a
        move    a,r0                    ; the transfer: this frame's bank + $320
''', f'''        add     #>${DESTINATION & 0x0fff:x},a
        move    a,r0
        move    x:(r0),a
        eor     #>${MAGIC:x},a
        and     #>$ffff,a
        bne     >usbi_end
        move    #0,x1
        move    x1,x:(r0)
        lua     (r0+2),r0
''')


def place_receiver(place, assemble, tag, end, work):
    if tag != 'A':  # The ESAI lands only on core 0.
        return place(end)
    text = dsp_source()
    template, _ = assemble(text, end, work)
    origin = end - len(template)
    words, labels = assemble(text, origin, work)
    if labels['inject'] != origin or len(words) != len(template):
        raise ValueError('USB input injection changed its entry or length.')
    bundle = place(origin)
    bundle['words'] += words
    bundle['guards'].append(dict(module='usb-audio-input', site=DSP_FRAME_SITE, expectedSha256=STOCK_FRAME_GUARD,
                                 entry=origin, relocated=False))
    return bundle


def mailbox_initialization(image, device, dsp):
    # Neither bank's eDMA span may take a stock X initialization record.
    # Clear only the word the injector tests, even on a cold DSP.
    markers = (0x2000 + (DESTINATION & 0xfff), 0x4000 + (DESTINATION & 0xfff))
    for space, at, count, _ in dsp.records(image, device, 'A'):
        if space == 1 and any(at < marker + 160 and marker < at + count for marker in markers):
            raise ValueError('USB audio input DMA overlaps a stock DSP record.')
    return {'A': [dict(space='x', address=marker, words=[0], owner=0) for marker in markers]}


def cold_source():
    text = source('usbaudio_in.s')
    # The base handles EP0 and eDMA. Keep only the authored USB receiver,
    # buffer management, and sample conversions used by the package.
    text = text[:text.index('| ---- SET_INTERFACE')] + text[text.index('| ---- the per-frame work'):]
    text = replace(text, '.set SRAM_TX,        0x80007880', f'.set SRAM_TX,        {STAGE + 4:#x}')
    text = replace(text, '| the host-port block for the DSP (TX_BYTES), 16-byte aligned',
                   '| audio flags and sample words, following the shared DMA header')
    text = replace(text, '''.set TX_BYTES,   320''', '''.set TX_BYTES,   316''')
    text = replace(text, '''in_ring:      .space IN_FRAMES*16''', '''    .bss
    .balign 4
in_ring:      .space IN_FRAMES*16''')
    # Nobody needs to wait for a halted controller. The buffers are fixed
    # SRAM, and the base retires both directions on a package/profile switch.
    text = replace(text, '''in_flush:
    movel''', '''in_flush:
    movel   USBCMD,%d0
    btst    #0,%d0
    beq     .Linput_flushed
    movel''')
    text = replace(text, '3:  movel   %sp@+,%d2\n    rts\n', '3:  movel   %sp@+,%d2\n.Linput_flushed:\n    rts\n')
    text = replace(text, '    clrb    in_zero_sent\n', '')
    text = replace(text, '    clrb    in_zero_sent            | a zero block goes out before the transfers stop\n', '')
    text = '\n'.join(line for line in text.split('\n') if not line.startswith(('in_busy:', 'in_zero_sent:')))
    text = replace(text, "| second state-7 visits (our transfer's completion)", '| input blocks submitted to the shared DMA scheduler')
    return text + f'''
    .text
    .global mwua_input_block
mwua_input_block:
    moveq   #0,%d0
    tstb    in_alt
    bne     .Linput_read
    tstb    in_running
    beq     .Linput_done
.Linput_read:
    lea     %sp@(-40),%sp
    moveml  %d2-%d7/%a2-%a5,%sp@
    jsr     mwua_input_mode
    moveb   %d0,usb_inputs
    movel   in_consumed,%sp@-
    jsr     in_frame
    movel   %sp@+,%d1
    moveq   #0,%d0
    cmpl    in_consumed,%d1
    beq     .Linput_restore
    movel   #({MAGIC:#x}<<16),%d1
    movel   %d1,{STAGE:#x}
    addql   #1,in_seconds
    moveq   #3,%d0
    mvzb    usb_inputs,%d1
    cmpil   #3,%d1
    bne     .Linput_restore
    moveq   #5,%d0
.Linput_restore:
    moveml  %sp@,%d2-%d7/%a2-%a5
    lea     %sp@(40),%sp
.Linput_done:
    rts
'''


def package_source(text):
    text = replace(text, '5:  movel   0xfc0b01c4,%d0          | displaced',
                   '''5:  cmpil   #UAC2_AS_IFACE+1,%d0
    bne     .Linput_set_stock
    mvzb    mwua_active,%d1
    cmpil   #5,%d1                   | the active USB profile, even before the first frame
    bcs     .Linput_set_stock
    movel   PORTSC1,%d1
    andil   #0x0c000000,%d1
    cmpil   #0x08000000,%d1
    bne     .Linput_set_stock
    mvzb    SETUP_ALT,%d0
    cmpil   #1,%d0
    bhi     .Linput_alt_stall
    moveb   %d0,in_alt
    bne     3b
    bsr     in_flush
    bra     3b
.Linput_alt_stall:
    movel   EP0CTRL,%d0
    oril    #0x00010001,%d0
    movel   %d0,EP0CTRL
    jmp     SETIFACE_DONE
.Linput_set_stock:
    movel   0xfc0b01c4,%d0          | displaced''').replace(
        '    clrb uac2_set_pending\n', '    clrb in_alt\n    clrb uac2_set_pending\n', 1)
    text = replace(text, '    pea     in_alt\n', '''    moveb   in_alt,%d0
    moveb   %d0,SRAM_REPLY
    pea     SRAM_REPLY
''')
    return replace(text, '''    cmpil   #0x55,%d0
    bne     .Lmwc_no
    lea     usbaudio_consumed,%a0
''', '''    cmpil   #0x55,%d0
    beq     .Loutput_counters
    cmpil   #0x56,%d0
    bne     .Lmwc_no
    lea     in_counters,%a0
    moveal  #SRAM_REPLY,%a1
    moveq   #14,%d0
.Linput_counters:
    movel   %a0@+,%a1@+
    subql   #1,%d0
    bpls    .Linput_counters
    moveal  #SRAM_REPLY,%a0
    moveq   #60,%d0
    bra     .Lmwc_send
.Loutput_counters:
    lea     usbaudio_consumed,%a0
''') + cold_source()


def settings_source(text):
    # The stock-free recipe for the shipped output-only version stays exact.
    # The private candidate uses the same setting, with two reserved bits for
    # input presses. Older saved settings leave those bits zero.
    for before, after in (
        ('OUTBOX8, PROFILES', 'OUTBOX8, USB_STEREO_INPUT, USB_FOUR_INPUT = USB_STEREO_INPUT + 4, PROFILES = USB_FOUR_INPUT + 4'),
        ('IN_ORDER, FIELDS', 'IN_ORDER, INPUTS, FIELDS'),
        ('widths[PROFILES]', 'widths[USB_STEREO_INPUT]'),
        ('"ASSIGN IN ORDER"}', '"ASSIGN IN ORDER", "INPUTS"}'),
        ('static unsigned layout', 'static const char *const input_modes[] = {"OFF", "AB", "CD", "ABCD"};\n'
         'uint8_t usb_inputs;\n'
         'static unsigned inputs(uint32_t w) { return (w >> 24) & 3u; }\n'
         'static unsigned layout'),
        ('if (outbox(w)) for (unsigned f = OUT1; f <= IN_ORDER; ++f) ids[n++] = f;',
         'if (outbox(w)) {\n        for (unsigned f = OUT1; f <= IN_ORDER; ++f) ids[n++] = f;\n'
         '    } else ids[n++] = INPUTS;'),
        ('case IN_ORDER: return 0;', 'case INPUTS: return input_modes[inputs(w)];\n    case IN_ORDER: return 0;'),
        ('case IN_ORDER: names = order;', 'case INPUTS: names = input_modes; n = 4; page->active = inputs(w); break;\n'
         '    case IN_ORDER: names = order;'),
        ('case IN_ORDER:\n', 'case INPUTS: if (choice < 4u) w = (w & ~(3u << 24)) | (choice << 24); break;\n    case IN_ORDER:\n'),
        ('    configuration[profile] = w;', '    if (!outbox(w) && inputs(w))\n'
         '        profile += inputs(w) == 3u ? USB_FOUR_INPUT : USB_STEREO_INPUT;\n'
         '    configuration[profile] = w;'),
        ('void mwua_begin_frame(void)',
         'unsigned mwua_input_mode(void)\n'
         '{\n'
         '    unsigned profile = mwua_active;\n'
         '    return profile >= USB_STEREO_INPUT && profile < PROFILES ? inputs(configuration[profile]) : 0u;\n'
         '}\n'
         'void mwua_begin_frame(void)'),
        ('    mwua_pairs = widths[profile];',
         '    if (profile >= USB_STEREO_INPUT) profile = profiles[l];\n'
         '    mwua_pairs = widths[profile];'),
    ):
        text = replace(text, before, after)
    return text


def descriptor_profiles(keys, output_only, make_block):
    # Profiles 0..4 have the current output shapes. The stereo and four-channel
    # variants exist for a computer host. AB and CD share the stereo descriptors.
    blocks = [output_only] + [[make_block(key, name) for key in keys[:4]]
                              for name in ('USB AUDIO IN AB', 'USB AUDIO IN ABCD')]
    return [block for group in blocks for block in group]


def records(names, rows):
    text = ['.data', '.balign 4', 'mwua_function:', '.long 3,40', '.short 0,0', '.long 0x00080008',
            '.long ' + ','.join(names), f'.short {len(rows[0])}',
            '.global mwua_requested,mwua_active', 'mwua_requested: .byte 0', 'mwua_active: .byte 0',
            '.long mwua_input_block']
    for name, row in zip(names, rows):
        text += ['.balign 4', name + ':']
        for index, (interfaces, block) in enumerate(row):
            text += [f'.short {interfaces},{len(block)}', f'.long {name}_{index}']
        for index, (_, block) in enumerate(row):
            text += [f'{name}_{index}:', '.byte ' + ','.join(map(str, block))]
    return '\n'.join(text) + '\n'


def scheduler(text):
    before = '        jsr dl_frame\n        tst.l %d0'
    after = '''        jsr dl_frame
        move.l %d0,%d7
        jsr modwerk_usb_input_block
        tst.l %d0
        bne dl_send_usb_input
        move.l %d7,%d0
        tst.l %d0'''
    text = replace(text, before, after)
    text = replace(text, 'dl_next:\n', '''dl_next:
        cmpi.l #3,%d2
        beq dl_complete
        cmpi.l #4,%d2
        bne dl_next_loader
        moveq #1,%d2
        move.l %d2,dl_phase
        bra dl_write
dl_next_loader:
''')
    return replace(text, 'dl_write:\n', f'''dl_send_usb_input:
        moveq #3,%d2
        tst.l %d7
        beq dl_input_phase
        addq.l #1,%d2
dl_input_phase:
        move.l %d2,dl_phase
        clr.b 0xfc0a400c
        move.l #{STAGE:#x},%d1
        move.l %d1,0xfc045000
        moveq #64,%d1
        move.l %d1,0xfc045008
        move.w #0x81,%d1
        move.w %d1,0x20000000
        move.w #{DESTINATION:#x},%d1
        move.w %d1,0x2000001c
        move.l %d0,%d1
        lsl.l #5,%d1
        subq.l #1,%d1
        move.w %d1,0x2000001c
        move.w #0x88,%d1
        move.w %d1,0x20000004
        ori.l #0x8000,%d0
        move.w %d0,0xfc045014
        move.w %d0,0xfc04501c
        clr.b 0xfc04401e
        bra dl_return

dl_write:
''')
