#!/usr/bin/env python3
"""Count what amiga_render costs on ot_emu's ColdFire (emulator, not a chip), per audio frame of one track: two render calls.

    python3 -B bench.py --emulator <ot_emu> --main <a MAIN image the emulator boots> --output <new private folder>
        [--source <another amiga.c, e.g. git show REV:sdk/octatrack/modules/amiga/amiga.c>] [--compare <an earlier output>]
        [--frames N] [--cases a,b]

amiga.c is compiled for the ColdFire as the package is and placed in free emulator RAM with two stand-ins for stock's FLEX
render and START (STOCK below: a model reader that writes the frame packet, and a START that puts the reader where STRT
says), called through the module's own jsr sites. The bench sets up the lane, stock's voice, the sample's record and its
pages as the render reads them, then calls amiga_render twice a frame through each case, with the frame interrupt off and
every interrupt masked in the call. A PC watch on every instruction of the module's code gives, per frame: the instructions
it ran, the 16-byte lines of code they came from, and the lines of data they read or wrote, by region (the module's own
memory, the sample's pages, stock's memory, the stack; on-chip SRAM at 0x80000000 is not cached and not counted;
battery RAM counts reads). On the unit a render's time follows those lines more than its instructions: every line not in
the cache is a fetch from SDRAM, and the renders between two of a track's calls evict them (docs/MODULE_PERFORMANCE.md).
The stand-ins' own instructions are not counted, nor stock's reader and START, which a FLEX track pays as well.

Each case also writes stream.bin: every frame the render handed to the DSP, stock's voice and the lane after each call,
and a checksum of what the stand-ins saw of the lane. --compare checks each case's stream against another run's, so a
change to the engine can be shown to hand the DSP the same samples bit for bit (the sweeps move every control, start notes
and make the sample unreadable now and then while they play). The firmware and the emulator stay outside the repository.
"""
import argparse
import json
import math
import pathlib
import random
import re
import struct
import subprocess
import sys
import tempfile

HERE = pathlib.Path(__file__).resolve().parent
SDK = next(p for p in HERE.parents if (p / 'machines/octatrack/include/modwerk_events.h').exists())
sys.path.insert(0, str(SDK / 'octabam/modules/track-solo'))  # its ot_emu session: poke, call, watch
from emulator_test import Emulator  # noqa: E402

CODE, SOURCE, BASES, MAP, CALLER = 0x47031000, 0x47080000, 0x47070000, 0x47071000, 0x4702f000
SLOT, IDS, RECORD = 0x46c922c4 + 44, 0x46c920a4, 0x100bf000  # Flex slot 1's state record and id, the sample's settings record
VOICE, LANE, FP_PTR, CURSOR, PACKET, TEMPO24 = 0x800049d8, 0x80000510, 0x800062a8, 0x80001c80, 0x80001c90, 0x8000181c
FRAMES, PERPAGE = 44100, 1536  # a 16-bit stereo sample, 1,536 frames a 6,144-byte page
FLAGS = ['-mcpu=5475', '-msoft-float', '-O2', '-ffreestanding', '-fno-builtin', '-fno-common', '-fno-jump-tables',
         '-fno-asynchronous-unwind-tables', '-fno-ident', '-fomit-frame-pointer', '-I', str(SDK / 'machines/octatrack/include')]
