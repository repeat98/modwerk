#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""USB Audio as a runtime package: the authored producer on a base that takes a module's USB function.

    python3 -B sdk/machines/octatrack/module-adapters/usb_audio_package.py -o usb-audio.mwrm \\
        [--layout 'USB AUDIO OUT TRACKS MAIN CUE'] [--stock OS.bin --upstream ELEKLOADER]

Development only. Single-layout trial evidence and qualification status are in
docs/verification/2026-11-20-octatrack-usb-audio-package.md. The package holds no stock bytes (its three stock
sites carry SHA-256 guards) and needs a base with ot_usb_functions and the four USB hooks (events.json,
elekloader/usb_function.c); a base that links USB Audio in refuses it.

The imported source (sdk/octabam/modules/usb-audio-out-tracks-main-cue/usbaudio.s) stays exact. As in a base that
links it in (base_usb_functions.py), its interfaces move to 4 and 5, the packet reader gets its watermark and its
rings and DMA buffers go to bss. For a package, at guarded seams:

- its four shims at sites the base owns end in rts and are called as hooks: the USB interrupt (ev_usb_isr), the bus
  reset and session end (ev_usb_bus_end), the frame interrupt's block (ev_usb_frame); the class requests are answered
  by a handler of the hook's own shape (ev_usb_control), which calls stock's usb_ep0_send instead of jumping into the
  dispatcher's tail;
- its descriptors are the block ot_usb_functions takes, cut from the same composed configuration a linked base sends;
- SET_INTERFACE, GET_INTERFACE and the EP0 page fix stay its own stock sites, which no base without it patches;
- the player's choice on the unit (PROJ > MODWERK > SETTINGS: ALL CHANNELS, OFF and, in the twenty-channel layout,
  MAIN + CUE ONLY; issue 1512) is the package's ot_settings record, read by the producer through the seams pull
  request 1517 made for a linked base;
- its transfer descriptors are aligned at run time: a package's image sits at a 16-byte boundary of the pool, and
  the controller needs 32;
- USB AUDIO OUT TRACKS POST takes its gain curve as the computed quarter sine (owner, 20 November 2026), not as
  the stock DSP table a linked base reads from the owner's OS: a package carries no stock data. The stock table
  is that sine to within 64 of 2^23 (usb_post.py refuses any other), so a stem's level differs from a linked
  base's by at most that.
