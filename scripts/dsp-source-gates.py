"""Two source gates over every DSP56300 source in the repository, before anything is assembled.

Both come from octabam (sdk/octabam/tools/build/norep.py and nolabelprefix.py, pinned in
sdk/imports/octabam-infrastructure-5c71bc8c.json; the traps are in sdk/octabam/docs/TRAPS.md):

- `rep`: a `rep` cannot be interrupted, so a payload's host-command vectors that arm the
  ColdFire's DMA answer late. Two units showed crackle on core B and then silent tracks.
  `do #n,>label / <one instruction> / label:` is bit-identical and interruptible.
- a label that is a prefix of another label: dsp_asm substitutes label names as raw
  substrings, so a reference to the longer label assembles as the shorter label's address
  with the leftover characters appended, and the disassemble-what-you-assemble check cannot
  see it.

A label-prefix clash is always refused. A `rep` is refused in a module listed in
sdk/catalog.json from REP_REFUSED_FROM on, in a module not listed there yet, and in the
platform and base sources. Modules listed before that date keep the `rep` they shipped with:
it is reported, and `--base <commit>` additionally refuses any `rep` they did not have at that
commit.

  python3 -B scripts/dsp-source-gates.py [--base <commit>]   # everything; exit 1 on a refusal
  python3 -B scripts/dsp-source-gates.py --json <module id>  # one module's findings as JSON
"""
import json
import pathlib
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'sdk/octabam/tools/build'))
from nolabelprefix import label_prefix_clashes  # noqa: E402
from norep import REP  # noqa: E402

REP_REFUSED_FROM = '2026-10-23'
MODULES = ROOT / 'sdk/octabam/modules'
SHARED = (ROOT / 'sdk/octabam/platform', ROOT / 'sdk/machines/octatrack')
SKIPPED_PARTS = {'upstream', 'evidence', '__pycache__'}


def rep_lines(text):
    return [n for n, line in enumerate(text.split('\n'), 1) if REP.match(line.split(';')[0])]


def sources(folder):
    if not folder.is_dir():
        return []
    return sorted(p for p in folder.rglob('*.asm') if not SKIPPED_PARTS & set(p.relative_to(folder).parts))


def catalog_added():
    path = ROOT / 'sdk/catalog.json'
    if not path.is_file():
        return {}
    catalog = json.loads(path.read_text(encoding='utf-8'))
    return {item['id']: item.get('addedAt', '') for item in catalog.get('modules', [])}


def base_rep_count(base, path):
    """How many `rep` lines the file had at the base commit; None when it did not exist."""
    run = subprocess.run(['git', 'show', f'{base}:{path.relative_to(ROOT).as_posix()}'], cwd=ROOT,
                         stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, encoding='utf-8', errors='replace')
    if run.returncode != 0:
        return None
    return len(rep_lines(run.stdout or ''))


def check_folder(folder, rep_refused, base=None):
    """(errors, warnings, files) for one folder. Paths are repository-relative."""
    errors, warnings, files = [], [], 0
    for path in sources(folder):
        files += 1
        rel = path.relative_to(ROOT).as_posix() if path.is_relative_to(ROOT) else path.name
        text = path.read_text(encoding='utf-8', errors='replace')
        clashes = label_prefix_clashes(text)
        if clashes:
            pairs = '; '.join(f'{a} / {b}' for a, b in clashes[:6])
            errors.append(f'{rel}: label prefix {pairs}: dsp_asm would assemble a reference to the longer label as the shorter one\'s address plus the leftover characters; rename one')
        reps = rep_lines(text)
        if not reps:
            continue
        where = ', '.join(map(str, reps[:6])) + (', ...' if len(reps) > 6 else '')
        if rep_refused:
            errors.append(f'{rel}: rep on line {where}: a rep cannot be interrupted and holds off the DMA-arming host commands; use do #n,>label / one instruction / label:')
            continue
        before = base_rep_count(base, path) if base else None
        if before is not None and len(reps) > before:
            errors.append(f'{rel}: {len(reps)} rep lines, {before} at the base commit: a module may keep the rep it shipped with but not add one; use do #n,>label / one instruction / label:')
        else:
            warnings.append(f'{rel}: rep on line {where}, carried from before {REP_REFUSED_FROM}; do #n,>label / one instruction / label: is bit-identical and interruptible')
    return errors, warnings, files


def module_findings(module_id, added, base=None):
    rep_refused = added.get(module_id, '9999') >= REP_REFUSED_FROM
    errors, warnings, files = check_folder(MODULES / module_id, rep_refused, base)
    return {'module': module_id, 'files': files, 'repRefused': rep_refused, 'errors': errors, 'warnings': warnings}


def main(argv):
    added = catalog_added()
    if '--json' in argv:
        module_id = argv[argv.index('--json') + 1]
        if not (MODULES / module_id).is_dir():
            sys.exit(f'no module folder sdk/octabam/modules/{module_id}')
        print(json.dumps(module_findings(module_id, added)))
        return 0
    base = argv[argv.index('--base') + 1] if '--base' in argv else None
    errors, warnings, files = [], [], 0
    for folder in sorted(p for p in MODULES.iterdir() if p.is_dir() and not p.name.startswith('_')) if MODULES.is_dir() else []:
        found = module_findings(folder.name, added, base)
        errors += found['errors']; warnings += found['warnings']; files += found['files']
    for folder in SHARED:
        e, w, f = check_folder(folder, True, base)
        errors += e; warnings += w; files += f
    for line in warnings:
        print('warning: ' + line)
    for line in errors:
        print('error: ' + line, file=sys.stderr)
    print(f'DSP source gates: {files} sources checked, {len(errors)} refused, {len(warnings)} carrying a pre-{REP_REFUSED_FROM} rep')
    return 1 if errors else 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