# STR: 0 OFF 1 ON 2 PCH 3 SYNC; bits is the saved value (bits - 4); pitch in semitones; bpm the sample's ORIGINAL TEMPO at 126
CASES = {
    'silent': dict(sounding=0),
    'on-16bit': dict(str=1, bits=12),
    'on-8bit': dict(str=1),
    'sync-same-tempo': dict(str=3, bpm=126),
    'sync-115-at-126': dict(str=3, bpm=115),
    'off-8bit': dict(str=0),
    'on-octave-up': dict(str=1, pitch=12),
    'on-spd32': dict(str=1, spd=32),
    'on-srr16': dict(str=1, srr=16),
    'on-led': dict(str=1, led=1),
    'on-octave-srr-led': dict(str=1, pitch=12, srr=16, led=1),
    'dearest': dict(str=1, pitch=12, spd=32, grn=0, srr=6, led=1),
    'sweep': dict(sweep=7), 'sweep2': dict(sweep=11), 'sweep3': dict(sweep=13),
}
STOCK = r'''
#include <stdint.h>
#define U8(a) (*(volatile uint8_t *)(uintptr_t)(a))
#define U16(a) (*(volatile uint16_t *)(uintptr_t)(a))
#define U32(a) (*(volatile uint32_t *)(uintptr_t)(a))
volatile uint32_t bench_rate = 0x10000, bench_acc, bench_source, bench_frames, bench_sum;
static void mix(uint32_t x) { bench_sum = (bench_sum ^ x) * 16777619u + 1u; }
static void lane(void) { uintptr_t fp = U32(0x800062a8u); mix(U32(fp)); mix(U32(fp + 4)); mix(U32(fp + 8)); mix(U32(fp + 24)); mix(U32(fp + 28)); }
int bench_render(unsigned track, unsigned ping, unsigned start, unsigned end)
{
    uintptr_t voice = 0x800049d8u + 168u * track, at = U32(0x80001c80u);
    (void)ping;
    lane();
    if (!U8(voice)) return 0;
    uint32_t acc = bench_acc + (end - start) * bench_rate, n = acc >> 16, reader = U32(voice + 68);
    bench_acc = acc & 0xffffu;
    U32(at) = n | (end - start) << 8; U32(at + 4) = 0; U32(at + 8) = 0; U32(at + 12) = 0;
    volatile int32_t *pcm = (volatile int32_t *)(at + 16);
    for (uint32_t i = 0; i < n; ++i, ++reader) {
        if (reader >= bench_frames) reader = 0; /* looped */
        const volatile uint8_t *p = (const volatile uint8_t *)(bench_source + reader * 4u);
        pcm[2 * i] = (int32_t)((uint32_t)(p[0] << 8 | p[1]) << 16);
        pcm[2 * i + 1] = (int32_t)((uint32_t)(p[2] << 8 | p[3]) << 16);
    }
    U32(voice + 68) = reader;
    U32(0x80001c80u) = at + 16 + 8 * n;
    return 0;
}
int bench_start(unsigned track, unsigned sample, unsigned flags)
{
    uintptr_t voice = 0x800049d8u + 168u * track, record = U32(voice + 8);
    uint32_t length = bench_frames, strt = U16(U32(0x800062a8u) + 2);
    uint32_t frame = (length >> 15) * strt + (((length & 32767u) * strt) >> 15);
    lane(); mix(0x5354u); mix(sample); mix(flags); mix(U32(record + 300)); mix(U32(record + 304));
    U8(voice) = 1; U8(voice + 23) = 1;
    U32(voice + 40) = frame; U32(voice + 44) = length; U32(voice + 48) = frame; U32(voice + 68) = frame;
    return 1;
}
'''
# track-solo's caller with every interrupt masked around the call: nothing else runs inside it.
CALL = '''
        .text
caller: move.l %sp,0x4702f140
        move.w %sr,%d0
        move.l %d0,0x4702f148
        move.w #0x2700,%sr
        move.l 0x4702f120,-(%sp)
        move.l 0x4702f11c,-(%sp)
        move.l 0x4702f118,-(%sp)
        move.l 0x4702f114,-(%sp)
        move.l 0x4702f110,-(%sp)
        move.l 0x4702f10c,-(%sp)
        move.l 0x4702f108,-(%sp)
        move.l 0x4702f104,-(%sp)
        move.l 0x4702f100,%a0
        jsr (%a0)
        lea 32(%sp),%sp
        move.l 0x4702f148,%d1
        move.w %d1,%sr
        move.l %sp,0x4702f144
        rts
'''


def sh(*args):
    return subprocess.run(args, check=True, capture_output=True, text=True).stdout


