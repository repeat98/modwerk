"""The DSP56300 register contract of every Octatrack DSP package entry, read from its assembled words.

Each entry (an effect's init and proc, an engine's hook entry, a base engine's hook entry) is walked from its
offset over the instructions it can reach: falls, branches both ways, local jsr/bsr callees (each rts back to its own
caller), `do` bodies. Only those instructions count, so a P table or data word beside the code is never read as an
instruction. A path that returns to the caller and one that leaves (a site's exit, a jump out of the package) are
judged apart. The words come from the published package (public/octatrack-modules, as octatrack-module-packages.json
lists it) placed at BASE with its relocations, and the base's own hooked engines from src/engine/assets/dsp-packages.json;
the DSP56300 disassembler (dsp56kDisassemble, built beside ELEKLOADER_DSP_ASM) decodes them. An entry's write set is
every register a reachable instruction writes, compared with its contract:

- a hook entry may write only its site's `clobbers` (sdk/machines/octatrack/dsp-sites.json), and a site with an
  exit lets it drop the site's return (`move ssh,...`) before it leaves through the exit (the site's `contract`);
- an effect's init keeps r1, n1 and m1: the FX1 dispatcher indexes its proc table with r1 after `jsr init`
  (the DSP trap register's trap-init-r1); proc may write them (the dispatcher reloads r1);
- no entry writes the mode, the stack or the vectors (omr, mr, sr, sp, ssh, ssl, vba, ep, sz, sc), which no
  document lets an entry change. `do`/`rep` loops and calls restore what they push and are not counted.

The check fails closed: a word it cannot decode ("undecodable at P:$xxxx"), an instruction it does not model, an
indirect jump or a call outside the package makes the entry incomplete, which counts as a finding. Saving a
register and restoring it is not recognised yet: such an entry is reported as writing it.

Reported for every package now; refused (exit 1, the doctor's red line) for a module first listed on or after
REFUSED_FROM, which the owner sets (None: report only), as scripts/dsp-source-gates.py does with REP_REFUSED_FROM.

  python3 -B scripts/dsp-register-contract.py             # every package; exit 1 only on a refusal
  python3 -B scripts/dsp-register-contract.py --json <id>  # one module's findings as JSON (module:doctor)
  python3 -B scripts/dsp-register-contract.py --json-modules <id>...  # summaries keyed by module ID
"""
import importlib.util
import json
import os
import pathlib
import re
import shutil
import struct
import subprocess
import sys
import tempfile

REFUSED_FROM = None  # e.g. '2026-12-01': the owner sets it once the report is clean or its findings are reviewed
ROOT = pathlib.Path(__file__).resolve().parents[1]
SITES = ROOT / 'sdk/machines/octatrack/dsp-sites.json'
BASE = 0x4000  # where entries are placed for decoding: above the vectors, so targets read as plain addresses
_spec = importlib.util.spec_from_file_location('dsp_contract_abi9', ROOT / 'sdk/runtime/loader/abi9.py')
ABI9 = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(ABI9)
KEEP = {'init': {'r1', 'n1', 'm1'}, 'proc': set()}  # beyond the mode, stack and vector registers no entry may write

CC = 'cc|hs|ge|ne|pl|nn|ec|lc|gt|cs|lo|lt|eq|mi|nr|es|ls|le'
FLAGS_ONLY = re.compile(r'^(cmp|cmpm|cmpu|tst)$')
JUMP = re.compile(r'^(jmp|bra)$')
COND = re.compile(r'^(j|b)(%s)$|^(jset|jclr|brset|brclr)$' % CC)
CALL = re.compile(r'^(jsr|bsr|js(%s)|bs(%s)|jsset|jsclr|bsset|bsclr)$' % (CC, CC))
RETURN = {'rts', 'rti'}
LOOP = {'do', 'dor', 'rep'}  # their la/lc and stack words come back when they end
MOVES = {'move', 'movec', 'movem', 'movep', 'lua', 'lea'}
ALU = re.compile(r'^(add|addl|addr|sub|subl|subr|mpy|mpyr|mpysu|mpyuu|mpyi|mpyri|mac|macr|macsu|macuu|maci|macri|'
                 r'dmacss|dmacsu|dmacuu|asl|asr|lsl|lsr|rol|ror|abs|neg|not|clr|rnd|tfr|adc|sbc|and|or|eor|max|maxm|'
                 r'div|inc|dec|clb|normf|extract|extractu|insert|merge|t(%s))$' % CC)
