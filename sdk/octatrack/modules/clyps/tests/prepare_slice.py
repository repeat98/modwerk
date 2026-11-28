"""Put a CLYPS candidate on the disabled shelf of a copy of the synthetic GATE3 card."""
import argparse
import hashlib
import json
from pathlib import Path
import struct
import sys
import tempfile

parser = argparse.ArgumentParser(description=__doc__)
for name in ('octabam', 'synthetic_card', 'proof', 'package', 'output'):
    parser.add_argument(name, type=Path)
args = parser.parse_args()
sys.path.insert(0, str(args.octabam.resolve() / 'tools/emu'))
import emu_card


def digest(data):
    return hashlib.sha256(data).digest()


package = args.package.read_bytes()
if package[:4] != b'MWRM' or package[28:32] != digest(b'clyps-live')[:4]:
    parser.error('Expected a CLYPS candidate MWRM')
proof = json.loads(args.proof.read_text())
identity = digest(json.dumps(proof['configuration'], separators=(',', ':')).encode())
if identity.hex() != proof['configurationHash']:
    parser.error('Configuration digest differs from build proof')
record = package[28:32] + struct.pack('>I', len(package)) + digest(package) + package
record += bytes(-len(record) % 4)
shelf = struct.pack('>4sIIII', b'MWOF', 1, 1, 52 + len(record), 1) + digest(record) + record
empty = struct.pack('>4sIIII', b'MWST', 2, 1, 0, 84) + identity + digest(b'')
with tempfile.TemporaryDirectory() as tmp:
    tree = Path(tmp)
    emu_card.extract_image(args.synthetic_card.read_bytes(), tree)
    if not (tree / 'MODWERK/GATE3/project.work').is_file():
        parser.error('Expected the synthetic GATE3 project')
    (tree / 'MODWERK0.SET').write_bytes(empty.ljust(512, b'\0') + shelf + bytes(-len(shelf) % 512))
    with args.output.open('xb') as target:
        target.write(emu_card.build_image(tree))
