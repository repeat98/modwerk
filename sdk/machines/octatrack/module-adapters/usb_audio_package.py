#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""USB Audio as a runtime package: the authored producer on a base that takes a module's USB function.

    python3 -B sdk/machines/octatrack/module-adapters/usb_audio_package.py -o usb-audio.mwrm \\
        [--layout 'USB AUDIO OUT TRACKS MAIN CUE'] [--stock OS.bin --upstream ELEKLOADER]

Development only: emulator evidence, never run on a unit. The package holds no stock bytes (its three stock
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
- its transfer descriptors are aligned at run time: a package's image sits at a 16-byte boundary of the pool, and
  the controller needs 32;
- USB AUDIO OUT TRACKS POST takes its gain curve as the computed quarter sine (owner, 20 November 2026), not as
  the stock DSP table a linked base reads from the owner's OS: a package carries no stock data. The stock table
  is that sine to within 64 of 2^23 (usb_post.py refuses any other), so a stem's level differs from a linked
  base's by at most that.
"""
import argparse
import hashlib
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


def function_block(functions, usb, descriptors, layout, high_speed, other_speed):
    """The audio function's descriptors as they follow the base's own in a composed configuration."""
    without = functions.configuration(usb, descriptors, high_speed, other_speed, None)
    whole = functions.configuration(usb, descriptors, high_speed, other_speed, layout)
    block = whole[len(without):]
    if (whole[9:len(without)] != without[9:] or whole[4] != without[4] + 2
            or struct.unpack_from('<H', whole, 2)[0] != len(whole) or not block or block[1] != 11 or block[2] != 4):
        raise ValueError('The audio function no longer follows the base\'s own interfaces as one block.')
    return block


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
    text = functions.audio_storage_source(text)
    text = once(text, '    .include "remix.inc"', include, 'its include')
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
    bnes    .Lmw_class
    mvzb    SETUP_BREQ,%d0
    cmpil   #0x55,%d0
    bne     .Lmw_no
    lea     usbaudio_consumed,%a0
    moveq   #60,%d0
    bra     .Lmw_send
.Lmw_class:
    cmpil   #0xa1,%d0               | class GET, interface recipient
    bne     .Lmw_no
    mvzb    SETUP_IFACE,%d0
    cmpil   #UAC2_AC_IFACE,%d0
    bne     .Lmw_no
    mvzb    SETUP_WIDXH,%d0
    cmpil   #UAC2_CLOCK_ID,%d0
    bne     .Lmw_no
    mvzb    SETUP_WVALH,%d0         | control selector
    mvzb    SETUP_BREQ,%d1          | 1 = CUR, 2 = RANGE
    cmpil   #1,%d0                  | CS_SAM_FREQ_CONTROL
    beqs    .Lmw_freq
    cmpil   #2,%d0                  | CS_CLOCK_VALID_CONTROL
    bne     .Lmw_no
    cmpil   #1,%d1
    bne     .Lmw_no
    lea     uac2_clock_valid,%a0
    moveq   #1,%d0
    bras    .Lmw_send
.Lmw_freq:
    cmpil   #1,%d1
    bnes    .Lmw_range
    lea     uac2_freq_cur,%a0
    moveq   #4,%d0
    bras    .Lmw_send
.Lmw_range:
    cmpil   #2,%d1
    bne     .Lmw_no
    lea     uac2_freq_range,%a0
    moveq   #14,%d0
.Lmw_send:
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
.Lmw_no:
    moveq   #0,%d0
    rts
    .size mwua_control, .-mwua_control

    .data
    .balign 4
    .global mwua_function, mwua_dtds
mwua_dtds:  .long 0                 | the transfer descriptors, at their 32-byte boundary (uncached alias)
'''


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


def build(layout, cross='m68k-elf-'):
    if layout not in SUPPORTED:
        raise ValueError('Not built as a package yet: ' + layout)
    sys.path.insert(0, str(ROOT / 'sdk/runtime/loader'))
    import build as loader
    usb = load('modwerk_usb_base', ROOT / 'sdk/machines/octatrack/elekloader/usb_base.py')
    functions = load('modwerk_base_usb_functions', HERE / 'base_usb_functions.py')
    descriptors = load('modwerk_authored_usb_descriptors', usb.audio_paths(layout)[1])
    blocks = [function_block(functions, usb, descriptors, layout, hs, other)
              for hs, other in ((False, False), (True, False), (False, True), (True, True))]
    text = source(functions, usb, layout) + record(blocks)
    with tempfile.TemporaryDirectory() as tmp:
        tmp = Path(tmp)
        (tmp / 'usbaudio.s').write_text(text)
        subprocess.run([cross + 'as', '-mcpu=54455', '--defsym', 'MW_USB_EP0_SEND=%#x' % USB_EP0_SEND,
                        str(tmp / 'usbaudio.s'), '-o', str(tmp / 'usbaudio.o')], check=True)
        image, symbols, bss, offsets = loader.link_units([tmp / 'usbaudio.o'], cross, 0, tmp, anywhere=True)
    sites = []
    for address, stock, shim in usb.AUDIO_DETOURS:
        if shim == 'audio_frame_shim':  # the base's own site on a base with function slots: ev_usb_frame
            continue
        code = loader.OPCODES['jmp'] + struct.pack('>I', symbols[shim])
        sites.append((address, hashlib.sha256(bytes.fromhex(stock)).digest(), code, [2], 0, len(stock) // 2))
    if len(sites) != 3:
        raise ValueError('USB Audio\'s own stock sites changed.')
    loader.unevented(sites)
    entries = [dict(event='ot_usb_functions', fn='mwua_function', order=50), dict(event='ev_usb_isr', fn='mwua_isr', order=50),
               dict(event='ev_usb_bus_end', fn='mwua_bus_end', order=50), dict(event='ev_usb_control', fn='mwua_control', order=50),
               dict(event='ev_usb_frame', fn='mwua_frame', order=50)]
    hooks = loader.subscribe([loader.NONE] * len(loader.HANDLERS), entries, symbols)
    data = loader.package(image, bss, hooks, offsets, sites, name=MODULE, hashed=True, title=TITLE, abi=8)
    return data, dict(image=len(image), bss=bss, relocations=len(offsets), sites=[hex(s[0]) for s in sites],
                      block=len(blocks[0]), stock_sites=sites)


def main():
    parser = argparse.ArgumentParser(description=__doc__.split('\n\n')[0])
    parser.add_argument('-o', '--output', type=Path, required=True)
    parser.add_argument('--layout', default=SUPPORTED[0])
    parser.add_argument('--cross', default='m68k-elf-')
    parser.add_argument('--stock', type=Path, help='check the three sites\' guards against this OS file')
    parser.add_argument('--upstream', type=Path, help='the Elekloader checkout --stock is read with')
    args = parser.parse_args()
    data, facts = build(args.layout, args.cross)
    if args.stock:
        if not args.upstream:
            parser.error('--stock needs --upstream')
        sys.path.insert(0, str(ROOT / 'sdk/runtime/loader'))
        import build as loader
        loader.check_stock(facts['stock_sites'], args.stock, args.upstream)
    args.output.write_bytes(data)
    print('%s: %s, %d bytes of code and data, %d of bss, %d relocations, sites %s, a %d-byte function block' % (
        args.output, args.layout, facts['image'], facts['bss'], facts['relocations'], ', '.join(facts['sites']), facts['block']))


if __name__ == '__main__':
    main()
