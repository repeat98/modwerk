"""Host counter/protocol tests for the private probe; no hardware timing claims."""
import argparse
import importlib.util
import json
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]
MODULE = ROOT / 'sdk/drafts/fract-machine'


class RenderProbeBuildGuard(unittest.TestCase):
    def test_new_base_requires_both_explicit_identities_and_exact_tree(self):
        spec = importlib.util.spec_from_file_location('probe_build_guard', MODULE / 'qualification/build_probe.py')
        builder = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(builder)
        with tempfile.TemporaryDirectory(prefix='fract-probe-baseline-') as directory:
            root = Path(directory)
            binding = root / 'sdk/machines/octatrack/base-binding.json'
            binding.parent.mkdir(parents=True)
            binding.write_text(json.dumps({'identity': builder.BASE}))
            args = argparse.Namespace(base_tree=root, base_identity=None, normal_sha256=None)
            self.assertEqual(builder.checked_baseline(args), (builder.BASE, builder.NORMAL_SHA))
            binding.write_text(json.dumps({'identity': '1' * 64}))
            with self.assertRaisesRegex(ValueError, 'measurement base'):
                builder.checked_baseline(args)
            args.base_identity = '1' * 64
            with self.assertRaisesRegex(ValueError, 'both'):
                builder.checked_baseline(args)
            args.normal_sha256 = '2' * 64
            self.assertEqual(builder.checked_baseline(args), ('1' * 64, '2' * 64))
            args.base_identity = '3' * 64
            with self.assertRaisesRegex(ValueError, 'measurement base'):
                builder.checked_baseline(args)
            args.base_identity = '1' * 64
            args.normal_sha256 = 'not-a-sha256'
            with self.assertRaisesRegex(ValueError, 'SHA-256'):
                builder.checked_baseline(args)
            args.base_identity = args.normal_sha256 = ''
            with self.assertRaisesRegex(ValueError, 'SHA-256'):
                builder.checked_baseline(args)


@unittest.skipUnless(shutil.which('cc'), 'Host C compiler unavailable')
class RenderProbe(unittest.TestCase):
    def test_wrapped_timer_two_spans_and_peak_context_are_published(self):
        with tempfile.TemporaryDirectory(prefix='fract-probe-host-') as directory:
            folder = Path(directory)
            (folder / 'probe_addresses.h').write_text(
                '\n'.join(f'#define FRACT_PROBE_{name} {i}u' for i, name in enumerate(
                    ('FRAMES', 'IDLE', 'FRAME_MAX', 'SHARE', 'SHEDS'))) + '\n')
            source = folder / 'test.c'
            source.write_text(r'''
#include <stdint.h>
#include <stdio.h>
#include <assert.h>
static uint32_t fake_now, cost, fields[5];
#define FRACT_PROBE_CLOCK() fake_now
#define FRACT_PROBE_READ(address) fields[address]
''' + '#include "' + str(MODULE / 'qualification/render_probe.c') + '"\n' + r'''
void module_tick(struct modwerk_runtime_api *api) { (void)api; }
int og_machine_render(unsigned t, unsigned p, unsigned s, unsigned e) {
    (void)p;(void)s;(void)e; fake_now += cost; return 17 + (int)t;
}
int main(void) {
    fake_now = UINT32_MAX - 50u; cost = 100;
    assert(fract_probe_render(0,0,0,5) == 17);
    cost = 200; assert(fract_probe_render(0,0,5,16) == 17);
    fields[0] = 1; cost = 250; assert(fract_probe_render(0,1,0,16) == 17);
    assert(counters[BLOCK_MAX] == 300 && counters[CALL_MAX] == 250);
    assert(counters[CALLS_MAX] == 2 && counters[CALLS] == 3);
    assert(counters[CONTEXT] == (5u << 8 | 16u));
    struct modwerk_runtime_api api = {0};
    fields[3] = 38312; fields[2] = 30000;
    fract_probe_tick(&api);
    fields[0] += 2756; fields[1] = 66000000; fake_now += 132000000;
    for (unsigned i=0;i<64;i++) {
        fract_probe_tick(&api);
        printf("%u\n", api.value);
    }
    assert(fields[0] == 2757 && fields[1] == 66000000 && fields[3] == 38312);
    fake_now += 9u * 132000000u;
    fract_probe_tick(&api);
    assert(pending[14] & 2u); /* an overlong interval must not be qualified */
    fields[0]++; cost = 0x100000u;
    fract_probe_render(0,0,0,16);
    fake_now += 132000000u;
    fract_probe_tick(&api);
    assert((pending[14] & 4u) && pending[3] == 0xfffffu);
    return 0;
}
''')
            executable = folder / 'counter-test'
            compiled = subprocess.run(['cc', '-std=c11', '-Wall', '-Wextra', '-Werror',
                            '-I' + str(folder), '-I' + str(MODULE),
                            '-I' + str(MODULE / 'engine'), '-I' + str(MODULE / 'support'),
                            '-I' + str(ROOT / 'sdk/runtime/loader'),
                            '-I' + str(ROOT / 'sdk/machines/octatrack/include'),
                            str(source), '-o', str(executable)], capture_output=True, text=True)
            self.assertEqual(compiled.returncode, 0, compiled.stderr)
            words = [int(line) for line in subprocess.check_output([str(executable)], text=True).splitlines()]
            decoded = {word >> 28: word & 0xfffff for word in words if (word >> 20 & 255) == 1}
            self.assertEqual(len(decoded), 16)
            self.assertEqual(decoded[0], 0x46523)
            self.assertEqual(decoded[3], 300)
            self.assertEqual(decoded[4], 250)
            self.assertEqual(decoded[6], 2756)
            self.assertEqual(decoded[7], 66000000 >> 10)
            self.assertEqual(decoded[9], 38312)
            self.assertEqual(decoded[12], 2)
            self.assertEqual(decoded[14], 1)

    def test_normal_recipe_has_no_probe_unit_or_measurement_hooks(self):
        recipe = json.loads((MODULE / 'runtime-build.json').read_text())
        runtime = json.loads((MODULE / 'runtime.json').read_text())
        self.assertFalse(any('probe' in unit['path'] for unit in recipe['sources']))
        self.assertFalse(any('probe' in hook['fn'] for hook in runtime['subscribe']))