def build(source, tmp):
    """The module and the stand-ins linked at CODE, the module's jsr sites to stock aimed at the stand-ins, the caller."""
    (tmp / 'stock.c').write_text(STOCK)
    (tmp / 'call.s').write_text(CALL)
    sh('m68k-elf-gcc', *FLAGS, '-c', str(source), '-o', str(tmp / 'amiga.o'))
    sh('m68k-elf-gcc', *FLAGS, '-c', str(tmp / 'stock.c'), '-o', str(tmp / 'stock.o'))
    sh('m68k-elf-ld', f'-Ttext={CODE:#x}', '-e', 'amiga_render', str(tmp / 'amiga.o'), str(tmp / 'stock.o'), '-o', str(tmp / 'bench.elf'))
    sh('m68k-elf-as', '-mcpu=54455', str(tmp / 'call.s'), '-o', str(tmp / 'call.o'))
    sh('m68k-elf-ld', f'-Ttext={CALLER:#x}', '-e', 'caller', '--oformat=binary', str(tmp / 'call.o'), '-o', str(tmp / 'call.bin'))
    sym, size = {}, {}
    for line in sh('m68k-elf-nm', '-S', str(tmp / 'bench.elf')).splitlines():
        f = line.split()
        sym[f[-1]] = int(f[0], 16)
        if len(f) == 4:
            size[f[-1]] = int(f[1], 16)
    sh('m68k-elf-objcopy', '-O', 'binary', '-j', '.text', '-j', '.rodata', '-j', '.data', str(tmp / 'bench.elf'), str(tmp / 'bench.bin'))
    image = (tmp / 'bench.bin').read_bytes()
    for stock, stand_in in ((0x40004008, 'bench_render'), (0x4000f450, 'bench_start')):
        site = b'\x4e\xb9' + stock.to_bytes(4, 'big')
        assert site in image, f'no jsr {stock:#x} in the module'
        image = image.replace(site, b'\x4e\xb9' + sym[stand_in].to_bytes(4, 'big'))
    stand_ins = [line.split()[-1] for line in sh('m68k-elf-nm', str(tmp / 'stock.o')).splitlines() if line.split()[-2] in 'Tt']
    skip = [(sym[k], sym[k] + size[k]) for k in stand_ins]  # the stand-ins' code is not the module's
    code = {}
    for line in sh('m68k-elf-objdump', '-d', '--no-show-raw-insn', str(tmp / 'bench.elf')).splitlines():
        m = re.match(r'\s*([0-9a-f]+):\s+(\S+)\s*(.*)$', line)
        if m and not any(lo <= int(m.group(1), 16) < hi for lo, hi in skip):
            code[int(m.group(1), 16)] = (m.group(2), re.sub(r'\s*<[^>]*>', '', m.group(3)))
    return image, (tmp / 'call.bin').read_bytes(), sym, code, sym.get('_end', CODE + len(image) + 0x3000)


def operands(text):
    out, depth, cur = [], 0, ''
    for ch in text:
        depth += (ch == '(') - (ch == ')')
        if ch == ',' and not depth:
            out.append(cur.strip())
            cur = ''
        else:
            cur += ch
    return out + [cur.strip()] if cur.strip() else out


def accesses(mnemonic, ops, hit):
    """(address, bytes) an instruction reads or writes, from its operands and the registers before it ran."""
    def reg(name):
        return hit['sp'] if name == '%sp' else hit['a'][6] if name == '%fp' else hit[name[1]][int(name[2])]
    size = {'b': 1, 'w': 2, 'l': 4}.get(mnemonic[-1], 4)
    if mnemonic in ('lea', 'pea') or re.match(r'^(b(ra|sr|eq|ne|cc|cs|hi|ls|ge|gt|le|lt|mi|pl|vc|vs)[swl]?|jmp|jsr)$', mnemonic):
        return [(hit['sp'] - 4, 4)] if mnemonic in ('pea', 'jsr') or mnemonic.startswith('bsr') else []
    if mnemonic == 'rts':
        return [(hit['sp'], 4)]
    if mnemonic.startswith('link'):
        return [(hit['sp'] - 4, 4)]
    if mnemonic == 'unlk':
        return [(hit['a'][6], 4)]
    count = 1
    if mnemonic.startswith('moveml'):
        count = 0
        for part in (ops[0] if '@' not in ops[0] else ops[1]).replace('%fp', '%a6').split('/'):
            first, _, last = part.partition('-')
            count += int((last or first)[-1]) - int(first[-1]) + 1
    out = []
    for op in ops:
        if op.startswith('#') or op.startswith('%') and '@' not in op:
            continue
        m = re.match(r'(%\w+)@(\+|-)?(?:\((-?[0-9a-fx]+)(?:,(%\w+):([wl])(?::(\d))?)?\))?$', op)
        if m:
            base, mode, disp, index, width, scale = m.groups()
            if base == '%pc':
                continue
            at = reg(base) - (size if mode == '-' else 0) + (int(disp, 16 if index else 10) if disp else 0)
            if index:
                x = reg(index)
                at += ((x & 0xffff) - ((x & 0x8000) << 1) if width == 'w' else x) * int(scale or 1)
            out.append((at & 0xffffffff, size * count))
        elif re.match(r'[0-9a-f]+$', op):
            out.append((int(op, 16), size * count))
        else:
            raise ValueError(f'operand {op!r} of {mnemonic}')
    return out


def hits(e):
    rows = []
    for r in e.command('hits').split()[2:]:
        f = [int(x, 16) for x in r.split(':')]
        rows.append(dict(pc=f[1], d=[f[2], f[3]] + f[12:18], a=[f[4], f[5]] + f[18:23], sp=f[6]))
    return rows


