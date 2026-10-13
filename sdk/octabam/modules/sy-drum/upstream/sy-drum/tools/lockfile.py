#!/usr/bin/env python3
"""SY DRUM's step-lock companion files beside a project's banks: read, check, write.

sylockNN.work / .strd (the locks of PLAYBACK SETUP A..D: LSPD LDEP WAVE S&H) in the
development line's format, version 2. This codec never edits Elektron bank files. Each
payload covers 16 patterns, 8 audio tracks and 64 steps in that order, then the controls
of a row; 255 means no lock. Version 2 rows hold six controls, A..D and E / F (E / F are
a sidecar FM track's ALGO / MOD2 on the development line; this module never writes them);
version 1 rows (older development builds) hold four, A..D. A version 1 file decodes to the
version 2 layout with E / F unlocked; encode always writes version 2. The firmware accepts
every value 0..127 (or 255) in every control and clamps where the value is used, so this
codec checks the same. The development line's two other families are decoded too for
inspection: syscenNN (its setup scenes) and sylkgjNN (its controls G..J; magic SYLOCKGJ,
version 1, rows of four controls, the same header shape and row order).
usage: lockfile.py FILE  (prints the bank, version, generation and the lock count)
"""
from dataclasses import dataclass
from pathlib import Path
import argparse
import struct
import zlib

MAGIC = b"SYLOCKS\0"
VERSION = 2
CONTROLS = 6
ROWS = 16 * 8 * 64
BANK_BYTES = ROWS * CONTROLS
V1_CONTROLS = 4
V1_BANK_BYTES = ROWS * V1_CONTROLS
HEADER = struct.Struct(">8sHHHHIIII")
EMPTY = bytes([255]) * BANK_BYTES


@dataclass(frozen=True)
class BankLocks:
    bank: int
    generation: int
    payload: bytes          # always the version 2 layout (six controls a row)
    version: int = VERSION  # the version the file was read as


def validate_payload(payload: bytes, size: int = BANK_BYTES) -> None:
    if len(payload) != size:
        raise ValueError("incorrect lock payload length")
    for offset, value in enumerate(payload):
        if value != 255 and value > 127:
            raise ValueError(f"out-of-range control {offset % (size // ROWS)}")


def widen_v1(payload: bytes) -> bytes:
    """A version 1 payload (A..D a row) -> version 2 (A..D, E / F = 255)."""
    validate_payload(payload, V1_BANK_BYTES)
    out = bytearray()
    for row in range(ROWS):
        out += payload[row * 4:row * 4 + 4] + b"\xff\xff"
    return bytes(out)


def _header(version: int, bank: int, generation: int, payload: bytes) -> bytes:
    prefix = HEADER.pack(MAGIC, version, HEADER.size, bank, 0, len(payload),
                         generation, zlib.crc32(payload), 0)[:28]
    return prefix + struct.pack(">I", zlib.crc32(prefix))


def encode(bank: int, generation: int, payload: bytes, version: int = VERSION) -> bytes:
    """Version 2 by default; version=1 (tests) takes a four-control payload."""
    if not 0 <= bank < 16 or not 0 <= generation <= 0xFFFFFFFF:
        raise ValueError("bank or generation outside format bounds")
    if version not in (1, 2):
        raise ValueError("unknown version")
    validate_payload(payload, BANK_BYTES if version == 2 else V1_BANK_BYTES)
    return _header(version, bank, generation, payload) + payload


def decode(data: bytes, expected_bank: int | None = None) -> BankLocks:
    version = None
    if len(data) >= 10 and data[:8] == MAGIC:
        version = int.from_bytes(data[8:10], 'big')
        if version not in (1, 2):
            raise ValueError("unsupported companion version")
    size = V1_BANK_BYTES if version == 1 else BANK_BYTES
    if len(data) != HEADER.size + size:
        raise ValueError("incorrect companion file length")
    magic, version, header_size, bank, flags, length, generation, crc, header_crc = HEADER.unpack_from(data)
    if magic != MAGIC or header_size != HEADER.size or flags or length != size:
        raise ValueError("invalid companion header")
    if not 0 <= bank < 16 or (expected_bank is not None and bank != expected_bank):
        raise ValueError("companion belongs to another bank")
    if zlib.crc32(data[:28]) != header_crc:
        raise ValueError("companion header checksum mismatch")
    payload = data[HEADER.size:]
    if zlib.crc32(payload) != crc:
        raise ValueError("companion payload checksum mismatch")
    if version == 1:
        return BankLocks(bank, generation, widen_v1(payload), 1)
    validate_payload(payload)
    return BankLocks(bank, generation, payload, 2)


def row_offset(pattern: int, track: int, step: int) -> int:
    """Offset of a row's control A in a version 2 payload (E / F at +4 / +5)."""
    if not 0 <= pattern < 16 or not 0 <= track < 8 or not 0 <= step < 64:
        raise ValueError("lock location outside bank")
    return ((pattern * 8 + track) * 64 + step) * CONTROLS


# ---- the development line's SETUP SCENES companion (syscenNN.work / .strd) -------
# Same 32-byte header shape with its own magic; the payload is 4096 bytes:
# WORKING then PART-SAVED, each [part 0..3][scene 0..15][track 0..7][control A..D],
# raw 0..127 or 255 = not assigned (the table does not know the machine).
SCENE_MAGIC = b"SYSCENE\0"
SCENE_BYTES = 2 * 4 * 16 * 8 * 4
SCENE_VERSION = 1                     # the scene files are version 1 (four controls)


@dataclass(frozen=True)
class BankScenes:
    bank: int
    generation: int
    payload: bytes


