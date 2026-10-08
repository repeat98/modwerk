"""Prove that native FX selectors resolve the rebuilt chooser on both cores.

Operate an existing private image and matching runtime ELF. The card must hold
the named disposable project. Logs and memory dumps stay in the ignored output;
report.json contains only fingerprints, identifiers and measured counters.
"""
from pathlib import Path
import argparse
import hashlib
import json
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / 'tools'))
import toolpath  # noqa: E402,F401
from remix import registry  # noqa: E402
from remix.stock_guard import BASE, OS_SHA256, stock_guard  # noqa: E402

# The six-byte stock instructions contain the list operands the builder moves.
# No original code or tables are carried by this verifier.
LIST_GUARDS = (
    (0x40052704, 'efd1b607503885e0c69b7ee1da68b6e40b26e6b8bde20414f72eb522041ea8fa'),
    (0x40052494, 'c8cd9be30a00628e26812850e47610ce9220610cba97eb26234387e38b4fc0c4'),
)
CURSORS, SETTERS = (0x460d5c94, 0x460d5ca8), (0x400526e4, 0x40052474)
COUNTERS = ('dl_selection_requested', 'dl_selection_completed', 'dl_selection_refused',
            'dl_residency_failures', 'dl_errors', 'phase')


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--image', type=Path, required=True)
    parser.add_argument('--runtime', type=Path, required=True)
    parser.add_argument('--card', type=Path, required=True)
    parser.add_argument('--set-name', default='OCTABAM')
    parser.add_argument('--project-name', default='RIG')
    parser.add_argument('--effect', action='append', required=True,
                        help='Native module key; repeats test every available slot on T1 and T5')
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    image, runtime, card, output = (path.resolve() for path in
                                     (args.image, args.runtime, args.card, args.output))
    if output.exists():
        parser.error('Output exists; choose a new directory to preserve prior evidence')
    output.mkdir(parents=True)
    raw = image.read_bytes()

    def word(address):
        offset = address - BASE
        if offset < 0 or offset + 4 > len(raw):
            raise ValueError('Chooser pointer outside built MAIN OS')
        return int.from_bytes(raw[offset:offset + 4], 'big')

    tables, rows = [], []
    for start, fingerprint in LIST_GUARDS:
        original = stock_guard(start, 6, fingerprint).read()
        offset = start - BASE
        if raw[offset:offset + 2] != original[:2]:
            raise ValueError('Stock selector list instruction changed')
        table = word(start + 2)
        entries = []
        for row in range(32):
            descriptor = word(table + row * 4)
            if not descriptor:
                break
            effect_id = word(descriptor)
            if effect_id > 31:
                raise ValueError('Invalid descriptor in rebuilt chooser')
            entries.append(effect_id)
        else:
            raise ValueError('Rebuilt chooser has no terminator')
        tables.append(table)
        rows.append(entries)

    symbols = {parts[2]: int(parts[0], 16)
               for line in subprocess.check_output(['m68k-elf-nm', str(runtime)], text=True).splitlines()
               if len(parts := line.split()) == 3}
    cases = []
    for key in args.effect:
        effect_id = registry.by_key(key).menu.fx2_id
        available = [(slot, entries.index(effect_id)) for slot, entries in enumerate(rows)
                     if effect_id in entries]
        if not available:
            raise ValueError(key + ' is absent from the actual rebuilt choosers')
        for slot, row in available:
            for track in (0, 4):
                cases.append((key, effect_id, slot, row, track))

    emulator = ROOT / 'out/emu/ot_emu'
    command = [str(emulator), '--image', str(image), '--card', str(card),
               '--mount', '--set', args.set_name, '--project', args.project_name,
               '--load-ms', '20000', '--frame', '--dsp']
    for index, (key, effect_id, slot, row, track) in enumerate(cases):
        folder = output / str(index)
        folder.mkdir()
        (folder / 'events.txt').write_text('2000 quit\n')
        pokes = ';'.join(f'{address + i:#x}={byte}'
                         for address, value, size in ((0x80000000, track, 1), (CURSORS[slot], row, 4))
                         for i, byte in enumerate(value.to_bytes(size, 'big')))
        dumps = ';'.join(f'{symbols[name]:#x},4={folder}/{name}.bin' for name in COUNTERS)
        dumps += f';0x80000ec4,16={folder}/ids.bin'
        scenario = [str(folder / 'port.private.log'), '--step', '-:poke:' + pokes,
                    '--step', f'-:call:{SETTERS[slot]:#x}',
                    '--live-script', str(folder / 'events.txt'), '--mem-dump', dumps,
                    '--dsp-peek', '0:X:215,64;1:X:215,64']
        if any(' ' in item for item in scenario):
            raise ValueError('Use private output paths without spaces for the scenario protocol')
        command += ['--scenario', ' '.join(scenario)]
    with (output / 'boot.private.log').open('w') as log:
        subprocess.run(command, cwd=ROOT, stdout=log, stderr=subprocess.STDOUT,
                       check=True, timeout=1800)
    if 'load run ended: LOAD PROJECT handled' not in (output / 'boot.private.log').read_text():
        raise ValueError('Disposable project did not finish loading')

    results = []
    for index, (key, effect_id, slot, row, track) in enumerate(cases):
        folder = output / str(index)
        counters = {name: int.from_bytes((folder / (name + '.bin')).read_bytes(), 'big')
                    for name in COUNTERS}
        selected = (folder / 'ids.bin').read_bytes()[slot * 8 + track]
        log = (folder / 'port.private.log').read_text()
        passed = (selected == effect_id and counters['dl_selection_completed'] == 1
                  and counters['dl_selection_requested'] == 1
                  and all(counters[name] == 0 for name in
                          ('dl_selection_refused', 'dl_residency_failures', 'dl_errors', 'phase'))
                  and 'ended on quit' in log and 'ILLEGAL' not in log)
        results.append({'effect': key, 'id': effect_id, 'slot': slot + 1, 'track': track + 1,
                        'chooserRow': row, 'selectedId': selected, 'counters': counters,
                        'passed': passed})
        print(('PASS' if passed else 'FAIL') + f': {key} T{track + 1} FX{slot + 1}, row {row}: {counters}')
    report = {'schemaVersion': 1, 'kind': 'native rebuilt chooser selection',
              'stockMainSha256': OS_SHA256, 'imageSha256': sha(image),
              'runtimeElfSha256': sha(runtime), 'emulatorSha256': sha(emulator),
              'sources': {str(path.relative_to(ROOT)): sha(path) for path in
                          (ROOT / 'platform/dsp-dynload-transport/selection.c',
                           ROOT / 'platform/dsp-dynload-transport/selection.s', Path(__file__))},
              'listPointers': tables, 'results': results, 'hardware': 'not tested'}
    (output / 'report.json').write_text(json.dumps(report, indent=2) + '\n')
    if not all(result['passed'] for result in results):
        raise SystemExit('Rebuilt chooser regression failed')


if __name__ == '__main__':
    main()
