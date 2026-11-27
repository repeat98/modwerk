"""Build CLYPS for the candidate shared SDK; all bindings resolve by name."""
import argparse
import hashlib
import json
from pathlib import Path
import struct
import subprocess
import sys
import tempfile

here = Path(__file__).resolve().parent
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('sdk', type=Path, help='Candidate repository sdk directory')
parser.add_argument('output', type=Path)
parser.add_argument('--symbols', type=Path, help='Write offsets for the phase witness')
parser.add_argument('--performance', action='store_true', help='Build the private Row/Clip overlay')
args = parser.parse_args()
sdk = args.sdk.resolve()
sys.path[:0] = [str(sdk / 'runtime/loader'), str(sdk / 'runtime'), str(sdk / 'machines/octatrack')]
import build
import events
import m68k_codegen

registry = events.load()
bindings = json.loads((here / 'contracts/runtime.proposed.json').read_text())['subscribe']
bindings = [entry for entry in bindings if entry['event'] not in build.HANDLERS]
bindings.append(dict(event='ot_modal_input', fn='clyps_modal', order=50))
with tempfile.TemporaryDirectory() as tmp:
    work = Path(tmp)
    marker = work / 'modal.c'
    marker.write_text('#include "modwerk_events.h"\nconst struct modwerk_modal_input clyps_modal = { MODWERK_MODAL_INPUT_ABI };\n')
    objects = []
    for source in [here / 'live_module.c', marker]:
        obj = work / (source.stem + '.o')
        subprocess.run(['m68k-elf-gcc', *build.CFLAGS, *m68k_codegen.FLAGS,
                        *(['-DCLYPS_PERFORMANCE'] if args.performance else []),
                        '-I', sdk / 'machines/octatrack/include', '-c', source, '-o', obj], check=True)
        objects.append(obj)
    m68k_codegen.check_mcf54455(objects, 'm68k-elf-objdump')
    image, symbols, bss, offsets = build.link_units(objects, 'm68k-elf-', 0, work)
hooks = build.subscribe([symbols[name] for name in build.HANDLERS], bindings, symbols, registry=registry)
package = build.package(image, bss, hooks, offsets, name='clyps-live', abi=8, hashed=True, title='clyps-live')
# ABI 9 adds the required base features and two empty DSP claim counts.
feature = next(line for line in events.sdk(registry).splitlines()
               if line.startswith('#define MODWERK_SEQ_PANEL_FEATURE '))
mask = int(feature.split()[-1].rstrip('u'), 0)
package = package[:4] + struct.pack('>H', 9) + package[6:76] + struct.pack('>HBB', mask, 0, 0) + package[76:]
args.output.write_bytes(package)
if args.symbols:
    names = ['clyps_project_init', 'playing', 'requested', 'defined']
    if args.performance:
        names.extend(['last_row', 'pending_row', 'view', 'slot', 'track',
                      'src_cursor', 'mode', 'locked', 'lock_note', 'last_view',
                      'operation', 'org_play', 'org_req', 'occ', 'usable', 'occ_known',
                      'seen_stock', 'rows', 'bank_uncertain'])
    args.symbols.write_text(json.dumps({
        'sha256': hashlib.sha256(package).hexdigest(),
        'offsets': {name: symbols[name] for name in names},
    }, indent=2))
print(json.dumps(dict(sha256=hashlib.sha256(package).hexdigest(), image=len(image), bss=bss,
                      relocations=len(offsets), hooks={e['event']:events.index(e['event'], registry) for e in bindings})))