"""
import argparse
import hashlib
import json
import math
import importlib.util
import struct
import subprocess
import sys
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[3]
MODULE = 'usb-audio-out-tracks-main-cue'
INPUT_TRIM = HERE.parents[2] / 'octatrack/modules/usb-audio-out-tracks-main-cue/usb_audio_input_trim.c'  # the input stream's drift trim (usb_audio_configurable.input_trim)
TITLE = 'USB AUDIO'
SUPPORTED = ('USB AUDIO OUT TRACKS MAIN CUE', 'USB AUDIO OUT TRACKS', 'USB AUDIO OUT MASTER', 'USB AUDIO OUT MAIN CUE',
             'USB AUDIO OUT MAIN', 'USB AUDIO OUT TRACKS POST')
USB_EP0_SEND = 0x4001d498  # stock: usb_ep0_send(length, buffer), the routine EP0_SEND_TAIL (0x4001de5c) calls


def load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module)
    return module


def once(text, old, new, what):
    if text.count(old) != 1:
        raise ValueError('The authored USB Audio source changed at %s; review the package seam.' % what)
    return text.replace(old, new)


def function_block(functions, usb, descriptors, layout, high_speed, other_speed, *, audio_input=None):
    """The audio function's descriptors as they follow the base's own in a composed configuration."""
    without = functions.configuration(usb, descriptors, high_speed, other_speed, None)
    whole = functions.configuration(usb, descriptors, high_speed, other_speed, layout, audio_input=audio_input)
    block = whole[len(without):]
    interfaces = 3 if high_speed and audio_input else 2
    if (whole[9:len(without)] != without[9:] or whole[4] != without[4] + interfaces
            or struct.unpack_from('<H', whole, 2)[0] != len(whole) or not block or block[1] != 11 or block[2] != 4):
        raise ValueError('The audio function no longer follows the base\'s own interfaces as one block.')
    return block


def audio_switch(text, key, layouts):
    """The player's choice on the unit (PROJ > MODWERK > SETTINGS, the package's ot_settings record), read by the
    producer every frame. Written for a base that linked USB Audio in and tried on a unit there (pull request
    1517, 13 November 2026); in a package it has run in the emulator only.

    OFF: silence. The frame hook takes its no-host path, writes nothing to the ring and only counts the block's
    sixteen frames, so the packet clock and its servo run on; the builder copies nothing and sends each packet
    from a buffer zeroed once (the first packet each of the NSLOT buffers carries after the choice). A host sees
    an ordinary stream of silence, whenever it opens it. When the player chooses again the first produced block
    zeroes the cushion the reader is in, as at any start, so nothing from before OFF is sent. Two other ways
    were tried on the owner's MKII with Windows 11 (13 November 2026): with the endpoint taken down under an
    open stream no packet was collected again after it came back, and with empty packets the recording skipped
    42 to 71 frames shortly after about half of the resumes, the unit's own counters unbroken. MAIN + CUE ONLY (the
    twenty-channel layout, at high speed: full speed sends the tracks' sum): the producer leaves each frame's
    sixteen track words in the ring as they were, and the packet builder copies only the frame's last sixteen
    bytes (MAIN and CUE) into the packet. What a stream costs is its memory traffic, through the 80 KB ring and
    the controller's uncached buffers (owner's MKII, 13 November 2026, the frame interrupt's share while
    playing: all channels 65.4 %, track words cleared in the ring and copied 64.1 %, cleared and not copied
    61.5 %, neither 55.6 %, no stream 38.6 %). The track bytes of a packet buffer are zeroed once, in the first
    packet each of the NSLOT buffers carries after the choice. When the choice ends the builder keeps its short
    copy for MW_MIX_HOLD more packets, over a thousand frames: by then the producer has rewritten every ring
    slot, so no track word from before or during the choice is ever sent. A packet copied whole, or a
    full-speed one, starts both counts again. The hook also writes which choices its layout offers (bit 0 all, 1 MAIN + CUE
    only, 2 off). The descriptors, the packet sizes and the import stay as they are.
    """
    if key not in layouts or 'modwerk_usb_audio' in text or '.Lmw_' in text:
        raise ValueError('Choose an explicit supported USB output layout for an unswitched producer.')
    wanted = ('    tstb    usbaudio_alt\n    bnes    .Lproduce\n'
              "    tstb    aud_force               | the harness's switch (usb_align): produce\n"
              '    bnes    .Lproduce               | with no host and EP3 left alone\n')
    tracks = '    moveq   #RB_TRACKS-1,%d7\n2:  movel   %a0@,%d2                | track L\n'
    after = ('    lea     %a0@(128),%a0           | next track, same frame\n    subql   #1,%d7\n    bpl     2b\n'
             '.if USB_LAYOUT == LAYOUT_TRACKS_MAIN_CUE\n')
    buffer = '    moveal  #(aud_bufs+UNCACHED),%a3\n    addal   %d0,%a3\n    moveal  %a3,%a1\n'
    copy, helpers = '    bsr     audio_copy80', '| Copy d0 (>= 1) 8-byte stereo-sum frames from %a2 to %a1, both advanced.\naudio_copy8:\n'
    if any(text.count(seam) != 1 for seam in (wanted, tracks, after, buffer, helpers)) or text.count(copy) != 3 or \
            text.count('\n.Lcopied:\n') != 1 or text.count('    movel   %d4,usbaudio_lastn\n') != 1 or \
            text.index('    movel   %d4,usbaudio_lastn\n') > text.index(buffer):
        raise ValueError('The authored audio producer changed; review the on-device switch.')
    caps = 7 if layouts[key] == 0 else 5
    text = text.replace(wanted, """    moveq   #%d,%%d0                | what this layout offers (mwua_setting)
    moveb   %%d0,modwerk_usb_audio_caps
    tstb    modwerk_usb_audio_off   | the player's OFF: as with no host, the
    beqs    .Lmw_on                 | block's frames counted for the packet clock
    addql   #8,aud_produced
    addql   #8,aud_produced
    bras    .Lmw_idle
