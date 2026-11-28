# SPDX-License-Identifier: GPL-3.0-or-later
"""Host-only CLYPS sidecar candidate. All integers are big endian."""
from struct import Struct
from zlib import crc32

HEADER = Struct(">4sHH16sQ")
INDEX = Struct(">BBHH")
WORD = Struct(">H")
CRC = Struct(">I")
BANK_SIZE = 2 + 16 * 8
SIZE = HEADER.size + 16 * (INDEX.size + BANK_SIZE) + CRC.size
STOP, HOLD = 16, 17  # 0..15 are CLIP references
EMPTY = (None,) * 16
EMPTY_PROJECT = (EMPTY,) * 16


class Unsupported(ValueError):
    pass


def encode(identity, generation, banks):
    if len(identity) != 16 or not 0 < generation < 2**64 or len(banks) != 16:
        raise ValueError("invalid archive identity, generation or bank count")
    data = bytearray(HEADER.pack(b"CLYP", 1, SIZE, identity, generation))
    for bank in range(16):
        start = HEADER.size + 16 * INDEX.size + bank * BANK_SIZE
        data.extend(INDEX.pack(bank, 16, start, BANK_SIZE))
    for rows in banks:
        if len(rows) != 16:
            raise ValueError("expected sixteen rows")
        defined = sum(1 << i for i, row in enumerate(rows) if row is not None)
        data.extend(WORD.pack(defined))
        for row in rows:
            if row is None:
                data.extend(bytes(8))
            elif len(row) == 8 and all(type(cell) is int and 0 <= cell <= HOLD for cell in row):
                data.extend(row)
            else:
                raise ValueError("invalid row")
    return bytes(data + CRC.pack(crc32(data)))


def decode(data, identity):
    if len(data) < 6 or data[:4] != b"CLYP":
        raise ValueError("invalid header")
    if WORD.unpack_from(data, 4)[0] != 1:
        raise Unsupported("unsupported archive version")
    if len(data) != SIZE or crc32(data[:-4]) != CRC.unpack_from(data, SIZE - 4)[0]:
        raise ValueError("length or integrity failure")
    _, _, length, project, generation = HEADER.unpack_from(data)
    if length != SIZE or project != identity or not generation:
        raise ValueError("invalid length, project identity or generation")
    banks = []
    for bank in range(16):
        start = HEADER.size + 16 * INDEX.size + bank * BANK_SIZE
        descriptor = INDEX.unpack_from(data, HEADER.size + bank * INDEX.size)
        if descriptor != (bank, 16, start, BANK_SIZE):
            raise ValueError("invalid bank descriptor")
        defined = WORD.unpack_from(data, start)[0]
        rows = []
        for i in range(16):
            pos = start + 2 + i * 8
            cells = tuple(data[pos:pos + 8])
            if max(cells) > HOLD or (not defined & (1 << i) and any(cells)):
                raise ValueError("invalid cell or undefined row")
            rows.append(cells if defined & (1 << i) else None)
        banks.append(tuple(rows))
    return generation, tuple(banks)


class Archive:
    """Fake filesystem. Atomic replacement is an explicit host assumption."""

    def __init__(self, identity):
        self.identity = identity
        self.files = {}

    def load(self, slot):
        """Missing data starts undefined; present damaged data raises."""
        if slot not in ("working", "saved"):
            raise ValueError("invalid slot")
        if slot not in self.files:
            return 0, EMPTY_PROJECT
        return decode(self.files[slot], self.identity)

    def save(self, slot, banks, *, cut=None):
        number, _ = self.load(slot)
        new = encode(self.identity, number + 1, banks)
        staged = new if cut is None else new[:cut]
        decode(staged, self.identity)
        self.files[slot] = staged
