# SPDX-License-Identifier: GPL-3.0-or-later
"""The module build: a folder with mod.json and its sources -> one format-2 .elemod.

    python -m <package>.sdk.build MODDIR --stock <stock OS file> [--out DIR]

C sources are compiled and assembly sources assembled with the device's cross toolchain (the profile's
prefix, or $ELEKLOADER_CROSS), then combined with `ld -r` into the four placeable sections .boot, .run,
.fast and .bss. DSP56300 sources (on a device whose OS uploads DSP code) are assembled with dsp_asm
($ELEKLOADER_DSP_ASM). The stock file is needed twice: every site is checked against its stock bytes, and
runs of the module's code that repeat the stock image are stored as references into the musician's own
image instead of as bytes.

mod.json keys: id, version, title, description, category, author, license, device, os, sources, fixed,
defsym, cflags, name_string, sites, subscribe, subscribe_dsp, machines, collections, contribute, dsp,
weak, copied, resources, requires, conflicts, storage and ports (per OS version, the keys that differ;
such a build is written as <id>-<version>-os<os>.elemod).

Site ops: jsr/jmp (a long call or jump to `target`, nop-padded to the stock length), keep2 (the stock
opcode word with `target` as its long operand), ptr (four bytes: `target`'s address), bytes (`new` in
hex, optional `kind` and `relocs`) and dsp_jsr (`jsr >target` over one two-word DSP instruction). An
`addend` adds to a target's address.
"""
import argparse
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys

from .. import devices, elemod, formats, link
from ..mkmod import stock_parts
from . import elf

OPS = {'jsr': b'\x4e\xb9', 'jmp': b'\x4e\xf9'}
# The headers folder beside this file, on every compile's include path after the module's own folder.
INCLUDE = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'include')
KEEP = ('.boot', '.run', '.fast', '.bss')
STOCK_MIN = 8
LD_SCRIPT = """/* One module's objects -> one relocatable object (ld -r), in the four sections
   the linker places: .boot (the core only), .run, .fast, .bss. */
SECTIONS
{
    .boot 0 : { *(.boot) }
    .run  0 : { *(.run) *(.text) *(.text.*) *(.data) *(.data.*) *(.rodata) *(.rodata.*) *(.sdata) *(.sdata.*) }
    .fast 0 : { *(.fast) }
    .bss  0 : { *(.bss) *(.bss.*) *(.sbss) *(.sbss.*) *(COMMON) }
    /DISCARD/ : { *(.comment) *(.note*) *(.gnu.attributes) }
}
"""
DSP_JSR = b'\x80\xf0\x0b'                   # jsr >xxxx (opcode 0x0bf080, stored low byte first); the address word follows
DSP_ORGS = (0x100000, 0x200000)             # the two origins every DSP source is assembled at
PORT_FIXED = ('id', 'version', 'device', 'os', 'ports')   # keys that say which module it is: a port keeps them


class BuildError(Exception):
    pass


def sha(b):
    return hashlib.sha256(b).hexdigest()


def _file_sha(path):
    with open(path, 'rb') as fh:
        return sha(fh.read())


def _is_int(v):
    return isinstance(v, int) and not isinstance(v, bool)


def bytes_relocs(addr, new, relocs):
    """Checks a `bytes` site's relocations: each [offset, "abs32", "sym:NAME" or "abs", addend], all four
    bytes inside `new`, no two overlapping. Returns copies of them."""
    if not isinstance(relocs, list):
        raise BuildError('site 0x%08x: "relocs" is a list of [offset, "abs32", "sym:NAME", addend]'
                         % addr)

    def well_formed(r):
        if not (isinstance(r, list) and len(r) == 4):
            return False
        at, kind, tgt, add = r
        return (_is_int(at) and kind == 'abs32' and 0 <= at <= len(new) - 4 and isinstance(tgt, str)
                and (tgt == 'abs' or (tgt.startswith('sym:') and len(tgt) > 4)) and _is_int(add))
    checked = []
    for r in relocs:
        if not well_formed(r):
            raise BuildError('site 0x%08x: a relocation is [offset, "abs32", "sym:NAME", addend] '
                             'inside the new bytes, not %r' % (addr, r))
        checked.append(list(r))
    starts = sorted(r[0] for r in checked)
    for lo, hi in zip(starts, starts[1:]):
        if hi - lo < 4:
            raise BuildError('site 0x%08x: two relocations overlap' % addr)
    return checked


