# SPDX-License-Identifier: GPL-3.0-or-later
"""Machine modules through the base's events and tables: the registry (machine_registry.c), the admission of
independent machine packages (machine_contributors.c), and the machine ports (machine-ports.json). Host C runs
with ASan/UBSan; no firmware, no stock bytes."""
import importlib.util
import json
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]
OT = ROOT / 'sdk/machines/octatrack'
ADAPTERS = OT / 'module-adapters'
sys.path.insert(0, str(ROOT / 'sdk/octabam/tools'))
sys.path.insert(0, str(ADAPTERS))
import machine_ports  # noqa: E402
from host_flags import SANITIZE  # noqa: E402
FIVE = ('poly8', 'vector', 'synth', 'quantizer', 'analog-bassdrum')
INCLUDES = ['-I', OT / 'module-adapters', '-I', OT / 'elekloader', '-I', OT / 'include', '-I', ROOT / 'sdk/runtime/loader',
            '-I', ROOT / 'sdk/runtime/upload']


def host(test, *sources):
    cc = shutil.which('cc')
    if not cc:
        test.skipTest('no host C compiler')
    with tempfile.TemporaryDirectory() as temp:
        subprocess.run([cc, '-std=c99', '-Wall', '-Wextra', '-Werror', '-g', *SANITIZE,
                        '-fno-sanitize-recover=all', '-DMODWERK_RUNTIME_EVENTS', '-DRUNTIME_MODULES=128u', *INCLUDES,
                        *sources, '-o', temp + '/t'], check=True, capture_output=True)
        return subprocess.run([temp + '/t'], capture_output=True, text=True)


class MachineEventTests(unittest.TestCase):
    def test_registry_on_the_host(self):
        result = host(self, OT / 'elekloader/test_machine_registry.c')
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)

    def test_midi_generators_on_the_host(self):
        result = host(self, OT / 'elekloader/test_midi_generators.c')
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)

    def test_registry_knows_every_protect_port_signature(self):
        # The validator keeps a known PROTECT machine's 12 bytes while it is absent (the boot's battery restore runs
        # before the saved set reinstalls it: beta finding 24). The list must be exactly the PROTECT ports.
        text = (OT / 'elekloader/machine_registry.c').read_text()
        listed = re.search(r'\} known\[\] = \{(.*?)\};', text).group(1)
        known = {(a + b, int(lo), int(hi)) for a, b, lo, hi in re.findall(r"\{\{'(.)', '(.)'\}, (\d+), (\d+)\}", listed)}
        ports = json.loads((ADAPTERS / 'machine-ports.json').read_text())['ports']
        protect = {(p['machine']['sig'], p['machine']['lo'], p['machine']['hi']) for p in ports.values()
                   if 'PROTECT' in p.get('machine', {}).get('flags', [])}
        self.assertEqual(known, protect)
        self.assertIn(('AB', 1, 1), known)

    def test_contributor_admission_on_the_host(self):
        result = host(self, ADAPTERS / 'test_machine_contributors.c', ADAPTERS / 'machine_lifetime.c', ADAPTERS / 'machine_parts.c')
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)

    def test_registry_cross_compiles_without_new_optimisation_flags(self):
        gcc = shutil.which('m68k-elf-gcc')
        if not gcc:
            self.skipTest('no ColdFire compiler')
        with tempfile.TemporaryDirectory() as temp:
            subprocess.run([gcc, '-mcpu=5475', '-msoft-float', '-O2', '-std=c99', '-ffreestanding', '-fno-builtin', '-Wall', '-Wextra',
                            '-Werror', '-DMODWERK_RUNTIME_EVENTS', '-DRUNTIME_MODULES=128u', *INCLUDES, '-c',
                            OT / 'elekloader/machine_registry.c', '-o', temp + '/r.o'], check=True, capture_output=True)
            subprocess.run(['m68k-elf-as', '-mcpu=5475', OT / 'elekloader/machine_registry.s', '-o', temp + '/s.o'],
                           check=True, capture_output=True)

    def test_ports_are_bound_to_the_sources_they_were_reviewed_against(self):
        for name in FIVE:
            with self.subTest(name):
                machine_ports.check_sources(name, machine_ports.port(name))

    def test_glue_assembles_and_names_only_declared_records(self):
        asm = shutil.which('m68k-elf-as')
        events = json.loads((OT / 'events.json').read_text())
        records = {e['event']: e['record'] for e in events['events'] if e.get('kind') == 'table'}
        for name in FIVE:
            entry = machine_ports.port(name)
            text = machine_ports.glue(name, entry)
            fns = {s['fn'] for s in entry.get('subscribe', [])} | {c['data'] for c in entry.get('contribute', [])}
            self.assertTrue(all(re.search(r'^%s:' % re.escape(f), text, re.M) for f in fns), name)
            if asm:
                with tempfile.TemporaryDirectory() as temp:
                    Path(temp, 'g.s').write_text(text)
                    subprocess.run([asm, '-mcpu=54455', temp + '/g.s', '-o', temp + '/g.o'], check=True, capture_output=True)
                    if entry.get('machine'):  # the descriptor is exactly one ot_machines record (a SETUP_PAGE one's
                        # struct modwerk_machine_setup: the machine and two words)
                        out = subprocess.check_output(['m68k-elf-nm', '-n', temp + '/g.o'], text=True).split('\n')
                        at = {l.split()[2]: int(l.split()[0], 16) for l in out if len(l.split()) == 3}
                        setup = 8 if 'SETUP_PAGE' in entry['machine']['flags'] else 0
                        self.assertEqual(at['mw_machine_label'] - at['mw_machine'], records['ot_machines'] + setup, name)

    def test_setup_page_words_follow_the_machine_only_with_the_flag(self):
        entry = {'machine': {'sig': 'XS', 'lo': 1, 'hi': 1, 'label': 'X', 'flags': ['POOL'], 'fields': {'setup_page': 'x_page'}}}
        with self.assertRaises(ValueError):
            machine_ports.glue('x', entry)
        entry['machine']['flags'].append('SETUP_PAGE')
        entry['machine']['fields']['setup_knob'] = 'x_knob'
        text = machine_ports.glue('x', entry)
        self.assertIn('.byte   0, 0, 0, 0\n        .long   x_page\n        .long   x_knob\nmw_machine_label:', text)
        self.assertIn('.long   mw_machine_label, 66, 0, 0\n', text)

    def test_no_kept_code_returns_into_the_middle_of_a_base_site(self):
        """A taker's entry and every kept unit return to stock past each base-owned site, never into its bytes."""
        from remix import registry
        reg = json.loads((OT / 'events.json').read_text())
        spans = [(int(s['site'], 16), s['length']) for s in reg['sites']]
        spans += [(int(s['site'], 16), s['length']) for e in reg['events'] if e.get('kind') == 'table' for s in e['sites']]
        modules = {m.name: m for m in registry.modules().values()}
        for name in FIVE:
            ported = machine_ports.ported(modules[name])
            for unit in ported.linked:
                path = Path(unit.source)
                path = path if path.is_absolute() else (ROOT / 'sdk/octabam' / path if (ROOT / 'sdk/octabam' / path).exists() else ROOT / path)
                for target in re.findall(r'\bj(?:mp|sr)\s+\(?(?:0x([0-9a-fA-F]+)|(\d{9,10}))', path.read_text()):
                    at = int(target[0], 16) if target[0] else int(target[1])
                    inside = [hex(a) for a, n in spans if a < at < a + n]
                    self.assertEqual(inside, [], '%s %s jumps to %#x' % (name, unit.label, at))


if __name__ == '__main__':
    unittest.main()
