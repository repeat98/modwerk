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
        self.assertIn('which is the hook ev_test', problems[0]['text'])

    def test_pending_migration_allows_both_modules_until_they_subscribe(self):
        modules = [module('a', 0x40004100), module('b', 0x40004100)]
        pending = relation(('a', 'b'), 'pending-migration', (0x40004100,), event='ev_test', until='both subscribe')
        self.assertEqual(gate.check(modules, events=[EVENT], relations=[pending]), [])
        self.assertIn('not in sdk/machines/octatrack/hooks.json',
                      gate.check(modules, events=[], relations=[pending])[0]['text'])
        third = gate.check(modules + [module('c', 0x40004100)], events=[EVENT], relations=[pending])
        self.assertEqual({p['route'] for p in third}, {'subscribe', 'event'})
        self.assertTrue(all('c' in p['modules'] for p in third))

    def test_table_sites_belong_to_the_base_and_name_the_table(self):
        owned = dict(event='ot_test', site='0x40002318', length=8, table=True)
        problems = gate.check([module('a', SITE)], events=[owned])
        self.assertEqual(self.routes(problems), [(('a',), 'contribute')])
        self.assertIn('which the table ot_test owns', problems[0]['text'])
        problems = gate.check([module('b')], events=[owned], copies={'b': [(0x4000231a, 4, 'replay')]})
        self.assertEqual(self.routes(problems), [(('b',), 'copy')])

    def test_machine_modules_install_in_every_combination_through_events_and_tables(self):
        """POLY8, VECTOR, FM Synth, Scale Quantizer and Analog BD: no exception in compatibility.json, every subset of
        their packages (as their runtime.json or machine port installs them) meets nowhere; their native manifests
        do meet, so the ports, not the gate, make them independent. A paused one is left out, as the gate leaves it."""
        import itertools, json
        relations = json.loads((ROOT / gate.RELATIONS).read_text())['relations']
        self.assertEqual([r for r in relations if r.get('kind') in ('group-owned', 'pending-migration')], [])
        ids, modules, inputs, problems = gate.repository_inputs()
        names = [n for n in ('poly8', 'vector', 'synth', 'quantizer', 'analog-bassdrum') if n in ids]
        five = [m for m in modules if m.name in names]
        self.assertEqual(len(five), len(names))
        self.assertGreaterEqual(len(five), 4)
        for n in range(1, len(five) + 1):
            for subset in itertools.combinations(five, n):
                with self.subTest([m.name for m in subset]):
                    self.assertEqual(gate.check(list(subset), **inputs), [])
        natives = [inputs['natives'][m.name] for m in five]
        clashes = gate.check(natives, **dict(inputs, natives=None))
        self.assertTrue({'subscribe', 'contribute'} <= {p['route'] for p in clashes})

    def test_a_declaration_that_does_not_match_the_manifest_fails(self):
        modules, problems = gate.ported([module('repitch', 0x40001000)])
        self.assertEqual([p['route'] for p in problems], ['subscribe'])
        self.assertIn('does not match its manifest', problems[0]['text'])
    def test_a_subscription_that_replaces_its_detour_claims_nothing(self):
        modules = [module('a', 0x40004100), module('b', 0x40004100)]
        subs = {'a': [dict(event='ev_test', fn='f', order=20, replaces='hook')],
                'b': [dict(event='ev_test', fn='g', order=50, replaces='hook')]}
        self.assertEqual(gate.check(modules, events=[EVENT], subscriptions=subs), [])
        pending = relation(('a', 'b'), 'pending-migration', (0x40004100,), event='ev_test', until='both subscribe')
        stale = gate.check(modules, events=[EVENT], relations=[pending], subscriptions=subs)
        self.assertEqual([p['route'] for p in stale], ['relation'])  # nothing patches there any more: the entry must go
        self.assertIn('nothing meets at 0x40004100', stale[0]['text'])
        raised = {'a': [dict(event='ev_raised', fn='f', order=50)]}  # a raised event owns no stock bytes
        self.assertEqual(self.routes(gate.check(modules[:1], events=[EVENT], subscriptions=raised)), [(('a',), 'subscribe')])
        # One still patching: it alone meets the base's event site.
        self.assertEqual(self.routes(gate.check(modules, events=[EVENT], subscriptions={'a': subs['a']})),
                         [(('b',), 'subscribe')])
        for entry, text in ((dict(subs['a'][0], replaces='nothing'), 'which is not its detour'),
                            (dict(subs['a'][0], event='ev_unknown'), 'not a site hook')):
            with self.subTest(text=text):
                problems = gate.check([module('a', 0x40004100)], events=[EVENT], subscriptions={'a': [entry]})
                self.assertTrue(any(text in p['text'] for p in problems))

    def test_pinned_effect_id_collision_names_another_chooser_row(self):
        problems = gate.check([module('a', fx=0x1e), module('b', fx=0x1e)])
        self.assertEqual(self.routes(problems), [(('a', 'b'), 'row')])

    def test_same_key_gesture_or_screen_clashes_unless_declared_incompatible(self):
        ui = lambda **claims: {k: dict(uiClaims=v, conflicts=[]) for k, v in claims.items()}
        problems = gate.check([module('a', 0x40001000), module('b', 0x40001008)],
                              manifests=ui(a=['key:UP+TEMPO'], b=['key:UP+TEMPO@PART']))
        self.assertEqual(self.routes(problems), [(('a', 'b'), 'ui')])
        self.assertIn('key:UP+TEMPO', problems[0]['text'])
        for a, b in ((['key:FUNC+UP+TEMPO'], ['key:UP+FUNC+TEMPO']), (['screen:TEMPO'], ['screen:TEMPO'])):
            self.assertEqual(len(list(gate.ui_clashes(ui(a=a, b=b)))), 1, (a, b))
        for a, b in ((['key:UP+TEMPO'], ['key:TEMPO+UP']), (['key:FUNC+LEFT@CHROMATIC'], ['key:FUNC+LEFT@PART']),
                     (['key:TEMPO'], ['screen:TEMPO'])):
            self.assertEqual(list(gate.ui_clashes(ui(a=a, b=b))), [], (a, b))
        declared = ui(a=['screen:TEMPO'], b=['screen:TEMPO']); declared['b']['conflicts'] = ['a']
        self.assertEqual(list(gate.ui_clashes(declared)), [])

    def test_more_modules_on_a_take_event_or_table_than_its_room_fails_before_the_unit_refuses(self):
        modules = [module(n, 0x40001000 + 0x10 * i) for i, n in enumerate('abc')]
        hooks = {'a': {'ot_x', 'ev_y'}, 'b': {'ot_x'}, 'c': {'ot_x', 'ev_y'}}
        problems = gate.check(modules, hooks=hooks, rooms={'ot_x': 2, 'ev_y': 2})
        self.assertEqual(self.routes(problems), [(('a', 'b', 'c'), 'room')])
        self.assertIn('ot_x, which has room for 2 modules', problems[0]['text'])
        self.assertEqual(gate.check(modules, hooks=hooks, rooms={'ot_x': 3, 'ev_y': 2}), [])

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
