# SPDX-License-Identifier: GPL-3.0-or-later
"""Depacker for the LZ sections of Elektron OS images (ELE3/ELEK main sections): Modwerk's own implementation.

The stream mixes control bits, taken most significant first from tag bytes fetched as they are needed, with whole
payload bytes. A 1 bit is a literal byte; a 0 bit starts a match: an offset (or the last offset again) and a length,
both partly Elias-gamma coded. A section is a u32 stream length, a u32 byte sum (not checked) and the stream.
"""
import struct

BIAS = 767   # added to an offset before it is coded; a coded offset of exactly BIAS ends the stream
REUSE = 2    # the offset gamma value meaning "the previous offset"
FAR = 3328   # offsets above this code their length one shorter


class Bits:
    """Reads bytes and control bits from d[p:end]."""

    def __init__(self, data, pos, end):
        self.d, self.p, self.end = data, pos, end
        self.tag = 0  # the remaining tag bits followed by a 1 marker; 0 or the marker alone means empty

    def byte(self):
        if self.p >= self.end:
            raise EOFError
        b = self.d[self.p]
        self.p += 1
        return b

    def bit(self):
        if not self.tag & 0xFF:
            self.tag = self.byte() << 1 | 1
        self.tag <<= 1
        b = self.tag >> 9 & 1
        self.tag &= 0x1FF
        return b

    def gamma(self):
        v = 1
        while True:
            v = v << 1 | self.bit()
            if self.bit():
                return v
            if v > 0x2000000:
                raise ValueError('gamma overflow')


def depack(data, pos, end):
    """Depack the stream at data[pos:end]; returns the output and the index just after the end marker."""
    s = Bits(data, pos, end)
    bit, byte, gamma = s.bit, s.byte, s.gamma
    out = bytearray()
    last = 1
    while True:
        if bit():
            out.append(byte())
            continue
        g = gamma()
        if g == REUSE:
            off = last
        else:
            raw = (g << 8) + byte() & 0xFFFFFFFF
            if raw == BIAS:
                return bytes(out), s.p
            off = last = (raw - BIAS) & 0xFFFFFFFF
        count = bit() << 1
        count = (count | bit()) or gamma() + 2
        if off > FAR:
            count += 1
        if off == 0 or off > len(out):
            raise ValueError('offset %d outside %d bytes of output' % (off, len(out)))
        count += 1
        start = len(out) - off
        if count <= off:
            out += out[start:start + count]
        else:
            run = out[start:]
            out += (run * (count // off + 1))[:count]


def depack_section(stream):
    """Depack a whole section; refuses a stream whose end marker is not exactly at its declared end."""
    length, = struct.unpack_from('>I', stream, 0)
    out, p = depack(stream, 8, 8 + length)
    if p != 8 + length:
        raise ValueError('end marker at %d of %d stream bytes' % (p - 8, length))
    return out
