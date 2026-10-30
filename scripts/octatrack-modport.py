#!/usr/bin/env python3
"""MODPORT: a ProTracker module (.mod) as an Octatrack project.

    python3 -B scripts/octatrack-modport.py SONG.mod TEMPLATE_PROJECT OUT_PROJECT [--bank A] [--name NAME]
                                            [--sliced] [--arranger]
    python3 -B scripts/octatrack-modport.py SONG.mod --report [--sliced] [--arranger]   # nothing written

TEMPLATE_PROJECT is an empty project the unit made (PROJECT > CHANGE > CREATE NEW, then copied from the card), so its
Parts and pages are the running OS's defaults; OUT_PROJECT is written beside it as a copy and must not exist. Copy
OUT_PROJECT back into the same set on the card and load it.

What it writes:
- each sample the song plays as a 16-bit mono 44.1 kHz WAV in the project's own folder, resampled so that the middle of
  the notes it plays sounds at PTCH 0 (loops are rendered out to at least two seconds), and a FLEX slot for each, with
  timestretch off;
- each channel on an audio track (4, 6 or 8 channels: tracks 1-8), a FLEX machine in every Part;
- each song position as one pattern, in order from the chosen bank's first pattern on (positions past bank P are
  dropped): a trig where a note starts, with a FLEX slot lock for its sample, a PTCH lock for its note (-12..+12
  semitones around the sample's middle note; notes further out fold by octaves), a VOL lock when it is not at full
  volume (Cxx and the sample's own volume, approximate) and a STRT lock for a sample offset (9xx); Dxx shortens a
  pattern and starts the next one at its row; Bxx ends the song when it jumps back;
- the tempo from the song's first speed and BPM (rows as sixteenth notes: tempo = BPM x 6 / speed).

--sliced: instead of one FLEX slot per sample, every sample the song plays goes into one WAV, one after the other
(each still rendered at its own middle note), in FLEX slot 1; the slot's entry in markers.work (and .strd) gets its
trim (the whole file), loop point 0 and one slice per sample (no slice loop); every track's FLEX SRC SETUP has slice
mode (SLIC) on in every Part; and each trig locks STRT = slice index x 2 instead of the slot. PTCH stays per sample. A
sample offset (9xx) cannot be locked then (STRT picks the slice) and is counted in the report. The template must have
a markers.work: it is edited in place.

--arranger: the song order also goes into arrangement 1 (arr01.work, and arr01.strd when the template has one), both
its working and stored copies: one pattern row per song position, pointing at that position's pattern, with
consecutive positions whose patterns are identical folded into one row's repeat count (up to 64x). The arrangement
is named after the song. Mute, tempo, scenes, offset and MIDI transpose keep the values the unit writes for a new row
(none, no tempo change, no scenes, 0, none); a row's length is its pattern's length. The template must have an
arr01.work: it is edited in place (its header, version and checksum are checked first), and project.work is left as
it is (a note is printed when the template has another arrangement selected). Off by default: no arrangement written
this way has been loaded on a unit yet.

Not converted: arpeggio, portamento, vibrato, tremolo, retrig, note cut and delay, fine volume and pitch slides, later
speed and tempo changes, and without --arranger the song order (chain the patterns on the unit). They are counted in
the report.

The bank files are written with sdk/octabam/tools/hw's ot_project and ot_spec, which checksum and read back every
bank. markers.work and arr01.work are written here, with their checksums, and read back. Nothing of the template is
touched.

Sources for the two formats this script writes itself (facts only: offsets, sizes and checksum rules, no code copied):
- markers.work: octapy's octapy/_io/markers.py (https://github.com/jhw/octapy, MIT), a Python port of ot-tools-io;
  checked against ot-tools-io's src/markers.rs and its unit-saved fixtures (test-data/markers: a sliced slot holds
  trim 0..frames, loop 0, slices end to end with loop 0xffffffff, and its slice count; the checksum is the 16-bit sum
  of bytes 0x10..end-2, big-endian, true for all eleven fixtures). STRT = slice index x 2 and the SRC SETUP layout
  (Part + 483 + track x 30, FLEX at +6, SLIC its second byte) are octapy's (api/core/audio/step.py, _io/bank.py),
  and the SETUP offset was checked on ot-tools-io's unit-saved blank bank (FLEX's bytes read 1 0 0 0 1 64).
- arrNN.work: ot-tools-io's src/arrangements (https://gitlab.com/ot-tools/ot-tools-io, by Mike Robeson
  (dijksterhuis), AGPL-3.0-or-later): 11,336 bytes = 21-byte header, version 6, two unknown bytes, the working state
  (5,650 bytes: 15-byte name, two unknown bytes, the row count, 256 rows of 22 bytes), an unknown byte, the saved flag,
  the stored state, eight saved flags, a 16-bit big-endian checksum = the sum of bytes 16..end-2. A pattern row is
  type 0, the pattern (0 = A01 .. 255 = P16), repeats - 1, ..., the length. The header, version and checksum rule
  hold for its nineteen unit-saved fixtures (test-data/arrange, blank-project), and set_arrangement reproduces the
  unit's bytes for a one-row arrangement; that the pattern byte counts from A01 and the repeat byte from 1x is the
  crate's reading, not checked here. octapy does not cover arrangements.
- Writing four slices into the crate's unit-saved unsliced markers fixture reproduces its unit-saved four-slice
  fixture byte for byte, checksum included.
"""
from __future__ import annotations

