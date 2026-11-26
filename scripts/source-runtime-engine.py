# SPDX-License-Identifier: GPL-3.0-or-later
"""Proposed declarative returning-engine adapter for the existing SDK encoder.

Build-time assembly only: no firmware, DSP execution, USB or Base mutation.
The accepted Base API/trust policy is still a separate release requirement.
"""
import hashlib
import importlib.util
import json
from pathlib import Path
import re

ORIGINS = (0x100000, 0x200000, 0x1000, 0x1400, 0x1801, 0x2407)


def load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def confined(folder, name):
    if (not isinstance(name, str) or not name or '\\' in name
            or Path(name).is_absolute() or any(p in ('', '.', '..') for p in name.split('/'))):
        raise ValueError('Engine inputs must be confined relative module files')
    folder = Path(folder).resolve()
    path = folder / name
    cursor = path
    while cursor != folder:
        if cursor.is_symlink():
            raise ValueError('Engine inputs cannot be symlinks')
        cursor = cursor.parent
    if not path.is_file() or not path.resolve().is_relative_to(folder):
        raise ValueError('Missing or escaping engine input: ' + name)
    return path


def words_file(path):
    values = json.loads(path.read_text())
    if (not isinstance(values, list) or not values or len(values) > 4096
            or any(type(v) is not int or not 0 <= v <= 0xffffff for v in values)):
        raise ValueError('Engine data must contain 1..4096 unsigned 24-bit words')
    return values


def declaration(folder, filename):
    path = confined(folder, filename)
    doc = json.loads(path.read_text())
    keys = {'schema', 'feature', 'sources', 'entry', 'tableMarker', 'tableFile',
            'claims', 'site', 'cores', 'cycles', 'cycleKind'}
    if not isinstance(doc, dict) or set(doc) != keys or type(doc['schema']) is not int or doc['schema'] != 1:
        raise ValueError('Invalid returning-engine recipe')
    for key, low, high in [('feature', 1, 32768), ('site', 0, 255), ('cores', 1, 3), ('cycles', 1, 65535)]:
        if type(doc[key]) is not int or not low <= doc[key] <= high:
            raise ValueError('Invalid engine ' + key)
    if doc['feature'] & (doc['feature'] - 1) or doc['cycleKind'] not in ('executed', 'hardware'):
        raise ValueError('An engine names one feature and a measured/static price kind')
    if not isinstance(doc['entry'], str) or not re.fullmatch(r'[A-Za-z_][A-Za-z_0-9]*', doc['entry']):
        raise ValueError('Invalid engine entry symbol')
    if not isinstance(doc['tableMarker'], str) or not re.fullmatch(r'\$[a-fA-F0-9]{6}', doc['tableMarker']):
        raise ValueError('Invalid P-table marker')
    if (not isinstance(doc['sources'], list) or not doc['sources']
            or any(not isinstance(name, str) for name in doc['sources'])
            or len(doc['sources']) != len(set(doc['sources']))):
        raise ValueError('An engine needs distinct assembly sources')
    sources = [confined(folder, name) for name in doc['sources']]
    if any(p.suffix != '.asm' for p in sources):
        raise ValueError('Returning-engine sources must be .asm files')
    table_path = confined(folder, doc['tableFile'])
    table = words_file(table_path)
    if not isinstance(doc['claims'], list) or not 1 <= len(doc['claims']) <= 16:
        raise ValueError('An engine needs bounded initialized claims')
    paths, claims = [path, *sources, table_path], []
    for claim in doc['claims']:
        if not isinstance(claim, dict) or set(claim) != {'space', 'core', 'address', 'initialFile'}:
            raise ValueError('Invalid engine claim')
        if claim['space'] not in ('x', 'y') or type(claim['core']) is not int or claim['core'] not in (0, 1, 2):
            raise ValueError('Invalid engine claim space/core')
        data_path = confined(folder, claim['initialFile'])
        values = words_file(data_path)
        address = claim['address']
        if type(address) is not int or not 0 <= address < 0x30000 or address + len(values) > 0x30000:
            raise ValueError('A returning-engine claim must fit private DSP memory')
        claims.append((claim['space'], claim['core'], address, values))
        paths.append(data_path)
    return doc, sources, table, claims, paths