def run(cmd):
    """Runs one tool; its stdout, or BuildError with the command line and everything it printed."""
    try:
        done = subprocess.run(cmd, capture_output=True, text=True)
    except FileNotFoundError:
        raise BuildError('%s is not installed (the device\'s cross toolchain; see '
                         'docs/ADAPTING.md)' % cmd[0])
    if done.returncode:
        raise BuildError('%s\n%s%s' % (' '.join(cmd), done.stdout, done.stderr))
    return done.stdout


def _check_label_words(src, lines):
    """dsp_asm substitutes a label's address wherever the label's text occurs, so a label that is part of a
    longer word would corrupt that word: refuse it."""
    labels = [t.split(':')[0].strip() for t in lines if ':' in t and ',' not in t]
    for n, t in enumerate(lines, 1):
        for label in labels:
            for hit in re.finditer(re.escape(label), t):
                after = t[hit.end():hit.end() + 1]
                before = t[hit.start() - 1] if hit.start() else ''
                if re.match(r'\w', after) or (hit.start() and re.match(r'\w', before)):
                    raise BuildError('%s:%d: the label %s is part of a longer word here, and '
                                     'dsp_asm replaces labels wherever their text appears; '
                                     'rename it' % (src, n, label))


def _assemble_at(asm, src, stem, k, org):
    """One dsp_asm run at `org` -> (24-bit words, {label: word offset from org})."""
    blob, table = '%s.%d.bin' % (stem, k), '%s.%d.sym' % (stem, k)
    run([asm, '-in', src, '-org', '%x' % org, '-out', blob, '-sym', table])
    with open(blob, 'rb') as fh:
        data = fh.read()
    words = [data[i] | (data[i + 1] << 8) | (data[i + 2] << 16) for i in range(0, len(data), 3)]
    labels = {}
    with open(table) as fh:
        for line in fh:
            if line.strip():
                name, at = line.split()
                labels[name] = int(at, 16) - org
    return words, labels


def dsp_assemble(src, work):
    """Assembles a DSP56300 source -> (its words, {label: word}, [(word index, the word it addresses)]).

    The source is assembled at both DSP_ORGS. A word that differs between the two by exactly their distance
    holds an address inside the code: it is zeroed and becomes a relocation. Any other difference is an
    address the linker cannot place (a short or packed operand) and is refused. Relative branches do not
    move. Both origins are above 16 bits, so every address operand takes its long form."""
    asm = os.environ.get('ELEKLOADER_DSP_ASM', 'dsp_asm')
    if not (os.path.isfile(asm) or shutil.which(asm)):
        raise BuildError('%s is not installed: DSP code is assembled with octabam\'s dsp_asm '
                         '(set ELEKLOADER_DSP_ASM; docs/ADAPTING.md)' % asm)
    with open(src) as fh:
        lines = [line.split(';')[0] for line in fh.read().splitlines()]
    _check_label_words(src, lines)
    stem = os.path.join(work, 'dsp-' + os.path.splitext(os.path.basename(src))[0])
    words, labels = _assemble_at(asm, src, stem, 0, DSP_ORGS[0])
    moved, moved_labels = _assemble_at(asm, src, stem, 1, DSP_ORGS[1])
    if len(words) != len(moved) or labels != moved_labels:
        raise BuildError('%s: assembles to different code at two origins' % src)
    shift, rels = DSP_ORGS[1] - DSP_ORGS[0], []
    for i, (low, high) in enumerate(zip(words, moved)):
        if low == high:
            continue
        if high - low != shift or not 0 <= low - DSP_ORGS[0] <= len(words):
            raise BuildError('%s: word %d (+0x%x) holds an address the linker cannot place '
                             '(0x%06x at P:0x%x, 0x%06x at P:0x%x); use an instruction that '
                             'takes it as a whole word' % (src, i, i, low, DSP_ORGS[0], high,
                                                           DSP_ORGS[1]))
        rels.append((i, low - DSP_ORGS[0]))
        words[i] = 0
    return words, labels, rels


