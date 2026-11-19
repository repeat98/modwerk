#!/usr/bin/env python3
"""Check BD ANALOG's hand-scheduled passes (src/ab_*.s) against their C, word for word, in
rytm-emu (emulator only: the unit's timing is not judged).

    python3 -B tools/asm_check.py --stock OS.syx --elemod BASE.elemod [--emu DIR] [--pass N ...] [--top]

For each pass (1 desk, 2 the bodies, 3 the 909's click, 4 its noise) it builds an image with
the module's cflags set to -DAB_CHECK=N, boots it on a
blank card, chooses BD ANALOG on track 1, plays the 808 and then the 909 (a tap of B), and
reads ab_check: the blocks the pass ran and the bytes of the voice and words of the block
where the assembly and its C reference differ. Any difference fails. It builds in a
temporary worktree (this checkout's HEAD, with its module and machine folders as they are
now), so this checkout's build.json is never touched. First, without
building anything, each routine in src/*.s must save every register the C convention
leaves to the caller (d2-d7, a2-a6) that it uses.

OS.syx is your own Analog Rytm MKII OS 1.74; BASE.elemod the base package built from this
checkout (scripts/machine-base.py). DIR is as emu_check.py's.
Clocks are rytm-emu 2ac0f1f's (presses 12M long, off the --every grid)."""
import argparse
import json
import os
import pathlib
import re
import shutil
import subprocess
import sys
import tempfile

HERE = pathlib.Path(__file__).resolve().parent
MODULE = HERE.parent
ROOT = MODULE.parents[3]
PASSES = {1: 'desk', 2: 'bodies', 3: 'click', 4: 'noise'}
MARKER = 'ab0c4ec0'


CALLEE = {f'd{i}' for i in range(2, 8)} | {f'a{i}' for i in range(2, 7)}


def pick(press, top):
    """The keys from the BD list's opening to BD ANALOG. With the base's machine-list
    sections it is the last of BD's section, four below BD HARD; on a base
    without them (--top) it tops the list."""
    if top:
        return [x for i in range(8) for x in press('UP', 13701 + 100 * i)]
    return [x for i in range(4) for x in press('DOWN', 13701 + 100 * i)]


def regs(spec):
    """The registers a movem list names: d2-d7/a2-a6 and the like."""
    out = set()
    for part in spec.split('/'):
        a, _, b = part.partition('-')
        a, b = a.lstrip('%'), (b or a).lstrip('%')
        out |= {f'{a[0]}{i}' for i in range(int(a[1]), int(b[1]) + 1)}
    return out