def ledger_check(root, doc, claims):
    registry = json.loads((Path(root) / 'sdk/machines/octatrack/dsp-sites.json').read_text())
    feature = next((f for f in registry['features'] if f['bit'] == doc['feature']), None)
    site = next((s for s in registry['sites'] if s['index'] == doc['site']), None)
    if (not feature or not feature.get('packaged') or not site or site['kind'] != 'chain'
            or 'exit' in site or doc['feature'] not in site['features']):
        raise ValueError('The proposed Base must declare this packaged returning chain')
    wanted_cores = {name for bit, name in [(1, 'A'), (2, 'B')] if doc['cores'] & bit}
    if not wanted_cores <= set(feature['cores']):
        raise ValueError('Engine cores exceed its Base feature')
    wanted = set()
    for row in registry['regions']:
        if row['feature'] == doc['feature']:
            if row.get('shared'):
                raise ValueError('Shared-window returning claims are not supported by this adapter')
            for core, name in enumerate(('A', 'B')):
                if name in row['cores']:
                    wanted.add((row['space'], core, int(row['start'], 0), int(row['words'], 0)))
    actual = []
    for space, core, address, values in claims:
        for c in (0, 1) if core == 2 else (core,):
            if not doc['cores'] & (1 << c):
                raise ValueError('Claim names a core the engine does not enter')
            actual.append((space, c, address, len(values)))
    if len(actual) != len(set(actual)) or set(actual) != wanted:
        raise ValueError('Engine claims must exactly match its Base-owned regions')


def assemble(root, folder, filename, work):
    root, folder, work = Path(root).resolve(), Path(folder).resolve(), Path(work).resolve()
    doc, sources, table, claims, paths = declaration(folder, filename)
    ledger_check(root, doc, claims)
    sdk = load('source_engine_assembler', root / 'sdk/machines/octatrack/elekloader/dsp_packages.py')
    text = '\n'.join(p.read_text() for p in sources)
    # No undeclared assembler-file reads may escape the hashed source set.
    instructions = '\n'.join(line.split(';', 1)[0] for line in text.splitlines())
    if re.search(r'(?:^|\s)\.?(?:include|incbin|org)(?=\s|$)', instructions, re.I | re.M):
        raise ValueError('Engine source cannot include files or change origin')
    built = []
    for origin in ORIGINS:
        sized, _ = sdk.assemble(text.replace(doc['tableMarker'], '$%x' % origin), origin, str(work))
        words, labels = sdk.assemble(text.replace(doc['tableMarker'], '$%x' % (origin + len(sized))), origin, str(work))
        if len(words) != len(sized) or labels.get(doc['entry']) != origin:
            raise ValueError('A returning engine must enter at word zero and have stable code size')
        built.append(words + table)
    first, second = built[:2]
    if not 0 < len(first) <= 2048 or len(first) != len(second):
        raise ValueError('Returning engine exceeds its Base placement size')
    relocations = [i for i, (a, b) in enumerate(zip(first, second)) if a != b]
    normalized = [word - ORIGINS[0] if i in relocations else word for i, word in enumerate(first)]
    for origin, fresh in zip(ORIGINS, built):
        if fresh != [word + origin if i in relocations else word for i, word in enumerate(normalized)]:
            raise ValueError('Engine placement differs from independent fresh assembly')
    abi = load('source_engine_abi', root / 'sdk/runtime/loader/abi9.py')
    # The existing encoder validates all ranges/counts again when attached.
    def attach(controller):
        return abi.engine(controller, normalized, relocations, doc['site'], doc['cores'],
                          0, claims, cycles=doc['cycles'], kind=doc['cycleKind'])
    inputs = {str(p.relative_to(folder)): hashlib.sha256(p.read_bytes()).hexdigest() for p in paths}
    report = dict(words=len(normalized), relocations=len(relocations), site=doc['site'],
                  cores=doc['cores'], feature=doc['feature'], cycles=doc['cycles'], cycleKind=doc['cycleKind'],
                  sha256=sdk.digest(normalized), placementProofs=len(ORIGINS), sources=inputs,
                  hardwareTested=False, fxSlotsRequired=0)
    report['toolSources'] = {name: hashlib.sha256((root / name).read_bytes()).hexdigest()
                            for name in ('sdk/runtime/loader/abi9.py',
                                         'sdk/machines/octatrack/elekloader/dsp_packages.py',
                                         'sdk/machines/octatrack/dsp-sites.json')}
    report['adapterSha256'] = hashlib.sha256(Path(__file__).read_bytes()).hexdigest()
    return attach, report, normalized, relocations, claims
