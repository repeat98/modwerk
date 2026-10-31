# SPDX-License-Identifier: GPL-3.0-or-later
"""Assemble a draft DSP insert and run it alone in fxhost (tools/fxhost.cpp) on the vendored dsp56kEmu.

No firmware, no image, no ColdFire: what this proves is the effect's own arithmetic, its state discipline (init
clears what proc reads; nothing outside the audio block, the state block and the declared buffer is written) and
its instruction count, under the same emulator octabam's dsp_host uses. What it cannot prove is anything the
dispatcher, the panel, the base or the hardware decides.

The toolchain is octabam's (npm run upstream:tools, then its scripts/setup.sh builds vendor/dsp56300): set
DSP56300 to that vendor/dsp56300 folder if it is not at ~/.cache/modwerk-upstream/octabam/vendor/dsp56300.
"""
import hashlib
import os
import pathlib
import re
import struct
import subprocess
import sys
import tempfile

import numpy as np

HERE = pathlib.Path(__file__).resolve().parent
VENDOR = pathlib.Path(os.environ.get('DSP56300', pathlib.Path.home() / '.cache/modwerk-upstream/octabam/vendor/dsp56300'))
DSP_ASM = VENDOR / 'build/source/dsp_host/dsp_asm'
DISASM = VENDOR / 'build/source/disassemble/dsp56kDisassemble'
# keyed by the host's source, so drafts with different copies of fxhost.cpp never share a stale binary
BUILD = pathlib.Path(os.environ.get('FXHOST_BUILD', pathlib.Path(tempfile.gettempdir()) / (
    'fxhost-build-' + hashlib.sha256((HERE / 'fxhost.cpp').read_bytes()).hexdigest()[:12])))
FXHOST = BUILD / 'fxhost'
ORG, PTBASE = 0x2000, 0x3000
LITERAL = '$fab1e0'
# The operand orders the chip encodes for mpy/mac (QQQ); dsp_asm turns any other into mpysu (sdk/octabam/AGENTS.md).
ENCODABLE = {('x0', 'x0'), ('y0', 'y0'), ('x1', 'x0'), ('y1', 'y0'), ('x0', 'y1'), ('y0', 'x0'), ('x1', 'y0'), ('y1', 'x1')}


def toolchain():
    if not DSP_ASM.is_file() or not DISASM.is_file():
        sys.exit('no dsp_asm at %s: run npm run upstream:tools, then octabam\'s scripts/setup.sh (or set DSP56300)' % DSP_ASM)
    if not FXHOST.is_file():
        BUILD.mkdir(parents=True, exist_ok=True)
        (BUILD / 'CMakeLists.txt').write_text(
            'cmake_minimum_required(VERSION 3.10)\nproject(fxhost CXX)\nset(CMAKE_CXX_STANDARD 17)\n'
            'add_subdirectory(%s fxdsp)\nadd_executable(fxhost %s)\ntarget_include_directories(fxhost PRIVATE %s)\n'
            'target_link_libraries(fxhost PRIVATE dsp56kEmu)\n' % (VENDOR, HERE / 'fxhost.cpp', VENDOR / 'source'))
        subprocess.run(['cmake', '-S', str(BUILD), '-B', str(BUILD / 'b'), '-DCMAKE_BUILD_TYPE=Release'], check=True,
                       stdout=subprocess.DEVNULL)
        subprocess.run(['cmake', '--build', str(BUILD / 'b'), '--target', 'fxhost', '-j8'], check=True, stdout=subprocess.DEVNULL)
        (BUILD / 'b' / 'fxhost').rename(FXHOST)


def lint(text):
    """The source rules octabam's traps ask for, as far as text can show them."""
    problems = []
    labels = []
    for n, line in enumerate(text.splitlines(), 1):
        code = line.split(';')[0].strip()
        if not code:
            continue
        m = re.match(r'^(\w+):', code)
        if m:
            labels.append(m.group(1))
        op = code.split()[0].lower()
        if op == 'rep':
            problems.append('%d: rep' % n)
        if op in ('mpy', 'mac', 'mpyr', 'macr'):
            regs = re.findall(r'-?([xy][01])', code)
            if len(regs) >= 2 and (regs[0], regs[1]) not in ENCODABLE:
                problems.append('%d: %s %s,%s is not an encodable order' % (n, op, regs[0], regs[1]))
        lua = re.match(r'lua\s+\(r\d([+-])\$?([0-9a-fA-F]+)\)', code)
        if lua and int(lua.group(2), 16) > 63:
            problems.append('%d: lua displacement past 63' % n)
    for a in labels:
        for b in labels:
            if a != b and b.startswith(a):
                problems.append('label %s is a prefix of %s' % (a, b))
    if text.count(LITERAL) > 1:
        problems.append('the table literal appears %d times' % text.count(LITERAL))
    return problems