def saved_registers():
    """The routines that use a caller's register (d2-d7, a2-a6) without saving it."""
    bad = []
    for src in sorted((MODULE / 'src').glob('*.s')):
        text = re.sub(r'\|.*', '', src.read_text())
        used = set(re.findall(r'%([ad][2-7])\b', text)) & CALLEE
        m = re.search(r'movem\.l\s+(%[ad]\d[^,]*),\s*\(%sp\)', text)
        saved = regs(m.group(1).replace('%', '')) if m else set()
        if used - saved:
            bad.append(f'{src.name}: uses {", ".join(sorted(used - saved))} without saving it')
    return bad


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('--stock', required=True)
    ap.add_argument('--elemod', required=True)
    ap.add_argument('--emu', default='~/.cache/modwerk-upstream/rytm-emu')
    ap.add_argument('--top', action='store_true',
                    help='a base without machine-list sections: BD ANALOG tops the list')
    ap.add_argument('--pass', dest='passes', type=int, action='append', choices=sorted(PASSES))
    a = ap.parse_args()
    bad = saved_registers()
    for line in bad:
        print('FAIL  saved   ' + line)
    if bad:
        sys.exit(1)
    print('PASS  saved   every routine in src/*.s saves the registers it uses')
    emu = pathlib.Path(a.emu).expanduser() / 'target' / 'release'
    failed = False
    with tempfile.TemporaryDirectory() as tmp:
        tmp = pathlib.Path(tmp)
        tree = tmp / 'tree'
        subprocess.run(['git', 'worktree', 'add', '-q', '--detach', str(tree), 'HEAD'], cwd=ROOT, check=True)
        try:
            # this checkout's module and machine folders as they are now, uncommitted edits too
            for part in (MODULE.relative_to(ROOT), pathlib.Path('sdk/machines/analog-rytm-mkii'),
                         pathlib.Path('sdk/analog-rytm-mkii/core-profile')):
                shutil.rmtree(tree / part)
                shutil.copytree(ROOT / part, tree / part)
            (tree / 'node_modules').symlink_to(ROOT / 'node_modules')
            build = tree / MODULE.relative_to(ROOT) / 'build.json'
            original = build.read_text()
            for n in a.passes or sorted(PASSES):
                image = tmp / f'check{n}.syx'
                build.write_text(re.sub(r'"cflags": \[[^\]]*\]', f'"cflags": ["-DAB_CHECK={n}"]', original, count=1))
                subprocess.run(['node', 'scripts/link-image.mjs', '--stock', str(pathlib.Path(a.stock).resolve()),
                                '--version', f'ABC{n}', '--out', str(image),
                                '--elemod', str(pathlib.Path(a.elemod).resolve()),
                                '--module', 'analog-rytm-mkii:analog-bd'], cwd=tree, check=True,
                               capture_output=True, text=True)
                checked, wrong = run(emu, image, tmp / f'run{n}', a.top)
                ok = checked > 0 and wrong == 0
                failed |= not ok
                print(f'{"PASS" if ok else "FAIL"}  {PASSES[n]:7s} {checked} blocks checked, {wrong} differences',
                      flush=True)
        finally:
            subprocess.run(['git', 'worktree', 'remove', '--force', str(tree)], cwd=ROOT)
    sys.exit(1 if failed else 0)


def run(emu, image, tmp, top=False):
    tmp.mkdir()
    card = str(tmp / 'card.img')
    env = dict(os.environ, DTEMU_FW=str(image))

    def boot(*args):
        return subprocess.run([str(emu / 'dtboot'), str(image), '--every', '999G', '--card', card, *args],
                              capture_output=True, text=True, env=env)

    def press(key, at):
        return ['--press', f'{key}@{at}M:12M']

    def word(snap, addr):
        out = subprocess.run([str(emu / 'dtpeek'), str(snap), 'mem', f'{addr:x}', '4'],
                             capture_output=True, text=True, env=env).stdout
        return int(''.join(line.split(':', 1)[1] for line in out.splitlines() if ':' in line).replace(' ', ''), 16)

    # Format the card, dismiss the three notices, choose BD ANALOG; trigs on 1 and 9, PLAY,
    # then a tap of B for the 909 (emu_check.py's sequence), and a second of the 909.
    boot('--instr', '9G', '--card-save', *press('YES', 3900), *press('NO', 6001), *press('NO', 6503))
    ups = pick(press, top)
    sel = tmp / 'sel.snap'
    boot('--instr', '15G', *press('NO', 9201), *press('NO', 10001), *press('NO', 10801), *press('NO', 11601),
         '--press', 'FUNC@13201M:300M', *press('SRC', 13301), *ups, *press('YES', 14601), '--save', str(sel))
    seq = [*press('RECORD', 15201), *press('T1', 15301), *press('T9', 15351), *press('RECORD', 15401),
           *press('PLAY', 15501), *press('STOP', 15601), *press('PLAY', 15701)]
    end = tmp / 'end.snap'
    boot('--load', str(sel), '--instr', '18500M', *seq, *press('PUSH_B', 16101), '--save', str(end))
    out = subprocess.run([str(emu / 'dtpeek'), str(end), 'find', MARKER],
                         capture_output=True, text=True, env=env).stdout.split()
    if not out or not re.fullmatch(r'[0-9a-f]+', out[0]):
        return 0, 0
    at = int(out[0], 16)
    return word(end, at + 4), word(end, at + 8)


if __name__ == '__main__':
    main()
