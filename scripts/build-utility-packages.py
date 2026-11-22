"""Compile the requested CC Map/Preview Vol authored ROM packages, without firmware.

Run only in the isolated source-tools container. Native manifests are read as
text, never imported. This development artifact does not approve publication.
"""
import argparse
import ast
import hashlib
import json
from pathlib import Path
import re
import subprocess
import tempfile

SPECS = {
    'previewvol': ('previewvol.s', 'previewvol-906fc354.json'),
    'cc-map': ('cc_map.s', 'cc-map-8d0ad6f.json'),
}
DEFS = {'CC_NEXT': 0x4000e79c, 'CC_MODEDEF1': 0x40027e1a, 'CC_MODEDEF2': 0x40027e1a}
ORIGINS = [0x400d6b80, 0x400d7080, 0x400d24d0]
sha = lambda data: hashlib.sha256(data).hexdigest()


def run(arguments):
    result = subprocess.run([str(value) for value in arguments], capture_output=True, text=True)
    if result.returncode:
        raise RuntimeError(str(arguments[0]) + ' failed: ' + result.stderr[-2000:])
    return result.stdout


def compile_packages(app, output=None):
    rows = []
    with tempfile.TemporaryDirectory(prefix='octamod-utility-source.') as temporary:
        work = Path(temporary)
        for module_id, (assembly, record_name) in SPECS.items():
            folder = app / 'sdk/octabam/modules' / module_id
            document = json.loads((folder / 'octamod.module.json').read_text())
            record = json.loads((app / 'sdk/imports' / record_name).read_text())
            sources = {}
            for name in [assembly, 'manifest.py']:
                data = (folder / name).read_bytes()
                declared = next(item for item in record['files'] if item['path'] == name)
                if sha(data) != declared['vendoredSha256']:
                    raise ValueError(module_id + ': source differs from the pinned import')
                sources[name] = sha(data)
            text = (folder / assembly).read_text()
            if re.search(r'^\s*\.?\s*(include|incbin)\b', text, re.M | re.I):
                raise ValueError('Transcluded/binary content is prohibited')
            if document['id'] != module_id or document['version'] != record['moduleVersion']:
                raise ValueError('Module version differs from its import')
            obj = work / (module_id + '.o')
            cpu = '5407' if module_id == 'cc-map' else '5475'
            run(['m68k-elf-as', '-mcpu=' + cpu, '-o', obj, folder / assembly])
            proofs = []
            for origin in ORIGINS:
                elf, binary = work / (module_id + '.elf'), work / (module_id + '.bytes')
                command = ['m68k-elf-ld', '-Ttext', hex(origin), '-o', elf, obj]
                if module_id == 'cc-map':
                    for name, address in DEFS.items():
                        command.extend(['--defsym', name + '=' + hex(address)])
                run(command)
                run(['m68k-elf-objcopy', '--only-section', '.text', '-O', 'binary', elf, binary])
                linked = binary.read_bytes()
                if module_id == 'cc-map':
                    tree = ast.parse((folder / 'manifest.py').read_text())
                    constants = {node.targets[0].id: node.value for node in tree.body if isinstance(node, ast.Assign) and isinstance(node.targets[0], ast.Name)}
                    oracle = bytearray.fromhex(ast.literal_eval(constants['CODE'].args[0]))
                    for marker, address in [(bytes.fromhex('40bad000'), origin + len(oracle)), (bytes.fromhex('40bad004'), origin + len(oracle) + 6)]:
                        if oracle.count(marker) != 1:
                            raise ValueError('Invalid CC Map authored reference')
                        at = oracle.index(marker)
                        oracle[at:at + 4] = address.to_bytes(4, 'big')
                    oracle.extend(bytes(ast.literal_eval(constants['VERB_COUNTS'].args[0])))
                    oracle.extend(bytes(ast.literal_eval(constants['DLY_COUNTS'].args[0])))
                    if linked != oracle:
                        raise ValueError('CC Map differs from its authored byte oracle')
                symbols = {}
                for line in run(['m68k-elf-nm', '-n', elf]).splitlines():
                    fields = line.split()
                    if len(fields) == 3 and fields[1] in ['t', 'T']:
                        symbols[fields[2]] = int(fields[0], 16) - origin
                proofs.append({'base': origin, 'bytes': len(linked), 'sha256': sha(linked), 'symbols': symbols})
            data = obj.read_bytes()
            rows.append({
                'id': module_id, 'version': document['version'], 'key': document['key'],
                'author': document['author']['github'], 'source': document['source'],
                'sources': sources, 'cpu': cpu, 'bytes': len(data), 'sha256': sha(data), 'code': data.hex(),
                'external': DEFS if module_id == 'cc-map' else {},
                'guards': record['stockGuards'], 'proofs': proofs,
            })
            print(module_id + ': ' + str(proofs[0]['bytes']) + ' authored ROM bytes; three linked origins' + (' match the native authored oracle' if module_id == 'cc-map' else ''), flush=True)
    artifact = {
        'schema': 1, 'kind': 'authored-utility-packages', 'stockRead': False,
        'revision': json.loads((app / 'sdk/catalog.json').read_text())['sourceRevision'],
        'compilerSha256': sha(Path(__file__).read_bytes()),
        'qualification': 'Source assembly and relocation only. Hardware and release approval are not supplied by this artifact.',
        'packages': rows,
    }
    if output is not None:
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_text(json.dumps(artifact, indent=2) + '\n')
    return artifact


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--app', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    compile_packages(args.app.resolve(), args.output.resolve())
