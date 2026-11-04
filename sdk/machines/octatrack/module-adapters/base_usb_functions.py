# SPDX-License-Identifier: GPL-3.0-or-later
"""Private base-owned USB composition, using the existing authored functions.

The vendor function keeps interface 1. MIDI moves to 2/3 and optional audio
to 4/5, with endpoint numbers, class entities and speed-specific packets
unchanged. This is preparation, not hot module or public base admission.
"""
import hashlib
import struct

AUDIO_LAYOUTS = {
    'USB AUDIO OUT TRACKS MAIN CUE': 0,
    'USB AUDIO OUT TRACKS': 1,
    'USB AUDIO OUT MASTER': 2,
    'USB AUDIO OUT MAIN CUE': 3,
    'USB AUDIO OUT MAIN': 4,
    'USB AUDIO OUT TRACKS POST': 5,
}
MIDI_IAD = bytes([8, 11, 1, 2, 1, 0, 0, 0])
# These are the existing USB MIDI manifest's guarded, non-shared sites. The
# base owns ISR, configuration pointers/clamps, reset and the EP0 responder.
MIDI_DETOURS = (
    (0x4001d9ca, 6, '65ff3635f24fa02328d135abf8590188c4ae5f1a399f6747c196a9f1c8b4f2db', 'usbmidi_rx_setcfg_shim'),
    (0x40010bc8, 8, 'ba7573adceae0b4d98e7fca043628b41525f9bf3ec50663e051c89a57a79cb35', 'usbmidi_send_shim'),
    (0x400108b0, 6, '48904c9ab44972c2a8aad8d9544735e58fe9a7e98b8ad8ddbff57f5abc16274b', 'usbmidi_prio_shim'),
    (0x4001daec, 6, 'effa769bdedb0e393f0b05f3920eb7cc91977b77c87f424480b99748334893aa', 'usbmidi_clrfeat_shim'),
)


def records(data):
    """Parse complete authored descriptor records; never repair invalid input."""
    if not isinstance(data, bytes) or len(data) > 4095:
        raise ValueError('USB descriptors must be bounded authored bytes.')
    offset = 0
    while offset < len(data):
        if len(data) - offset < 2 or data[offset] < 2 or data[offset] > len(data) - offset:
            raise ValueError('An authored USB descriptor is incomplete.')
        yield data[offset:offset + data[offset]]
        offset += data[offset]


def configuration(base, descriptors, high_speed, other_speed=False, audio=None):
    """Join MSC/vendor/MIDI and an explicitly chosen, output-only audio layout.

    `base` and `descriptors` are trusted modules from the same pinned repository
    snapshot. The caller records source identities and keeps generated output
    private. USB MIDI is always the declared dependency of an audio function.
    """
    if type(high_speed) is not bool or type(other_speed) is not bool or audio is not None and audio not in AUDIO_LAYOUTS:
        raise ValueError('Choose an explicit supported USB output layout and speed.')
    original = descriptors.audio_config(high_speed, other_speed, audio, with_in=None) if audio else descriptors.midi_config(high_speed, other_speed)
    source = list(records(original))
    native_base = list(records(base.configuration(high_speed, other_speed, False)))
    if (not source or source[0][:2] != bytes([9, 7 if other_speed else 2])
            or struct.unpack_from('<H', source[0], 2)[0] != len(original)
            or source[0][4] != (5 if audio else 3)
            or len(native_base) != 5 or native_base[-1] != bytes([9, 4, 1, 0, 0, 255, 77, 1, 0])
            or source[1:4] != native_base[1:4]):
        raise ValueError('The shared MSC or vendor descriptor contract changed.')
    body = list(source[1:4]) + [native_base[-1]]
    tail = source[4:]
    if audio:
        if tail[0] != MIDI_IAD:
            raise ValueError('The authored MIDI function association changed.')
    else:
        tail.insert(0, MIDI_IAD)
    current = None
    interfaces = set()
    associations = []
    for record in tail:
        value = bytearray(record)
        if value[1] == 11:
            if len(value) != 8 or value[2] not in (1, 3) or value[3] != 2:
                raise ValueError('An unreviewed USB association was added.')
            value[2] += 1
            associations.append(value[2])
        elif value[1] == 4:
            if len(value) != 9 or value[2] not in range(1, 5 if audio else 3):
                raise ValueError('An unreviewed USB interface was added.')
            current = value[2]
            interfaces.add(current)
            value[2] += 1
        elif value[1] == 0x24 and current == 1:
            if record != bytes([9, 0x24, 1, 0, 1, 9, 0, 1, 2]):
                raise ValueError('The authored MIDI collection reference changed.')
            value[8] = 3
        body.append(bytes(value))
    if interfaces != set(range(1, 5 if audio else 3)) or associations != ([2, 4] if audio else [2]):
        raise ValueError('The composed USB functions are incomplete.')
    body = b''.join(body)
    header = bytearray(source[0])
    struct.pack_into('<H', header, 2, 9 + len(body))
    header[4] += 1
    return bytes(header) + body