def sample():
    rng, out = random.Random(1), bytearray()
    for i in range(FRAMES):  # a tone pair with noise, 16-bit stereo, big-endian
        out += struct.pack('>hh', int(12000 * math.sin(2 * math.pi * 110 * i / 44100)) + rng.randrange(-3000, 3000),
                           int(9000 * math.sin(2 * math.pi * 165 * i / 44100)) + rng.randrange(-3000, 3000))
    return bytes(out)


def boot(a, out, image, caller, sym, code):
    """A freshly booted emulator (one a case: the emulator gives out a couple of hundred million instructions in)."""
    e = Emulator(a.emulator, a.main, out)
    e.write(CALLER, caller)
    e.call_ready = True
    e.command('frame off')
    arena = int.from_bytes(e.read(0x4000045e, 4), 'big')  # stock's page base and count are code operands: read, never written
    assert int.from_bytes(e.read(0x40096f82, 4), 'big') > FRAMES // PERPAGE
    for off in range(0, len(image), 2048):
        e.write(CODE + off, image[off:off + 2048])
    for off in range(0, 0x3000, 2048):
        e.write(CODE + len(image) + off, bytes(2048))  # bss
    snd = sample()
    for off in range(0, len(snd), 4096):
        e.write(SOURCE + off, snd[off:off + 4096])
    pages = (FRAMES + PERPAGE - 1) // PERPAGE
    for p in range(pages):
        for off in range(0, 6144, 2048):
            if p * 6144 + off < len(snd):
                e.write(arena + (p + 1) * 6144 + off, snd[p * 6144 + off:p * 6144 + off + 2048])
    e.write(BASES, bytes(8))
    e.write(MAP, b''.join(struct.pack('>H', p + 1) for p in range(pages)))
    e.u32(0x80006918, BASES)
    e.u32(0x80006914, MAP)
    e.write(SLOT, struct.pack('>IIIIII', 3, 0, 0, 0, FRAMES, 0x1234))  # 16-bit stereo, frames, its id
    e.u32(IDS + 4, 0x1234)
    e.u32(sym['bench_source'], SOURCE)
    e.u32(sym['bench_frames'], FRAMES)
    e.command('watch ' + ','.join(hex(x) for x in sorted(code)))
    e.command('hits')
    return e, arena


