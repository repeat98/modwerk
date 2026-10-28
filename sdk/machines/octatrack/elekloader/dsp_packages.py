#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""The catalogue's DSP effects as relocatable packages, from their sources, on the Elekloader path: no stock image
and no Octabam build tools (docs/OCTATRACK_ELEKLOADER_MIGRATION.md, the site on the Elekloader core, step 1).

  ELEKLOADER_DSP_ASM=.../dsp_asm python3 -B dsp_packages.py [--check src/engine/assets/dsp-packages.json] [--out F]

Each module comes from Elekloader's own reader of the module manifests (elekloader.sdk.octabam). Its DSP source is
assembled with dsp_asm at two origins, as Elekloader's dsp_assemble does: a word that moves with the origin is a
relocation. A module's P table (DspSection.ptable) goes first; the source names its address with the literal
$fab1e0, which takes the table's origin. Proofs: fresh assemblies at four bases (and, for a split table, the table
and the program apart), the form sdk/runtime/loader/build.py checks. --check compares every field with the
published file; hooked DSP code (Sidechain Compressor, Output Matrix) is not built here yet."""
import argparse, hashlib, json, os, subprocess, sys, tempfile
from pathlib import Path

APP = Path(__file__).resolve().parents[4]
SDK = APP / 'sdk/octabam'
sys.path.append(str(APP / 'sdk'))  # firmware_codec
import firmware_codec  # noqa: E402
firmware_codec.use_elekloader(os.environ.get('ELEKLOADER_UPSTREAM', str(Path.home() / '.cache/modwerk-upstream/elekloader')))
from elekloader.sdk.octabam import Octabam  # noqa: E402

LITERAL = '$fab1e0'  # the P table's address in a module's source
ORGS = (0x100000, 0x200000)
PROOF_BASES = (0x1000, 0x1400, 0x1801, 0x2407)
SPLIT_BASES = ((0x1000, 0x5000), (0x2407, 0x1100), (0x1801, 0x7003))  # (table, program); (0x1400, beside) is added
FX = ('airwindows-chorus', 'euclid', 'everb', 'miniverb', 'modulation', 'spectrum', 'tapeecho', 'tapehead')
digest = lambda words: hashlib.sha256(b''.join(w.to_bytes(3, 'big') for w in words)).hexdigest()


def assemble(text, org, work):
    asm = os.environ.get('ELEKLOADER_DSP_ASM', 'dsp_asm')
    src, out, sym = (os.path.join(work, 'dsp.%x.%s' % (org, e)) for e in ('asm', 'bin', 'sym'))
    Path(src).write_text(text)
    subprocess.run([asm, '-in', src, '-org', '%x' % org, '-out', out, '-sym', sym], check=True, capture_output=True)
    b = Path(out).read_bytes()
    labels = {line.split()[0]: int(line.split()[1], 16) for line in Path(sym).read_text().splitlines() if line.strip()}
    return [b[i] | b[i + 1] << 8 | b[i + 2] << 16 for i in range(0, len(b), 3)], labels


def package(ob, name, version, work):
    m = ob.modules[name]
    table, text = [w & 0xffffff for w in (m.dsp.ptable or ())], (SDK / m.dsp.asm).read_text()
    n, built = len(table), []
    for org in ORGS:  # the table at org, the code right after it
        words, labels = assemble(text.replace(LITERAL, '$%x' % org), org + n, work)
        built.append((table + words, labels['init'] - org, labels['proc'] - org))
    (words, init, proc), (other, init2, proc2) = built
    if len(words) != len(other) or (init, proc) != (init2, proc2):
        raise ValueError('%s assembles differently at two origins' % name)
    relocations = []
    for i, (a, b) in enumerate(zip(words, other)):
        if a != b:
            if b - a != ORGS[1] - ORGS[0] or not 0 <= a - ORGS[0] <= len(words):
                raise ValueError('%s: word %d holds an address the loader cannot place' % (name, i))
            relocations.append(i)
            words[i] = a - ORGS[0]
    proofs = [dict(base=base, sha256=digest(table + assemble(text.replace(LITERAL, '$%x' % base), base + n, work)[0])) for base in PROOF_BASES]
    split = {}
    if m.dsp.split_ptable:
        if any(words[r] < n for r in relocations if r < n) or min(init, proc) < n:
            raise ValueError('%s: its table holds code references or entry points' % name)
        split_proofs = []
        for table_base, program_base in SPLIT_BASES + ((0x1400, 0x1400 + n),):
            fresh, labels = assemble(text.replace(LITERAL, '$%x' % table_base), program_base, work)
            moved = [w + (table_base if w < n else program_base - n) if i in relocations else w for i, w in enumerate(words)]
            if moved != table + fresh or (labels['init'], labels['proc']) != (program_base + init - n, program_base + proc - n):
                raise ValueError('%s: placing the table and the program apart differs from a fresh assembly' % name)
            split_proofs.append(dict(tableBase=table_base, programBase=program_base, sha256=digest(moved)))
        split = dict(splitTableWords=n, splitProofs=split_proofs)
    sources = {path: hashlib.sha256((SDK / path).read_bytes()).hexdigest() for path in (m.dsp.asm, 'modules/%s/manifest.py' % name)}
    return dict(id=name, version=version, key=m.key, author=m.author, sources=sources, fxId=m.menu.fx2_id, words=len(words),
                code=''.join('%06x' % w for w in words), sha256=digest(words), relocations=relocations, init=init, proc=proc,
                proofs=proofs, **split)


def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument('--check', type=Path, help='a published dsp-packages.json: compare every field, exit 1 on a difference')
    ap.add_argument('--out', type=Path, help='write the built packages here (JSON)')
    a = ap.parse_args()
    versions = {m['id']: m['version'] for m in json.loads((APP / 'sdk/catalog.json').read_text())['modules']}
    ob = Octabam(str(SDK))
    with tempfile.TemporaryDirectory() as work:
        built = [package(ob, name, versions[name], work) for name in FX]
    if a.out: a.out.write_text(json.dumps(dict(packages=built), indent=2) + '\n')
    if not a.check: return
    published = {p['id']: p for p in json.loads(a.check.read_text())['packages']}
    failed = 0
    for p in built:
        diff = sorted(k for k in set(p) | set(published.get(p['id'], {})) if p.get(k) != published.get(p['id'], {}).get(k))
        print('%-18s %s' % (p['id'], 'identical' if not diff else 'differs in ' + ', '.join(diff)))
        failed += bool(diff)
    sys.exit(1 if failed else 0)


if __name__ == '__main__':
    main()