def audio_source(text):
    """Only interface constants change; the authored audio implementation stays."""
    for name, original, updated in [('UAC2_AC_IFACE', 3, 4), ('UAC2_AS_IFACE', 4, 5)]:
        before = '.set %s,  %d ' % (name, original)
        if text.count(before) != 1:
            raise ValueError('The authored audio interface declaration changed.')
        text = text.replace(before, '.set %s,  %d ' % (name, updated))
    return text



def packet_readiness(text):
    """Fence the 20-channel packet reader behind its delayed MAIN/CUE writes.

    The raw producer counter and card implementation stay unchanged.
    Counter subtraction is modulo 2**32, including a running stream's wrap.
    """
    for declaration in ('.set MAIN_CUE_LAG_BLOCKS, 1', '.set CUE_MASTER_LAG_BLOCKS,  2'):
        if text.count(declaration) != 1:
            raise ValueError('USB profile producer lag changed; review packet and startup bounds.')
    seam = 'audio_cushion_zero:\n'
    if text.count(seam) != 1:
        raise ValueError('USB profile cushion seam changed.')
    packet, cushion = text.split(seam)
    read = '    movel   aud_produced,%d0'
    zero = '    moveq   #AUD_TARGET-1,%d1'
    start = '0:  subil   #AUD_TARGET,%d0'
    if packet.count(read) != 3 or cushion.count(zero) != 1 or cushion.count(start) != 1:
        raise ValueError('USB profile readiness seams changed.')
    packet = packet.replace(read, '    MW_AUDIO_READY')
    # A master CUE write can land up to two blocks ahead of the current
    # cursor. Clear that bounded fresh-start gap as well as the cushion.
    # The HS reader starts one block earlier after applying its watermark.
    cushion = cushion.replace(start, '''0:
.if USB_LAYOUT == LAYOUT_TRACKS_MAIN_CUE
    subil   #AUD_TARGET+16,%d0
.else
    subil   #AUD_TARGET,%d0
.endif''')
    cushion = cushion.replace(zero, '''.if USB_LAYOUT == LAYOUT_TRACKS_MAIN_CUE
    moveq   #AUD_TARGET+16+32-1,%d1
.elseif USB_LAYOUT == LAYOUT_MAIN_CUE
    moveq   #AUD_TARGET+32-1,%d1
.else
    moveq   #AUD_TARGET-1,%d1
.endif''')
    macro = '''
| Packet-side watermark only: MAIN/CUE trail the tracks by one block at HS.
.macro MW_AUDIO_READY
    movel   aud_produced,%d0
.if USB_LAYOUT == LAYOUT_TRACKS_MAIN_CUE
    tstb    aud_hs
    beq     97f
    subil   #16*MAIN_CUE_LAG_BLOCKS,%d0
97:
.endif
.endm
'''
    return macro + packet + seam + cushion


def midi_source(text):
    """The MIDI ISR delegates its stock tail to the base's vendor poll owner."""
    before = '    jmp     0x4001e60c'
    if text.count(before) != 1:
        raise ValueError('The authored MIDI ISR continuation changed.')
    return text.replace(before, '    jmp     modwerk_ep0_poll_shim')


