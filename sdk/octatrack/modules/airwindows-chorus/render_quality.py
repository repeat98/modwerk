#!/usr/bin/env python3
"""Render the fx:audit plan through the assembled DSP; keep audio private."""
import argparse
import pathlib
import struct
import tempfile
import verify


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--input',type=pathlib.Path,required=True)
    parser.add_argument('--output',type=pathlib.Path,required=True)
    parser.add_argument('--modulated',action='store_true')
    args=parser.parse_args()
    if args.output.exists():
        parser.error('Choose a new private output folder')
    signals=sorted(args.input.glob('*.raw'))
    if len(signals)!=9:
        parser.error('Expected the nine raw signals from npm run fx:audit -- plan')
    args.output.mkdir(parents=True)
    with tempfile.TemporaryDirectory() as tmp:
        work=pathlib.Path(tmp)
        mem,s,_,_=verify.assemble(work)
        for path in signals:
            raw=path.read_bytes()
            x=list(struct.unpack(f'<{len(raw)//4}i',raw))
            l,r,_,_=verify.run(work,mem,s,x,x,(127 if args.modulated else 0,127,127))
            (args.output/path.name).write_bytes(struct.pack(f'<{2*len(x)}i',*(v for pair in zip(l,r) for v in pair)))
            print(path.name,flush=True)

if __name__=='__main__':
    main()