import argparse
import json
import math
import pathlib
import re
import shutil
import struct
import sys
from dataclasses import dataclass, field

HW = pathlib.Path(__file__).resolve().parents[1] / 'sdk/octabam/tools/hw'

PAL_CLOCK = 7093789.2 / 2            # Amiga PAL: period -> Hz is PAL_CLOCK / period
RATE = 44100
PERIODS = [856, 808, 762, 720, 678, 640, 604, 570, 538, 508, 480, 453,      # C-1 .. B-1 (finetune 0)
           428, 404, 381, 360, 340, 320, 302, 285, 269, 254, 240, 226,      # C-2 .. B-2
           214, 202, 190, 180, 170, 160, 151, 143, 135, 127, 120, 113]      # C-3 .. B-3
NOTE_NAMES = ['C-', 'C#', 'D-', 'D#', 'E-', 'F-', 'F#', 'G-', 'G#', 'A-', 'A#', 'B-']
SIGNATURES = {b'M.K.': 4, b'M!K!': 4, b'FLT4': 4, b'4CHN': 4, b'6CHN': 6, b'8CHN': 8, b'FLT8': 8, b'CD81': 8, b'OCTA': 8}
LOOP_SECONDS = 2.0
EFFECTS = {'0': 'arpeggio', '1': 'slide up', '2': 'slide down', '3': 'tone portamento', '4': 'vibrato',
           '5': 'portamento + volume slide', '6': 'vibrato + volume slide', '7': 'tremolo', '8': 'panning',
           'A': 'volume slide', 'E0': 'filter', 'E1': 'fine slide up', 'E2': 'fine slide down', 'E3': 'glissando',
           'E4': 'vibrato waveform', 'E5': 'finetune', 'E6': 'pattern loop', 'E7': 'tremolo waveform', 'E8': 'panning',
           'E9': 'retrigger', 'EA': 'fine volume up', 'EB': 'fine volume down', 'EC': 'note cut', 'ED': 'note delay',
           'EE': 'pattern delay', 'EF': 'invert loop'}

# Part-relative SRC SETUP: 30 bytes per track (STATIC, FLEX, THRU, NEIGHBOR, PICKUP x 6), FLEX's are LOOP SLIC LEN
# RATE TSTR TSNS (octapy _io/bank.py; checked on a unit-saved bank, see the module docstring)
SETUP_OFF, SETUP_STRIDE, FLEX_SETUP, SLIC = 483, 30, 6, 1
MAX_SLICES = 64
# markers.work: 21-byte header, version 4, 136 FLEX slots (128 + 8 recorders) then 128 STATIC, 784 bytes each (trim
# start, trim end, loop point, 64 slices of start/end/loop, slice count; all u32 big-endian), checksum
MARKERS_SIZE, MARKERS_VERSION, MARKERS_SLOT, MARKERS_FIRST = 207000, 4, 784, 22
SLICE_NO_LOOP = 0xFFFFFFFF
# arrNN.work: header, version 6, 2 bytes, working state, 2 bytes, stored state, 8 bytes, checksum
ARR_HEADER = b'FORM\0\0\0\0DPS1ARRA\0\0\0\0\0'
ARR_SIZE, ARR_VERSION, ARR_STATES, ARR_ROW, MAX_ROWS = 11336, 6, (24, 24 + 5650 + 2), 22, 255
# a new pattern row as the unit saves it (ot-tools-io test-data/arrange): type 0, pattern, repeats - 1, mutes 0,
# tempo 0 (none), scenes A and B 255 (none), offset 0, length 16, eight MIDI transposes 0
NEW_ROW = bytes([0, 0, 0, 0, 0, 0, 0, 0, 255, 255, 0, 0, 0, 16]) + bytes(8)