def for_release(mod, dev, rel):
    """-> (mod.json as built for this device and OS release, whether a port was applied). A port's keys
    replace the top level's."""
    ports = mod.get('ports', {})
    if not isinstance(ports, dict) or not all(isinstance(p, dict) for p in ports.values()):
        raise BuildError('mod.json: "ports" maps an OS version to the keys that differ there')
    if mod.get('device', dev.key) == dev.key:
        if mod.get('os', rel.version) == rel.version:
            return mod, False
        if rel.version in ports:
            port = ports[rel.version]
            kept = sorted(k for k in port if k in PORT_FIXED)
            if kept:
                raise BuildError('mod.json: the %s port changes %s; a port gives only what '
                                 'differs on that OS' % (rel.version, ', '.join(kept)))
            ported = dict(mod, **port)
            ported['os'] = rel.version
            return ported, True
    listed = ' (ports: %s)' % ', '.join(sorted(ports)) if ports else ''
    raise BuildError('mod.json is for %s %s%s; the stock file is %s %s'
                     % (mod.get('device'), mod.get('os'), listed, dev.key, rel.version))


def _parts(data, image, dev):
    """A section's bytes as .elemod parts: ['hex', bytes] or ['stock', address, length]."""
    return [['hex', p[1].hex()] if p[0] == 'hex' else ['stock', '0x%08x' % p[1], p[2]]
            for p in stock_parts(data, image, STOCK_MIN, dev.main_load)]


def _compile(mod, mdir, work, srcs, defs, tc, prefix):
    objs = []
    for s in srcs:
        o = os.path.join(work, os.path.basename(s) + '.o')
        if s.endswith('.c'):
            run([prefix + 'gcc'] + tc['cflags'] + mod.get('cflags', []) + ['-I', mdir, '-I', INCLUDE,
                                                                            '-c', s, '-o', o])
        else:
            run([prefix + 'as'] + tc['asflags'] + ['-I', mdir, '-I', INCLUDE] + defs + ['-o', o, s])
        objs.append(o)
    return objs


def _assemble_fixed(mod, mdir, work, defs, tc, prefix, objs):
    """Each `fixed` source as its own .fixed.<k> section -> {section name: (address, source)}."""
    fixed = {}
    for k, fx in enumerate(mod.get('fixed', [])):
        src = os.path.join(mdir, fx['source'])
        at = int(fx['addr'], 16) if isinstance(fx['addr'], str) else fx['addr']
        o = os.path.join(work, 'fixed%d.o' % k)
        run([prefix + 'as'] + tc['asflags'] + ['-I', mdir] + defs + ['-o', o, src])
        for sec in elf.Elf.load(o).sections:
            if sec.size and sec.flags & 2 and sec.name != '.text':
                raise BuildError('%s: fixed code may only have .text, not %s'
                                 % (fx['source'], sec.name))
        name = '.fixed.%d' % k
        run([prefix + 'objcopy', '--rename-section', '.text=' + name, o])
        if fx.get('symbol'):
            run([prefix + 'objcopy', '--add-symbol', '%s=%s:0,global' % (fx['symbol'], name), o])
        fixed[name] = (at, fx['source'])
        objs.append(o)
    return fixed


