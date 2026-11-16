# SPDX-License-Identifier: GPL-3.0-or-later
"""Every Octatrack hook has a user or a reason (sdk/machines/octatrack/hook_coverage.py, unused-hooks.json)."""
import json
from pathlib import Path
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'sdk/machines/octatrack'))
import hook_coverage  # noqa: E402

FILES = {
    'sdk/octatrack/modules/a/runtime.json': {'schema': 1, 'subscribe': [{'event': 'ev_call', 'fn': 'f', 'order': 50}],
                                             'raise': ['ev_raised']},
    'sdk/machines/octatrack/module-adapters/machine-ports.json': {'ports': {'b': {'contribute': [
        {'to': 'ot_table', 'order': 10, 'data': 'rec'}]}}},
    'src/engine/assets/octatrack-module-packages.json': {'packages': [{'id': 'c', 'subscribe': ['ev_take:mw_take:40']}]},
    'sdk/tests/test_x.py': "run('--raise', 'ev_tested')\nhooks = [dict(event='ev_built', fn='g', order=1)]\n",
    'sdk/drafts/d/notes.py': "# ev_prose is named here, looked up and half declared: none of it binds a handler\n"
                             "index = events.index('ev_prose')\nx = {'event': 'ev_prose'}\n",
    'sdk/drafts/d/README.json': {'about': 'ev_prose'},
}
HOOKS = ['ev_call', 'ev_raised', 'ot_table', 'ev_take', 'ev_tested', 'ev_built', 'ev_prose']


class HookCoverage(unittest.TestCase):
    def test_every_hook_has_a_user_or_a_reason(self):
        self.assertEqual(hook_coverage.problems(), [])

    def tree(self, allowed, files=FILES):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        root = Path(temp.name)
        docs = {hook_coverage.REGISTRY: {'events': [{'event': h} for h in HOOKS]}, **files}
        for path, doc in docs.items():
            (root / path).parent.mkdir(parents=True, exist_ok=True)
            (root / path).write_text(doc if isinstance(doc, str) else json.dumps(doc))
        (root / hook_coverage.ALLOW).write_text(allowed if isinstance(allowed, str) else json.dumps({'unused': allowed}))
        return root, [p for p in files]

    def test_declarations_count_and_prose_does_not(self):
        root, paths = self.tree({})
        used = hook_coverage.users(root, paths)
        self.assertEqual(sorted(h for h in used if h in HOOKS), sorted(set(HOOKS) - {'ev_prose'}))
        self.assertEqual(used['ev_take'], ['src/engine/assets/octatrack-module-packages.json (subscribe)'])
        self.assertEqual(used['ev_tested'], ['sdk/tests/test_x.py (raise)'])
        problems = hook_coverage.problems(root, paths)
        self.assertEqual(len(problems), 1)
        self.assertTrue(problems[0].startswith('ev_prose: no module'), problems)

    def test_a_reason_clears_an_unused_hook(self):
        root, paths = self.tree({'ev_prose': 'waiting for its first module'})
        self.assertEqual(hook_coverage.problems(root, paths), [])

    def test_a_stale_or_unknown_line_fails(self):
        root, paths = self.tree({'ev_prose': 'waiting', 'ev_call': 'unused, it said', 'ev_gone': 'renamed'})
        problems = hook_coverage.problems(root, paths)
        self.assertEqual(len(problems), 2, problems)
        self.assertIn('ev_call: %s says nothing uses it, but sdk/octatrack/modules/a/runtime.json (subscribe) does'
                      % hook_coverage.ALLOW, problems[0])
        self.assertTrue(problems[1].startswith('ev_gone: ') and 'does not have' in problems[1])

    def test_a_reason_is_one_line(self):
        for reason in ('', '  ', 'two\nlines', 'x' * 201, None):
            with self.subTest(reason=reason):
                root, paths = self.tree({'ev_prose': reason})
                self.assertEqual(len(hook_coverage.problems(root, paths)), 1)

    def test_a_hook_listed_twice_fails(self):
        root, paths = self.tree('{"unused": {"ev_prose": "a", "ev_prose": "b"}}')
        self.assertEqual(hook_coverage.problems(root, paths), ['%s: %s lists a hook twice' % ((hook_coverage.ALLOW,) * 2)])


if __name__ == '__main__':
    unittest.main()
