#!/usr/bin/env python3
# SPDX-License-Identifier: MIT
"""Independent emulator: real-loader refusals, reconstructed-image attestation,
then the existing live-edit/save/reload/removal/Undo exercise. No physical USB.
"""
import argparse
import hashlib
import json
from pathlib import Path
import struct
import sys
from types import SimpleNamespace

import capture_emulator as capture

HERE = Path(__file__).resolve().parent
REFERENCE = '28766a017005e664d00620d3831fc81af7449c95e1896a17121ca8fc2d306d8d'
HASH = lambda data: hashlib.sha256(data).hexdigest()


def main():
    parser = argparse.ArgumentParser(add_help=False)
    parser.add_argument('--reference-package', type=Path, required=True)
    parser.add_argument('--negative-packages', type=Path, required=True)
    own, remaining = parser.parse_known_args()
    reference = own.reference_package.read_bytes()
    assert HASH(reference) == REFERENCE
    out = Path(remaining[remaining.index('--out') + 1])
    base_folder = Path(remaining[remaining.index('--base') + 1])
    symbols = json.loads((base_folder / 'symbols.json').read_text())
    variants = json.loads(own.negative_packages.read_text())
    helper_hash = HASH(Path(__file__).read_bytes())
    original_load, original_port = capture.load, capture.Port
    state = dict(tested=False, attestations=0)

    class OwnedPort(original_port):
        def __init__(self, command, directory):
            super().__init__(command, directory)
            state['port'] = self

    def attest(port, package, root):
        static = original_load('psl_reconstructed_static', Path(root) / 'sdk/runtime/loader/verify_static.py')
        image, offsets, sites, copies, fills = static.unpack_recipe(package)
        expected, original_offsets, original_sites, old_copies, old_fills = static.unpack_recipe(reference)
        assert offsets == original_offsets and sites == original_sites and len(copies) == 9
        assert not fills and not old_copies and not old_fills
        restored = bytearray(image)
        for at, address, length, digest in copies:
            source = port.peek(address, length)
            assert hashlib.sha256(source).digest() == digest, 'Live stock copy source changed'
            assert not any(restored[at:at + length])
            restored[at:at + length] = source
        assert bytes(restored) == expected, 'Reconstruction differs from the original authored image'
        # Retain every original exact-image/site check; pass its original
        # reference only after independently proving full reconstruction.
        old = original_load('psl_original_attestation', HERE / 'attestation_emulator.py')
        result = old.verify(port, reference, root)
        state['attestations'] += 1
        return dict(result, reconstructedImageMatchesOriginal=True, liveCopySourcesVerified=len(copies))

    def checked_load(name, filename):
        if name == 'psl_attestation':
            return SimpleNamespace(verify=attest)
        module = original_load(name, filename)
        if name != 'psl_usb':
            return module
        original_submitter = module.Submitter

        class CheckedSubmitter(original_submitter):
            def exchange(self, frame):
                if struct.unpack_from('>H', frame, 6)[0] == 1 and not state['tested']:
                    state['tested'] = True
                    port = state['port']
                    raw = lambda data: original_submitter.exchange(self, data)
                    current = module.status(raw(module.frame(0)))
                    session = current['session']
                    assert current['phase'] == 0 and current['known'] == 1
                    sites = {address: port.peek(address, 6) for address in (0x4002dc68, 0x4002dc90, 0x4002dcc4)}
                    rows = []
                    def request(command, body=b'', transaction=0):
                        data = b'MWUP' + struct.pack('>HHII', 1, command, transaction, len(body)) + session + body
                        return module.status(raw(data))
                    assert request(1)['result'] == 0
                    for index, variant in enumerate(variants, 100):
                        data = (own.negative_packages.parent / variant['file']).read_bytes()
                        assert HASH(data) == variant['sha256']
                        now = request(0)
                        offer = bytes.fromhex(now['base']) + hashlib.sha256(data).digest() + struct.pack('>II', now['generation'], len(data))
                        assert request(2, offer, index)['result'] == 0
                        for at in range(0, len(data), 4096):
                            assert request(3, struct.pack('>I', at) + data[at:at + 4096], index)['result'] == 0
                        refused = request(4, transaction=index)
                        reason = int.from_bytes(port.peek(symbols['refusal'], 4), 'big')
                        assert refused['result'] == 9 and refused['phase'] == 1, (variant['case'], refused)
                        assert reason == variant['runtimeRefusal'], (variant['case'], reason)
                        assert refused['generation'] == current['generation'] and refused['active'] == current['active']
                        assert all(port.peek(address, 6) == before for address, before in sites.items())
                        rows.append(dict(case=variant['case'], uploadResult=9, runtimeRefusal=reason,
                                         generationAndActiveIdentityUnchanged=True, openerSitesUnchanged=True))
                        print('Real loader refused: ' + variant['case'], flush=True)
                    left = request(9, transaction=100 + len(variants) - 1)
                    assert left['result'] == 0 and left['phase'] == 0
                    (out / 'reconstruction-refusals.json').write_text(json.dumps(dict(hardware=False,
                        base=current['base'], checks=rows, helperSha256=helper_hash), indent=2) + '\n')
                # Refusal probes spent transactions 100..105. Keep the existing
                # lifecycle harness's logical 1/10/22 transactions in a separate,
                # higher range; the real controller requires increasing offers.
                transaction = struct.unpack_from('>I', frame, 8)[0]
                if transaction:
                    frame = frame[:8] + struct.pack('>I', transaction + 200) + frame[12:]
                return original_submitter.exchange(self, frame)

        module.Submitter = CheckedSubmitter
        return module

    capture.load, capture.Port = checked_load, OwnedPort
    sys.argv = [sys.argv[0], *remaining]
    assert '--live-playback' in remaining, 'Use the full existing live lifecycle exercise'
    capture.main()
    assert state['tested'] and state['attestations'] >= 2
    assert HASH(Path(__file__).read_bytes()) == helper_hash
    (out / 'reconstruction-attestation.json').write_text(json.dumps(dict(hardware=False,
        referencePackageSha256=REFERENCE, fullImageAttestations=state['attestations'],
        nineLiveCopySourceGuardsVerifiedEachTime=True, helperSha256=helper_hash), indent=2) + '\n')


if __name__ == '__main__':
    main()
