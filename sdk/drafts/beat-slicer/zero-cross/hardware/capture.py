# SPDX-License-Identifier: MIT
"""Read-only snapshots via an already-authorized, exclusive device serve session.

Never starts a bridge, presses keys, boots, installs, Keeps, saves or restores.
The measurement overlay is required for direct sample-settings reads.
"""
import argparse
import hashlib
import json
from pathlib import Path
import re
import socket
import struct
import time
import prepare_pack


class Session:
    def __init__(self, path):
        self.path = str(path)

    def request(self, line):
        if not re.fullmatch(r'(?:mem:0x[0-9a-f]+:[0-9]+|inventory|ui)', line):
            raise ValueError('Read-only snapshot commands only')
        with socket.socket(socket.AF_UNIX) as connection:
            connection.settimeout(25)
            connection.connect(self.path)
            connection.sendall((line + '\n').encode())
            chunks = []
            while data := connection.recv(8192):
                chunks.append(data)
        reply = b''.join(chunks).decode().strip()
        if 'error:' in reply.lower():
            raise RuntimeError(reply)
        return reply

    def memory(self, at, length):
        reply = self.request(f'mem:0x{at:x}:{length}')
        if not re.fullmatch(r'[0-9a-f]+', reply) or len(reply) != 2 * length:
            raise RuntimeError('Unexpected or short MEM response')
        return bytes.fromhex(reply)

    def word(self, at):
        return struct.unpack('>I', self.memory(at, 4))[0]


def cost(session, symbols, name):
    at = symbols[name]
    for _ in range(8):
        raw = session.memory(at, 24)
        sequence, spans, last, maximum, low, high = struct.unpack('>6I', raw)
        if not sequence & 1 and session.word(at) == sequence:
            return {'sequence': sequence, 'spans': spans, 'lastTicks': last, 'maximumTicks': maximum,
                    'totalTicks': low + (high << 32), 'timerHz': 132000000}
    raise RuntimeError('Timing counters did not settle; no coherent measurement claimed')


def snapshot(session, symbols, expected_identity):
    base = session.memory(symbols['modwerk_base_digest'], 32).hex()
    if base != expected_identity:
        raise RuntimeError('Wrong running base; stop before any further operation')
    for _ in range(4):
        selection_before = session.word(0x400ceb38)
        source_before = session.memory(0x46c8d19c, 8)
        slot, kind = struct.unpack('>2I', source_before)
        if kind not in (0, 1) or slot >= (136 if kind else 128):
            raise RuntimeError('No supported selected sample')
        controls_at = (0x46c922c4 if kind else 0x46c90a78) + 44 * slot
        settings_at = (0x100b14f0 if kind else 0x100d5b30) + 1096 * slot
        controls = session.memory(controls_at, 44)
        settings = session.memory(settings_at, 1096)
        if (controls == session.memory(controls_at, 44) and settings == session.memory(settings_at, 1096)
                and source_before == session.memory(0x46c8d19c, 8)
                and selection_before == session.word(0x400ceb38)):
            break
    else:
        raise RuntimeError('Source or markers did not settle; no stable snapshot claimed')
    c, s = struct.unpack('>11I', controls), struct.unpack('>274I', settings)
    if c[0] > 3 or c[2] or s[273] > 64:
        raise RuntimeError('Unsupported/busy sample or invalid slice count')
    records = [dict(zip(('start', 'end', 'loop'), s[78 + i * 3:81 + i * 3])) for i in range(64)]
    offsets = struct.unpack('>5I', session.memory(symbols['mw_sample_test_offsets'], 20))
    if any(offset >= offsets[4] or offset % 4 for offset in offsets[:4]):
        raise RuntimeError('Unexpected target editor offsets')
    editor = session.memory(symbols['mw_sample_editor'], offsets[4])
    editor_fields = [struct.unpack_from('>I', editor, offset)[0] for offset in offsets[:4]]
    return {'schema': 1, 'capturedAtUnix': time.time(), 'baseIdentity': base, 'kind': kind, 'slot': slot,
            'arenaBase': symbols['arena_base'],
            'frames': c[4], 'format': c[0], 'trimStart': s[75], 'trimEnd': s[76], 'loop': s[77],
            'sampleBpm24': s[69], 'projectBpm24': session.word(0x80001814), 'selection': selection_before,
            'count': s[273], 'records': records, 'controls': list(c),
            **dict(zip(('editorSerial', 'editorState', 'completion', 'pairReads'), editor_fields)),
            'settingsSha256': hashlib.sha256(settings).hexdigest(),
            'unstable': False, 'coherence': 'Repeated identical complete reads while settled; not an atomic snapshot',
            'costs': {n: cost(session, symbols, n) for n in ('mw_sample_scan_cost', 'mw_sample_writer_cost')},
            'fileIdentity': 'Not established by metadata; verify reviewed card file separately',
            'deviceOperations': 'Read-only; no keys/boot/install/save/Keep/Undo'}


