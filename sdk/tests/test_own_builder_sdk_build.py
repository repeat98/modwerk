# SPDX-License-Identifier: GPL-3.0-or-later
"""sdk/firmware_builder/sdk (elf.py, build.py): the same results as the pinned checkout's modules of those names.

elf: seeded synthetic objects (valid, truncated and corrupted: the same fields or the same exception) and every
object the cross toolchain writes during the builds below. build: the same .elemod bytes, file names and errors for
the checkout's own mods on every stock OS file at hand, Modwerk's Digitakt II base as scripts/machine-base.py stages
it, synthetic mod.json cases (sites, ports, refusals) and DSP sources assembled with dsp_asm. Firmware is read from
the owner's paths and skipped when absent; nothing of it is written here.
"""
import contextlib
import importlib
import importlib.util
import io
import json
import os
from pathlib import Path
import random
import shutil
import struct
import subprocess
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]
UPSTREAM = Path(os.environ.get('ELEKLOADER_UPSTREAM', Path.home() / '.cache/modwerk-upstream/elekloader'))
CROSS = os.environ.get('ELEKLOADER_CROSS', 'm68k-elf-')
DSP_ASM = os.environ.get('ELEKLOADER_DSP_ASM', str(Path.home() / '.cache/modwerk-upstream/octabam/vendor/dsp56300/'
                                                                  'build/source/dsp_host/dsp_asm'))
STOCKS = [Path(p) for p in (
    '/Users/jannikassfalg/Downloads/Digitakt_OS1.54_dist/Digitakt_OS1.54.syx',
    '/Users/jannikassfalg/Downloads/Modwerk-DigiMono-0.13.2-verification/Digitakt_OS1.53.syx',
    '/Users/jannikassfalg/Downloads/modwerk-digi-parity/Digitakt_II_OS1.17.syx',
    '/Users/jannikassfalg/Downloads/modwerk-digi-parity/Digitone_and_Digitone_Keys_OS1.43.syx',
    '/Users/jannikassfalg/Downloads/modwerk-digi-parity/Digitone_and_Digitone_Keys_OS1.44.syx',
    '/Users/jannikassfalg/Downloads/OCTATRACK_OS1.40C_dist/OCTATRACK_OS1.40C.bin')]
CORE = ('devices', 'elemod', 'formats', 'link', 'mkmod')
HAVE = (UPSTREAM / 'elekloader/sdk/build.py').is_file()
TOOLS = bool(shutil.which(CROSS + 'gcc'))
FALLBACK = []                       # the core modules taken from the checkout while Modwerk's are not complete

if HAVE:
    sys.path.insert(0, str(ROOT / 'sdk'))
    import firmware_codec  # noqa: E402
    firmware_codec.use_elekloader(UPSTREAM)
    import firmware_builder  # noqa: E402
    try:
        for name in CORE:
            importlib.import_module('firmware_builder.' + name)
    except ImportError:
        # test-only: all five from the checkout, so one build never mixes two implementations
        for key in [k for k in sys.modules if k.split('.')[0] == 'firmware_builder' and k.split('.')[1:2] in [[c] for c in CORE]]:
            del sys.modules[key]
        for name in CORE:
            module = importlib.import_module('elekloader.' + name)
            sys.modules['firmware_builder.' + name] = module
            setattr(firmware_builder, name, module)
            FALLBACK.append(name)
    from firmware_builder.sdk import build as own_build, elf as own_elf  # noqa: E402
    from elekloader.sdk import build as up_build, elf as up_elf  # noqa: E402
    from elekloader import formats as up_formats  # noqa: E402


def stocks():
    """{(device key, OS version): path} of the stock files at hand."""
    out = {}
    for path in STOCKS:
        if path.is_file():
            _, dev, rel = up_formats.load(str(path))
            out[(dev.key, rel.version)] = path
    return out


# ---- elf -------------------------------------------------------------------------------------------------------

def describe(mod, raw):
    try:
        e = mod.Elf(raw)
    except Exception as error:  # noqa: BLE001 - the exception itself is compared
        return ('raises', type(error).__name__, str(error))
    return (e.etype,
            [(s.idx, s.name, s.type, s.flags, s.offset, s.size, s.link, s.info, s.align, bytes(s.data))
             for s in e.sections],
            [(y.idx, y.name, y.value, y.size, y.bind, y.type, y.shndx) for y in e.symbols],
            {k: [(o, t, y.idx, a) for o, t, y, a in v] for k, v in e.relocs.items()},
            [(n, getattr(e.section(n), 'idx', None)) for n in ('.text', '.symtab', '.nope', '')])