.Lmw_on:
""" % caps + wanted + '.Lmw_idle:\n')
    text = text.replace(tracks, """.if USB_LAYOUT == LAYOUT_TRACKS_MAIN_CUE
    tstb    modwerk_usb_audio_mix   | MAIN + CUE ONLY: silent track channels
    beqs    .Lmw_tracks
    movel   %a1,%d0
    beqs    .Lmw_tracks             | full speed sends the tracks' sum: copy them
    lea     %a3@(64),%a3            | the track words stay as they were: the builder does not send them
    bra     .Lmw_tracks_done
.Lmw_tracks:
.endif
""" + tracks)
    text = text.replace(after, after.replace('.if USB_LAYOUT', '.Lmw_tracks_done:\n.endif\n.if USB_LAYOUT', 1).replace(
        '    bpl     2b\n', '    bpl     2b\n.if USB_LAYOUT == LAYOUT_TRACKS_MAIN_CUE\n', 1))
    text = text.replace(buffer, buffer + """    tstb    modwerk_usb_audio_off   | OFF: a packet of silence, nothing copied
    beqs    .Lmw_send
    bsr     mw_off_packet
    bra     .Lcopied
.Lmw_send:
    clrl    mw_off_clean
.if USB_LAYOUT == LAYOUT_TRACKS_MAIN_CUE
    bsr     mw_mix_packet           | MAIN + CUE ONLY: this buffer's track bytes are zero
.endif
""")
    text = text.replace(copy, '    bsr     mw_copy80')
    return text.replace(helpers, """| OFF (Modwerk, usb_audio_package.py). Before a packet's copy, %a3 its buffer: zero the whole buffer of the first
| packet each of the NSLOT buffers carries after the choice; the builder then skips the copy. Any packet that is
| copied starts the count again. Uses d0-d1/a2, which the builder loads after this or no longer needs.
mw_off_packet:
    movel   mw_off_clean,%d0
    moveq   #NSLOT,%d1
    cmpl    %d1,%d0
    bccs    9f                      | every buffer is zero
    addql   #1,%d0
    movel   %d0,mw_off_clean
    moveal  %a3,%a2
    movel   #PKT_BUF/4-1,%d1
7:  clrl    %a2@+
    subql   #1,%d1
    bpls    7b
9:  rts
    .bss
    .balign 4
mw_off_clean: .space 4              | packets since OFF whose buffer was zeroed
    .text
.if USB_LAYOUT == LAYOUT_TRACKS_MAIN_CUE
| MAIN + CUE ONLY (Modwerk, usb_audio_package.py). Before a packet is copied, %a3 its buffer: count the packets
| since the choice, and zero the track bytes of the first each of the NSLOT buffers carries (every frame a packet
| can hold). Any other packet starts the count again. Uses d0-d1/a2, which the builder loads after this.
mw_mix_packet:
    tstb    aud_hs
    beqs    8f                      | full speed: the sum's packets, copied whole
    tstb    modwerk_usb_audio_mix
    beqs    5f
    moveq   #MW_MIX_HOLD,%d0        | chosen: the short copy, and for this many packets after
    movel   %d0,mw_mix_hold
    bras    6f
5:  movel   mw_mix_hold,%d0
    beqs    8f                      | not chosen, and the ring is the producer's again
    subql   #1,%d0
    movel   %d0,mw_mix_hold
6:  moveq   #1,%d0
    moveb   %d0,mw_mix_short
    movel   mw_mix_clean,%d0
    moveq   #NSLOT,%d1
    cmpl    %d1,%d0
    bccs    9f                      | every buffer's track bytes are zero
    addql   #1,%d0
    movel   %d0,mw_mix_clean
    moveal  %a3,%a2
    moveq   #PKT_MAX_HS/80-1,%d1
7:  .rept 16
    clrl    %a2@+
    .endr
    lea     %a2@(16),%a2
    subql   #1,%d1
    bpls    7b
9:  rts
8:  clrl    mw_mix_clean
    clrl    mw_mix_hold
    clrb    mw_mix_short
    rts
| audio_copy80's call: a short packet (mw_mix_packet) takes d0 (>= 1) frames' last sixteen bytes from %a2 to %a1,
| both advanced by the whole 80-byte slot. Clobbers d1-d4.
mw_copy80:
    tstb    mw_mix_short
    beq     audio_copy80
1:  moveml  %a2@(64),%d1-%d4
    moveml  %d1-%d4,%a1@(64)
    lea     %a2@(80),%a2
    lea     %a1@(80),%a1
    subql   #1,%d0
    bnes    1b
    rts
    .bss
    .balign 4