@dataclass
class Sample:
    name: str
    data: bytes          # signed 8-bit
    finetune: int        # -8..7
    volume: int          # 0..64
    loop_start: int      # in bytes
    loop_length: int     # in bytes; <= 2 means no loop


@dataclass
class Cell:
    sample: int          # 1-31, 0 none
    note: int            # 0-35 (C-1..B-3), -1 none
    effect: int
    param: int


@dataclass
class Module:
    title: str
    channels: int
    samples: list
    order: list
    patterns: list       # [pattern][row][channel] -> Cell


def note_of(period: int) -> int:
    """The nearest note (0 = C-1) to an Amiga period, -1 for none."""
    if not period:
        return -1
    best = min(range(len(PERIODS)), key=lambda i: abs(PERIODS[i] - period))
    return best


def parse(data: bytes) -> Module:
    if len(data) < 1084:
        raise ValueError('too short for a 31-sample module')
    channels = SIGNATURES.get(data[1080:1084])
    if channels is None:
        m = re.fullmatch(rb'(\d\d)CH', data[1080:1084]) or re.fullmatch(rb'(\d)CHN', data[1080:1084])
        channels = int(m.group(1)) if m else None
    if not channels or channels > 8:
        raise ValueError('not a 31-sample module of 1-8 channels (signature %r)' % data[1080:1084])
    title = data[0:20].split(b'\0')[0].decode('latin1').strip()
    headers = []
    for i in range(31):
        h = data[20 + 30 * i:50 + 30 * i]
        name = h[0:22].split(b'\0')[0].decode('latin1').strip()
        length, finetune, volume, loop_start, loop_length = struct.unpack('>HBBHH', h[22:30])
        finetune = finetune & 15
        headers.append((name, 2 * length, finetune - 16 if finetune > 7 else finetune, min(volume, 64), 2 * loop_start, 2 * loop_length))
    song_length = data[950]
    order = list(data[952:952 + 128])[:song_length]
    count = max(data[952:952 + 128]) + 1
    at = 1084
    patterns = []
    for _ in range(count):
        rows = []
        for _ in range(64):
            row = []
            for _ in range(channels):
                b0, b1, b2, b3 = data[at:at + 4]
                at += 4
                row.append(Cell(sample=(b0 & 0xf0) | (b2 >> 4), note=note_of(((b0 & 0x0f) << 8) | b1), effect=b2 & 0x0f, param=b3))
            rows.append(row)
        patterns.append(rows)
    samples = []
    for name, length, finetune, volume, loop_start, loop_length in headers:
        samples.append(Sample(name, data[at:at + length], finetune, volume, loop_start, loop_length))
        at += length
    return Module(title, channels, samples, order, patterns)


@dataclass
class Event:
    step: int
    sample: int          # 1-31
    note: int            # 0-35
    volume: int          # 0-64
    offset: int          # 9xx in bytes, 0 none


@dataclass
class Position:
    pattern: int         # the .mod pattern
    first_row: int       # where it starts (a Dxx before it)
    length: int          # rows played
    tracks: list = field(default_factory=list)   # per channel: [Event]


@dataclass
class Song:
    positions: list
    speed: int
    bpm: int
    unconverted: dict
    notes: dict          # sample -> [note]
    later_tempo: int