def verify_flex_pcm(session, result, folder, case_id):
    """Read the settled normal file-backed Flex pool; reject changed bindings.

    No native function is called and no arbitrary pointer is accepted. Recorder
    and non-normal maps need their separate procedures, not this file checker.
    """
    manifest = json.loads((Path(folder) / 'manifest.json').read_text())
    entry = next(f for f in manifest['files'] if f['id'] == case_id)
    path = Path(folder) / entry['file']
    if prepare_pack.sha(path) != entry['sha256']:
        raise RuntimeError('Reviewed WAV has changed')
    if result['kind'] != 1 or result['slot'] >= 128:
        raise RuntimeError('Full PCM verification supports file-backed Flex only')
    slot, controls = result['slot'], result['controls']
    arena = result['arenaBase']
    if not isinstance(arena, int) or not 0x40a955e0 <= arena < 0x46000000:
        raise RuntimeError('Invalid running-base sample arena binding')
    bits = 16 if controls[0] & 2 else 24
    channels = 2 if controls[0] & 1 else 1
    if (bits, channels, result['frames']) != (entry['bits'], entry['channels'], entry['frames']):
        raise RuntimeError('Loaded Flex resolution/geometry differs from WAV')
    binding = session.memory(0x80006914, 16)
    pages_at, offsets_at, used, total = struct.unpack('>4I', binding)
    if (pages_at, offsets_at) != (0x46c2e9c0, 0x46c2e580) or not 0 < used <= total <= 14602:
        raise RuntimeError('Non-normal or invalid Flex map; do not dereference it')
    offset = session.word(offsets_at + slot * 4)
    owned = struct.unpack('>H', session.memory(0x46c75e88 + slot * 2, 2))[0]
    width = channels * (bits // 8)
    needed = (entry['frames'] * width + 6143) // 6144
    if not needed <= owned <= 1024 or offset + owned > used:
        raise RuntimeError('Invalid owned Flex page extent')
    raw_pages = session.memory(pages_at + 2 * offset, 2 * needed)
    pages = struct.unpack('>' + 'H' * needed, raw_pages)
    if len(set(pages)) != needed or any(p >= total for p in pages):
        raise RuntimeError('Invalid/aliased physical Flex pages')
    digest = hashlib.sha256()
    remaining = entry['frames'] * width
    for page in pages:
        count = min(6144, remaining)
        at = arena + page * 6144
        if at + count > 0x46c2e580:
            raise RuntimeError('Physical Flex page exceeds the sample-pool bound')
        digest.update(session.memory(at, count))
        remaining -= count
    decoded, _, _ = prepare_pack.read_wav(path)
    expected = hashlib.sha256()
    for frame in zip(*decoded):
        for sample in frame:
            expected.update(sample.to_bytes(bits // 8, 'big', signed=True))
    if digest.digest() != expected.digest():
        raise RuntimeError('Actual loaded Flex PCM differs from the reviewed WAV')
    if (binding != session.memory(0x80006914, 16)
            or offset != session.word(offsets_at + slot * 4)
            or raw_pages != session.memory(pages_at + 2 * offset, 2 * needed)
            or owned != struct.unpack('>H', session.memory(0x46c75e88 + slot * 2, 2))[0]
            or tuple(controls) != struct.unpack('>11I', session.memory(0x46c922c4 + slot * 44, 44))
            or (slot, 1) != struct.unpack('>2I', session.memory(0x46c8d19c, 8))):
        raise RuntimeError('Flex source/page binding changed during PCM verification')
    result['fileIdentity'] = {'case': case_id, 'wavSha256': entry['sha256'],
                              'loadedPcmSha256': digest.hexdigest(), 'fullDecodedPcmMatches': True,
                              'scope': 'Settled file-backed Flex; no arbitrary concurrent-writer proof'}
    return result


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--socket', type=Path, required=True, help='Existing serve command socket, not the EP0 share socket')
    parser.add_argument('--build', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--baseline', action='store_true', help='Read base, full module inventory and UI only; no settings')
    parser.add_argument('--pack', type=Path)
    parser.add_argument('--case')
    parser.add_argument('--verify-flex-pcm', action='store_true')
    args = parser.parse_args()
    if args.output.exists():
        parser.error('Use a new private output file')
    if args.verify_flex_pcm and (not args.pack or not args.case or args.baseline):
        parser.error('Full Flex PCM verification needs --pack and --case, without --baseline')
    symbols = json.loads((args.build / 'symbols.json').read_text())
    identity = json.loads((args.build / 'proofs.json').read_text())['configurationHash']
    session = Session(args.socket)
    if args.baseline:
        actual = session.memory(symbols['modwerk_base_digest'], 32).hex()
        if actual != identity:
            raise RuntimeError('Baseline build does not match running base')
        result = {'baseIdentity': actual, 'inventory': json.loads(session.request('inventory')),
                  'ui': session.request('ui'), 'deviceOperations': 'read-only', 'capturedAtUnix': time.time()}
    else:
        result = snapshot(session, symbols, identity)
        if args.verify_flex_pcm:
            verify_flex_pcm(session, result, args.pack, args.case)
    args.output.write_text(json.dumps(result, indent=2) + '\n')
    print('Read-only snapshot saved:', args.output)