def encode_scenes(bank: int, generation: int, payload: bytes) -> bytes:
    if not 0 <= bank < 16 or not 0 <= generation <= 0xFFFFFFFF:
        raise ValueError("bank or generation outside format bounds")
    if len(payload) != SCENE_BYTES or any(v > 127 and v != 255 for v in payload):
        raise ValueError("invalid scene payload")
    prefix = HEADER.pack(SCENE_MAGIC, SCENE_VERSION, HEADER.size, bank, 0, SCENE_BYTES,
                         generation, zlib.crc32(payload), 0)[:28]
    return prefix + struct.pack(">I", zlib.crc32(prefix)) + payload


def decode_scenes(data: bytes, expected_bank: int | None = None) -> BankScenes:
    if len(data) >= 10 and data[:8] == SCENE_MAGIC and int.from_bytes(data[8:10], 'big') != SCENE_VERSION:
        raise ValueError("unsupported companion version")
    if len(data) != HEADER.size + SCENE_BYTES:
        raise ValueError("incorrect companion file length")
    magic, version, header_size, bank, flags, size, generation, crc, header_crc = HEADER.unpack_from(data)
    if magic != SCENE_MAGIC or header_size != HEADER.size or flags or size != SCENE_BYTES:
        raise ValueError("invalid companion header")
    if not 0 <= bank < 16 or (expected_bank is not None and bank != expected_bank):
        raise ValueError("companion belongs to another bank")
    payload = data[HEADER.size:]
    if zlib.crc32(data[:28]) != header_crc or zlib.crc32(payload) != crc:
        raise ValueError("companion checksum mismatch")
    if any(v > 127 and v != 255 for v in payload):
        raise ValueError("out-of-range scene value")
    return BankScenes(bank, generation, payload)


def scene_offset(part: int, scene: int, track: int, saved: bool = False) -> int:
    if not 0 <= part < 4 or not 0 <= scene < 16 or not 0 <= track < 8:
        raise ValueError("scene location outside bank")
    return (2048 if saved else 0) + ((part * 16 + scene) * 8 + track) * 4


# ---- the development line's G..J step locks (sylkgjNN.work / .strd) -----------
# Same 32-byte header shape with its own magic; the payload is 8192 rows of four
# bytes (G H I J), the row order of sylock; 0..127 or 255 = no lock. A bank with no
# G..J lock has no file (missing = no locks).
GJ_MAGIC = b"SYLOCKGJ"
GJ_VERSION = 1
GJ_CONTROLS = 4
GJ_BYTES = ROWS * GJ_CONTROLS          # 32768
GJ_EMPTY = bytes([255]) * GJ_BYTES


@dataclass(frozen=True)
class BankGJ:
    bank: int
    generation: int
    payload: bytes


def encode_gj(bank: int, generation: int, payload: bytes) -> bytes:
    if not 0 <= bank < 16 or not 0 <= generation <= 0xFFFFFFFF:
        raise ValueError("bank or generation outside format bounds")
    validate_payload(payload, GJ_BYTES)
    prefix = HEADER.pack(GJ_MAGIC, GJ_VERSION, HEADER.size, bank, 0, GJ_BYTES,
                         generation, zlib.crc32(payload), 0)[:28]
    return prefix + struct.pack(">I", zlib.crc32(prefix)) + payload


def decode_gj(data: bytes, expected_bank: int | None = None) -> BankGJ:
    if len(data) >= 10 and data[:8] == GJ_MAGIC and int.from_bytes(data[8:10], 'big') != GJ_VERSION:
        raise ValueError("unsupported companion version")
    if len(data) != HEADER.size + GJ_BYTES:
        raise ValueError("incorrect companion file length")
    magic, version, header_size, bank, flags, size, generation, crc, header_crc = HEADER.unpack_from(data)
    if magic != GJ_MAGIC or header_size != HEADER.size or flags or size != GJ_BYTES:
        raise ValueError("invalid companion header")
    if not 0 <= bank < 16 or (expected_bank is not None and bank != expected_bank):
        raise ValueError("companion belongs to another bank")
    payload = data[HEADER.size:]
    if zlib.crc32(data[:28]) != header_crc or zlib.crc32(payload) != crc:
        raise ValueError("companion checksum mismatch")
    validate_payload(payload, GJ_BYTES)
    return BankGJ(bank, generation, payload)


def gj_offset(pattern: int, track: int, step: int) -> int:
    """Offset of a row's control G in a sylkgj payload (H I J at +1 +2 +3)."""
    return row_offset(pattern, track, step) // CONTROLS * GJ_CONTROLS


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("file", type=Path)
    args = parser.parse_args()
    data = args.file.read_bytes()
    if data[:8] == SCENE_MAGIC:
        scenes = decode_scenes(data)
        print(f"Bank {scenes.bank + 1}, generation {scenes.generation}, "
              f"{sum(value != 255 for value in scenes.payload[:2048])} working and "
              f"{sum(value != 255 for value in scenes.payload[2048:])} part-saved setup scene assignments")
        return
    if data[:8] == GJ_MAGIC:
        gj = decode_gj(data)
        print(f"Bank {gj.bank + 1}, G..J (sylkgj) version {GJ_VERSION}, generation {gj.generation}, "
              f"{sum(value != 255 for value in gj.payload)} locks on G..J")
        return
    bank = decode(data)
    ef = sum(bank.payload[r * CONTROLS + c] != 255 for r in range(ROWS) for c in (4, 5))
    print(f"Bank {bank.bank + 1}, version {bank.version}, generation {bank.generation}, "
          f"{sum(value != 255 for value in bank.payload)} locks ({ef} on E / F)")


if __name__ == "__main__":
    main()
