# SPDX-License-Identifier: GPL-3.0-or-later
"""Generate reviewed private base copies without changing approved inputs.

The readable patch contains only Modwerk-authored source, never firmware.
Every original input SHA256 and every hunk must match before any copy exists.
"""
import hashlib
import json
from pathlib import Path
import re
import tempfile
import types

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[3]
RUNTIME = HERE / 'resident-runtime'


def sources(root=ROOT):
    expected = json.loads((HERE / 'resident_base_sources.json').read_text())
    original = {}
    for name, digest in expected.items():
        data = (Path(root) / 'sdk/machines/octatrack/elekloader' / name).read_bytes()
        if hashlib.sha256(data).hexdigest() != digest:
            raise ValueError('Resident base source changed; review the private port: ' + name)
        original[name] = data.decode().splitlines(keepends=True)
    patch = (HERE / 'resident_base.patch').read_text().splitlines(keepends=True)
    output, name, cursor, lines = {}, None, 0, []
    index = 0
    while index < len(patch):
        line = patch[index]
        if line.startswith('--- a/'):
            if name is not None:
                output[name] = ''.join(lines + original[name][cursor:])
            name = line[len('--- a/'):].strip()
            if name not in original or name in output or index + 1 >= len(patch) or patch[index + 1] != '+++ b/' + name + '\n':
                raise ValueError('Unknown or repeated resident base patch file')
            cursor, lines = 0, []
            index += 2
            continue
        match = re.match(r'^@@ -(\d+),(\d+) \+(\d+),(\d+) @@', line)
        if not match or name is None:
            raise ValueError('Malformed resident base source patch')
        start, count, _, new_count = map(int, match.groups())
        start -= 1
        if start < cursor or start > len(original[name]):
            raise ValueError('Overlapping resident base patch hunks')
        lines += original[name][cursor:start]
        cursor, consumed, produced = start, 0, 0
        index += 1
        while index < len(patch) and patch[index][:1] in (' ', '+', '-') and not patch[index].startswith('--- a/'):
            instruction, content = patch[index][0], patch[index][1:]
            if instruction in (' ', '-'):
                if cursor >= len(original[name]) or original[name][cursor] != content:
                    raise ValueError('Resident base patch context changed: ' + name)
                cursor += 1
                consumed += 1
            if instruction in (' ', '+'):
                lines.append(content)
                produced += 1
            index += 1
        if (consumed, produced) != (count, new_count):
            raise ValueError('Resident base patch extent changed')
    if name is not None:
        output[name] = ''.join(lines + original[name][cursor:])
    if set(output) != set(original):
        raise ValueError('Incomplete resident base source patch')
    from track_receiver import loader_source
    from track_budget import dsp
    output['dsp_receiver.asm'] = loader_source(output['dsp_receiver.asm'])
    output['dsp.c'] = dsp(output['dsp.c'], (RUNTIME / 'track_budget.c').read_text())
    return output


def load_loader(root=ROOT):
    """Caller-owned temporary authored source copies and an isolated loader."""
    changed = sources(root)
    work = tempfile.TemporaryDirectory(prefix='modwerk-resident-source.')
    for name, text in changed.items():
        (Path(work.name) / name).write_text(text)
    module = types.ModuleType('modwerk_private_resident_dsp_loader')
    module.__file__ = str(Path(root) / 'sdk/machines/octatrack/elekloader/dsp_loader.py')
    exec(compile(changed['dsp_loader.py'], module.__file__, 'exec'), module.__dict__)
    module.RECEIVER = Path(work.name) / 'dsp_receiver.asm'
    module.private_source_directory = work
    return module
