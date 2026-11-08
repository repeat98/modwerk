"""Battery RAM ranges (sdk/machines/octatrack/battery-ram.json): no two overlap, and every address the base, a module
or a draft names in the span stock leaves free lies in a range its owner holds. The base's code may name any range (it
reads the others' records); a module's or draft's only its own. Comments are not read, and test, probe and emulator
files may name any range: they read, they do not keep."""
import json
import re
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
LEDGER = ROOT / 'sdk/machines/octatrack/battery-ram.json'
CODE = {'.c', '.h', '.cpp', '.s', '.S'}
READER = re.compile(r'(^|/)test_[^/]*$|(^|/)qualification/|emulator|probe|capture|stress')
ADDRESS = re.compile(r'\b0x100f[0-9a-f]{4}(?![0-9a-f])', re.I)  # C's u and l suffixes allowed


def code_of(text, suffix):
    """The text without its comments: C's, and the ColdFire assembler's '|' to the line's end."""
    text = re.sub(r'/\*.*?\*/', ' ', text, flags=re.S)
    return re.sub(r'\|[^\n]*', '', text) if suffix in ('.s', '.S') else re.sub(r'//[^\n]*', '', text)


def owner_of(path):
    """'base' for the base's sources, a module's or draft's folder name, None for anything else."""
    parts = path.split('/')
    if parts[:4] == ['sdk', 'machines', 'octatrack', 'elekloader'] or parts[:2] == ['sdk', 'runtime']:
        return 'base'
    if parts[:3] == ['sdk', 'octabam', 'modules'] and len(parts) > 4:
        return parts[3]
    if parts[:2] == ['sdk', 'drafts'] and len(parts) > 3:
        return parts[2]
    return None


def ledger():
    doc = json.loads(LEDGER.read_text())
    free = tuple(int(v, 16) for v in doc['free'])
    return free, [dict(r, lo=int(r['from'], 16), hi=int(r['to'], 16)) for r in doc['ranges']]


def misplaced(files, free, ranges):
    """(path, line, address, why) for every address outside its owner's ranges."""
    out = []
    for path, text in files:
        owner = owner_of(path)
        if owner is None or Path(path).suffix not in CODE or '/upstream/' in path or READER.search(path):
            continue
        for number, line in enumerate(code_of(text, Path(path).suffix).split('\n'), 1):
            for match in ADDRESS.finditer(line):
                at = int(match.group(), 16)
                if not free[0] <= at < free[1]:
                    continue  # stock's own battery RAM
                held = [r for r in ranges if r['lo'] <= at < r['hi']]
                if not held:
                    out.append((path, number, match.group(), 'in no range'))
                elif owner != 'base' and all(r['owner'] != owner for r in held):
                    out.append((path, number, match.group(), "in %s's range" % held[0]['owner']))
    return out


class BatteryRam(unittest.TestCase):
    def test_ranges_lie_in_the_free_span_and_never_overlap(self):
        free, ranges = ledger()
        for r in ranges:
            self.assertTrue(free[0] <= r['lo'] < r['hi'] <= free[1], r)
            self.assertTrue(r['owner'] and r['what'], r)
        ordered = sorted(ranges, key=lambda r: r['lo'])
        for a, b in zip(ordered, ordered[1:]):
            self.assertLessEqual(a['hi'], b['lo'], '%s (%s) and %s (%s) overlap' % (a['owner'], a['from'], b['owner'], b['from']))

    def test_every_named_address_lies_in_a_range_its_owner_holds(self):
        free, ranges = ledger()
        listed = subprocess.run(['git', 'ls-files', 'sdk/machines/octatrack/elekloader', 'sdk/runtime', 'sdk/octabam/modules',
                                 'sdk/drafts'], cwd=ROOT, capture_output=True, text=True, check=True).stdout.split()
        files = [(p, (ROOT / p).read_text(errors='replace')) for p in listed if Path(p).suffix in CODE]
        found = misplaced(files, free, ranges)
        self.assertEqual(found, [], '\n'.join('%s:%d: battery RAM %s is %s. Add the range its owner keeps to '
                                              'sdk/machines/octatrack/battery-ram.json, or move it (no two ranges may overlap).'
                                              % f for f in found))

    def test_the_scan_reads_code_only_and_knows_each_owner(self):
        free, ranges = (0x100f859c, 0x100fff00), [dict(owner='base', what='x', lo=0x100fc000, hi=0x100fe000),
                                                  dict(owner='mymod', what='y', lo=0x100f9000, hi=0x100f9100)]
        c = '/* 0x100f9200 in a comment */\nint a = 0x100f9000u;\nint b = 0x100fc010u; // 0x100f9300\nint c = 0x100f9200u;\n'
        s = '        move.l %d0,(0x100fc004).l | 0x100f9300 in a comment\n'
        self.assertEqual(misplaced([('sdk/octabam/modules/mymod/x.c', c), ('sdk/drafts/other/y.s', s),
                                    ('sdk/drafts/other/test_y.c', 'int z = 0x100f9000u;'),
                                    ('sdk/machines/octatrack/elekloader/z.c', 'int w = 0x100f9000u;')], free, ranges),
                         [('sdk/octabam/modules/mymod/x.c', 3, '0x100fc010', "in base's range"),
                          ('sdk/octabam/modules/mymod/x.c', 4, '0x100f9200', 'in no range'),
                          ('sdk/drafts/other/y.s', 1, '0x100fc004', "in base's range")])


if __name__ == '__main__':
    unittest.main()