def synthetic_elf(rng):
    """A random 32-bit big-endian relocatable object: string tables, a symbol table, data, NOBITS and RELA (or REL)."""
    names = [''] + ['.s%d' % i for i in range(rng.randrange(1, 6))]
    strtab = b'\0' + b''.join(('sym%d' % i).encode() + b'\0' for i in range(12))
    nsyms = rng.randrange(0, 12)
    symtab = b''.join(struct.pack('>IIIBBH', rng.choice([0, 1, 6, 11]), rng.getrandbits(32), rng.getrandbits(8),
                                  rng.getrandbits(8), 0, rng.choice([0, 1, 4, 0xFFF1, 0xFFF2]))
                      for _ in range(nsyms))
    body, shdrs = bytearray(52), []
    shstr = b''.join(n.encode() + b'\0' for n in names + ['.shstrtab', '.strtab', '.symtab', '.rela', '.bss'])
    offs, at = {}, 0
    for n in names + ['.shstrtab', '.strtab', '.symtab', '.rela', '.bss']:
        offs[n], at = at, at + len(n) + 1

    def add(name, typ, data, link=0, info=0, size=None):
        off = len(body)
        body.extend(data)
        shdrs.append((offs[name], typ, rng.choice([0, 2, 6]), 0, off, len(data) if size is None else size,
                      link, info, rng.choice([1, 2, 4, 16]), 0))
    shdrs.append((0,) * 10)
    for n in names[1:]:
        add(n, 1, bytes(rng.getrandbits(8) for _ in range(rng.randrange(0, 24))))
    add('.shstrtab', 3, shstr)
    stri = len(shdrs)
    add('.strtab', 3, strtab)
    add('.symtab', 2, symtab, link=stri)
    rels = b''.join(struct.pack('>IIi', rng.randrange(64), (rng.randrange(max(1, nsyms + 1)) << 8) | rng.randrange(8),
                                rng.randrange(-99, 99)) for _ in range(rng.randrange(0, 6)))
    add('.rela', rng.choice([4, 4, 4, 9]), rels, info=rng.randrange(len(shdrs)))
    add('.bss', 8, b'', size=rng.randrange(64))
    shoff = len(body)
    for h in shdrs:
        body.extend(struct.pack('>IIIIIIIIII', *h))
    body[:52] = (b'\x7fELF\x01\x02\x01' + bytes(9) + struct.pack('>HHIIIIIHHHHHH', 1, 4, 1, 0, 0, shoff, 0, 52, 0,
                                                                   0, 40, len(shdrs), stri - 1))
    return bytes(body)          # e_shstrndx: .shstrtab sits right before .strtab


def mutate(rng, raw):
    kind = rng.randrange(6)
    if kind == 0:
        return raw
    if kind == 1:
        return raw[:rng.randrange(len(raw) + 1)]
    data = bytearray(raw)
    for _ in range(rng.randrange(1, 8)):
        data[rng.randrange(len(data))] = rng.getrandbits(8)
    return bytes(data)


