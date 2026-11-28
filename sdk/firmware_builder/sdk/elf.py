# SPDX-License-Identifier: GPL-3.0-or-later
"""ELF reader for the relocatable objects the ColdFire cross toolchain writes (32-bit, big-endian, m68k).

It reads what the SDK build needs and nothing more: the section headers and their bytes, the first symbol
table, and the RELA relocations grouped by the section they patch. REL relocations are refused.
"""
import struct

SHT_SYMTAB, SHT_RELA, SHT_NOBITS, SHT_REL = 2, 4, 8, 9
SHN_UNDEF, SHN_ABS, SHN_COMMON = 0, 0xFFF1, 0xFFF2
STB_LOCAL, STB_GLOBAL, STB_WEAK = 0, 1, 2
STT_NOTYPE, STT_OBJECT, STT_FUNC, STT_SECTION, STT_FILE = 0, 1, 2, 3, 4
# m68k relocation types, numbered as in the psABI
R_68K_NONE, R_68K_32, R_68K_16, R_68K_8, R_68K_PC32, R_68K_PC16, R_68K_PC8 = range(7)
# the names an .elemod gives the relocation types
RNAMES = {R_68K_32: 'abs32', R_68K_PC32: 'pc32', R_68K_PC16: 'pc16', R_68K_16: 'abs16',
          R_68K_8: 'abs8', R_68K_PC8: 'pc8'}

_SHDR = '>IIIIIIIIII'      # name, type, flags, addr, offset, size, link, info, addralign, entsize
_SYM = '>IIIBBH'           # name, value, size, info, other, shndx (16 bytes)
_RELA = '>IIi'             # offset, info, addend (12 bytes)


def _text_at(table, at):
    """The NUL-terminated name starting at `at` in a string table."""
    end = table.index(b'\0', at)
    return table[at:end].decode('ascii', 'replace')


class Section:
    """One section header, with the section's bytes (empty for NOBITS)."""

    def __init__(self, idx, name, typ, flags, offset, size, link, info, align, data):
        self.idx = idx
        self.name = name
        self.type = typ
        self.flags = flags
        self.offset = offset
        self.size = size
        self.link = link
        self.info = info
        self.align = align
        self.data = data


class Symbol:
    """One symbol table entry; `bind` and `type` are the two halves of st_info."""

    def __init__(self, idx, name, value, size, bind, typ, shndx):
        self.idx = idx
        self.name = name
        self.value = value
        self.size = size
        self.bind = bind
        self.type = typ
        self.shndx = shndx


class Elf:
    """A parsed object: `sections` in header order, `symbols` in table order, and `relocs`, which maps the index
    of a patched section to its [(offset, type, Symbol, addend)]."""

    def __init__(self, raw):
        if raw[:4] != b'\x7fELF' or raw[4] != 1 or raw[5] != 2:
            raise ValueError('not a 32-bit big-endian ELF')
        self.raw = raw
        (self.etype,) = struct.unpack_from('>H', raw, 16)
        (table_at,) = struct.unpack_from('>I', raw, 0x20)
        entry_size, count, names_index = struct.unpack_from('>HHH', raw, 0x2E)
        headers = [struct.unpack_from(_SHDR, raw, table_at + n * entry_size) for n in range(count)]
        names_header = headers[names_index]
        names = raw[names_header[4]:names_header[4] + names_header[5]]
        self.sections = [self._section(n, h, names) for n, h in enumerate(headers)]
        self.symbols = self._symbols()
        self.relocs = self._relocations()

    def _section(self, idx, header, names):
        name_at, typ, flags, _addr, offset, size, link, info, align, _entsize = header
        body = b'' if typ == SHT_NOBITS else self.raw[offset:offset + size]
        return Section(idx, _text_at(names, name_at), typ, flags, offset, size, link, info, align, body)

    def _symbols(self):
        tables = [s for s in self.sections if s.type == SHT_SYMTAB]
        if not tables:
            return []
        table = tables[0]
        strings = self.sections[table.link].data
        out = []
        for n in range(table.size // 16):
            name_at, value, size, info, _other, shndx = struct.unpack_from(_SYM, table.data, n * 16)
            name = _text_at(strings, name_at) if name_at else ''
            out.append(Symbol(n, name, value, size, info >> 4, info & 0xF, shndx))
        return out

    def _relocations(self):
        out = {}
        for s in self.sections:
            if s.type == SHT_REL:
                raise ValueError('REL relocations (%s): expected RELA' % s.name)
            if s.type != SHT_RELA:
                continue
            entries = out.setdefault(s.info, [])
            for n in range(s.size // 12):
                at, info, addend = struct.unpack_from(_RELA, s.data, n * 12)
                entries.append((at, info & 0xFF, self.symbols[info >> 8], addend))
        return out

    @classmethod
    def load(cls, path):
        with open(path, 'rb') as fh:
            return cls(fh.read())

    def section(self, name):
        """The first section called `name`, or None."""
        return next((s for s in self.sections if s.name == name), None)
