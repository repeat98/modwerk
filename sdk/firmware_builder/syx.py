# SPDX-License-Identifier: GPL-3.0-or-later
"""ELE3 OS files (.syx): parse, rebuild with a new main OS, verify.

Rebuilding changes exactly one thing, the stored bytes of the main OS section. Every other section's stored bytes,
the ELE3 header (apart from its 4-character version field) and the framing messages (apart from their message
count) come from the stock file. Sections start where stock's first one does and are each padded to 16 bytes; the
preamble's length is the 16-aligned end of the last section; the last 101-byte data chunk is zero-padded. Given a
stock file's own main OS stream, write() reproduces that file byte for byte.

A sealed device (trailer 'hmac') appends a 32-byte HMAC-SHA256 of everything before it, inside the preamble's
length. Its key is derived from the stock file's own bootstrap, as the device derives it (seal_key).

verify() reads an output back with the decoder and refuses it unless every other section is stock and the main OS
unpacks, in place as the bootloader does it, to the expected image.
"""
import hashlib
import hmac
import struct

from .codec import aplib, elz, transport

COUNT_OFF, TABLE_OFF, ENTRY_SZ = 0x1C, 0x20, 16
DIGEST = 32                       # bytes of a sealed device's HMAC-SHA256 trailer
CHUNK = transport.CHUNK_SIZE      # decoded bytes per data message
FIRST_COUNTER = transport.FIRST_COUNTER


class SyxError(ValueError):
    pass


def sha(b):
    return hashlib.sha256(b).hexdigest()


def _messages(raw):
    """Split a .syx into its F0 ... F7 messages."""
    found, at = [], 0
    while at < len(raw):
        if raw[at] != 0xF0:
            raise SyxError('byte %d is not F0' % at)
        end = raw.find(b'\xf7', at)
        if end < 0:
            raise SyxError('message at %d has no F7' % at)
        found.append(raw[at:end + 1])
        at = end + 1
    return found


def _decode(msgs):
    """Data messages -> their decoded stream (8-in-7 groups: a byte of high bits, then up to 7 bytes)."""
    out = bytearray()
    for msg in msgs:
        payload = msg[10:126]
        k = 0
        while k < len(payload):
            highs = payload[k]
            k += 1
            for bit in range(7):
                if k >= len(payload):
                    break
                out.append(payload[k] | (0x80 if highs >> (6 - bit) & 1 else 0))
                k += 1
    return bytes(out)


def classify(raw):
    """Stored section bytes -> 'packed', 'raw-header' or 'raw'."""
    if len(raw) >= 8:
        length, total = struct.unpack_from('>II', raw, 0)
    else:
        length, total = 0, 1
    if length + 8 <= len(raw) and sum(raw[8:8 + length]) & 0xFFFFFFFF == total:
        return 'packed'
    if len(raw) >= 8 and total == 0:
        return 'raw-header'
    return 'raw'


def unstore(raw):
    """Stored section bytes -> the section's contents."""
    kind = classify(raw)
    if kind == 'packed':
        return elz.depack_section(raw)
    return bytes(raw[8:]) if kind == 'raw-header' else bytes(raw)


class Syx:
    """A parsed ELE3 OS file, from its bytes."""

    def __init__(self, raw):
        self.raw = bytes(raw)
        self.sha256 = sha(self.raw)
        msgs = _messages(self.raw)
        if len(msgs) < 3 or len(msgs[0]) != 16 or len(msgs[-1]) != 16:
            raise SyxError('no 16-byte framing messages at both ends')
        self.framing = (msgs[0], msgs[-1])
        self.data = msgs[1:-1]
        if any(len(m) != 128 for m in self.data):
            raise SyxError('a data message is not 128 bytes')
        if any(m[1:4] != transport.MFR for m in msgs):
            raise SyxError('manufacturer id is not Elektron')
        self.device_id = msgs[0][4]
        self.k = msgs[0][8]                     # the transfer constant of the packet checksums
        stream = _decode(self.data)
        self.total, self.checksum = struct.unpack_from('>II', stream, 0)
        if stream[8:12] != b'ELE3' or 8 + self.total > len(stream):
            raise SyxError('no ELE3 container')
        self.container = stream[8:8 + self.total]
        self.tail = stream[8 + self.total:]     # the padding of the last chunk
        self.header = self.container[:COUNT_OFF]
        self._read_table()

    def _read_table(self):
        n = struct.unpack_from('>I', self.container, COUNT_OFF)[0]
        if not 0 < n <= 16 or TABLE_OFF + n * ENTRY_SZ > self.total:
            raise SyxError('%d sections: not a table this container can hold' % n)
        self.table = [struct.unpack_from('>IIII', self.container, TABLE_OFF + ENTRY_SZ * i) for i in range(n)]
        self.data_start = min(entry[1] for entry in self.table)    # the sections follow the table from here
        if TABLE_OFF + n * ENTRY_SZ > self.data_start:
            raise SyxError('%d sections do not fit the table' % n)
        self.stored = {}
        for sid, off, clen, _dest in self.table:
            if sid in self.stored or off + clen > self.total:
                raise SyxError('section %d: duplicate or outside the container' % sid)
            self.stored[sid] = self.container[off:off + clen]

    @classmethod
    def load(cls, path):
        with open(path, 'rb') as fh:
            return cls(fh.read())

    @property
    def version_at(self):
        from .devices import version_at
        return version_at(self.device_id)

    @property
    def version(self):
        at = self.version_at
        return self.header[at:at + 4].decode('ascii', 'replace')

    def section(self, sid):
        """A section's contents, unpacked."""
        return unstore(self.stored[sid])


