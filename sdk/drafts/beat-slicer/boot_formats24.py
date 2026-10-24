"""Check actual 24-bit-retaining Flex loads using a private authored project variant.

Changes only LOAD_24BIT_FLEX in the disposable project's two text settings
files, then delegates normal stock loads/PCM verification to boot_formats.py.
No firmware patches, injected calls, device access or card write-back.
"""
import argparse
import json
from pathlib import Path
import subprocess
import sys
from boot_formats import card_functions
from boot_observe import digest
from inspect_stock import STOCK_MAIN_SHA256

ROOT = Path(__file__).resolve().parent


def main():
    p = argparse.ArgumentParser(description=__doc__)
    for name in ('emulator', 'main', 'card', 'card-tool', 'output'):
        p.add_argument('--' + name, type=Path, required=True)
    p.add_argument('--card-sha256', required=True)
    p.add_argument('--card-tool-sha256', required=True)
    a = p.parse_args()
    if not __debug__:
        p.error('Assertions must remain enabled.')
    out, repo = a.output.resolve(), ROOT.parents[2]
    if out.exists() or out == repo or repo in out.parents:
        p.error('Use a fresh private output directory outside Git.')
    if digest(a.main) != STOCK_MAIN_SHA256 or digest(a.card) != a.card_sha256 or digest(a.card_tool) != a.card_tool_sha256:
        p.error('Private stock/card/tool identity differs.')
    out.mkdir(parents=True)
    build, extract = card_functions(a.card_tool)
    baseline = extract(a.card.read_bytes(), out / 'tree')
    assert len(baseline) == 53
    names = ['BEATLAB/PROJECT 261023/project.' + suffix for suffix in ('work', 'strd')]
    changes = []
    for name in names:
        path = out / 'tree' / name
        before = path.read_bytes()
        old, new = b'LOAD_24BIT_FLEX=0\r\n', b'LOAD_24BIT_FLEX=1\r\n'
        assert before.count(old) == 1 and new not in before, 'Unexpected fixture project setting'
        before_sha = digest(path)
        path.write_bytes(before.replace(old, new))
        changes.append({'file': name, 'beforeSha256': before_sha, 'afterSha256': digest(path),
                        'change': 'LOAD_24BIT_FLEX 0 to 1; all other text preserved'})
    image = build(out / 'tree', size_mb=32)
    files = extract(image)
    assert files.keys() == baseline.keys()
    assert all(files[name] == data for name, data in baseline.items() if name not in names)
    assert all(files[name] == (out / 'tree' / name).read_bytes() for name in names)
    card = out / 'retain24.private.img'
    card.write_bytes(image)
    card_sha = digest(card)
    command = [sys.executable, '-B', str(ROOT / 'boot_formats.py'),
               '--emulator', str(a.emulator.resolve()), '--main', str(a.main.resolve()),
               '--card', str(card), '--card-sha256', card_sha,
               '--card-tool', str(a.card_tool.resolve()), '--card-tool-sha256', a.card_tool_sha256,
               '--output', str(out / 'loads')]
    for index in (0, 2, 4, 6):
        command += ['--case', str(index)]
    subprocess.run(command, check=True)
    report = json.loads((out / 'loads/formats.json').read_text())
    assert [r['case'] for r in report['results']] == [0, 2, 4, 6]
    assert all(r['inputBits'] == r['outputBits'] and r['conversion'] == 'none' for r in report['results'])
    assert [r['formatId'] for r in report['results']] == [2, 3, 0, 1]
    assert digest(card) == card_sha and digest(a.card) == a.card_sha256
    report['scope'] = 'full stock 16/24-bit mono/stereo loads with authored LOAD_24BIT_FLEX=1 project; paused PCM observations, no module/device'
    report['sourceSha256']['boot_formats24.py'] = digest(ROOT / 'boot_formats24.py')
    report['originalCardSha256'] = a.card_sha256
    report['projectVariant'] = changes
    report['otherProjectFilesUnchanged'] = True
    (out / 'formats24.json').write_text(json.dumps(report, indent=2) + '\n')
    print('PASS: four native Flex formats retain complete original PCM under the authored 24-bit project setting')


if __name__ == '__main__':
    main()
