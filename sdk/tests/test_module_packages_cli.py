# SPDX-License-Identifier: GPL-3.0-or-later
"""The portable package entry point forwards private preparation arguments."""
from pathlib import Path
import contextlib
import importlib.util
import io
import json
import shutil
import subprocess
import sys
import tempfile
import types
import unittest

ROOT = Path(__file__).resolve().parents[2]


class ModulePackagesCliTests(unittest.TestCase):
    def test_private_preparation_can_resolve_its_builder_module(self):
        # Exercise the actual wrapper with a private preparation entry point.
        # The published builder can remain older than that staged entry point;
        # no stock image, packages or catalogue are needed for this regression.
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            wrapper = root / 'scripts/octatrack-module-packages.py'
            wrapper.parent.mkdir()
            shutil.copy2(ROOT / 'scripts/octatrack-module-packages.py', wrapper)
            builder = root / 'sdk/machines/octatrack/elekloader/module_packages.py'
            builder.parent.mkdir(parents=True)
            builder.write_text('''from __future__ import annotations
import argparse, json, os, sys
from dataclasses import dataclass
from pathlib import Path
APP = Path(__file__).resolve().parents[4]
DSP = APP / 'src/engine/assets/dsp-packages.json'
@dataclass
class Preparation:
    ports: str
def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--prepare-ports', required=True)
    args = parser.parse_args()
    generator = sys.modules[__name__]
    print(json.dumps({'ports': Preparation(args.prepare_ports).ports,
                      'builder': generator.__name__,
                      'dsp': str(generator.DSP),
                      'cwd': str(Path.cwd()), 'utf8': os.environ['PYTHONUTF8']}))
''')
            result = subprocess.run([sys.executable, '-B', wrapper, '--prepare-ports',
                                     'recorder-loop-fix,playmodes'], cwd=ROOT,
                                    capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
            self.assertEqual(json.loads(result.stdout), {
                'ports': 'recorder-loop-fix,playmodes',
                'builder': 'octatrack_module_packages',
                'dsp': str(Path('src/engine/assets/dsp-packages.json')),
                'cwd': str(root.resolve()), 'utf8': '1'})

    def test_usb_package_behind_its_catalogue_version(self):
        spec = importlib.util.spec_from_file_location('module_packages_cli', ROOT / 'scripts/octatrack-module-packages.py')
        cli = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(cli)
        catalogue = {m['id']: m['version'] for m in json.loads((ROOT / 'sdk/catalog.json').read_text())['modules']}['everb']
        old = {'id': 'everb', 'version': '0.0.1-experimental', 'lagsBehind': catalogue}
        cases = (('declared lag', old, False, {0}, 0), ('declared lag, written', old, True, {0}, 0),
                 ('undeclared lag', {'id': 'everb', 'version': '0.0.1-experimental'}, True, {0}, 1),
                 ('undeclared lag, written', {'id': 'everb', 'version': '0.0.1-experimental'}, False, set(), 0),
                 ('stale lag note', dict(old, version=catalogue), True, {0}, 1),
                 ('current', {'id': 'everb', 'version': catalogue}, True, set(), 0))
        with tempfile.TemporaryDirectory() as temp:
            for name, entry, check, held, failed in cases:
                with self.subTest(name), contextlib.redirect_stdout(io.StringIO()):
                    manifest = Path(temp) / 'packages.json'
                    manifest.write_text(json.dumps({'packages': [entry]}))
                    _, got, code = cli.lag_guard(types.SimpleNamespace(MANIFEST=manifest), check)
                    self.assertEqual((set(got), code), (held, failed))

    def test_a_write_keeps_every_package_it_did_not_rewrite(self):
        spec = importlib.util.spec_from_file_location('module_packages_keep', ROOT / 'scripts/octatrack-module-packages.py')
        cli = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(cli)
        with tempfile.TemporaryDirectory() as temp:
            public = Path(temp)
            folder = public / 'octatrack-modules'
            old, current = folder / 'mod/0.1.0-experimental.mwrm', folder / 'mod/0.2.0-experimental.mwrm'
            def seed():
                shutil.rmtree(folder, ignore_errors=True)
                old.parent.mkdir(parents=True)
                old.write_bytes(b'old'); current.write_bytes(b'stale')
            def rebuild(fail):
                def action():
                    shutil.rmtree(folder)  # as the builder does before its first write
                    current.parent.mkdir(parents=True)
                    current.write_bytes(b'new')
                    if fail:
                        raise SystemExit(1)
                return action
            builder = types.SimpleNamespace(PUBLIC=public)
            seed()
            cli.keep_published(builder, rebuild(False))
            self.assertEqual((old.read_bytes(), current.read_bytes()), (b'old', b'new'))
            seed()
            with self.assertRaises(SystemExit):
                cli.keep_published(builder, rebuild(True))
            self.assertEqual((old.read_bytes(), current.read_bytes()), (b'old', b'new'))

if __name__ == '__main__':
    unittest.main()
