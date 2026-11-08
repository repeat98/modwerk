# SPDX-License-Identifier: GPL-3.0-or-later
"""The .syx wire format of Elektron OS updates: Modwerk's own implementation.

An update is a start framing message, numbered 128-byte data messages and an end framing message. Each data message
carries 101 stream bytes, 8-in-7 encoded, and a 7-bit checksum keyed by byte 8 of the start framing.
"""
import struct

MFR = b'\x00\x20\x3c'
FIRST_COUNTER = 242
CHUNK_SIZE = 101

_LOW7 = bytes(b & 0x7F for b in range(256))
_TOP = bytes(0x31 if b & 0x80 else 0x30 for b in range(256))  # ASCII '1' / '0'
_KEYS = {}


def encode_8in7(data):
    """Groups of 7: a marker byte holding the group's bit 7s (byte j at bit 6 - j), then the bytes, bit 7 cleared."""
    data = bytes(data)
    out = bytearray()
    for at in range(0, len(data), 7):
        group = data[at:at + 7]
        out.append(int(group.translate(_TOP).ljust(7, b'0'), 2))
        out += group.translate(_LOW7)
    return bytes(out)


def content_checksum(container):
    """Sum of (i XOR word_i) over the complete big-endian words, i counted from 1, modulo 2^32."""
    n = len(container) // 4
    words = struct.unpack_from('>%dI' % n, container, 0)
    return sum(i ^ w for i, w in enumerate(words, 1)) & 0xFFFFFFFF


def packet_checksum(body, k):
    """(k + sum of body[6 + i] XOR (i + k), i = 0..118) AND 0x7F: the counter and payload bytes of a data message."""
    if len(body) < 125:
        raise IndexError('index out of range')
    keys = _KEYS.get(k)
    if keys is None:
        # only the low 7 bits of each term reach the result, so XOR whole runs as integers
        keys = _KEYS[k] = int.from_bytes(bytes((i + k) & 0x7F for i in range(119)), 'big')
    mixed = int.from_bytes(bytes(body[6:125]), 'big') ^ keys
    return (k + sum(mixed.to_bytes(119, 'big'))) & 0x7F


def _framing(message, m):
    """The framing message rebuilt as F0, its inner bytes with the message count at 12..14, F7."""
    inner = bytearray(message[1:-1])
    inner[11], inner[12], inner[13] = (m >> 14) & 0x7F, (m >> 7) & 0x7F, m & 0x7F
    return b'\xf0' + bytes(inner) + b'\xf7'


def encode_syx(stream, device_id, framing_start, framing_end, checksum=None):
    """The whole .syx: patched start framing, one data message per 101 stream bytes, patched end framing."""
    k = framing_start[8]
    if checksum is None:
        checksum = lambda body: packet_checksum(body, k)  # noqa: E731
    stream = bytes(stream)
    m = -(-len(stream) // CHUNK_SIZE)
    out = bytearray(_framing(framing_start, m))
    if m:
        head = MFR + bytes([device_id, 0x00, 0x7E])
        for t in range(m):
            c = FIRST_COUNTER + t
            chunk = stream[CHUNK_SIZE * t:CHUNK_SIZE * (t + 1)].ljust(CHUNK_SIZE, b'\0')
            body = head + bytes(((c >> 14) & 0x7F, (c >> 7) & 0x7F, c & 0x7F)) + encode_8in7(chunk)
            out += b'\xf0' + body + bytes([checksum(body)]) + b'\xf7'
    out += _framing(framing_end, m)
    return bytes(out)
