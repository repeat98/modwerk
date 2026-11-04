#!/usr/bin/env python3
# SPDX-License-Identifier: MIT
"""Private release preparation. Never admits a draft or publishes any artifact."""
import argparse
import hashlib
import importlib.util
import json
from pathlib import Path
import re
import shutil
import subprocess
import sys

HERE=Path(__file__).resolve().parent
ROOT=HERE.parents[2]
ID='pattern-sample-locks'
SHA=lambda data:hashlib.sha256(data).hexdigest()

def load(name,path):
    spec=importlib.util.spec_from_file_location(name,path)
    module=importlib.util.module_from_spec(spec);sys.modules[name]=module;spec.loader.exec_module(module)
    return module

def run(args,cwd=ROOT):
    result=subprocess.run([str(a) for a in args],cwd=cwd,check=True,capture_output=True,text=True)
    return result.stdout

def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--out',type=Path,required=True)
    p.add_argument('--upstream',type=Path,required=True)
    p.add_argument('--stock',type=Path,required=True)
    p.add_argument('--reference-package',type=Path,required=True)
    a=p.parse_args();out=a.out.resolve()
    if out==ROOT or ROOT in out.parents:p.error('Use a new private directory outside Git')
    out.mkdir(parents=True,exist_ok=False)
    audit=out/'audit';audit.mkdir()
    builder=load('psl_candidate_builder',ROOT/'sdk/runtime/loader/build.py')
    guard=load('psl_candidate_codegen',ROOT/'sdk/runtime/m68k_codegen.py')
    run(['m68k-elf-gcc',*builder.CFLAGS,*guard.FLAGS,'-fstack-usage','-fcallgraph-info=su',
         '-c',HERE/'translation.c','-o',audit/'translation.o'])
    run(['m68k-elf-as','-mcpu=54455','--defsym','MODWERK_EVENTS=1',HERE/'unit.s','-o',audit/'unit.o'])
    guard.check_mcf54455([audit/'translation.o',audit/'unit.o'])
    linked=[]
    for name in ('translation','unit'):
        folder=audit/name;folder.mkdir()
        linked.append(builder.link_units([audit/(name+'.o')],'m68k-elf-',0,folder,anywhere=True))
    assert linked[0][0]==linked[1][0] and linked[0][2:]==linked[1][2:], 'C and committed assembly differ'
    image,symbols,bss,relocations=linked[1]
    su=(audit/'translation.su').read_text()
    graph=(audit/'translation.ci').read_text()
    nodes={}
    for line in graph.splitlines():
        match=re.match(r'node: \{ title: "([^"]+)" label: "([^"\\]+)\\n.*?\\n(\d+) bytes \(([^)]+)\)"',line)
        if match:nodes[match[1]]={'function':match[2],'frameBytes':int(match[3]),'kind':match[4]}
    assert len(nodes)==33, 'Review changed compiler call graph before using stack sums'
    edges={name:set() for name in nodes};unknown=[]
    for source,target in re.findall(r'edge: \{ sourcename: "([^"]+)" targetname: "([^"]+)"',graph):
        if target in nodes:edges[source].add(target)
        else:unknown.append({'caller':nodes[source]['function'],'target':target})
    def bound(name,path=()):
        assert name not in path, 'Recursive authored stack path'
        options=[(0,[]),*[bound(target,(*path,name)) for target in edges[name]]]
        extra,chain=max(options,key=lambda item:item[0]+(4 if item[1] else 0))
        return nodes[name]['frameBytes']+extra+(4 if chain else 0),[nodes[name]['function'],*chain]
    stacks={entry:dict(zip(('authoredOnlyBytes','path'),bound(entry))) for entry in
            ('module_key','module_draw','module_tick','module_enc','psl_open')}
    (audit/'symbols.json').write_text(json.dumps(symbols,indent=2)+'\n')
    # Component oracles for the browser's GNU-compatible card linker. These do
    # not claim that a stock-only card supplies the module's four core UI hooks.
    oracles=[]
    for base in (0x41000000,0x41003080,0x42000000):
        stem=audit/('card-%08x'%base)
        elf=stem.with_suffix('.elf');binary=stem.with_suffix('.bin')
        run(['m68k-elf-ld','-Ttext=%#x'%base,'-e','psl_open','-o',elf,audit/'unit.o'])
        run(['m68k-elf-objcopy','-O','binary',elf,binary])
        exports={row[2]:int(row[0],16) for line in run(['m68k-elf-nm','-g',elf]).splitlines()
                 if len(row:=line.split())==3 and row[1]!='U'}
        oracles.append({'base':base,'bytes':binary.stat().st_size,'sha256':SHA(binary.read_bytes()),'exports':exports})
    (audit/'card-oracles.json').write_text(json.dumps(oracles,indent=2)+'\n')
    # Private fixtures only: ordinary SDK, builder and scans remain unchanged.
    stage=out/'private-app';stage.mkdir()
    shutil.copytree(ROOT/'sdk',stage/'sdk',ignore=shutil.ignore_patterns('__pycache__','*.pyc'))
    shutil.copytree(HERE,stage/'sdk/octabam/modules'/ID,ignore=shutil.ignore_patterns('__pycache__','*.pyc'))
    (stage/'scripts').mkdir();shutil.copy2(ROOT/'scripts/octatrack-module-packages.py',stage/'scripts')
    (stage/'src/catalog').mkdir(parents=True);shutil.copy2(ROOT/'src/catalog/module-documents.json',stage/'src/catalog')
    (stage/'src/engine/assets').mkdir(parents=True)
    shutil.copy2(ROOT/'src/engine/assets/dsp-packages.json',stage/'src/engine/assets')
    document=json.loads((HERE/'octamod.module.json').read_text())
    catalog=json.loads((stage/'sdk/catalog.json').read_text())
    catalog['modules'].append({'id':ID,'version':document['version'],'addedAt':'2026-10-30T00:00:00Z'})
    (stage/'sdk/catalog.json').write_text(json.dumps(catalog))
    entry={'id':ID,'version':document['version'],'name':document['name'],'octabam':True,'unitName':'SAMPLE LOCKS'}
    manifest=stage/'src/engine/assets/octatrack-module-packages.json'
    manifest.write_text(json.dumps({'schema':1,'packages':[entry]}))
    command=[sys.executable,'-B',stage/'scripts/octatrack-module-packages.py','--upstream',a.upstream,'--stock',a.stock]
    logs=[];attempts=[]
    for check in (False,True):
        print('Running unchanged public wrapper'+(' --check' if check else '')+' with both stock scans',flush=True)
        result=subprocess.run([str(arg) for arg in [*command,*(['--check'] if check else [])]],
                              cwd=stage,capture_output=True,text=True)
        logs.append(result.stdout+result.stderr)
        attempts.append({'check':check,'exitCode':result.returncode})
        (out/'public-builder.log').write_text('\n'.join(logs))
    (out/'public-builder.log').write_text('\n'.join(logs))
    entry=json.loads(manifest.read_text())['packages'][0]
    data=(stage/'public'/entry['path']).read_bytes()
    assert data==a.reference_package.read_bytes(), 'Public-builder fixture differs from tested USB package'
    shutil.copy2(stage/'public'/entry['path'],out/'pattern-sample-locks-0.1.8-candidate.mwrm')
    (out/'candidate-manifest.json').write_text(json.dumps({'schema':1,'packages':[entry]},indent=2)+'\n')
    identical=entry['sha256'][:16]+' identical' in logs[1]
    assert identical, 'Public-builder --check did not reproduce the package'
    report={'hardware':False,'published':False,'releaseReady':False,'moduleVersion':document['version'],
            'packageSha256':SHA(data),'bytes':len(data),'initializedBytes':len(image),'bssBytes':bss,
            'relocations':len(relocations),'cMatchesCommittedAssembly':True,'mcf54455GuardPassed':True,
            'moduleOwnedImageAndBssBytes':len(image)+bss,
            'sourceLoopLimits':{'tracks':8,'stepsPerTrack':64,'changedFields':512,
                                'otherLockChecksOnClear':15872,'shortPublicationGuards':64,
                                'workingAndMirrorByteWrites':1024,'stockRefreshCalls':9},
            'publicWrapperRebuildIdentical':identical,'publicWrapperAttempts':attempts,
            'publicWrapperStockScansPassed':all(attempt['exitCode']==0 for attempt in attempts),
            'publicWrapperMatchesTestedPackage':True,'privateCatalogueFixtureOnly':True,
            'compiler':run(['m68k-elf-gcc','--version']).splitlines()[0],
            'compilerFlags':[*builder.CFLAGS,*guard.FLAGS,'-fstack-usage','-fcallgraph-info=su'],
            'stackFrames':list(nodes.values()),'authoredStackPaths':stacks,'unresolvedCallGraphEdges':unknown,
            'stackLimitations':'Authored-only conservative sums include 4-byte return words at internal calls. Stock callees, callers and interrupt nesting are additional; no complete system stack bound is claimed.',
            'cpuLimitations':'Emulator model times do not establish physical WCET. Stock callees, memory contention and hardware timing remain to qualify.',
            'currentPublicBase':json.loads((ROOT/'sdk/machines/octatrack/base-binding.json').read_text())['identity'],
            'sourceHashes':{name:SHA((HERE/name).read_bytes()) for name in ('translation.c','native.c','engine.c','engine.h','ui.c','ui.h','font.c','font.h','unit.s','manifest.py','runtime.json')},
            'builderHashes':{name:SHA((ROOT/name).read_bytes()) for name in ('scripts/octatrack-module-packages.py','sdk/machines/octatrack/elekloader/module_packages.py','sdk/runtime/loader/build.py')}}
    report['preparationHelperSha256']=SHA(Path(__file__).read_bytes())
    (out/'preparation.json').write_text(json.dumps(report,indent=2)+'\n')
    print(json.dumps({k:report[k] for k in ('releaseReady','packageSha256','bytes','initializedBytes','bssBytes','authoredStackPaths','publicWrapperMatchesTestedPackage','publicWrapperStockScansPassed','publicWrapperAttempts')},indent=2))

if __name__=='__main__':main()
