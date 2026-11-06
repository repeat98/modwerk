"""Firmware-free rejection and reconstruction checks for source build recipes."""
import hashlib
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]
SPEC = importlib.util.spec_from_file_location('tested_generic_runtime_recipe', ROOT / 'scripts/source-runtime-package.py')
runtime = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(runtime)


class RecipeBoundaries(unittest.TestCase):
    def test_source_paths_refuse_traversal_absolute_other_module_and_symlink(self):
        with tempfile.TemporaryDirectory() as tmp:
            folder = Path(tmp).resolve()
            (folder / 'source.c').write_text('int entry(void) { return 0; }\n')
            (folder / 'alias.c').symlink_to(folder / 'source.c')
            for value in ('../source.c', '/tmp/source.c', '@/sdk/octabam/modules/other/source.c', 'alias.c'):
                with self.subTest(value=value), self.assertRaises(ValueError):
                    runtime.source_path(ROOT, folder, value)

    def test_header_symlink_refuses_before_loading_sdk_or_running_compiler(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            folder = root / 'sdk/drafts/demo'
            folder.mkdir(parents=True)
            (folder / 'entry.c').write_text('int entry(void) { return 0; }\n')
            (root / 'private.h').write_text('outside module\n')
            (folder / 'alias.h').symlink_to(root / 'private.h')
            doc = dict(schema=1, id='demo', title='DEMO', layout=1,
                       sources=[dict(path='entry.c')], includes=['.'], defines=[],
                       runtime='runtime.json', base={}, reconstruction='recipe.json', forbiddenPrefixes=[])
            recipe = folder / 'runtime-build.json'
            recipe.write_text(json.dumps(doc))
            with self.assertRaisesRegex(ValueError, 'symlinked source path'):
                runtime.declaration(root, recipe)

    def test_stale_base_and_unpublished_import_refuse(self):
        binding = json.loads((ROOT / 'sdk/machines/octatrack/base-binding.json').read_text())
        package = ROOT / 'src/engine/assets/octatrack-base.elemod'
        spec = dict(identity=binding['identity'], packageSha256=hashlib.sha256(package.read_bytes()).hexdigest(),
                    runOrigin=0x40a95600, imports=['not_a_published_export'], identityHeader={})
        with self.assertRaisesRegex(ValueError, 'Base changed'):
            runtime.base_binding(ROOT, dict(spec, identity='0' * 64))
        with self.assertRaisesRegex(ValueError, 'published export'):
            runtime.base_binding(ROOT, spec)

    def test_protected_copy_uses_an_identical_unowned_span(self):
        image = bytes(range(1, 17))
        item = dict(offset=0, address=0x40000400, length=16,
                    sha256=hashlib.sha256(image).hexdigest(), purpose='authored coincidence')
        result = runtime.bounded_capture(dict(copies=[item]), image,
                                         image + bytes(32) + image, 0x40000400,
                                         dict(sites=[dict(addr='40000400', len=16)]), dict(events=[]))
        self.assertEqual(result['copies'][0]['address'], 0x40000430)
        self.assertEqual(result['copies'][0]['sha256'], item['sha256'])


if __name__ == '__main__':
    unittest.main()