# The UART0 ISR (0x400106ec) stamps each DIN 0xF8 into CLK_T and the delta into CLK_DT, as the receiver stamps a USB
# one, and both feed one FIFO, framer and clock handler (0x40005a48): with a clock on each the handler reads double the
# tempo, the project saves it, and the sequencer steps on both. mw_usb_clk_stamp is the receiver's last stamp, so a
# CLK_T that differs from it is DIN's. DIN owns the clock while its last tick is younger than the handler's resync gap
# (1,881,600 DTCN0 counts, 167 ms: cmpil at 0x40005a96); a longer gap restarts the handler's ring, so the first USB
# tick taken after DIN stops starts a fresh tempo.
CLOCK_GUARD = '''
| ---- USB clock gives way to DIN clock (Modwerk, base_usb_functions.py) -----
| mw_usb_clock_yields: a2 = the event, at SR 0x2700. Z clear (d0 = 1) when it
| is clock, start, continue, stop or song position and DIN is clocking: the
| event is then dropped and counted. Uses d0-d1.
.set MW_CLOCK_GAP,  1881600         | DTCN0 counts: the clock handler's resync gap
.set MW_CLOCK_SYNC, 0x1d04          | bit (status - 0xF0) for F2, F8, FA, FB, FC
    .global mw_usb_clock_dropped
mw_usb_clock_yields:
    mvzb    %a2@(1),%d1
    subil   #0xf0,%d1
    bcss    9f                      | below 0xF0: not a system message
    movel   #MW_CLOCK_SYNC,%d0
    btst    %d1,%d0
    beqs    9f
    movel   CLK_T,%d0
    cmpl    mw_usb_clk_stamp,%d0
    beqs    9f                      | the last tick stamped was USB's (or none)
    movel   DTCN0,%d1
    subl    %d0,%d1                 | age of DIN's last tick, modulo 2^32
    cmpil   #MW_CLOCK_GAP,%d1
    bcss    8f
    movel   %d0,mw_usb_clk_stamp    | DIN stopped: a DTCN0 wrap must not make its old tick young again
9:  moveq   #0,%d0
    rts
8:  addql   #1,mw_usb_clock_dropped
    moveq   #1,%d0
    rts
    .balign 4
mw_usb_clk_stamp:     .long 0       | DTCN0 at the last 0xF8 the receiver stamped
mw_usb_clock_dropped: .long 0       | USB events dropped while DIN clocked
'''


def receiver_source(text):
    """The shared USB MIDI receiver, with USB clock and transport giving way while DIN clocks. The import stays exact."""
    stamp, fits = '    movel   %d1,CLK_T\n', '6:  moveq   #0,%d2\n'
    if text.count(stamp) != 1 or text.count(fits) != 1 or 'mw_usb_' in text:
        raise ValueError('The authored USB MIDI receiver changed; review the DIN clock guard.')
    text = text.replace(stamp, stamp + '    movel   %d1,mw_usb_clk_stamp\n')
    return text.replace(fits, '''6:  bsrw    mw_usb_clock_yields
    beqs    10f
    movew   %d5,%sr                 | DIN is clocking: drop the event
    bras    5f
10: moveq   #0,%d2
''') + CLOCK_GUARD


def audio_include(key):
    if key not in AUDIO_LAYOUTS:
        raise ValueError('Choose an explicit supported USB output layout.')
    return '| base-owned USB output, without an input function\n.set USB_LAYOUT, %d\n.set USB_IN, 0\n' % AUDIO_LAYOUTS[key]


DMA_BLOCK_SHA256 = {
    '0cef06f0a138ebb8026a3bad9a847a0befac64d0da961561f3fe8fe3c5ebf35c',
    '3eaf6de20d102ef734621d904b480d7fbb5efb10d1fed13fc823e892ce0f37e3',  # licensed selected-layout source's trailing alignment
}


def audio_storage_source(text):
    """Move only authored zero rings and EP3 DMA buffers to base-cleared BSS for bounded RAM boot.

    The exact zero-only source blocks are guarded. Initial state and the UAC2
    replies EP0 sends remain in data; no buffer size, layout or initialization changes.
    A fresh native link resolves every ring reference at its new address.
    """
    before, after = '.if SLOT8_LAYOUT\naud_ring:', 'usbaudio_alt:'
    if text.count(before) != 1 or text.count(after) != 1:
        raise ValueError('The authored audio ring allocation changed.')
    start, end = text.index(before), text.index(after)
    if end <= start or hashlib.sha256(text[start:end].encode()).hexdigest() != 'c49848cdec9742ad5f730deb34bf70e609e3578b33bc6dc32f5f7318a4882c73':
        raise ValueError('The authored zero-only audio ring block changed.')
    text = text[:start] + '    .bss\n    .balign 4\n' + text[start:end] + '    .data\n' + text[end:]
    # The EP3 dTDs and packets the controller DMAs: reached only through the uncached alias, which the boot clear
    # also writes, and audio_dtds_clear zeroes the dTDs at every EP3 start and stop. Same size, alignment and order.
    dma = '    .balign 32\naud_dtds:'
    if text.count(dma) != 1 or hashlib.sha256(text[text.index(dma):].encode()).hexdigest() not in DMA_BLOCK_SHA256:
        raise ValueError('The authored zero-only audio DMA block changed.')
    return text.replace(dma, '    .bss\n' + dma)