def pack_main(image):
    """A main OS image -> its stored section, zero-padded to a multiple of 4 as stock stores packed sections (the
    table's length counts the padding, the section header's does not)."""
    section = aplib.pack_section(bytes(image))
    return section + bytes(-len(section) % 4)


def seal_key(stock, dev):
    """A sealed device's HMAC key, from `stock` (a Syx) as its bootstrap derives it: the section
    dev.hmac_key_from names holds the seed string, a NUL and a 32-byte constant C, and the key is
    C ^ sha256(seed) ^ sha256(seed reversed)."""
    sid, seed = dev.hmac_key_from
    section = stock.section(sid)
    marker = seed + b'\0'
    at = section.find(marker)
    if at < 0 or section.find(marker, at + 1) >= 0:
        raise SyxError('section %d does not hold the seal seed once' % sid)
    const = section[at + len(marker):at + len(marker) + DIGEST]
    if len(const) != DIGEST:
        raise SyxError('section %d ends inside the seal constant' % sid)
    forward, backward = hashlib.sha256(seed).digest(), hashlib.sha256(seed[::-1]).digest()
    return bytes(c ^ f ^ b for c, f, b in zip(const, forward, backward))


def _digest(key, data):
    return hmac.new(key, data, hashlib.sha256).digest()


def write(stock, stored_main, dev, version=None):
    """-> .syx bytes: `stock` (a Syx) with the main OS's stored bytes replaced by `stored_main`, and the version
    field set when `version` is given."""
    if dev.trailer not in (None, 'hmac'):
        raise SyxError('%s files are sealed (%s); the builder cannot write them' % (dev.name, dev.trailer))
    key = seal_key(stock, dev) if dev.trailer == 'hmac' else None
    if key is not None and _digest(key, stock.container[:-DIGEST]) != stock.container[-DIGEST:]:
        raise SyxError('the stock file\'s seal does not verify with the key its bootstrap gives')
    header = bytearray(stock.header)
    if version is not None:
        text = version.encode('ascii')
        if len(text) != 4:
            raise SyxError('the version field is exactly 4 characters')
        header[dev.version_at:dev.version_at + 4] = text
    out = bytearray(stock.container[:stock.data_start])     # stock's table area
    out[:COUNT_OFF] = header
    for i, (sid, _off, _len, dest) in enumerate(stock.table):
        body = stored_main if sid == dev.main_section else stock.stored[sid]
        struct.pack_into('>IIII', out, TABLE_OFF + ENTRY_SZ * i, sid, len(out), len(body), dest)
        out += body
        out += bytes(-len(out) % 16)
    if key is not None:
        out += _digest(key, bytes(out))
    container = bytes(out)
    stream = struct.pack('>II', len(container), transport.content_checksum(container)) + container
    return transport.encode_syx(stream, stock.device_id, stock.framing[0], stock.framing[1])


def inplace_depack(stored, dev):
    """Unpack the main OS as the bootloader does in place: the stored section staged at dev.stage, output written
    from dev.main_load over it. -> (image, the smallest distance in bytes between the write position and the next
    unread stream byte). A distance above 0 throughout means the result equals an unpack elsewhere."""
    length = struct.unpack_from('>I', stored, 0)[0]
    bits = elz.Bits(stored, 8, 8 + length)
    out = bytearray()
    lead = dev.stage - dev.main_load       # the staged stream's offset from the load address
    gap = None
    previous = 1
    while True:
        if bits.bit():
            room = lead + bits.p - len(out)
            if gap is None or room < gap:
                gap = room
            out.append(bits.byte())
            continue
        code = bits.gamma()
        if code == elz.REUSE:
            dist = previous
        else:
            coded = ((code << 8) + bits.byte()) & 0xFFFFFFFF
            if coded == elz.BIAS:
                break
            dist = (coded - elz.BIAS) & 0xFFFFFFFF
            previous = dist
        high = bits.bit()
        low = bits.bit()
        n = 2 * high + low
        if not n:
            n = bits.gamma() + 2
        if dist > elz.FAR:
            n += 1
        if dist == 0 or dist > len(out):
            raise SyxError('the main OS: a match reaches before the output')
        room = lead + bits.p - (len(out) + n)      # at the last byte this match writes
        if gap is None or room < gap:
            gap = room
        for _ in range(n + 1):
            out.append(out[-dist])
    if bits.p != 8 + length:
        raise SyxError('the main OS: the end marker is not at the declared length')
    return bytes(out), gap


