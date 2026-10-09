#!/usr/bin/env python3
"""Benchmark stock Chorus and expensive Spring Reverb against the port.
Retains only sanitized statistics here. Raw firmware, memory, audio, schedules
and logs stay in the explicitly private output tree. Counts are executed
instructions with matched harness/null subtraction, not hardware cycles.
"""
import pathlib, sys, os, json, hashlib
from types import SimpleNamespace
import argparse
parser=argparse.ArgumentParser(description='Matched private stock benchmark; run in the isolated toolchain. Native SDK staging tree must include this draft at modules/airwindows-chorus and the verified original MAIN under out/raw.')
parser.add_argument('--native-sdk',type=pathlib.Path,required=True)
parser.add_argument('--module-image',type=pathlib.Path,required=True)
parser.add_argument('--baseline-image',type=pathlib.Path,required=True,help='Private published 0.1.0 MAIN for matched before/after measurements')
parser.add_argument('--output',type=pathlib.Path,required=True)
args=parser.parse_args()
root=args.native_sdk.resolve()
image=args.module_image.resolve()
output=args.output.resolve()
os.chdir(root)
sys.path[:0]=[str(root/'tools')]
import toolpath
import benchmark_reverbs as br, send_probe
from remix import registry, stock
out=output
out.mkdir(exist_ok=True)
br.OUT=out
mem={name:[send_probe.dump_mem(path,out/f'{name}_{p}.mem',p) for p in 'AB'] for name,path in [('stock',stock.STOCK_IMAGE),('baseline',args.baseline_image.resolve()),('chorus',image)]}
blocks=4096
inputs=[br.source(blocks,k) for k in range(2)]
null=SimpleNamespace(key='NULL STUB',name='null',menu=SimpleNamespace(fx2_id=0),params=[SimpleNamespace(default=0,active=False,name=b'',count=128)]*12)
rows=[]
for split in range(16):
    baseline,_=br.run(null,mem['stock'],f'null_s{split}',blocks,2,False,split=[split]*2,inputs=inputs,positions=[0,4],extra=('-audio','0'))
    for key,variant,label in [('SPRING REV','stock','SPRING REV'),('CHORUS','stock','CHORUS'),('AIR CHORUS','baseline','AIR CHORUS 0.1.0'),('AIR CHORUS','chorus','AIR CHORUS 0.1.1')]:
        module=registry.by_key(key)
        for moving in [False,True]:
            row,_=br.run(module,mem[variant],f'{variant}_{int(moving)}_s{split}',blocks,2,moving,split=[split]*2,inputs=inputs,positions=[0,4],extra=('-audio','0'))
            rows.append({'effect':label,'moving':moving,'split':split,'cores':[{'core':c,'initInstructions':row['cores'][c]['init_instructions'],'peakBlockInstructions':row['cores'][c]['peak_block'],'nullBlockInstructions':baseline['cores'][c]['peak_block'],'netWorstInstructionsPerSample':(row['cores'][c]['peak_block']-baseline['cores'][c]['peak_block'])/16} for c in range(2)],'clippedSamples':row['clipped_samples']})
record={'version':'0.1.1-experimental','units':'executed instructions/sample; not modeled cycles or measured chip timing','sampleRate':44100,'framesPerBlock':16,'blocksPerCase':blocks,'audioBase':0,'instancesPerCore':1,'stockMainSha256':hashlib.sha256(stock.STOCK_IMAGE.read_bytes()).hexdigest(),'moduleMainSha256':hashlib.sha256(image.read_bytes()).hexdigest(),'baselineMainSha256':hashlib.sha256(args.baseline_image.read_bytes()).hexdigest(),'dspHostSha256':hashlib.sha256(br.HOST.read_bytes()).hexdigest(),'conditions':'Identical two-core tone/transient input, X:0 stereo audio, null stub subtracted per split/core, complete control endpoint/turn/type schedule from benchmark_reverbs.knobs; finite observed maxima only. Excludes stock dispatcher, voice engines, ColdFire, DMA and stalls. All split offsets 0..15. First-call seeding is included; separate init calls are excluded from block meters.','rows':rows}
(output/'stock-comparison.json').write_text(json.dumps(record,indent=2)+'\n')
for key in ['SPRING REV','CHORUS','AIR CHORUS 0.1.0','AIR CHORUS 0.1.1']:
    print(key,max(c['netWorstInstructionsPerSample'] for r in rows if r['effect']==key for c in r['cores']),flush=True)
