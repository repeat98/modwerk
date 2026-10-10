#!/usr/bin/env python3
"""Exercise the lossless packed table through the actual assembled DSP helpers."""
import argparse
import hashlib
import json
import pathlib
import struct
import subprocess
import tempfile
import verify
from packed_sine import packed_table, sine_values, unpack_second


def probe(work, memory, symbols, helper, indices):
    # The stream starts at the init endpoint and traverses adjacent indices.
    source = work/'probe.asm'
    operand = 'x1' if helper == 'ac_lookup' else 'a'
    source.write_text(f'proc:\n move #>$ffffff,m4\n move #>$ffffff,m5\n'
                      f' move #>$2800,x0\n move x0,x:(r7+$30)\n'
                      f' move #>${symbols[helper]:x},r2\n do #16,>done\n'
                      f' move x:(r0),{operand}\n jsr (r2)\n'
                      ' move x0,x:(r0)+\n move b1,x:(r0)+\ndone:\n nop\n rts\n')
    binary = work/'probe.bin'
    subprocess.run([str(verify.ASM),'-in',str(source),'-org','4000',
                    '-out',str(binary)],check=True,capture_output=True)
    data = binary.read_bytes()
    words = [int.from_bytes(data[i:i+3],'little') for i in range(0,len(data),3)]
    image = work/'probe.mem'
    image.write_bytes(memory.read_bytes()[:-9]+verify.rec(0,0x4000,words)+memory.read_bytes()[-9:])
    indices += [indices[-1]] * ((-len(indices)) % 16)
    input_file,output = work/'in.raw',work/'out.raw'
    input_file.write_bytes(struct.pack(f'<{2*len(indices)}i',
                                      *(v for i in indices for v in (i,0))))
    subprocess.run([str(verify.HOST),'-mem',str(image),'-init',f'{symbols["init"]:x}',
                    '-proc','4000','-ctx','40,41,42','-frames','16',
                    '-blocks',str(len(indices)//16),'-audio','9000','-r7','2','-alloc','1',
                    '-stereo','-params','64,64,0,0,0,64,0,0,0,0,0,0',
                    '-in',str(input_file),'-out',str(output)],check=True,capture_output=True,timeout=120)
    samples = struct.unpack(f'<{len(output.read_bytes())//4}i',output.read_bytes())
    return list(zip(samples[::2],samples[1::2]))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output',type=pathlib.Path)
    args = parser.parse_args()
    values,table = sine_values(),packed_table()
    expected_second = [values[i]-2*values[i-1]+values[i-2] for i in range(2,len(values))]
    assert [unpack_second(table,i) for i in range(2,len(values))] == expected_second
    with tempfile.TemporaryDirectory(prefix='air-chorus-sine-') as temp:
        work = pathlib.Path(temp)
        memory,symbols,program_words,assembly_sha = verify.assemble(work)
        indices = list(range(1025,1,-1))
        corrections = probe(work,memory,symbols,'ac_seconddiff',indices)
        coefficient_ok = all(actual[0] == expected_second[i-2] for i,actual in zip(indices,corrections))
        verify.check('all 1024 DSP signed second differences exact',coefficient_ok)
        # Repeated values exercise cached reuse as well as both directions.
        lookup_indices = [i for i in range(1024,-1,-1) for _ in range(2)] + list(range(1,1025))
        endpoints = probe(work,memory,symbols,'ac_lookup',lookup_indices)
        endpoint_ok = all(actual == (values[i],values[i+1]) for i,actual in zip(lookup_indices,endpoints))
        verify.check('all DSP cached endpoints exact in both directions',endpoint_ok)
    record = {'version':json.loads((verify.HERE/'octamod.module.json').read_text())['version'],
              'sourceSha256':hashlib.sha256((verify.HERE/'chorus.asm').read_bytes()).hexdigest(),
              'assembledSha256':assembly_sha,'programWords':program_words,
              'tableWords':len(table),'originalValues':len(values),
              'tableSha256':hashlib.sha256(b''.join(v.to_bytes(3,'little') for v in table)).hexdigest(),
              'coefficientCases':len(indices),'endpointCases':len(lookup_indices),
              'allCoefficientsExact':coefficient_ok,'allEndpointsExact':endpoint_ok,
              'limitations':['Finite software DSP proof, not hardware timing or listening evidence.']}
    if args.output:
        args.output.write_text(json.dumps(record,indent=2)+'\n')
    if verify.failures:
        raise SystemExit(f'{len(verify.failures)} failed gates')


if __name__ == '__main__':
    main()