def assemble(asm_path, ptable=()):
    """(code words, {label: address}, table words) with the table literal pointed at PTBASE."""
    toolchain()
    text = pathlib.Path(asm_path).read_text()
    problems = lint(text)
    if problems:
        sys.exit('%s:\n  %s' % (asm_path, '\n  '.join(problems)))
    work = pathlib.Path(tempfile.mkdtemp(prefix='fxasm-'))
    src = work / 'm.asm'
    src.write_text(text.replace(LITERAL, '$%x' % PTBASE))
    r = subprocess.run([str(DSP_ASM), '-in', str(src), '-org', '%x' % ORG, '-out', str(work / 'm.bin'), '-sym', str(work / 'm.sym')],
                       capture_output=True, text=True)
    if r.returncode:
        sys.exit(r.stdout + r.stderr)
    syms = {}
    for line in (work / 'm.sym').read_text().splitlines():
        name, addr = line.split()
        syms[name] = int(addr, 16)
    raw = (work / 'm.bin').read_bytes()
    words = [raw[i] | raw[i + 1] << 8 | raw[i + 2] << 16 for i in range(0, len(raw), 3)]
    d = subprocess.run([str(DISASM), '-in', str(work / 'm.bin'), '-pc', '%x' % ORG, '-le'], capture_output=True, text=True)
    if 'mpysu' in d.stdout.lower() or 'mpyuu' in d.stdout.lower() or 'macsu' in d.stdout.lower():
        bad = [l for l in d.stdout.splitlines() if 'su' in l.lower() and ('mpy' in l.lower() or 'mac' in l.lower())]
        sys.exit('disassembly holds unsigned multiplies:\n' + '\n'.join(bad))
    (work / 'm.tab').write_bytes(b''.join(struct.pack('<I', w)[:3] for w in ptable))
    return {'dir': work, 'words': words, 'syms': syms, 'disasm': d.stdout, 'table': bool(ptable)}


def to_raw(x):
    """float stereo (n, 2) or mono (n,) in -1..1 -> int32 24-bit interleaved stereo."""
    x = np.asarray(x, dtype=float)
    if x.ndim == 1:
        x = np.stack([x, x], axis=1)
    return np.clip(np.round(x * 0x800000), -0x800000, 0x7fffff).astype('<i4')


def run(build, audio, params, events=(), tempo=120.0, ybase=0x4000, ywords=0, dirty=0, split=0, guard=True, fx1=None):
    """Render `audio` (float, mono or stereo) through the effect; returns (float stereo out, int stereo out, report).
    fx1: None for an FX2 record, else the word an FX1 instance finds at r6+$13 (tempo24 then sits at r6+$19)."""
    work = build['dir']
    pin, pout = work / 'in.raw', work / 'out.raw'
    to_raw(audio).tofile(pin)
    cmd = [str(FXHOST), '-code', str(work / 'm.bin'), '-org', '%x' % ORG, '-init', '%x' % build['syms']['init'],
           '-proc', '%x' % build['syms']['proc'], '-in', str(pin), '-out', str(pout),
           '-p', ','.join(str(int(v)) for v in params), '-tempo', str(tempo), '-ybase', '%x' % ybase, '-ywords', '%x' % ywords,
           '-dirty', str(dirty), '-split', str(split)]
    if fx1 is not None:
        cmd += ['-fx1', '%x' % fx1]
    if build['table']:
        cmd += ['-ptable', str(work / 'm.tab'), '-ptbase', '%x' % PTBASE]
    if guard:
        cmd.append('-guard')
    if events:
        (work / 'ev.txt').write_text(''.join('%d %d %d\n' % e for e in events))
        cmd += ['-events', str(work / 'ev.txt')]
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode not in (0, 3):
        sys.exit('fxhost failed:\n' + r.stdout + r.stderr)
    import json
    report = json.loads(r.stdout.strip().splitlines()[-1])
    report['stderr'] = r.stderr
    ints = np.fromfile(pout, dtype='<i4').reshape(-1, 2)
    return ints / float(0x800000), ints, report


def sine(freq, seconds, level=0.5, fs=44100):
    t = np.arange(int(seconds * fs)) / fs
    return level * np.sin(2 * np.pi * freq * t)


def dbfs(x):
    x = np.asarray(x, dtype=float)
    r = np.sqrt(np.mean(x ** 2)) if x.size else 0.0
    return 20 * np.log10(r) if r > 0 else -200.0


def peak_dbfs(x):
    p = np.max(np.abs(x)) if np.size(x) else 0.0
    return 20 * np.log10(p) if p > 0 else -200.0
