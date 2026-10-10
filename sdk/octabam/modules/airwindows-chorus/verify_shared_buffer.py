#!/usr/bin/env python3
"""Protect stock's live words inside the allocator's shared FX2 slots.

The stock mailbox occupies 0x38000..0x3800f (T3), parameter staging
0x30000..0x30047 (T7). X/Y/P alias there on the physical chip and in the
full port; dsp_host keeps X/Y separate, so this original test writer uses
Y explicitly to exercise the same collision. It is not extracted stock
code or a measurement of the instrument's physical interleave/deadline.
"""
import argparse
import hashlib
import json
import math
import pathlib
import struct
import subprocess
import tempfile
import verify


def render(work, memory, symbols, audio, slot, base, protected, split=0, dump_stock_x=False):
    sentinel = [0x123400] * protected
    stock_x = [0x765432] * 124
    stock_x_base = 0x6884  # slot 8: r7=0x6800, stock offsets 0x84..0xff
    # An independent writer refreshes the live shared words before each
    # effect call. Loaded DSP instructions are original fixture code.
    source = work/'writer.asm'
    source.write_text('init:\n rts\nproc:\n move #>$ffffff,m5\n'
                      f' move #>${base:x},r5\n move #>$123400,x0\n'
                      f' do #{protected},>done\n move x0,y:(r5)+\n'
                      'done:\n nop\n rts\n')
    binary, syms = work/'writer.bin', work/'writer.sym'
    subprocess.run([str(verify.ASM),'-in',str(source),'-org','4000',
                    '-out',str(binary),'-sym',str(syms)],check=True,capture_output=True,text=True)
    entry = dict(line.split() for line in syms.read_text().splitlines() if line.strip())
    blob = binary.read_bytes()
    words = [int.from_bytes(blob[i:i+3],'little') for i in range(0,len(blob),3)]
    combined = work/'combined.mem'
    combined.write_bytes(memory.read_bytes()[:-9] + verify.rec(0,0x4000,words)
                         + verify.rec(1,0x25a,[base]) + verify.rec(2,base,sentinel)
                         + verify.rec(1,stock_x_base,stock_x)
                         + memory.read_bytes()[-9:])
    input_file, output, canary = work/'input.raw',work/'output.raw',work/'canary.bin'
    input_file.write_bytes(audio)
    cmd = [str(verify.HOST),'-mem',str(combined),'-ctx','40,41,42',
           '-inst','2','-init',entry['init']+','+f"{symbols['init']:x}",
           '-proc',entry['proc']+','+f"{symbols['proc']:x}",
           '-r7','1,'+str(slot),'-alloc','0,5','-audio','9000',
           '-frames','16','-blocks',str(len(audio)//8//16),'-inmask','2',
           '-stereo','-in','-,'+str(input_file),'-out',str(output),
           '-params','127,127,0,0,0,127,0,0,0,0,0,0',
           '-split','0,'+str(split),'-dumpy',f'{base:x},{base+protected:x},{canary}']
    if dump_stock_x:
        cmd[-1] = f'{stock_x_base:x},{stock_x_base+len(stock_x):x},@{canary}'
    result = subprocess.run(cmd,capture_output=True,text=True,timeout=600)
    if result.returncode:
        raise RuntimeError(result.stdout[-2000:]+result.stderr[-1000:])
    expected_canary = stock_x if dump_stock_x else sentinel
    preserved = list(struct.unpack(f'<{len(expected_canary)}I',canary.read_bytes())) == expected_canary
    return pathlib.Path(str(output)+'.i1').read_bytes(), preserved


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--baseline',type=pathlib.Path)
    parser.add_argument('--output',type=pathlib.Path)
    args = parser.parse_args()
    n = 32768
    left = [round(.28*(verify.Q-1)*math.sin(2*math.pi*997*i/44100)) for i in range(n)]
    right = [round(.21*(verify.Q-1)*math.sin(2*math.pi*331*i/44100)) for i in range(n)]
    audio = struct.pack(f'<{2*n}i',*(v for pair in zip(left,right) for v in pair))
    rows, baseline_rows = [], []
    with tempfile.TemporaryDirectory(prefix='air-chorus-shared-') as tmp:
        work = pathlib.Path(tmp)
        memory, symbols, _, _ = verify.assemble(work)
        l,r,_,_ = verify.run(work,memory,symbols,left,right,(127,127,127),dirty=True)
        expected = struct.pack(f'<{2*n}i',*(v for pair in zip(l,r) for v in pair))
        for track,base,count in [(3,0x38000,16),(7,0x30000,72)]:
            for split in (0,1,8,15):
                output,preserved = render(work,memory,symbols,audio,8,base,count,split)
                xoutput,xpreserved = render(work,memory,symbols,audio,8,base,count,split,dump_stock_x=True)
                equal = output == expected and xoutput == expected
                verify.check(f'T{track} live stock words, split {split}',preserved and xpreserved and equal,
                             f'stock Y preserved={preserved}; stock X tail preserved={xpreserved}; isolated audio identical={equal}')
                rows.append({'track':track,'split':split,'stockWords':count,
                             'stockWordsPreserved':preserved,'stockXOffsets132To255Preserved':xpreserved,'bitIdenticalToIsolated':equal,'frames':n})
        if args.baseline:
            here = verify.HERE
            try:
                verify.HERE = args.baseline.resolve()
                oldmem,oldsym,_,_ = verify.assemble(work)
            finally:
                verify.HERE = here
            for track,base,count in [(3,0x38000,16),(7,0x30000,72)]:
                before,preserved = render(work,oldmem,oldsym,audio,8,base,count)
                bl,br,_,_ = verify.run(work,oldmem,oldsym,left,right,(127,127,127))
                oldexpected = struct.pack(f'<{2*n}i',*(v for pair in zip(bl,br) for v in pair))
                differs = before != oldexpected
                verify.check(f'released baseline T{track} exposes collision',not preserved and differs)
                baseline_rows.append({'track':track,'stockWordsPreserved':preserved,
                                      'stockWritesAlterAudio':differs})
    record = {'sourceSha256':hashlib.sha256((verify.HERE/'chorus.asm').read_bytes()).hexdigest(),
              'results':rows,'releasedBaseline':baseline_rows,
              'limitations':['Synthetic writer at measured stock addresses; no physical timing or listening result.',
                             'Reported beta T3 clicking still needs confirmation on the exact new hardware build.']}
    if args.output:
        args.output.write_text(json.dumps(record,indent=2)+'\n')
    if verify.failures:
        raise SystemExit(f'{len(verify.failures)} failed gates')


if __name__ == '__main__':
    main()
