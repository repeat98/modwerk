"""The reviewed standalone recipes (module-adapters/standalone-recipes.json) pin every authored input of Play Modes, Tape Echo
and Euclid by hash. A change to one of those files (a module's evidence, its manifest, src/catalog/modules.ts) leaves the
recipe stale, and the published package no longer rebuilds. That rebuild needs the m68k toolchain, which CI's SDK job does
not have, so it skips there; the drift hid until a computer with the toolchain ran it (20 November 2026: Tape Echo and
Euclid, after their CPU price evidence and the library's categories). Comparing the pins needs no toolchain."""
import importlib.util
import json
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
ADAPTERS = ROOT / 'sdk/machines/octatrack/module-adapters'
sys.path[:0] = [str(ADAPTERS), str(ROOT / 'sdk')]
spec = importlib.util.spec_from_file_location('standalone_runtime', ADAPTERS / 'standalone_runtime.py')
standalone = importlib.util.module_from_spec(spec)
spec.loader.exec_module(standalone)


def local(pins):
    """The pins of files in this repository; the Elekloader checkout's (upstream/...) are checked where it exists."""
    return {path: digest for path, digest in pins.items() if not path.startswith('upstream/')}


class StandaloneRecipePins(unittest.TestCase):
    def test_every_current_port_pins_the_files_it_builds_from(self):
        catalogue = {m['id']: m['version'] for m in json.loads((ROOT / 'sdk/catalog.json').read_text())['modules']}
        packages = json.loads((ROOT / 'src/engine/assets/octatrack-module-packages.json').read_text())['packages']
        with tempfile.TemporaryDirectory() as nowhere:
            for port in standalone.PORTS:
                row = next(p for p in packages if p['id'] == port)
                if row['version'] != catalogue[port] and row.get('lagsBehind') == catalogue[port]:
                    continue  # kept at an older version on purpose; its recipe waits for the new one (lagReason)
                with self.subTest(port=port):
                    pinned = local(standalone.reviewed(ROOT, port)['sources'])
                    found = local(standalone.sources(ROOT, nowhere, port))
                    self.assertEqual(found, pinned,
                                     '%s: the reviewed standalone recipe pins other inputs than the checkout holds. When the change '
                                     'leaves the compiled image as it was, pin the new hashes in standalone-recipes.json and check '
                                     'that `python3 -B scripts/octatrack-module-packages.py --check` rebuilds it identically '
                                     'with the m68k toolchain.' % port)


if __name__ == '__main__':
    unittest.main()