@unittest.skipUnless(HAVE, 'the pinned checkout is not at %s' % UPSTREAM)
class ElfParity(unittest.TestCase):
    def test_constants(self):
        for name in ('SHT_SYMTAB', 'SHT_RELA', 'SHT_NOBITS', 'SHT_REL', 'SHN_UNDEF', 'SHN_ABS', 'SHN_COMMON',
                     'STB_LOCAL', 'STB_GLOBAL', 'STB_WEAK', 'STT_NOTYPE', 'STT_OBJECT', 'STT_FUNC', 'STT_SECTION',
                     'STT_FILE', 'R_68K_NONE', 'R_68K_32', 'R_68K_16', 'R_68K_8', 'R_68K_PC32', 'R_68K_PC16',
                     'R_68K_PC8', 'RNAMES'):
            self.assertEqual(getattr(own_elf, name), getattr(up_elf, name), name)

    def test_synthetic(self):
        rng, kinds = random.Random(0x5eed), set()
        for case in range(6000):
            raw = mutate(rng, synthetic_elf(rng)) if case % 7 else bytes(rng.getrandbits(8) for _ in range(case % 70))
            if case % 11 == 0:
                raw = b'\x7fELF' + raw[4:]
            want = describe(up_elf, raw)
            self.assertEqual(describe(own_elf, raw), want, case)
            kinds.add(want[1] if want[0] == 'raises' else 'ok')
        self.assertIn('ok', kinds)
        self.assertGreater(len(kinds), 3, kinds)          # several refusal kinds were reached

    @unittest.skipUnless(TOOLS, 'no %sgcc' % CROSS)
    def test_toolchain_objects(self):
        sources = {
            'a.c': 'int counter; static int hidden = 3; extern int other(int);\n'
                   '__attribute__((weak)) int soft(void) { return 1; }\n'
                   'int f(int x) { return other(x) + hidden + counter + soft(); }\n'
                   'const char *name = "abc";\n',
            'b.s': '        .section .run, "ax"\n        .globl entry\nentry:  jsr far\n        bra.w entry\n'
                   '        lea (local,%pc),%a0\n        rts\nlocal:  .long entry+4\n        .section .bss\n'
                   '        .skip 12\n        .section .fast, "ax"\n        .long ext - .\n',
        }
        with tempfile.TemporaryDirectory() as work:
            objs = []
            for name, text in sources.items():
                src = Path(work, name)
                src.write_text(text)
                obj = str(src) + '.o'
                tool = ['gcc', '-mcpu=5208', '-O2', '-c'] if name.endswith('.c') else ['as', '-mcpu=5208']
                subprocess.run([CROSS + tool[0], *tool[1:], '-o', obj, str(src)], check=True)
                objs.append(obj)
            linked = os.path.join(work, 'all.o')
            subprocess.run([CROSS + 'ld', '-r', '-o', linked, *objs], check=True)
            for obj in objs + [linked]:
                raw = Path(obj).read_bytes()
                self.assertNotEqual(describe(up_elf, raw)[0], 'raises', obj)
                self.assertEqual(describe(own_elf, raw), describe(up_elf, raw), obj)
                self.assertEqual(describe(own_elf, raw)[:4], describe_loaded(own_elf, obj))


def describe_loaded(mod, path):
    return describe(mod, mod.Elf.load(path).raw)[:4]


# ---- build -----------------------------------------------------------------------------------------------------

def norm(text, *paths):
    """A result or message with the run's own folders named generically, so two runs compare."""
    for path, label in paths:
        text = text.replace(str(path), label)
    for old, new in (('is not one elekloader places', 'is not one the linker places'), ('firmware elekloader knows', 'firmware the builder knows'),
                     ('firmware elekloader does not know', 'firmware the builder does not know')):
        text = text.replace(old, new)
    return text


def run_build(mod, mdir, stock, out, extra=None):
    """-> ('ok', file name, file text, objects' parsed form) or ('raises', class name, message)."""
    try:
        path, m = mod.build(str(mdir), str(stock), str(out), extra)
    except Exception as error:  # noqa: BLE001 - compared below
        msg = norm(str(error), (out, '<out>'), (own_build.INCLUDE, '<include>'), (up_build.INCLUDE, '<include>'))
        return ('raises', type(error).__name__, msg)
    objects = sorted(str(p.relative_to(out)) for p in Path(out).rglob('*.o'))
    return ('ok', os.path.relpath(path, out), Path(path).read_text(), m.label(), objects)