mw_mix_clean: .space 4              | packets since MAIN + CUE ONLY whose buffer's track bytes were zeroed
mw_mix_hold:  .space 4              | packets the short copy still holds after the choice ended
mw_mix_short: .space 1              | this packet is copied short
    .text
.set MW_MIX_HOLD, 96                | x 11 frames a packet: more than the ring's AUD_FRAMES
.else
.set mw_copy80, audio_copy80
.endif
""" + helpers)


def sine_curve(usb_post):
    """The first quarter of a 1024-step sine in 24 bits: the curve usb_post.py checks the stock table against."""
    return usb_post.validate(round(math.sin(2 * math.pi * i / 1024) * 0x7fffff) for i in range(usb_post.COUNT))


def source(functions, usb, layout):
    """The adapted unit: the authored source, the linked base's adaptations, the package seams, the handlers."""
    path, _ = usb.audio_paths(layout)
    text, include = functions.audio_source(path.read_text()), functions.audio_include(layout)
    if layout == usb.POST_LAYOUT:
        usb_post = load('modwerk_usb_post', ROOT / 'sdk/machines/octatrack/elekloader/usb_post.py')
        include += usb_post.include(sine_curve(usb_post))
    else:
        text = functions.packet_readiness(text)
    text = functions.audio_storage_source(audio_switch(text, layout, functions.AUDIO_LAYOUTS))
    text = once(text, '    .include "remix.inc"', include, 'its include')
    return package_hooks(text) + setting(functions.AUDIO_LAYOUTS[layout] == 0)


def package_hooks(text):
    # The hooks: each shim at a site the base owns returns to the base instead of chaining or rejoining stock.
    text = once(text, '    jmp     usbmidi_rx_isr_shim      | USB MIDI\'s shim, whose detour this one stands in for',
                '    moveq   #0,%d0                  | package: ev_usb_isr, the base goes on to USB MIDI itself\n    rts',
                'the interrupt shim\'s tail')
    text = once(text, '9:  clrl    0x46104d4e              | displaced\n    jmp     0x4000d9a6\n',
                '9:  rts                             | package: ev_usb_frame, the base replays the displaced clear\n',
                'the producer\'s tail')
    # Transfer descriptors at a 32-byte boundary found at run time (mwua_frame), with the room for it.
    aligned = '    moveal  #(aud_dtds+UNCACHED),'
    if text.count(aligned) != 3:
        raise ValueError('The authored USB Audio source names its transfer descriptors elsewhere; review the alignment.')
    text = text.replace(aligned, '    moveal  mwua_dtds,')
    text = once(text, 'aud_dtds:          .space NSLOT*32 ', 'aud_dtds:          .space NSLOT*32+32 ', 'its transfer descriptors')
    return text + HANDLERS


