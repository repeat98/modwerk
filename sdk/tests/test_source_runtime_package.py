"""Confined build declarations, exported imports and all-layout admission."""
import importlib.util
import json
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]
SPEC = importlib.util.spec_from_file_location('tested_source_runtime', ROOT / 'scripts/source-runtime-package.py')
runtime = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(runtime)
MODULE = ROOT / 'sdk/drafts/fract-machine'


class SourceRecipe(unittest.TestCase):
    def test_declaration_names_both_machine_tables_and_all_native_units(self):
        doc, _, units, _, _, declared, pack = runtime.declaration(ROOT, MODULE / 'runtime-build.json')
        events = {e['event'] for e in pack.entries(declared)}
        self.assertTrue({'ot_machines', 'ot_machine_starts', 'module_tick', 'module_draw'} <= events)
        self.assertEqual(sum(p.suffix == '.c' for p, _ in units), 10)
        self.assertEqual(sum(p.suffix == '.s' for p, _ in units), 1)
        imports, _, _, _, identities, _ = runtime.base_binding(ROOT, doc['base'])
        self.assertEqual(set(imports), {'mw_stock_pool_open'})
        self.assertEqual(len(identities), 7)

    def test_sources_cannot_escape_or_borrow_another_module(self):
        for value in ('../machine.c', '/tmp/machine.c', '@/sdk/octabam/modules/poly8/pool.c'):
            with self.subTest(value=value), self.assertRaises(ValueError):
                runtime.source_path(ROOT, MODULE, value)
        with tempfile.TemporaryDirectory() as tmp:
            folder = Path(tmp)
            (folder / 'link').symlink_to(MODULE / 'machine.c')
            with self.assertRaises(ValueError):
                runtime.path_in(folder, 'link')

    def test_stale_base_and_nonexported_import_refuse(self):
        base = json.loads((MODULE / 'runtime-build.json').read_text())['base']
        with self.assertRaisesRegex(ValueError, 'Base changed'):
            runtime.base_binding(ROOT, dict(base, identity='0' * 64))
        with self.assertRaisesRegex(ValueError, 'published export'):
            runtime.base_binding(ROOT, dict(base, imports=['not_a_published_export']))

    def test_header_symlinks_refuse_before_the_compiler_runs(self):
        doc = json.loads((MODULE / 'runtime-build.json').read_text())
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            folder = root / 'sdk/drafts/demo'
            folder.mkdir(parents=True)
            (folder / 'entry.c').write_text('int entry(void) { return 0; }\n')
            (root / 'private.h').write_text('not a source header\n')
            (folder / 'leak.h').symlink_to(root / 'private.h')
            doc.update(id='demo', sources=[{'path': 'entry.c'}], includes=['.'])
            recipe = folder / 'runtime-build.json'
            recipe.write_text(json.dumps(doc))
            with self.assertRaisesRegex(ValueError, 'symlinked source path'):
                runtime.declaration(root, recipe)

    def test_bounded_capture_relocates_protected_coincidence(self):
        image = bytes(range(1, 17))
        stock = image + bytes(32) + image
        # First copy is in a site owned by the base; identical later bytes are usable.
        item = {'offset': 0, 'address': 0x40000400, 'length': len(image),
                'sha256': runtime.hashlib.sha256(image).hexdigest(), 'purpose': 'authored coincidence'}
        made = runtime.bounded_capture({'copies': [item]}, image, stock, 0x40000400,
                                       {'sites': [{'addr': '40000400', 'len': 16}]}, {'events': []})
        self.assertEqual(made['copies'][0]['address'], 0x40000430)
        self.assertEqual(made['copies'][0]['sha256'], item['sha256'])

    @unittest.skipUnless(shutil.which('m68k-elf-gcc'), 'ColdFire compiler unavailable')
    def test_public_candidate_reproduces_without_firmware(self):
        row = json.loads((MODULE / 'release/package-entry.json').read_text())
        with tempfile.TemporaryDirectory() as tmp:
            data, proof = runtime.build(ROOT, MODULE / 'runtime-build.json', Path(tmp) / 'candidate.mwrm')
        self.assertEqual(proof['sha256'], row['sha256'])
        self.assertEqual(len(data), row['bytes'])
        self.assertEqual(data[28:32].hex(), row['module'])
        self.assertEqual(proof['stockVerification'], 'NOT_RUN')
        self.assertEqual(proof['stockCopies'], 9)
        self.assertEqual(len(proof['baseVariants']), 7)


@unittest.skipUnless(shutil.which('cc'), 'host compiler unavailable')
class BaseAdmission(unittest.TestCase):
    def test_each_layout_admits_and_partial_digest_matches_refuse(self):
        binding = json.loads((ROOT / 'sdk/machines/octatrack/base-binding.json').read_text())
        identities = sorted(set([binding['identity'], *binding['variants'].values()]))
        values = ','.join(str(v) for digest in identities for v in bytes.fromhex(digest))
        with tempfile.TemporaryDirectory() as tmp:
            folder = Path(tmp)
            (folder / 'base_identity.h').write_text(
                'extern uint8_t test_digest[32];\n#define OG_BASE_DIGEST_ADDRESS ((uintptr_t)test_digest)\n'
                'static const uint8_t og_expected_base_digest[] = {' + values + '};\n')
            (folder / 'main.c').write_text('''#include <stdint.h>
#include <stdlib.h>
#include <string.h>
uint8_t test_digest[32];
#include "base_identity.h"
int og_machine_base_ready(void);
int main(int argc, char **argv) {
    if (argc != 2) return 90;
    unsigned index = (unsigned)strtoul(argv[1], 0, 10);
    memcpy(test_digest, og_expected_base_digest + 32 * (index % 7), 32);
    if (index >= 7) test_digest[index == 7 ? 0 : 31] ^= 1;
    return og_machine_base_ready() == (index < 7) ? 0 : 1;
}
''')
            binary = folder / 'admission'
            subprocess.run(['cc', '-std=c11', '-Wall', '-Wextra', '-Werror', '-DOG_MACHINE_BASE_BOUND', '-I' + str(folder),
                            MODULE / 'base_binding.c', folder / 'main.c', '-o', binary], check=True, capture_output=True)
            for layout in range(9):
                with self.subTest(layout=layout):
                    subprocess.run([binary, str(layout)], check=True, capture_output=True)


if __name__ == '__main__':
    unittest.main()
