#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""Portable SDK adapter regressions; no private package, OS or unit required.

Assembly of an original tiny fixture is optional. No DSP/controller code runs.
"""
import argparse
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import shutil
import struct
import sys
import tempfile
import unittest

HERE = Path(__file__).resolve().parent
parser = argparse.ArgumentParser(description=__doc__, add_help=False)
default_sdk = next((p for p in HERE.parents if (p / 'sdk/runtime/loader/abi9.py').is_file()), None)
parser.add_argument('--sdk', type=Path, default=default_sdk)
options, remaining = parser.parse_known_args()
if options.sdk is None:
    if __name__ == '__main__':
        parser.error('--sdk is required outside a full SDK checkout')
    raise unittest.SkipTest('Modwerk SDK checkout required')
SDK = options.sdk.resolve()


def load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


adapter = HERE / 'source_runtime_engine.py'
if not adapter.is_file():
    adapter = SDK / 'scripts/source-runtime-engine.py'
engine = load('tested_declarative_engine', adapter)
ASM = os.environ.get('ELEKLOADER_DSP_ASM') or shutil.which('dsp_asm')


class ReturningEngine(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(prefix='returning-engine-fixture-')
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.module = self.root / 'module'
        self.module.mkdir()
        self.work = self.root / 'assembly'
        self.work.mkdir()
        for name in ('sdk/runtime/loader/abi9.py',
                     'sdk/machines/octatrack/elekloader/dsp_packages.py'):
            target = self.root / name
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(SDK / name, target)
        shutil.copytree(SDK / 'sdk/firmware_codec', self.root / 'sdk/firmware_codec',
                        ignore=shutil.ignore_patterns('__pycache__'))
        self.registry = dict(schema=1,
            features=[dict(bit=16, name='fixture', cores=['A', 'B'], packaged=True)],
            sites=[dict(index=0, kind='chain', features=[16])],
            regions=[dict(feature=16, space='y', cores=['A', 'B'], start='0xd00', words='0x20')])
        self.registry_path = self.root / 'sdk/machines/octatrack/dsp-sites.json'
        self.registry_path.write_text(json.dumps(self.registry))
        self.source = 'entry:\nmove #>$fab1e0,r0\nrts\n'
        (self.module / 'fixture.asm').write_text(self.source)
        (self.module / 'table.json').write_text('[12345,654321]')
        self.initial = [64] + [0] * 31
        (self.module / 'initial.json').write_text(json.dumps(self.initial))
        self.doc = dict(schema=1, feature=16, sources=['fixture.asm'], entry='entry',
            tableMarker='$fab1e0', tableFile='table.json',
            claims=[dict(space='y', core=2, address=0xd00, initialFile='initial.json')],
            site=0, cores=3, cycles=8, cycleKind='executed')
        self.write_doc(self.doc)

    def write_doc(self, doc):
        (self.module / 'engine.json').write_text(json.dumps(doc))

    def test_confined_inputs_and_ancestor_symlink(self):
        for name in ('../fixture.asm', '/tmp/fixture.asm', './fixture.asm', 'a//b.asm'):
            with self.subTest(name=name), self.assertRaises(ValueError):
                engine.confined(self.module, name)
        (self.module / 'linked').symlink_to(self.module, target_is_directory=True)
        with self.assertRaises(ValueError):
            engine.confined(self.module, 'linked/fixture.asm')

    def test_malformed_declarations_refuse(self):
        for key, value in [('cycles', 0), ('cycles', True), ('cores', 4),
                           ('site', -1), ('feature', 3), ('sources', [{}]),
                           ('sources', ['fixture.asm', 'fixture.asm']),
                           ('entry', 'entry;other'), ('tableFile', '../table.json')]:
            self.write_doc(dict(self.doc, **{key: value}))
            with self.subTest(key=key, value=value), self.assertRaises(ValueError):
                engine.declaration(self.module, 'engine.json')

    def test_exact_ledger_and_data_ranges(self):
        doc, _, _, claims, _ = engine.declaration(self.module, 'engine.json')
        engine.ledger_check(self.root, doc, claims)
        for altered in [[('y', 2, 0xd01, self.initial)],
                        [('y', 0, 0xd00, self.initial)],
                        [claims[0], claims[0]]]:
            with self.subTest(claims=altered), self.assertRaises(ValueError):
                engine.ledger_check(self.root, doc, altered)
        self.registry['sites'][0]['exit'] = {'A': '0x10', 'B': '0x20'}
        self.registry_path.write_text(json.dumps(self.registry))
        with self.assertRaises(ValueError):
            engine.ledger_check(self.root, doc, claims)
        for values in ([True], [-1], [0x1000000], [], [1.0]):
            (self.module / 'table.json').write_text(json.dumps(values))
            with self.subTest(values=values), self.assertRaises(ValueError):
                engine.words_file(self.module / 'table.json')

    def test_undeclared_assembler_reads_refuse_before_assembly(self):
        for directive in ('include "other.asm"', 'incbin "other.bin"',
                          'label: incbin "other.bin"', '.include "other.asm"', 'org $1000'):
            (self.module / 'fixture.asm').write_text(self.source + directive + '\n')
            with self.subTest(directive=directive), self.assertRaisesRegex(ValueError, 'include files or change origin'):
                engine.assemble(self.root, self.module, 'engine.json', self.work)

    @unittest.skipUnless(ASM, 'dsp_asm required for assembly/encoding fixture')
    def test_real_encoder_placements_and_controller_digest(self):
        os.environ['ELEKLOADER_DSP_ASM'] = ASM
        attach, report, words, relocations, claims = engine.assemble(
            self.root, self.module, 'engine.json', self.work)
        self.assertEqual(report['placementProofs'], 6)
        self.assertTrue(relocations)
        self.assertEqual(claims, [('y', 2, 0xd00, self.initial)])
        for name, digest in report['sources'].items():
            self.assertEqual(digest, hashlib.sha256((self.module / name).read_bytes()).hexdigest())
        pack = load('fixture_controller_encoder', SDK / 'sdk/runtime/loader/build.py')
        controller = pack.package(bytes(8), 0, [], [], name='returning-fixture',
                                  title='FIXTURE', hashed=True, abi=8)
        package = attach(controller)
        self.assertEqual(struct.unpack_from('>H', package, 4)[0], 10)
        abi = load('fixture_engine_encoder', SDK / 'sdk/runtime/loader/abi9.py')
        changed = list(words)
        changed[-1] ^= 1
        updated = abi.engine(controller, changed, relocations, 0, 3, 0, claims,
                             cycles=9, kind='executed')
        self.assertNotEqual(package, updated)
        self.assertEqual(abi.controller_sha256(package), abi.controller_sha256(updated))
        with self.assertRaises(ValueError):
            attach(package)  # engines cannot be appended a second time


if __name__ == '__main__':
    unittest.main(argv=[sys.argv[0], *remaining])