def _check_messages(o, stock):
    for m in o.data:
        if m[4] != stock.device_id:
            raise SyxError('a data message has device id 0x%02x' % m[4])
    failing = sum(1 for m in o.data if transport.packet_checksum(m[1:-1], o.k) != m[-2])
    if failing:
        raise SyxError('%d data messages fail their checksum' % failing)
    for i, m in enumerate(o.data):
        counter = m[7] << 14 | m[8] << 7 | m[9]
        if counter != FIRST_COUNTER + i:
            raise SyxError('data message %d carries counter %d' % (i, counter))
    for mine, theirs in zip(o.framing, stock.framing):
        count = mine[12] << 14 | mine[13] << 7 | mine[14]
        if count != len(o.data):
            raise SyxError('framing count %d != %d data messages' % (count, len(o.data)))
        if mine[:12] + mine[15:] != theirs[:12] + theirs[15:]:
            raise SyxError('a framing message differs from stock beyond its count')


def _check_layout(o, stock, dev):
    got = transport.content_checksum(o.container)
    if got != o.checksum:
        raise SyxError('content checksum 0x%08x != preamble 0x%08x' % (got, o.checksum))
    if len(o.tail) >= CHUNK or any(o.tail):
        raise SyxError('%d bytes after the container, or not zero' % len(o.tail))
    if [(e[0], e[3]) for e in o.table] != [(e[0], e[3]) for e in stock.table]:
        raise SyxError('section order or destinations differ from stock')
    at = stock.data_start
    for sid, off, clen, _dest in o.table:
        if off != at:
            raise SyxError('section %d at 0x%x, not 0x%x' % (sid, off, at))
        at = off + clen + (-(off + clen) % 16)
    if dev.trailer == 'hmac':
        if o.total != at + DIGEST:
            raise SyxError('container length %d is not the 16-aligned end %d and the seal' % (o.total, at))
        if _digest(seal_key(stock, dev), o.container[:-DIGEST]) != o.container[-DIGEST:]:
            raise SyxError('the HMAC trailer does not verify')
    elif o.total != at:
        raise SyxError('container length %d is not the 16-aligned end %d' % (o.total, at))
    if dev.flash_at + o.total > dev.flash_limit:
        raise SyxError('the container ends at flash 0x%x > 0x%x' % (dev.flash_at + o.total, dev.flash_limit))


def verify(out, stock, want_main, dev, version=None):
    """Refuse (SyxError) unless `out` is `stock` (a Syx) with only the main OS changed, unpacking in place to
    `want_main`. -> the facts of the output."""
    o = Syx(out)                       # every message's shape and the ELE3 magic
    main = dev.main_section
    _check_messages(o, stock)
    _check_layout(o, stock, dev)
    changed = [i for i in range(COUNT_OFF) if o.header[i] != stock.header[i]]
    if any(not dev.version_at <= i < dev.version_at + 4 for i in changed):
        raise SyxError('ELE3 header differs outside the version field: %s' % changed)
    if version is not None and o.version != version:
        raise SyxError('version field %r, not %r' % (o.version, version))
    if (o.container[TABLE_OFF + ENTRY_SZ * len(o.table):stock.data_start]
            != stock.container[TABLE_OFF + ENTRY_SZ * len(stock.table):stock.data_start]):
        raise SyxError('the table area after the entries differs from stock')
    for sid in stock.stored:
        if sid == main:
            continue
        if o.stored[sid] != stock.stored[sid]:
            raise SyxError('section %d is not stock' % sid)
        if o.section(sid) != stock.section(sid):
            raise SyxError('section %d does not depack as stock' % sid)
    stored = o.stored[main]
    if classify(stored) != 'packed':
        raise SyxError('the main OS is not a packed stream with a valid byte sum')
    img, gap = inplace_depack(stored, dev)
    if img != bytes(want_main):
        raise SyxError('the main OS does not depack to the patched image')
    if elz.depack_section(stored) != img:
        raise SyxError('the main OS: the depacker disagrees with the in-place depack')
    if gap <= 0:
        raise SyxError('the main OS: the in-place depack overwrites unread input (gap %d)' % gap)
    return {
        'sha256': sha(out), 'bytes': len(out), 'messages': len(o.data) + 2,
        'content_checksum': '0x%08x' % o.checksum, 'container_len': o.total,
        'flash_end': '0x%06x' % (dev.flash_at + o.total),
        'flash_headroom': dev.flash_limit - dev.flash_at - o.total,
        'ele3_version': o.version,
        'main': {'section': main, 'stored': len(stored), 'image': len(img), 'sha256': sha(img),
                 'staged_to': '0x%08x' % (dev.stage + len(stored)), 'inplace_min_gap': gap},
        'sections': {str(sid): {'stored': clen, 'stored_sha256': sha(o.stored[sid]), 'stock': sid != main}
                     for sid, _off, clen, _dest in o.table},
    }