def play(mod: Module) -> Song:
    """The song as it plays: positions in order with breaks and jumps, each channel's note starts."""
    speed, bpm, later, unconverted = 6, 125, 0, {}
    first_speed = first_bpm = False
    last_sample = [0] * mod.channels
    volume = [64] * mod.channels
    notes: dict = {}
    positions, seen = [], set()
    pos, row0 = 0, 0
    while 0 <= pos < len(mod.order) and (pos, row0) not in seen:
        seen.add((pos, row0))
        pattern = mod.order[pos]
        rows = mod.patterns[pattern]
        p = Position(pattern, row0, 0, [[] for _ in range(mod.channels)])
        next_pos, next_row = pos + 1, 0
        for r in range(row0, 64):
            stop = False
            for c, cell in enumerate(rows[r]):
                e, x = cell.effect, cell.param
                if cell.sample:
                    last_sample[c] = cell.sample
                    volume[c] = mod.samples[cell.sample - 1].volume
                if e == 0xC:
                    volume[c] = min(x, 64)
                elif e == 0xF:
                    if x and x < 32:
                        later += first_speed and x != speed       # a song restating its speed changes nothing
                        if not first_speed: speed, first_speed = x, True
                    elif x >= 32:
                        later += first_bpm and x != bpm
                        if not first_bpm: bpm, first_bpm = x, True
                elif e == 0xD:
                    next_pos, next_row, stop = pos + 1, min((x >> 4) * 10 + (x & 15), 63), True
                elif e == 0xB:
                    next_pos, next_row, stop = x, 0, True
                elif e != 0x9 and (e or x):
                    key = '%X' % e if e != 0xE else 'E%X' % (x >> 4)
                    unconverted[key] = unconverted.get(key, 0) + 1
                # a note under tone portamento (3xx, 5xy) slides the playing note rather than starting one
                if cell.note >= 0 and e not in (0x3, 0x5) and last_sample[c] and mod.samples[last_sample[c] - 1].data:
                    s = last_sample[c]
                    p.tracks[c].append(Event(r - row0, s, cell.note, volume[c], x * 256 if e == 0x9 else 0))
                    notes.setdefault(s, []).append(cell.note)
            p.length = r - row0 + 1
            if stop:
                break
        positions.append(p)
        if next_pos <= pos and mod.order[next_pos:next_pos + 1]:
            break                       # a jump back: the song loops here
        pos, row0 = next_pos, next_row
    return Song(positions, speed, bpm, unconverted, notes, later)


def middle(notes: list) -> int:
    """The note a sample is rendered at: the middle of the range it plays (most notes then fit PTCH's +-12)."""
    lo, hi = min(notes), max(notes)
    return (lo + hi + 1) // 2


def fold(semis: int) -> int:
    while semis > 12:
        semis -= 12
    while semis < -12:
        semis += 12
    return semis


def hz_of(sample: Sample, note: int) -> float:
    """The rate the Amiga plays a sample at for a note, with the sample's finetune (1/8 semitone steps)."""
    return PAL_CLOCK / PERIODS[note] * 2 ** (sample.finetune / 96)


def body(sample: Sample, centre: int) -> list:
    """The signed 8-bit sample as it is rendered: a loop repeated until it lasts LOOP_SECONDS at `centre`."""
    src = [(b - 256 if b > 127 else b) for b in sample.data]
    if sample.loop_length > 2 and sample.loop_start + sample.loop_length <= len(src):
        out = src[:sample.loop_start + sample.loop_length]
        need = int(LOOP_SECONDS * hz_of(sample, centre)) + 1
        while len(out) < need:
            out += src[sample.loop_start:sample.loop_start + sample.loop_length]
        return out
    return src


def render(sample: Sample, centre: int) -> list:
    """16-bit samples at 44.1 kHz: the sample played at `centre`, linear interpolation."""
    src = body(sample, centre)
    step = hz_of(sample, centre) / RATE
    out, pos = [], 0.0
    while pos < len(src) - 1:
        i = int(pos)
        v = src[i] + (src[i + 1] - src[i]) * (pos - i)
        out.append(max(-32768, min(32767, int(round(v * 256)))))
        pos += step
    return out


def wav(samples: list) -> bytes:
    data = struct.pack('<%dh' % len(samples), *samples)
    return (b'RIFF' + struct.pack('<I', 36 + len(data)) + b'WAVEfmt ' + struct.pack('<IHHIIHH', 16, 1, 1, RATE, RATE * 2, 2, 16)
            + b'data' + struct.pack('<I', len(data)) + data)


def volume_lock(volume: int) -> int | None:
    """A VOL lock for a note below full volume. AMP VOL is bipolar (stored 64 = 0, the Part's default); the .mod's
    0-64 maps onto stored 0-64, so silence is VOL -64. Approximate: the curve is not measured on a unit."""
    return None if volume >= 64 else max(0, volume)