@unittest.skipUnless(HAVE, 'the pinned checkout is not at %s' % UPSTREAM)
@unittest.skipUnless(TOOLS, 'no %sgcc' % CROSS)
class BuildParity(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.env = {k: os.environ.get(k) for k in ('ELEKLOADER_CROSS', 'ELEKLOADER_DSP_ASM')}
        os.environ['ELEKLOADER_CROSS'] = CROSS
        if os.path.isfile(DSP_ASM):
            os.environ['ELEKLOADER_DSP_ASM'] = DSP_ASM
        cls.stocks = stocks()
        cls.include = own_build.INCLUDE
        cls.elf_objects = 0
        cls.outcomes = []

    @classmethod
    def tearDownClass(cls):
        for k, v in cls.env.items():
            if v is None:
                os.environ.pop(k, None)
            else:
                os.environ[k] = v

    def compare(self, mdir, stock, extra=None, label=''):
        with tempfile.TemporaryDirectory() as work:
            a, b = Path(work, 'own'), Path(work, 'up')
            got = run_build(own_build, mdir, stock, a, extra)
            want = run_build(up_build, mdir, stock, b, extra)
            self.assertEqual(got, want, label)
            self.outcomes.append(want[0] if want[0] == 'ok' else want[2].split('\n')[0][:90])
            if want[0] == 'ok':                         # every object the toolchain wrote: elf parity on it
                for obj in want[4]:
                    raw = (b / obj).read_bytes()
                    self.assertEqual(describe(own_elf, raw), describe(up_elf, raw), obj)
                    type(self).elf_objects += 1
            return want

    def test_checkout_mods(self):
        """Every mod in the checkout, on every release it builds for that a stock file is at hand for. Its mods
        include the checkout's headers folder, so this test points the build's INCLUDE there."""
        own_build.INCLUDE = up_build.INCLUDE
        built = 0
        try:
            for mdir in sorted((UPSTREAM / 'mods').iterdir()):
                if not (mdir / 'mod.json').is_file():
                    continue
                mod = json.loads((mdir / 'mod.json').read_text())
                for version in [mod.get('os')] + sorted(mod.get('ports', {})):
                    stock = self.stocks.get((mod.get('device'), version))
                    if stock:
                        with self.subTest(mod=mdir.name, os=version):
                            built += self.compare(mdir, stock, label='%s %s' % (mdir.name, version))[0] == 'ok'
        finally:
            own_build.INCLUDE = self.include
        print('\nsdk.build: %d checkout mods built alike; core modules from the checkout: %s'
              % (built, ', '.join(FALLBACK) or 'none'))
        if self.stocks:
            self.assertGreater(built, 0)

    def test_modwerk_base(self):
        """Modwerk's Digitakt II base, staged as machine-base.py stages it, with the build's own INCLUDE (a folder
        that does not exist here): the base's headers are its own."""
        stock = self.stocks.get(('digitakt-mk2', '1.17'))
        if not stock:
            self.skipTest('no Digitakt II 1.17 file')
        spec = importlib.util.spec_from_file_location('machine_base', ROOT / 'scripts/machine-base.py')
        mb = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mb)
        config = json.loads((ROOT / 'sdk/machines/digitakt-ii/elekloader/base.json').read_text())
        for dev in (False, True):
            for name, add, leave in mb.variants(config):
                with tempfile.TemporaryDirectory() as work, self.subTest(variant=name, dev=dev):
                    core = mb.stage('digitakt-ii', config, Path(work),
                                    mb.stock_sites(mb.parts(config, add, dev, leave).get('sites', []), stock), add,
                                    mb.stock_sites(config['recipe']['sites'], stock)
                                    if 'sites' in config.get('recipe', {}) else None, dev, leave)
                    self.assertEqual(self.compare(core, stock, label=name)[0], 'ok')

    def synthetic_mod(self, work, mod, sources=None):
        mdir = Path(work, 'mod-%d' % len(os.listdir(work)))
        mdir.mkdir()
        for name, text in (sources or {}).items():
            (mdir / name).write_text(text)
        (mdir / 'mod.json').write_text(json.dumps(mod))
        return mdir

    def test_synthetic_mods(self):
        """Refusals and every site op, on the Digitakt 1.53 (sites taken from the checkout's core mod)."""
        self.outcomes.clear()
        stock = self.stocks.get(('digitakt-mk1', '1.53'))
        if not stock:
            self.skipTest('no Digitakt 1.53 file')
        core = json.loads((UPSTREAM / 'mods/core/mod.json').read_text())
        site = dict(core['sites'][0])
        jsr = {k: site[k] for k in ('addr', 'stock')}
        src = {'m.s': '        .section .run, "ax"\n        .globl fn\nfn: rts\n        .section .data\nd: .long fn\n'
                      '        .section .bss\n        .skip 8\n',
               'w.s': '        .section .weird, "a"\n        .long 1\n',
               'c.c': 'int v; int g(void) { return v; }\n',
               'bad.s': '  .section .run, "ax"\n  this is not an instruction\n'}
        base = {'id': 'syn', 'version': 1, 'device': 'digitakt-mk1', 'os': '1.53', 'sources': ['m.s']}
        cases = [
            {}, {'name_string': 'syn'}, {'sources': []}, {'sources': ['c.c', 'm.s'], 'cflags': ['-O1']},
            {'sources': ['w.s']}, {'sources': ['bad.s']}, {'sources': ['missing.s']}, {'id': 'core'},
            {'defsym': {'A': 1, 'B': '0x10'}}, {'os': '1.54'}, {'device': 'digitone-mk1'},
            {'os': '1.54', 'ports': {'1.53': {'defsym': {'Z': 2}}}}, {'os': '1.54', 'ports': {'1.53': {'id': 'x'}}},
            {'ports': []}, {'ports': {'1.54': 3}}, {'version': '2.0b'},
            {'sites': [dict(jsr, op='jsr', target='fn')]}, {'sites': [dict(jsr, op='jmp', target='nowhere', addend=4)]},
            {'sites': [dict(jsr, op='keep2', target='fn')]}, {'sites': [dict(jsr, op='ptr', target='fn')]},
            {'sites': [dict(jsr, op='bytes', new='4e714e714e71')]},
            {'sites': [dict(jsr, op='bytes', new='4e7100000000', kind='code', relocs=[[2, 'abs32', 'sym:fn', 0]])]},
            {'sites': [dict(jsr, op='bytes', new='000000000000', relocs=[[0, 'abs32', 'abs', 1], [2, 'abs32', 'abs', 0]])]},
            {'sites': [dict(jsr, op='bytes', new='000000000000', relocs=[[3, 'abs32', 'abs', 1]])]},
            {'sites': [dict(jsr, op='bytes', new='000000000000', relocs={})]},
            {'sites': [dict(jsr, op='bytes', new='0000')]}, {'sites': [dict(jsr, op='bytes', new='0000', addend=2)]},
            {'sites': [dict(jsr, op='dsp_jsr', target='fn')]}, {'sites': [dict(jsr, op='nop')]},
            {'sites': [dict(jsr, stock='00' * 6, op='jsr', target='fn')]},
            {'sites': [dict(addr=int(jsr['addr'], 16), stock=jsr['stock'][:8], op='jsr', target='fn')]},
            {'subscribe': [{'event': 'ev_draw', 'fn': 'fn'}, {'event': 'ev_x', 'fn': 'gone', 'order': 3}],
             'weak': ['soft', 'fn'], 'collections': {'t': 8, 'u': {'entry': 4, 'x': 1}}, 'requires': ['core'],
             'conflicts': ['a'], 'copied': [], 'resources': {'names': ['machine:9']}, 'storage': [{'sym': 'fn'}]},
            {'machines': [{'id': 9, 'descriptor': 'fn'}, {'id': 10, 'descriptor': 'fn', 'order': 7}],
             'resources': {'regions': []}},
            {'machines': [{'id': 3, 'descriptor': 'fn'}]}, {'machines': [{'id': 9}]},
            {'contribute': [{'to': 'core_machines', 'data': '00000000', 'relocs': [[0, 'abs32', 'sym:x', 0]]}]},
            {'contribute': [{'to': 'core_machines'}]},
            {'subscribe_dsp': [{'event': 't', 'fn': 'fn', 'addend': 2}]},
            {'dsp': [{'source': 'x.asm', 'payload': 'A'}]},
            {'fixed': [{'source': 'm.s', 'addr': '0x40000000'}]},
        ]
        with tempfile.TemporaryDirectory() as work:
            for n, change in enumerate(cases):
                mod = dict(base, **change)
                with self.subTest(case=n):
                    self.compare(self.synthetic_mod(work, mod, src), stock, label=json.dumps(change))
            # a generator's extra parts
            mdir = self.synthetic_mod(work, base, src)
            self.compare(mdir, stock, {'sites': [dict(jsr, op='ptr', target='fn')],
                                       'contribute': [{'to': 'x', 'data': '00', 'order': 1}],
                                       'sources': [str(mdir / 'c.c')]}, 'extra')
            self.compare(self.synthetic_mod(work, {'id': 'x'}, {}), stock, label='no version')
            self.compare(mdir, Path(work, 'no-such-stock.syx'), label='no stock')
            Path(work, 'junk.syx').write_bytes(b'\xf0\x00\xf7' * 10)
            self.compare(mdir, Path(work, 'junk.syx'), label='junk stock')
        print('\nsdk.build synthetic: %d built alike, %d refused alike' % (
            self.outcomes.count('ok'), len(self.outcomes) - self.outcomes.count('ok')))

    def test_main(self):
        stock = self.stocks.get(('digitakt-mk1', '1.53'))
        if not stock:
            self.skipTest('no Digitakt 1.53 file')
        own_build.INCLUDE = up_build.INCLUDE
        try:
            for mdir in (UPSTREAM / 'mods/seq-events-dt1', UPSTREAM / 'mods/does-not-exist'):
                with tempfile.TemporaryDirectory() as work:
                    outs = []
                    for mod, out in ((own_build, 'own'), (up_build, 'up')):
                        text = io.StringIO()
                        with contextlib.redirect_stdout(text):
                            code = mod.main([str(mdir), '--stock', str(stock), '--out', str(Path(work, out))])
                        outs.append((code, norm(text.getvalue(), (Path(work, out), '<out>'))))
                    self.assertEqual(outs[0], outs[1])
        finally:
            own_build.INCLUDE = self.include

    def test_octatrack_dsp(self):
        """DSP sources: dsp_assemble on every .asm in the repository and the checkout, then a mod with DSP code, a
        DSP table entry and a dsp_jsr site on the Octatrack 1.40C."""
        if not os.path.isfile(os.environ.get('ELEKLOADER_DSP_ASM', '')):
            self.skipTest('no dsp_asm (ELEKLOADER_DSP_ASM)')
        sources = sorted(set(subprocess.run(['git', 'ls-files', '*.asm'], cwd=ROOT, capture_output=True, text=True,
                                            check=True).stdout.split()))
        assembled = 0
        with tempfile.TemporaryDirectory() as work:
            for rel in sources:
                results = []
                for mod, name in ((own_build, 'own'), (up_build, 'up')):
                    out = Path(work, name)
                    out.mkdir(exist_ok=True)
                    try:
                        results.append(mod.dsp_assemble(str(ROOT / rel), str(out)))
                    except Exception as error:  # noqa: BLE001
                        results.append(('raises', type(error).__name__, norm(str(error), (out, '<work>'))))
                self.assertEqual(results[0], results[1], rel)
                assembled += results[1][0] != 'raises'
            print('\nsdk.build: %d of %d DSP sources assembled alike, the rest refused alike'
                  % (assembled, len(sources)))
            self.assertGreater(assembled, 0)
            stock = self.stocks.get(('octatrack', '1.40C'))
            if not stock:
                return
            parsed, dev, _ = up_formats.load(str(stock))
            image = up_formats.main_image(parsed, dev)
            first = next(rel for rel in sources if own_build.dsp_assemble(str(ROOT / rel), work)[1])
            label = sorted(own_build.dsp_assemble(str(ROOT / first), work)[1])[0]
            at = dev.dsp_payloads['A'][0] + 30
            stockb = image[at - dev.main_load:at - dev.main_load + 6].hex()
            shutil.copyfile(ROOT / first, Path(work, 'x.asm'))
            shutil.copyfile(ROOT / first, Path(work, 'y.asm'))
            for change in ({'dsp': [{'source': 'x.asm', 'payload': 'A'}, {'source': 'y.asm', 'payload': 'B'}]},
                           {'dsp': [{'source': 'x.asm', 'payload': 'A'}], 'subscribe_dsp': [{'event': 'tbl',
                                                                                               'fn': label}],
                            'sites': [{'addr': '0x%08x' % at, 'stock': stockb, 'op': 'dsp_jsr', 'target': label,
                                       'addend': 1}],
                            'collections': {'tbl': {'entry': 6, 'space': 'dsp.A', 'head': '', 'end': ''}}},
                           {'dsp': [{'source': 'x.asm', 'payload': 'C'}]},
                           {'sites': [{'addr': '0x%08x' % at, 'stock': stockb[:8], 'op': 'dsp_jsr', 'target': 'q'}]}):
                mdir = Path(work, 'm%d' % len(os.listdir(work)))
                mdir.mkdir()
                shutil.copyfile(Path(work, 'x.asm'), mdir / 'x.asm')
                shutil.copyfile(Path(work, 'y.asm'), mdir / 'y.asm')
                (mdir / 'mod.json').write_text(json.dumps(dict({'id': 'dsp', 'version': '1', 'device': 'octatrack',
                                                                'os': '1.40C'}, **change)))
                with self.subTest(change=sorted(change)):
                    self.compare(mdir, stock, label=json.dumps(change))


if __name__ == '__main__':
    unittest.main()
