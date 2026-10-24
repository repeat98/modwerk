"""Read-only, hash-bound menu research leads; never emits firmware bytes.

Input is the privately extracted MAIN section, not an update container.
These string references are not instruction boundaries or an event ABI.
"""
import argparse
import hashlib
import json
from pathlib import Path
import struct

STOCK_MAIN_SHA256 = '164f31224bf61181e3f50e7dec40df9afcae5b16dbf6e4c0d0cc5e986af0a84e'
LOAD = 0x40000400


def occurrences(data, needle):
    start = 0
    while (start := data.find(needle, start)) >= 0:
        yield start
        start += 1


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('main', type=Path)
    args = parser.parse_args()
    data = args.main.read_bytes()
    digest = hashlib.sha256(data).hexdigest()
    if digest != STOCK_MAIN_SHA256:
        parser.error('Expected the original 1.40C MAIN section; refusing another image.')
    labels = []
    for label in ('CREATE SLICE GRID', 'DELETE ALL SLICES', 'ADD SLICE', 'SAVE SAMPLE SETTINGS'):
        for offset in occurrences(data, label.encode() + b'\0'):
            address = LOAD + offset
            labels.append({'label': label, 'address': hex(address),
                           'pointerReferences': [hex(LOAD + p) for p in
                                                 occurrences(data, struct.pack('>I', address))]})
    print(json.dumps({'scope': 'static string/pointer search only; not a verified hook',
                      'mainSha256': digest, 'labels': labels,
                      'eventSite': None, 'guard': None, 'deviceAccess': False}, indent=2))


if __name__ == '__main__':
    main()
