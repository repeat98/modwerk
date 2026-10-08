"""Export independently authored ColdFire objects and firmware-free native link proofs."""
import argparse,hashlib,importlib.util,json,os,pathlib,re,subprocess,sys,tempfile,struct

# Share the exact source inventory and legacy clean/pin guards with the static
# metadata exporter. This exporter does not call its local-stock reader.
_guard_path=pathlib.Path(__file__).with_name('export-static-dsp.py')
_guard_spec=importlib.util.spec_from_file_location('reviewed_export_sources',_guard_path)
_guard=importlib.util.module_from_spec(_guard_spec);_guard_spec.loader.exec_module(_guard)
reviewed_revision=_guard.reviewed_revision

def catalog_source(vendored):
    return ('platform' if vendored else 'modules')+'/dsp-dynload-transport/catalog.s'

def manifest_source(name,vendored,platform_names):
    return ('platform' if vendored and name in platform_names else 'modules')+'/'+name+'/manifest.py'

def sha(b):return hashlib.sha256(b).hexdigest()
def symbols(data):
    tab=struct.unpack_from('>I',data,32)[0];count=struct.unpack_from('>H',data,48)[0]
    sections=[struct.unpack_from('>10I',data,tab+i*40) for i in range(count)]
    result=[]
    for s in sections:
        if s[1]!=2:continue
        strings=sections[s[6]];names=data[strings[4]:strings[4]+strings[5]]
        for at in range(s[4],s[4]+s[5],16):
            name,value,size,info,other,section=struct.unpack_from('>IIIBBH',data,at)
            if info>>4 and section and name:result.append(names[name:names.index(0,name)].decode())
    return result

def allocated_sections(data):
    tab=struct.unpack_from('>I',data,32)[0];count,namesIndex=struct.unpack_from('>HH',data,48)
    sections=[struct.unpack_from('>10I',data,tab+i*40) for i in range(count)]
    strings=sections[namesIndex];names=data[strings[4]:strings[4]+strings[5]]
    return [{'name':names[s[0]:names.index(0,s[0])].decode(),'address':s[3],'size':s[5]} for s in sections if s[2]&2 and s[5]]

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('worktree',type=pathlib.Path);parser.add_argument('destination',type=pathlib.Path)
    parser.add_argument('--app',type=pathlib.Path,default=pathlib.Path(__file__).resolve().parents[1])
    parser.add_argument('--vendored-sdk',action='store_true',help='Bind the exact private SDK inventory to the reviewed app checkout')
    parser.add_argument('--oracles-only',action='store_true',help='Write link fingerprints only; authored package assets stay managed by the shared compiler')
    args=parser.parse_args();root=args.worktree.resolve();dest=args.destination.resolve();app=args.app.resolve()
    try:revision=reviewed_revision(root,app,args.vendored_sdk)
    except ValueError as error:parser.error(str(error))
    os.chdir(root);sys.path[:0]=[str(root/'tools/build'),str(root/'tools')]
    import toolpath
    from remix import stock_guard
    def deny_stock():raise RuntimeError('Authored ColdFire link proofs must never read stock firmware')
    stock_guard._verified_image=deny_stock
    from remix.registry import modules
    from remix import registry
    from remix.platform_build import _run,_nm
    from experimental.dsp_dynload import runtime_catalog as rc
    known=modules();units=[];exported=[]
    for key in ['DSP DYNLOAD STOCK','EUCLID','TAPE ECHO']:
        module=known[key]
        for unit in module.linked:
            if not unit.dram or unit.include is not None:continue
            content=(root/unit.source).read_text()
            if re.search(r'^\s*\.?(?:incbin|include)\b',content,re.MULTILINE|re.IGNORECASE):raise ValueError('Review transcluded content before exporting an object.')
            units.append((module,unit))
    with tempfile.TemporaryDirectory(prefix='octamod-cf-own.') as tmp:
        work=pathlib.Path(tmp);objects={};globalNames={}
        for module,unit in units:
            obj=work/(unit.label+'.o')
            _run(['m68k-elf-as','-mcpu=54455','-o',obj,unit.source],root)
            data=obj.read_bytes();objects[unit.label]=obj;globalNames[unit.label]=symbols(data)
            manifest=manifest_source(module.name,args.vendored_sdk,registry.PLATFORM_NAMES if args.vendored_sdk else ())
            exported.append({'label':unit.label,'moduleId':module.name,'key':module.key,'author':module.author,'cpu':'54455','dram':True,'source':unit.source,'sources':{unit.source:sha((root/unit.source).read_bytes()),manifest:sha((root/manifest).read_bytes())},'bytes':len(data),'code':data.hex(),'sha256':sha(data)})
        catalogCases=[[],[{'core':0,'fxId':6,'words':[1,2,3,4,5],'relocations':[0,0x8003],'init':0,'proc':4},{'core':1,'fxId':6,'words':[5,4,3,2,1],'relocations':[1],'init':1,'proc':3}]]
        cases=[]
        for index,(ids,base,pkgIndex) in enumerate([([],0x40a955e0,0),(['euclid'],0x40a955e0,1),(['tapeecho'],0x40a955e0,0),(['euclid','tapeecho'],0x1000,1),(['euclid','tapeecho'],0x40a955e0,1)]):
            labels=[unit.label for module,unit in units if module.name=='dsp-dynload-stock']+['dlcatalog']+[unit.label for module,unit in units if module.name in ids]
            packages=catalogCases[pkgIndex];options={'base':0,'slots':[3]*32,'reads':[0]*32,'qualifiedMask':0xffffffff,'stubAtBoot':64 if packages else 0,'pmap16':False}
            data={(p['core'],p['fxId']):{k:v for k,v in p.items() if k not in ['core','fxId']} for p in packages}
            (work/'remix.inc').write_text(rc._catalog(data,set(range(32)),lambda p,pkg:3,options['stubAtBoot'],options['reads'],0))
            cat=work/'dlcatalog.o';_run(['m68k-elf-as','-mcpu=54455','-I',work,'-o',cat,catalog_source(args.vendored_sdk)],root);objects['dlcatalog']=cat;globalNames['dlcatalog']=symbols(cat.read_bytes())
            elf=work/'runtime.elf';raw=work/'runtime.bin'
            _run(['m68k-elf-ld',f'-Ttext=0x{base:x}','-o',elf,*[objects[label] for label in labels]],work)
            _run(['m68k-elf-objcopy','-O','binary',elf,raw],work)
            names={name for label in labels for name in globalNames[label]};nm=_nm(elf,work);b=raw.read_bytes()
            cases.append({'name':f'case {index+1}: '+(', '.join(ids) or 'loader only'),'labels':labels,'base':base,'catalogPackages':packages,'catalogOptions':options,'expected':{'bytes':len(b),'sha256':sha(b),'exports':{name:nm[name] for name in sorted(names)},'sections':allocated_sections(elf.read_bytes())}})
    if stock_guard._cache is not None:raise RuntimeError('Stock must never be read during authored ColdFire link proofs')
    dest.mkdir(parents=True,exist_ok=True)
    if not args.oracles_only:
        (dest/'coldfire-packages.json').write_text(json.dumps({'schema':1,'revision':revision,'license':'/licenses/octabam.txt','packages':exported},indent=2)+'\n')
    (dest/'coldfire-runtime-oracles.json').write_text(json.dumps({'schema':1,'revision':revision,'cases':cases},indent=2)+'\n')
    print(f'{len(exported)} independently authored ColdFire objects, five native link proofs; no firmware read or retained.')
if __name__=='__main__':main()