BITS = {'bset', 'bclr', 'bchg'}
REG = re.compile(r'^(a[012]?|b[012]?|a10|b10|ab|ba|x[01]?|y[01]?|[rnm][0-7]|sr|omr|sp|ssh|ssl|la|lc|ep|sz|sc|vba|mr|'
                 r'ccr|com|eom)$')
UPDATE = re.compile(r'\((r[0-7])\)[+-]|-\((r[0-7])\)')
LINE = re.compile(r'^([0-9a-f]{6}): (\S+)(.*?)\s*; ([0-9a-f]{6})(?: ([0-9a-f]{6}))?$')


def names(reg):
    """The contract's names for a register operand: accumulators whole, x and y as their halves, ccr not at all."""
    if reg in ('ccr', 'com'):
        return set()
    if reg[0] in 'ab' and reg not in ('ab', 'ba'):
        return {reg[0]}
    return {'ab': {'a', 'b'}, 'ba': {'a', 'b'}, 'x': {'x0', 'x1'}, 'y': {'y0', 'y1'}, 'eom': {'omr'}}.get(reg, {reg})


class Unmodelled(Exception):
    pass


def written(field):
    """Registers one `source,destination` (or a lone `(rN)+n`-style update) writes."""
    out = set()
    for m in UPDATE.finditer(field):
        out.add(m[1] or m[2])
    parts = field.split(',')
    if len(parts) == 2:
        source, dest = (p.lstrip('#<>') for p in parts)
        if source == 'ssh':
            out.add('ssh')  # a read of ssh pops the stack
        if REG.match(dest):
            out |= names(dest)
        elif not re.match(r'^[xylp]:|^\(|^-\(|^\$', parts[1]):
            raise Unmodelled('destination %s' % parts[1])
    elif len(parts) != 1 or not re.match(r'^-?\(r[0-7]\)', field):
        raise Unmodelled('operand %s' % field)
    return out


def semantics(mnemonic, operands):
    """-> (registers written, flow, target text): flow is 'next', 'jump', 'cond', 'call' or 'return'."""
    tokens = [t for t in operands.split() if not re.match(r'^if(%s)?(\.u)?$' % CC, t)]
    if mnemonic in RETURN:
        return set(), 'return', None
    if JUMP.match(mnemonic) or COND.match(mnemonic) or CALL.match(mnemonic):
        target = tokens[-1].split(',')[-1] if tokens else ''
        flow = 'jump' if JUMP.match(mnemonic) else 'call' if CALL.match(mnemonic) else 'cond'
        return set(), flow, target
    if mnemonic in LOOP or mnemonic in ('nop', 'enddo') or mnemonic.startswith('brk'):
        return set(), 'next', None
    if mnemonic in ('andi', 'ori'):
        return names(tokens[0].split(',')[1]), 'next', None
    if mnemonic in ('lua', 'lea'):  # the address is computed, its register not updated
        return names(tokens[0].split(',')[1]), 'next', None
    if mnemonic in MOVES:
        return set().union(*(written(t) for t in tokens)), 'next', None
    if mnemonic in BITS or mnemonic == 'btst':  # btst only tests a register; any of them may update an address
        dest = tokens[0].split(',')[1]
        if REG.match(dest):
            return (names(dest) if mnemonic in BITS else set()), 'next', None
        return (written('#0,' + dest) if '(' in dest else set()), 'next', None
    if mnemonic == 'norm':
        return set().union(*(names(r) for r in tokens[0].split(','))), 'next', None
    if FLAGS_ONLY.match(mnemonic) or ALU.match(mnemonic):  # the ALU operands, then parallel moves
        if not tokens:
            raise Unmodelled(mnemonic + ' without operands')
        if re.match(r'^t(%s)$' % CC, mnemonic):  # tcc S1,D1 [S2,D2]: both destinations, no parallel move
            return set().union(*(names(t.split(',')[-1]) for t in tokens)), 'next', None
        dest = tokens[0].split(',')[-1]
        if FLAGS_ONLY.match(mnemonic):
            out = set()
        elif REG.match(dest):
            out = names(dest)
        else:
            raise Unmodelled('%s destination %s' % (mnemonic, dest))
        return out.union(*(written(t) for t in tokens[1:])), 'next', None
    raise Unmodelled(mnemonic)