def plan(mod: Module, song: Song, bank: int, sliced: bool = False) -> dict:
    """Everything the writer needs: tempo, the slots (or, sliced, slot 1's slices), per pattern per track the trigs
    and locks, and the arrangement rows."""
    used = sorted(song.notes)
    if sliced and len(used) > MAX_SLICES:
        raise ValueError('%d samples: a slot holds %d slices' % (len(used), MAX_SLICES))
    slices = {s: i for i, s in enumerate(used)} if sliced else None
    slots = {s: 1 if sliced else i + 1 for i, s in enumerate(used)}
    centres = {s: middle(song.notes[s]) for s in used}
    tempo = max(30.0, min(300.0, song.bpm * 6 / song.speed))
    patterns, dropped, folded, offsets = [], max(0, len(song.positions) - 16 * (17 - bank)), 0, 0
    for k, p in enumerate(song.positions[:16 * (17 - bank)]):
        tracks = {}
        for c in range(mod.channels):
            trigs, locks = [], {}
            for e in p.tracks[c]:
                if e.step in trigs:
                    continue
                semis = e.note - centres[e.sample]
                folded += abs(semis) > 12
                step = str(e.step + 1)
                trigs.append(e.step)
                if sliced:                           # STRT picks the slice (raw = index x 2), slice mode on
                    lk = {'STRT': 2 * slices[e.sample], 'PTCH': 64 + 5 * fold(semis)}
                    offsets += bool(e.offset)
                else:
                    lk = {'S31': slots[e.sample] - 1, 'PTCH': 64 + 5 * fold(semis)}
                if e.offset and not sliced:
                    length = len(body(mod.samples[e.sample - 1], centres[e.sample]))
                    lk['STRT'] = min(127, int(round(128 * e.offset / max(1, length))))
                locks.setdefault('playback', {})[step] = lk
                v = volume_lock(e.volume)
                if v is not None:
                    locks.setdefault('amp', {})[step] = {'VOL': v}
            tracks[str(c + 1)] = {'length': p.length, 'scale': '1X', 'trigs': [s + 1 for s in trigs], 'locks': locks}
        patterns.append({'bank': bank + k // 16, 'pattern': k % 16 + 1, 'length': p.length, 'tracks': tracks,
                         'source': (p.pattern, p.first_row)})
    first = {c: next((e.sample for p in song.positions for e in p.tracks[c]), used[0] if used else None) for c in range(mod.channels)}
    return {'tempo': tempo, 'slots': slots, 'slices': slices, 'centres': centres, 'patterns': patterns,
            'dropped': dropped, 'folded': folded, 'offsets': offsets, 'rows': arranger_rows(patterns),
            'track_slot': {c: slots[s] for c, s in first.items() if s}}


def arranger_rows(patterns: list) -> list:
    """The arrangement: one row per song position, [pattern id (0 = A01), repeats (1-64), length]. A position whose
    pattern is identical to the one before (same length, trigs and locks) adds a repeat to that row instead."""
    rows, last = [], None
    for q in patterns:
        key = json.dumps([q['length'], q['tracks']], sort_keys=True)
        if rows and key == last and rows[-1][1] < 64:
            rows[-1][1] += 1
            continue
        rows.append([(q['bank'] - 1) * 16 + q['pattern'] - 1, 1, q['length']])
        last = key
    return rows


