# SPDX-License-Identifier: MIT
"""Check saved WAVs against their manifest and the actual proposed C search."""
import argparse
import ctypes
import json
from pathlib import Path
import subprocess
import tempfile
import prepare_pack as pack


def verify(folder, header):
    folder, header = Path(folder).resolve(), Path(header).resolve()
    manifest = json.loads((folder / 'manifest.json').read_text())
    checks = 0
    with tempfile.TemporaryDirectory() as temporary:
        source, library = Path(temporary) / 'probe.c', Path(temporary) / 'probe.so'
        source.write_text('''#include "sample_editor_snap.h"
static const int32_t *pcm;
static uint32_t channels;
static int reader(void *unused,uint32_t p,int32_t *left,int32_t *right) {
 (void)unused;left[0]=pcm[p*channels];left[1]=pcm[(p+1)*channels];
 right[0]=pcm[p*channels+channels-1];right[1]=pcm[(p+1)*channels+channels-1];return 1;
}
unsigned probe(const int32_t *input,uint32_t nch,uint32_t frames,
 const uint32_t *points,uint32_t count,uint32_t selection,uint32_t *output,uint32_t *reads) {
 struct mw_sample_snap s;pcm=input;channels=nch;
 unsigned result=mw_snap_init(&s,points,count,points[count],frames,selection,nch==2);
 while(result==MW_SNAP_WORKING)result=mw_snap_step(&s,reader,0,MW_SNAP_STEP_PAIRS);
 for(unsigned i=0;i<=count;++i)output[i]=s.points[i];*reads=s.reads;return result;
}
''')
        subprocess.run(['cc', '-std=c99', '-Wall', '-Wextra', '-Werror', '-shared', '-fPIC',
                        '-I', str(header.parent), str(source), '-o', str(library)], check=True)
        probe = ctypes.CDLL(str(library)).probe
        u32, i32 = ctypes.c_uint32, ctypes.c_int32
        probe.argtypes = [ctypes.POINTER(i32), u32, u32, ctypes.POINTER(u32), u32, u32,
                          ctypes.POINTER(u32), ctypes.POINTER(u32)]
        probe.restype = u32
        statuses = {'APPLIED': 1, 'ANALYSIS_LIMIT': 3, 'ANALYSIS_FAILED': 4}
        for entry in manifest['files']:
            path = folder / entry['file']
            if pack.sha(path) != entry['sha256']:
                raise ValueError('WAV hash differs: ' + entry['id'])
            pcm, bits, rate = pack.read_wav(path)
            if (len(pcm), len(pcm[0]), bits, rate) != (entry['channels'], entry['frames'], entry['bits'], entry['sampleRate']):
                raise ValueError('WAV geometry differs: ' + entry['id'])
            interleaved = (i32 * (len(pcm) * len(pcm[0])))(*(v for frame in zip(*pcm) for v in frame))
            points = (u32 * len(entry['pointsOff']))(*entry['pointsOff'])
            for selection, mask in (('LEFT', 1), ('RIGHT', 2), ('BOTH', 3)):
                expected = pack.oracle(pcm, entry['pointsOff'], selection)
                if expected != entry['snapOn'][selection]:
                    raise ValueError('Manifest no longer agrees with decoded PCM')
                output, reads = (u32 * len(points))(), u32()
                result = probe(interleaved, len(pcm), len(pcm[0]), points, len(points) - 1, mask, output, ctypes.byref(reads))
                if result != statuses[expected['outcome']] or reads.value != expected['pairReads']:
                    raise ValueError(f'{entry["id"]} {selection}: C result/reads {result}/{reads.value}, oracle {expected}')
                if expected['outcome'] == 'APPLIED' and list(output) != expected['points']:
                    raise ValueError(f'{entry["id"]} {selection}: C points differ from independent oracle')
                checks += 1
    receipt = {'scope': 'Offline decoded WAV / independent oracle / actual C search; not hardware',
               'files': len(manifest['files']), 'comparisons': checks,
               'manifestSha256': pack.sha(folder / 'manifest.json'), 'searchHeaderSha256': pack.sha(header),
               'result': 'passed', 'deviceOperations': 'none'}
    (folder / 'verification.json').write_text(json.dumps(receipt, indent=2) + '\n')
    return receipt


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--pack', type=Path, required=True)
    parser.add_argument('--header', type=Path, required=True)
    args = parser.parse_args()
    print(json.dumps(verify(args.pack, args.header), indent=2))
