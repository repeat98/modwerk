# SPDX-License-Identifier: MIT
"""Every published base-bound package is one the committed beta base trusts.

The base admits a base-bound controller (Analog BD, Sidechain Compressor, Output Matrix) only when its package's
controller digest equals a trust row in controller-policies.json, and those rows are built into the base. A base change
that moves a symbol a controller links against changes that controller's digest, and with it the row: every such
package must then be relinked against the new base. One held back at an older version (lagsBehind) is never rebuilt, so
the base change must leave the symbols it links against where they are. Without this check the site would offer a
package the new base silently refuses. No toolchain or firmware: hashes of committed files only."""
import json
import pathlib
import sys
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'sdk/runtime/loader'))
import abi9  # noqa: E402

ROWS = ROOT / 'sdk/machines/octatrack/module-adapters/controller-policies.json'
MANIFEST = ROOT / 'src/engine/assets/octatrack-module-packages.json'


class BaseBoundTrust(unittest.TestCase):
    def test_every_published_base_bound_package_is_trusted_by_the_base(self):
        rows = json.loads(ROWS.read_text())
        packages = {p['id']: p for p in json.loads(MANIFEST.read_text())['packages']}
        trusted = {(r['module'], r['controllerSha256']) for r in rows}
        for module in sorted({r['module'] for r in rows}):
            with self.subTest(module=module):
                entry = packages.get(module)
                self.assertIsNotNone(entry, '%s has a trust row but no published package' % module)
                digest = abi9.controller_sha256((ROOT / 'public' / entry['path']).read_bytes())
                self.assertIn((module, digest), trusted,
                              '%s %s is not trusted by the committed base: relink it (npm run octatrack:module-packages '
                              '-- --base-only), or, when it is held back (lagsBehind), keep the base symbols its '
                              'controller links against where they were' % (module, entry['version']))

    def test_every_base_bound_package_names_the_committed_base(self):
        # The builder sets requiredBase only on what it relinks; a held entry keeps the old base's identity unless
        # it is moved by hand (d720a028a, fixed in 3cb49bae8), and the site would then refuse it on the new base.
        identity = json.loads((ROOT / 'sdk/machines/octatrack/base-binding.json').read_text())['identity']
        for entry in json.loads(MANIFEST.read_text())['packages']:
            if entry.get('base'):
                with self.subTest(module=entry['id']):
                    self.assertEqual(entry.get('requiredBase'), identity,
                                     '%s %s names another base: set its requiredBase to base-binding.json\'s identity '
                                     'once the base trusts it' % (entry['id'], entry['version']))


if __name__ == '__main__':
    unittest.main()
