# SPDX-License-Identifier: GPL-3.0-or-later
"""Private preparation boundaries; synthetic authored images, no stock fixture."""
import importlib.util
import os
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest import mock

ROOT = Path(__file__).resolve().parents[2]
def load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module)
    return module
prep = load('runtime_spans', ROOT / 'scripts/prepare-runtime-spans.py')
packages = load('runtime_span_test_packages', ROOT / 'sdk/machines/octatrack/elekloader/module_packages.py')


class ProvenanceTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(); self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.source = self.root / 'authored.s'; self.source.write_text('.text\nauthored:\n  nop\n  rts\n')
        self.image = bytes(range(1, 25)) + bytes(8)
        self.sources = {'authored.s': prep.digest(self.source.read_bytes())}
        self.copy = dict(offset=0, length=24, address=0x40001000, sha256=prep.digest(self.image[:24]),
                         purpose='independently assembled synthetic instructions',
                         authored=dict(source='authored.s', lines=[2, 4], symbol='authored', method='native-unit'))
        self.recipe = dict(schema=1, imageSha256=prep.digest(self.image), sources=self.sources, copies=[self.copy], fills=[])
        self.stock_at = lambda address, n: self.image[address - 0x40001000:address - 0x40001000 + n]

    def validate(self, recipe=None, offsets=()):
        prep.validate_review(self.image, offsets, recipe or self.recipe, self.sources, self.root, self.stock_at)

    def test_accepts_exact_authored_provenance_with_actual_matching_stock(self):
        self.validate()

    def test_source_image_span_and_stock_guard_cannot_be_relabeled(self):
        for patch in ({'schema': 2}, {'sources': {}}, {'imageSha256': '0' * 64},
                      {'copies': [{**self.copy, 'sha256': '0' * 64}]},
                      {'copies': [{**self.copy, 'address': 0x40001001}]}):
            with self.subTest(patch=patch), self.assertRaises(ValueError):
                self.validate({**self.recipe, **patch})
        self.source.write_text('.text\nauthored:\n  rts\n')
        with self.assertRaisesRegex(ValueError, 'source'):
            self.validate()

    def test_code_fills_missing_source_and_unreviewed_method_are_refused(self):
        for patch in ({'fills': [dict(offset=0, length=24, value=255)]},
                      {'copies': [{**self.copy, 'purpose': ''}]},
                      {'copies': [{**self.copy, 'authored': {}}]},
                      {'copies': [{**self.copy, 'authored': {**self.copy['authored'], 'lines': [2, 5]}}]},
                      {'copies': [{**self.copy, 'authored': {**self.copy['authored'], 'source': '../authored.s'}}]},
                      {'copies': [{**self.copy, 'authored': {**self.copy['authored'], 'method': 'assumed'}}]}):
            with self.subTest(patch=patch), self.assertRaises(ValueError):
                self.validate({**self.recipe, **patch})

    def test_copy_cannot_overlap_relocations_another_copy_or_image_bounds(self):
        for offsets in ([0], [22]):
            with self.subTest(offsets=offsets), self.assertRaisesRegex(ValueError, 'overlap'):
                self.validate(offsets=offsets)
        for copies in ([self.copy, self.copy], [{**self.copy, 'offset': -1}],
                       [{**self.copy, 'length': 33}], [{**self.copy, 'offset': 20}],
                       [{**self.copy, 'address': 0xfffffff0}]):
            with self.subTest(copies=copies), self.assertRaises(ValueError):
                self.validate({**self.recipe, 'copies': copies})

    def test_private_artifacts_are_exclusive_and_not_in_git(self):
        folder = prep.private_directory(self.root / 'private')
        file = folder / 'proof.json'; prep.save(file, {'synthetic': True})
        if os.name == 'nt':
            prep.private_paths.check_windows_acl(prep.private_paths.windows_acl(folder), True)
            prep.private_paths.check_windows_acl(prep.private_paths.windows_acl(file), False)
        else:
            self.assertEqual(folder.stat().st_mode & 0o777, 0o700)
            self.assertEqual(file.stat().st_mode & 0o777, 0o600)
        with self.assertRaises(FileExistsError):
            prep.save(file, b'overwrite')
        symlink = folder / 'link'; symlink.symlink_to(self.source)
        with self.assertRaises(FileExistsError):
            prep.save(symlink, b'overwrite')
        with self.assertRaisesRegex(ValueError, 'Git'):
            prep.private_directory(ROOT / 'private-runtime-test' / 'nested')

    def test_output_symlink_cannot_change_its_target_permissions(self):
        target = self.root / 'target'; target.mkdir(mode=0o700)
        link = self.root / 'output'; link.symlink_to(target, target_is_directory=True)
        with self.assertRaisesRegex(ValueError, 'symlink'):
            prep.private_directory(link)
        self.assertTrue(link.is_symlink())

    def test_acl_failure_writes_no_artifact_bytes_and_never_overwrites(self):
        file = self.root / 'new-proof'
        with mock.patch.object(prep.private_paths, 'WINDOWS', True), mock.patch.object(
                prep.private_paths, 'windows_acl', side_effect=ValueError('Unavailable ACL')):
            with self.assertRaisesRegex(ValueError, 'Unavailable'):
                prep.save(file, b'fixture')
            self.assertFalse(file.exists())
            self.source.write_bytes(b'original')
            with self.assertRaises(FileExistsError):
                prep.save(self.source, b'overwrite')
            self.assertEqual(self.source.read_bytes(), b'original')

    def test_native_acl_errors_retain_only_fixed_stage_and_exception_type(self):
        paths = prep.private_paths
        for native, expected in (
                ('PRIVATE_ACL:apply:System.UnauthorizedAccessException\n', 'apply: System.UnauthorizedAccessException'),
                ('PRIVATE_ACL:inspect:System.IO.IOException private/path', None),
                ('private/path contains artifact data', None)):
            error = subprocess.CalledProcessError(1, ['private command'], stderr=native)
            with self.subTest(native=native), mock.patch.object(paths.subprocess, 'run', side_effect=error):
                with self.assertRaises(ValueError) as raised:
                    paths.windows_acl(self.root)
                message = str(raised.exception)
                self.assertNotIn('private/path', message)
                self.assertNotIn('private command', message)
                self.assertTrue(raised.exception.__suppress_context__)
                if expected:
                    self.assertIn(expected, message)
                else:
                    self.assertEqual(message, 'Cannot establish or inspect the Windows private-output DACL.')

    def test_windows_acl_requires_owner_only_protected_inheritable_full_control(self):
        sid = 'S-1-5-21-1-2-3-1001'
        rule = dict(sid=sid, kind='Allow', rights=prep.private_paths.FULL_CONTROL, inheritance=3, propagation=0)
        acl = dict(user=sid, owner=sid, directory=True, protected=True, rules=[rule])
        prep.private_paths.check_windows_acl(acl, True)
        for change in ({'owner': 'S-1-1-0'}, {'protected': False}, {'rules': []}, {'directory': False},
                       {'rules': [{**rule, 'sid': 'S-1-1-0'}]}, {'rules': [{**rule, 'kind': 'Deny'}]},
                       {'rules': [{**rule, 'rights': True}]}, {'rules': [{**rule, 'rights': 1}]},
                       {'rules': [{**rule, 'inheritance': 0}]}, {'rules': [{**rule, 'propagation': 2}]}):
            with self.subTest(change=change), self.assertRaises(ValueError):
                prep.private_paths.check_windows_acl({**acl, **change}, True)

    @unittest.skipUnless(os.name == 'nt', 'Native Windows DACL regression')
    def test_native_windows_shared_acl_refuses_before_writing_and_is_not_repaired(self):
        folder = prep.private_directory(self.root / 'native-private')
        paths = prep.private_paths
        script = r'''
$ErrorActionPreference = 'Stop'
$path = $env:MODWERK_TEST_PRIVATE_PATH
$acl = [IO.Directory]::GetAccessControl($path)
$everyone = New-Object System.Security.Principal.SecurityIdentifier('S-1-1-0')
$rule = New-Object System.Security.AccessControl.FileSystemAccessRule($everyone, 'Read', 'ContainerInherit,ObjectInherit', 'None', 'Allow')
$acl.AddAccessRule($rule)
[IO.Directory]::SetAccessControl($path, $acl)
'''
        exe = Path(os.environ['SystemRoot']) / 'System32/WindowsPowerShell/v1.0/powershell.exe'
        subprocess.run([str(exe), '-NoProfile', '-NonInteractive', '-Command', script],
                       env={**os.environ, 'MODWERK_TEST_PRIVATE_PATH': str(folder)}, check=True, capture_output=True)
        self.addCleanup(lambda: paths.windows_acl(folder, protect=True))
        before = paths.windows_acl(folder)
        with self.assertRaises(ValueError):
            prep.private_directory(folder)
        self.assertEqual(before, paths.windows_acl(folder))
        output = folder / 'refused-private.raw'
        with self.assertRaises(ValueError):
            prep.save(output, b'only synthetic test data')
        self.assertFalse(output.exists())

    @unittest.skipUnless(os.name == 'nt', 'Native Windows junction regression')
    def test_native_windows_junction_output_is_refused(self):
        target = prep.private_directory(self.root / 'junction-target')
        junction = self.root / 'junction-output'
        exe = Path(os.environ['SystemRoot']) / 'System32/WindowsPowerShell/v1.0/powershell.exe'
        script = "New-Item -ItemType Junction -Path $env:MODWERK_TEST_LINK -Target $env:MODWERK_TEST_TARGET -ErrorAction Stop | Out-Null"
        subprocess.run([str(exe), '-NoProfile', '-NonInteractive', '-Command', script], check=True, capture_output=True,
                       env={**os.environ, 'MODWERK_TEST_LINK': str(junction), 'MODWERK_TEST_TARGET': str(target)})
        with self.assertRaisesRegex(ValueError, 'junction'):
            prep.private_directory(junction)