def _link(objs, fixed, work, mid, prefix):
    """ld -r of every object -> the combined Elf (an empty one when there is nothing to link)."""
    if not objs:
        e = elf.Elf.__new__(elf.Elf)
        e.sections, e.symbols, e.relocs = [], [], {}
        return e
    script = os.path.join(work, 'mod.ld')
    extra = ''.join('    %s 0 : { *(%s) }\n' % (n, n) for n in fixed)
    with open(script, 'w') as fh:
        fh.write(LD_SCRIPT.replace('    /DISCARD/', extra + '    /DISCARD/'))
    obj = os.path.join(work, mid + '.o')
    run([prefix + 'ld', '-r', '-d', '-T', script, '-o', obj] + objs)
    return elf.Elf.load(obj)


def _site(s, image, dev, symbols, imports):
    """One mod.json site -> its .elemod site."""
    addr = int(s['addr'], 16) if isinstance(s['addr'], str) else s['addr']
    stockb = bytes.fromhex(s['stock'])
    at = addr - dev.main_load
    if image[at:at + len(stockb)] != stockb:
        raise BuildError('site 0x%08x: the stock bytes are %s, not %s'
                         % (addr, image[at:at + len(stockb)].hex(), s['stock']))
    op, rels = s['op'], []
    add = int(s.get('addend', 0))
    if add and op not in OPS and op not in ('keep2', 'ptr', 'dsp_jsr'):
        raise BuildError('site 0x%08x: an addend needs a target (jsr, jmp, keep2, ptr or '
                         'dsp_jsr)' % addr)
    if op in OPS:
        if len(stockb) < 6 or len(stockb) % 2:
            raise BuildError('site 0x%08x: a jsr/jmp needs 6 or more (even) bytes' % addr)
        new = OPS[op] + bytes(4) + b'\x4e\x71' * ((len(stockb) - 6) // 2)
        rels, kind = [[2, 'abs32', 'sym:' + s['target'], add]], 'code'
    elif op == 'keep2':
        new = stockb[:2] + bytes(4)
        rels, kind = [[2, 'abs32', 'sym:' + s['target'], add]], 'code'
    elif op == 'ptr':
        new = bytes(4)
        rels, kind = [[0, 'abs32', 'sym:' + s['target'], add]], 'data'
    elif op == 'bytes':
        new = bytes.fromhex(s['new'])
        kind = s.get('kind', 'data')
        rels = bytes_relocs(addr, new, s.get('relocs', []))
    elif op == 'dsp_jsr':
        if not any(start <= addr and addr + len(stockb) <= start + n
                   for start, n in dev.dsp_payloads.values()):
            raise BuildError('site 0x%08x: a dsp_jsr goes in the DSP code the %s\'s OS '
                             'uploads (%s)' % (addr, dev.name, ', '.join(
                                 '0x%08x +0x%x' % v for v in dev.dsp_payloads.values())
                                 or 'it has none'))
        if len(stockb) != 6:
            raise BuildError('site 0x%08x: a dsp_jsr replaces one two-word DSP '
                             'instruction (6 bytes)' % addr)
        new = DSP_JSR + bytes(3)
        rels, kind = [[3, 'dsp24', 'sym:' + s['target'], add]], 'data'
    else:
        raise BuildError('site 0x%08x: op %r (jsr, jmp, keep2, ptr, bytes or dsp_jsr)' % (addr, op))
    if len(new) != len(stockb):
        raise BuildError('site 0x%08x: the new bytes are not as long as the stock ones' % addr)
    if kind == 'code':
        ok, note = elemod.insn_check(image, addr, len(stockb), dev)
        if not ok:
            raise BuildError('site 0x%08x: %s. A code site must cover whole stock '
                             'instructions' % (addr, note))
    _note_imports(rels, symbols, imports)
    return {'addr': '0x%08x' % addr, 'len': len(stockb), 'stock_sha256': sha(stockb),
            'new': new.hex(), 'kind': kind, 'relocs': rels}


def _note_imports(rels, symbols, imports):
    for _at, _kind, tgt, _add in rels:
        if tgt.startswith('sym:') and tgt[4:] not in symbols:
            imports.add(tgt[4:])


def build(mdir, stock_path, out_dir=None, extra=None):
    """Builds the module in `mdir` against the stock OS file -> (the .elemod's path, its link.Mod2).
    `extra` ({'sites', 'contribute', 'sources'}) adds parts a generator computed."""
    with open(os.path.join(mdir, 'mod.json')) as fh:
        mod = json.load(fh)
    extra = extra or {}
    try:
        stock, dev, rel = formats.load(stock_path)
    except (devices.UnknownFirmware, formats.FormatError) as e:
        raise BuildError(str(e))
    mod, ported = for_release(mod, dev, rel)
    image = formats.main_image(stock, dev)
    if sha(image) != rel.main_sha256:
        raise BuildError('the stock main OS is not the known image')
    tc = dev.toolchain
    if not tc:
        raise BuildError('no toolchain in the %s profile' % dev.key)
    prefix = os.environ.get('ELEKLOADER_CROSS', tc['prefix'])
    mid, version = mod['id'], str(mod['version'])
    out_dir = out_dir or os.path.join(mdir, 'out')
    work = os.path.join(out_dir, mid + '.work')
    os.makedirs(work, exist_ok=True)

    srcs = [os.path.join(mdir, s) for s in mod.get('sources', [])] + list(extra.get('sources', []))
    if mod.get('name_string'):
        named = os.path.join(work, 'name.s')
        with open(named, 'w') as fh:
            fh.write('        .section .run, "ax"\n        .globl  str_name\n'
                     'str_name: .asciz "%s %s"\n        .balign 2\n' % (mod['name_string'], version))
        srcs.append(named)
    if not (srcs or mod.get('sites') or extra.get('sites') or mod.get('fixed') or mod.get('dsp')):
        raise BuildError('mod.json names no sources and no sites: nothing to build')
    defs = [a for k, v in mod.get('defsym', {}).items() for a in ('--defsym', '%s=%s' % (k, v))]
    objs = _compile(mod, mdir, work, srcs, defs, tc, prefix)
    fixed = _assemble_fixed(mod, mdir, work, defs, tc, prefix, objs)
    e = _link(objs, fixed, work, mid, prefix)

    # The placeable sections: index -> name, and the fixed ones by index.
    secs, sec_of, fsec = {}, {}, {}
    for s in e.sections:
        if s.name in fixed:
            fsec[s.idx] = s
        elif s.name in KEEP and s.size:
            sec_of[s.idx] = s.name
            if s.name == '.bss':
                secs['.bss'] = {'align': max(4, s.align), 'size': s.size}
            else:
                secs[s.name] = {'align': max(4, s.align), 'len': s.size, 'parts': _parts(s.data, image, dev)}
        elif s.size and s.flags & 2 and s.name not in KEEP:          # SHF_ALLOC
            raise BuildError('section %s is not one the linker places (.run, .fast, .bss, '
                             '.boot)' % s.name)
    if '.boot' in secs and mid != 'core':
        raise BuildError('only the core mod may have a .boot section')

    symbols, exports, imports = {}, [], set()
    for y in e.symbols:
        if not y.name or y.type in (elf.STT_SECTION, elf.STT_FILE) or y.name.startswith('.L'):
            continue
        if y.shndx == elf.SHN_UNDEF:
            continue
        if y.shndx == elf.SHN_ABS:
            where = ['abs', y.value]
        elif y.shndx in fsec:
            where = ['abs', fixed[fsec[y.shndx].name][0] + y.value]
        elif y.shndx in sec_of:
            where = [sec_of[y.shndx], y.value]
        else:
            continue
        if y.bind == elf.STB_LOCAL and y.name in symbols:     # a global of the same name wins
            continue
        symbols[y.name] = where
        if y.bind in (elf.STB_GLOBAL, elf.STB_WEAK):
            exports.append(y.name)

    def target(y, add):
        base = 0 if y.type == elf.STT_SECTION else y.value
        if y.shndx == elf.SHN_UNDEF:
            imports.add(y.name)
            return 'sym:' + y.name, add
        if y.shndx == elf.SHN_ABS:
            return 'abs', y.value + add
        if y.shndx in fsec:
            return 'abs', fixed[fsec[y.shndx].name][0] + base + add
        if y.shndx in sec_of:
            return 'sec:' + sec_of[y.shndx], base + add
        raise BuildError('a relocation against %s in section %d' % (y.name, y.shndx))

    relocs, frel = [], {}
    for tidx, entries in sorted(e.relocs.items()):
        if tidx not in sec_of and tidx not in fsec:
            if e.sections[tidx].flags & 2:
                raise BuildError('relocations in %s' % e.sections[tidx].name)
            continue
        sec = sec_of.get(tidx) or e.sections[tidx].name
        for off, typ, y, add in entries:
            if typ == elf.R_68K_NONE:
                continue
            if typ not in (elf.R_68K_32, elf.R_68K_PC32, elf.R_68K_PC16):
                raise BuildError('relocation type %d at %s+0x%x (%s): only 32-bit absolute and '
                                 '32/16-bit PC-relative references can be relocated'
                                 % (typ, sec, off, y.name))
            tgt, a = target(y, add)
            if tidx in fsec:
                frel.setdefault(tidx, []).append([off, elf.RNAMES[typ], tgt, a])
            else:
                relocs.append([sec, off, elf.RNAMES[typ], tgt, a])

    dsrcs = []
    for ds in mod.get('dsp', []):            # one .dsp.<payload> section per payload, sources in order
        tag = ds.get('payload')
        if tag not in dev.dsp_payloads:
            raise BuildError('dsp %s: payload %r; the %s has %s' % (
                ds.get('source'), tag, dev.name,
                ', '.join(sorted(dev.dsp_payloads)) or 'no DSP code in its OS'))
        src = os.path.join(mdir, ds['source'])
        dsrcs.append(src)
        words, labels, rels = dsp_assemble(src, work)
        sec = '.dsp.' + tag
        raw = secs.get(sec, {}).get('raw', b'')
        first = len(raw) // 3
        for name, w in labels.items():
            if name in symbols:
                raise BuildError('%s: label %s is also a symbol of the mod' % (ds['source'], name))
            symbols[name] = [sec, 3 * (first + w)]
        for i, w in rels:
            relocs.append([sec, 3 * (first + i), 'dsp24', 'sec:' + sec, first + w])
        secs[sec] = {'raw': raw + b''.join(bytes((x & 0xFF, (x >> 8) & 0xFF, x >> 16)) for x in words)}
    for sec in [s for s in secs if s.startswith('.dsp.')]:
        raw = secs[sec]['raw']
        secs[sec] = {'len': len(raw), 'parts': _parts(raw, image, dev)}

    sites = []
    for idx, s in sorted(fsec.items()):
        at, src = fixed[s.name]
        if not s.size:
            raise BuildError('%s: no code to place' % src)
        if not any(lo <= at and at + s.size <= hi for lo, hi in dev.image_free):
            raise BuildError('%s: 0x%08x-0x%08x is not inside a free area of the %s image (%s)'
                             % (src, at, at + s.size, dev.name,
                                ', '.join('0x%08x-0x%08x' % ab for ab in dev.image_free)
                                or 'it declares none'))
        stockb = image[at - dev.main_load:at - dev.main_load + s.size]
        if any(stockb):
            raise BuildError('%s: the stock bytes at 0x%08x are not all zero' % (src, at))
        sites.append({'addr': '0x%08x' % at, 'len': s.size, 'stock_sha256': sha(stockb),
                      'new': s.data.hex(), 'kind': 'data', 'relocs': frel.get(idx, [])})
    for s in mod.get('sites', []) + list(extra.get('sites', [])):
        sites.append(_site(s, image, dev, symbols, imports))

    def entry(to, order, data, rels, claims):
        return {'to': to, 'order': order, 'data': data, 'relocs': rels, 'claims': claims}
    contrib = [entry(sub['event'], sub.get('order', 50), '00000000',
                     [[0, 'abs32', 'sym:' + sub['fn'], 0]], [])
               for sub in mod.get('subscribe', [])]
    contrib += [entry(sub['event'], sub.get('order', 50), (DSP_JSR + bytes(3)).hex(),
                      [[3, 'dsp24', 'sym:' + sub['fn'], int(sub.get('addend', 0))]], [])
                for sub in mod.get('subscribe_dsp', [])]
    resources = dict(mod.get('resources', {}))
    for mc in mod.get('machines', []):       # an SRC machine: a pointer in core_machines, and its id claimed
        n = mc.get('id')
        if not isinstance(n, int) or not 4 <= n <= 127 or not mc.get('descriptor'):
            raise BuildError('mod.json: a machine is {"id": 4-127, "descriptor": "its symbol"}, '
                             'not %r' % (mc,))
        contrib.append(entry('core_machines', mc.get('order', 50), '00000000',
                             [[0, 'abs32', 'sym:' + mc['descriptor'], 0]], []))
        names = list(resources.get('names', []))
        if 'machine:%d' % n not in names:
            resources['names'] = names + ['machine:%d' % n]
    contrib += [entry(c['to'], c.get('order', 50), c['data'], c.get('relocs', []), c.get('claims', []))
                for c in mod.get('contribute', []) + list(extra.get('contribute', []))]
    for c in contrib:
        _note_imports(c['relocs'], symbols, imports)
    weak = list(mod.get('weak', []))
    imports |= set(weak)

    doc = {
        'elemod': 2, 'id': mid, 'version': version,
        'title': mod.get('title', mid), 'description': mod.get('description', ''),
        'category': mod.get('category', ''), 'author': mod.get('author', ''),
        'license': mod.get('license', ''),
        'target': devices.target_of(dev, rel),
        'sections': secs, 'symbols': symbols, 'exports': sorted(exports),
        'imports': sorted(imports - set(symbols)), 'weak': sorted(weak),
        'relocs': relocs, 'sites': sites,
        'collections': {k: dict(v) if isinstance(v, dict) else {'entry': v}
                        for k, v in mod.get('collections', {}).items()},
        'contribute': contrib, 'copied': mod.get('copied', []),
        'resources': resources,
        'requires': mod.get('requires', []), 'conflicts': mod.get('conflicts', []),
        'build': {'sources': {os.path.basename(s): _file_sha(s) for s in srcs + dsrcs}},
        'signature': None,
    }
    if mod.get('storage'):
        doc['storage'] = mod['storage']
    raw = (json.dumps(doc, indent=1) + '\n').encode()
    try:
        m = link.Mod2(json.loads(raw), mid)          # the linker's own validation of the result
    except elemod.ModError as e:
        raise BuildError('the result does not validate: %s' % e)
    path = os.path.join(out_dir, '%s-%s%s.elemod' % (mid, version, '-os' + rel.version if ported else ''))
    with open(path, 'wb') as fh:
        fh.write(raw)
    return path, m


def main(argv=None):
    ap = argparse.ArgumentParser(prog='sdk.build', description=__doc__.split('\n')[0])
    ap.add_argument('moddir', help='the folder with mod.json')
    ap.add_argument('--stock', default=os.environ.get('ELEKLOADER_STOCK'),
                    help='the stock .syx (default: $ELEKLOADER_STOCK)')
    ap.add_argument('--out', help='where to write the .elemod (default MODDIR/out)')
    a = ap.parse_args(argv)
    if not a.stock:
        ap.error('--stock is required (or set ELEKLOADER_STOCK)')
    try:
        path, m = build(a.moddir, a.stock, a.out)
    except (BuildError, OSError, KeyError, ValueError) as e:
        print('BUILD FAILED: %s' % e)
        return 1
    print('BUILT %s' % path)
    print('  %s: .run %d, .fast %d, .bss %d bytes; %d sites, %d relocations; imports %s'
          % (m.label(), m.size('.run'), m.size('.fast'), m.size('.bss'), len(m.sites),
             len(m.relocs), ', '.join(m.imports) or 'nothing'))
    return 0


if __name__ == '__main__':
    sys.exit(main())
