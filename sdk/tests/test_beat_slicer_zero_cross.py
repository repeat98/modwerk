# SPDX-License-Identifier: MIT
"""Run the private source proposal through the real editor and client tests."""
from pathlib import Path
import importlib.util
import json
import shutil
import subprocess
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]
HERE = ROOT / 'sdk/drafts/beat-slicer/zero-cross'


@unittest.skipUnless(shutil.which('cc'), 'host C compiler unavailable')
class ZeroCrossCandidate(unittest.TestCase):
    def test_hardware_preparation_offline(self):
        result = subprocess.run([sys.executable, '-B', str(HERE / 'hardware/test_preparation.py')],
                                cwd=ROOT, capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)

    def test_source_proposal_and_real_service_controller_regressions(self):
        spec = importlib.util.spec_from_file_location('snap_source_preparation', HERE / 'prepare_base.py')
        stage = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(stage)
        receipt = json.loads((HERE / 'build.json').read_text())
        self.assertEqual(stage.digest(HERE / 'base.patch'), receipt['basePatchSha256'])
        for name, expected in receipt['sourceSha256'].items():
            self.assertEqual(stage.digest(HERE / name), expected, name)
        native = json.loads((HERE / 'native-evidence.json').read_text())
        self.assertEqual(stage.digest(HERE / 'test_native_ui.cpp'), native['uiProbeSha256'])
        self.assertEqual(native['packageSha256'], receipt['packageSha256'])
        with tempfile.TemporaryDirectory() as temporary:
            source = stage.prepare(ROOT, Path(temporary) / 'source')
            for name in ('sdk/tests/test_sample_editor.py',
                         'sdk/tests/test_sample_editor_snap.py',
                         'sdk/drafts/beat-slicer/zero-cross/test_device_module.py'):
                result = subprocess.run([sys.executable, '-B', str(source / name)],
                                        cwd=source, capture_output=True, text=True)
                self.assertEqual(result.returncode, 0, name + '\n' + result.stdout + result.stderr)


if __name__ == '__main__':
    unittest.main()
