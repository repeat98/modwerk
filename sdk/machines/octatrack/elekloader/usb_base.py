# SPDX-License-Identifier: GPL-3.0-or-later
"""The private base's own USB configuration: stock mass storage plus Modwerk's
endpoint-free vendor interface, and the EP0 glue that answers IDENTIFY.

Elekloader cannot share a stock site between packages, and a descriptor change
needs a base install anyway, so the base owns the configuration responder and
the unknown-request tail. USB MIDI and USB Audio are not combined with this
yet: they claim the same sites. The mass-storage interface is byte for byte
the one USB MIDI's hardware-proven configurations carry (descriptors.py).

Developer source recipe only; no stock bytes, firmware or device access.
"""
import hashlib
import struct
import uuid

VENDOR_CLASS, VENDOR_SUBCLASS, VENDOR_PROTOCOL = 0xff, 0x4d, 1
MSC_INTERFACE, VENDOR_INTERFACE = 0, 1
MODEL = 'OCTATRACK 1.40C'

# OS 1.40C. The responder's four `pea <configuration>` operands (stock: the
# protected tables at 0x400e201c..), the two `moveq #32` clamps it applies to
# GET_DESCRIPTOR(CONFIG / OTHER_SPEED) (12 bytes each: d1 = min(wLength, 32),
# rejoining after them), and the unknown-request STALL tail where every
# vendor request arrives (`movel ENDPTCTRL0,%d0`, rejoining at +6). Each
# detour replaces only its first 6 bytes, as USB MIDI's proven clamps do, and
# leaves the rest in place; the guard covers every stock byte it skips.
POINTERS = (
    (0x4001d882, 0x400e201c, 'modwerk_cfg_fs'),
    (0x4001d88a, 0x400e203c, 'modwerk_cfg_hs'),
    (0x4001d8c0, 0x400e207c, 'modwerk_cfg_os_hs'),
    (0x4001d8c8, 0x400e205c, 'modwerk_cfg_os_fs'),
    (0x4001d82e, 0x400e2000, 'modwerk_device'),  # GET_DESCRIPTOR(DEVICE), clamped to 18 bytes
)
# Windows binds WinUSB to the vendor interface by itself (no driver install)
# when the device reports USB 2.10 and answers BOS and the Microsoft OS 2.0
# descriptor set (ep0.c); stock's own STALL tail is where both requests land.
STOCK_DEVICE = bytes.fromhex('120100020000004035190200010001020301')  # 0x400e2000, guarded in sites()
MS_VENDOR_CODE, MS_OS_20_INDEX = 0x20, 7
INTERFACE_GUID = '{4DEA1B9D-6B51-400A-93C9-5CFFC5DF8CF1}'
WINDOWS_8_1 = 0x06030000
CLAMP_SHA256 = 'ec1f697431abb21cc32bb4399935d28cfa9032e400b7e9b6a30811a764055e52'
DETOURS = (  # address, guarded bytes, their SHA-256, shim; 6 bytes are replaced
    (0x4001d858, 12, CLAMP_SHA256, 'modwerk_usb_clamp1'),
    (0x4001d896, 12, CLAMP_SHA256, 'modwerk_usb_clamp2'),
    (0x4001de64, 6, '868378f30d4ed1251a28851782180b919dbfbd18ea839b594142244f6e06fb8a', 'modwerk_ep0_shim'),
    # The USB ISR's transfer path (`movel ENDPTSETUPSTAT,%d0`), its bus reset
    # (`jsr usb_reset; moveq #64,%d0`) and session end (`movel USBCMD,%d0`).
    (0x4001e606, 6, '2fc3d5168f6ee3ffb4b419a9cbbe48a7837d42e9e47db7bb5bced5cd13b62dc0', 'modwerk_ep0_poll_shim'),
    (0x4001e91c, 6, '78eb060ff0d9ffb4236ffdf4b3b210c34887760745a3767f657917d9ec1d58f2', 'modwerk_bus_reset_shim'),
    (0x4001e952, 6, '95d6c1eb26340f4df0419ac71e537a21277443225e26589bf5094352b48e3b29', 'modwerk_session_end_shim'),
)
# The engine's idle site, which the logger already hooks: ours runs first.
IDLE_HOOK = 'modwerk_idle_hook'
# runtime.c invalidates code caches with the OS's CACR value: the boot write
# `movel #0xa40ce000,%d0; movec %d0,%cacr` must still be stock.
CACR_GUARD = (0x40000596, 10, 'eb3f5686af1b0f58c8d27473148bd597d87905636bde18120034634ddae1f782')


def endpoint(address, size):
    return bytes([7, 5, address, 2]) + struct.pack('<H', size) + bytes([0])