HANDLERS = '''
| ---- the package's handlers (Modwerk, usb_audio_package.py) -----------------
| C convention: d0-d1/a0-a1 free, the rest kept; each returns 0 in d0 unless it says otherwise.
    .text
    .balign 2
    .global mwua_isr, mwua_bus_end, mwua_frame, mwua_control
    .type mwua_isr,@function
mwua_isr:                           | ev_usb_isr: retire EP3 IN's completion
    jmp     audio_isr_shim
    .size mwua_isr, .-mwua_isr
    .type mwua_bus_end,@function
mwua_bus_end:                       | ev_usb_bus_end: alternate setting 0; the frame interrupt tears EP3 down
    bsr     audio_alt0_request
    moveq   #0,%d0
    rts
    .size mwua_bus_end, .-mwua_bus_end
    .type mwua_frame,@function
mwua_frame:                         | ev_usb_frame: the producer, which uses every register
    lea     %sp@(-44),%sp
    moveml  %d2-%d7/%a2-%a6,%sp@
    movel   #(aud_dtds+UNCACHED+31),%d0
    andil   #0xffffffe0,%d0
    movel   %d0,mwua_dtds           | the controller keeps bits 31:5 of a dTD pointer
    jsr     audio_frame_shim
    moveml  %sp@,%d2-%d7/%a2-%a6
    lea     %sp@(44),%sp
    moveq   #0,%d0
    rts
    .size mwua_frame, .-mwua_frame
| ev_usb_control: audio_ctrl_shim's requests (the clock source's sample rate and validity, and the vendor read of
| the counters), answered with stock's usb_ep0_send(min(wLength, length), buffer). Returns 1 when it answered.
    .type mwua_control,@function
mwua_control:
    mvzb    SETUP_BMREQ,%d0
    cmpil   #0xc0,%d0
    bnes    .Lmwc_class
    mvzb    SETUP_BREQ,%d0
    cmpil   #0x55,%d0
    bne     .Lmwc_no
    lea     usbaudio_consumed,%a0
    moveq   #60,%d0
    bra     .Lmwc_send
.Lmwc_class:
    cmpil   #0xa1,%d0               | class GET, interface recipient
    bne     .Lmwc_no
    mvzb    SETUP_IFACE,%d0
    cmpil   #UAC2_AC_IFACE,%d0
    bne     .Lmwc_no
    mvzb    SETUP_WIDXH,%d0
    cmpil   #UAC2_CLOCK_ID,%d0
    bne     .Lmwc_no
    mvzb    SETUP_WVALH,%d0         | control selector
    mvzb    SETUP_BREQ,%d1          | 1 = CUR, 2 = RANGE
    cmpil   #1,%d0                  | CS_SAM_FREQ_CONTROL
    beqs    .Lmwc_freq
    cmpil   #2,%d0                  | CS_CLOCK_VALID_CONTROL
    bne     .Lmwc_no
    cmpil   #1,%d1
    bne     .Lmwc_no
    lea     uac2_clock_valid,%a0
    moveq   #1,%d0
    bras    .Lmwc_send
.Lmwc_freq:
    cmpil   #1,%d1
    bnes    .Lmwc_range
    lea     uac2_freq_cur,%a0
    moveq   #4,%d0
    bras    .Lmwc_send
.Lmwc_range:
    cmpil   #2,%d1
    bne     .Lmwc_no
    lea     uac2_freq_range,%a0
    moveq   #14,%d0
.Lmwc_send:
    mvzb    0x46c8ce0f,%d1          | SETUP wLength, little-endian
    lsll    #8,%d1
    movel   %d1,%a1
    mvzb    0x46c8ce0e,%d1
    addl    %a1,%d1
    cmpl    %d1,%d0
    blss    1f
    movel   %d1,%d0
1:  movel   %a0,%sp@-
    movel   %d0,%sp@-
    jsr     MW_USB_EP0_SEND
    addql   #8,%sp
    moveq   #1,%d0
    rts
.Lmwc_no:
    moveq   #0,%d0
    rts
    .size mwua_control, .-mwua_control

    .data
    .balign 4
    .global mwua_function, mwua_dtds
mwua_dtds:  .long 0                 | the transfer descriptors, at their 32-byte boundary (uncached alias)
'''


def setting(mix):
    """The package's row on PROJ > MODWERK > SETTINGS (events.json ot_settings): what the unit sends while a host has
    the stream open. OFF is the second choice in every layout, so the base's kept choice means the same in each;
    MAIN + CUE ONLY is the twenty-channel layout's alone."""
    names = ['ALL CHANNELS', 'OFF'] + (['MAIN + CUE ONLY'] if mix else [])
    out = ['| ---- the on-device setting (Modwerk, usb_audio_package.py) ------------------',
           '    .text', '    .balign 2', '    .global mwua_setting_apply', '    .type mwua_setting_apply,@function',
           'mwua_setting_apply:                 | apply(choice): 0 all channels, 1 off, 2 MAIN + CUE only',
           '    movel   %sp@(4),%d0', '    moveq   #1,%d1', '    cmpl    %d0,%d1', '    seq     %d1',
           '    moveb   %d1,modwerk_usb_audio_off', '    moveq   #2,%d1', '    cmpl    %d0,%d1', '    seq     %d1',
           '    moveb   %d1,modwerk_usb_audio_mix', '    rts', '    .size mwua_setting_apply, .-mwua_setting_apply',
           '    .data', '    .balign 4', '    .global mwua_setting',
           'mwua_setting:', '    .long 1, mwua_set_label, %d, mwua_set_choices, mwua_setting_apply, 0' % len(names),
           'mwua_set_choices: .long ' + ', '.join('mwua_set_%d' % i for i in range(len(names))),
           'mwua_set_label: .asciz "USB AUDIO"']
    out += ['mwua_set_%d: .asciz "%s"' % pair for pair in enumerate(names)]
    out += ['modwerk_usb_audio_off: .byte 0', 'modwerk_usb_audio_mix: .byte 0', 'modwerk_usb_audio_caps: .byte 0', '    .balign 4']
    return '\n'.join(out) + '\n'


