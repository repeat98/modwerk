# SPDX-License-Identifier: GPL-3.0-or-later
"""Cross-compatibility gate (scripts/module-compat.py) on synthetic manifests: no firmware, no stock bytes."""
import importlib.util
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('module_compat', ROOT / 'scripts/module-compat.py')
gate = importlib.util.module_from_spec(spec); spec.loader.exec_module(gate)
from remix.schema import Detour, Kind, MenuEntry, Module  # noqa: E402  (the gate put sdk/octabam/tools on the path)

SITE, EVENT = 0x40002318, dict(event='ev_test', site='0x40004100', length=8)


def module(name, *sites, fx=None):
    """A synthetic ColdFire module detouring 8 bytes at each site (placeholder guard bytes, not stock)."""
    return Module(name=name, key=name.upper(), kind=Kind.CF_PATCH, doc='synthetic',
                  detours=tuple(Detour(s, bytes(8), name, 'hook', pad_to=8) for s in sites),
                  menu=MenuEntry(fx, 0, b'T', b'TEST') if fx else None)


def relation(pair, kind='group-owned', sites=(SITE,), **extra):
    return dict(modules=list(pair), kind=kind, reason='synthetic review', sites=[f'0x{s:08x}' for s in sites],
                **({'owner': pair[0]} if kind == 'group-owned' else {}), **extra)


class GateTests(unittest.TestCase):
    def routes(self, problems):
        return sorted((tuple(p['modules']), p['route']) for p in problems)

    def test_clean_pair(self):
        self.assertEqual(gate.check([module('a', 0x40001000), module('b', 0x40001008)]), [])

    def test_overlapping_detours_name_both_modules_the_range_and_the_event_route(self):
        problems = gate.check([module('a', SITE), module('b', SITE + 4)])
        self.assertEqual(self.routes(problems), [(('a', 'b'), 'event')])
        self.assertIn('0x4000231c', problems[0]['text'])
        self.assertIn('0x40002318..0x4000231f', problems[0]['text'])

    def test_copy_under_another_modules_patch_is_install_order_dependent(self):
        problems = gate.check([module('a', SITE), module('b')], copies={'b': [(0x4000230e, 13, 'recipe copy')]})
        self.assertEqual(self.routes(problems), [(('a', 'b'), 'copy')])
        self.assertRegex(problems[0]['text'], r'^b copies stock bytes 0x4000230e\.\.0x4000231a .*a patches')
        # The same bytes from an unpatched location compose.
        self.assertEqual(gate.check([module('a', SITE), module('b')], copies={'b': [(0x4003886a, 13, 'x')]}), [])

    def test_base_sites_refuse_modules_unless_the_base_owns_them(self):
        base = [(SITE, 6, 'code')]
        self.assertEqual(self.routes(gate.check([module('a', SITE)], base_sites=base)), [(('a',), 'event')])
        self.assertEqual(gate.check([module('a', SITE)], base_sites=base, base_owns={'a': 'reviewed'}), [])

    def test_group_owned_overlap_is_allowed_at_exactly_its_sites(self):
        modules = [module('a', SITE), module('b', SITE)]
        self.assertEqual(gate.check(modules, relations=[relation(('a', 'b'))]), [])
        moved = [module('a', SITE, 0x40001000), module('b', SITE, 0x40001000)]
        self.assertEqual(self.routes(gate.check(moved, relations=[relation(('a', 'b'))])), [(('a', 'b'), 'event')])

    def test_stale_relations_fail(self):
        modules = [module('a', SITE), module('b')]
        for entry, text in ((relation(('a', 'gone')), 'no longer an active module'),
                            (relation(('a', 'b')), 'nothing meets at 0x40002318'),
                            (dict(relation(('a', 'b')), reason=' '), 'needs two modules')):
            with self.subTest(text=text):
                problems = gate.check(modules, relations=[entry])
                self.assertEqual([p['route'] for p in problems], ['relation'])
                self.assertIn(text, problems[0]['text'])

    def test_event_sites_belong_to_the_base_and_name_the_event(self):
        problems = gate.check([module('a', 0x40004100)], events=[EVENT])
        self.assertEqual(self.routes(problems), [(('a',), 'subscribe')])
        self.assertIn('which is the event ev_test', problems[0]['text'])

    def test_pending_migration_allows_both_modules_until_they_subscribe(self):
        modules = [module('a', 0x40004100), module('b', 0x40004100)]
        pending = relation(('a', 'b'), 'pending-migration', (0x40004100,), event='ev_test', until='both subscribe')
        self.assertEqual(gate.check(modules, events=[EVENT], relations=[pending]), [])
        self.assertIn('not in sdk/machines/octatrack/events.json',
                      gate.check(modules, events=[], relations=[pending])[0]['text'])
        third = gate.check(modules + [module('c', 0x40004100)], events=[EVENT], relations=[pending])
        self.assertEqual({p['route'] for p in third}, {'subscribe', 'event'})
        self.assertTrue(all('c' in p['modules'] for p in third))

    def test_pinned_effect_id_collision_names_another_chooser_row(self):
        problems = gate.check([module('a', fx=0x1e), module('b', fx=0x1e)])
        self.assertEqual(self.routes(problems), [(('a', 'b'), 'row')])

    def test_repository_passes(self):
        ids, modules, inputs, problems = gate.repository_inputs()
        self.assertEqual(problems + gate.check(modules, **inputs), [])
        self.assertGreaterEqual(len(modules), 20)

    def test_windows_linked_paths_give_the_same_findings(self):
        # Windows manifests carry backslash sources; octabam's composition signature splits on "modules/".
        from dataclasses import replace
        ids, modules, inputs, problems = gate.repository_inputs()
        windows = [replace(m, linked=tuple(replace(u, source=str(u.source).replace('/', '\\')) for u in m.linked))
                   for m in modules]
        self.assertTrue(any('\\' in str(u.source) for m in windows for u in m.linked))
        self.assertEqual(gate.check(windows, **inputs), gate.check(modules, **inputs))


if __name__ == '__main__':
    unittest.main()