def disassembler():
    asm = os.environ.get('ELEKLOADER_DSP_ASM') or shutil.which('dsp_asm') or ''
    candidates = [pathlib.Path(asm).resolve().parents[1] / 'disassemble/dsp56kDisassemble'] if asm else []
    for tree in (os.environ.get('ELEKLOADER_DSP56300'), pathlib.Path.home() / '.cache/modwerk-upstream/octabam/vendor/dsp56300',
                 '/opt/toolchain/vendor/dsp56300'):
        if tree:
            candidates.append(pathlib.Path(tree) / 'build/source/disassemble/dsp56kDisassemble')
    found = [str(p) for p in candidates if p.is_file()] + [shutil.which('dsp56kDisassemble') or '']
    return next((p for p in found if p), None)


class Listing:
    """Decoded instructions of placed words, by address; a miss decodes again from that address, so no listing
    alignment chosen elsewhere decides what an instruction is."""
    def __init__(self, words, base, tool, work):
        self.words, self.base, self.tool, self.work, self.at = words, base, tool, work, {}

    def get(self, address):
        if address not in self.at:
            start = address - self.base
            path = pathlib.Path(self.work) / 'words.bin'
            path.write_bytes(b''.join(w.to_bytes(3, 'little') for w in self.words[start:]))
            out = subprocess.run([self.tool, '-in', str(path), '-pc', '%x' % address, '-le', '-nops'],
                                 capture_output=True, text=True, check=True).stdout
            for line in out.splitlines():
                m = LINE.match(line)
                if m and int(m[1], 16) not in self.at:
                    self.at[int(m[1], 16)] = (m[2], m[3].strip(), 2 if m[5] else 1)
        return self.at.get(address)


def target_of(text):
    m = re.search(r'(?:\$|func_|int_)([0-9a-f]+)$', text.lstrip('<>'))
    return int(m[1], 16) if m else None


def walk(listing, entry, exit_word=None, depth=8):
    """The code reachable from word `entry`, as states (address, return addresses) so a callee's rts goes back to its
    own caller. -> writes on a path that returns to the site, writes on a path that leaves (the site's exit, or a
    jump out of the package), where it leaves, problems, and the number of instructions reached."""
    base, end = listing.base, listing.base + len(listing.words)
    start = (base + entry, ())
    edges, writes, problems, todo = {}, {}, [], [start]
    while todo:
        state = todo.pop()
        if state in edges:
            continue
        (pc, stack), succ = state, []
        edges[state] = succ
        found = listing.get(pc) if base <= pc < end else ('past', '', 1)
        try:
            if found is None or found[0] in ('dc', 'past'):
                raise Unmodelled('runs past the package' if found and found[0] == 'past' else 'undecodable')
            mnemonic, operands, size = found
            regs, flow, target = semantics(mnemonic, operands)
            writes[state] = regs
            to = None
            if flow in ('jump', 'cond', 'call'):
                if target.startswith('('):
                    raise Unmodelled('indirect %s %s' % (mnemonic, target))
                to = target_of(target)
                if to is None:
                    raise Unmodelled('target %s' % target)
                if flow == 'call' and not base <= to < end:
                    raise Unmodelled('calls P:$%04x outside the package: its writes are unknown' % to)
                if flow == 'call' and len(stack) >= depth:
                    raise Unmodelled('calls deeper than %d' % depth)
        except Unmodelled as e:
            problems.append('%s at P:$%04x' % (e, pc) if str(e) in ('undecodable', 'runs past the package')
                            else 'unmodelled at P:$%04x: %s' % (pc, e if not found or found[0] == 'past' else
                                                                '%s %s (%s)' % (found[0], found[1], e)))
            succ.append('stop')
            continue
        if exit_word is not None and size == 2 and pc + 1 - base == exit_word:
            succ.append('exit')  # the site's exit: a long branch whose displacement the base writes
        elif flow == 'return':
            succ.append((stack[-1], stack[:-1]) if stack else 'return')
        else:
            if to is not None:
                succ.append((to, stack + (pc + size,)) if flow == 'call' else (to, stack) if base <= to < end
                            else 'P:$%04x' % to)
            if flow == 'next' or flow == 'cond' or flow == 'call' and mnemonic not in ('jsr', 'bsr'):
                succ.append((pc + size, stack))
        todo += [s for s in succ if isinstance(s, tuple)]
    back = {}
    for state, succ in edges.items():
        for s in succ:
            back.setdefault(s, []).append(state)

    def reaching(ends):
        seen, todo = set(), list(ends)
        while todo:
            for state in back.get(todo.pop(), ()):
                if state not in seen:
                    seen.add(state)
                    todo.append(state)
        return seen
    ends = {s for succ in edges.values() for s in succ if isinstance(s, str)}
    leaves = sorted(ends - {'return', 'stop'})
    union = lambda states: set().union(*(writes.get(s, set()) for s in states))
    return dict(returning=union(reaching({'return'})), leaving=union(reaching(leaves)), writes=union(edges),
                leaves=leaves, problems=problems, reached=len({pc for pc, _ in edges}))