def record(blocks):
    """struct modwerk_usb_function (include/modwerk_events.h) and its four descriptor blocks."""
    if len({len(b) for b in blocks}) != 1:
        raise ValueError('The four configurations give the audio function blocks of different lengths.')
    names = ('mwua_fs', 'mwua_hs', 'mwua_os_fs', 'mwua_os_hs')
    interfaces = sum(1 for b in [blocks[0]] for r in _records(b) if r[1] == 4 and r[3] == 0)
    out = ['mwua_function:', '    .long 1, 32', '    .short %d, %d' % (interfaces, len(blocks[0])),
           '    .long 0x00080000                | endpoint 3 IN', '    .long ' + ', '.join(names)]
    for name, block in zip(names, blocks):
        out.append('%s: .byte %s' % (name, ', '.join('0x%02x' % b for b in block)))
    return '\n'.join(out) + '\n    .balign 4\n'


def _records(data):
    at = 0
    while at < len(data):
        yield data[at:at + data[at]]
        at += data[at]


RECIPE = HERE / 'usb-audio-reconstruction.json'


def capture_release(loader, image, protected, sources, stock, upstream):
    from elekloader import formats
    parsed, device, original = formats.load(str(stock))
    main = formats.main_image(parsed, device)
    if device.key != 'octatrack' or original.version != '1.40C' or hashlib.sha256(main).hexdigest() != original.main_sha256:
        raise ValueError('Original Octatrack 1.40C required')
    packages = load('usb_audio_runs', HERE.parent / 'elekloader/module_packages.py')
    scanner = load('usb_audio_stock_runs', HERE.parent / 'elekloader/check_stock_free.py')
    source_runtime = load('usb_audio_source_runtime', ROOT / 'scripts/source-runtime-package.py')
    spans = set()
    for at, counted in packages.runs(image, main).items():
        if counted >= packages.LIMIT:
            spans.update(range(at, at + packages.SEED))
    for _, at, n, _ in scanner.stock_runs({'sections': {'image': {'parts': [['hex', image.hex()]]}}},
                                          scanner.haystacks(stock, upstream), 16):
        spans.update(range(at, at + n))
    for word in protected:
        spans.difference_update(range(word, word + 4))
    copies = []
    for at in sorted(spans):
        if copies and at == copies[-1]['offset'] + copies[-1]['length']:
            copies[-1]['length'] += 1
        else:
            copies.append(dict(offset=at, length=1, address=0))
    base = json.loads((ROOT / 'src/engine/assets/octatrack-base.elemod').read_text())
    recipe = dict(schema=1, imageSha256=hashlib.sha256(image).hexdigest(), sources=sources, copies=copies, fills=[])
    return source_runtime.bounded_capture(recipe, image, main, device.main_load, base, loader.site_events())


