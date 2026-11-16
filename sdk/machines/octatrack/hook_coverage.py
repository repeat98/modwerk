#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""Every hook and table in events.json has a user, or a line in unused-hooks.json saying why it has none yet.

    python3 -B sdk/machines/octatrack/hook_coverage.py          # the problems; exit 1 if any
    python3 -B sdk/machines/octatrack/hook_coverage.py --list   # each hook's users

A user is a declaration the loader or a build binds by: a `subscribe` ({"event", "fn"} or "HOOK:FN:ORDER"),
`contribute` ({"to", "data"}) or `raise` entry in a module's or draft's runtime.json, a machine port
(module-adapters/machine-ports.json), a package row (src/engine/assets/octatrack-module-packages.json), or the same
entries written in Python (dict(event=..., fn=...), build.py's --subscribe HOOK:... and --raise HOOK) by the base's
build, an adapter, a module's tools or a test. A hook named only in prose, a comment, a C or assembly symbol, or the
base's own raise has no user: nothing binds a handler to it. A line in unused-hooks.json whose hook is used now, or
that names no hook, fails too, so the list stays exact. dsp-sites.json needs no such list: each of its sites names
the module whose manifest declares it, and dsp_sites.py --check refuses a site no manifest declares.
"""
import argparse
import ast
import json
from pathlib import Path
import subprocess
import sys

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
REGISTRY = 'sdk/machines/octatrack/events.json'
ALLOW = 'sdk/machines/octatrack/unused-hooks.json'
SCANNED = ('sdk/octatrack/modules', 'sdk/drafts', 'sdk/machines/octatrack', 'sdk/tests',
           'src/engine/assets/octatrack-module-packages.json')
# The registry, its generated outputs, the generator and this check (and its test's fixtures) are not users.
SKIPPED = {REGISTRY, ALLOW, 'sdk/machines/octatrack/site-events.json', 'sdk/machines/octatrack/events.py',
           'sdk/machines/octatrack/hook_coverage.py', 'sdk/tests/test_hook_coverage.py'}


def tracked(root=ROOT):
    """The checked-in files the check reads, relative to root."""
    out = subprocess.run(['git', '-C', str(root), 'ls-files', '-z', '--', *SCANNED], capture_output=True, check=True).stdout
    return [p for p in out.decode().split('\0') if p.endswith(('.json', '.py')) and p not in SKIPPED]


def _hook(text):
    return text.split(':', 1)[0] if isinstance(text, str) else None


def _json_uses(doc):
    """(hook, how) for each subscribe, contribute and raise entry anywhere in a JSON document."""
    if isinstance(doc, list):
        for x in doc:
            yield from _json_uses(x)
    if not isinstance(doc, dict):
        return
    for key, field in (('subscribe', 'event'), ('contribute', 'to'), ('raise', None)):
        for x in doc.get(key) if isinstance(doc.get(key), list) else ():
            hook = x.get(field) if isinstance(x, dict) and field else _hook(x)
            if isinstance(hook, str):
                yield hook, key
    for x in doc.values():
        yield from _json_uses(x)


def _str(node):
    return node.value if isinstance(node, ast.Constant) and isinstance(node.value, str) else None


def _python_uses(tree):
    """(hook, how) for each subscribe, contribute and raise entry written in Python, and build.py's arguments."""
    for node in ast.walk(tree):
        fields = None
        if isinstance(node, ast.Dict):
            fields = {_str(k): v for k, v in zip(node.keys, node.values) if k is not None and _str(k)}
        elif isinstance(node, ast.Call) and isinstance(node.func, ast.Name) and node.func.id == 'dict':
            fields = {k.arg: k.value for k in node.keywords if k.arg}
        if fields:
            if 'fn' in fields and _str(fields.get('event')):
                yield _str(fields['event']), 'subscribe'
            if 'data' in fields and _str(fields.get('to')):
                yield _str(fields['to']), 'contribute'
            for key in ('subscribe', 'raise'):
                if isinstance(fields.get(key), (ast.List, ast.Tuple)):
                    yield from ((_hook(_str(x)), key) for x in fields[key].elts if _str(x))
        items = node.elts if isinstance(node, (ast.List, ast.Tuple)) else node.args if isinstance(node, ast.Call) else ()
        for flag, value in zip(items, items[1:]):
            if _str(flag) in ('--subscribe', '--raise') and _str(value):
                yield _hook(_str(value)), _str(flag)[2:]


def users(root=ROOT, paths=None):
    """{hook: ['path (how)', ...]} over the given files (default: the checked-in ones the check reads)."""
    found = {}
    for path in tracked(root) if paths is None else paths:
        try:
            text = (Path(root) / path).read_text(encoding='utf-8')
            uses = _json_uses(json.loads(text)) if path.endswith('.json') else _python_uses(ast.parse(text))
            for hook, how in list(uses):
                found.setdefault(hook, set()).add('%s (%s)' % (path, how))
        except (OSError, UnicodeDecodeError, ValueError, SyntaxError):
            continue  # not this check's to judge: the file's own checks read it
    return {h: sorted(u) for h, u in found.items()}


def _unique(pairs):
    keys = [k for k, _ in pairs]
    if len(keys) != len(set(keys)):
        raise ValueError('%s lists a hook twice' % ALLOW)
    return dict(pairs)


def problems(root=ROOT, paths=None):
    """What to fix, one line each: a hook nothing uses and no line explains, and a line that is stale."""
    root = Path(root)
    hooks = [e['event'] for e in json.loads((root / REGISTRY).read_text(encoding='utf-8'))['events']]
    try:
        allowed = json.loads((root / ALLOW).read_text(encoding='utf-8'), object_pairs_hook=_unique)['unused']
    except (OSError, KeyError, ValueError) as error:
        return ['%s: %s' % (ALLOW, error)]
    used, out = users(root, paths), []
    for hook in hooks:
        if hook not in used and hook not in allowed:
            out.append('%s: no module, draft, adapter, base build or test subscribes, raises or contributes to it. Give it '
                       'its first user in the same pull request, or add a line to %s saying why it waits' % (hook, ALLOW))
    for hook, reason in allowed.items():
        if hook not in hooks:
            out.append('%s: %s names a hook events.json does not have: remove the line' % (hook, ALLOW))
        elif hook in used:
            out.append('%s: %s says nothing uses it, but %s does: remove the line' % (hook, ALLOW, used[hook][0]))
        if not isinstance(reason, str) or not reason.strip() or '\n' in reason or len(reason) > 200:
            out.append('%s: its line in %s needs a reason of one line (200 characters at most)' % (hook, ALLOW))
    return out


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    parser.add_argument('--list', action='store_true', help="print each hook's users")
    args = parser.parse_args(argv)
    if args.list:
        used = users()
        for e in json.loads((ROOT / REGISTRY).read_text(encoding='utf-8'))['events']:
            print('%s: %s' % (e['event'], ', '.join(used.get(e['event'], ['none']))))
    found = problems()
    print('\n'.join(found) or 'Every hook in events.json has a user or a reason in ' + ALLOW)
    return 1 if found else 0


if __name__ == '__main__':
    sys.exit(main())