def placed(words, relocations, base):
    """As the loader places DSP words: an offset gains the base, a fixed P address (bit 15) loses it."""
    out = list(words)
    for r in relocations:
        out[r & 0x7fff] = (out[r & 0x7fff] + (-base if r & 0x8000 else base)) & 0xffffff
    return out


def package_entries(data):
    """A runtime package's DSP words, relocations and entries: (kind, offset, site index or None, exit word), or None
    without DSP code (sdk/runtime/loader/README.md; the claims start where abi9.py's `_claims_end` says)."""
    if data[:4] != b'MWRM' or struct.unpack_from('>H', data, 4)[0] < 5:
        return None
    abi = struct.unpack_from('>H', data, 4)[0]
    count, nrel, _, slots, init, proc = struct.unpack_from('>IHBBHH', data, 32)
    if not count:
        return None
    nclaims, nentries = (data[78], data[79]) if abi >= 9 else (0, 0)
    at = ABI9._claims_end(data) + 12 * nclaims
    hooks = [struct.unpack_from('>BBHI', data, at + 8 * i) for i in range(nentries)]
    at += 8 * nentries
    words = list(struct.unpack_from('>%dI' % count, data, at))
    relocations = list(struct.unpack_from('>%dH' % nrel, data, at + 4 * count))
    if hooks and not slots:  # an engine (ABI 10): its entries are its hook entries
        return words, relocations, [('hook', entry, site, exit or None) for site, _, exit, entry in hooks]
    return words, relocations, [('init', init, None, None), ('proc', proc, None, None)]


def contract(kind, site):
    """-> (registers allowed on the way back, allowed before leaving through the site's exit, the rule's name)."""
    every = set('a b x0 x1 y0 y1 la lc'.split()) | {'%s%d' % (c, i) for c in 'rnm' for i in range(8)}
    if kind == 'hook':
        allowed = set(site['clobbers'])
        return allowed, allowed | {'ssh'}, 'site %d %s clobbers [%s]' % (site['index'], site['name'], ', '.join(site['clobbers']))
    return every - KEEP[kind], set(), 'effect %s%s' % (kind, ' keeps r1, n1, m1 (trap-init-r1)' if KEEP[kind] else '')


def check(module, version, words, relocations, entries, sites, tool, work, label=''):
    listing = Listing(placed(words, relocations, BASE), BASE, tool, work)
    rows = []
    for kind, offset, site_index, exit_word in entries:
        site = sites.get(site_index) if kind == 'hook' else None
        name = '%s at +$%x' % (kind if kind != 'hook' else 'site %s' % site_index, offset)
        if kind == 'hook' and site is None:
            rows.append(dict(entry=name, writes=[], findings=['names site %s, which dsp-sites.json does not have' % site_index]))
            continue
        found = walk(listing, offset, exit_word if site and 'exit' in site else None)
        back, out, rule = contract(kind, site)
        notes = []
        if found['returning'] - back:
            notes.append('writes %s on a path back to its caller (%s)' % (', '.join(sorted(found['returning'] - back)), rule))
        if 'exit' in found['leaves'] and found['leaving'] - out:
            notes.append('writes %s on a path out through the site\'s exit, beyond %s: the stock code it skips may free '
                         'more, which dsp-sites.json does not record' % (', '.join(sorted(found['leaving'] - out)), rule))
        notes += ['leaves to %s, outside the package: no contract names that continuation' % p for p in found['leaves'] if p != 'exit']
        notes += ['incomplete: ' + p for p in found['problems']]
        rows.append(dict(entry=name, writes=sorted(found['writes']), returning=sorted(found['returning']),
                         leaving=sorted(found['leaving']), leaves=found['leaves'], reached=found['reached'], findings=notes))
    return dict(module=module, version=version, source=label, entries=rows)