def run(a):
    a.output.mkdir(parents=True, exist_ok=False)
    with tempfile.TemporaryDirectory() as tmp:
        image, caller, sym, code, end = build(a.source, pathlib.Path(tmp))
    names = sorted((v, k) for k, v in sym.items() if CODE <= v < CODE + len(image))
    report, same = {}, True
    for label in [c for c in CASES if not a.cases or c in a.cases.split(',')]:
        out = a.output / label
        out.mkdir()
        e, arena = boot(a, out, image, caller, sym, code)
        try:
            c = dict(sounding=1, str=3, bits=4, pitch=0, spd=64, grn=64, srr=0, led=0, bpm=126, rate=0x7f00, sweep=0) | CASES[label]
            rng = random.Random(c['sweep'])

            def controls(strt=0):
                e.write(LANE, struct.pack('>HHHHI', 0x4000 + c['pitch'] * 1280, strt, 0, c['rate'], c['spd'] << 24 | c['grn'] << 8))
                e.write(LANE + 25, bytes([0, c['led'], c['srr'], c['str'], c['bits']]))
                e.u32(RECORD + 0x114, c['bpm'] * 24)
                e.u32(sym['bench_rate'], round(2 ** (c['pitch'] / 12) * 65536 * max(abs(c['rate'] - 0x4000), 0x100) / 0x3f00))

            def note():
                e.u32(sym['bench_acc'], 0)
                e.call(sym['amiga_start'], 0, 1, 0)
                e.command('hits')
            controls()
            e.u32(FP_PTR, LANE)
            e.u32(TEMPO24, 126 * 24)
            e.write(VOICE, bytes(168))
            e.u32(VOICE + 4, SLOT)
            e.u32(VOICE + 8, RECORD)
            e.write(RECORD + 300, struct.pack('>II', 0, FRAMES))
            e.u32(RECORD + 0x444, 0)
            note()
            if not c['sounding']:
                e.write(VOICE, b'\0')
            frames, by, stream = [], {}, bytearray()
            for f in range(a.frames):
                if c['sweep'] and f and f % 23 == 0:  # a knob moves, now and then a new note or a sample the crossfade cannot read
                    c |= dict(str=rng.choice((0, 1, 1, 2, 3, 3)), bits=rng.choice((4, 4, 12, 0, 8)), pitch=rng.choice((0, 0, 0, 12, -5, 7, -12)),
                              spd=rng.choice((64, 64, 64, 32, 0, 100, 127, 63)), grn=rng.choice((64, 64, 0, 10, 100, 127)),
                              srr=rng.choice((0, 0, 0, 6, 16, 127)), led=rng.choice((0, 0, 1)), bpm=rng.choice((126, 115, 140, 20)),
                              rate=rng.choice((0x7f00, 0x7f00, 0x7f00, 0x6000, 0x2000, 0)))
                    e.u32(IDS + 4, 0x1234 if rng.random() < 0.7 else 0x9999)
                    if rng.random() < 0.3:
                        controls(rng.randrange(0, 0x4000))
                        note()
                    else:
                        controls()
                frame = dict(instructions=0, code=0, module=0, sample=0, stock=0, stack=0, battery=0)
                cut = rng.choice((9, 9, 9, 8, 7, 0, 16, 1, 15)) if c['sweep'] else 9  # the frame's two calls, an empty one now and then
                for start, stop in ((0, cut), (cut, 16)):
                    e.u32(CURSOR, PACKET)
                    e.call(sym['amiga_render'], 0, 0, start, stop)
                    after = int.from_bytes(e.read(CURSOR, 4), 'big')
                    if after > PACKET + 16:
                        stream += e.read(PACKET + 16, after - PACKET - 16)  # the frames handed to the DSP
                    stream += e.read(VOICE, 1) + e.read(VOICE + 40, 12) + e.read(LANE, 12) + e.read(LANE + 24, 8) + e.read(sym['bench_sum'], 4)
                    rows = hits(e)
                    sp = rows[0]['sp'] if rows else 0
                    lines = {k: set() for k in ('code', 'module', 'sample', 'stock', 'stack')}
                    for r in rows:
                        lines['code'].add(r['pc'] >> 4)
                        mnemonic, text = code[r['pc']]
                        for at, n in accesses(mnemonic, operands(text), r):
                            for line in range(at >> 4, (at + n - 1 >> 4) + 1):
                                x = line << 4
                                if 0x80000000 <= x < 0x81000000:
                                    continue
                                if 0x10000000 <= x < 0x11000000:
                                    frame['battery'] += 1
                                    continue
                                lines['stack' if sp - 0x1000 <= x <= sp + 0x40 else 'module' if CODE <= x < end else
                                      'sample' if arena <= x < arena + 0x40000 else 'stock'].add(line)
                        fn = max((v, k) for v, k in names if v <= r['pc'])[1]
                        by[fn] = by.get(fn, 0) + 1
                    frame['instructions'] += len(rows)
                    for k, v in lines.items():
                        frame[k] += len(v)
                frames.append(frame)
            (out / 'stream.bin').write_bytes(bytes(stream))
            mean = {k: round(sum(f[k] for f in frames) / len(frames), 1) for k in frames[0]}
            report[label] = dict(settings=c, frames=len(frames), meanPerFrame=mean, worstFrame=max(frames, key=lambda f: f['instructions']),
                                 instructionsByFunction={k: round(v / len(frames), 1) for k, v in sorted(by.items(), key=lambda x: -x[1])})
            verdict = ''
            if a.compare:
                other = a.compare / label / 'stream.bin'
                ok = other.exists() and other.read_bytes() == bytes(stream)
                same &= ok
                verdict = '; stream the same as ' + str(a.compare) if ok else '; STREAM DIFFERS from ' + str(a.compare)
            print(f"{label}: per frame {mean['instructions']} instructions, {mean['code']} lines of code, {mean['module']} of the module's "
                  f"data, {mean['sample']} of the sample, {mean['stock']} of stock's, {mean['battery']} battery reads{verdict}", flush=True)
        finally:
            e.close()
    (a.output / 'report.json').write_text(json.dumps(dict(
        method='ot_emu PC-watch trace of the module\'s code in amiga_render, two calls a frame, stock\'s reader and START modelled '
               'and not counted; lines are distinct 16-byte lines a frame', hardwareTested=False, source=str(a.source), cases=report), indent=2) + '\n')
    if not same:
        sys.exit('streams differ')


if __name__ == '__main__':
    p = argparse.ArgumentParser()
    p.add_argument('--emulator', type=pathlib.Path, required=True)
    p.add_argument('--main', type=pathlib.Path, required=True)
    p.add_argument('--output', type=pathlib.Path, required=True)
    p.add_argument('--source', type=pathlib.Path, default=HERE / 'amiga.c')
    p.add_argument('--compare', type=pathlib.Path)
    p.add_argument('--frames', type=int, default=300)
    p.add_argument('--cases', default='')
    run(p.parse_args())