def configuration(high_speed, other_speed=False):
    """One configuration descriptor; bulk endpoints are 512 bytes at high speed."""
    bulk = 512 if high_speed else 64
    body = (bytes([9, 4, MSC_INTERFACE, 0, 2, 8, 6, 0x50, 0]) + endpoint(0x81, bulk) + endpoint(0x01, bulk) +
            bytes([9, 4, VENDOR_INTERFACE, 0, 0, VENDOR_CLASS, VENDOR_SUBCLASS, VENDOR_PROTOCOL, 0]))
    return (bytes([9, 7 if other_speed else 2]) + struct.pack('<H', 9 + len(body)) +
            bytes([2, 1, 0, 0xc0, 3]) + body)


def device():
    return STOCK_DEVICE[:2] + struct.pack('<H', 0x0210) + STOCK_DEVICE[4:]


def msos20():
    """Microsoft OS 2.0 descriptor set: WinUSB and an interface GUID for the vendor function."""
    name, data = 'DeviceInterfaceGUIDs\0'.encode('utf-16-le'), (INTERFACE_GUID + '\0\0').encode('utf-16-le')
    prop = struct.pack('<HHHH', 10 + len(name) + len(data), 4, 7, len(name)) + name + struct.pack('<H', len(data)) + data
    compat = struct.pack('<HH', 20, 3) + b'WINUSB\0\0' + bytes(8)
    function = struct.pack('<HHBBH', 8, 2, VENDOR_INTERFACE, 0, 8 + len(compat) + len(prop)) + compat + prop
    config = struct.pack('<HHBBH', 8, 1, 0, 0, 8 + len(function)) + function
    return struct.pack('<HHIH', 10, 0, WINDOWS_8_1, 10 + len(config)) + config


def bos():
    platform = (bytes([28, 0x10, 5, 0]) + uuid.UUID('D8DD60DF-4589-4CC7-9CD2-659D9E648A9F').bytes_le +
                struct.pack('<IHBB', WINDOWS_8_1, len(msos20()), MS_VENDOR_CODE, 0))
    return struct.pack('<BBHB', 5, 0x0f, 5 + len(platform), 1) + platform


def tables():
    return {'modwerk_cfg_fs': configuration(False), 'modwerk_cfg_hs': configuration(True),
            'modwerk_cfg_os_fs': configuration(False, True), 'modwerk_cfg_os_hs': configuration(True, True)}


ASSEMBLY = '''| usb_base.s -- generated by sdk/machines/octatrack/elekloader/usb_base.py.
| The base's configuration descriptors, the responder's length clamps and the
| unknown-request shim that hands vendor requests to modwerk_ep0_dispatch.
    .text
    .set modwerk_cfg_len, {length}

| GET_DESCRIPTOR(CONFIG / OTHER_SPEED): the stock clamps hold 32 bytes. Each
| shim leaves d1 = min(wLength, modwerk_cfg_len) as the stock 12 bytes would
| and rejoins after them. d2 = wLength.
    .global modwerk_usb_clamp1, modwerk_usb_clamp2
modwerk_usb_clamp1:
    movel   %d2,%d1
    cmpil   #modwerk_cfg_len,%d1
    blss    1f
    movel   #modwerk_cfg_len,%d1
1:  jmp     0x4001d864
modwerk_usb_clamp2:
    movel   %d2,%d1
    cmpil   #modwerk_cfg_len,%d1
    blss    1f
    movel   #modwerk_cfg_len,%d1
1:  jmp     0x4001d8a2

| The unknown-request tail, in the USB ISR. d0 is dead here (the displaced
| instruction overwrites it); keep the other scratch registers C may use.
| modwerk_ep0_dispatch returns a length to send modwerk_ep0_reply through
| the stock send tail (jsr usb_ep0_send(len, buf); addq #8; done), as USB
| Audio's shim does; 0 for a request that is not ours, which takes the stock
| STALL (IN only); -1 to refuse one of ours; or -2 when it primed a SUBMIT
| data stage, which leaves through the stock done path with no status yet
| (modwerk_ep0_poll finishes it). A refusal stalls EP0 both ways (TXS|RXS):
| the stock IN-only stall would leave a SUBMIT data stage NAKed until the
| host gives up. The next SETUP clears both bits.
    .global modwerk_ep0_shim
modwerk_ep0_shim:
    lea     %sp@(-12),%sp
    moveml  %d1/%a0-%a1,%sp@
    jsr     modwerk_ep0_dispatch
    moveml  %sp@,%d1/%a0-%a1
    lea     %sp@(12),%sp
    tstl    %d0
    beqs    2f
    moveq   #-1,%d1
    cmpl    %d1,%d0
    beqs    3f
    moveq   #-2,%d1
    cmpl    %d1,%d0
    beqs    4f
    movel   modwerk_ep0_reply,%sp@-
    movel   %d0,%sp@-
    jmp     0x4001de5c
2:  movel   0xfc0b01c0,%d0
    jmp     0x4001de6a
3:  movel   0xfc0b01c0,%d0
    orl     #0x00010001,%d0
    movel   %d0,0xfc0b01c0
4:  jmp     0x4001de74

| The ISR's transfer path, before stock reads a new SETUP. The displaced
| instruction overwrites d0; d2 holds stock's 1 for the SETUP W1C after it.
    .global modwerk_ep0_poll_shim
modwerk_ep0_poll_shim:
    lea     %sp@(-12),%sp
    moveml  %d1/%a0-%a1,%sp@
    jsr     modwerk_ep0_poll
    moveml  %sp@,%d1/%a0-%a1
    lea     %sp@(12),%sp
    movel   0xfc0b01ac,%d0
    jmp     0x4001e60c

| Bus reset (then stock's own reset routine) and session end: both become
| the controller's disconnect, handled on the engine task.
    .global modwerk_bus_reset_shim, modwerk_session_end_shim
modwerk_bus_reset_shim:
    lea     %sp@(-16),%sp
    moveml  %d0-%d1/%a0-%a1,%sp@
    jsr     modwerk_ep0_bus_reset
    moveml  %sp@,%d0-%d1/%a0-%a1
    lea     %sp@(16),%sp
    jsr     0x4001d6b8
    moveq   #64,%d0
    jmp     0x4001e922
modwerk_session_end_shim:
    lea     %sp@(-16),%sp
    moveml  %d0-%d1/%a0-%a1,%sp@
    jsr     modwerk_ep0_bus_reset
    moveml  %sp@,%d0-%d1/%a0-%a1
    lea     %sp@(16),%sp
    movel   0xfc0b0140,%d0
    jmp     0x4001e958

| The engine's return to its receive: service the transport, then the
| logger's idle hook exactly as the site would have entered it.
    .global modwerk_idle_hook
modwerk_idle_hook:
    lea     %sp@(-60),%sp
    moveml  %d0-%d7/%a0-%a6,%sp@
    jsr     modwerk_engine_idle
    moveml  %sp@,%d0-%d7/%a0-%a6
    lea     %sp@(60),%sp
    jmp     olog_idle_hook

| One table per speed and direction. usb_ep0_send fills only the first page
| of its transfer descriptor, so 64-byte alignment keeps each in one 4 KiB page.
'''