def build(layout, cross='m68k-elf-', *, release=False, capture=None, stock=None, upstream=None, usb_input=False):
    if usb_input and layout is not None:
        raise ValueError('USB audio input requires the configurable audio package.')
    input_port = load('modwerk_usb_input', HERE / 'usb_audio_input.py') if usb_input else None
    if layout is not None and layout not in SUPPORTED:
        raise ValueError('Not built as a package yet: ' + layout)
    sys.path.insert(0, str(ROOT / 'sdk/runtime/loader'))
    import build as loader
    usb = load('modwerk_usb_base', ROOT / 'sdk/machines/octatrack/elekloader/usb_base.py')
    functions = load('modwerk_base_usb_functions', HERE / 'base_usb_functions.py')
    if layout is None:
        configurable = load('modwerk_usb_configurable', HERE / 'usb_audio_configurable.py')
        descriptors, block_length = configurable.records(ROOT, MODULE, SUPPORTED, functions, usb, function_block, _records,
                                                         usb_input=input_port)
        text = configurable.source(ROOT, MODULE, SUPPORTED[0], functions, load, sine_curve, package_hooks,
                                   usb_input=input_port) + descriptors
    else:
        descriptors = load('modwerk_authored_usb_descriptors', usb.audio_paths(layout)[1])
        blocks = [function_block(functions, usb, descriptors, layout, hs, other)
                  for hs, other in ((False, False), (True, False), (False, True), (True, True))]
        block_length = len(blocks[0])
        text = source(functions, usb, layout) + record(blocks)
    with tempfile.TemporaryDirectory() as tmp:
        tmp = Path(tmp)
        (tmp / 'usbaudio.s').write_text(text)
        subprocess.run([cross + 'as', '-mcpu=54455', '--defsym', 'MW_USB_EP0_SEND=%#x' % USB_EP0_SEND,
                        str(tmp / 'usbaudio.s'), '-o', str(tmp / 'usbaudio.o')], check=True)
        objects = [tmp / 'usbaudio.o']
        if layout is None:
            objects.append(tmp / 'settings.o')
            settings = HERE / 'usb_audio_settings.c'
            if input_port:
                candidate = tmp / settings.name
                candidate.write_text(input_port.settings_source(settings.read_text()))
                settings = candidate
            subprocess.run([cross + 'gcc', *loader.CFLAGS, '-I', str(HERE.parent / 'include'), '-c',
                            str(settings), '-o', str(objects[-1])], check=True)
            if input_port:
                objects.append(tmp / 'trim.o')
                subprocess.run([cross + 'gcc', *loader.CFLAGS, '-c', str(INPUT_TRIM), '-o', str(objects[-1])], check=True)
        image, symbols, bss, offsets = loader.link_units(objects, cross, 0, tmp, anywhere=True)
    sites = []
    for address, guard, shim in usb.AUDIO_DETOURS:
        if shim == 'audio_frame_shim':  # the base's own site on a base with function slots: ev_usb_frame
            continue
        code = loader.OPCODES['jmp'] + struct.pack('>I', symbols[shim])
        sites.append((address, hashlib.sha256(bytes.fromhex(guard)).digest(), code, [2], 0, len(guard) // 2))
    if len(sites) != 3:
        raise ValueError('USB Audio\'s own stock sites changed.')
    loader.unevented(sites)
    entries = [dict(event='ot_usb_functions', fn='mwua_function', order=50), dict(event='ev_usb_isr', fn='mwua_isr', order=50),
               dict(event='ev_usb_bus_end', fn='mwua_bus_end', order=50), dict(event='ev_usb_control', fn='mwua_control', order=50),
               dict(event='ev_usb_frame', fn='mwua_frame', order=50), dict(event='ot_settings', fn='mwua_setting', order=50)]
    hooks = loader.subscribe([loader.NONE] * len(loader.HANDLERS), entries, symbols)
    # Inventory kind 9 is the configurable package with USB input on an adaptive
    # endpoint (0.4.1), 8 the one with an asynchronous input endpoint (0.4.0), 7 the
    # output-only one (0.3.0). Kinds 1-6 identify the older fixed layouts. The site
    # picks each one's exact Undo package by its kind.
    copies, fills = [], []
    if release or capture:
        if layout is not None:
            raise ValueError('The release package configures every layout.')
        sources = {'generatedAssembly': hashlib.sha256(text.encode()).hexdigest()}
        for path in (HERE / 'usb_audio_settings.c', HERE.parent / 'include/modwerk_events.h'):
            sources[str(path.relative_to(ROOT))] = hashlib.sha256(path.read_bytes()).hexdigest()
        if input_port:
            sources[str(INPUT_TRIM.relative_to(ROOT))] = hashlib.sha256(INPUT_TRIM.read_bytes()).hexdigest()
            sources['generatedSettings'] =hashlib.sha256(input_port.settings_source((HERE / 'usb_audio_settings.c').read_text()).encode()).hexdigest()
        preset = symbols['mwua_setting'] + 20
        if capture:
            if capture.exists() or not stock or not upstream:
                raise ValueError('Capture requires original stock, upstream tools and a new recipe path.')
            loader.firmware_codec.use_elekloader(upstream.resolve())
            recipe = capture_release(loader, image, [*offsets, preset], sources, stock, upstream)
            for item in recipe['copies']:
                at = item['offset']
                labels = [(address, name) for name, address in symbols.items() if address <= at and name[0].islower()]
                address, label = max(labels)
                item['purpose'] = f'Authored {label} + {at - address} in the USB Audio image'
            capture.write_text(json.dumps(recipe, indent=2) + '\n')
        else:
            recipe_path = HERE / 'usb-audio-input-reconstruction.json' if input_port else RECIPE
            recipe = json.loads(recipe_path.read_text())
        authored = image
        recipe_api = load('usb_audio_reconstruction', HERE / 'stock_recipe.py')
        image, copies, fills = recipe_api.apply(image, [*offsets, preset], recipe, sources)
        loader.unevented(sites, copies)
        base = json.loads((ROOT / 'src/engine/assets/octatrack-base.elemod').read_text())
        for _, address, n, _ in copies:
            if address < 0x40000400 or address + n > 0x400de1e0 or any(
                    address < int(site['addr'], 16) + site['len'] and int(site['addr'], 16) < address + n
                    for site in base['sites']):
                raise ValueError('USB Audio reconstruction requires unmodified, readable stock data.')
        if stock:
            loader.check_stock(sites, stock, upstream)
            from elekloader import formats
            parsed, device, original = formats.load(str(stock))
            main = formats.main_image(parsed, device)
            if device.key != 'octatrack' or original.version != '1.40C' or hashlib.sha256(main).hexdigest() != original.main_sha256:
                raise ValueError('Original Octatrack 1.40C required')
            rebuilt = bytearray(image)
            for at, address, n, digest in copies:
                start = address - device.main_load
                block = main[start:start + n]
                if start < 0 or len(block) != n or hashlib.sha256(block).digest() != digest:
                    raise ValueError('The original OS differs from the reconstruction record.')
                rebuilt[at:at + n] = block
            for at, n, value in fills:
                rebuilt[at:at + n] = bytes([value])*n
            if rebuilt != authored:
                raise ValueError('The installed image differs from the compiled module.')
    data = loader.package(image, bss, hooks, offsets, sites, name=MODULE, hashed=True, title=TITLE, abi=8,
                          copies=copies, fills=fills,
                          layout=(9 if input_port else 7) if layout is None else functions.AUDIO_LAYOUTS[layout] + 1)
    if release and stock:
        packages = load('usb_audio_package_scan', HERE.parent / 'elekloader/module_packages.py')
        scanner = load('usb_audio_image_scan', HERE.parent / 'elekloader/check_stock_free.py')
        runs = packages.runs(data, main)
        if max(runs.values(), default=0) >= packages.LIMIT or scanner.stock_runs(
                {'sections': {'package': {'parts': [['hex', data.hex()]]}}}, scanner.haystacks(stock, upstream), 16):
            raise ValueError('The USB Audio release contains a stock span.')
    return data, dict(image=len(image), bss=bss, relocations=len(offsets), sites=[hex(s[0]) for s in sites],
                      block=block_length, stock_sites=sites)


def main():
    parser = argparse.ArgumentParser(description=__doc__.split('\n\n')[0])
    parser.add_argument('-o', '--output', type=Path, required=True)
    parser.add_argument('--layout', choices=SUPPORTED, help='build a legacy single-layout comparison package')
    parser.add_argument('--cross', default='m68k-elf-')
    parser.add_argument('--stock', type=Path, help='check the three sites\' guards against this OS file')
    parser.add_argument('--upstream', type=Path, help='the Elekloader checkout --stock is read with')
    parser.add_argument('--usb-input', action='store_true', help='duplex trial package for an input-enabled base')
    parser.add_argument('--release', action='store_true', help='build from the reviewed stock reconstruction recipe')
    parser.add_argument('--capture-recipe', type=Path, help='record hash-only reconstruction data for review')
    args = parser.parse_args()
    data, facts = build(args.layout, args.cross, release=args.release, capture=args.capture_recipe, stock=args.stock, upstream=args.upstream,
                        usb_input=args.usb_input)
    if args.stock:
        if not args.upstream:
            parser.error('--stock needs --upstream')
        sys.path.insert(0, str(ROOT / 'sdk/runtime/loader'))
        import build as loader
        loader.check_stock(facts['stock_sites'], args.stock, args.upstream)
    args.output.write_bytes(data)
    print('%s: %s, %d bytes of code and data, %d of bss, %d relocations, sites %s, a %d-byte function block' % (
        args.output, args.layout or 'configurable USB Audio', facts['image'], facts['bss'], facts['relocations'], ', '.join(facts['sites']), facts['block']))


if __name__ == '__main__':
    main()
