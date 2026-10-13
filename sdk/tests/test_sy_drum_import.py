"""SY DRUM: read-only pinned-source and stock-hygiene checks; never evaluate module code."""
import ast
import hashlib
import json
from pathlib import Path
import unittest

APP = Path(__file__).resolve().parents[2]
RECORD = json.loads((APP/'sdk/imports/sy-drum-39dc5d8.json').read_text())
FOLDER = APP/RECORD['folder']
sha = lambda path: hashlib.sha256(path.read_bytes()).hexdigest()


class SyDrumImport(unittest.TestCase):
    def test_every_recorded_file_is_present_and_unchanged(self):
        self.assertEqual(RECORD['authorPin']['revision'], '39dc5d8ca285c14674b66a452f58a5a0364efb96')
        paths = [item['path'] for item in RECORD['files']]
        self.assertEqual(len(paths), len(set(paths)))
        for item in RECORD['files']:
            self.assertEqual(sha(FOLDER/item['path']), item['sha256'], item['path'])
            if item['path'].startswith('upstream/'):
                self.assertEqual(item['revision'], RECORD['authorPin']['revision'])
                if item['path'] == 'upstream/sy-drum/manifest.py':
                    self.assertTrue(item.get('changes'))
                else:
                    self.assertEqual(item['sourceSha256'], item['sha256'], item['path'])
        upstream = {p.relative_to(FOLDER).as_posix() for p in (FOLDER/'upstream').rglob('*') if p.is_file() and '__pycache__' not in p.parts}
        self.assertEqual(upstream, {p for p in paths if p.startswith('upstream/')})

    def test_stock_expectations_are_guards_only(self):
        source = (FOLDER/'upstream/sy-drum/manifest.py').read_text()
        self.assertNotIn('bytes.fromhex', source)
        tree = ast.parse(source)
        assignments = {target.id: node.value for node in tree.body if isinstance(node, ast.Assign)
                       for target in node.targets if isinstance(target, ast.Name)}
        for name, value in assignments.items():
            if name.endswith('_STOCK'):
                self.assertIsInstance(value, ast.Call, name)
                self.assertEqual(value.func.id, 'stock_guard', name)
        rows = assignments['LOCK_HOOKS'].elts
        self.assertEqual(len(rows), 51)
        for row in rows:
            self.assertEqual(row.elts[1].func.id, 'stock_guard')
            self.assertEqual(row.elts[0].value, row.elts[1].args[0].value)
        guards = json.loads((FOLDER/'stock-guards.json').read_text())['guards']
        self.assertEqual(len(guards), 53)
        self.assertEqual(len({g['address'] for g in guards}), 53)
        for guard in guards:
            self.assertEqual(set(guard), {'path', 'address', 'length', 'sha256'})
            self.assertRegex(guard['sha256'], r'^[a-f0-9]{64}$')

    def test_name_and_trademark_line(self):
        sentence = 'It is not affiliated with or endorsed by Pearl or Behringer'
        for name in ['README.md', 'LICENSE']:
            self.assertIn(sentence, (FOLDER/name).read_text().replace('\n', ' '))
        doc = json.loads((FOLDER/'octamod.module.json').read_text())
        self.assertEqual(doc['key'], 'SY DRUM')
        self.assertIn(sentence, doc['presentation']['overview'])
        own = [FOLDER/'README.md', FOLDER/'TESTING.md', FOLDER/'octamod.module.json', FOLDER/'manifest.py']
        for path in own:
            for line in path.read_text().splitlines():
                if 'SYNCUSSION' in line.upper():
                    self.assertIn('Pearl Syncussion SY-1', line, path.name)


if __name__ == '__main__':
    unittest.main()