def assembly():
    blobs = tables()
    lengths = {len(blob) for blob in blobs.values()}
    if len(lengths) != 1 or max(lengths) > 64:
        raise ValueError('The four configurations must share one length within one 64-byte slot.')
    text = ASSEMBLY.format(length=lengths.pop())
    blobs.update(modwerk_device=device(), modwerk_bos=bos(), modwerk_msos20=msos20())
    for name, blob in blobs.items():
        text += '    .balign 64\n    .global %s\n%s:\n    .byte %s\n' % (name, name, ', '.join('0x%02x' % b for b in blob))
    return text


def header():
    return ('/* Generated by usb_base.py: the vendor interface this base declares. */\n'
            '#define MODWERK_VENDOR_INTERFACE %du\n#define MODWERK_MODEL "%s"\n'
            '#define MODWERK_MS_VENDOR_CODE %du\n#define MODWERK_MS_OS_20_INDEX %du\n'
            '#define MODWERK_BOS_BYTES %du\n#define MODWERK_MSOS20_BYTES %du\n'
            'extern const uint8_t modwerk_bos[], modwerk_msos20[];\n'
            % (VENDOR_INTERFACE, MODEL, MS_VENDOR_CODE, MS_OS_20_INDEX, len(bos()), len(msos20())))


def sites(image_at):
    """Elekloader sites after checking every stock span this base replaces, skips or relies on."""
    addr, length, digest = CACR_GUARD
    if hashlib.sha256(image_at(addr, length)).hexdigest() != digest:
        raise ValueError('The OS cache configuration at 0x%08x is not stock.' % addr)
    if image_at(0x400e2000, len(STOCK_DEVICE)) != STOCK_DEVICE:
        raise ValueError('The stock device descriptor changed; review device().')
    out = []
    for addr, expected, symbol in POINTERS:
        stock = image_at(addr, 4)
        if stock != expected.to_bytes(4, 'big'):
            raise ValueError('USB configuration pointer at 0x%08x is not stock.' % addr)
        out.append(dict(addr=hex(addr), stock=stock.hex(), op='ptr', target=symbol))
    for addr, length, digest, symbol in DETOURS:
        if hashlib.sha256(image_at(addr, length)).hexdigest() != digest:
            raise ValueError('USB site at 0x%08x is not stock.' % addr)
        out.append(dict(addr=hex(addr), stock=image_at(addr, 6).hex(), op='jmp', target=symbol))
    return out