def assembly(base, descriptors, audio=None):
    """One ISR chain and page-contained tables, including a 259-byte config.

    Audio -> bounded MIDI receive -> MIDI transmit -> vendor EP0 poll -> stock.
    Without audio the same chain starts at MIDI receive. Each configuration
    fits wholly in a page; alignment grows with its length rather than using
    the old development base's 256-byte limit.
    """
    blobs = {name: configuration(base, descriptors, high, other, audio)
             for name, high, other in [('modwerk_cfg_fs', False, False),
                                      ('modwerk_cfg_hs', True, False),
                                      ('modwerk_cfg_os_fs', False, True),
                                      ('modwerk_cfg_os_hs', True, True)]}
    lengths = {len(blob) for blob in blobs.values()}
    if len(lengths) != 1:
        raise ValueError('USB configurations must share a single guarded clamp length.')
    # These sites belong to the base once. End MIDI's old session before
    # the audio/stock reset tails; SET_CONFIGURATION also flushes EP2 before
    # its queue heads are rewritten. Neither endpoint may retain old traffic.
    tails = dict(base.AUDIO_TAILS if audio else base.STOCK_TAILS)
    if audio:
        for name in ('reset_tail', 'session_end_tail'):
            tails[name] = 'jsr     usbmidi_rx_bus_end\n    ' + tails[name]
    else:
        tails.update(reset_tail='jmp     usbmidi_rx_reset_shim',
                     session_end_tail='jmp     usbmidi_rx_sessend_shim')
    text = base.ASSEMBLY.format(length=lengths.pop(), **tails)
    blobs.update(modwerk_device=base.device(True), modwerk_bos=base.bos(), modwerk_msos20=base.msos20())
    for name, blob in blobs.items():
        alignment = max(64, 1 << (len(blob) - 1).bit_length())
        if alignment > 4096:
            raise ValueError('A USB table would cross its transfer descriptor page.')
        text += '    .balign %d\n    .global %s\n%s:\n    .byte %s\n' % (
            alignment, name, name, ', '.join('0x%02x' % byte for byte in blob))
    return text


def sites(base, image_at, audio=None):
    """Guard the original sites once and reject overlapping ownership.

    Returned stock spans are private build inputs, never publication data.
    The receive SET_CONFIGURATION shim selects the bounded high-speed receive
    path; its tail runs the unchanged authored endpoint initialization.
    """
    if audio is not None and audio not in AUDIO_LAYOUTS:
        raise ValueError('Choose an explicit supported USB output layout.')
    out = base.sites(image_at, bool(audio))
    isr = [site for site in out if int(site['addr'], 16) == 0x4001e606]
    if len(isr) != 1 or isr[0]['target'] != ('audio_isr_shim' if audio else 'modwerk_ep0_poll_shim'):
        raise ValueError('The base USB ISR ownership contract changed.')
    if not audio:
        isr[0]['target'] = 'usbmidi_rx_isr_shim'
    for address, length, digest, target in MIDI_DETOURS:
        stock = image_at(address, length)
        if len(stock) != length or hashlib.sha256(stock).hexdigest() != digest:
            raise ValueError('USB MIDI site at %#x is not the guarded native source.' % address)
        out.append(dict(addr=hex(address), stock=stock.hex(), op='jmp', target=target))
    spans = sorted((int(site['addr'], 16), len(bytes.fromhex(site['stock']))) for site in out)
    if any(address + size > following for (address, size), (following, _) in zip(spans, spans[1:])):
        raise ValueError('USB functions claim overlapping base sites.')
    return out