class StrictScannerTests(unittest.TestCase):
    def test_unused_hook_words_are_filler_but_stock_bytes_beside_them_count(self):
        """Owner decision, 14 Oct 2026: runs made only of 0xFF (unused hook words, RUNTIME_NONE) are ignored as zeros
        are. Synthetic bytes only."""
        counted = lambda shared: max(packages.runs(shared, b'stock' + shared).values(), default=0)
        none = b'\xff' * 16                                       # four unused hook words
        self.assertLess(counted(none + bytes(range(1, 5))), packages.LIMIT)
        self.assertLess(counted(bytes(range(1, 5)) + none + bytes(40) + none), packages.LIMIT)
        self.assertGreaterEqual(counted(none + bytes(range(1, 13))), packages.LIMIT)       # real bytes after filler
        self.assertGreaterEqual(counted(bytes(range(1, 10)) + b'\xff' * 3), packages.LIMIT)  # a shorter 0xFF stretch counts
        self.assertGreaterEqual(counted(bytes(range(1, 7)) + b'\x70\xff' + bytes(range(7, 11))), packages.LIMIT)

    def test_relocation_oracle_keeps_fixed_stock_addresses_fixed(self):
        import struct
        image = struct.pack('>II', 0x10, 0x40001000)
        shifted = prep.relocated(image, [0], 0x10000)
        self.assertEqual(struct.unpack('>II', shifted), (0x10010, 0x40001000))


if __name__ == '__main__':
    unittest.main()