def published():
    """(module, version, words, relocations, entries, label) for every DSP package the site ships, then the base's own
    hooked engines (dsp-packages.json `hooks`)."""
    rows = json.loads((ROOT / 'src/engine/assets/octatrack-module-packages.json').read_text())['packages']
    for row in rows:
        path = ROOT / 'public' / row['path']
        if not path.is_file():
            continue
        found = package_entries(path.read_bytes())
        if found:
            yield (row['id'], row['version']) + found + ('public/' + row['path'],)
    sites = json.loads(SITES.read_text())['sites']
    by_guard = {s['guardSha256']: s['index'] for s in sites}
    for p in json.loads((ROOT / 'src/engine/assets/dsp-packages.json').read_text())['packages']:
        if p.get('hooks'):
            words = [int(p['code'][i:i + 6], 16) for i in range(0, len(p['code']), 6)]
            entries = [('hook', h['entry'], by_guard.get(h['guardSha256']), None) for h in p['hooks']]
            yield p['id'], p['version'], words, p['relocations'], entries, 'dsp-packages.json core %s' % p['tag']


def added():
    catalog = json.loads((ROOT / 'sdk/catalog.json').read_text(encoding='utf-8'))
    return {m['id']: m.get('addedAt', '') for m in catalog.get('modules', [])}


def findings(report):
    """(entry, text) for each finding of one package's report."""
    return [(row['entry'], text) for row in report['entries'] for text in row['findings']]


def refused(module, dates):
    return bool(REFUSED_FROM) and dates.get(module, '9999') >= REFUSED_FROM


def run(only=None):
    if isinstance(only, str):
        only = {only}
    tool = disassembler()
    if not tool:
        return None
    sites = {s['index']: s for s in json.loads(SITES.read_text())['sites']}
    with tempfile.TemporaryDirectory(prefix='modwerk-dsp-contract.') as work:
        return [check(m, v, w, r, e, sites, tool, work, label) for m, v, w, r, e, label in published()
                if only is None or m in only]


def main(argv):
    dates = added()
    if '--json' in argv or '--json-modules' in argv:
        batch = '--json-modules' in argv
        ids = argv[argv.index('--json-modules') + 1:] if batch else [argv[argv.index('--json') + 1]]
        reports = run(set(ids))
        by_module = {module: [] for module in ids}
        for report in reports or []:
            by_module[report['module']].append(report)
        results = {}
        for module, items in by_module.items():
            if reports is None:
                results[module] = dict(module=module, skipped='no dsp56kDisassemble: build it beside ELEKLOADER_DSP_ASM (npm run upstream:tools)')
                continue
            results[module] = dict(module=module, packages=len(items), entries=sum(len(r['entries']) for r in items),
                                   refused=refused(module, dates), refusedFrom=REFUSED_FROM,
                                   findings=['%s: %s' % f for r in items for f in findings(r)])
            if not batch:
                results[module]['reports'] = items
        print(json.dumps(results if batch else results[ids[0]]))
        return 0
    reports = run()
    if reports is None:
        print('DSP register contract: skipped, no dsp56kDisassemble (build it beside ELEKLOADER_DSP_ASM: npm run upstream:tools)')
        return 0
    errors = 0
    for report in reports:
        head = '%s %s (%s)' % (report['module'], report['version'], report['source'])
        found = findings(report)
        stamp = 'error' if found and refused(report['module'], dates) else 'warning' if found else 'ok'
        errors += stamp == 'error'
        for row in report['entries']:
            print('%-7s %s %s: writes %s' % (stamp if row['findings'] else 'ok', head, row['entry'], ', '.join(row['writes']) or 'nothing'))
            for text in row['findings']:
                print('          ' + text, file=sys.stderr if stamp == 'error' else sys.stdout)
    print('DSP register contract: %d packages, %d entries, %d with findings, %d refused (refused from %s)' % (
        len(reports), sum(len(r['entries']) for r in reports), sum(bool(findings(r)) for r in reports), errors,
        REFUSED_FROM or 'no date yet: report only'))
    return 1 if errors else 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