def report(mod: Module, song: Song, p: dict, arranger: bool = False) -> str:
    lines = ['%s: %d channels, %d samples used, %d song positions -> %d patterns, tempo %.2f'
             % (mod.title or 'untitled', mod.channels, len(p['slots']), len(song.positions), len(p['patterns']), p['tempo'])]
    if p['slices'] is not None:
        lines.append('  sliced: one FLEX slot (1), %d slices, slice mode on' % len(p['slices']))
    for s, slot in p['slots'].items():
        n = song.notes[s]
        c = p['centres'][s]
        lines.append('  %s: %-22s notes %s%d..%s%d, rendered at %s%d'
                     % ('slice %2d' % (p['slices'][s] + 1) if p['slices'] is not None else 'slot %3d' % slot,
                        mod.samples[s - 1].name or 'sample %d' % s, NOTE_NAMES[min(n) % 12], min(n) // 12 + 1,
                        NOTE_NAMES[max(n) % 12], max(n) // 12 + 1, NOTE_NAMES[c % 12], c // 12 + 1))
    if arranger:
        rows = p['rows'][:MAX_ROWS]
        lines.append('  arranger: %d rows (%d repeats folded)' % (len(rows), sum(r[1] - 1 for r in rows)))
        if len(p['rows']) > MAX_ROWS:
            lines.append('  %d arrangement rows past %d dropped' % (len(p['rows']) - MAX_ROWS, MAX_ROWS))
    if p['offsets']:
        lines.append('  %d sample offsets (9xx) not converted: STRT picks the slice' % p['offsets'])
    if p['folded']:
        lines.append('  %d notes beyond +-12 semitones of their sample\'s middle folded by octaves' % p['folded'])
    if p['dropped']:
        lines.append('  %d positions past bank P dropped' % p['dropped'])
    if song.later_tempo:
        lines.append('  %d later speed or tempo changes not converted' % song.later_tempo)
    if song.unconverted:
        lines.append('  effects not converted: ' + ', '.join('%s (%s) x%d' % (EFFECTS.get(k, '?'), k, n)
                                                              for k, n in sorted(song.unconverted.items())))
    return '\n'.join(lines)


SAMPLE_BLOCK = re.compile(r'\[SAMPLE\]\r?\n(.*?)\[/SAMPLE\]\r?\n(?:\r?\n)?', re.S)


def with_samples(text: str, files: dict, tempo: float) -> str:
    """project.work with a FLEX slot for each {slot: file}, in the order the unit writes them: STATIC slots, then FLEX
    by slot number (the recorder buffers, 129-136, last). A slot the template already lists is replaced."""
    nl = '\r\n' if '\r\n' in text else '\n'
    blocks = []
    for m in SAMPLE_BLOCK.finditer(text):
        fields = dict(line.split('=', 1) for line in m.group(1).splitlines() if '=' in line)
        kind, slot = fields.get('TYPE', 'FLEX'), int(fields.get('SLOT', '0'))
        if not (kind == 'FLEX' and slot in files):
            blocks.append((kind != 'STATIC', slot, m.group(0).rstrip('\r\n') + nl))
    for slot, file in files.items():
        lines = ['[SAMPLE]', 'TYPE=FLEX', 'SLOT=%03d' % slot, 'PATH=%s' % file, 'BPMx24=%d' % round(tempo * 24), 'TSMODE=0',
                 'LOOPMODE=0', 'GAIN=72', 'TRIGQUANTIZATION=-1', '[/SAMPLE]']
        blocks.append((True, slot, nl.join(lines) + nl))
    body = nl.join(b for _, _, b in sorted(blocks, key=lambda b: (b[0], b[1]))) + nl
    first = SAMPLE_BLOCK.search(text)
    if first:
        rest = SAMPLE_BLOCK.sub('', text[first.start():])
        return text[:first.start()] + body + rest
    header = re.search(r'# Samples\r?\n#+\r?\n(\r?\n)?', text)
    if not header:
        raise ValueError('project.work has no Samples section')
    return text[:header.end()] + body + text[header.end():]


def checksum16(data) -> int:
    """The additive 16-bit sum over bytes 0x10..end-2 that markers, arrangement and bank files close with."""
    return sum(data[0x10:-2]) & 0xFFFF


def markers_problem(data: bytes) -> str | None:
    if len(data) != MARKERS_SIZE:
        return '%d bytes, not %d' % (len(data), MARKERS_SIZE)
    if data[0:4] != b'FORM' or data[8:16] != b'DPS1SAMP' or data[MARKERS_FIRST - 1] != MARKERS_VERSION:
        return 'not a version %d markers file' % MARKERS_VERSION
    if int.from_bytes(data[-2:], 'big') != checksum16(data):
        return 'its checksum does not match'
    return None


def arrangement_problem(data: bytes) -> str | None:
    if len(data) != ARR_SIZE:
        return '%d bytes, not %d' % (len(data), ARR_SIZE)
    if data[0:21] != ARR_HEADER or data[21] != ARR_VERSION:
        return 'not a version %d arrangement file' % ARR_VERSION
    if int.from_bytes(data[-2:], 'big') != checksum16(data):
        return 'its checksum does not match'
    return None


def flex_marker(data, slot: int) -> int:
    return MARKERS_FIRST + (slot - 1) * MARKERS_SLOT


def set_slices(data: bytearray, slot: int, frames: int, cuts: list) -> None:
    """FLEX `slot`'s markers: trim 0..frames, loop point 0, one slice (start, end, no loop) per cut, the count."""
    at = flex_marker(data, slot)
    rec = bytearray(MARKERS_SLOT)
    rec[0:12] = struct.pack('>III', 0, frames, 0)
    for i, (a, b) in enumerate(cuts):
        rec[12 + 12 * i:24 + 12 * i] = struct.pack('>III', a, b, SLICE_NO_LOOP)
    rec[780:784] = struct.pack('>I', len(cuts))
    data[at:at + MARKERS_SLOT] = rec
    data[-2:] = checksum16(data).to_bytes(2, 'big')


def read_slices(data: bytes, slot: int) -> tuple:
    """-> (trim start, trim end, loop point, [(start, end, loop)] for the slice count) of FLEX `slot`."""
    at = flex_marker(data, slot)
    head = struct.unpack('>III', data[at:at + 12])
    n = struct.unpack('>I', data[at + 780:at + 784])[0]
    return head + ([struct.unpack('>III', data[at + 12 + 12 * i:at + 24 + 12 * i]) for i in range(n)],)


def set_arrangement(data: bytearray, rows: list, name: str) -> None:
    """Both arrangement states (working and stored): the name, the row count and a pattern row per [pattern id,
    repeats, length]; rows past the count are left as they are (the unit leaves old bytes there too)."""
    label = ''.join(ch for ch in name.upper() if 32 <= ord(ch) <= 126)[:15] or 'MODPORT'
    for at in ARR_STATES:
        data[at:at + 15] = label.encode('ascii').ljust(15, b'\0')
        data[at + 17] = len(rows)
        for i, (pattern, repeats, length) in enumerate(rows):
            row = bytearray(NEW_ROW)
            row[1], row[2], row[13] = pattern, repeats - 1, length
            data[at + 18 + i * ARR_ROW:at + 18 + (i + 1) * ARR_ROW] = row
    data[-2:] = checksum16(data).to_bytes(2, 'big')


def read_arrangement(data: bytes, state: int = 0) -> tuple:
    """-> (name, [[pattern id, repeats, length]]) of one state (0 working, 1 stored)."""
    at = ARR_STATES[state]
    rows = [data[at + 18 + i * ARR_ROW:at + 18 + (i + 1) * ARR_ROW] for i in range(data[at + 17])]
    return data[at:at + 15].split(b'\0')[0].decode('ascii'), [[r[1], r[2] + 1, r[13]] for r in rows]


def twins(folder: pathlib.Path, stem: str) -> list:
    return [f for f in (folder / (stem + '.work'), folder / (stem + '.strd')) if f.is_file()]


def edit_in_place(folder: pathlib.Path, stem: str, mutate, problem, expect) -> None:
    """Edit `stem`.work and its .strd twin: mutate (which closes the checksum), then read back each file and check
    it has no problem and holds what was asked for."""
    for f in twins(folder, stem):
        data = bytearray(f.read_bytes())
        mutate(data)
        f.write_bytes(bytes(data))
        back = f.read_bytes()
        why = problem(back) or (None if expect(back) else 'the read-back disagrees')
        if why:
            sys.exit('%s: %s -- do NOT use this project' % (f, why))


def check_template(template: pathlib.Path, sliced: bool, arranger: bool) -> None:
    """Refuse before anything is copied when a file --sliced or --arranger edits is missing or not one this tool knows."""
    for on, stem, problem in ((sliced, 'markers', markers_problem), (arranger, 'arr01', arrangement_problem)):
        if not on:
            continue
        if not (template / (stem + '.work')).is_file():
            sys.exit('%s has no %s.work to edit: make the template on the unit (PROJECT > CHANGE > CREATE NEW)'
                     % (template, stem))
        for f in twins(template, stem):
            why = problem(f.read_bytes())
            if why:
                sys.exit('%s: %s; refusing to edit it' % (f, why))


def write(mod: Module, p: dict, template: pathlib.Path, out: pathlib.Path, name: str, arranger: bool = False) -> None:
    sys.path.insert(0, str(HW))
    sys.path.insert(0, str(HW.parent)); import toolpath  # noqa: F401
    import ot_project as op
    import ot_spec
    if out.exists():
        sys.exit('%s exists: refusing to overwrite' % out)
    if not (template / 'project.work').is_file():
        sys.exit('%s is not an Octatrack project folder' % template)
    sliced = p['slices'] is not None
    check_template(template, sliced, arranger)
    shutil.copytree(template, out)
    files = {}
    if sliced:
        files[1] = '%s%02d.wav' % (name[:6], 1)
        pcm, cuts = [], []
        for s in sorted(p['slices'], key=p['slices'].get):
            part = render(mod.samples[s - 1], p['centres'][s]) or [0]
            cuts.append((len(pcm), len(pcm) + len(part)))
            pcm += part
        (out / files[1]).write_bytes(wav(pcm))
        edit_in_place(out, 'markers', lambda d: set_slices(d, 1, len(pcm), cuts), markers_problem,
                      lambda d: read_slices(d, 1) == (0, len(pcm), 0, [(a, b, SLICE_NO_LOOP) for a, b in cuts]))
    else:
        for s, slot in p['slots'].items():
            files[slot] = '%s%02d.wav' % (name[:6], slot)
            (out / files[slot]).write_bytes(wav(render(mod.samples[s - 1], p['centres'][s])))
    if arranger:
        rows = p['rows'][:MAX_ROWS]
        label = mod.title or name
        edit_in_place(out, 'arr01', lambda d: set_arrangement(d, rows, label), arrangement_problem,
                      lambda d: all(read_arrangement(d, k)[1] == rows for k in (0, 1)))
        m = re.search(rb'\nARRANGEMENT=(\d+)', (out / 'project.work').read_bytes())
        if m and m.group(1) != b'0':
            print('note: the template\'s project.work has ARRANGEMENT=%s (a fresh project has 0); the song is in '
                  'arr01: choose arrangement 1 on the unit' % m.group(1).decode())
    for suffix in ('work', 'strd'):
        f = out / ('project.' + suffix)
        if f.is_file():
            f.write_bytes(with_samples(f.read_bytes().decode('latin1'), files, p['tempo']).encode('latin1'))
    op.set_tempo(out, p['tempo'])
    banks = sorted({q['bank'] for q in p['patterns']})
    for b in banks:
        spec = {'banks': [b], 'parts': {'all': {'tracks': {str(c + 1): {'machine': 'FLEX'} for c in range(mod.channels)}}},
                'patterns': {str(q['pattern']): {'tracks': q['tracks']} for q in p['patterns'] if q['bank'] == b}}
        ot_spec.apply(out, spec)

        want = {}                                   # offset -> byte, for the read-back

        def mut(data, b=b):
            for part in range(op.NPARTS_ALL):
                base = op.PART_BASE + part * op.PART_STRIDE + op.SLOT_OFF
                for c, slot in p['track_slot'].items():
                    want[base + c * 5 + op.SLOT_KIND['flex']] = slot - 1
                if sliced:                           # FLEX SRC SETUP's SLIC on every track
                    setup = op.PART_BASE + part * op.PART_STRIDE + SETUP_OFF + FLEX_SETUP + SLIC
                    for c in range(mod.channels):
                        want[setup + c * SETUP_STRIDE] = 1
            for q in p['patterns']:
                if q['bank'] == b:
                    tail = op.PTRN0 + (q['pattern'] - 1) * op.PTRN_FSTRIDE + op.PTRN_FSTRIDE - 11
                    want[tail + 2] = q['length']
                    want[tail + 3] = op.SCALE_NAMES.index('1X')
            for a, v in want.items():
                data[a] = v
        op._bank_write(out, b, mut, guard=False)
        for f in twins(out, 'bank%02d' % b):
            data = f.read_bytes()
            if int.from_bytes(data[-2:], 'big') != checksum16(data) or any(data[a] != v for a, v in want.items()):
                sys.exit('%s: the read-back disagrees -- do NOT use this project' % f)


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split('\n\n')[0])
    ap.add_argument('mod', type=pathlib.Path)
    ap.add_argument('template', type=pathlib.Path, nargs='?')
    ap.add_argument('out', type=pathlib.Path, nargs='?')
    ap.add_argument('--bank', default='A', help='the first bank, A-P (default A)')
    ap.add_argument('--name', help='the sample file prefix (default: from the output folder)')
    ap.add_argument('--report', action='store_true', help='print what would be converted and write nothing')
    ap.add_argument('--sliced', action='store_true', help='all samples in one FLEX slot, one slice each, STRT locks')
    ap.add_argument('--arranger', action='store_true', help='also write the song order into arrangement 1 (arr01)')
    a = ap.parse_args(argv)
    mod = parse(a.mod.read_bytes())
    song = play(mod)
    bank = ord(a.bank.upper()) - 64
    if not 1 <= bank <= 16:
        sys.exit('--bank: A-P')
    p = plan(mod, song, bank, sliced=a.sliced)
    print(report(mod, song, p, arranger=a.arranger))
    if a.report:
        return 0
    if not a.template or not a.out:
        sys.exit('TEMPLATE_PROJECT and OUT_PROJECT are needed to write (or --report)')
    name = re.sub(r'[^A-Z0-9]', '', (a.name or a.out.name).upper()) or 'MOD'
    write(mod, p, a.template, a.out, name, arranger=a.arranger)
    print('%s: %s, %d patterns from bank %s%s'
          % (a.out, '%d slices in slot 1' % len(p['slices']) if a.sliced else '%d samples' % len(p['slots']),
             len(p['patterns']), a.bank.upper(), ', arrangement 1: %d rows' % len(p['rows'][:MAX_ROWS]) if a.arranger else ''))
    return 0


if __name__ == '__main__':
    sys.exit(main())
